'use client';

/**
 * AbonoCaptureDrawer — captura de un abono CxC desde el detalle de venta
 * DILESA. Reemplaza el form de Coda "Depositos Clientes".
 *
 * Llama `erp.cxc_pago_registrar`, que inserta el abono y lo auto-aplica
 * FIFO a los cargos abiertos de la venta (ver iniciativa `cxc`, ADR-037).
 * La fuente (cliente/institución) es etiqueta para cobranza/reportería,
 * no filtra el cálculo.
 */

import { Plus } from 'lucide-react';
import { z } from 'zod';

import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { Form, FormActions, FormField, FormRow, useZodForm } from '@/components/forms';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

const FUENTE_OPTIONS = [
  { value: 'cliente', label: 'Cliente' },
  { value: 'institucion', label: 'Institución' },
];

const FORMA_PAGO_OPTIONS = [
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'deposito', label: 'Depósito' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'otro', label: 'Otro' },
];

const AbonoSchema = z.object({
  fecha: z.string().min(1, 'Indica la fecha del abono'),
  monto: z
    .string()
    .min(1, 'Indica el monto')
    .refine((v) => Number(v) > 0, 'El monto debe ser mayor a 0'),
  fuente: z.enum(['cliente', 'institucion']),
  forma_pago: z.string().default(''),
  referencia: z.string().default(''),
  notas: z.string().default(''),
});

type AbonoValues = z.infer<typeof AbonoSchema>;

const defaults: AbonoValues = {
  fecha: '',
  monto: '',
  fuente: 'cliente',
  forma_pago: '',
  referencia: '',
  notas: '',
};

export type AbonoCaptureDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ventaId: string;
  empresaId: string;
  personaId: string;
  clienteNombre: string;
  /** Llamado tras registrar con éxito — el detalle re-fetchea. */
  onDone: () => void;
};

export function AbonoCaptureDrawer({
  open,
  onOpenChange,
  ventaId,
  empresaId,
  personaId,
  clienteNombre,
  onDone,
}: AbonoCaptureDrawerProps) {
  const toast = useToast();
  const form = useZodForm({ schema: AbonoSchema, defaultValues: defaults });

  const handleOpenChange = (next: boolean) => {
    if (!next) form.reset(defaults);
    onOpenChange(next);
  };

  const handleSubmit = async (values: AbonoValues) => {
    const sb = createSupabaseBrowserClient();
    const { error } = await sb.schema('erp').rpc('cxc_pago_registrar', {
      p_empresa_id: empresaId,
      p_persona_id: personaId,
      p_origen_id: ventaId,
      p_monto: Number(values.monto),
      p_fecha: values.fecha,
      p_fuente: values.fuente,
      p_forma_pago: values.forma_pago || undefined,
      p_referencia: values.referencia || undefined,
      p_notas: values.notas || undefined,
    });

    if (error) {
      toast.add({
        title: 'No se pudo registrar el abono',
        description: getSupabaseErrorMessage(error, 'Error en el RPC.'),
        type: 'error',
      });
      return;
    }

    toast.add({ title: 'Abono registrado', type: 'success' });
    form.reset(defaults);
    onOpenChange(false);
    onDone();
  };

  return (
    <DetailDrawer
      open={open}
      onOpenChange={handleOpenChange}
      size="sm"
      title="Registrar abono"
      description={clienteNombre}
    >
      <DetailDrawerContent>
        <Form form={form} onSubmit={handleSubmit} className="space-y-5">
          <FormRow cols={2}>
            <FormField name="fecha" label="Fecha" required>
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

            <FormField name="monto" label="Monto" required>
              {(field) => (
                <Input
                  {...field}
                  id={field.id}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  aria-invalid={field.invalid || undefined}
                  aria-describedby={field.describedBy}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-right tabular-nums text-[var(--text)]"
                />
              )}
            </FormField>
          </FormRow>

          <FormRow cols={2}>
            <FormField
              name="fuente"
              label="Fuente"
              description="Cliente o institución (Infonavit/Fovissste/banco)"
            >
              {(field) => (
                <Combobox
                  id={field.id}
                  value={field.value}
                  onChange={field.onChange}
                  options={FUENTE_OPTIONS}
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              )}
            </FormField>

            <FormField name="forma_pago" label="Forma de pago">
              {(field) => (
                <Combobox
                  id={field.id}
                  value={field.value}
                  onChange={field.onChange}
                  options={FORMA_PAGO_OPTIONS}
                  placeholder="Sin especificar"
                  allowClear
                  className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                />
              )}
            </FormField>
          </FormRow>

          <FormField name="referencia" label="Referencia">
            {(field) => (
              <Input
                {...field}
                id={field.id}
                placeholder="Folio, número de operación..."
                aria-invalid={field.invalid || undefined}
                aria-describedby={field.describedBy}
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            )}
          </FormField>

          <FormField name="notas" label="Notas">
            {(field) => (
              <Textarea
                {...field}
                id={field.id}
                rows={2}
                placeholder="Opcional..."
                aria-invalid={field.invalid || undefined}
                aria-describedby={field.describedBy}
                className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            )}
          </FormField>

          <FormActions
            cancelLabel="Cancelar"
            submitLabel="Registrar abono"
            submittingLabel="Registrando..."
            submitIcon={<Plus className="h-4 w-4" />}
            onCancel={() => handleOpenChange(false)}
            stretch
          />
        </Form>
      </DetailDrawerContent>
    </DetailDrawer>
  );
}
