import { task } from "@trigger.dev/sdk/v3";
import { uploadToTransloadit } from "@/lib/transloadit-server-upload";
import { z } from "zod";

export const uploadImagePayloadSchema = z.object({
  fileBase64: z.string().min(1),
  mimeType: z.string().min(1),
});

export type UploadImagePayload = z.infer<typeof uploadImagePayloadSchema>;

export interface UploadImageOutput {
  url: string;
}

/**
 * Standalone image upload — used by the canvas/Playground's "Upload Image"
 * button (Request-Inputs image fields, and the Crop Image node's direct
 * upload), as opposed to crop-image's own internal upload of its already-
 * cropped output. Both share the same underlying `uploadToTransloadit()`
 * helper (wait.createToken + notify_url webhook + wait.forToken — no
 * polling, no dependency on Transloadit's browser-facing realtime status
 * feature, which proved unreliable: some assembly worker subdomains 404 on
 * their own Socket.IO endpoint).
 *
 * Runs as its own Trigger.dev task (rather than the upload happening
 * directly in the API route) specifically so the browser can watch it via
 * the same Realtime subscription (useRealtimeRun) used everywhere else in
 * this app, instead of the browser talking to Transloadit directly.
 */
export const uploadImageTask = task({
  id: "upload-image",
  maxDuration: 120,
  run: async (payload: UploadImagePayload): Promise<UploadImageOutput> => {
    const input = uploadImagePayloadSchema.parse(payload);
    const buffer = Buffer.from(input.fileBase64, "base64");
    const url = await uploadToTransloadit(buffer);
    return { url };
  },
});