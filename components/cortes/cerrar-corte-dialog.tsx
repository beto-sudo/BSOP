import { ArrowLeft, ArrowRight, Check, Loader2, XCircle } from 'lucide-react';
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
import type { Corte, Voucher } from './types';
import { VoucherUploader } from './voucher-uploader';

type Props = {
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
  // Wizard
  isWizard: boolean;
  step: 1 | 2;
  onNext: () => void;
  onBack: () => void;
  vouchers: Voucher[];
  onVoucherUploaded: (v: Voucher) => void;
  onVoucherRemoved: (id: string) => void;
};

function Stepper({ step }: { step: 1 | 2 }) {
  const steps = [
    { n: 1 as const, label: 'Conteo' },
    { n: 2 as const, label: 'Vouchers' },
  ];
  return (
    <div className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-2">
          <div
            className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
              step === s.n
                ? 'bg-primary text-primary-foreground'
                : step > s.n
                  ? 'bg-primary/20 text-primary'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {step > s.n ? <Check className="h-3 w-3" /> : s.n}
          </div>
          <span className={step === s.n ? 'font-medium text-foreground' : 'text-muted-foreground'}>
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="mx-1 text-muted-foreground/40">—</span>}
        </div>
      ))}
    </div>
  );
}

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
  isWizard,
  step,
  onNext,
  onBack,
  vouchers,
  onVoucherUploaded,
  onVoucherRemoved,
}: Props) {
  const titulo =
    isWizard && step === 2
      ? 'Cerrar Corte — Vouchers de terminal'
      : 'Cerrar Corte — Conteo de Efectivo';

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onOpenChange(false);
      }}
    >
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            {corte?.corte_nombre} · {corte?.caja_nombre}
          </DialogDescription>
          {isWizard && (
            <div className="mt-2">
              <Stepper step={step} />
            </div>
          )}
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 pr-2">
          {(!isWizard || step === 1) && (
            <div className="space-y-4 py-2">
              {/* Referencia */}
              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
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
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Billetes
                </div>
                <div className="space-y-1.5">
                  {denominaciones
                    .filter((d) => d.tipo === 'billete')
                    .map((d) => {
                      const idx = denominaciones.findIndex(
                        (x) => x.denominacion === d.denominacion
                      );
                      return (
                        <div key={d.denominacion} className="flex items-center gap-3">
                          <div className="w-20 text-right text-sm font-medium tabular-nums">
                            {formatCurrency(d.denominacion)}
                          </div>
                          <span className="text-sm text-muted-foreground">×</span>
                          <Input
                            type="number"
                            min="0"
                            value={d.cantidad || ''}
                            onChange={(e) => onUpdateCantidad(idx, e.target.value)}
                            placeholder="0"
                            className="w-20 text-center tabular-nums"
                          />
                          <span className="text-sm text-muted-foreground">=</span>
                          <div className="w-24 text-right text-sm font-medium tabular-nums">
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
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Monedas
                </div>
                <div className="space-y-1.5">
                  {denominaciones
                    .filter((d) => d.tipo === 'moneda')
                    .map((d) => {
                      const idx = denominaciones.findIndex(
                        (x) => x.denominacion === d.denominacion
                      );
                      return (
                        <div key={d.denominacion} className="flex items-center gap-3">
                          <div className="w-20 text-right text-sm font-medium tabular-nums">
                            {formatCurrency(d.denominacion)}
                          </div>
                          <span className="text-sm text-muted-foreground">×</span>
                          <Input
                            type="number"
                            min="0"
                            value={d.cantidad || ''}
                            onChange={(e) => onUpdateCantidad(idx, e.target.value)}
                            placeholder="0"
                            className="w-20 text-center tabular-nums"
                          />
                          <span className="text-sm text-muted-foreground">=</span>
                          <div className="w-24 text-right text-sm font-medium tabular-nums">
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
                  <div className="space-y-1 rounded-lg border bg-card p-3">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">Total contado</span>
                      <span className="text-base font-bold tabular-nums">
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
            </div>
          )}

          {isWizard && step === 2 && corte && (
            <div className="space-y-3 py-2">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <div className="font-medium">
                  Ingresos de tarjeta: {formatCurrency(corte.ingresos_tarjeta)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sube los cierres de lote de las terminales (uno por afiliación). No se puede
                  cerrar el corte sin al menos un voucher adjunto.
                </p>
              </div>

              <VoucherUploader
                corteId={corte.id}
                vouchers={vouchers}
                onUploaded={onVoucherUploaded}
                onRemoved={onVoucherRemoved}
                disabled={isPending}
              />
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="pt-2">
          {isWizard && step === 2 && (
            <Button variant="outline" onClick={onBack} disabled={isPending}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Atrás
            </Button>
          )}

          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>

          {isWizard && step === 1 ? (
            <Button onClick={onNext}>
              Siguiente
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={onSubmit}
              disabled={isPending || (isWizard && vouchers.length === 0)}
              title={
                isWizard && vouchers.length === 0
                  ? 'Sube al menos un voucher de terminal para cerrar.'
                  : undefined
              }
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cerrando…
                </>
              ) : (
                <>
                  <XCircle className="mr-2 h-4 w-4" />
                  Cerrar corte
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
