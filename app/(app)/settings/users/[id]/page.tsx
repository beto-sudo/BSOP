"use client";

import { useEffect, useMemo, useState } from "react";
import PermissionMatrix from "@/_components/PermissionMatrix";

type Profile = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  avatar_url: string;
  locale: string;
  is_active: boolean;
};

type Member = {
  member_id: string;
  company_id: string;
  user_id: string;
  email: string;
  full_name: string;
  member_is_active: boolean;
};

export default function UserDetailPage({ params, searchParams }: { params: { id: string }, searchParams: { companyId?: string } }) {
  const userId = params.id;
  const companyId = searchParams.companyId;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [mods, setMods] = useState<Array<{ key: string; label: string }>>([]);
  const [perms, setPerms] = useState<Array<{ key: string; label: string }>>([]);
  const [overrides, setOverrides] = useState<Array<{ module_key: string; permission_key: string; allowed: boolean }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/settings/users/${userId}`).then(r => r.json()).then(setProfile);
    fetch(`/api/settings/users?companyId=${companyId}`).then(r => r.json()).then(res => {
      const row = (res.rows || []).find((x: any) => x.user_id === userId);
      if (row) setMember(row);
    });

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
  }, [companyId, userId]);

  const title = useMemo(() => profile ? (profile.first_name || profile.last_name ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() : profile.email) : "Usuario", [profile]);

  async function saveOverrides() {
    if (!member) return;
    setSaving(true);
    const res = await fetch(`/api/settings/members/${member.member_id}/overrides`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: overrides }),
    });
    setSaving(false);
    if (!res.ok) alert("Error guardando overrides");
  }

  if (!companyId) return <div className="p-6">Falta <code>companyId</code> en la URL.</div>;
  if (!profile || !member) return <div className="p-6">Cargando…</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="text-sm text-gray-500">{profile.email}</div>
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">Overrides de Permisos</h2>
        <PermissionMatrix
          modules={mods}
          permissions={perms}
          value={overrides}
          onChange={setOverrides}
        />
        <div className="flex gap-2">
          <button className="px-3 py-1 border rounded" onClick={saveOverrides} disabled={saving}>
            {saving ? "Guardando..." : "Guardar overrides"}
          </button>
          <button className="px-3 py-1 border rounded" onClick={() => setOverrides([])}>Limpiar</button>
        </div>
      </section>
    </div>
  );
}
