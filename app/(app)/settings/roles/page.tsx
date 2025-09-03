"use client";

import { useEffect, useState } from "react";
import PermissionMatrix from "@/_components/PermissionMatrix";

export default function RolesPage({
  searchParams,
}: {
  searchParams: { companyId?: string; company?: string };
}) {
  const [companyId, setCompanyId] = useState<string | undefined>(searchParams.companyId);
  const companySlug = searchParams.company;

  const [roles, setRoles] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [mods, setMods] = useState<Array<{ key: string; label: string }>>([]);
  const [perms, setPerms] = useState<Array<{ key: string; label: string }>>([]);
  const [items, setItems] = useState<Array<{ module_key: string; permission_key: string; allowed: boolean }>>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Resolver companyId si sólo viene company (slug)
  useEffect(() => {
    (async () => {
      if (companyId || !companySlug) return;

      try {
        const r1 = await fetch(`/api/admin/company?company=${encodeURIComponent(companySlug)}`, { cache: "no-store" });
        if (r1.ok) {
          const j = await r1.json();
          const maybeId = j?.id || j?.companyId || j?.Company?.id || j?.data?.id;
          if (maybeId) { setCompanyId(maybeId); setErrorMsg(null); return; }
        }
      } catch {}

      try {
        const r2 = await fetch("/api/companies", { cache: "no-store" });
        if (r2.ok) {
          const list = await r2.json();
          const c = (Array.isArray(list) ? list : []).find(
            (x: any) => x?.slug?.toLowerCase() === companySlug.toLowerCase()
          );
          if (c?.id) { setCompanyId(c.id); setErrorMsg(null); return; }
        }
      } catch {}

      setErrorMsg("No pude resolver el companyId a partir del slug.");
    })();
  }, [companyId, companySlug]);

  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/settings/roles?companyId=${companyId}`).then((r) => r.json()).then(setRoles);

    // catálogos en memoria (UI)
    setMods([
      { key: "purchases", label: "Compras" },
      { key: "inventory", label: "Inventario" },
      { key: "sales", label: "Ventas" },
      { key: "cash", label: "Caja" },
      { key: "customers", label: "Atención a clientes" },
      { key: "settings", label: "Configuración" },
      { key: "reports", label: "Reportes" },
      { key: "catalogs", label: "Catálogos" },
    ]);
    setPerms([
      { key: "read", label: "Leer" },
      { key: "create", label: "Crear" },
      { key: "update", label: "Actualizar" },
      { key: "delete", label: "Eliminar" },
      { key: "approve", label: "Aprobar" },
      { key: "export", label: "Exportar" },
      { key: "admin", label: "Administrar" },
    ]);
  }, [companyId]);

  async function openRole(r: any) {
    setSelected(r);
    setLoading(true);
    const res = await fetch(`/api/settings/roles/${r.id}/permissions`);
    const list = await res.json();
    setItems(list.map((x: any) => ({ module_key: x.module_key, permission_key: x.permission_key, allowed: x.allowed })));
    setLoading(false);
  }

  async function saveRole() {
    if (!selected) return;
    setLoading(true);
    const res = await fetch(`/api/settings/roles/${selected.id}/permissions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    setLoading(false);
    if (!res.ok) alert("Error guardando permisos");
  }

  if (!companyId) return <div className="p-6">{errorMsg ?? "Cargando empresa…"}</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Roles</h1>
      <div className="flex gap-4">
        <div className="w-64 border rounded p-2 h-[480px] overflow-auto">
          {roles.map((r) => (
            <div
              key={r.id}
              className={`px-2 py-1 rounded cursor-pointer ${selected?.id === r.id ? "bg-blue-50" : "hover:bg-gray-50"}`}
              onClick={() => openRole(r)}
            >
              <div className="font-medium text-sm">{r.name}</div>
              <div className="text-xs text-gray-500">{r.description}</div>
            </div>
          ))}
        </div>
        <div className="flex-1 space-y-3">
          {selected ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="font-medium">{selected.name}</h2>
                <button className="px-3 py-1 border rounded" onClick={saveRole} disabled={loading}>
                  {loading ? "Guardando..." : "Guardar"}
                </button>
              </div>
              <PermissionMatrix modules={mods} permissions={perms} value={items} onChange={setItems} />
            </>
          ) : (
            <div className="text-sm text-gray-500">Selecciona un rol</div>
          )}
        </div>
      </div>
    </div>
  );
}
