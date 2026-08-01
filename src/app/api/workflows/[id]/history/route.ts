import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { auth } from "@trigger.dev/sdk/v3";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const workflow = await prisma.workflow.findUnique({ where: { id } });
    if (!workflow || workflow.clerkUserId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const runs = await prisma.run.findMany({
      where: { workflowId: id },
      orderBy: { startedAt: "desc" },
      include: { nodeRuns: { orderBy: { startedAt: "asc" } } },
      take: 50,
    });

    // If the most recent run is still in flight and the page was just
    // (re)loaded — so the client doesn't already hold the token it got back
    // from POST /run — mint a fresh scoped public token so the frontend can
    // reattach its Realtime subscription instead of falling back to polling
    // this endpoint on an interval.
    const activeRun = runs.find((r: (typeof runs)[number]) => r.status === "RUNNING" && r.triggerRunId);
    const activeRunToken = activeRun?.triggerRunId
      ? await auth.createPublicToken({
          scopes: { read: { runs: [activeRun.triggerRunId] } },
          expirationTime: "1h",
        })
      : null;

    return NextResponse.json({
      runs,
      activeRun: activeRun
        ? { runId: activeRun.id, triggerRunId: activeRun.triggerRunId, publicAccessToken: activeRunToken }
        : null,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
  }
}