'use client';

/**
 * Editor de las entradas de cuadratura (pestaña Cuadratura del Expediente de
 * Operación). Captura/ajusta los 4 buckets de descuento — el saldo y los
 * derivados recomputan en vivo (el padre re-calcula con
 * `lib/dilesa/cuadratura.ts`).
 *
 * Derivados (read-only, no se capturan):
 * - Apoyo Infonavit — del catálogo `dilesa.tipos_credito` según el tipo de
 *   crédito de la venta (misma fuente que el RPC `fn_calcular_precio_venta`).
 * - Descuento Máximo Autorizado — el monto de la promoción/bono elegido en la
 *   Solicitud de Asignación (`promociones.monto` vía `ventas.promocion_id`).
 *   Son bonos flexibles: el cliente los reparte entre los 4 buckets; si la
 *   suma excede el tope, se alerta (regla Beto 2026-06-11). Ventas legacy de
 *   Coda sin promo caen al `descuento_maximo_autorizado` capturado allá.
 *
 * Iniciativa `dilesa-ventas-expediente` (Sprint 2b; tope derivado post-cierre).
 */

import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { useToast } from '@/components/ui/toast';

export type CuadraturaInputsStr = {
  /** El "cuánto" autoritativo del descuento. Los buckets lo reparten. */
  descuentoTotal: string;
  descuentoPrecio: string;
  descuentoEquipamiento: string;
  descuentoGastosEscr: string;
  descuentoNotaCredito: string;
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});
const round2 = (v: number): number => Math.round(v * 100);

export function CuadraturaAjustes({
  ventaId,
  values,
  onPatch,
  canWrite,
  apoyoInfonavit,
  tipoCredito,
  descuentoMaximo,
  descuentoMaximoFuente,
}: {
  ventaId: string;
  values: CuadraturaInputsStr;
  onPatch: (patch: Partial<CuadraturaInputsStr>) => void;
  canWrite: boolean;
  /** Apoyo Infonavit derivado del catálogo (auto, read-only). */
  apoyoInfonavit: number;
  /** Nombre del tipo de crédito, para etiquetar de dónde sale el apoyo. */
  tipoCredito: string | null;
  /** Tope de descuento derivado de la promoción de la solicitud (auto, read-only). */
  descuentoMaximo: number;
  /** Nombre de la promoción (o "legacy Coda"); null = sin promo ni captura legacy. */
  descuentoMaximoFuente: string | null;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  // `total` es el "cuánto" autoritativo. Los buckets son el reparto.
  const total = Number(values.descuentoTotal) || 0;
  const sumBuckets =
    (Number(values.descuentoPrecio) || 0) +
    (Number(values.descuentoEquipamiento) || 0) +
    (Number(values.descuentoGastosEscr) || 0) +
    (Number(values.descuentoNotaCredito) || 0);
  const hasBuckets =
    values.descuentoPrecio.trim() !== '' ||
    values.descuentoEquipamiento.trim() !== '' ||
    values.descuentoGastosEscr.trim() !== '' ||
    values.descuentoNotaCredito.trim() !== '';
  // Amarre: si hay reparto, su suma debe cuadrar con el total.
  const desgloseCuadra = !hasBuckets || round2(sumBuckets) === round2(total);

  async function guardar() {
    if (hasBuckets && !desgloseCuadra) {
      toast.add({
        title: 'El desglose no cuadra',
        description: `La suma de los buckets (${moneyFmt.format(sumBuckets)}) debe ser igual al descuento total (${moneyFmt.format(total)}).`,
        type: 'error',
      });
      return;
    }
    setSaving(true);
    const sb = createSupabaseBrowserClient();
    // Vía RPC auditada (amarre + core.audit_log). Sin desglose → modo
    // total-only (la RPC no toca los buckets). Con desglose → exige sum=total.
    // Sin desglose ⇒ se omiten los buckets (la función usa DEFAULT NULL =
    // modo total-only, no toca el reparto). Con desglose ⇒ números (la
    // función exige sum=total).
    const { error } = await sb.schema('dilesa').rpc('fn_actualizar_descuentos_venta', {
      p_venta_id: ventaId,
      p_descuento_total: total,
      p_descuento_precio: hasBuckets ? Number(values.descuentoPrecio) || 0 : undefined,
      p_descuento_equipamiento: hasBuckets ? Number(values.descuentoEquipamiento) || 0 : undefined,
      p_descuento_gastos_escrituracion: hasBuckets
        ? Number(values.descuentoGastosEscr) || 0
        : undefined,
      p_descuento_nota_credito: hasBuckets ? Number(values.descuentoNotaCredito) || 0 : undefined,
    });
    setSaving(false);
    if (error) {
      toast.add({
        title: 'No se pudo guardar',
        description: getSupabaseErrorMessage(error, 'Error desconocido.'),
        type: 'error',
      });
      return;
    }
    toast.add({
      title: 'Ajustes guardados',
      description: 'La cuadratura se actualizó.',
      type: 'success',
    });
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text)]/55">
          Ajustes de cuadratura
        </h3>
        {canWrite ? (
          <Button type="button" size="sm" variant="outline" onClick={guardar} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Guardando…
              </>
            ) : (
              <>
                <Save className="mr-1.5 size-3.5" /> Guardar
              </>
            )}
          </Button>
        ) : null}
      </div>

      <div className="mb-3">
        <Campo label="Descuento total (cuánto)">
          <NumInput
            value={values.descuentoTotal}
            onChange={(v) => onPatch({ descuentoTotal: v })}
            disabled={!canWrite}
          />
        </Campo>
      </div>

      <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[var(--text)]/40">
        Reparto · en qué se aplica (opcional; debe sumar el total)
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo label="Descuento al precio">
          <NumInput
            value={values.descuentoPrecio}
            onChange={(v) => onPatch({ descuentoPrecio: v })}
            disabled={!canWrite}
          />
        </Campo>
        <Campo label="Descuento equipamiento">
          <NumInput
            value={values.descuentoEquipamiento}
            onChange={(v) => onPatch({ descuentoEquipamiento: v })}
            disabled={!canWrite}
          />
        </Campo>
        <Campo label="Descuento gastos escrituración">
          <NumInput
            value={values.descuentoGastosEscr}
            onChange={(v) => onPatch({ descuentoGastosEscr: v })}
            disabled={!canWrite}
          />
        </Campo>
        <Campo label="Descuento nota de crédito">
          <NumInput
            value={values.descuentoNotaCredito}
            onChange={(v) => onPatch({ descuentoNotaCredito: v })}
            disabled={!canWrite}
          />
        </Campo>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-md border border-dashed border-[var(--border)] px-3 py-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--text)]/50">
          Descuento máximo autorizado · auto
        </span>
        <span className="text-xs font-semibold tabular-nums text-[var(--text)]/85">
          {moneyFmt.format(descuentoMaximo)}
          <span className="ml-1.5 font-normal text-[var(--text)]/50">
            {descuentoMaximoFuente ? `· ${descuentoMaximoFuente}` : '· sin promoción aplicada'}
          </span>
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between rounded-md border border-dashed border-[var(--border)] px-3 py-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--text)]/50">
          Apoyo Infonavit · auto
        </span>
        <span className="text-xs font-semibold tabular-nums text-[var(--text)]/85">
          {moneyFmt.format(apoyoInfonavit)}
          {tipoCredito ? (
            <span className="ml-1.5 font-normal text-[var(--text)]/50">· {tipoCredito}</span>
          ) : null}
        </span>
      </div>

      {hasBuckets && !desgloseCuadra ? (
        <p className="mt-2 text-[11px] font-medium text-red-600 dark:text-red-400">
          El reparto suma <span className="font-semibold">{moneyFmt.format(sumBuckets)}</span> pero
          el descuento total es <span className="font-semibold">{moneyFmt.format(total)}</span> — no
          cuadran. Ajusta los buckets o el total antes de guardar.
        </p>
      ) : null}

      <p
        className={`mt-2 text-[11px] ${
          total > descuentoMaximo
            ? 'font-medium text-red-600 dark:text-red-400'
            : 'text-[var(--text)]/55'
        }`}
      >
        Descuento total: <span className="font-semibold">{moneyFmt.format(total)}</span>
        {hasBuckets ? ` · repartido ${moneyFmt.format(sumBuckets)}` : ' · sin desglose'}
        {total > descuentoMaximo
          ? ` — EXCEDE el máximo autorizado ${moneyFmt.format(descuentoMaximo)}`
          : ` de un máximo autorizado de ${moneyFmt.format(descuentoMaximo)}`}
        . El tope viene de la promoción elegida en la solicitud; el apoyo Infonavit, del catálogo de
        tipos de crédito — ninguno se captura.
      </p>
    </section>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--text)]/50">
        {label}
      </span>
      {children}
    </label>
  );
}

function NumInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Input
      type="number"
      step="0.01"
      min="0"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    />
  );
}
