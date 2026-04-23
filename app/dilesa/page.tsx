'use client';

import { RequireAccess } from '@/components/require-access';
import Link from 'next/link';
import {
  ClipboardList,
  Users,
  FileText,
  Briefcase,
  Building2,
  Map,
  House,
  ClipboardCheck,
  Landmark,
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

// Nota: el grupo "Inmobiliario" nace en el sprint dilesa-1 UI.
// Los módulos de Terrenos/Prototipos/Anteproyectos/Proyectos se liberan en
// esta misma rama con páginas de scaffold. Cuando Beto valide visualmente,
// se revoca Coda para el módulo correspondiente.
// Orden de grupos: Administración y RH son módulos maduros y van arriba;
// Inmobiliario se está estabilizando en el sprint dilesa-1 UI y va al final.
const moduleGroups: ModuleGroup[] = [
  {
    title: 'Administración',
    items: [
      {
        label: 'Tareas',
        href: '/dilesa/admin/tasks',
        icon: ClipboardList,
        color: 'bg-blue-500/10 text-blue-500',
      },
      {
        label: 'Juntas',
        href: '/dilesa/admin/juntas',
        icon: Users,
        color: 'bg-violet-500/10 text-violet-500',
      },
      {
        label: 'Documentos',
        href: '/dilesa/admin/documentos',
        icon: FileText,
        color: 'bg-amber-500/10 text-amber-500',
      },
    ],
  },
  {
    title: 'Recursos Humanos',
    items: [
      {
        label: 'Empleados',
        href: '/dilesa/rh/empleados',
        icon: Users,
        color: 'bg-emerald-500/10 text-emerald-500',
      },
      {
        label: 'Puestos',
        href: '/dilesa/rh/puestos',
        icon: Briefcase,
        color: 'bg-cyan-500/10 text-cyan-500',
      },
      {
        label: 'Departamentos',
        href: '/dilesa/rh/departamentos',
        icon: Building2,
        color: 'bg-rose-500/10 text-rose-500',
      },
    ],
  },
  {
    title: 'Inmobiliario',
    items: [
      {
        label: 'Terrenos',
        description: 'Portafolio de tierra pre-desarrollo',
        href: '/dilesa/terrenos',
        icon: Map,
        color: 'bg-emerald-500/10 text-emerald-500',
      },
      {
        label: 'Prototipos',
        description: 'Catálogo de productos habitacionales',
        href: '/dilesa/prototipos',
        icon: House,
        color: 'bg-sky-500/10 text-sky-500',
      },
      {
        label: 'Anteproyectos',
        description: 'Evaluación financiera y decisión',
        href: '/dilesa/anteproyectos',
        icon: ClipboardCheck,
        color: 'bg-orange-500/10 text-orange-500',
      },
      {
        label: 'Proyectos',
        description: 'Desarrollos formalizados',
        href: '/dilesa/proyectos',
        icon: Landmark,
        color: 'bg-indigo-500/10 text-indigo-500',
      },
    ],
  },
];

export default function DilesaPage() {
  return (
    <RequireAccess empresa="dilesa">
      <div className="space-y-6">
        <section className="rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-inset ring-[var(--border)]">
              <img
                src="/logos/dilesa-header.jpg"
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
                Inmobiliario, administración, recursos humanos y documentos de DILESA.
              </p>
            </div>
          </div>
        </section>

        {moduleGroups.map((group) => (
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
