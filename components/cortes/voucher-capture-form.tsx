'use client';

import { AlertTriangle, Sparkles } from 'lucide-react';
import * as React from 'react';
import { z } from 'zod';

import { actualizarCategoriaVoucher, confirmarVoucher } from '@/app/rdb/cortes/actions';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { Form, FormActions, FormField, useFormContext, useZodForm } from '@/components/forms';

import { formatCurrency, formatDateTime } from './helpers';
import type { Banco, Movimiento, Voucher, VoucherCategoria } from './types';

type Props = {
  voucher: Voucher;
  bancos: Banco[];
  movimientos: Movimiento[];
  onSaved: () => void;
};

const CATEGORIA_OPTIONS: { value: VoucherCategoria; label: string }[] = [
  { value: 'voucher_tarjeta', label: 'Voucher tarjeta' },
  { value: 'comprobante_movimiento', label: 'Comprobante movimiento' },
  { value: 'otro', label: 'Otro' },
];

const VoucherSchema = z
  .object({
    categoria: z.enum(['voucher_tarjeta', 'comprobante_movimiento', 'otro']),
    banco_id: z.string().nullable().default(null),
    monto: z.string().default(''),
    afiliacion: z.string().default(''),
    movimiento_id: z.string().nullable().default(null),
  })
  .superRefine((data, ctx) => {
    if (data.categoria === 'voucher_tarjeta') {
      const n = Number(data.monto);
      if (data.monto === '' || !Number.isFinite(n) || n <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['monto'],
          message: 'Captura un monto mayor a 0',
        });
      }
    }
    if (data.categoria === 'comprobante_movimiento' && !data.movimiento_id) {
      ctx.addIssue({
        code: 'custom',
        path: ['movimiento_id'],
        message: 'Selecciona el movimiento ligado',
      });
    }
  });

type VoucherValues = z.infer<typeof VoucherSchema>;

export function VoucherCaptureForm({ voucher, bancos, movimientos, onSaved }: Props) {
  const toast = useToast();
  const initialCategoria: VoucherCategoria = voucher.categoria ?? 'voucher_tarjeta';
  // Pre-llenado: si hay valor humano confirmado, usa ese. Si no, sugerencia OCR.
  const initialBancoId = voucher.banco_id ?? voucher.ocr_banco_sugerido_id ?? null;
  const initialMonto =
    voucher.monto_reportado != null
      ? String(voucher.monto_reportado)
      : voucher.ocr_monto_sugerido != null
        ? String(voucher.ocr_monto_sugerido)
        : '';

  const form = useZodForm({
    schema: VoucherSchema,
    defaultValues: {
      categoria: initialCategoria,
      banco_id: initialBancoId,
      monto: initialMonto,
      afiliacion: voucher.afiliacion ?? '',
      movimiento_id: voucher.movimiento_caja_id ?? null,
    } as VoucherValues,
  });

  const categoria = form.watch('categoria');

  // Indicación visual: ¿el form arrancó pre-llenado por OCR (sin confirmación humana previa)?
  const esSugeridoPorOCR =
    voucher.monto_reportado == null &&
    (voucher.ocr_monto_sugerido != null || voucher.ocr_banco_sugerido_id != null);
  const confianzaBaja = esSugeridoPorOCR && (voucher.ocr_confianza ?? 1) < 0.4;

  const handleSubmit = async (values: VoucherValues) => {
    try {
      const categoriaCambia = values.categoria !== initialCategoria;

      if (values.categoria === 'voucher_tarjeta') {
        if (categoriaCambia) {
          await actualizarCategoriaVoucher({
            voucher_id: voucher.id,
            categoria: 'voucher_tarjeta',
            movimiento_caja_id: null,
          });
        }
        await confirmarVoucher({
          voucher_id: voucher.id,
          banco_id: values.banco_id,
          monto: Number(values.monto),
          afiliacion: values.afiliacion.trim() || null,
        });
      } else if (values.categoria === 'comprobante_movimiento') {
        await actualizarCategoriaVoucher({
          voucher_id: voucher.id,
          categoria: 'comprobante_movimiento',
          movimiento_caja_id: values.movimiento_id,
        });
      } else {
        await actualizarCategoriaVoucher({
          voucher_id: voucher.id,
          categoria: 'otro',
          movimiento_caja_id: null,
        });
      }

      toast.add({ title: 'Voucher actualizado', type: 'success' });
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      toast.add({ title: 'No se pudo guardar', description: msg, type: 'error' });
    }
  };

  return (
    <Form form={form} onSubmit={handleSubmit} className="space-y-3 rounded-lg border bg-card p-3">
      {esSugeridoPorOCR && categoria === 'voucher_tarjeta' && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <div className="space-y-0.5">
            <div className="font-medium">OCR sugiere — verifica los datos antes de confirmar.</div>
            {confianzaBaja && (
              <div className="flex items-center gap-1 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                Confianza baja — revisa con cuidado.
              </div>
            )}
          </div>
        </div>
      )}

      <CategoriaSegmentedControl />

      {categoria === 'voucher_tarjeta' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <FormField name="banco_id" label="Banco" hideLabel={false}>
              {(field) => (
                <Select value={field.value ?? ''} onValueChange={(v) => field.onChange(v || null)}>
                  <SelectTrigger
                    id={field.id}
                    aria-describedby={field.describedBy}
                    className="w-full"
                  >
                    <SelectValue placeholder="Selecciona banco" />
                  </SelectTrigger>
                  <SelectContent>
                    {bancos.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>

            <FormField name="monto" label="Monto" required>
              {(field) => (
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    {...field}
                    id={field.id}
                    aria-invalid={field.invalid || undefined}
                    aria-describedby={field.describedBy}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="pl-6 tabular-nums"
                  />
                </div>
              )}
            </FormField>
          </div>

          <FormField name="afiliacion" label="Afiliación (opcional)">
            {(field) => (
              <Input
                {...field}
                id={field.id}
                aria-invalid={field.invalid || undefined}
                aria-describedby={field.describedBy}
                placeholder="Ej. 7235801"
                className="tabular-nums"
              />
            )}
          </FormField>
        </div>
      )}

      {categoria === 'comprobante_movimiento' && (
        <div className="space-y-2">
          <FormField name="movimiento_id" label="Movimiento ligado" required>
            {(field) => (
              <Select value={field.value ?? ''} onValueChange={(v) => field.onChange(v || null)}>
                <SelectTrigger
                  id={field.id}
                  aria-describedby={field.describedBy}
                  className="w-full"
                >
                  <SelectValue placeholder="Selecciona movimiento" />
                </SelectTrigger>
                <SelectContent>
                  {movimientos.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      Sin movimientos registrados en este corte
                    </div>
                  ) : (
                    movimientos.map((m) => {
                      const partes = [
                        m.tipo ?? '—',
                        m.tipo_detalle,
                        formatCurrency(m.monto),
                        formatDateTime(m.fecha_hora),
                      ].filter(Boolean);
                      return (
                        <SelectItem key={m.id} value={m.id}>
                          {partes.join(' · ')}
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <p className="text-[11px] text-muted-foreground">
            Esta foto respalda un movimiento de caja, no es voucher de tarjeta. Liga al movimiento
            correspondiente.
          </p>
        </div>
      )}

      {categoria === 'otro' && (
        <p className="text-[11px] text-muted-foreground">
          Foto sin clasificar. Permanece archivada pero no entra en conciliación.
        </p>
      )}

      <FormActions
        cancelLabel="Cancelar"
        submitLabel="Guardar"
        submittingLabel="Guardando..."
        hideCancel
        className="border-t-0 pt-0 justify-end"
      />
    </Form>
  );
}

/**
 * Segmented control for `categoria`. Reads from form context, writes via
 * `setValue` so the discriminated-union validation re-runs on switch.
 */
function CategoriaSegmentedControl() {
  const { watch, setValue } = useFormContext<VoucherValues>();
  const categoria = watch('categoria');

  return (
    <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
      {CATEGORIA_OPTIONS.map((opt) => {
        const active = categoria === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() =>
              setValue('categoria', opt.value, { shouldDirty: true, shouldValidate: true })
            }
            className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
