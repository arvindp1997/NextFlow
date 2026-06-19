import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { WorkflowClient } from "@/components/canvas/WorkflowClient";

export default async function WorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;

  const workflow = await prisma.workflow.findUnique({ where: { id } });
  if (!workflow || workflow.clerkUserId !== userId) notFound();

  return (
    <WorkflowClient
      workflowId={workflow.id}
      name={workflow.name}
      nodes={workflow.nodes as never}
      edges={workflow.edges as never}
    />
  );
}
