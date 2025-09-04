// app/(app)/settings/admin/page.tsx
import { supabaseServer } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";

function isSuperadminEmail(email?: string | null) {
  const raw = process.env.BSOP_SUPERADMINS || "";
  const list = raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

export const revalidate = 0;

export default async function Page() {
  const supa = supabaseServer();
  const { data: auth } = await supa.auth.getUser();
  const user = auth.user;
  if (!user) redirect("/signin?redirect=/settings/admin");
  if (!isSuperadminEmail(user.email)) redirect("/");

  return (
    <main className="p-6">
      <h1 className="text-base font-semibold mb-4">Panel de superadmin</h1>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li>
          <a href="/settings/access" className="block rounded-2xl border p-4 hover:bg-[var(--brand-50)]">
            <div className="text-sm font-semibold">Accesos</div>
            <div className="text-xs text-slate-600 mt-1">
              Asignar/remover acceso de usuarios a empresas.
            </div>
          </a>
        </li>
        <li>
          <a href="/settings/users" className="block rounded-2xl border p-4 hover:bg-[var(--brand-50)]">
            <div className="text-sm font-semibold">Usuarios</div>
            <div className="text-xs text-slate-600 mt-1">Listado y estados.</div>
          </a>
        </li>
        <li>
          <a href="/settings/roles" className="block rounded-2xl border p-4 hover:bg-[var(--brand-50)]">
            <div className="text-sm font-semibold">Roles</div>
            <div className="text-xs text-slate-600 mt-1">Roles y permisos.</div>
          </a>
        </li>
        <li>
          <a href="/companies" className="block rounded-2xl border p-4 hover:bg-[var(--brand-50)]">
            <div className="text-sm font-semibold">Empresas</div>
            <div className="text-xs text-slate-600 mt-1">Directorio de empresas.</div>
          </a>
        </li>
      </ul>
    </main>
  );
}
