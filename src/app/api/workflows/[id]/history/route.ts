import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, UnauthorizedError } from "@/lib/auth";

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

    return NextResponse.json({ runs });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
  }
}
