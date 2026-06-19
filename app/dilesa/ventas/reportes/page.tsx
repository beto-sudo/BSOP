/**
 * @module Ventas · Reportes (DILESA)
 * @responsive desktop-only
 *
 * Tab «Reportes» del hub Ventas (ADR-047): catálogo de los reportes que viven
 * en Ventas. El reporte vive en su módulo (aquí), no en un módulo central; el
 * hub-índice global (`/dilesa/reportes`) solo lo descubre y enlaza.
 *
 * Gate: sub-slug `dilesa.ventas.reportes` (ADR-030 SS5).
 */
import { FileBarChart } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { ReporteCatalogo } from '@/components/dilesa/reportes/reporte-catalogo';
import { MODULO_VENTAS_REPORTES, reportesDeModulo } from '@/lib/dilesa/reportes/registry';

export default function VentasReportesPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.reportes">
      <div className="space-y-6 p-6">
        <header className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <FileBarChart className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
              Reportes de Ventas
            </h1>
            <p className="text-sm text-[var(--text)]/60">
              Cortes operativos del proceso de comercialización, listos para ver y exportar.
            </p>
          </div>
        </header>

        <ReporteCatalogo reportes={reportesDeModulo(MODULO_VENTAS_REPORTES)} />
      </div>
    </RequireAccess>
  );
}
