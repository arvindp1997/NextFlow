import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { requireUserId, UnauthorizedError } from "@/lib/auth";

/**
 * Returns Transloadit assembly params + signature for the client-side
 * upload used inside Request-Inputs image_field. Keeps the auth secret
 * server-side; the browser only ever sees the auth key + signature.
 *
 * The assembly step is defined inline (a plain /file/store, which just
 * stores the file on Transloadit's own temporary storage) rather than via a
 * Transloadit Template, so no external dashboard configuration is required
 * beyond having a valid Auth Key/Secret — avoids the class of errors where a
 * template references credentials (e.g. an S3 export step) that were never
 * actually set up.
 */
export async function POST() {
  try {
    await requireUserId();

    const authKey = process.env.TRANSLOADIT_AUTH_KEY;
    const authSecret = process.env.TRANSLOADIT_AUTH_SECRET;
    if (!authKey || !authSecret) {
      return NextResponse.json({ error: "Transloadit is not configured" }, { status: 500 });
    }

    const params = JSON.stringify({
      auth: { key: authKey, expires: expiresIn(60) },
      steps: {
        store: { robot: "/file/store" },
      },
      fields: {},
    });

    const signature = createHmac("sha384", authSecret).update(Buffer.from(params, "utf-8")).digest("hex");

    return NextResponse.json({ params, signature: `sha384:${signature}` });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to sign upload" }, { status: 500 });
  }
}

function expiresIn(minutes: number): string {
  const d = new Date(Date.now() + minutes * 60 * 1000);
  return d.toISOString().replace(/\.\d{3}Z$/, "+00:00");
}
