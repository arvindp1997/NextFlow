import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, UnauthorizedError } from "@/lib/auth";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    const source = await prisma.workflow.findUnique({ where: { id } });
    if (!source || source.clerkUserId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const workflow = await prisma.workflow.create({
      data: {
        clerkUserId: userId,
        name: `${source.name} Copy`,
        nodes: source.nodes as object,
        edges: source.edges as object,
      },
    });

    return NextResponse.json({ workflow }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to duplicate workflow" }, { status: 500 });
  }
}