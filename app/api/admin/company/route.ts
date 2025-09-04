async function onSave(e: React.FormEvent) {
  e.preventDefault();
  setSaving(true);
  try {
    const res = await fetch(`/api/admin/company?company=${encodeURIComponent(slug)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), // arma tu payload como ya lo tienes
    });

    // intenta leer JSON solo si hay contenido y es application/json
    let data: any = null;
    const ct = res.headers.get("content-type") || "";
    const cl = Number(res.headers.get("content-length") || "0");
    if (ct.includes("application/json") && (isNaN(cl) || cl > 0)) {
      try { data = await res.json(); } catch {}
    }

    if (!res.ok) {
      throw new Error(data?.error || `Error ${res.status}`);
    }

    // opcional: feedback
    toast.success("Cambios guardados");
  } catch (err: any) {
    toast.error(err?.message || "No se pudo guardar");
  } finally {
    setSaving(false);
  }
}
