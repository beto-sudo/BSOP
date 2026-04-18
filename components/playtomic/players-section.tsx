import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CancellationAnalysis } from './derivations';
import type { ComputedPlayer, PlayerSortKey } from './types';
import { formatMoney } from './utils';

export function PlayersSection({
  topPlayers,
  playerQuery,
  onPlayerQueryChange,
  playerSort,
  onPlayerSortChange,
  cancellationAnalysis,
}: {
  topPlayers: ComputedPlayer[];
  playerQuery: string;
  onPlayerQueryChange: (value: string) => void;
  playerSort: PlayerSortKey;
  onPlayerSortChange: (value: PlayerSortKey) => void;
  cancellationAnalysis: CancellationAnalysis;
}) {
  return (
    <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <div className="space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Top jugadores</h2>
            <p className="text-sm text-[var(--text)]/55">Ranking operable con búsqueda y orden.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={playerQuery}
              onChange={(event) => onPlayerQueryChange(event.target.value)}
              placeholder="Buscar jugador o correo…"
              className="sm:w-64"
            />
            <Select
              value={playerSort}
              onValueChange={(value) => onPlayerSortChange(value as PlayerSortKey)}
            >
              <SelectTrigger className="sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gasto">Ordenar por gasto</SelectItem>
                <SelectItem value="reservas">Ordenar por reservas</SelectItem>
                <SelectItem value="name">Ordenar por nombre</SelectItem>
                <SelectItem value="sport">Ordenar por deporte</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jugador</TableHead>
                <TableHead>Reservas</TableHead>
                <TableHead className="text-right">Gasto estimado</TableHead>
                <TableHead>Deporte favorito</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topPlayers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-[var(--text)]/50">
                    No hay jugadores para el filtro actual.
                  </TableCell>
                </TableRow>
              ) : (
                topPlayers.slice(0, 10).map((player) => (
                  <TableRow key={`${player.email ?? 'sin-correo'}-${player.name ?? 'sin-nombre'}`}>
                    <TableCell>
                      <div className="font-medium text-[var(--text)]">
                        {player.name ?? 'Sin nombre'}
                      </div>
                    </TableCell>
                    <TableCell>{player.reservas}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatMoney(player.gasto)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{player.favorite_sport ?? '—'}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] self-start">
        <div className="border-b border-[var(--border)] px-4 py-4 sm:px-5">
          <h3 className="text-base font-semibold text-[var(--text)]">Top canceladores</h3>
          <p className="text-sm text-[var(--text)]/55">
            Jugadores con al menos 2 cancelaciones dentro del periodo.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Total Reservas</TableHead>
              <TableHead>Canceladas</TableHead>
              <TableHead className="text-right">Tasa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cancellationAnalysis.topCancelers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-[var(--text)]/50">
                  No hay jugadores con 2 o más cancelaciones en este periodo.
                </TableCell>
              </TableRow>
            ) : (
              cancellationAnalysis.topCancelers.map((player) => (
                <TableRow key={player.ownerId}>
                  <TableCell className="font-medium text-[var(--text)]">
                    {player.name ?? 'Sin nombre'}
                  </TableCell>
                  <TableCell>{player.totalBookings}</TableCell>
                  <TableCell>{player.canceledBookings}</TableCell>
                  <TableCell className="text-right font-medium text-rose-600 dark:text-rose-300">
                    {player.cancellationRate.toFixed(1)}%
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
