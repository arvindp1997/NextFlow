import { NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import type { uploadImageTask } from "@/trigger/uploadImage";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB

export async function POST(req: Request) {
  try {
    await requireUserId();

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "File is too large (max 15MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileBase64 = buffer.toString("base64");

    const handle = await tasks.trigger<typeof uploadImageTask>("upload-image", {
      fileBase64,
      mimeType: file.type || "application/octet-stream",
    });

    return NextResponse.json(
      { runId: handle.id, triggerRunId: handle.id, publicAccessToken: handle.publicAccessToken },
      { status: 202 }
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("upload-image trigger failed:", err);
    return NextResponse.json({ error: "Failed to start upload" }, { status: 500 });
  }
}