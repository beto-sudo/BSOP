/**
 * Migration to `<DataTable>` (ADR-010) not applied.
 *
 * Reason: the table renders a footer "totals" row with aggregated values
 * across all visible rows. `<DataTable>` v1 has no first-class API for
 * footer/totals (out of scope per the §"Fuera de alcance v1" of the
 * planning doc). Replicating the totals via a separate table or as a
 * card footer would be visually inconsistent with the body rows.
 *
 * Decision logged in docs/planning/data-table.md bitácora 2026-04-27 as
 * a permanent exception.
 */

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ReconciliationResult } from './reconciliation';
import { formatMoney } from './utils';

export function ReconciliationTable({ reconciliation }: { reconciliation: ReconciliationResult }) {
  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Reservas</TableHead>
                <TableHead className="text-right">Revenue Bruto</TableHead>
                <TableHead className="text-right">Pagado</TableHead>
                <TableHead className="text-right">Parcial</TableHead>
                <TableHead className="text-right">Pendiente</TableHead>
                <TableHead className="text-right">N/A</TableHead>
                <TableHead className="text-right">Vía App</TableHead>
                <TableHead className="text-right">Directo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reconciliation.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-[var(--text)]/50">
                    No hay datos de conciliación para este rango.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {reconciliation.rows.map((day) => (
                    <TableRow key={day.fecha}>
                      <TableCell className="font-medium text-[var(--text)]">{day.label}</TableCell>
                      <TableCell className="text-right">{day.totalReservas}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatMoney(day.revenueBruto)}
                      </TableCell>
                      <TableCell className="text-right">{`${day.paid} · ${formatMoney(day.paidRevenue, true)}`}</TableCell>
                      <TableCell className="text-right">{`${day.partialPaid} · ${formatMoney(day.partialRevenue, true)}`}</TableCell>
                      <TableCell className="text-right">{`${day.pending} · ${formatMoney(day.pendingRevenue, true)}`}</TableCell>
                      <TableCell className="text-right">{`${day.notApplicable} · ${formatMoney(day.notApplicableRevenue, true)}`}</TableCell>
                      <TableCell className="text-right">{`${day.appReservas} · ${formatMoney(day.appRevenue, true)}`}</TableCell>
                      <TableCell className="text-right">{`${day.managerReservas} · ${formatMoney(day.managerRevenue, true)}`}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-[var(--panel)]/80 font-semibold">
                    <TableCell className="font-semibold text-[var(--text)]">
                      {reconciliation.totals.label}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {reconciliation.totals.totalReservas}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatMoney(reconciliation.totals.revenueBruto)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{`${reconciliation.totals.paid} · ${formatMoney(reconciliation.totals.paidRevenue, true)}`}</TableCell>
                    <TableCell className="text-right font-semibold">{`${reconciliation.totals.partialPaid} · ${formatMoney(reconciliation.totals.partialRevenue, true)}`}</TableCell>
                    <TableCell className="text-right font-semibold">{`${reconciliation.totals.pending} · ${formatMoney(reconciliation.totals.pendingRevenue, true)}`}</TableCell>
                    <TableCell className="text-right font-semibold">{`${reconciliation.totals.notApplicable} · ${formatMoney(reconciliation.totals.notApplicableRevenue, true)}`}</TableCell>
                    <TableCell className="text-right font-semibold">{`${reconciliation.totals.appReservas} · ${formatMoney(reconciliation.totals.appRevenue, true)}`}</TableCell>
                    <TableCell className="text-right font-semibold">{`${reconciliation.totals.managerReservas} · ${formatMoney(reconciliation.totals.managerRevenue, true)}`}</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      {reconciliation.truncated ? (
        <p className="text-sm text-[var(--text-muted)]">
          Mostrando 60 de {reconciliation.totalDays} días. Los totales reflejan el periodo completo.
        </p>
      ) : null}
    </>
  );
}
