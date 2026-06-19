export async function uploadImageViaTransloadit(file: File): Promise<string> {
  const signRes = await fetch("/api/upload", { method: "POST" });
  if (!signRes.ok) throw new Error("Could not sign upload request");
  const { params, signature } = (await signRes.json()) as { params: string; signature: string };

  const form = new FormData();
  form.append("params", params);
  form.append("signature", signature);
  form.append("image_field", file);

  const assemblyRes = await fetch("https://api2.transloadit.com/assemblies", { method: "POST", body: form });
  if (!assemblyRes.ok) throw new Error("Transloadit assembly creation failed");
  let assembly = await assemblyRes.json();

  const statusUrl: string = assembly.assembly_ssl_url ?? assembly.assembly_url;
  while (assembly.ok !== "ASSEMBLY_COMPLETED") {
    if (assembly.error) throw new Error(assembly.message ?? "Transloadit assembly failed");
    await new Promise((r) => setTimeout(r, 800));
    const poll = await fetch(statusUrl);
    assembly = await poll.json();
  }

  const firstStepResults = Object.values(assembly.results ?? {})[0] as Array<{ ssl_url?: string; url?: string }> | undefined;
  const url = firstStepResults?.[0]?.ssl_url ?? firstStepResults?.[0]?.url;
  if (!url) throw new Error("Upload completed but no file URL was returned");
  return url;
}

export const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/jpg,image/png,image/webp,image/gif";
