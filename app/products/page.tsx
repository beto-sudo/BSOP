"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Product = { id: string; name: string; sku?: string; isActive: boolean };

export default function ProductsPage() {
  const qp = useSearchParams();
  const company = (qp.get("company") || "rincon").toLowerCase();

  const [list, setList] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/products?company=${company}`, { cache: "no-store" });
    const data = await res.json();
    setList(data);
    setLoading(false);
  }

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, name, sku }),
    });
    if (res.ok) { setName(""); setSku(""); load(); }
    else { alert((await res.json()).error || "Error"); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [company]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-slate-900">Productos — {company}</h2>

      <form onSubmit={createProduct} className="flex gap-2 items-end">
        <div>
          <label className="block text-xs text-slate-500">Nombre</label>
          <input className="border rounded-xl px-3 py-2 w-64" value={name}
                 onChange={e=>setName(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs text-slate-500">SKU</label>
          <input className="border rounded-xl px-3 py-2 w-48" value={sku}
                 onChange={e=>setSku(e.target.value)} />
        </div>
        <button className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm">Agregar</button>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-2">Nombre</th>
              <th className="text-left px-4 py-2">SKU</th>
              <th className="px-4 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-6" colSpan={3}>Cargando…</td></tr>
            ) : list.length === 0 ? (
              <tr><td className="px-4 py-6" colSpan={3}>Sin productos aún.</td></tr>
            ) : (
              list.map(p => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-4 py-2">{p.sku || "-"}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={async () => {
                        if (!confirm("¿Borrar este producto?")) return;
                        await fetch(`/api/products/${p.id}`, { method: "DELETE" });
                        load();
                      }}
                      className="rounded-lg border px-3 py-1 hover:bg-red-50"
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
