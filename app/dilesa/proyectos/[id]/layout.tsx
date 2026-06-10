'use client';

import { type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { RoutedModuleTabs } from '@/components/module-page';
import { ProyectoBanda } from '@/components/dilesa/proyecto-banda';

/**
 * Layout del detalle de proyecto (DILESA) — routed tabs (ADR-005/ADR-030).
 *
 * Iniciativa `dilesa-flujo-gasto` · Sprint 2: el detalle deja de ser una sola
 * página scroll-larga y gana tabs; "Gasto" es el home del control
 * presupuestal del proyecto (mudado desde Construcción › Costeo, decisión D1).
 *
 *   /dilesa/proyectos/[id]        → tab "Resumen" (la página existente).
 *   /dilesa/proyectos/[id]/gasto  → tab "Gasto" (CosteoModule con proyecto
 *                                    fijo + actividad reciente del gasto).
 *
 * Cada tab lleva su sub-slug; `<RoutedModuleTabs>` esconde tabs sin permiso
 * y el gate duro vive en cada page (ADR-030 SS5). El "Volver a proyectos"
 * vive aquí para que toda tab lo tenga.
 */
export default function ProyectoDetalleLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const base = `/dilesa/proyectos/${id}`;

  return (
    <div>
      <div className="px-4 pt-4 sm:px-6 sm:pt-6">
        <Link
          href="/dilesa/proyectos"
          className="inline-flex items-center gap-1 text-sm text-[var(--text)]/60 hover:text-[var(--text)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a proyectos
        </Link>
      </div>
      <div className="px-4 pt-3 sm:px-6">
        <ProyectoBanda proyectoId={id} />
      </div>
      <div className="px-4 pt-3 sm:px-6">
        <RoutedModuleTabs
          tabs={[
            { label: 'Resumen', href: base, exact: true, module: 'dilesa.proyectos.activos' },
            {
              label: 'Unidades',
              href: `${base}/unidades`,
              module: 'dilesa.proyectos.activos',
            },
            { label: 'Obras', href: `${base}/obras`, module: 'dilesa.proyectos.activos' },
            {
              label: 'Checklist',
              href: `${base}/checklist`,
              module: 'dilesa.proyectos.activos',
            },
            { label: 'Gasto', href: `${base}/gasto`, module: 'dilesa.proyectos.gasto' },
          ]}
        />
      </div>
      {children}
    </div>
  );
}
