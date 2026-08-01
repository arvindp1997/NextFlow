import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { wait } from "@trigger.dev/sdk/v3";

/**
 * Transloadit's `notify_url` callback for the crop-image assembly. Instead
 * of the crop task polling `client.createAssembly({ waitForCompletion: true
 * })` (which polls internally under the hood), we create the assembly with
 * `waitForCompletion: false` and a `notify_url` pointing here, tagged with a
 * Trigger.dev waitpoint token id. Transloadit POSTs the finished assembly
 * status to this route as soon as processing completes, and we resolve the
 * waitpoint — the task's `wait.forToken()` call resumes with no polling
 * anywhere in the loop.
 *
 * Transloadit notify_url requests arrive as multipart/form-data with a
 * `transloadit` field containing the JSON-encoded assembly status and a
 * `signature` field (`sha384:<hmac>`) computed over that JSON using the
 * account's auth secret — verified below before trusting the payload.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const tokenId = url.searchParams.get("token");
  if (!tokenId) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const form = await req.formData().catch(() => null);
  const raw = form?.get("transloadit");
  const signature = form?.get("signature");
  if (typeof raw !== "string" || typeof signature !== "string") {
    return NextResponse.json({ error: "Malformed notification" }, { status: 400 });
  }

  const authSecret = process.env.TRANSLOADIT_AUTH_SECRET;
  if (!authSecret) {
    return NextResponse.json({ error: "Transloadit is not configured" }, { status: 500 });
  }

  const expected = `sha384:${createHmac("sha384", authSecret).update(raw, "utf-8").digest("hex")}`;
  const signatureValid =
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!signatureValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const assembly = JSON.parse(raw) as {
    ok?: string;
    error?: string;
    message?: string;
    results?: Record<string, Array<{ ssl_url?: string; url?: string }>>;
    uploads?: Array<{ ssl_url?: string | null; url?: string | null }>;
  };

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

  await wait.completeToken(tokenId, { ok: true, url: url_ });
  return NextResponse.json({ received: true });
}