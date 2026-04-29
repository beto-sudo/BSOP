'use client';

/* eslint-disable @typescript-eslint/no-explicit-any --
 * `subtipo_meta` stays loose to match the original pages and match the
 * jsonb schema; see components/documentos/types.ts for the rationale.
 */

/**
 * DocFormFields — common field set shared by both create and edit flows.
 *
 * Reads/writes from a surrounding `<Form>` (forms-pattern) via
 * `useFormContext<DocForm>`. Both `documento-create-sheet.tsx` and the edit
 * mode of `documento-detail-sheet.tsx` mount this component inside their
 * `<Form>` providers.
 *
 * Flujo simplificado (2026-04): con el pipeline de extracción IA, la mayoría
 * de los metadatos (número, fecha, partes, monto, ubicación, etc.) se
 * rellenan automáticamente cuando el usuario dispara "Procesar con IA" sobre
 * el PDF adjunto. Por eso los campos subtipo-específicos de Escritura,
 * Contrato, Acta Constitutiva y Poder se **ocultan en el form de creación**
 * (`mode === 'create'`); el usuario solo los ve/edita desde el detail sheet.
 *
 * Excepción: `Seguro` mantiene sus campos visibles (número de póliza,
 * aseguradora, cobertura, prima) porque la IA no extrae esos datos — el
 * schema actual cubre documentos legales notariales, no pólizas de seguros.
 *
 * En `mode === 'edit'` siempre se muestran todos los campos para que admin
 * pueda ajustar si la extracción IA se equivocó o para capturar manualmente.
 */

import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { Textarea } from '@/components/ui/textarea';
import { FormField, useFormContext } from '@/components/forms';

import type { DocForm, NotariaOption } from './types';
import { TIPOS_DOCUMENTO } from './types';
import { autoTituloEscritura } from './helpers';
import { SubtipoFields } from './documento-subtipo-fields';

export function DocFormFields({
  notarias,
  onOpenCreateNotaria,
  mode = 'edit',
}: {
  notarias: NotariaOption[];
  onOpenCreateNotaria: () => void;
  /**
   * 'create' oculta los campos que la IA va a rellenar automáticamente
   * (número, fecha emisión, descripción, subtipo específico salvo Seguro).
   * 'edit' (default) muestra todo para capturas manuales o correcciones.
   */
  mode?: 'create' | 'edit';
}) {
  const { watch, setValue, getValues } = useFormContext<DocForm>();
  const isCreate = mode === 'create';
  const tipo = watch('tipo');
  const subtipoMeta = watch('subtipo_meta');
  const notarioProveedorId = watch('notario_proveedor_id');

  // Campos subtipo-específicos solo tienen sentido mostrarlos en create si
  // la IA NO los extrae (Seguro). Para escritura/acta/poder/contrato los
  // ocultamos porque son redundantes con lo que la extracción va a poblar.
  const showSubtipoFieldsInCreate = tipo === 'Seguro';
  const showNotaria = ['Escritura', 'Acta Constitutiva', 'Poder'].includes(tipo);

  const recomputeTituloIfEscritura = () => {
    const next = getValues();
    if (next.tipo === 'Escritura') {
      setValue('titulo', autoTituloEscritura(next), { shouldDirty: true });
    }
  };

  const handleNotariaChange = (value: string | null) => {
    if (!value) {
      setValue('notario_proveedor_id', '', { shouldDirty: true });
      setValue('notaria', '', { shouldDirty: true });
      recomputeTituloIfEscritura();
      return;
    }
    const sel = notarias.find((n) => n.id === value);
    setValue('notario_proveedor_id', value, { shouldDirty: true });
    setValue('notaria', sel?.nombre ?? '', { shouldDirty: true });
    recomputeTituloIfEscritura();
  };

  const handleTipoChange = (next: string | null) => {
    if (!next) return;
    setValue('tipo', next, { shouldDirty: true });
    if (next === 'Escritura') {
      const values = getValues();
      setValue('titulo', autoTituloEscritura({ ...values, tipo: next }), {
        shouldDirty: true,
      });
    }
  };

  const handleMetaChange = (meta: Record<string, any>) => {
    setValue('subtipo_meta', meta, { shouldDirty: true });
    recomputeTituloIfEscritura();
  };

  return (
    <div className="space-y-4">
      {/* Tipo selector — first, drives everything */}
      <FormField name="tipo" label="Tipo de documento" required>
        {(field) => (
          <Combobox
            id={field.id}
            value={field.value}
            onChange={handleTipoChange}
            options={TIPOS_DOCUMENTO.map((t) => ({
              value: t.value,
              label: `${t.icon} ${t.label}`,
            }))}
            placeholder="Seleccionar tipo..."
            className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        )}
      </FormField>

      {/* Type-specific fields */}
      {tipo && (!isCreate || showSubtipoFieldsInCreate) && (
        <SubtipoFields tipo={tipo} meta={subtipoMeta} onChange={handleMetaChange} />
      )}

      {/* Título — en create se omite (placeholder automático + IA). */}
      {!isCreate && (
        <FormField name="titulo" label="Título" required>
          {(field) => (
            <>
              <Input
                {...field}
                id={field.id}
                aria-invalid={field.invalid || undefined}
                aria-describedby={field.describedBy}
                placeholder={
                  tipo === 'Escritura'
                    ? 'Se genera automáticamente'
                    : 'Ej: Contrato de arrendamiento oficina'
                }
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
                readOnly={tipo === 'Escritura'}
              />
              {tipo === 'Escritura' && (
                <p className="mt-1 text-[10px] text-[var(--text-subtle)]">
                  Se genera a partir de los datos de la escritura.
                </p>
              )}
            </>
          )}
        </FormField>
      )}

      {/* Número y fecha — en create solo para Seguro. */}
      {(!isCreate || showSubtipoFieldsInCreate) && (
        <div className="grid grid-cols-2 gap-4">
          <FormField name="numero_documento" label="No. de documento">
            {(field) => (
              <Input
                {...field}
                id={field.id}
                aria-invalid={field.invalid || undefined}
                aria-describedby={field.describedBy}
                placeholder="Ej: 4521"
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            )}
          </FormField>
          <FormField name="fecha_emision" label="Fecha de emisión">
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
        </div>
      )}

      {/* Fecha de vencimiento: solo en create para Contrato/Seguro/Otro. */}
      {(!isCreate || tipo === 'Contrato' || tipo === 'Seguro' || tipo === 'Otro') && (
        <FormField name="fecha_vencimiento" label="Fecha de vencimiento">
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
      )}

      {/* Notaría — only for relevant types */}
      {showNotaria && (
        <FormField name="notario_proveedor_id" label="Notaría">
          {(field) => (
            <div className="space-y-2">
              <div className="flex items-center justify-end -mt-7">
                <button
                  type="button"
                  onClick={onOpenCreateNotaria}
                  className="text-xs text-[var(--accent)] hover:text-[var(--accent)]/80"
                >
                  + Nueva notaría
                </button>
              </div>
              <Combobox
                id={field.id}
                value={notarioProveedorId}
                onChange={(v) => handleNotariaChange(v || null)}
                options={notarias.map((n) => ({ value: n.id, label: n.nombre }))}
                placeholder="Seleccionar notaría"
                allowClear
                className="rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
            </div>
          )}
        </FormField>
      )}

      {/* Descripción — en create se oculta (la IA la genera). */}
      {!isCreate && (
        <FormField name="descripcion" label="Descripción">
          {(field) => (
            <>
              <Textarea
                {...field}
                id={field.id}
                aria-invalid={field.invalid || undefined}
                aria-describedby={field.describedBy}
                placeholder="Resumen breve de lo que contiene el documento..."
                rows={4}
                maxLength={1500}
                className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
              />
              <p className="mt-1 text-[10px] text-[var(--text-subtle)]">
                Se muestra como vista previa en la tabla. Hasta 1500 caracteres para escrituras
                complejas que contienen varios actos jurídicos.
              </p>
            </>
          )}
        </FormField>
      )}

      <FormField name="notas" label="Notas">
        {(field) => (
          <Textarea
            {...field}
            id={field.id}
            aria-invalid={field.invalid || undefined}
            aria-describedby={field.describedBy}
            placeholder="Observaciones adicionales..."
            rows={3}
            className="resize-none rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        )}
      </FormField>
    </div>
  );
}
