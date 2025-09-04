// app/(app)/settings/access/ui.tsx
"use client";
import { useEffect, useMemo, useState } from "react";

type Company = { id: string; name: string; slug: string };
type User = { id: string; email: string; first_name?: string; last_name?: string; is_active: boolean };
type Membership = { company_id: string; user_id: string };

export default function AccessClient() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [mset, setMset] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  async function load() {
    const r = await fetch("/api/admin/memberships", { cache: "no-store" });
    if (!r.ok) {
      alert("No tienes permiso o hubo un error.");
      return;
    }
    const j = await r.json();
    setCompanies(j.companies ?? []);
    setUsers(j.users ?? []);
    setMset(new Set((j.memberships ?? []).map((m: Membership) => `${m.user_id}:${m.company_id}`)));
  }

  useEffect(() => { load(); }, []);

  const filteredUsers = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t
      ? users.filter(u => (u.email || "").toLowerCase().includes(t) || (u.first_name || "").toLowerCase().includes(t) || (u.last_name || "").toLowerCase().includes(t))
      : users;
  }, [q, users]);

  async function toggle(userId: string, companyId: string) {
    const key = `${userId}:${companyId}`;
    const allow = !mset.has(key);
    // UI optimista
    setMset(prev => {
      const next = new Set(prev);
      if (allow) next.add(key); else next.delete(key);
      return next;
    });
    const r = await fetch("/api/admin/memberships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, companyId, allow }),
    });
    if (!r.ok) {
      // revertir si falló
      setMset(prev => {
        const next = new Set(prev);
        if (allow) next.delete(key); else next.add(key);
        return next;
      });
      alert("No se pudo actualizar (permiso o error del servidor).");
    }
  }

  return (
    <main className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-base font-semibold">Accesos · Usuarios × Empresas</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar usuario…"
          className="rounded-full border px-4 py-2 text-sm w-72"
        />
      </header>

      <div className="rounded-2xl border overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2 w-[280px]">Usuario</th>
              {companies.map(c => (
                <th key={c.id} className="px-3 py-2 text-center whitespace-nowrap">{c.slug}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(u => (
              <tr key={u.id} className="border-t">
                <td className="px-3 py-2">
                  <div className="font-medium">{u.email}</div>
                  <div className="text-xs text-slate-500">
                    {(u.first_name || "") + " " + (u.last_name || "")}
                    {!u.is_active && <span className="ml-2 text-red-500">· inactivo</span>}
                  </div>
                </td>
                {companies.map(c => {
                  const key = `${u.id}:${c.id}`;
                  const checked = mset.has(key);
                  return (
                    <td key={c.id} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(u.id, c.id)}
                        className="h-4 w-4"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr><td className="px-3 py-6 text-slate-500" colSpan={companies.length + 1}>Sin usuarios que coincidan.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
