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
  let assembly = await assemblyRes.json();

  const assemblyId: string = assembly.assembly_id;
  // Poll the generic endpoint rather than the instance-specific
  // assembly_ssl_url (e.g. api2-hu115ap.transloadit.com) — Transloadit's own
  // docs note instances cycle quickly and recommend falling back to
  // api2.transloadit.com, which is also just more reliably reachable from a
  // browser in general.
  const statusUrl = `https://api2.transloadit.com/assemblies/${assemblyId}`;
  while (assembly.ok !== "ASSEMBLY_COMPLETED") {
    if (assembly.error) throw new Error(assembly.message ?? "Transloadit assembly failed");
    await new Promise((r) => setTimeout(r, 600));
    const poll = await fetch(statusUrl);
    assembly = await poll.json();
  }

  const url = extractFileUrl(assembly);
  if (!url) throw new Error("Upload completed but no file URL was returned");
  return url;
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
