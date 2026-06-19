import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { createWorkflowSchema } from "@/lib/validation";
import { buildSampleWorkflow } from "@/lib/sample-workflow";

export async function GET() {
  try {
    const userId = await requireUserId();
    const workflows = await prisma.workflow.findMany({
      where: { clerkUserId: userId },
      orderBy: { lastEditedAt: "desc" },
      select: { id: true, name: true, status: true, lastEditedAt: true, createdAt: true },
    });
    return NextResponse.json({ workflows });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to list workflows" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const parsed = createWorkflowSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const requestInputsNode = {
      id: "request-inputs",
      type: "request-inputs",
      position: { x: 80, y: 200 },
      data: { kind: "request-inputs", fields: [] },
    };
    const responseNode = {
      id: "response",
      type: "response",
      position: { x: 640, y: 200 },
      data: { kind: "response" },
    };

    const { nodes, edges } =
      parsed.data.template === "sample"
        ? buildSampleWorkflow()
        : { nodes: [requestInputsNode, responseNode], edges: [] };

    const workflow = await prisma.workflow.create({
      data: {
        clerkUserId: userId,
        name: parsed.data.name,
        nodes,
        edges,
      },
    });
    return NextResponse.json({ workflow }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to create workflow" }, { status: 500 });
  }
}
