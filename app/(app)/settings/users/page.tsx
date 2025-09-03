"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

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
  status?: "active" | "pending";
  invitation_url?: string | null;
};

type Role = { id: string; name: string };

export default function UsersPage() {
  const sp = useSearchParams();
  const qpCompanyId = sp.get("companyId") || undefined;
  const qpCompany = sp.get("company") || undefined;

  const [companyId, setCompanyId] = useState<string | undefined>(qpCompanyId);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Invitación
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState<string>("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  // sync companyId si cambia en URL
  useEffect(() => {
    if (qpCompanyId && qpCompanyId !== companyId) setCompanyId(qpCompanyId);
  }, [qpCompanyId]);

  // resolver companyId desde slug
  useEffect(() => {
    (async () => {
      if (companyId || !qpCompany) return;
      setResolving(true); setErrorMsg(null);
      try {
        const r1 = await fetch(`/api/admin/company?company=${encodeURIComponent(qpCompany)}`, { cache: "no-store" });
        if (r1.ok) {
          const j = await r1.json();
          const maybeId = j?.id || j?.companyId || j?.Company?.id || j?.data?.id;
          if (maybeId) { setCompanyId(maybeId); setResolving(false); return; }
        }
      } catch {}
      try {
        const r2 = await fetch("/api/companies", { cache: "no-store" });
        if (r2.ok) {
          const list = await r2.json();
          const c = (Array.isArray(list) ? list : []).find((x: any) => x?.slug?.toLowerCase() === qpCompany.toLowerCase());
          if (c?.id) { setCompanyId(c.id); setResolving(false); return; }
        }
      } catch {}
      setResolving(false);
      setErrorMsg("No pude resolver el companyId a partir del slug.");
    })();
  }, [companyId, qpCompany]);

  // cargar usuarios + pendientes
  const fetchUsers = () => {
    if (!companyId) return;
    setLoading(true);
    fetch(`/api/settings/users?companyId=${companyId}&query=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((res) => {
        setRows(res.rows || []);
        setCount(res.count || 0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, [companyId, q]);

  // cargar roles
  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/settings/roles?companyId=${companyId}`)
      .then((r) => r.json())
      .then((list) => {
        const arr = Array.isArray(list) ? list : [];
        setRoles(arr.map((x: any) => ({ id: x.id, name: x.name })));
        if (arr[0]?.id) setInviteRoleId(arr[0].id);
      })
      .catch(() => setRoles([]));
  }, [companyId]);

  async function sendInvitation() {
    if (!companyId) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      const res = await fetch(`/api/settings/users/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          email: inviteEmail.trim(),
          roleId: inviteRoleId || null,
          // invitedBy: currentUserId // si lo tienes
        }),
      });

      const txt = await res.text();
      let json: any = null; try { json = JSON.parse(txt); } catch {}

      if (!res.ok) {
        throw new Error(json?.error || json || txt || "Error enviando invitación");
      }

      if (json?.invitationUrl) {
        setInviteMsg(`Invitación lista. Link: ${json.invitationUrl}`);
      } else if (json?.warning) {
        setInviteMsg(`Invitación preparada. ${json.warning}`);
      } else {
        setInviteMsg("Invitación enviada.");
      }

      setInviteEmail("");
      fetchUsers(); // refresca lista (ya verás el pendiente)
    } catch (e: any) {
      setInviteMsg(e?.message || "No se pudo enviar la invitación");
    } finally {
      setInviting(false);
    }
  }

  if (!companyId) {
    return <div className="p-6">{errorMsg ?? (resolving ? "Cargando empresa…" : "Cargando empresa…")}</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Usuarios</h1>
        <button className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50" onClick={() => setShowInvite((v) => !v)}>
          {showInvite ? "Cerrar" : "Invitar usuario"}
        </button>
      </div>

      {showInvite && (
        <div className="border rounded-lg p-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email</label>
              <input
                type="email"
                className="w-full border rounded px-2 py-1"
                placeholder="usuario@dominio.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Rol inicial</label>
              <select className="w-full border rounded px-2 py-1" value={inviteRoleId} onChange={(e) => setInviteRoleId(e.target.value)}>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                {roles.length === 0 && <option value="">(sin roles)</option>}
              </select>
            </div>
            <div className="flex items-end">
              <button className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50" onClick={sendInvitation} disabled={inviting || !inviteEmail}>
                {inviting ? "Enviando..." : "Enviar invitación"}
              </button>
            </div>
          </div>
          {inviteMsg && <div className="text-sm text-gray-600">{inviteMsg}</div>}
        </div>
      )}

      <div className="flex gap-2">
        <input className="border rounded px-2 py-1 w-80" placeholder="Buscar por nombre o email" value={q} onChange={(e) => setQ(e.target.value)} />
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
                <td className="px-3 py-2">
                  {r.email}
                  {r.status === "pending" && r.invitation_url && (
                    <div className="text-xs text-blue-600 truncate">
                      <a href={r.invitation_url} target="_blank" rel="noreferrer" className="hover:underline">Link de invitación</a>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.status === "pending" ? "Invitado (pendiente)" : (r.member_is_active ? "Activo" : "Inactivo")}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.user_id ? (
                    <Link href={`/settings/users/${r.user_id}?companyId=${companyId}`} className="text-blue-600 hover:underline">Abrir</Link>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-500">Sin usuarios aún.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-sm text-gray-500">Total: {count}</div>
    </div>
  );
}
