import { task, wait, logger } from "@trigger.dev/sdk/v3";
import { cropImagePayloadSchema } from "@/lib/validation";
import { z } from "zod";

export type CropImagePayload = z.infer<typeof cropImagePayloadSchema>;

export interface CropImageOutput {
  outputImageUrl: string;
}

/**
 * Crops an image by percentage-based rect using FFmpeg, then re-uploads the
 * result so downstream nodes get back a stable CDN URL (in this scaffold we
 * upload to Transloadit's /assemblies endpoint, matching the rest of the app's
 * media pipeline — swap for S3/Cloudinary if you'd rather not depend on it).
 *
 * MANDATORY per spec: this task must take at least 30 seconds before
 * resolving, regardless of how fast FFmpeg actually finishes. This is a
 * deliberate artificial delay requested by the assignment — do not remove it.
 * Implemented with Trigger.dev's `wait.for()` (not `setTimeout`) so the run
 * is actually checkpointed/paused for the duration instead of holding the
 * worker hot.
 */
export const cropImageTask = task({
  id: "crop-image",
  maxDuration: 180,
  run: async (payload: CropImagePayload): Promise<CropImageOutput> => {
    const input = cropImagePayloadSchema.parse(payload);
    const startedAt = Date.now();

    const outputImageUrl = await performCrop(input);

    // Hard requirement: never resolve before 30s have elapsed, even if the
    // actual FFmpeg work above finished much faster.
    const MIN_DURATION_MS = 30_000;
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_DURATION_MS) {
      await wait.for({ seconds: Math.ceil((MIN_DURATION_MS - elapsed) / 1000) });
    }

    return { outputImageUrl };
  },
});

async function performCrop(input: CropImagePayload): Promise<string> {
  const os = await import("node:os");
  const path = await import("node:path");
  const fs = await import("node:fs/promises");
  const ffmpeg = (await import("fluent-ffmpeg")).default;

  // fluent-ffmpeg is just a wrapper around the ffmpeg/ffprobe CLI binaries —
  // it doesn't bundle them. On Trigger.dev's cloud runners, the ffmpeg()
  // build extension installs real Debian packages and sets these env vars;
  // it deliberately doesn't apply to local `trigger:dev` runs, so we fall
  // back to the npm installer packages there (this is also why those
  // packages are still a dependency at all — they're dev-only at this point).
  let ffmpegPath = process.env.FFMPEG_PATH;
  let ffprobePath = process.env.FFPROBE_PATH;
  if (!ffmpegPath || !ffprobePath) {
    const ffmpegInstaller = (await import("@ffmpeg-installer/ffmpeg")).default;
    const ffprobeInstaller = (await import("@ffprobe-installer/ffprobe")).default;
    ffmpegPath ??= ffmpegInstaller.path;
    ffprobePath ??= ffprobeInstaller.path;
  }
  ffmpeg.setFfmpegPath(ffmpegPath);
  ffmpeg.setFfprobePath(ffprobePath);

  const res = await fetch(input.inputImageUrl);
  if (!res.ok) throw new Error(`Could not download input image: ${input.inputImageUrl}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nextflow-crop-"));
  const inPath = path.join(tmpDir, "in");
  const outPath = path.join(tmpDir, "out.png");
  await fs.writeFile(inPath, buffer);

  // Convert 0-100% rect to an ffmpeg crop filter using probed dimensions.
  const dims = await probeDimensions(ffmpeg, inPath);
  const x = Math.round((input.xPercent / 100) * dims.width);
  const y = Math.round((input.yPercent / 100) * dims.height);
  const w = Math.max(1, Math.round((input.widthPercent / 100) * dims.width));
  const h = Math.max(1, Math.round((input.heightPercent / 100) * dims.height));

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inPath)
      .videoFilter(`crop=${w}:${h}:${x}:${y}`)
      .output(outPath)
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(err))
      .run();
  });

  const croppedBuffer = await fs.readFile(outPath);
  await fs.rm(tmpDir, { recursive: true, force: true });

  return uploadToTransloadit(croppedBuffer);
}

function probeDimensions(
  ffmpeg: typeof import("fluent-ffmpeg"),
  filePath: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const stream = data.streams.find((s) => s.width && s.height);
      if (!stream?.width || !stream?.height) return reject(new Error("Could not read image dimensions"));
      resolve({ width: stream.width, height: stream.height });
    });
  });
}

async function uploadToTransloadit(buffer: Buffer): Promise<string> {
  const authKey = process.env.TRANSLOADIT_AUTH_KEY;
  const authSecret = process.env.TRANSLOADIT_AUTH_SECRET;
  if (!authKey || !authSecret) throw new Error("Transloadit credentials are not set");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL must be set so Transloadit can call back");

  const { Transloadit } = await import("transloadit");
  const { Readable } = await import("node:stream");
  const client = new Transloadit({ authKey, authSecret });

  // Transloadit requires a non-empty `steps` object (ASSEMBLY_NO_STEPS
  // otherwise) — a single ":original"/"/upload/handle" step with nothing
  // else is the documented minimal "just accept the upload" pattern, no
  // permanent storage destination/credentials required.
  //
  // Rather than `waitForCompletion: true` (which makes the SDK poll the
  // assembly status internally under the hood), we create a Trigger.dev
  // waitpoint token, pass its id to Transloadit via `notify_url`, and
  // `wait.forToken()` for it. Transloadit POSTs the finished assembly to
  // our webhook (src/app/api/webhooks/transloadit-crop) as soon as
  // processing completes, which resolves the token — no polling anywhere
  // in this path, and the run is actually paused/checkpointed while it
  // waits instead of holding the worker hot.
  const token = await wait.createToken({ timeout: "5m" });
  const notifyUrl = `${appUrl}/api/webhooks/transloadit-crop?token=${token.id}`;

  const assembly = await client.createAssembly({
    params: {
      steps: {
        ":original": { robot: "/upload/handle" },
      },
      notify_url: notifyUrl,
    },
    uploads: { input: Readable.from(buffer) },
    waitForCompletion: false,
  });

  // Diagnostic: check this run's log for the assembly_id, then look it up
  // directly at https://api2.transloadit.com/assemblies/<assembly_id> (or
  // in the Transloadit dashboard) to see whether it ever tried calling
  // notify_url and what response it got back — that tells you definitively
  // whether the webhook request is reaching this app at all.
  logger.info("Transloadit assembly created, waiting for notify_url callback", {
    assemblyId: assembly.assembly_id,
    assemblySslUrl: assembly.assembly_ssl_url,
    notifyUrl,
    waitpointTokenId: token.id,
  });

  const result = await wait.forToken<{ ok: boolean; url?: string; error?: string }>(token);
  if (!result.ok) throw new Error("Timed out waiting for Transloadit assembly to complete");
  if (!result.output.ok || !result.output.url) {
    throw new Error(result.output.error ?? "Transloadit assembly did not return an uploaded file URL");
  }
  return result.output.url;
}