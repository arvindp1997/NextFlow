import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { runWorkflowSchema } from "@/lib/validation";
import { tasks } from "@trigger.dev/sdk/v3";
import type { runWorkflowTask } from "@/trigger/runWorkflow";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const workflow = await prisma.workflow.findUnique({ where: { id } });
    if (!workflow || workflow.clerkUserId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = runWorkflowSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    if (parsed.data.scope !== "full" && parsed.data.targetNodeIds.length === 0) {
      return NextResponse.json({ error: "targetNodeIds is required for partial/single runs" }, { status: 400 });
    }

    const scopeEnum = parsed.data.scope === "full" ? "FULL" : parsed.data.scope === "partial" ? "PARTIAL" : "SINGLE";

    const run = await prisma.run.create({
      data: {
        workflowId: id,
        scope: scopeEnum,
        targetNodeIds: parsed.data.targetNodeIds,
        status: "RUNNING",
      },
    });

    await prisma.workflow.update({ where: { id }, data: { status: "RUNNING" } });

    const handle = await tasks.trigger<typeof runWorkflowTask>("run-workflow", {
      runId: run.id,
      nodes: workflow.nodes as never,
      edges: workflow.edges as never,
      scope: parsed.data.scope,
      targetNodeIds: parsed.data.targetNodeIds,
    });

    await prisma.run.update({ where: { id: run.id }, data: { triggerRunId: handle.id } });

    return NextResponse.json({ runId: run.id, triggerRunId: handle.id }, { status: 202 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to start run" }, { status: 500 });
  }
}
