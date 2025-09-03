"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PermissionMatrix from "@/_components/PermissionMatrix";

export default function RolesPage() {
  const sp = useSearchParams();
  const qpCompanyId = sp.get("companyId") || undefined;
  const qpCompany = sp.get("company") || undefined;

  const [companyId, setCompanyId] = useState<string | undefined>(qpCompanyId);
  const [roles, setRoles] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [mods, setMods] = useState<Array<{ key: string; label: string }>>([]);
  const [perms, setPerms] = useState<Array<{ key: string; label: string }>>([]);
  const [items, setItems] = useState<Array<{ module_key: string; permission_key: string; allowed: boolean }>>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Crear rol
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);

  // Resolver companyId si falta
  useEffect(() => {
    if (qpCompanyId && qpCompanyId !== companyId) setCompanyId(qpCompanyId);
  }, [qpCompanyId]);

  useEffect(() => {
    (async () => {
      if (companyId || !qpCompany) return;
      setResolving(true);
      setErrorMsg(null);

      try {
        const r1 = await fetch(`/api/admin/company?company=${encodeURIComponent(qpCompany)}`, { cache: "no-store" });
        if (r1.ok) {
          const j = await r1.json();
          const maybeId = j?.id || j?.companyId || j?.Company?.id || j?.data?.id;
          if (maybeId) {
            setCompanyId(maybeId);
            setResolving(false);
            return;
          }
        }
      } catch {}

      try {
        const r2 = await fetch("/api/companies", { cache: "no-store" });
        if (r2.ok) {
          const list = await r2.json();
          const found = (Array.isArray(list) ? list : []).find(
            (x: any) => x?.slug?.toLowerCase() === qpCompany.toLowerCase()
          );
          if (found?.id) {
            setCompanyId(found.id);
            setResolving(false);
            return;
          }
        }
      } catch {}

      setResolving(false);
      setErrorMsg("No pude resolver el companyId a partir del slug.");
    })();
  }, [companyId, qpCompany]);

  // Cargar roles y catálogos
  const loadRoles = () => {
    if (!companyId) return;
    fetch(`/api/settings/roles?companyId=${companyId}`).then((r) => r.json()).then(setRoles);
  };

  useEffect(() => {
    if (!companyId) return;
    loadRoles();
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

  async function createRole() {
    if (!companyId || !name.trim()) return;
    setCreating(true);
    setCreateMsg(null);
    try {
      const res = await fetch(`/api/settings/roles?companyId=${companyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: desc.trim() }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Error creando rol");
      }
      setCreateMsg("Rol creado.");
      setName("");
      setDesc("");
      loadRoles();
    } catch (e: any) {
      setCreateMsg(e?.message || "No se pudo crear el rol");
    } finally {
      setCreating(false);
    }
  }

  if (!companyId) {
    return <div className="p-6">{errorMsg ?? (resolving ? "Cargando empresa…" : "Cargando empresa…")}</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Roles</h1>

      {/* Crear rol */}
      <div className="border rounded-lg p-3 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nombre</label>
            <input
              className="w-full border rounded px-2 py-1"
              placeholder="Supervisor, Cajero, etc."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Descripción</label>
            <input
              className="w-full border rounded px-2 py-1"
              placeholder="Permisos adecuados para..."
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50"
              onClick={createRole}
              disabled={creating || !name.trim()}
            >
              {creating ? "Creando..." : "Crear rol"}
            </button>
          </div>
        </div>
        {createMsg && <div className="text-sm text-gray-600">{createMsg}</div>}
      </div>

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
          {roles.length === 0 && (
            <div className="text-sm text-gray-500 px-2 py-3">Sin roles aún.</div>
          )}
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
