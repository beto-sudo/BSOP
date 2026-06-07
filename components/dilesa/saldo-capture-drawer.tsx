'use client';

/**
 * SaldoCaptureDrawer — captura de un snapshot de saldo de una cuenta bancaria
 * DILESA + historial de los snapshots previos de esa cuenta.
 *
 * Iniciativa `tesoreria` (Sprint 3). Llama la server action `capturarSaldo`,
 * que apila un row en `erp.cuenta_saldos` (audit trail — no edita el anterior).
 * Al abrir, lista los snapshots históricos de la cuenta desde
 * `erp.cuenta_saldos` ordenados por fecha desc.
 */

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { z } from 'zod';

import { DetailDrawer, DetailDrawerContent, DetailDrawerSection } from '@/components/detail-page';
import { Form, FormActions, FormField, FormRow, useZodForm } from '@/components/forms';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { capturarSaldo } from '@/app/dilesa/saldos-bancos/actions';
import type { CuentaSaldoRow } from '@/components/dilesa/saldos-bancos-utils';

const SaldoSchema = z.object({
  fecha: z.string().min(1, 'Indica la fecha del saldo'),
  saldo: z
    .string()
    .min(1, 'Indica el saldo')
    .refine((v) => Number.isFinite(Number(v)), 'El saldo debe ser un número válido'),
  notas: z.string().default(''),
});

type SaldoValues = z.infer<typeof SaldoSchema>;

/** Fecha de hoy en `YYYY-MM-DD` (default del campo fecha). */
function hoyISO(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Matamoros' }).format(new Date());
}

type HistorialRow = {
  id: string;
  fecha: string;
  saldo: number;
  notas: string | null;
  created_at: string;
  capturado_por: string | null;
};

export type SaldoCaptureDrawerProps = {
  cuenta: CuentaSaldoRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Llamado tras capturar con éxito — la tabla re-fetchea. */
  onDone: () => void;
};

export function SaldoCaptureDrawer({
  cuenta,
  open,
  onOpenChange,
  onDone,
}: SaldoCaptureDrawerProps) {
  const toast = useToast();
  const [historial, setHistorial] = useState<HistorialRow[]>([]);
  const [historialLoading, setHistorialLoading] = useState(false);

  const form = useZodForm({
    schema: SaldoSchema,
    defaultValues: { fecha: hoyISO(), saldo: '', notas: '' },
  });

  const cargarHistorial = useCallback(
    async (cuentaId: string) => {
      setHistorialLoading(true);
      const sb = createSupabaseBrowserClient();
      const { data, error } = await sb
        .schema('erp')
        .from('cuenta_saldos')
        .select('id, fecha, saldo, notas, created_at, capturado_por')
        .eq('cuenta_id', cuentaId)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        toast.add({
          title: 'No se pudo cargar el historial',
          description: getSupabaseErrorMessage(error, 'Reintenta abrir la cuenta.'),
          type: 'error',
        });
        setHistorial([]);
      } else {
        setHistorial(data ?? []);
      }
      setHistorialLoading(false);
    },
    [toast]
  );

  // Reset del form + carga del historial cada vez que se abre una cuenta.
  useEffect(() => {
    if (open && cuenta) {
      form.reset({ fecha: hoyISO(), saldo: '', notas: '' });
      void cargarHistorial(cuenta.cuentaId);
    } else if (!open) {
      setHistorial([]);
    }
    // form es estable; cuenta?.cuentaId gobierna la recarga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cuenta?.cuentaId]);

  const handleSubmit = async (values: SaldoValues) => {
    if (!cuenta) return;
    const result = await capturarSaldo({
      cuentaId: cuenta.cuentaId,
      fecha: values.fecha,
      saldo: values.saldo,
      notas: values.notas || undefined,
    });

    if (!result.ok) {
      toast.add({
        title: 'No se pudo registrar el saldo',
        description: result.error,
        type: 'error',
      });
      return;
    }

    toast.add({ title: 'Saldo registrado', type: 'success' });
    onOpenChange(false);
    onDone();
  };

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={cuenta ? `Capturar saldo · ${cuenta.nombre}` : 'Capturar saldo'}
      description={cuenta ? `${cuenta.banco ?? cuenta.nombre} · ${cuenta.moneda}` : undefined}
    >
      <DetailDrawerContent>
        <Form form={form} onSubmit={handleSubmit} className="space-y-5">
          <FormRow cols={2}>
            <FormField name="fecha" label="Fecha del saldo" required>
              {(field) => (
                <Input
                  {...field}
                  id={field.id}
                  type="date"
                  aria-invalid={field.invalid || undefined}
                  aria-describedby={field.describedBy}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              )}
            </FormField>

            <FormField name="saldo" label={`Saldo${cuenta ? ` (${cuenta.moneda})` : ''}`} required>
              {(field) => (
                <Input
                  {...field}
                  id={field.id}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder="0.00"
                  aria-invalid={field.invalid || undefined}
                  aria-describedby={field.describedBy}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-right tabular-nums text-[var(--text)]"
                />
              )}
            </FormField>
          </FormRow>

          <FormField name="notas" label="Notas">
            {(field) => (
              <Textarea
                {...field}
                id={field.id}
                rows={2}
                placeholder="Opcional — referencia, corte, etc."
                aria-invalid={field.invalid || undefined}
                aria-describedby={field.describedBy}
                className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            )}
          </FormField>

          <FormActions
            cancelLabel="Cancelar"
            submitLabel="Registrar saldo"
            submittingLabel="Registrando..."
            submitIcon={<Plus className="h-4 w-4" />}
            onCancel={() => onOpenChange(false)}
            stretch
          />
        </Form>

        <DetailDrawerSection title="Historial" description="Snapshots previos de esta cuenta">
          {historialLoading ? (
            <p className="text-sm text-[var(--text)]/50">Cargando historial…</p>
          ) : historial.length === 0 ? (
            <p className="text-sm text-[var(--text)]/50">
              Aún no hay saldos capturados para esta cuenta.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {historial.map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--text)]">
                        {formatDate(h.fecha)}
                      </span>
                      {h.notas ? (
                        <span className="truncate text-xs text-[var(--text)]/60">{h.notas}</span>
                      ) : null}
                    </div>
                    <div className="text-xs text-[var(--text)]/50">
                      Capturado {formatDateTime(h.created_at)}
                    </div>
                  </div>
                  <Badge tone="neutral" className="shrink-0 tabular-nums">
                    {formatCurrency(h.saldo, { currency: cuenta?.moneda ?? 'MXN' })}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </DetailDrawerSection>
      </DetailDrawerContent>
    </DetailDrawer>
  );
}
