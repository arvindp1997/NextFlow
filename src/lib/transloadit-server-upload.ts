import { wait, logger } from "@trigger.dev/sdk/v3";

/**
 * Server-side (Trigger.dev task context) upload of a raw file buffer to
 * Transloadit, returning its temporary hosted URL. Shared by every task
 * that needs to get a file into Transloadit — the crop-image task's own
 * input image, and the standalone image-field upload task
 * (src/trigger/uploadImage.ts) used by the canvas/Playground upload UI.
 *
 * Deliberately does NOT use the Transloadit SDK's `waitForCompletion: true`
 * (which polls the assembly status internally) or a browser-side Socket.IO
 * subscription to the assembly's `websocket_url` (proven unreliable in
 * practice — Transloadit's per-assembly worker subdomain 404s on that
 * endpoint for some assemblies/regions). Instead: create a Trigger.dev
 * waitpoint token, pass its id to Transloadit via `notify_url`, and
 * `wait.forToken()` for it — Transloadit POSTs the finished assembly to
 * our webhook (src/app/api/webhooks/transloadit-crop) the moment
 * processing completes, which resolves the token. No polling, no
 * dependency on Transloadit's realtime status feature at all.
 */
export async function uploadToTransloadit(buffer: Buffer): Promise<string> {
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