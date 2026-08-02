"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRealtimeRun } from "@trigger.dev/react-hooks";

export interface ActiveRun {
  runId: string;
  triggerRunId: string;
  publicAccessToken: string;
}

/**
 * Headless: subscribes to an orchestrator run via Trigger.dev Realtime
 * (useRealtimeRun) and forwards live per-node status updates + the
 * terminal "done" event up to the caller. Shared by both the canvas
 * editor (WorkflowClient) and the Workflow Overview page's Playground
 * tab (PlaygroundPanel) so neither has to poll `/api/workflows/[id]/history`
 * on an interval to know when a run finishes or a node's status changes.
 *
 * Renders nothing — it's mounted conditionally (`{activeRun && <RunRealtimeSync .../>}`)
 * rather than calling the hook unconditionally, since the run id/token are
 * only known once a run has actually started.
 *
 * `onNodeStatuses`/`onSettled` are read through refs rather than closed
 * over directly, so the options object passed to `useRealtimeRun` only
 * ever changes when `activeRun` itself genuinely changes — not on every
 * render of whichever parent renders this component (which, being a
 * canvas/form-heavy UI, re-renders constantly for reasons that have
 * nothing to do with the run). Passing fresh inline callbacks here
 * previously caused the subscription to be torn down and recreated far
 * more often than intended, which could cause a genuine completion event
 * to be missed mid-teardown — surfacing as results only appearing after a
 * full page/tab remount forced a fresh fetch, instead of appearing live.
 */
export function RunRealtimeSync({
  activeRun,
  onNodeStatuses,
  onSettled,
}: {
  activeRun: ActiveRun;
  onNodeStatuses?: (statuses: Record<string, string>) => void;
  onSettled: () => void;
}) {
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  const onNodeStatusesRef = useRef(onNodeStatuses);
  onNodeStatusesRef.current = onNodeStatuses;

  const handleComplete = useCallback(() => {
    onSettledRef.current();
  }, []);

  const options = useMemo(
    () => ({
      accessToken: activeRun.publicAccessToken,
      onComplete: handleComplete,
    }),
    [activeRun.publicAccessToken, handleComplete]
  );

  const { run } = useRealtimeRun(activeRun.triggerRunId, options);

  // useRealtimeRun streams updates continuously while the run is active
  // (progress/usage ticks, not just genuine state changes), so `run` — and
  // therefore `run?.metadata` — gets a new object identity far more often
  // than nodeStatuses actually changes. Without this content check, every
  // tick would re-invoke onNodeStatuses, which (in callers that debounce a
  // history refetch off of it) would perpetually reset that debounce timer
  // before it ever elapses.
  const lastSerialized = useRef<string>("");
  useEffect(() => {
    const statuses = (run?.metadata as { nodeStatuses?: Record<string, string> } | undefined)?.nodeStatuses;
    if (!statuses) return;
    const serialized = JSON.stringify(statuses);
    if (serialized === lastSerialized.current) return;
    lastSerialized.current = serialized;
    onNodeStatusesRef.current?.(statuses);
  }, [run?.metadata]);

  return null;
}