import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableHead } from '@/components/ui/sortable-head';
import type { PendingPaymentsResult } from './pending-payments';
import type { PendingBooking } from './types';
import { formatMoney } from './utils';

type SortDir = 'asc' | 'desc';

export function PendingPaymentsSection({
  pendingPayments,
  showPendingDetails,
  onToggleDetails,
  pendingSortKey,
  pendingSortDir,
  pendingOnSort,
  pendingSortData,
}: {
  pendingPayments: PendingPaymentsResult;
  showPendingDetails: boolean;
  onToggleDetails: () => void;
  pendingSortKey: string;
  pendingSortDir: SortDir;
  pendingOnSort: (key: string) => void;
  pendingSortData: (rows: PendingBooking[]) => PendingBooking[];
}) {
  return (
    <div className="border-t border-[var(--border)] pt-6">
      <div className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--text)]">Resumen por Jugador</h3>
          <p className="text-sm text-[var(--text)]/55">
            Top 20 jugadores con saldo pendiente acumulado.
          </p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
          <div className="max-h-[28rem] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jugador</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Reservas</TableHead>
                  <TableHead className="text-right">Total Pendiente</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingPayments.playerSummary.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-[var(--text)]/50">
                      No hay pagos pendientes en este periodo.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {pendingPayments.playerSummary.slice(0, 20).map((player) => (
                      <TableRow key={`${player.jugador}-${player.email}`}>
                        <TableCell className="font-medium text-[var(--text)]">
                          {player.jugador}
                        </TableCell>
                        <TableCell className="text-[var(--text)]/60">{player.email}</TableCell>
                        <TableCell className="text-right">{player.reservas}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatMoney(player.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-[var(--panel)]/80 font-semibold">
                      <TableCell className="font-semibold text-[var(--text)]">Totales</TableCell>
                      <TableCell className="text-[var(--text)]/60">—</TableCell>
                      <TableCell className="text-right font-semibold">
                        {pendingPayments.totalReservas}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoney(pendingPayments.totalMonto)}
                      </TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)]/35 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-[var(--text)]">
              Detalle de Reservas Pendientes
            </h3>
            <p className="text-sm text-[var(--text)]/55">
              Listado individual de reservas pendientes.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onToggleDetails}>
            {showPendingDetails ? 'Ocultar detalle' : 'Ver detalle'}
          </Button>
        </div>

        {showPendingDetails ? (
          <>
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
              <div className="max-h-[32rem] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead
                        sortKey="fecha"
                        label="Fecha"
                        currentSort={pendingSortKey}
                        currentDir={pendingSortDir}
                        onSort={pendingOnSort}
                      />
                      <SortableHead
                        sortKey="hora"
                        label="Hora"
                        currentSort={pendingSortKey}
                        currentDir={pendingSortDir}
                        onSort={pendingOnSort}
                      />
                      <SortableHead
                        sortKey="cancha"
                        label="Cancha"
                        currentSort={pendingSortKey}
                        currentDir={pendingSortDir}
                        onSort={pendingOnSort}
                      />
                      <SortableHead
                        sortKey="deporte"
                        label="Deporte"
                        currentSort={pendingSortKey}
                        currentDir={pendingSortDir}
                        onSort={pendingOnSort}
                      />
                      <SortableHead
                        sortKey="monto"
                        label="Monto"
                        currentSort={pendingSortKey}
                        currentDir={pendingSortDir}
                        onSort={pendingOnSort}
                        className="text-right"
                      />
                      <SortableHead
                        sortKey="jugador"
                        label="Jugador"
                        currentSort={pendingSortKey}
                        currentDir={pendingSortDir}
                        onSort={pendingOnSort}
                      />
                      <SortableHead
                        sortKey="email"
                        label="Email"
                        currentSort={pendingSortKey}
                        currentDir={pendingSortDir}
                        onSort={pendingOnSort}
                      />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingPayments.detailRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-[var(--text)]/50">
                          No hay reservas pendientes para mostrar.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pendingSortData(pendingPayments.detailRows).map((booking, index) => (
                        <TableRow
                          key={`${booking.fecha}-${booking.hora}-${booking.email}-${index}`}
                        >
                          <TableCell className="font-medium text-[var(--text)]">
                            {booking.fecha}
                          </TableCell>
                          <TableCell>{booking.hora}</TableCell>
                          <TableCell>{booking.cancha}</TableCell>
                          <TableCell>{booking.deporte}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatMoney(booking.monto)}
                          </TableCell>
                          <TableCell>{booking.jugador}</TableCell>
                          <TableCell className="text-[var(--text)]/60">{booking.email}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
            {pendingPayments.detailTruncated ? (
              <p className="text-sm text-[var(--text)]/55">
                Mostrando 200 de {pendingPayments.totalReservas} reservas pendientes.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
