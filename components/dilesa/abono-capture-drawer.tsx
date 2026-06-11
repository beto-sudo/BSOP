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

import { useState } from 'react';
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
import { buildAdjuntoPath } from '@/lib/storage/path';
import { WizardFileSlot } from '@/components/wizard/wizard-file-slot';

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
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [recibo, setRecibo] = useState<File | null>(null);
  const form = useZodForm({ schema: AbonoSchema, defaultValues: defaults });

  const reset = () => {
    form.reset(defaults);
    setComprobante(null);
    setRecibo(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async (values: AbonoValues) => {
    const sb = createSupabaseBrowserClient();
    const { data: pagoId, error } = await sb.schema('erp').rpc('cxc_pago_registrar', {
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

    // Sube los adjuntos ligados al abono recién creado (deferred upload,
    // ADR-022): el abono ya existe, así que tenemos su id como entidadId.
    // Roles espejo del módulo Coda "Depositos Clientes": el comprobante del
    // depósito lo trae ventas; el recibo de caja / factura lo emite CxC.
    if (typeof pagoId === 'string') {
      const subirAdjunto = async (file: File, rol: string, etiqueta: string) => {
        const path = buildAdjuntoPath({
          empresa: 'dilesa',
          entidad: 'cxc_pagos',
          entidadId: pagoId,
          filename: file.name,
        });
        const { error: upErr } = await sb.storage.from('adjuntos').upload(path, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });
        if (upErr) {
          toast.add({
            title: `Abono registrado, pero ${etiqueta} no se subió`,
            description: getSupabaseErrorMessage(upErr, 'Reintenta adjuntarlo desde el abono.'),
            type: 'error',
          });
          return;
        }
        await sb
          .schema('erp')
          .from('adjuntos')
          .insert({
            empresa_id: empresaId,
            entidad_tipo: 'cxc_pago',
            entidad_id: pagoId,
            rol,
            nombre: file.name,
            url: path,
            tipo_mime: file.type || null,
          });
      };

      if (comprobante) await subirAdjunto(comprobante, 'comprobante_deposito', 'el comprobante');
      if (recibo) await subirAdjunto(recibo, 'recibo_caja', 'el recibo de caja');
    }

    toast.add({ title: 'Abono registrado', type: 'success' });
    reset();
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

          <div>
            <span className="mb-1.5 block text-xs font-medium text-[var(--text)]">Comprobante</span>
            <WizardFileSlot
              role="comprobante_deposito"
              label="Comprobante del depósito"
              file={comprobante}
              onChange={setComprobante}
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
            />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-[var(--text)]">
              Recibo de caja / factura
            </span>
            <WizardFileSlot
              role="recibo_caja"
              label="Recibo de caja o factura (opcional)"
              file={recibo}
              onChange={setRecibo}
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
            />
          </div>

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
