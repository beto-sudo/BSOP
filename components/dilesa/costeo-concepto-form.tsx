'use client';

/**
 * CosteoConceptoForm — alta/edición de una partida de presupuesto de obra
 * (`erp.presupuesto_partidas`, modelo canónico — ADR-040; migrado desde
 * `dilesa.obra_presupuesto` en Sprint 1 de dilesa-compras).
 *
 * Iniciativa dilesa-contratos-obra · Sprint 5 (captura), rediseñado en
 * dilesa-compras (Sprint 1 fase 2b). El traspaso de los Excel (hoja RESUMEN)
 * cargó 128 partidas; este form deja operar el presupuesto hacia adelante:
 * capturar partidas nuevas y corregir/editar las existentes desde el tab Costeo.
 *
 * Dos dropdowns clave del rediseño:
 *   - **Concepto del catálogo** (`concepto_id`): clasifica la partida en el
 *     catálogo jerárquico (etapa›capítulo, optgroups) — sin esto la partida cae
 *     en "Sin clasificar". El texto libre del concepto se conserva como etiqueta.
 *   - **Proveedor** (`proveedor_persona_id`): de `erp.proveedores`. Default "Por
 *     definir". La opción "Otro (texto libre)" preserva el `proveedor_texto`
 *     legacy del traspaso para no perder datos al migrar al modelo estructurado.
 *
 * Notas de modelado:
 * - `orden` se autocalcula (max del proyecto + 1) en alta y se preserva en
 *   edición — no se expone en el form (reordenar es otra feature).
 * - IVA: v1 captura `gasto_real_total` c/IVA; el desglose subtotal/iva/tasa
 *   queda null (igual que el traspaso, ADR-038). El % de ejecución usa el total.
 */

import { useState } from 'react';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { proyectoOptionLabel, type ProyectoOption } from '@/lib/dilesa/proyectos-selector';
import type { CatalogoOptgroup } from '@/lib/dilesa/conceptos-catalogo';
import type { CosteoRow, ProveedorOption } from '@/components/dilesa/costeo-module';

/** "" o no-numérico → null; en otro caso el número. */
function toNum(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

/** Valor centinela del select de proveedor para capturar texto libre. */
const PROV_OTRO = '__otro__';

export function CosteoConceptoForm({
  empresaId,
  proyectos,
  optgroups,
  proveedores,
  rows,
  editRow,
  defaultProyectoId,
  baselineActivo = false,
  onSolicitarCambio,
  onClose,
  onSaved,
  onDelete,
}: {
  empresaId: string;
  proyectos: readonly ProyectoOption[];
  /** Pre-selección del proyecto en alta (tab Gasto: el proyecto es fijo). */
  defaultProyectoId?: string;
  /** Optgroups del catálogo (etapa›capítulo) para el selector de clasificación. */
  optgroups: readonly CatalogoOptgroup[];
  /** Proveedores activos (persona_id + nombre) para el dropdown. */
  proveedores: readonly ProveedorOption[];
  /** Partidas visibles — fuente del autocálculo de `orden` en alta. */
  rows: readonly CosteoRow[];
  /** null = alta; row = edición (form pre-llenado). */
  editRow: CosteoRow | null;
  /**
   * Gobierno presupuestal (iniciativa dilesa-presupuesto-baseline): el
   * proyecto tiene baseline → `presupuesto_aprobado` queda bloqueado a
   * edición directa (el trigger de DB lo rechaza); el cambio va por orden.
   */
  baselineActivo?: boolean;
  /** Abre el flujo de orden de cambio para la partida en edición. */
  onSolicitarCambio?: () => void;
  onClose: () => void;
  onSaved: () => void;
  /**
   * Borra la partida (solo en edición). Soft-delete + cierra el form.
   * Recibe el motivo de cancelación capturado para el audit trail.
   */
  onDelete?: (motivo?: string) => void | Promise<void>;
}) {
  const toast = useToast();
  const isEdit = editRow != null;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [proyectoId, setProyectoId] = useState(editRow?.proyecto_id ?? defaultProyectoId ?? '');
  const [concepto, setConcepto] = useState(editRow?.concepto ?? '');
  const [conceptoId, setConceptoId] = useState(editRow?.conceptoId ?? '');
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
  // Proveedor: si la partida ya tiene persona_id → ese; si solo tiene texto
  // legacy → modo "Otro"; si no → "Por definir" (default).
  const [proveedorSel, setProveedorSel] = useState(
    editRow?.proveedorPersonaId ? editRow.proveedorPersonaId : editRow?.proveedor ? PROV_OTRO : ''
  );
  const [proveedorTexto, setProveedorTexto] = useState(editRow?.proveedor ?? '');
  const [fecha, setFecha] = useState(editRow?.fechaCompromiso ?? '');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = proyectoId !== '' && concepto.trim().length > 0;

  // Al elegir un concepto del catálogo, prellena el texto libre si está vacío
  // (atajo para captura; en edición no pisa el texto existente).
  function onPickConcepto(id: string) {
    setConceptoId(id);
    if (id && concepto.trim() === '') {
      for (const g of optgroups) {
        const c = g.conceptos.find((x) => x.id === id);
        if (c) {
          setConcepto(c.nombre);
          break;
        }
      }
    }
  }

  async function onSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    const sb = createSupabaseBrowserClient();

    // Proveedor: dropdown estructurado vs texto libre (mutuamente excluyentes).
    const proveedorPersonaId = proveedorSel && proveedorSel !== PROV_OTRO ? proveedorSel : null;
    const proveedorTextoFinal = proveedorSel === PROV_OTRO ? proveedorTexto.trim() || null : null;

    const payload: Record<string, unknown> = {
      etapa: etapa.trim() || null,
      concepto_texto: concepto.trim(),
      concepto_id: conceptoId || null,
      presupuesto_previo: toNum(presupuestoPrevio),
      gasto_real_total: toNum(gastoReal),
      proveedor_persona_id: proveedorPersonaId,
      proveedor_texto: proveedorTextoFinal,
      fecha_compromiso: fecha || null,
    };
    // Con baseline, `presupuesto_aprobado` no viaja: en edición está
    // bloqueado (cambia solo por orden autorizada — el trigger de DB lo
    // rechazaría) y en alta la partida nace en $0.
    if (!baselineActivo) {
      payload.presupuesto_aprobado = toNum(presupuestoActual);
    }

    // Modelo canónico erp.presupuesto_partidas (ADR-040). Aún no está en
    // types/supabase.ts (se difiere al workflow db-types) → cast `as any`,
    // patrón del repo para tablas nuevas.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const partidas = () => (sb.schema('erp') as any).from('presupuesto_partidas');
    const resp = editRow
      ? await partidas()
          .update({ ...payload, proyecto_id: proyectoId, updated_at: new Date().toISOString() })
          .eq('id', editRow.id)
      : await partidas().insert({
          empresa_id: empresaId,
          proyecto_id: proyectoId,
          fuente: 'obra_resumen',
          orden:
            rows
              .filter((r) => r.proyecto_id === proyectoId)
              .reduce((m, r) => Math.max(m, r.orden), 0) + 1,
          ...payload,
        });

    if (resp.error) {
      toast.add({
        title: isEdit ? 'Error al guardar' : 'Error al registrar',
        description: getSupabaseErrorMessage(resp.error, 'No se pudo guardar la partida.'),
        type: 'error',
      });
      setSubmitting(false);
      return;
    }
    toast.add({
      title: isEdit ? 'Partida actualizada' : 'Partida registrada',
      description: concepto.trim(),
      type: 'success',
    });
    setSubmitting(false);
    onSaved();
  }

  // Alta simple (iniciativa dilesa-flujo-gasto · S4): una partida NUEVA es
  // Clasificación + Concepto + Presupuesto. El resto (etapa texto, proveedor,
  // gasto real, previo/actualizado, fecha) es legacy del costeo pre-P2P o
  // historia de revisiones — solo aparece en edición. El gasto de una partida
  // nueva llega derivado del ciclo (OC → recepción → factura → pago).
  const proyectoFijoNombre =
    !isEdit && defaultProyectoId
      ? (proyectos.find((p) => p.id === defaultProyectoId)?.nombre ?? null)
      : null;
  const muestraSelectorProyecto = isEdit || !defaultProyectoId;

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-4">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
        {isEdit ? 'Editar partida' : 'Nueva partida de presupuesto'}
        {proyectoFijoNombre ? ` · ${proyectoFijoNombre}` : ''}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {muestraSelectorProyecto ? (
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
        ) : null}
        <Field label="Clasificación (catálogo)">
          <select
            value={conceptoId}
            onChange={(e) => onPickConcepto(e.target.value)}
            className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
          >
            <option value="">Sin clasificar</option>
            {optgroups.map((g) => (
              <optgroup key={g.capituloCodigo} label={g.label}>
                {g.conceptos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Concepto (etiqueta) *">
          <Input
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Red de agua potable, Barda perimetral…"
          />
        </Field>
        {isEdit ? (
          <Field label="Etapa (texto)">
            <Input
              value={etapa}
              onChange={(e) => setEtapa(e.target.value)}
              placeholder="Urbanización, Cabecera…"
            />
          </Field>
        ) : null}
        {isEdit ? (
          <Field label="Proveedor">
            <select
              value={proveedorSel}
              onChange={(e) => setProveedorSel(e.target.value)}
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
            >
              <option value="">Por definir</option>
              {proveedores.map((p) => (
                <option key={p.personaId} value={p.personaId}>
                  {p.label}
                </option>
              ))}
              <option value={PROV_OTRO}>Otro (texto libre)…</option>
            </select>
          </Field>
        ) : null}
        {isEdit && proveedorSel === PROV_OTRO ? (
          <Field label="Proveedor (texto libre)">
            <Input
              value={proveedorTexto}
              onChange={(e) => setProveedorTexto(e.target.value)}
              placeholder="Nombre del proveedor no catalogado"
            />
          </Field>
        ) : isEdit ? (
          <div className="hidden sm:block" />
        ) : null}
        {isEdit ? (
          <Field label="Presupuesto previo (c/IVA)">
            <Input
              type="number"
              step="0.01"
              value={presupuestoPrevio}
              onChange={(e) => setPresupuestoPrevio(e.target.value)}
              placeholder="0.00"
            />
          </Field>
        ) : null}
        {baselineActivo && !isEdit ? null : (
          <Field
            label={
              isEdit
                ? baselineActivo
                  ? 'Presupuesto vigente (gobernado)'
                  : 'Presupuesto actualizado (c/IVA)'
                : 'Presupuesto (c/IVA)'
            }
          >
            <Input
              type="number"
              step="0.01"
              value={presupuestoActual}
              onChange={(e) => setPresupuestoActual(e.target.value)}
              placeholder="0.00"
              disabled={baselineActivo}
            />
            {baselineActivo && isEdit ? (
              <button
                type="button"
                onClick={onSolicitarCambio}
                className="mt-1 text-xs font-medium text-[var(--accent)] hover:underline disabled:opacity-50"
                disabled={!onSolicitarCambio}
              >
                Solicitar cambio de presupuesto…
              </button>
            ) : null}
          </Field>
        )}
        {isEdit ? (
          <Field label="Gasto real (c/IVA)">
            <Input
              type="number"
              step="0.01"
              value={gastoReal}
              onChange={(e) => setGastoReal(e.target.value)}
              placeholder="0.00"
            />
          </Field>
        ) : null}
        {isEdit ? (
          <Field label="Fecha compromiso">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
        ) : null}
      </div>
      <p className="mt-2 text-[11px] text-[var(--text)]/50">
        {baselineActivo
          ? isEdit
            ? 'El proyecto tiene presupuesto inicial autorizado: el monto vigente solo se modifica con una orden de cambio autorizada por Dirección. Los demás campos (clasificación, proveedor, fechas) siguen editables.'
            : 'El proyecto tiene presupuesto inicial autorizado: la partida nueva nace en $0 y su presupuesto se asigna con una orden de cambio aditiva (con motivo y soporte documental).'
          : isEdit
            ? 'La clasificación agrupa y ordena la partida por el catálogo de conceptos. El % de ejecución se calcula como gasto real ÷ presupuesto actualizado (o previo si no hay actualizado). Montos con IVA incluido.'
            : 'La clasificación agrupa la partida por el catálogo de conceptos. El gasto (comprometido, ejercido, pagado) llega solo desde las órdenes, recepciones y facturas ligadas a la partida. Monto con IVA incluido.'}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div>
          {isEdit && onDelete ? (
            <Button
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
              disabled={submitting}
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="size-4" />
              Eliminar
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
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

      {isEdit && onDelete ? (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          onConfirm={onDelete}
          title={`¿Eliminar “${editRow?.concepto ?? 'partida'}”?`}
          description="Marcará la partida de presupuesto como eliminada. Se preserva el historial para auditoría."
          confirmLabel="Eliminar"
          requireMotivo
        />
      ) : null}
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
