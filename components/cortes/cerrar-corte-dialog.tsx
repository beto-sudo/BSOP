import { Loader2, XCircle } from 'lucide-react';
import type { Denominacion } from '@/app/rdb/cortes/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from './helpers';
import type { Corte } from './types';

export function CerrarCorteDialog({
  open,
  onOpenChange,
  corte,
  denominaciones,
  onUpdateCantidad,
  observaciones,
  onObservacionesChange,
  onSubmit,
  isPending,
  error,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  corte: Corte | null;
  denominaciones: Denominacion[];
  onUpdateCantidad: (idx: number, val: string) => void;
  observaciones: string;
  onObservacionesChange: (v: string) => void;
  onSubmit: () => void;
  isPending: boolean;
  error: string | null;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onOpenChange(false);
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Cerrar Corte — Conteo de Efectivo</DialogTitle>
          <DialogDescription>
            {corte?.corte_nombre} · {corte?.caja_nombre}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-2">
          <div className="space-y-4 py-2">
            {/* Referencia */}
            <div className="grid grid-cols-2 gap-3 text-sm border bg-muted/30 p-3 rounded-lg">
              <div>
                <div className="text-xs text-muted-foreground">Efectivo esperado</div>
                <div className="font-semibold tabular-nums">
                  {formatCurrency(corte?.efectivo_esperado)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total sistema</div>
                <div className="font-semibold tabular-nums">
                  {formatCurrency(corte?.total_ingresos)}
                </div>
              </div>
            </div>

            {/* Billetes */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Billetes
              </div>
              <div className="space-y-1.5">
                {denominaciones
                  .filter((d) => d.tipo === 'billete')
                  .map((d) => {
                    const idx = denominaciones.findIndex((x) => x.denominacion === d.denominacion);
                    return (
                      <div key={d.denominacion} className="flex items-center gap-3">
                        <div className="w-20 text-sm font-medium tabular-nums text-right">
                          {formatCurrency(d.denominacion)}
                        </div>
                        <span className="text-muted-foreground text-sm">×</span>
                        <Input
                          type="number"
                          min="0"
                          value={d.cantidad || ''}
                          onChange={(e) => onUpdateCantidad(idx, e.target.value)}
                          placeholder="0"
                          className="w-20 text-center tabular-nums"
                        />
                        <span className="text-muted-foreground text-sm">=</span>
                        <div className="w-24 text-sm tabular-nums text-right font-medium">
                          {d.cantidad > 0 ? formatCurrency(d.denominacion * d.cantidad) : '—'}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            <Separator />

            {/* Monedas */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Monedas
              </div>
              <div className="space-y-1.5">
                {denominaciones
                  .filter((d) => d.tipo === 'moneda')
                  .map((d) => {
                    const idx = denominaciones.findIndex((x) => x.denominacion === d.denominacion);
                    return (
                      <div key={d.denominacion} className="flex items-center gap-3">
                        <div className="w-20 text-sm font-medium tabular-nums text-right">
                          {formatCurrency(d.denominacion)}
                        </div>
                        <span className="text-muted-foreground text-sm">×</span>
                        <Input
                          type="number"
                          min="0"
                          value={d.cantidad || ''}
                          onChange={(e) => onUpdateCantidad(idx, e.target.value)}
                          placeholder="0"
                          className="w-20 text-center tabular-nums"
                        />
                        <span className="text-muted-foreground text-sm">=</span>
                        <div className="w-24 text-sm tabular-nums text-right font-medium">
                          {d.cantidad > 0 ? formatCurrency(d.denominacion * d.cantidad) : '—'}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            <Separator />

            {/* Total contado */}
            {(() => {
              const total = denominaciones.reduce((s, d) => s + d.denominacion * d.cantidad, 0);
              const esperado = corte?.efectivo_esperado ?? 0;
              const diff = total - esperado;
              return (
                <div className="rounded-lg border bg-card p-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">Total contado</span>
                    <span className="font-bold tabular-nums text-base">
                      {formatCurrency(total)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Diferencia vs. esperado</span>
                    <span
                      className={`font-semibold tabular-nums ${
                        diff === 0
                          ? 'text-muted-foreground'
                          : diff > 0
                            ? 'text-emerald-600'
                            : 'text-destructive'
                      }`}
                    >
                      {diff === 0 ? '—' : formatCurrency(diff)}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Observaciones */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Observaciones (opcional)
              </label>
              <Input
                value={observaciones}
                onChange={(e) => onObservacionesChange(e.target.value)}
                placeholder="Ej: Faltante por rollo de monedas..."
              />
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onSubmit} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cerrando…
              </>
            ) : (
              <>
                <XCircle className="mr-2 h-4 w-4" />
                Confirmar cierre
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
