import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, UnauthorizedError } from "@/lib/auth";
import { createWorkflowSchema, validateGraphHandles } from "@/lib/validation";
import { hasCycle } from "@/lib/graph";
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

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      // Previously this fell back to `{}` silently here, which meant any
      // request-body problem (bad JSON, empty body, wrong content-type)
      // quietly produced a blank "Untitled Workflow" instead of an error —
      // exactly the "import silently shows the default template" bug.
      return NextResponse.json({ error: "Request body is not valid JSON" }, { status: 400 });
    }

    const parsed = createWorkflowSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    // If the caller's raw body included a `nodes` or `edges` key at all
    // (i.e. this was an import attempt, not a blank/template creation),
    // never silently fall through to a blank workflow if that data didn't
    // come through validation intact — surface a real error instead.
    const isImportAttempt = typeof body === "object" && body !== null && ("nodes" in body || "edges" in body);
    if (isImportAttempt && (!parsed.data.nodes || !parsed.data.edges)) {
      return NextResponse.json({ error: "Import payload is missing valid nodes/edges" }, { status: 400 });
    }

    if (parsed.data.nodes && parsed.data.edges) {
      if (hasCycle(parsed.data.nodes as never, parsed.data.edges as never)) {
        return NextResponse.json({ error: "Workflow graph contains a cycle; cycles are not allowed" }, { status: 400 });
      }
      const handleErrors = validateGraphHandles(parsed.data.nodes as never, parsed.data.edges as never);
      if (handleErrors.length > 0) {
        return NextResponse.json({ error: "Invalid edges", details: handleErrors }, { status: 400 });
      }
    }

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
      parsed.data.nodes && parsed.data.edges
        ? { nodes: parsed.data.nodes, edges: parsed.data.edges }
        : parsed.data.template === "sample"
          ? buildSampleWorkflow()
          : { nodes: [requestInputsNode, responseNode], edges: [] };

    const workflow = await prisma.workflow.create({
      data: {
        clerkUserId: userId,
        name: parsed.data.name,
        nodes: nodes as object,
        edges: edges as object,
      },
    });
    return NextResponse.json({ workflow }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to create workflow" }, { status: 500 });
  }
}