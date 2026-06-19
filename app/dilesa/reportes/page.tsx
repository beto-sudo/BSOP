'use client';

/**
 * @module Reportes (DILESA) · hub-índice
 * @responsive desktop-only
 *
 * Hub-índice de reportes (ADR-047): catálogo + buscador de TODOS los reportes
 * disponibles, filtrados por RBAC. Cada tarjeta es un deep-link a donde vive el
 * reporte (en su módulo). Es «el índice del libro», no una bodega: los reportes
 * de un módulo viven en su módulo; aquí solo se descubren.
 *
 * Gate: módulo `dilesa.reportes`.
 */
import { BarChart3 } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { usePermissions } from '@/components/providers';
import { ReporteCatalogo } from '@/components/dilesa/reportes/reporte-catalogo';
import { REPORTES } from '@/lib/dilesa/reportes/registry';

export default function ReportesHubPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.reportes">
      <ReportesHubBody />
    </RequireAccess>
  );
}

function ReportesHubBody() {
  const { permissions } = usePermissions();
  const visibles = REPORTES.filter(
    (r) => permissions.isAdmin || permissions.modulos.get(r.modulo.slug)?.read === true
  );

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Reportes</h1>
          <p className="text-sm text-[var(--text)]/60">
            Reportes operativos de DILESA. Ábrelos, ajústalos con filtros y expórtalos a PDF.
          </p>
        </div>
      </header>

      <ReporteCatalogo
        reportes={visibles}
        emptyHint="No hay reportes disponibles para tu rol todavía."
      />
    </div>
  );
}
