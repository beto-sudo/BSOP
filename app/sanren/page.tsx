'use client';

import Link from 'next/link';
import { Activity, FlaskConical, Home, ReceiptText, type LucideIcon } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { usePermissions } from '@/components/providers';
import { canSeeNavRoute } from '@/lib/permissions';

type SanrenModule = {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  color: string;
};

const SANREN_MODULES: SanrenModule[] = [
  {
    label: 'Salud',
    description: 'Métricas personales, protocolo y seguimiento de salud.',
    href: '/health',
    icon: Activity,
    color: 'bg-emerald-500/10 text-emerald-500',
  },
  {
    label: 'Péptidos',
    description: 'Sourcing, bitácora y calculadora del protocolo.',
    href: '/peptides',
    icon: FlaskConical,
    color: 'bg-violet-500/10 text-violet-500',
  },
  {
    label: 'Servicios',
    description: 'Recibos de la casa, comprobantes, tendencias y lectura IA.',
    href: '/servicios',
    icon: ReceiptText,
    color: 'bg-sky-500/10 text-sky-500',
  },
];

/**
 * @module SANREN (landing)
 * @responsive responsive
 */
export default function SanrenPage() {
  const { permissions } = usePermissions();
  const visibleModules =
    permissions.loading || permissions.isAdmin
      ? SANREN_MODULES
      : SANREN_MODULES.filter((mod) => canSeeNavRoute(permissions, mod.href));

  return (
    <RequireAccess empresa="sanren">
      <div className="space-y-6">
        <section className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-inset ring-[var(--border)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/sanren/isotipo.png"
                alt="SANREN"
                className="h-full w-full rounded-lg object-contain"
              />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text)]/45">
                SANREN
              </div>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--text)]">
                Panel SANREN
              </h1>
              <p className="mt-1 text-sm text-[var(--text)]/60">
                Salud, protocolo personal y servicios de la casa en un solo panel.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text)]/50">
            Módulos
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleModules.map((mod) => (
              <Link
                key={mod.href}
                href={mod.href}
                className="group flex min-h-32 items-start gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:border-[var(--accent)]/40 hover:shadow-md"
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
                  <span className="mt-1 block text-xs leading-5 text-[var(--text)]/55">
                    {mod.description}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <Home className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-medium text-[var(--text)]">Casa y patrimonio</h2>
              <p className="mt-1 text-xs leading-5 text-[var(--text)]/55">
                Los módulos familiares que todavía no tienen operación activa quedan fuera del menú
                hasta que exista una superficie real que usar.
              </p>
            </div>
          </div>
        </section>
      </div>
    </RequireAccess>
  );
}
