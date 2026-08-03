"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRealtimeRun } from "@trigger.dev/react-hooks";

export interface ActiveRun {
  runId: string;
  triggerRunId: string;
  publicAccessToken: string;
}

const TERMINAL_STATUSES = new Set([
  "COMPLETED",
  "FAILED",
  "CRASHED",
  "CANCELED",
  "SYSTEM_FAILURE",
  "TIMED_OUT",
  "EXPIRED",
]);

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
 *
 * Also reconciles once whenever the browser tab regains focus (or on
 * mount) while a run is still being watched — a browser backgrounding a
 * tab, throttling it, or the machine sleeping can interrupt the
 * underlying Realtime connection for however long that lasts. If the run
 * actually finished during that gap, the connection can resume without
 * ever having delivered the terminal event (it missed the transition, not
 * just a poll cycle), leaving the UI stuck showing "running" forever with
 * no further Realtime activity to ever correct it. This check reacts to a
 * real event (tab regaining visibility, or first mount) — never a timer —
 * and only calls the one-shot status endpoint, not on any interval.
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
  const settledOnceRef = useRef(false);

  const handleComplete = useCallback(() => {
    settledOnceRef.current = true;
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

  useEffect(() => {
    settledOnceRef.current = false;

    const reconcile = async () => {
      if (settledOnceRef.current || document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/runs/${activeRun.triggerRunId}/status`);
        if (!res.ok) return;
        const data = (await res.json()) as { status?: string };
        if (data.status && TERMINAL_STATUSES.has(data.status) && !settledOnceRef.current) {
          settledOnceRef.current = true;
          onSettledRef.current();
        }
      } catch {
        // Non-fatal — Realtime remains the primary mechanism; this is
        // only a backstop, and will simply be retried on the next
        // visibility change if it fails transiently.
      }
    };

    // Covers the run having already finished in the gap before this
    // component/subscription even mounted (mirrors the same "check
    // current state in addition to listening for future events" pattern
    // used for the Transloadit upload flow).
    reconcile();

    document.addEventListener("visibilitychange", reconcile);
    return () => document.removeEventListener("visibilitychange", reconcile);
  }, [activeRun.triggerRunId]);

  return null;
}