'use client';

import { useMemo } from 'react';
import { RequireAccess } from '@/components/require-access';
import { usePermissions } from '@/components/providers';
import { canAccessModulo, ROUTE_TO_MODULE } from '@/lib/permissions';
import Link from 'next/link';
import {
  ClipboardList,
  Users,
  FileText,
  Briefcase,
  Building2,
  Truck,
  ShoppingCart,
  PackageCheck,
  Package,
  Boxes,
  Receipt,
  CalendarDays,
  Calculator,
  LayoutDashboard,
} from 'lucide-react';

type ModuleGroup = {
  title: string;
  items: {
    label: string;
    description?: string;
    href: string;
    icon: typeof ClipboardList;
    color: string;
  }[];
};

// Mismo orden y secciones que el sidebar de RDB en `nav-config.ts`. Cuando
// se agregue/quite un módulo, actualizar aquí + sidebar + ROUTE_TO_MODULE
// en `lib/permissions.ts` (ver regla "Liberación de módulo nuevo (RBAC sync)"
// en CLAUDE.md).
const moduleGroups: ModuleGroup[] = [
  {
    title: 'Operativa',
    items: [
      {
        label: 'Home',
        description: 'Dashboard operativo del día',
        href: '/rdb/home',
        icon: LayoutDashboard,
        color: 'bg-violet-500/10 text-violet-500',
      },
    ],
  },
  {
    title: 'Administración',
    items: [
      {
        label: 'Tareas',
        href: '/rdb/admin/tasks',
        icon: ClipboardList,
        color: 'bg-blue-500/10 text-blue-500',
      },
      {
        label: 'Juntas',
        href: '/rdb/admin/juntas',
        icon: Users,
        color: 'bg-violet-500/10 text-violet-500',
      },
      {
        label: 'Documentos',
        href: '/rdb/admin/documentos',
        icon: FileText,
        color: 'bg-amber-500/10 text-amber-500',
      },
    ],
  },
  {
    title: 'Recursos Humanos',
    items: [
      {
        label: 'Personal',
        href: '/rdb/rh/personal',
        icon: Users,
        color: 'bg-emerald-500/10 text-emerald-500',
      },
      {
        label: 'Puestos',
        href: '/rdb/rh/puestos',
        icon: Briefcase,
        color: 'bg-cyan-500/10 text-cyan-500',
      },
      {
        label: 'Departamentos',
        href: '/rdb/rh/departamentos',
        icon: Building2,
        color: 'bg-rose-500/10 text-rose-500',
      },
    ],
  },
  {
    title: 'Compras',
    items: [
      {
        label: 'Proveedores',
        href: '/rdb/proveedores',
        icon: Truck,
        color: 'bg-amber-500/10 text-amber-500',
      },
      {
        label: 'Requisiciones',
        href: '/rdb/requisiciones',
        icon: ClipboardList,
        color: 'bg-sky-500/10 text-sky-500',
      },
      {
        label: 'Órdenes de Compra',
        href: '/rdb/ordenes-compra',
        icon: ShoppingCart,
        color: 'bg-orange-500/10 text-orange-500',
      },
      {
        label: 'Recepciones',
        href: '/rdb/recepciones',
        icon: PackageCheck,
        color: 'bg-teal-500/10 text-teal-500',
      },
    ],
  },
  {
    title: 'Inventario',
    items: [
      {
        label: 'Productos',
        href: '/rdb/productos',
        icon: Package,
        color: 'bg-emerald-500/10 text-emerald-500',
      },
      {
        label: 'Inventario',
        href: '/rdb/inventario',
        icon: Boxes,
        color: 'bg-indigo-500/10 text-indigo-500',
      },
    ],
  },
  {
    title: 'Operaciones',
    items: [
      {
        label: 'Ventas',
        href: '/rdb/ventas',
        icon: Receipt,
        color: 'bg-emerald-500/10 text-emerald-500',
      },
      {
        label: 'Cortes',
        href: '/rdb/cortes',
        icon: Calculator,
        color: 'bg-rose-500/10 text-rose-500',
      },
      {
        label: 'Playtomic',
        href: '/rdb/playtomic',
        icon: CalendarDays,
        color: 'bg-blue-500/10 text-blue-500',
      },
    ],
  },
];

/**
 * @module RDB (landing)
 * @responsive responsive
 */
export default function RdbPage() {
  const { permissions } = usePermissions();

  // Filter cards by the effective user's permissions. When admin is in
  // "Viendo como" preview, this hides modules the impersonated user cannot
  // access — same logic the sidebar uses (canAccessModulo). Modules without
  // a route mapping are shown by default.
  const visibleGroups = useMemo(() => {
    if (permissions.loading) return moduleGroups;
    if (permissions.isAdmin) return moduleGroups;
    return moduleGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const moduloSlug = ROUTE_TO_MODULE[item.href];
          if (!moduloSlug) return true;
          return canAccessModulo(permissions, moduloSlug);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [permissions]);

  return (
    <RequireAccess empresa="rdb">
      <div className="space-y-6">
        <section className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-inset ring-[var(--border)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/rdb/isotipo.png"
                alt="RDB"
                className="h-full w-full rounded-lg object-contain"
              />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text)]/45">
                RINCÓN DEL BOSQUE
              </div>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--text)]">
                Panel RDB
              </h1>
              <p className="mt-1 text-sm text-[var(--text)]/60">
                Operativa diaria, compras, inventario, ventas y administración del deportivo.
              </p>
            </div>
          </div>
        </section>

        {visibleGroups.map((group) => (
          <section key={group.title} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text)]/50">
              {group.title}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {group.items.map((mod) => (
                <Link
                  key={mod.href}
                  href={mod.href}
                  className="group flex items-start gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:border-[var(--accent)]/40 hover:shadow-md"
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${mod.color}`}
                  >
                    <mod.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--text)] group-hover:text-[var(--accent)]">
                      {mod.label}
                    </span>
                    {mod.description ? (
                      <span className="mt-0.5 block text-xs text-[var(--text)]/55">
                        {mod.description}
                      </span>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </RequireAccess>
  );
}
