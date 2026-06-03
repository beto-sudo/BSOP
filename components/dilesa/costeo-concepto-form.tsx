'use client';

/**
 * CosteoConceptoForm — alta/edición de un concepto de presupuesto de obra
 * (`dilesa.obra_presupuesto`, Capa A).
 *
 * Iniciativa dilesa-contratos-obra · Sprint 5 (captura de presupuesto). El
 * traspaso de los Excel (hoja RESUMEN) cargó 128 conceptos de solo-lectura;
 * este form deja operar el presupuesto hacia adelante: capturar conceptos
 * nuevos y corregir/editar los existentes desde el tab Costeo.
 *
 * Calca el form inline de `obra-contrato-detalle.tsx` (captura sin drawer,
 * `useState` plano). Insert/update directo con RLS de `dilesa`; el sub-slug
 * `dilesa.construccion.costeo` ya tiene write → sin migración.
 *
 * Notas de modelado:
 * - `orden` se autocalcula (max del proyecto + 1) en alta y se preserva en
 *   edición — no se expone en el form (reordenar es otra feature).
 * - IVA: v1 captura `gasto_real_total` c/IVA; el desglose subtotal/iva/tasa
 *   queda null (igual que el traspaso donde el Excel no lo especifica, ver
 *   ADR-038). El % de ejecución usa el total.
 */

import { useState } from 'react';
import { Loader2, Plus, Save } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { proyectoOptionLabel, type ProyectoOption } from '@/lib/dilesa/proyectos-selector';
import type { CosteoRow } from '@/components/dilesa/costeo-module';

/** "" o no-numérico → null; en otro caso el número. */
function toNum(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

export function CosteoConceptoForm({
  empresaId,
  proyectos,
  rows,
  editRow,
  onClose,
  onSaved,
}: {
  empresaId: string;
  proyectos: readonly ProyectoOption[];
  /** Conceptos visibles — fuente del autocálculo de `orden` en alta. */
  rows: readonly CosteoRow[];
  /** null = alta; row = edición (form pre-llenado). */
  editRow: CosteoRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isEdit = editRow != null;

  const [proyectoId, setProyectoId] = useState(editRow?.proyecto_id ?? '');
  const [concepto, setConcepto] = useState(editRow?.concepto ?? '');
  const [etapa, setEtapa] = useState(editRow?.etapa ?? '');
  const [presupuestoPrevio, setPresupuestoPrevio] = useState(
    editRow?.presupuestoPrevio != null ? String(editRow.presupuestoPrevio) : ''
  );
  const [presupuestoActual, setPresupuestoActual] = useState(
    editRow?.presupuestoActualizado != null ? String(editRow.presupuestoActualizado) : ''
  );
  const [gastoReal, setGastoReal] = useState(
    editRow?.gastoReal != null ? String(editRow.gastoReal) : ''
  );
  const [proveedor, setProveedor] = useState(editRow?.proveedor ?? '');
  const [fecha, setFecha] = useState(editRow?.fechaCompromiso ?? '');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = proyectoId !== '' && concepto.trim().length > 0;

  async function onSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    const sb = createSupabaseBrowserClient();

    const payload = {
      etapa: etapa.trim() || null,
      concepto: concepto.trim(),
      presupuesto_previo: toNum(presupuestoPrevio),
      presupuesto_actualizado: toNum(presupuestoActual),
      gasto_real_total: toNum(gastoReal),
      proveedor_texto: proveedor.trim() || null,
      fecha_compromiso: fecha || null,
    };

    const resp = editRow
      ? await sb
          .schema('dilesa')
          .from('obra_presupuesto')
          .update({ ...payload, proyecto_id: proyectoId, updated_at: new Date().toISOString() })
          .eq('id', editRow.id)
      : await sb
          .schema('dilesa')
          .from('obra_presupuesto')
          .insert({
            empresa_id: empresaId,
            proyecto_id: proyectoId,
            orden:
              rows
                .filter((r) => r.proyecto_id === proyectoId)
                .reduce((m, r) => Math.max(m, r.orden), 0) + 1,
            ...payload,
          });

    if (resp.error) {
      toast.add({
        title: isEdit ? 'Error al guardar' : 'Error al registrar',
        description: getSupabaseErrorMessage(resp.error, 'No se pudo guardar el concepto.'),
        type: 'error',
      });
      setSubmitting(false);
      return;
    }
    toast.add({
      title: isEdit ? 'Concepto actualizado' : 'Concepto registrado',
      description: concepto.trim(),
      type: 'success',
    });
    setSubmitting(false);
    onSaved();
  }

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-4">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
        {isEdit ? 'Editar concepto' : 'Nuevo concepto de presupuesto'}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Proyecto *">
          <select
            value={proyectoId}
            onChange={(e) => setProyectoId(e.target.value)}
            className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
          >
            <option value="">Selecciona…</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {proyectoOptionLabel(p)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Concepto *">
          <Input
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Red de agua potable, Barda perimetral…"
          />
        </Field>
        <Field label="Etapa">
          <Input
            value={etapa}
            onChange={(e) => setEtapa(e.target.value)}
            placeholder="Urbanización, Cabecera…"
          />
        </Field>
        <Field label="Presupuesto previo (c/IVA)">
          <Input
            type="number"
            step="0.01"
            value={presupuestoPrevio}
            onChange={(e) => setPresupuestoPrevio(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="Presupuesto actualizado (c/IVA)">
          <Input
            type="number"
            step="0.01"
            value={presupuestoActual}
            onChange={(e) => setPresupuestoActual(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="Gasto real (c/IVA)">
          <Input
            type="number"
            step="0.01"
            value={gastoReal}
            onChange={(e) => setGastoReal(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="Proveedor">
          <Input
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            placeholder="Electrogaza, CFE, DILESA (obra propia)…"
          />
        </Field>
        <Field label="Fecha compromiso">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
      </div>
      <p className="mt-2 text-[11px] text-[var(--text)]/50">
        El % de ejecución se calcula como gasto real ÷ presupuesto actualizado (o previo si no hay
        actualizado). Montos con IVA incluido.
      </p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button onClick={onSubmit} disabled={!canSubmit || submitting}>
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isEdit ? (
            <Save className="size-4" />
          ) : (
            <Plus className="size-4" />
          )}
          {isEdit ? 'Guardar' : 'Registrar'}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
        {label}
      </div>
      {children}
    </div>
  );
}
