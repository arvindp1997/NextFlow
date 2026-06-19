import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { runs } from "@trigger.dev/sdk/v3";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  try {
    const userId = await requireUserId();
    const { id, runId } = await params;

    const workflow = await prisma.workflow.findUnique({ where: { id } });
    if (!workflow || workflow.clerkUserId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const run = await prisma.run.findUnique({ where: { id: runId } });
    if (!run || run.workflowId !== id) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    if (run.status !== "RUNNING") {
      return NextResponse.json({ error: "Run is not active" }, { status: 400 });
    }

    // Ask Trigger.dev to actually stop the orchestrator task. If this fails
    // (e.g. the dev worker isn't running, or the handle is stale) we still
    // fall through and mark everything canceled in our own DB below, so the
    // UI is never left stuck just because the remote cancel call failed.
    if (run.triggerRunId) {
      try {
        await runs.cancel(run.triggerRunId);
      } catch (err) {
        console.error("Failed to cancel Trigger.dev run (continuing to mark canceled locally):", err);
      }
    }

    await prisma.nodeRun.updateMany({
      where: { runId, status: { in: ["PENDING", "RUNNING"] } },
      data: { status: "FAILED", error: "Canceled by user", completedAt: new Date() },
    });

    const durationMs = Date.now() - run.startedAt.getTime();
    const updatedRun = await prisma.run.update({
      where: { id: runId },
      data: { status: "CANCELED", completedAt: new Date(), durationMs },
    });

    await prisma.workflow.update({ where: { id }, data: { status: "IDLE" } });

    return NextResponse.json({ run: updatedRun });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to cancel run" }, { status: 500 });
  }
}
