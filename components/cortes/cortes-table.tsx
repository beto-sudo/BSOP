import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SortableHead } from '@/components/ui/sortable-head';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { useSortableTable } from '@/hooks/use-sortable-table';
import { estadoVariant, formatCurrency, formatDateTime } from './helpers';
import type { Corte } from './types';

type SortableTable = ReturnType<typeof useSortableTable>;

export function CortesTable({
  cortes,
  loading,
  onRowClick,
  sortable,
}: {
  cortes: Corte[];
  loading: boolean;
  onRowClick: (corte: Corte) => void;
  sortable: SortableTable;
}) {
  const { sortKey, sortDir, onSort, sortData } = sortable;

  return (
    <div className="rounded-xl border bg-card overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead
              sortKey="caja_nombre"
              label="Caja"
              currentSort={sortKey}
              currentDir={sortDir}
              onSort={onSort}
              className="whitespace-nowrap"
            />
            <SortableHead
              sortKey="corte_nombre"
              label="Corte"
              currentSort={sortKey}
              currentDir={sortDir}
              onSort={onSort}
              className="whitespace-nowrap"
            />
            <SortableHead
              sortKey="hora_inicio"
              label="Inicio"
              currentSort={sortKey}
              currentDir={sortDir}
              onSort={onSort}
              className="whitespace-nowrap"
            />
            <SortableHead
              sortKey="hora_fin"
              label="Fin"
              currentSort={sortKey}
              currentDir={sortDir}
              onSort={onSort}
              className="whitespace-nowrap"
            />
            <SortableHead
              sortKey="pedidos_count"
              label="Pedidos"
              currentSort={sortKey}
              currentDir={sortDir}
              onSort={onSort}
              className="whitespace-nowrap"
            />
            <SortableHead
              sortKey="estado"
              label="Estado"
              currentSort={sortKey}
              currentDir={sortDir}
              onSort={onSort}
              className="whitespace-nowrap"
            />
            <TableHead className="text-right whitespace-nowrap">Efectivo</TableHead>
            <TableHead className="text-right whitespace-nowrap">Tarjeta</TableHead>
            <TableHead className="text-right whitespace-nowrap">Stripe</TableHead>
            <TableHead className="text-right whitespace-nowrap">Transf.</TableHead>
            <SortableHead
              sortKey="total_ingresos"
              label="Total"
              currentSort={sortKey}
              currentDir={sortDir}
              onSort={onSort}
              className="text-right whitespace-nowrap"
            />
            <TableHead className="text-right whitespace-nowrap">Ef. Esperado</TableHead>
            <TableHead className="text-right whitespace-nowrap">Movimientos</TableHead>
            <TableHead className="text-right whitespace-nowrap">Ef. Contado</TableHead>
            <TableHead className="text-right whitespace-nowrap">Diferencia</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 13 }).map((__, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : cortes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={15} className="py-12 text-center text-muted-foreground">
                No se encontraron cortes para el rango seleccionado.
              </TableCell>
            </TableRow>
          ) : (
            sortData(cortes).map((corte) => {
              const movimientosNeto = (corte.depositos ?? 0) - (corte.retiros ?? 0);
              const diferencia =
                corte.efectivo_contado != null
                  ? corte.efectivo_contado - (corte.efectivo_esperado ?? 0)
                  : null;
              return (
                <TableRow
                  key={corte.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onRowClick(corte)}
                >
                  <TableCell className="font-medium whitespace-nowrap">
                    {corte.caja_nombre ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {corte.corte_nombre || `Corte-${corte.id.slice(0, 8)}`}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatDateTime(corte.hora_inicio)}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatDateTime(corte.hora_fin)}
                  </TableCell>
                  <TableCell className="text-sm text-center">{corte.pedidos_count ?? 0}</TableCell>
                  <TableCell>
                    <Badge variant={estadoVariant(corte.estado)}>{corte.estado ?? '—'}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                    {formatCurrency(corte.ingresos_efectivo)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                    {formatCurrency(corte.ingresos_tarjeta)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                    {formatCurrency(corte.ingresos_stripe)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                    {formatCurrency(corte.ingresos_transferencias)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap">
                    {formatCurrency(corte.total_ingresos)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {(corte.efectivo_esperado ?? 0) !== 0
                      ? formatCurrency(corte.efectivo_esperado)
                      : '—'}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums whitespace-nowrap ${
                      movimientosNeto > 0
                        ? 'text-emerald-600'
                        : movimientosNeto < 0
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {movimientosNeto !== 0 ? formatCurrency(movimientosNeto) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {corte.efectivo_contado != null ? formatCurrency(corte.efectivo_contado) : '—'}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums whitespace-nowrap ${
                      diferencia == null
                        ? ''
                        : diferencia > 0
                          ? 'text-emerald-600'
                          : diferencia < 0
                            ? 'text-destructive'
                            : ''
                    }`}
                  >
                    {diferencia == null || diferencia === 0 ? '—' : formatCurrency(diferencia)}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
