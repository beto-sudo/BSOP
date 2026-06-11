'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Building2,
  ClipboardList,
  DollarSign,
  FileText,
  FolderKanban,
  HandCoins,
  HardHat,
  House,
  Landmark,
  LayoutGrid,
  MapPin,
  Package,
  Receipt,
  ShoppingCart,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { usePermissions } from '@/components/providers';
import { canSeeNavRoute } from '@/lib/permissions';
import { NAV_ITEMS } from '@/components/app-shell/nav-config';

type ModulePresentation = { icon: LucideIcon; color: string };

/**
 * Presentación (icono + color) por href de módulo DILESA.
 *
 * La ESTRUCTURA del panel — qué módulos existen, en qué sección y con qué
 * label — NO se define aquí: se deriva de `NAV_ITEMS` (la misma fuente que
 * alimenta el sidebar). Así el panel queda sincronizado solo cuando se libera
 * un módulo nuevo, en vez de ser un lugar extra que actualizar a mano (ver
 * ADR-014). Un href sin entrada en este mapa todavía aparece en el panel, con
 * `DEFAULT_PRESENTATION` — visible aunque sin icono dedicado.
 */
const MODULE_PRESENTATION: Record<string, ModulePresentation> = {
  '/dilesa/admin/tasks': { icon: ClipboardList, color: 'bg-blue-500/10 text-blue-500' },
  '/dilesa/admin/juntas': { icon: Users, color: 'bg-violet-500/10 text-violet-500' },
  '/dilesa/admin/documentos': { icon: FileText, color: 'bg-amber-500/10 text-amber-500' },
  '/dilesa/cobranza': { icon: HandCoins, color: 'bg-lime-500/10 text-lime-500' },
  '/dilesa/cxp': { icon: Receipt, color: 'bg-red-500/10 text-red-500' },
  '/dilesa/saldos-bancos': { icon: Landmark, color: 'bg-sky-500/10 text-sky-500' },
  '/dilesa/rh/personal': { icon: Users, color: 'bg-emerald-500/10 text-emerald-500' },
  '/dilesa/rh/puestos': { icon: Briefcase, color: 'bg-cyan-500/10 text-cyan-500' },
  '/dilesa/rh/departamentos': { icon: Building2, color: 'bg-rose-500/10 text-rose-500' },
  '/dilesa/proveedores': { icon: ShoppingCart, color: 'bg-orange-500/10 text-orange-500' },
  '/dilesa/compras': { icon: Package, color: 'bg-fuchsia-500/10 text-fuchsia-500' },
  '/dilesa/portafolio': { icon: FolderKanban, color: 'bg-indigo-500/10 text-indigo-500' },
  '/dilesa/proyectos': { icon: MapPin, color: 'bg-teal-500/10 text-teal-500' },
  '/dilesa/ventas': { icon: DollarSign, color: 'bg-green-500/10 text-green-500' },
  '/dilesa/construccion': { icon: HardHat, color: 'bg-yellow-500/10 text-yellow-500' },
  '/dilesa/ruv': { icon: House, color: 'bg-purple-500/10 text-purple-500' },
};

const DEFAULT_PRESENTATION: ModulePresentation = {
  icon: LayoutGrid,
  color: 'bg-slate-500/10 text-slate-500',
};

/** Secciones de DILESA tal como las define el sidebar (fuente única). */
const DILESA_SECTIONS = NAV_ITEMS.find((item) => item.href === '/dilesa')?.sections ?? [];

/**
 * @module DILESA (landing)
 * @responsive responsive
 */
export default function DilesaPage() {
  const { permissions } = usePermissions();

  // Construye las tarjetas desde NAV_ITEMS y filtra por los permisos del
  // usuario efectivo — misma lógica que el sidebar (canAccessModulo sobre
  // ROUTE_TO_MODULE). Durante "Viendo como" esto oculta los módulos que el
  // usuario impersonado no puede ver. Admin y estado de carga muestran todo.
  const visibleGroups = useMemo(() => {
    const showAll = permissions.loading || permissions.isAdmin;
    return DILESA_SECTIONS.map((section) => ({
      title: section.label,
      items: section.children
        .filter((child) => showAll || canSeeNavRoute(permissions, child.href))
        .map((child) => ({
          label: child.label,
          href: child.href,
          ...(MODULE_PRESENTATION[child.href] ?? DEFAULT_PRESENTATION),
        })),
    })).filter((group) => group.items.length > 0);
  }, [permissions]);

  return (
    <RequireAccess empresa="dilesa">
      <div className="space-y-6">
        <section className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-inset ring-[var(--border)]">
              <img
                src="/brand/dilesa/isotipo.png"
                alt="DILESA"
                className="h-full w-full rounded-lg object-contain"
              />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text)]/45">
                DILESA
              </div>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--text)]">
                Panel DILESA
              </h1>
              <p className="mt-1 text-sm text-[var(--text)]/60">
                Administración, tesorería, recursos humanos, compras e inmobiliario de DILESA.
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
