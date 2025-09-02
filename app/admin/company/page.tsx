// app/admin/company/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Company = {
  id: string;
  slug: string;
  name: string;
  legalName?: string | null;
  rfc?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  active: boolean;
  settings: {
    branding: {
      brandName?: string | null;
      primaryColor?: string | null;
      secondaryColor?: string | null;
      logoUrl?: string | null;
    };
  };
};

export default function CompanyAdminPage() {
  const qp = useSearchParams();
  const router = useRouter();
  const company = useMemo(() => (qp.get("company") || "").toLowerCase(), [qp]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<Company | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!company) return;
    (async () => {
      setLoading(true); setErr(null);
      const r = await fetch(`/api/admin/company?company=${company}`, { cache: "no-store" });
      if (!r.ok) { setErr("No pude cargar la empresa"); setLoading(false); return; }
      const data = await r.json();
      setState(data);
      setLoading(false);
    })();
  }, [company]);

  async function save() {
    if (!state) return;
    setSaving(true); setErr(null);
    const r = await fetch("/api/admin/company", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company,
        name: state.name,
        legalName: state.legalName,
        rfc: state.rfc,
        email: state.email,
        phone: state.phone,
        address: state.address,
        active: state.active,
      }),
    });
    setSaving(false);
    if (!r.ok) {
      const e = await r.json().catch(()=>({}));
      setErr(e.error || "No pude guardar");
      return;
    }
    const updated = await r.json();
    setState(updated);

    // si la dejaste inactiva, saca al usuario a Home para que el selector elija otra
    if (updated.active === false) {
      // limpia cookie para que middleware no fuerce la misma
      document.cookie = `company=; Max-Age=0; path=/; samesite=lax`;
      router.push("/");
      router.refresh();
    } else {
      // refresca para aplicar cambios
      router.refresh();
    }
  }

  if (!company) {
    return <div className="p-6">Selecciona una empresa en el selector de la izquierda.</div>;
  }
  if (loading) return <div className="p-6">Cargando…</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Configuración · Empresa</h2>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-sm">{err}</div>}

      {state && (
        <div className="rounded-2xl border bg-white p-4 space-y-4 max-w-3xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Nombre (comercial)</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={state.name || ""}
                onChange={e=>setState(s=>s ? {...s, name: e.target.value} : s)}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Razón social</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={state.legalName || ""}
                onChange={e=>setState(s=>s ? {...s, legalName: e.target.value} : s)}
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">RFC</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={state.rfc || ""}
                onChange={e=>setState(s=>s ? {...s, rfc: e.target.value} : s)}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Email</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={state.email || ""}
                onChange={e=>setState(s=>s ? {...s, email: e.target.value} : s)}
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Teléfono</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={state.phone || ""}
                onChange={e=>setState(s=>s ? {...s, phone: e.target.value} : s)}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Dirección</label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                value={state.address || ""}
                onChange={e=>setState(s=>s ? {...s, address: e.target.value} : s)}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <label className="text-sm font-medium">Empresa activa</label>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={!!state.active}
              onChange={e=>setState(s=>s ? {...s, active: e.target.checked} : s)}
            />
            <span className="text-sm text-slate-500">
              Si desactivas, la empresa desaparecerá del selector.
            </span>
          </div>

          <div className="pt-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-xl bg-[var(--brand-600)] text-white px-4 py-2 hover:bg-[var(--brand-700)] disabled:opacity-60"
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
