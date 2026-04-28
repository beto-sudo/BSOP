import { AlertTriangle, Loader2, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Combobox } from '@/components/ui/combobox';
import { formatCurrency, formatDateTime } from './helpers';
import type { Caja } from './types';

export type AbrirForm = {
  caja_id: string;
  responsable_apertura: string;
  fecha_operativa: string;
  auto_matched: boolean;
  // Efectivo inicial heredado del cierre del corte anterior. Es display-only:
  // el server action `abrirCaja` recalcula al abrir y usa su propio valor.
  efectivo_heredado_monto: number;
  efectivo_heredado_es_heredado: boolean;
  efectivo_heredado_previo_sin_contar: boolean;
  efectivo_heredado_cerrado_at: string | null;
  efectivo_heredado_cargando: boolean;
};

export function AbrirCajaDialog({
  open,
  onOpenChange,
  cajas,
  form,
  onCajaChange,
  onSubmit,
  isPending,
  error,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cajas: Caja[];
  form: AbrirForm;
  onCajaChange: (cajaId: string) => void;
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Abrir Caja</DialogTitle>
          <DialogDescription>
            Registra la apertura de un nuevo turno de caja. Se verificará que no haya un turno
            abierto para la caja seleccionada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <div className="grid grid-cols-2 gap-4 text-sm border bg-muted/30 p-3 rounded-lg">
            <div className="space-y-1">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Responsable
              </div>
              <div className="font-medium text-foreground">{form.responsable_apertura || '—'}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Fecha Operativa
              </div>
              <div className="font-medium text-foreground">{form.fecha_operativa}</div>
            </div>
            <div className="space-y-1 col-span-2">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Caja Asignada
              </div>
              {form.auto_matched ? (
                <div className="font-medium text-foreground">
                  {cajas.find((c) => c.id === form.caja_id)?.nombre || '—'}
                </div>
              ) : (
                <Combobox
                  value={form.caja_id}
                  onChange={(v) => onCajaChange(v)}
                  options={cajas.map((caja) => ({ value: caja.id, label: caja.nombre }))}
                  placeholder="Selecciona tu caja…"
                  allowClear
                  className="mt-1 border-muted-foreground/30 bg-background"
                />
              )}
            </div>
          </div>

          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Efectivo inicial
            </label>
            <div className="rounded-md border bg-muted/40 px-3 py-2.5">
              {form.efectivo_heredado_cargando ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Calculando…
                </div>
              ) : (
                <div className="text-lg font-semibold tabular-nums text-foreground">
                  {formatCurrency(form.efectivo_heredado_monto)}
                </div>
              )}
            </div>
            {!form.efectivo_heredado_cargando &&
              (form.efectivo_heredado_previo_sin_contar ? (
                <p className="flex items-start gap-1.5 text-[11px] text-yellow-700 dark:text-yellow-400">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  El turno anterior cerró sin contar efectivo. Inicia en $0.00 — confírmalo con el
                  responsable.
                </p>
              ) : form.efectivo_heredado_es_heredado ? (
                <p className="text-[11px] text-muted-foreground">
                  Heredado del cierre del turno anterior
                  {form.efectivo_heredado_cerrado_at
                    ? ` · ${formatDateTime(form.efectivo_heredado_cerrado_at)}`
                    : ''}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Primer turno registrado para esta caja — inicia en $0.00.
                </p>
              ))}
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Abriendo…
              </>
            ) : (
              <>
                <PlusCircle className="mr-2 h-4 w-4" />
                Abrir turno
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
