'use client';

/**
 * Shell de un reporte individual (ADR-047): breadcrumb de vuelta al catálogo,
 * encabezado (ícono + nombre + descripción), botón «Exportar PDF» y una barra
 * de filtros. El cuerpo (KPIs + tabla/gráfico) va como children.
 *
 * Es el contenedor reutilizable del patrón «vista»: cada reporte trae su propio
 * cuerpo y arma su `pdfHref` con los filtros actuales, pero la cáscara es común.
 */
import { type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Sheet } from 'lucide-react';
import type { ReporteDef } from '@/lib/dilesa/reportes/tipos';

export function ReporteShell({
  reporte,
  volverHref,
  pdfHref,
  csvHref,
  filtros,
  children,
}: {
  reporte: ReporteDef;
  /** Ruta del catálogo dueño (para el breadcrumb de regreso). */
  volverHref: string;
  /** Link de exportación a PDF (con los filtros actuales). Omitir = sin botón. */
  pdfHref?: string;
  /** Link de exportación a CSV (con los filtros actuales). Omitir = sin botón. */
  csvHref?: string;
  /** Barra de filtros (selects, date-range…). */
  filtros?: ReactNode;
  children: ReactNode;
}) {
  const Icon = reporte.icon;
  return (
    <div className="space-y-6 p-6">
      <Link
        href={volverHref}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--text)]/50 hover:text-[var(--text)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Reportes
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
              {reporte.nombre}
            </h1>
            <p className="max-w-2xl text-sm text-[var(--text)]/60">{reporte.descripcion}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {csvHref ? (
            <a
              href={csvHref}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-medium text-[var(--text)]/80 hover:bg-[var(--bg)]/40"
            >
              <Sheet className="h-4 w-4" />
              Exportar CSV
            </a>
          ) : null}
          {pdfHref ? (
            <a
              href={pdfHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-medium text-[var(--text)]/80 hover:bg-[var(--bg)]/40"
            >
              <Download className="h-4 w-4" />
              Exportar PDF
            </a>
          ) : null}
        </div>
      </header>

      {filtros ? <div className="flex flex-wrap items-center gap-3">{filtros}</div> : null}

      {children}
    </div>
  );
}
