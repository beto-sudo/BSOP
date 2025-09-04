// app/(app)/settings/admin/ui.tsx
"use client";

export default function AdminHome() {
  const cards = [
    {
      href: "/settings/access",
      title: "Accesos",
      desc: "Asignar/remover acceso de usuarios a empresas.",
    },
    {
      href: "/settings/users",
      title: "Usuarios",
      desc: "Listado de usuarios; estados y detalles básicos.",
    },
    {
      href: "/settings/roles",
      title: "Roles",
      desc: "Roles y permisos del sistema.",
    },
    {
      href: "/companies",
      title: "Empresas",
      desc: "Ir al directorio de empresas.",
    },
  ];

  return (
    <main className="p-6">
      <h1 className="text-base font-semibold mb-4">Panel de superadmin</h1>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(c => (
          <li key={c.href}>
            <a
              href={c.href}
              className="block rounded-2xl border p-4 hover:bg-[var(--brand-50)]"
            >
              <div className="text-sm font-semibold">{c.title}</div>
              <div className="text-xs text-slate-600 mt-1">{c.desc}</div>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
