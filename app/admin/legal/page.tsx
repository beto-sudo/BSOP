"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Doc = {
  id: string;
  category: "constitucion" | "poder" | "acta" | "cap_table" | "otro";
  title: string;
  issuedAt?: string | null;
  expiresAt?: string | null;
  notaryName?: string | null;
  notaryNumber?: string | null;
  city?: string | null;
  state?: string | null;
  summary?: string | null;
  storage_path: string;
  createdAt: string;
  signedUrl?: string | null;
};

type CapRow = {
  id: string;
  holderName: string;
  holderRfc?: string | null;
  personType?: "fisica" | "moral" | null;
  shares?: number | null;
  percentage?: number | null;
  series?: string | null;
  documentId?: string | null;
  notes?: string | null;
};

const CATEGORY_LABEL: Record<Doc["category"], string> = {
  constitucion: "Escritura Constitutiva",
  poder: "Poder",
  acta: "Acta de Asamblea",
  cap_table: "Cap Table",
  otro: "Otro",
};

export default function LegalCenter() {
  const qp = useSearchParams();
  const company = (qp.get("company") || "rincon").toLowerCase();

  // Docs
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Doc["category"] | "all">("all");
  const filtered = useMemo(
    () => docs.filter(d => filter === "all" ? true : d.category === filter),
    [docs, filter]
  );

  // Upload form
  const [file, setFile] = useState<File | null>(null);
  const [override, setOverride] = useState<Partial<Doc>>({});

  // Cap table
  const [cap, setCap] = useState<CapRow[]>([]);
  const [capError, setCapError] = useState<string | null>(null);
  const [capForm, setCapForm] = useState<Partial<CapRow>>({});

  // ----------- Loaders -----------
  async function loadDocs() {
    try {
      setLoadingDocs(true);
      setDocsError(null);
      const r = await fetch(`/api/legal/docs?company=${company}`, { cache: "no-store" });
      if (!r.ok) {
        const t = await r.text();
        setDocs([]);
        setDocsError(`No pude cargar documentos (${r.status}). ${t}`);
        return;
      }
      const data = await r.json();
      setDocs(Array.isArray(data) ? data : []);
    } finally {
      setLoadingDocs(false);
    }
  }

  async function loadCap() {
    try {
      setCapError(null);
      const r = await fetch(`/api/legal/cap-table?company=${company}`, { cache: "no-store" });
      const ct = r.headers.get("content-type") || "";
      if (!r.ok) {
        const t = await r.text();
        setCap([]);
        setCapError(`No pude cargar el cuadro accionario (${r.status}). ${t.slice(0,200)}`);
        return;
      }
      if (!ct.includes("application/json")) {
        const t = await r.text();
        setCap([]);
        setCapError(`Respuesta no JSON (${ct || "sin content-type"}). ${t.slice(0,200)}`);
        return;
      }
      const data = await r.json();
      setCap(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setCap([]);
      setCapError(e?.message || "Error cargando cap table");
    }
  }

  // ----------- Actions -----------
  async function upload() {
    if (!file) return;
    const fd = new FormData();
    fd.append("company", company);
    fd.append("file", file);
    Object.entries(override).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") fd.append(k, String(v));
    });
    const r = await fetch("/api/legal/docs", { method: "POST", body: fd });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      alert(e.error || `Error subiendo (${r.status})`);
      return;
    }
    setFile(null);
    setOverride({});
    await loadDocs();
  }

  async function saveDoc(d: Doc) {
    const r = await fetch(`/api/legal/docs/${d.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      alert(e.error || "No se pudo guardar");
    } else {
      loadDocs();
    }
  }

  async function delDoc(id: string) {
    if (!confirm("¿Eliminar documento?")) return;
    const r = await fetch(`/api/legal/docs/${id}`, { method: "DELETE" });
    if (r.ok) loadDocs();
  }

  async function addCap(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch(`/api/legal/cap-table`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, ...capForm }),
    });

    if (!r.ok) {
      const txt = await r.text();
      let msg = txt;
      try { const j = JSON.parse(txt); msg = j.error || msg; } catch {}
      alert(`No se pudo agregar (${r.status}). ${msg}`);
      return;
    }
    setCapForm({});
    loadCap();
  }

  async function delCap(id: string) {
    if (!confirm("¿Eliminar registro?")) return;
    const r = await fetch(`/api/legal/cap-table/${id}`, { method: "DELETE" });
    if (r.ok) loadCap();
  }

  useEffect(() => { loadDocs(); loadCap(); /* eslint-disable-next-line */ }, [company]);

  // ----------- Render -----------
  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-semibold">Configuración · Legal / Documentos</h2>

      {/* Upload */}
      <section className="rounded-2xl border bg-white p-4 space-y-4">
        <h3 className="text-lg font-semibold">Subir documento</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs text-slate-500 mb-1">Archivo PDF</label>
            <input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} />
            <p className="text-[11px] text-slate-500 mt-1">Se extrae texto y se clasifica automáticamente. Puedes sobrescribir campos.</p>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Categoría (opcional)</label>
            <select
              value={(override.category as any) || ""}
              onChange={e => setOverride(o => ({ ...o, category: e.target.value as any }))}
              className="border rounded-xl px-3 py-2 w-full"
            >
              <option value="">Auto</option>
              <option value="constitucion">Escritura</option>
              <option value="poder">Poder</option>
              <option value="acta">Acta</option>
              <option value="cap_table">Cap Table</option>
              <option value="otro">Otro</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Título (opcional)</label>
            <input className="border rounded-xl px-3 py-2 w-full" value={override.title || ""} onChange={e => setOverride(o => ({ ...o, title: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Fecha (emitido)</label>
            <input type="date" className="border rounded-xl px-3 py-2 w-full" value={override.issuedAt || ""} onChange={e => setOverride(o => ({ ...o, issuedAt: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Vigencia (vence)</label>
            <input type="date" className="border rounded-xl px-3 py-2 w-full" value={override.expiresAt || ""} onChange={e => setOverride(o => ({ ...o, expiresAt: e.target.value }))} />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Notario(a)</label>
            <input className="border rounded-xl px-3 py-2 w-full" value={override.notaryName || ""} onChange={e => setOverride(o => ({ ...o, notaryName: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">No. Notaría</label>
            <input className="border rounded-xl px-3 py-2 w-full" value={override.notaryNumber || ""} onChange={e => setOverride(o => ({ ...o, notaryNumber: e.target.value }))} />
          </div>
          <div>
            <button onClick={upload} disabled={!file} className="btn-primary disabled:opacity-60">Subir y clasificar</button>
          </div>
        </div>
      </section>

      {/* Listado documentos */}
      <section className="rounded-2xl border bg-white p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Documentos</h3>
          <select value={filter} onChange={e => setFilter(e.target.value as any)} className="border rounded-xl px-3 py-2 text-sm">
            <option value="all">Todas las categorías</option>
            <option value="constitucion">Escritura</option>
            <option value="poder">Poder</option>
            <option value="acta">Acta</option>
            <option value="cap_table">Cap Table</option>
            <option value="otro">Otro</option>
          </select>
        </div>

        {docsError && <div className="text-xs text-red-600">{docsError}</div>}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-3 py-2">Título</th>
                <th className="text-left px-3 py-2">Categoría</th>
                <th className="text-left px-3 py-2">Emitido</th>
                <th className="text-left px-3 py-2">Vence</th>
                <th className="text-left px-3 py-2">Notaría</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td className="px-3 py-6" colSpan={6}>Sin documentos</td></tr>
              ) : filtered.map(d => (
                <tr key={d.id} className="border-t align-top">
                  <td className="px-3 py-2">
                    <input
                      className="border rounded-lg px-2 py-1 w-full"
                      value={d.title}
                      onChange={e => setDocs(prev => prev.map(x => x.id===d.id ? { ...x, title: e.target.value } : x))}
                      onBlur={() => saveDoc(docs.find(x=>x.id===d.id)!)}
                    />
                    <div className="text-xs text-slate-500 line-clamp-2">{d.summary || "-"}</div>
                  </td>
                  <td className="px-3 py-2 w-44">
                    <select
                      className="border rounded-lg px-2 py-1 w-full"
                      value={d.category}
                      onChange={e => { const v=e.target.value as Doc["category"]; setDocs(prev => prev.map(x => x.id===d.id ? { ...x, category: v } : x)); }}
                      onBlur={() => saveDoc(docs.find(x=>x.id===d.id)!)}
                    >
                      {Object.entries(CATEGORY_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 w-40">
                    <input type="date" className="border rounded-lg px-2 py-1 w-full"
                      value={d.issuedAt || ""} onChange={e=>setDocs(prev=>prev.map(x=>x.id===d.id?{...x,issuedAt:e.target.value}:x))}
                      onBlur={() => saveDoc(docs.find(x=>x.id===d.id)!)} />
                  </td>
                  <td className="px-3 py-2 w-40">
                    <input type="date" className="border rounded-lg px-2 py-1 w-full"
                      value={d.expiresAt || ""} onChange={e=>setDocs(prev=>prev.map(x=>x.id===d.id?{...x,expiresAt:e.target.value}:x))}
                      onBlur={() => saveDoc(docs.find(x=>x.id===d.id)!)} />
                  </td>
                  <td className="px-3 py-2 w-64">
                    <div className="flex gap-2">
                      <input placeholder="Nombre" className="border rounded-lg px-2 py-1 w-full"
                        value={d.notaryName || ""} onChange={e=>setDocs(prev=>prev.map(x=>x.id===d.id?{...x,notaryName:e.target.value}:x))}
                        onBlur={() => saveDoc(docs.find(x=>x.id===d.id)!)} />
                      <input placeholder="No." className="border rounded-lg px-2 py-1 w-20"
                        value={d.notaryNumber || ""} onChange={e=>setDocs(prev=>prev.map(x=>x.id===d.id?{...x,notaryNumber:e.target.value}:x))}
                        onBlur={() => saveDoc(docs.find(x=>x.id===d.id)!)} />
                    </div>
                  </td>
                  <td className="px-3 py-2 w-40 text-right">
                    <div className="flex gap-2 justify-end">
                      {d.signedUrl ? <a href={d.signedUrl} target="_blank" className="rounded-lg border px-3 py-1">Ver PDF</a> : null}
                      <button className="rounded-lg border px-3 py-1 hover:bg-red-50" onClick={() => delDoc(d.id)}>Borrar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cap Table */}
      <section className="rounded-2xl border bg-white p-4 space-y-4">
        <h3 className="text-lg font-semibold">Cuadro accionario</h3>

        {capError && (
          <div className="text-xs text-red-600">
            {capError}
            <div className="text-[11px] text-slate-500 mt-1">
              Abre <code>/api/legal/cap-table?company={company}</code> en una pestaña para ver el JSON exacto del backend.
            </div>
          </div>
        )}

        <form onSubmit={addCap} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs text-slate-500 mb-1">Accionista / Socio</label>
            <input className="border rounded-xl px-3 py-2 w-full" value={capForm.holderName || ""} onChange={e=>setCapForm(f=>({ ...f, holderName: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">RFC</label>
            <input className="border rounded-xl px-3 py-2 w-full uppercase" value={capForm.holderRfc || ""} onChange={e=>setCapForm(f=>({ ...f, holderRfc: e.target.value.toUpperCase() }))} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Tipo</label>
            <select className="border rounded-xl px-3 py-2 w-full" value={capForm.personType || ""} onChange={e=>setCapForm(f=>({ ...f, personType: e.target.value as any }))}>
              <option value="">—</option>
              <option value="fisica">Física</option>
              <option value="moral">Moral</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Acciones</label>
            <input type="number" className="border rounded-xl px-3 py-2 w-full" value={(capForm.shares as any) ?? ""} onChange={e=>setCapForm(f=>({ ...f, shares: e.target.value === "" ? undefined : +e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">% Participación</label>
            <input type="number" step="0.0001" className="border rounded-xl px-3 py-2 w-full" value={(capForm.percentage as any) ?? ""} onChange={e=>setCapForm(f=>({ ...f, percentage: e.target.value === "" ? undefined : +e.target.value }))} />
          </div>
          <div className="md:col-span-1">
            <button className="btn-primary w-full">Agregar</button>
          </div>
        </form>

        <div className="rounded-2xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-3 py-2">Accionista</th>
                <th className="text-left px-3 py-2">RFC</th>
                <th className="text-right px-3 py-2">Acciones</th>
                <th className="text-right px-3 py-2">% Part.</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(cap) ? cap : []).length === 0 ? (
                <tr><td className="px-3 py-6" colSpan={5}>Sin registros</td></tr>
              ) : (Array.isArray(cap) ? cap : []).map(r => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{r.holderName}</td>
                  <td className="px-3 py-2">{r.holderRfc || "-"}</td>
                  <td className="px-3 py-2 text-right">{r.shares ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{r.percentage ?? "-"}</td>
                  <td className="px-3 py-2 text-right">
                    <button className="rounded-lg border px-3 py-1 hover:bg-red-50" onClick={() => delCap(r.id)}>Borrar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
