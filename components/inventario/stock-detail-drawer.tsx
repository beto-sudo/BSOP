'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Pre-existing data-sync pattern (extracted from app/rdb/inventario/page.tsx).
 * The fetch flips loading flags around an awaited query — refactoring changes
 * render semantics; out of scope for this PR.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import { useTriggerPrint } from '@/components/print';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { RDB_EMPRESA_ID, type MovimientoRow, type StockItem } from './types';
import { formatCurrency, formatDate, tipoLabel } from './utils';

export interface StockDetailDrawerProps {
  item: StockItem | null;
  open: boolean;
  onClose: () => void;
}

export function StockDetailDrawer({ item, open, onClose }: StockDetailDrawerProps) {
  const [kardex, setKardex] = useState<MovimientoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const triggerPrint = useTriggerPrint();

  useEffect(() => {
    if (open && item) {
      setLoading(true);
      const supabase = createSupabaseBrowserClient();
      supabase
        .schema('erp')
        .from('movimientos_inventario')
        .select(
          'id, producto_id, tipo_movimiento, cantidad, costo_unitario, referencia_tipo, notas, created_at'
        )
        .eq('empresa_id', RDB_EMPRESA_ID)
        .eq('producto_id', item.id)
        .order('created_at', { ascending: false })
        .limit(500)
        .then(({ data, error }) => {
          if (!error && data) {
            setKardex(data as MovimientoRow[]);
          }
          setLoading(false);
        });
    } else {
      setKardex([]);
    }
  }, [open, item]);

  if (!item) return null;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={item.nombre}
      description={`${item.categoria ?? 'Sin categoría'} · ${item.unidad ?? 'pieza'}`}
      actions={
        <Button variant="outline" size="sm" onClick={triggerPrint}>
          Imprimir
        </Button>
      }
    >
      {/* Membrete solo para impresión */}
      <img
        src="/brand/rdb/header-email.png"
        alt="Membrete Rincón del Bosque"
        className="hidden print:block w-full object-contain mb-6"
      />

      <DetailDrawerContent>
        <div className="space-y-4 pb-6">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
              <div className="text-xs text-muted-foreground">Entradas</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-emerald-600">
                {Number(item.total_entradas).toFixed(2)}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
              <div className="text-xs text-muted-foreground">Vendido</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-destructive">
                {Number(item.total_vendido).toFixed(2)}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
              <div className="text-xs text-muted-foreground">Mermas</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-amber-500">
                {Number(item.total_mermas).toFixed(2)}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
              <div className="text-xs text-muted-foreground">Stock Actual</div>
              <div
                className={`mt-1 text-lg font-semibold tabular-nums${item.bajo_minimo ? ' text-amber-500' : ''}`}
              >
                {item.stock_actual}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
              <div className="text-xs text-muted-foreground">Stock Mínimo</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">
                {item.stock_minimo ?? '—'}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
              <div className="text-xs text-muted-foreground">Costo Unitario</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-muted-foreground">
                {formatCurrency(item.costo_unitario ?? item.ultimo_costo)}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
              <div className="text-xs text-muted-foreground">Valor del Stock</div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                {formatCurrency(item.valor_inventario)}
              </div>
            </div>
          </div>
          {item.bajo_minimo && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Stock por debajo del mínimo
            </div>
          )}
          <div className="mt-8">
            <h3 className="mb-4 text-sm font-medium">Historial de movimientos</h3>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : kardex.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No hay movimientos registrados.
              </div>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[90px]">Fecha</TableHead>
                      <TableHead>Movimiento</TableHead>
                      <TableHead className="text-right">Cant</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kardex.map((mov) => (
                      <TableRow key={mov.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(mov.created_at).split(',')[0]}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="font-medium">
                            {tipoLabel(mov.tipo_movimiento, mov.cantidad)}
                          </div>
                          {mov.notas && (
                            <div className="text-xs text-muted-foreground truncate max-w-[120px]">
                              {mov.notas}
                            </div>
                          )}
                        </TableCell>
                        <TableCell
                          className={[
                            'text-right font-medium tabular-nums',
                            mov.tipo_movimiento === 'entrada' ||
                            (mov.tipo_movimiento === 'ajuste' && mov.cantidad >= 0)
                              ? 'text-emerald-600'
                              : 'text-destructive',
                          ].join(' ')}
                        >
                          {mov.tipo_movimiento === 'entrada' ||
                          (mov.tipo_movimiento === 'ajuste' && mov.cantidad >= 0)
                            ? '+'
                            : '−'}
                          {Math.abs(mov.cantidad)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </DetailDrawerContent>
    </DetailDrawer>
  );
}
