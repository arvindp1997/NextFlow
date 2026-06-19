import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export default async function DashboardPage() {
  const userId = await requireUserId();
  const workflows = await prisma.workflow.findMany({
    where: { clerkUserId: userId },
    orderBy: { lastEditedAt: "desc" },
    select: { id: true, name: true, status: true, lastEditedAt: true, createdAt: true },
  });

  const serialized = workflows.map((w: (typeof workflows)[number]) => ({
    ...w,
    lastEditedAt: w.lastEditedAt.toISOString(),
    createdAt: w.createdAt.toISOString(),
  }));

  return <DashboardClient initialWorkflows={serialized} />;
}
