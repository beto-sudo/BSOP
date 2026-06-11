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
const numOrNull = (s: string): number | null => (s.trim() === '' ? null : Number(s));

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

  const descTotal =
    (Number(values.descuentoPrecio) || 0) +
    (Number(values.descuentoEquipamiento) || 0) +
    (Number(values.descuentoGastosEscr) || 0) +
    (Number(values.descuentoNotaCredito) || 0);

  async function guardar() {
    setSaving(true);
    const sb = createSupabaseBrowserClient();
    const { error } = await sb
      .schema('dilesa')
      .from('ventas')
      .update({
        descuento_precio: numOrNull(values.descuentoPrecio),
        descuento_equipamiento: numOrNull(values.descuentoEquipamiento),
        descuento_gastos_escrituracion: numOrNull(values.descuentoGastosEscr),
        descuento_nota_credito: numOrNull(values.descuentoNotaCredito),
        // El total se mantiene en sync con la suma de los buckets. El tope
        // (descuento_maximo_autorizado) ya no se captura: se deriva de la
        // promoción de la solicitud (solo queda poblado en legacy Coda).
        descuento_total: descTotal,
      })
      .eq('id', ventaId);
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

      <p
        className={`mt-2 text-[11px] ${
          descTotal > descuentoMaximo
            ? 'font-medium text-red-600 dark:text-red-400'
            : 'text-[var(--text)]/55'
        }`}
      >
        Descuento otorgado total:{' '}
        <span className="font-semibold">{moneyFmt.format(descTotal)}</span> (suma de los 4 buckets)
        {descTotal > descuentoMaximo
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
