export async function uploadImageViaTransloadit(file: File): Promise<string> {
  const signRes = await fetch("/api/upload", { method: "POST" });
  if (!signRes.ok) throw new Error("Could not sign upload request");
  const { params, signature } = (await signRes.json()) as { params: string; signature: string };

  const form = new FormData();
  form.append("params", params);
  form.append("signature", signature);
  form.append("image_field", file);

  const assemblyRes = await fetch("https://api2.transloadit.com/assemblies", { method: "POST", body: form });
  if (!assemblyRes.ok) {
    const body = await assemblyRes.json().catch(() => null);
    throw new Error(body?.message ?? "Transloadit assembly creation failed");
  }
  const assembly = await assemblyRes.json();

  if (assembly.error) throw new Error(assembly.message ?? "Transloadit assembly failed");
  if (assembly.ok === "ASSEMBLY_COMPLETED") {
    const url = extractFileUrl(assembly);
    if (!url) throw new Error("Upload completed but no file URL was returned");
    return url;
  }

  // Rather than polling the status endpoint on an interval, connect to the
  // assembly's own Socket.IO push channel (`websocket_url`, returned on
  // every assembly response) and wait for it to tell us the assembly is
  // done — one request in, one event back, no repeated GETs in between.
  return waitForAssemblyViaSocket(assembly);
}

async function waitForAssemblyViaSocket(assembly: Record<string, unknown>): Promise<string> {
  const websocketUrl = assembly.websocket_url as string | undefined;
  const assemblyId = assembly.assembly_id as string;
  const statusUrl = `https://api2.transloadit.com/assemblies/${assemblyId}`;

  if (!websocketUrl) {
    // Extremely unlikely (Transloadit always returns this), but fall back
    // to a single status check rather than throwing outright.
    const res = await fetch(statusUrl);
    const url = extractFileUrl(await res.json());
    if (!url) throw new Error("Upload completed but no file URL was returned");
    return url;
  }

  const { io } = await import("socket.io-client");

  return new Promise<string>((resolve, reject) => {
    const socket = io(websocketUrl, { transports: ["websocket", "polling"] });

    const cleanup = () => socket.disconnect();

    socket.on("connect", () => {
      socket.emit("assembly_connect", { id: assemblyId });
    });

    socket.on("assembly_finished", async () => {
      try {
        // The push event just tells us processing is done; one fetch here
        // gets the canonical, fully-populated status payload (file URLs
        // etc) — a single request triggered by the event, not a loop.
        const res = await fetch(statusUrl);
        const finalAssembly = await res.json();
        const url = extractFileUrl(finalAssembly);
        cleanup();
        if (!url) reject(new Error("Upload completed but no file URL was returned"));
        else resolve(url);
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error("Failed to read completed assembly"));
      }
    });

    socket.on("assembly_error", (err: { message?: string } | undefined) => {
      cleanup();
      reject(new Error(err?.message ?? "Transloadit assembly failed"));
    });

    socket.on("connect_error", (err: Error) => {
      cleanup();
      reject(new Error(`Could not connect to Transloadit realtime status: ${err.message}`));
    });
  });
}

/**
 * The uploaded file's URL can show up under `results[":original"]` (since
 * /upload/handle is the step that "produced" it) or under the top-level
 * `uploads` array (always populated for any uploaded file) depending on
 * exactly how Transloadit's response is shaped for a given account/region —
 * check both rather than assuming one.
 */
function extractFileUrl(assembly: Record<string, unknown>): string | undefined {
  const results = assembly.results as Record<string, Array<{ ssl_url?: string; url?: string }>> | undefined;
  const fromResults = results?.[":original"]?.[0];
  if (fromResults?.ssl_url || fromResults?.url) return fromResults.ssl_url ?? fromResults.url;

  const uploads = assembly.uploads as Array<{ ssl_url?: string | null; url?: string | null }> | undefined;
  const fromUploads = uploads?.[0];
  return fromUploads?.ssl_url ?? fromUploads?.url ?? undefined;
}

export const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/jpg,image/png,image/webp,image/gif";