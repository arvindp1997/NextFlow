import { NextResponse } from "next/server";
import { runs } from "@trigger.dev/sdk/v3";
import { requireUserId, UnauthorizedError } from "@/lib/auth";

/**
 * A single one-shot lookup of the finished upload-image run's output,
 * called exactly once by the frontend right after Trigger.dev Realtime
 * (useRealtimeRun's onComplete) signals the run has settled — never on an
 * interval. Kept as its own tiny GET rather than trusting the shape of
 * whatever useRealtimeRun's onComplete callback happens to pass, since
 * this is the one authoritative source for the run's actual output.
 */
export async function GET(req: Request) {
  try {
    await requireUserId();

    const runId = new URL(req.url).searchParams.get("runId");
    if (!runId) return NextResponse.json({ error: "Missing runId" }, { status: 400 });

    const run = await runs.retrieve(runId);
    if (run.status !== "COMPLETED") {
      const detail = (run as { error?: { message?: string; name?: string } }).error;
      return NextResponse.json(
        { ok: false, error: detail?.message ?? detail?.name ?? `Upload ended with status ${run.status}` },
        { status: 200 }
      );
    }

    const output = run.output as { url?: string } | undefined;
    if (!output?.url) {
      return NextResponse.json({ ok: false, error: "Upload completed but returned no URL" }, { status: 200 });
    }

    return NextResponse.json({ ok: true, url: output.url }, { status: 200 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("upload-image result lookup failed:", err);
    return NextResponse.json({ error: "Failed to fetch upload result" }, { status: 500 });
  }
}