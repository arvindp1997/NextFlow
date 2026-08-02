"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRealtimeRun } from "@trigger.dev/react-hooks";

interface ActiveUpload {
  triggerRunId: string;
  publicAccessToken: string;
}

/**
 * Uploads an image file via the `upload-image` Trigger.dev task and
 * resolves with its hosted URL, using Trigger.dev Realtime
 * (`useRealtimeRun`) to know when it's done — replaces the previous
 * approach of the browser connecting directly to Transloadit's own
 * Socket.IO status endpoint, which proved unreliable (some per-assembly
 * worker subdomains 404 on that endpoint entirely, on both the websocket
 * and polling transports — a genuine gap in Transloadit's side, not a
 * proxy/network issue).
 *
 * `useRealtimeRun` is called unconditionally (as hook rules require) with
 * `enabled: !!activeUpload` gating whether it actually subscribes — so
 * this hook needs no JSX of its own to mount; callers just call
 * `uploadFile(file)` exactly like the old plain-async-function API.
 */
export function useTransloaditUpload() {
  const [activeUpload, setActiveUpload] = useState<ActiveUpload | null>(null);
  // Kept in sync with `activeUpload` on every render so the stable
  // callback below (see `handleComplete`) can read the current value
  // without needing `activeUpload` in its own dependency array.
  const activeUploadRef = useRef<ActiveUpload | null>(null);
  activeUploadRef.current = activeUpload;

  const resolverRef = useRef<{ resolve: (url: string) => void; reject: (err: Error) => void } | null>(null);

  const settle = useCallback(async (triggerRunId: string) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setActiveUpload(null);
    if (!resolver) return;

    try {
      // One-shot authoritative fetch, triggered by this real completion
      // event — not polling. See src/app/api/upload-image/result/route.ts.
      const res = await fetch(`/api/upload-image/result?runId=${encodeURIComponent(triggerRunId)}`);
      if (!res.ok) throw new Error("Could not fetch upload result");
      const data = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (data.ok && data.url) resolver.resolve(data.url);
      else resolver.reject(new Error(data.error ?? "Image upload failed"));
    } catch (err) {
      resolver.reject(err instanceof Error ? err : new Error("Image upload failed"));
    }
  }, []);

  // A genuinely stable function identity across every render (empty dep
  // array, reads the current upload via the ref above instead of closing
  // over `activeUpload` directly). Passing a fresh inline arrow function
  // as `onComplete` on every render — even one totally unrelated to this
  // hook, like an unrelated canvas re-render — was tearing down and
  // reopening the Realtime subscription every time, which is exactly what
  // showed up as repeated/canceled subscription requests to the same run
  // in the network tab, and could cause a real completion event to be
  // missed mid-teardown on a second upload.
  const handleComplete = useCallback(() => {
    const current = activeUploadRef.current;
    if (current) settle(current.triggerRunId);
  }, [settle]);

  // Likewise memoize the whole options object passed to useRealtimeRun —
  // an inline object literal is a new reference every render regardless
  // of whether its contents actually changed, which is enough on its own
  // to trigger the same unwanted resubscribe behavior even with a stable
  // onComplete.
  const options = useMemo(
    () => ({
      accessToken: activeUpload?.publicAccessToken,
      enabled: !!activeUpload,
      onComplete: handleComplete,
    }),
    [activeUpload, handleComplete]
  );

  useRealtimeRun(activeUpload?.triggerRunId ?? "none", options);

  const uploadFile = useCallback((file: File): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      (async () => {
        try {
          const form = new FormData();
          form.append("file", file);
          const res = await fetch("/api/upload-image", { method: "POST", body: form });
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error(body?.error ?? "Upload failed to start");
          }
          const data = (await res.json()) as ActiveUpload;
          resolverRef.current = { resolve, reject };
          setActiveUpload(data);
        } catch (err) {
          reject(err instanceof Error ? err : new Error("Upload failed"));
        }
      })();
    });
  }, []);

  return { uploadFile };
}