'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { z } from 'zod';

import { registrarMovimiento } from '@/app/rdb/cortes/actions';
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
import { Form, FormActions, FormField, useFormContext, useZodForm } from '@/components/forms';

import { TIPO_MOVIMIENTO_OPTIONS } from './types';

type Props = {
  corteId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
};

const RegistrarSchema = z.object({
  tipo_detalle: z.string().min(1, 'Selecciona un tipo de movimiento'),
  monto: z
    .string()
    .min(1, 'Captura el monto')
    .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, 'Monto debe ser mayor a 0'),
  concepto: z.string().trim().min(1, 'Captura el concepto'),
});

type RegistrarValues = z.infer<typeof RegistrarSchema>;

const registrarDefaults: RegistrarValues = {
  tipo_detalle: '',
  monto: '',
  concepto: '',
};

export function RegistrarMovimientoDialog({ corteId, open, onOpenChange, onSuccess }: Props) {
  const toast = useToast();

  const form = useZodForm({
    schema: RegistrarSchema,
    defaultValues: registrarDefaults,
  });

  React.useEffect(() => {
    if (open) form.reset(registrarDefaults);
  }, [open, form]);

  const handleSubmit = async (values: RegistrarValues) => {
    const selected = TIPO_MOVIMIENTO_OPTIONS.find((o) => o.tipo_detalle === values.tipo_detalle);
    if (!selected) return;
    try {
      await registrarMovimiento({
        corte_id: corteId,
        tipo: selected.tipo,
        tipo_detalle: selected.tipo_detalle,
        monto: Number(values.monto),
        concepto: values.concepto.trim(),
      });
      toast.add({ title: 'Movimiento registrado', type: 'success' });
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al registrar';
      toast.add({ title: 'Error al registrar movimiento', description: msg, type: 'error' });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !form.formState.isSubmitting) onOpenChange(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar movimiento</DialogTitle>
          <DialogDescription>
            Entrada o salida manual de caja durante el turno abierto.
          </DialogDescription>
        </DialogHeader>

        <Form form={form} onSubmit={handleSubmit} className="space-y-4 py-2">
          <TipoMovimientoField />
          <MontoConDireccionField />

          <FormField name="concepto" label="Concepto">
            {(field) => (
              <Textarea
                {...field}
                id={field.id}
                aria-invalid={field.invalid || undefined}
                aria-describedby={field.describedBy}
                rows={2}
                placeholder="Describe el movimiento…"
              />
            )}
          </FormField>

          <DialogFooter>
            <FormActions
              cancelLabel="Cancelar"
              submitLabel="Registrar"
              submittingLabel="Registrando..."
              submitIcon={<Plus className="h-4 w-4" />}
              onCancel={() => onOpenChange(false)}
              className="border-t-0 pt-0"
            />
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Tipo selector with conceptoDefault cascade: when the user picks a tipo
 * whose option has a `conceptoDefault`, prefill `concepto` if the field is
 * empty or still showing the previous default. Mirrors the original
 * useRef-based behaviour with RHF's `setValue` / `watch`.
 */
function TipoMovimientoField() {
  const { setValue, getValues } = useFormContext<RegistrarValues>();
  const prevConceptoDefaultRef = React.useRef<string | undefined>(undefined);

  const handleChange = (next: string) => {
    setValue('tipo_detalle', next, { shouldDirty: true, shouldValidate: true });
    const nextOpt = TIPO_MOVIMIENTO_OPTIONS.find((o) => o.tipo_detalle === next);
    const concepto = getValues('concepto');
    const prevDefault = prevConceptoDefaultRef.current;
    const conceptoIsEmpty = !concepto.trim();
    const conceptoMatchesPrevDefault = prevDefault ? concepto === prevDefault : false;
    if (nextOpt?.conceptoDefault && (conceptoIsEmpty || conceptoMatchesPrevDefault)) {
      setValue('concepto', nextOpt.conceptoDefault, { shouldDirty: true });
    }
    prevConceptoDefaultRef.current = nextOpt?.conceptoDefault;
  };

  return (
    <FormField name="tipo_detalle" label="Tipo de movimiento" required>
      {(field) => {
        const selected = TIPO_MOVIMIENTO_OPTIONS.find((o) => o.tipo_detalle === field.value);
        return (
          <>
            <Select value={field.value} onValueChange={handleChange}>
              <SelectTrigger id={field.id} aria-describedby={field.describedBy} className="w-full">
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
            <p className="min-h-4 text-xs text-muted-foreground">{selected?.descripcion ?? ' '}</p>
          </>
        );
      }}
    </FormField>
  );
}

/**
 * Monto field with a "+ entrada" / "– salida" badge derived from the tipo
 * that's currently selected. Reads `tipo_detalle` from form context.
 */
function MontoConDireccionField() {
  const { watch } = useFormContext<RegistrarValues>();
  const tipoDetalle = watch('tipo_detalle');
  const selected = TIPO_MOVIMIENTO_OPTIONS.find((o) => o.tipo_detalle === tipoDetalle);
  const direccion = selected?.tipo;

  return (
    <FormField name="monto" label={<MontoLabel direccion={direccion} />} required>
      {(field) => (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            $
          </span>
          <Input
            {...field}
            id={field.id}
            aria-invalid={field.invalid || undefined}
            aria-describedby={field.describedBy}
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            className="pl-7 text-lg font-medium"
          />
        </div>
      )}
    </FormField>
  );
}

function MontoLabel({ direccion }: { direccion: 'entrada' | 'salida' | undefined }) {
  return (
    <span className="flex items-center justify-between gap-2">
      <span>Monto</span>
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
    </span>
  );
}
