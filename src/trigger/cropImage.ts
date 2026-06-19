import { task } from "@trigger.dev/sdk/v3";
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
      await new Promise((resolve) => setTimeout(resolve, MIN_DURATION_MS - elapsed));
    }

    return { outputImageUrl };
  },
});

async function performCrop(input: CropImagePayload): Promise<string> {
  const os = await import("node:os");
  const path = await import("node:path");
  const fs = await import("node:fs/promises");
  const ffmpeg = (await import("fluent-ffmpeg")).default;

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

  const { Transloadit } = await import("transloadit");
  const { Readable } = await import("node:stream");
  const client = new Transloadit({ authKey, authSecret });

  // Transloadit requires a non-empty `steps` object (ASSEMBLY_NO_STEPS
  // otherwise) — a single ":original"/"/upload/handle" step with nothing
  // else is the documented minimal "just accept the upload" pattern, no
  // permanent storage destination/credentials required.
  const result = await client.createAssembly({
    params: {
      steps: {
        ":original": { robot: "/upload/handle" },
      },
    },
    uploads: { input: Readable.from(buffer) },
  });

  const fromResults = result.results?.[":original"]?.[0] as { ssl_url?: string; url?: string } | undefined;
  const fromUploads = result.uploads?.[0] as { ssl_url?: string | null; url?: string | null } | undefined;
  const url = fromResults?.ssl_url ?? fromResults?.url ?? fromUploads?.ssl_url ?? fromUploads?.url;
  if (!url) throw new Error("Transloadit assembly did not return an uploaded file URL");
  return url;
}