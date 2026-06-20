import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { saveWorkflowSchema, renameWorkflowSchema } from "@/lib/validation";
import { hasCycle } from "@/lib/graph";

async function getOwnedWorkflow(userId: string, id: string) {
  const workflow = await prisma.workflow.findUnique({ where: { id } });
  if (!workflow || workflow.clerkUserId !== userId) return null;
  return workflow;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const workflow = await getOwnedWorkflow(userId, id);
    if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ workflow });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to load workflow" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const existing = await getOwnedWorkflow(userId, id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));

    // Rename-only payload
    const renameParsed = renameWorkflowSchema.safeParse(body);
    if (renameParsed.success && !("nodes" in body)) {
      const workflow = await prisma.workflow.update({
        where: { id },
        data: { name: renameParsed.data.name },
      });
      return NextResponse.json({ workflow });
    }

    const parsed = saveWorkflowSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    if (hasCycle(parsed.data.nodes as never, parsed.data.edges as never)) {
      return NextResponse.json({ error: "Workflow graph contains a cycle; cycles are not allowed" }, { status: 400 });
    }

    const workflow = await prisma.workflow.update({
      where: { id },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        nodes: parsed.data.nodes as object,
        edges: parsed.data.edges as object,
        lastEditedAt: new Date(),
      },
    });
    return NextResponse.json({ workflow });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to save workflow" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const existing = await getOwnedWorkflow(userId, id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.workflow.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to delete workflow" }, { status: 500 });
  }
}