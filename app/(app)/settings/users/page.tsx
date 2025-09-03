"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Row = {
  member_id: string;
  company_id: string;
  user_id: string;
  email: string;
  full_name: string;
  avatar_url: string;
  locale: string;
  member_is_active: boolean;
  profile_is_active: boolean;
};

export default function UsersPage({
  searchParams,
}: {
  searchParams: { companyId?: string; company?: string };
}) {
  const [companyId, setCompanyId] = useState<string | undefined>(
    searchParams.companyId
  );
  const companySlug = searchParams.company;

  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // Resolver companyId si no viene en la URL:
  useEffect(() => {
    (async () => {
      if (companyId || !companySlug) return;

      // 1) Usa /api/admin/company?company=slug (más directo)
      try {
        const r1 = await fetch(`/api/admin/company?company=${companySlug}`, {
          cache: "no-store",
        });
        if (r1.ok) {
          const json = await r1.json();
          if (json?.id) {
            setCompanyId(json.id);
            return;
          }
        }
      } catch (_) {}

      // 2) Respaldo: /api/companies y buscar por slug
      try {
        const r2 = await fetch("/api/companies", { cache: "no-store" });
        if (r2.ok) {
          const list = await r2.json();
          const c = (Array.isArray(list) ? list : []).find(
            (x: any) =>
              x.slug?.toLowerCase() === companySlug.toLowerCase() && x.id
          );
          if (c?.id) setCompanyId(c.id);
        }
      } catch (e) {
        console.error("resolve companyId fallback:", e);
      }
    })();
  }, [companyId, companySlug]);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    const url = `/api/settings/users?companyId=${companyId}&query=${encodeURIComponent(
      q
    )}`;
    fetch(url)
      .then((r) => r.json())
      .then((res) => {
        setRows(res.rows || []);
        setCount(res.count || 0);
      })
      .finally(() => setLoading(false));
  }, [companyId, q]);

  if (!companyId) return <div className="p-6">Cargando empresa…</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Usuarios</h1>
      <div className="flex gap-2">
        <input
          className="border rounded px-2 py-1 w-80"
          placeholder="Buscar por nombre o email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {loading && <span className="text-sm">Cargando…</span>}
      </div>
      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2">Nombre</th>
              <th className="text-left px-3 py-2">Email</th>
              <th className="text-left px-3 py-2">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.member_id} className="border-t">
                <td className="px-3 py-2">{r.full_name || "(sin nombre)"}</td>
                <td className="px-3 py-2">{r.email}</td>
                <td className="px-3 py-2">
                  {r.member_is_active ? "Activo" : "Inactivo"}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`./users/${r.user_id}?companyId=${companyId}`}
                    className="text-blue-600 hover:underline"
                  >
                    Abrir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-sm text-gray-500">Total: {count}</div>
    </div>
  );
}
