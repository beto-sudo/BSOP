import { Activity, CircleDollarSign, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KpiCard } from './kpi-card';
import { PendingPaymentsSection } from './pending-payments-section';
import { ReconciliationTable } from './reconciliation-table';
import type { PendingPaymentsResult } from './pending-payments';
import type { ReconciliationResult } from './reconciliation';
import type { PendingBooking } from './types';
import { formatMoney } from './utils';

type SortDir = 'asc' | 'desc';

export function ReconciliationSection({
  reconciliation,
  pendingPayments,
  onExportCsv,
  showPendingDetails,
  onToggleDetails,
  pendingSortKey,
  pendingSortDir,
  pendingOnSort,
  pendingSortData,
}: {
  reconciliation: ReconciliationResult;
  pendingPayments: PendingPaymentsResult;
  onExportCsv: () => void;
  showPendingDetails: boolean;
  onToggleDetails: () => void;
  pendingSortKey: string;
  pendingSortDir: SortDir;
  pendingOnSort: (key: string) => void;
  pendingSortData: (rows: PendingBooking[]) => PendingBooking[];
}) {
  return (
    <section className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">Conciliación de Ingresos</h2>
          <p className="text-sm text-[var(--text)]/55">
            Desglose diario de reservas por estado de pago y origen para cuadrar contra depósitos.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onExportCsv}
          disabled={reconciliation.rows.length === 0}
        >
          Exportar CSV
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Revenue bruto total"
          value={formatMoney(reconciliation.summary.revenueBruto)}
          hint="Solo reservas no canceladas"
          icon={<CircleDollarSign className="h-4 w-4" />}
        />
        <KpiCard
          label="Cobrado vía App"
          value={formatMoney(reconciliation.summary.appRevenue)}
          hint="APP_IOS + APP_ANDROID"
          icon={<Activity className="h-4 w-4" />}
        />
        <KpiCard
          label="Cobrado directo"
          value={formatMoney(reconciliation.summary.managerRevenue)}
          hint="MANAGER + PLAYTOMIC_MANAGER"
          icon={<Users className="h-4 w-4" />}
        />
        <KpiCard
          label="% Cobrado"
          value={
            reconciliation.summary.revenueBruto > 0
              ? `${((1 - reconciliation.summary.pendingRevenue / reconciliation.summary.revenueBruto) * 100).toFixed(1)}%`
              : '—'
          }
          hint="Revenue cobrado vs bruto"
          icon={<Activity className="h-4 w-4" />}
        />
      </div>

      <ReconciliationTable reconciliation={reconciliation} />

      <PendingPaymentsSection
        pendingPayments={pendingPayments}
        showPendingDetails={showPendingDetails}
        onToggleDetails={onToggleDetails}
        pendingSortKey={pendingSortKey}
        pendingSortDir={pendingSortDir}
        pendingOnSort={pendingOnSort}
        pendingSortData={pendingSortData}
      />
    </section>
  );
}
