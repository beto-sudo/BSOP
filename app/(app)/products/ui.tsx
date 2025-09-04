// app/(app)/products/ui.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Product = { id: string; name: string; sku: string | null; isActive: boolean };

export default function ProductsClient() {
  const qp = useSearchParams();
  const company = (qp.get("company") || "").toLowerCase();

  const [items, setItems] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");

  async function load() {
    if (!company) return;
    setLoading(true);
    const r = await fetch(`/api/products?company=${company}&q=${encodeURIComponent(q)}`, { cache: "no-store" });
    const j = await r.json();
    setItems(j.items ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [company]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter(p => p.name.toLowerCase().includes(t) || (p.sku ?? "").toLowerCase().includes(t));
  }, [items, q]);

  async function createProduct() {
    if (!name.trim()) return;
    const r = await fetch(`/api/products?company=${company}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), sku: sku.trim() }),
    });
    if (r.ok) {
      setName(""); setSku("");
      await load();
    } else {
      alert("No se pudo crear el producto.");
    }
  }

  async function toggleActive(p: Product) {
    const r = await fetch(`/api/products/${p.id}?company=${company}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    if (r.ok) load();
  }

  async function rename(p: Product, newName: string) {
    const r = await fetch(`/api/products/${p.id}?company=${company}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    if (r.ok) load();
  }

  return (
    <main className="p-6 space-y-6">
      <header className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <h1 className="text-base font-semibold">Productos</h1>
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o SKU…"
            className="rounded-full border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-500)]"
          />
          <button onClick={load} className="rounded-full border px-4 py-2 text-sm hover:bg-slate-50">Actualizar</button>
        </div>
      </header>

      {/* Alta rápida */}
      <section className="rounded-2xl border p-4 bg-white">
        <h2 className="text-sm font-medium mb-3">Nuevo producto</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre"
            className="flex-1 rounded-lg border px-3 py-2 text-sm"
          />
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="SKU (opcional)"
            className="w-52 rounded-lg border px-3 py-2 text-sm"
          />
          <button
            onClick={createProduct}
            className="rounded-lg border px-3 py-2 text-sm bg-[var(--brand-50)] border-[var(--brand-300)] text-[var(--brand-800)] hover:bg-[var(--brand-100)]"
          >
            Guardar
          </button>
        </div>
      </section>

      {/* Lista */}
      <section className="rounded-2xl border overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="text-left px-3 py-2 w-10">#</th>
              <th className="text-left px-3 py-2">Nombre</th>
              <th className="text-left px-3 py-2 w-40">SKU</th>
              <th className="text-left px-3 py-2 w-28">Estado</th>
              <th className="px-3 py-2 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-3 py-4 text-slate-500">Cargando…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-4 text-slate-500">Sin resultados.</td></tr>
            ) : (
              filtered.map((p, i) => (
                <tr key={p.id} className="border-t">
                  <td className="px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2">
                    <input
                      defaultValue={p.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== p.name) rename(p, v);
                      }}
                      className="w-full bg-transparent outline-none rounded px-1 py-1 hover:bg-slate-50"
                    />
                  </td>
                  <td className="px-3 py-2">{p.sku || "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs border ${p.isActive ? "bg-green-50 border-green-200 text-green-700" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
                      {p.isActive ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => toggleActive(p)}
                      className="rounded-full border px-3 py-1 text-xs hover:bg-slate-50"
                    >
                      {p.isActive ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
