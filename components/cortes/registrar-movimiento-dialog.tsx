'use client';

import { Loader2, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { registrarMovimiento } from '@/app/rdb/cortes/actions';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { TIPO_MOVIMIENTO_OPTIONS } from './types';

type Props = {
  corteId: string;
  defaultRealizadoPor: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
};

export function RegistrarMovimientoDialog({
  corteId,
  defaultRealizadoPor,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const toast = useToast();
  const [tipoDetalle, setTipoDetalle] = useState<string>('');
  const [monto, setMonto] = useState<string>('');
  const [concepto, setConcepto] = useState<string>('');
  const [realizadoPor, setRealizadoPor] = useState<string>(defaultRealizadoPor);
  const [submitting, setSubmitting] = useState(false);
  const prevConceptoDefaultRef = useRef<string | undefined>(undefined);
  const tipoInputRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) {
      setTipoDetalle('');
      setMonto('');
      setConcepto('');
      setRealizadoPor(defaultRealizadoPor);
      prevConceptoDefaultRef.current = undefined;
      queueMicrotask(() => tipoInputRef.current?.focus());
    }
  }, [open, defaultRealizadoPor]);

  const selected = TIPO_MOVIMIENTO_OPTIONS.find((o) => o.tipo_detalle === tipoDetalle);
  const direccion = selected?.tipo;

  function handleTipoChange(next: string | null) {
    const value = next ?? '';
    setTipoDetalle(value);
    const nextOpt = TIPO_MOVIMIENTO_OPTIONS.find((o) => o.tipo_detalle === value);
    const prevDefault = prevConceptoDefaultRef.current;
    const conceptoIsEmpty = !concepto.trim();
    const conceptoMatchesPrevDefault = prevDefault ? concepto === prevDefault : false;
    if (nextOpt?.conceptoDefault && (conceptoIsEmpty || conceptoMatchesPrevDefault)) {
      setConcepto(nextOpt.conceptoDefault);
    }
    prevConceptoDefaultRef.current = nextOpt?.conceptoDefault;
  }

  const montoNum = Number(monto);
  const canSubmit =
    !!selected &&
    Number.isFinite(montoNum) &&
    montoNum > 0 &&
    concepto.trim().length > 0 &&
    realizadoPor.trim().length > 0 &&
    !submitting;

  async function handleSubmit() {
    if (!selected || !canSubmit) return;
    setSubmitting(true);
    try {
      await registrarMovimiento({
        corte_id: corteId,
        tipo: selected.tipo,
        tipo_detalle: selected.tipo_detalle,
        monto: montoNum,
        concepto: concepto.trim(),
        realizado_por_nombre: realizadoPor.trim(),
      });
      toast.add({ title: 'Movimiento registrado', type: 'success' });
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al registrar';
      toast.add({ title: 'Error al registrar movimiento', description: msg, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  const conceptoPlaceholder = selected
    ? (selected.conceptoDefault ?? `Detalle del ${selected.label.toLowerCase()}`)
    : 'Describe el movimiento…';

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !submitting) onOpenChange(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar movimiento</DialogTitle>
          <DialogDescription>
            Entrada o salida manual de caja durante el turno abierto.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="space-y-1.5">
            <label
              htmlFor="mov-tipo"
              className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Tipo de movimiento
            </label>
            <Select value={tipoDetalle} onValueChange={handleTipoChange}>
              <SelectTrigger
                id="mov-tipo"
                ref={tipoInputRef}
                aria-describedby="mov-tipo-help"
                className="w-full"
              >
                <SelectValue placeholder="Seleccionar tipo…" />
              </SelectTrigger>
              <SelectContent>
                {TIPO_MOVIMIENTO_OPTIONS.map((o) => (
                  <SelectItem key={o.tipo_detalle} value={o.tipo_detalle}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id="mov-tipo-help" className="min-h-4 text-xs text-muted-foreground">
              {selected?.descripcion ?? ' '}
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="mov-monto"
                className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                Monto
              </label>
              {direccion && (
                <span
                  className={
                    'text-xs font-medium tabular-nums ' +
                    (direccion === 'salida' ? 'text-destructive' : 'text-emerald-500')
                  }
                >
                  {direccion === 'salida' ? '– salida' : '+ entrada'}
                </span>
              )}
            </div>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="mov-monto"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                className="pl-7 text-lg font-medium"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="mov-concepto"
              className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Concepto
            </label>
            <Textarea
              id="mov-concepto"
              rows={2}
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder={conceptoPlaceholder}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="mov-realizado-por"
              className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Realizado por
            </label>
            <Input
              id="mov-realizado-por"
              value={realizadoPor}
              onChange={(e) => setRealizadoPor(e.target.value)}
              placeholder="Nombre del cajero"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Registrando…
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Registrar
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
