import { NextResponse } from "next/server";
import { runs } from "@trigger.dev/sdk/v3";
import { requireUserId, UnauthorizedError } from "@/lib/auth";

/**
 * One-shot lookup of a Trigger.dev run's current status, used only as a
 * reconciliation safety net (see RunRealtimeSync's visibilitychange
 * handler) — never on an interval. Realtime subscriptions can miss a
 * run's actual completion event if the underlying connection was
 * interrupted while the browser tab was backgrounded/throttled or the
 * machine was asleep; when the tab regains focus, we check once whether
 * the run we're still "watching" already finished without us, and settle
 * immediately if so instead of leaving the UI stuck showing "running"
 * indefinitely.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ triggerRunId: string }> }) {
  try {
    await requireUserId();
    const { triggerRunId } = await params;
    const run = await runs.retrieve(triggerRunId);
    return NextResponse.json({ status: run.status });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("Run status lookup failed:", err);
    return NextResponse.json({ error: "Failed to look up run status" }, { status: 500 });
  }
}