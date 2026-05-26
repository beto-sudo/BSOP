'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { ClipboardList } from 'lucide-react';

/**
 * @module Proyectos · Anteproyectos (DILESA)
 * @responsive desktop-only
 *
 * Skeleton del Sprint 1 (iniciativa `dilesa-proyectos-anteproyectos`).
 * El UI real (listado conectado a `dilesa.anteproyectos` + análisis
 * financiero desde `v_anteproyectos_analisis` + checklist por plantilla
 * + presupuestos preliminares + conversión a proyecto) se construye en
 * Sprints 2-4 — ver `docs/planning/dilesa-proyectos-anteproyectos.md`.
 *
 * Por ahora la página solo señala el alcance y el estado para que la
 * navegación funcione end-to-end desde el día del refactor.
 */
export default function AnteproyectosPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.proyectos.anteproyectos">
      <DesktopOnlyNotice module="Anteproyectos" />
      <div className="hidden space-y-6 p-4 sm:block sm:p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Anteproyectos</h1>
          <p className="text-sm text-muted-foreground">
            Evaluación de viabilidad de nuevos desarrollos antes de su arranque formal como
            proyecto.
          </p>
        </div>

        <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <div className="flex items-center gap-3 p-6 pb-3">
            <div className="rounded-lg bg-muted p-2">
              <ClipboardList className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold leading-none tracking-tight">
                UI en construcción
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                El módulo se construye en los siguientes sprints de la iniciativa.
              </p>
            </div>
          </div>
          <div className="space-y-3 px-6 pb-6 text-sm text-muted-foreground">
            <p>Lo que viene en próximos sprints:</p>
            <ul className="ml-5 list-disc space-y-1">
              <li>
                <strong>Sprint 2</strong> — listado de anteproyectos con filtros, KPIs reactivos y
                detalle con análisis financiero conectado a la vista existente{' '}
                <code>dilesa.v_anteproyectos_analisis</code>.
              </li>
              <li>
                <strong>Sprint 3</strong> — plantilla canónica de 35 tareas (trámites, estudios,
                cotizaciones), checklist auto-instanciado por anteproyecto con dependencias y fechas
                objetivo en calendario hábil MX, presupuestos preliminares ligables a tareas.
              </li>
              <li>
                <strong>Sprint 4</strong> — conversión anteproyecto → proyecto (gated por tarea
                &quot;Aprobación de Comité de Inversión&quot;) que rehoga tareas y snapshot-copia
                presupuestos autorizados al modelo de control del proyecto.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </RequireAccess>
  );
}
