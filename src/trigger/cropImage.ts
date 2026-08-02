import { task, wait } from "@trigger.dev/sdk/v3";
import { cropImagePayloadSchema } from "@/lib/validation";
import { uploadToTransloadit } from "@/lib/transloadit-server-upload";
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