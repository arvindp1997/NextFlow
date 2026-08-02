import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { wait } from "@trigger.dev/sdk/v3";

/**
 * Transloadit's `notify_url` callback — shared by every task that uploads
 * through `uploadToTransloadit()` (src/lib/transloadit-server-upload.ts):
 * both the crop-image task's own output upload, and the standalone
 * upload-image task behind the canvas/Playground's image upload UI. This
 * route's logic is fully generic (it just resolves whichever waitpoint
 * token id is in the query string), so one shared route handles both
 * rather than duplicating it per task.
 *
 * Instead of the SDK polling `client.createAssembly({ waitForCompletion:
 * true })` (which polls internally under the hood), the assembly is
 * created with `waitForCompletion: false` and a `notify_url` pointing
 * here, tagged with a Trigger.dev waitpoint token id. Transloadit POSTs
 * the finished assembly status to this route as soon as processing
 * completes, and we resolve the waitpoint — the task's `wait.forToken()`
 * call resumes with no polling anywhere in the loop.
 *
 * Transloadit notify_url requests arrive as multipart/form-data with a
 * `transloadit` field containing the JSON-encoded assembly status and a
 * `signature` field (either `<algo>:<hmac>`, or a bare legacy sha1 hex
 * digest with no prefix at all) computed over that JSON using the
 * account's auth secret — verified below before trusting the payload.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const tokenId = url.searchParams.get("token");
  console.log("[transloadit-crop webhook] request received", { tokenId, contentType: req.headers.get("content-type") });

  if (!tokenId) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const form = await req.formData().catch(() => null);
  const raw = form?.get("transloadit");
  const signature = form?.get("signature");
  if (typeof raw !== "string" || typeof signature !== "string") {
    console.error("[transloadit-crop webhook] malformed body — no `transloadit`/`signature` form fields found");
    return NextResponse.json({ error: "Malformed notification" }, { status: 400 });
  }

  const authSecret = process.env.TRANSLOADIT_AUTH_SECRET;
  if (!authSecret) {
    return NextResponse.json({ error: "Transloadit is not configured" }, { status: 500 });
  }

  // Per Transloadit's own webhook-verification reference implementation
  // (https://transloadit.com/docs/topics/webhooks/): the signature is
  // *not* always sha384 — it's `algo:hexdigest` when there's a colon, or a
  // bare legacy sha1 hex digest (no prefix at all) otherwise. The algorithm
  // must be read off the received signature itself, not assumed.
  const algoSeparatorIndex = signature.indexOf(":");
  const algo = algoSeparatorIndex === -1 ? "sha1" : signature.slice(0, algoSeparatorIndex);
  const receivedDigest = algoSeparatorIndex === -1 ? signature : signature.slice(algoSeparatorIndex + 1);

  let calculatedDigest: string;
  try {
    calculatedDigest = createHmac(algo, authSecret).update(Buffer.from(raw, "utf-8")).digest("hex");
  } catch {
    console.error("[transloadit-crop webhook] unsupported signature algorithm", { algo });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const signatureValid =
    calculatedDigest.length === receivedDigest.length &&
    timingSafeEqual(Buffer.from(calculatedDigest), Buffer.from(receivedDigest));
  if (!signatureValid) {
    console.error("[transloadit-crop webhook] signature mismatch — TRANSLOADIT_AUTH_SECRET likely differs from the one used to create the assembly", { algo });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const assembly = JSON.parse(raw) as {
    ok?: string;
    error?: string;
    message?: string;
    results?: Record<string, Array<{ ssl_url?: string; url?: string }>>;
    uploads?: Array<{ ssl_url?: string | null; url?: string | null }>;
  };
  console.log("[transloadit-crop webhook] signature verified", { tokenId, assemblyStatus: assembly.ok });

  if (assembly.ok !== "ASSEMBLY_COMPLETED") {
    await wait.completeToken(tokenId, {
      ok: false,
      error: assembly.message ?? assembly.error ?? "Transloadit assembly failed",
    });
    return NextResponse.json({ received: true });
  }

  const fromResults = assembly.results?.[":original"]?.[0];
  const fromUploads = assembly.uploads?.[0];
  const url_ = fromResults?.ssl_url ?? fromResults?.url ?? fromUploads?.ssl_url ?? fromUploads?.url;

  if (!url_) {
    await wait.completeToken(tokenId, { ok: false, error: "Assembly completed but returned no file URL" });
    return NextResponse.json({ received: true });
  }

  console.log("[transloadit-crop webhook] completing waitpoint token", { tokenId, url: url_ });
  await wait.completeToken(tokenId, { ok: true, url: url_ });
  return NextResponse.json({ received: true });
}