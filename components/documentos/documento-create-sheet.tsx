'use client';

import * as React from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { z } from 'zod';

import { createSupabaseERPClient } from '@/lib/supabase-browser';
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import { Form, FormActions, useZodForm } from '@/components/forms';

import { placeholderTitulo } from '@/lib/documentos/naming';

import type { DocForm, Documento, NotariaOption } from './types';
import { emptyForm } from './helpers';
import { DocFormFields } from './documento-form-fields';

// ─── Schema ──────────────────────────────────────────────────────────────────

const DocCreateSchema = z.object({
  titulo: z.string().default(''),
  numero_documento: z.string().default(''),
  tipo: z.string().min(1, 'Selecciona un tipo de documento'),
  fecha_emision: z.string().default(''),
  fecha_vencimiento: z.string().default(''),
  notario_proveedor_id: z.string().default(''),
  notaria: z.string().default(''),
  descripcion: z.string().default(''),
  notas: z.string().default(''),
  subtipo_meta: z.record(z.string(), z.any()).default({}),
}) satisfies z.ZodType<DocForm>;

type DocCreateValues = z.infer<typeof DocCreateSchema>;

// ─── Component ───────────────────────────────────────────────────────────────

export function DocumentoCreateSheet({
  open,
  onClose,
  notarias,
  onOpenCreateNotaria,
  primaryEmpresaId,
  empresaSlugForTitulo,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  notarias: NotariaOption[];
  onOpenCreateNotaria: () => void;
  primaryEmpresaId: string;
  /**
   * Slug de la empresa (p.ej. "dilesa") — se usa para armar el título
   * placeholder `DILESA-YYYY-MM-DD-Documento por procesar` hasta que la
   * extracción IA lo reemplace por el formato estándar final.
   */
  empresaSlugForTitulo?: string;
  onCreated: (doc: Documento) => void;
}) {
  const supabase = createSupabaseERPClient();

  const form = useZodForm({
    schema: DocCreateSchema,
    defaultValues: emptyForm() as DocCreateValues,
  });

  // Reset whenever the sheet opens (carry-over from the original behaviour:
  // each open is a fresh capture).
  React.useEffect(() => {
    if (open) form.reset(emptyForm() as DocCreateValues);
  }, [open, form]);

  const handleSubmit = async (values: DocCreateValues) => {
    if (!primaryEmpresaId) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: cu } = await supabase
      .schema('core')
      .from('usuarios')
      .select('id')
      .eq('email', (user?.email ?? '').toLowerCase())
      .maybeSingle();

    // Si el usuario no escribió título (Seguro es el único flujo que lo pide
    // explícitamente), usamos un placeholder temporal. El título final lo
    // genera la IA al "Procesar con IA" y lo actualiza en `titulo` con el
    // formato estándar DILESA-YYYY-M-Tipo_Numero.
    const titulo = values.titulo.trim() || placeholderTitulo(empresaSlugForTitulo);

    const { data: newDoc, error: err } = await supabase
      .schema('erp')
      .from('documentos')
      .insert({
        empresa_id: primaryEmpresaId,
        titulo,
        numero_documento: values.numero_documento.trim() || null,
        tipo: values.tipo || null,
        fecha_emision: values.fecha_emision || null,
        fecha_vencimiento: values.fecha_vencimiento || null,
        notario_proveedor_id: values.notario_proveedor_id || null,
        notaria: values.notaria.trim() || null,
        descripcion: values.descripcion.trim() || null,
        notas: values.notas.trim() || null,
        subtipo_meta: Object.keys(values.subtipo_meta).length > 0 ? values.subtipo_meta : null,
        creado_por: cu?.id ?? null,
      })
      .select('*')
      .single();
    if (err || !newDoc) {
      alert(`Error: ${err?.message ?? 'No se pudo crear'}`);
      return;
    }
    onClose();
    onCreated(newDoc as Documento);
  };

  return (
    <DetailDrawer
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      size="md"
      title="Nuevo Documento"
    >
      <DetailDrawerContent>
        <Form form={form} onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-start gap-2 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-3 py-2.5 text-xs text-[var(--text)]/70">
            <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-[var(--accent)]" />
            <div>
              <p className="mb-0.5 font-medium text-[var(--text)]">Flujo con IA — captura mínima</p>
              <p>
                Solo pedimos lo esencial. Después de guardar, sube el PDF y haz click en{' '}
                <strong>Procesar con IA</strong>: el número, fecha, partes, monto, ubicación,
                descripción y título final se rellenan automáticamente del contenido del PDF.
              </p>
            </div>
          </div>

          <DocFormFields
            notarias={notarias}
            onOpenCreateNotaria={onOpenCreateNotaria}
            mode="create"
          />

          <FormActions
            cancelLabel="Cancelar"
            submitLabel="Guardar y adjuntar archivos"
            submittingLabel="Guardando..."
            submitIcon={<Plus className="h-4 w-4" />}
            onCancel={onClose}
            className="border-t-0 pt-2"
          />
        </Form>
      </DetailDrawerContent>
    </DetailDrawer>
  );
}
