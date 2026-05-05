import { Combobox } from '@/components/ui/combobox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DAY_FMT } from './constants';
import type { CoachRow, CoachSortKey } from './types';
import { formatMoney } from './utils';

function formatLastDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return DAY_FMT.format(date);
}

export function CoachesSection({
  coaches,
  sort,
  onSortChange,
}: {
  coaches: CoachRow[];
  sort: CoachSortKey;
  onSortChange: (value: CoachSortKey) => void;
}) {
  return (
    <section className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">Entrenadores</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Ranking de coaches por reservas e ingresos en el periodo. Una reserva con N coaches
            divide el revenue entre ellos.
          </p>
        </div>
        <Combobox
          value={sort}
          onChange={(value) => onSortChange(value as CoachSortKey)}
          options={[
            { value: 'revenue', label: 'Ordenar por ingresos' },
            { value: 'reservas', label: 'Ordenar por reservas' },
            { value: 'jugadores', label: 'Ordenar por jugadores únicos' },
            { value: 'name', label: 'Ordenar por nombre' },
          ]}
          className="sm:w-56"
        />
      </div>
      <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Entrenador</TableHead>
              <TableHead>Reservas</TableHead>
              <TableHead className="text-right">Ingresos</TableHead>
              <TableHead>Jugadores únicos</TableHead>
              <TableHead>Última reserva</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coaches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-[var(--text)]/50">
                  No hay reservas con entrenador en el periodo seleccionado.
                </TableCell>
              </TableRow>
            ) : (
              coaches.map((coach) => (
                <TableRow key={coach.coach_id}>
                  <TableCell>
                    <div className="font-medium text-[var(--text)]">{coach.display_name}</div>
                    {coach.display_name.startsWith('coach_') ? (
                      <div className="text-xs text-[var(--text-muted)]" title={coach.coach_id}>
                        {coach.coach_id.slice(0, 16)}…
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>{coach.reservas}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatMoney(coach.revenue)}
                  </TableCell>
                  <TableCell>{coach.jugadores_unicos}</TableCell>
                  <TableCell className="text-[var(--text-muted)]">
                    {formatLastDate(coach.ultima_reserva)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
