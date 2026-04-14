'use client';

import { RequireAccess } from '@/components/require-access';
import Link from 'next/link';
import { ClipboardList, Users, FileText, Briefcase, Building2 } from 'lucide-react';

const modules = [
  { label: 'Tareas', href: '/dilesa/tasks', icon: ClipboardList, color: 'bg-blue-500/10 text-blue-500' },
  { label: 'Juntas', href: '/dilesa/juntas', icon: Users, color: 'bg-violet-500/10 text-violet-500' },
  { label: 'Documentos', href: '/dilesa/documentos', icon: FileText, color: 'bg-amber-500/10 text-amber-500' },
  { label: 'Empleados', href: '/dilesa/rh/empleados', icon: Users, color: 'bg-emerald-500/10 text-emerald-500' },
  { label: 'Puestos', href: '/dilesa/rh/puestos', icon: Briefcase, color: 'bg-cyan-500/10 text-cyan-500' },
  { label: 'Departamentos', href: '/dilesa/rh/departamentos', icon: Building2, color: 'bg-rose-500/10 text-rose-500' },
];

export default function DilesaPage() {
  return (
    <RequireAccess empresa="dilesa">
      <div className="space-y-6">
        <section className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-inset ring-[var(--border)]">
              <img src="/logos/dilesa-header.jpg" alt="DILESA" className="h-full w-full rounded-lg object-contain" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text)]/45">DILESA</div>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--text)]">Panel DILESA</h1>
              <p className="mt-1 text-sm text-[var(--text)]/60">Administración, recursos humanos y documentos de DILESA.</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((mod) => (
            <Link
              key={mod.href}
              href={mod.href}
              className="group flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:border-[var(--accent)]/40 hover:shadow-md"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${mod.color}`}>
                <mod.icon className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium text-[var(--text)] group-hover:text-[var(--accent)]">{mod.label}</span>
            </Link>
          ))}
        </section>
      </div>
    </RequireAccess>
  );
}
