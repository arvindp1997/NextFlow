import { task, tasks, metadata } from "@trigger.dev/sdk/v3";
import { prisma } from "@/lib/prisma";
import {
  buildDependencyGraph,
  buildNodeOutput,
  getCachedNodeOutput,
  resolveExecutionSet,
  resolveNodeInputs,
  type FlowEdge,
  type FlowNode,
  type NodeOutputs,
} from "@/lib/graph";
import type { CropImagePayload } from "@/trigger/cropImage";
import type { GeminiTaskPayload } from "@/trigger/gemini";

export interface RunWorkflowPayload {
  runId: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  scope: "full" | "partial" | "single";
  targetNodeIds: string[];
}

type NodeOutcome = "success" | "failed" | "skipped";

export const runWorkflowTask = task({
  id: "run-workflow",
  maxDuration: 600,
  run: async (payload: RunWorkflowPayload) => {
    const { runId, nodes, edges } = payload;
    const executionSet = resolveExecutionSet(nodes, edges, payload.scope, payload.targetNodeIds);
    const deps = buildDependencyGraph(nodes, edges);
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    // Trigger.dev Realtime: the frontend subscribes to this run (via
    // useRealtimeRun) and reads `run.metadata.nodeStatuses` to light up
    // nodes on the canvas live, with zero DB/API polling. This is set once
    // up front (every targeted node starts "pending") and patched again at
    // every state transition below.
    const nodeStatuses: Record<string, NodeOutcome | "pending" | "running"> = {};
    for (const id of executionSet) nodeStatuses[id] = "pending";
    metadata.set("nodeStatuses", nodeStatuses);

    function publishStatus(nodeId: string, status: NodeOutcome | "running") {
      nodeStatuses[nodeId] = status;
      metadata.set("nodeStatuses", { ...nodeStatuses });
    }

    // Seed outputs with every node's last-known value so that dependencies
    // which are NOT being re-executed (single/multi-select scope) still
    // resolve correctly for the nodes that are.
    const outputs: NodeOutputs = {};
    for (const node of nodes) outputs[node.id] = getCachedNodeOutput(node);

    // One settled-promise per node so dependents can await exactly their own
    // upstream set and nothing else — this is what makes independent
    // siblings run concurrently and a finished node fan out immediately.
    //
    // IMPORTANT: these promises must never reject. A node failing (or being
    // skipped because its upstream failed) is tracked explicitly via
    // `outcomes`, not via promise rejection — a rejected promise here would
    // propagate through the top-level Promise.all below and crash the whole
    // orchestrator *before* finalizeRun() ever runs, permanently stranding
    // the Run row in RUNNING. (This was the actual bug behind a workflow
    // getting stuck in "Running" forever as soon as any single node failed.)
    const settled = new Map<string, Promise<void>>();
    const outcomes = new Map<string, NodeOutcome>();

    function runNode(nodeId: string): Promise<void> {
      if (settled.has(nodeId)) return settled.get(nodeId)!;

      const promise = (async () => {
        const node = nodeById.get(nodeId);
        if (!node) return;

        // Wait only for this node's direct upstream dependencies that are
        // also part of this run's execution set; deps outside the set
        // already have their cached value seeded above.
        const upstream = [...(deps.get(nodeId) ?? [])].filter((d) => executionSet.has(d));
        await Promise.all(upstream.map(runNode));

        if (!executionSet.has(nodeId)) return; // not targeted this run

        const upstreamBlocked = upstream.some((d) => outcomes.get(d) === "failed" || outcomes.get(d) === "skipped");
        if (upstreamBlocked) {
          await recordSkipped(runId, node);
          outcomes.set(nodeId, "skipped");
          publishStatus(nodeId, "skipped");
          return;
        }

        publishStatus(nodeId, "running");
        try {
          await executeNode(runId, node, edges, outputs);
          outcomes.set(nodeId, "success");
          publishStatus(nodeId, "success");
        } catch (err) {
          // executeNode already persisted the FAILED NodeRun row with the
          // error message — swallow it here so this node's own promise
          // still resolves and the run can keep going / finish.
          console.error(`Node ${nodeId} (${node.type}) failed:`, err);
          outcomes.set(nodeId, "failed");
          publishStatus(nodeId, "failed");
        }
      })();

      settled.set(nodeId, promise);
      return promise;
    }

    // Kick off every targeted node; nodes with no pending deps start
    // immediately (T=0 fan-out), the rest cascade as their upstream
    // promises resolve. This can no longer throw, by construction above.
    await Promise.all([...executionSet].map(runNode));

    return finalizeRun(runId, outcomes);
  },
});

async function executeNode(
  runId: string,
  node: FlowNode,
  edges: FlowEdge[],
  outputs: NodeOutputs
): Promise<void> {
  const input = resolveNodeInputs(node, edges, outputs);

  const nodeRun = await prisma.nodeRun.create({
    data: {
      runId,
      nodeId: node.id,
      nodeType: node.type,
      nodeLabel: labelFor(node),
      status: "RUNNING",
      inputs: input as object,
      startedAt: new Date(),
    },
  });

  const startedAt = Date.now();
  try {
    let result: unknown;
    let triggerRunId: string | undefined;

    if (node.type === "crop-image") {
      const handle = await tasks.trigger<typeof import("@/trigger/cropImage").cropImageTask>(
        "crop-image",
        input as CropImagePayload
      );
      triggerRunId = handle.id;
      result = await subscribeForOutput(handle.id);
    } else if (node.type === "gemini") {
      const handle = await tasks.trigger<typeof import("@/trigger/gemini").geminiTask>(
        "gemini-generate",
        input as GeminiTaskPayload
      );
      triggerRunId = handle.id;
      result = await subscribeForOutput(handle.id);
    } else if (node.type === "response") {
      // Collect images that fed into the upstream Gemini node(s) so the
      // history panel can display them when this Response row is expanded.
      // Walk: Response ← result edge ← Gemini ← image_vision edges ← CropImage
      const sourceImages: string[] = [];
      const resultEdges = edges.filter(
        (e) => e.target === node.id && (e.targetHandle ?? "") === "result"
      );
      for (const re of resultEdges) {
        const visionEdges = edges.filter(
          (e) => e.target === re.source && (e.targetHandle ?? "") === "image_vision"
        );
        for (const ve of visionEdges) {
          const cropOut = outputs[ve.source] as { output_image?: string } | undefined;
          if (cropOut?.output_image) sourceImages.push(cropOut.output_image);
        }
      }
      result = sourceImages.length > 0
        ? { ...(input as object), sourceImages }
        : input; // local-only, no Trigger.dev task
    } else {
      // request-inputs: local-only, output already seeded from field values.
      // Save the actual field values as both inputs and output so the history
      // panel can show what data was used (including image URLs).
      const fieldValues = outputs[node.id] ?? {};
      result = fieldValues;
      await prisma.nodeRun.update({
        where: { id: nodeRun.id },
        data: { inputs: fieldValues as object },
      });
    }

    outputs[node.id] = buildNodeOutput(node, result);

    await prisma.nodeRun.update({
      where: { id: nodeRun.id },
      data: {
        status: "SUCCESS",
        output: (result ?? {}) as object,
        completedAt: new Date(),
        durationMs: Date.now() - startedAt,
        ...(triggerRunId ? { triggerRunId } : {}),
      },
    });
  } catch (err) {
    await prisma.nodeRun.update({
      where: { id: nodeRun.id },
      data: {
        status: "FAILED",
        error: err instanceof Error ? err.message : "Unknown error",
        completedAt: new Date(),
        durationMs: Date.now() - startedAt,
      },
    });
    throw err;
  }
}

/** Records a node as SKIPPED because an upstream dependency failed or was itself skipped. */
async function recordSkipped(runId: string, node: FlowNode): Promise<void> {
  await prisma.nodeRun.create({
    data: {
      runId,
      nodeId: node.id,
      nodeType: node.type,
      nodeLabel: labelFor(node),
      status: "SKIPPED",
      inputs: {},
      error: "Skipped: an upstream dependency failed or was skipped",
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 0,
    },
  });
}

const TERMINAL_FAILURE_STATUSES = new Set([
  "FAILED",
  "CRASHED",
  "CANCELED",
  "SYSTEM_FAILURE",
  "TIMED_OUT",
  "EXPIRED",
]);

/**
 * Waits for a child task run to finish using Trigger.dev Realtime
 * (`runs.subscribeToRun`) instead of a `runs.retrieve()` polling loop. This
 * opens a push-based subscription that yields a new value only when the
 * run's state actually changes, and resolves the moment a terminal status
 * arrives — no fixed-interval retrieve calls.
 *
 * Deliberately NOT `triggerAndWait` here: multiple sibling nodes in the DAG
 * are waited on concurrently via `Promise.all` in `runNode` above, and
 * Trigger.dev's `triggerAndWait`/wait primitives are explicitly not
 * supported inside a `Promise.all` (they checkpoint the parent run on a
 * single waitpoint). `subscribeToRun` has no such restriction, so it's what
 * keeps the DAG's parallel fan-out working while still being fully
 * Realtime-driven rather than polling.
 */
async function subscribeForOutput(runHandleId: string): Promise<unknown> {
  const { runs } = await import("@trigger.dev/sdk/v3");
  for await (const run of runs.subscribeToRun(runHandleId)) {
    if (run.status === "COMPLETED") return run.output;
    if (TERMINAL_FAILURE_STATUSES.has(run.status)) {
      // Surface the task's actual error (e.g. an API error message from
      // Gemini/Transloadit/etc), not just the bare status — this is what
      // shows up in the app's own history panel, so a failure should be
      // debuggable there without needing the Trigger.dev dashboard.
      const detail = (run as { error?: { message?: string; name?: string } }).error;
      const detailMsg = detail?.message ?? detail?.name;
      throw new Error(
        detailMsg
          ? `Task ${runHandleId} failed (${run.status}): ${detailMsg}`
          : `Task ${runHandleId} ended with status ${run.status}`
      );
    }
  }
  throw new Error(`Realtime subscription for run ${runHandleId} ended without a terminal status`);
}

function labelFor(node: FlowNode): string {
  switch (node.type) {
    case "request-inputs":
      return "Request-Inputs";
    case "response":
      return "Response";
    case "crop-image":
      return (node.data as { label?: string }).label ?? "Crop Image";
    case "gemini":
      return (node.data as { label?: string }).label ?? "Gemini 3.1 Pro";
  }
}

async function finalizeRun(runId: string, outcomes: Map<string, NodeOutcome>) {
  const run = await prisma.run.findUniqueOrThrow({ where: { id: runId } });

  // The run may already have been canceled by the user while this task was
  // executing — don't clobber that terminal state.
  if (run.status === "CANCELED") return run;

  const values = [...outcomes.values()];
  const anySuccess = values.includes("success");
  const anyBlocked = values.includes("failed") || values.includes("skipped");

  const finalStatus = !anyBlocked ? "SUCCESS" : anySuccess ? "PARTIAL" : "FAILED";
  const durationMs = Date.now() - run.startedAt.getTime();

  const result = await prisma.run.update({
    where: { id: runId },
    data: { status: finalStatus, completedAt: new Date(), durationMs },
  });

  await prisma.workflow.update({ where: { id: run.workflowId }, data: { status: "IDLE" } });

  return result;
}