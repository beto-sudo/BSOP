'use client';

/**
 * Editor de las entradas de cuadratura (pestaña Cuadratura del Expediente de
 * Operación). Captura/ajusta los 4 buckets de descuento y el tope de descuento
 * autorizado — el saldo y los derivados recomputan en vivo (el padre re-calcula
 * con `lib/dilesa/cuadratura.ts`).
 *
 * El apoyo Infonavit NO se captura: se deriva automáticamente del catálogo
 * `dilesa.tipos_credito` según el tipo de crédito de la venta (misma fuente que
 * usa el RPC `fn_calcular_precio_venta`). Aquí solo se muestra read-only.
 *
 * Iniciativa `dilesa-ventas-expediente` (Sprint 2b).
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
  descuentoMaximo: string;
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
}: {
  ventaId: string;
  values: CuadraturaInputsStr;
  onPatch: (patch: Partial<CuadraturaInputsStr>) => void;
  canWrite: boolean;
  /** Apoyo Infonavit derivado del catálogo (auto, read-only). */
  apoyoInfonavit: number;
  /** Nombre del tipo de crédito, para etiquetar de dónde sale el apoyo. */
  tipoCredito: string | null;
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
        descuento_maximo_autorizado: numOrNull(values.descuentoMaximo),
        // El total se mantiene en sync con la suma de los buckets.
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
        <Campo label="Descuento máximo autorizado">
          <NumInput
            value={values.descuentoMaximo}
            onChange={(v) => onPatch({ descuentoMaximo: v })}
            disabled={!canWrite}
          />
        </Campo>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-md border border-dashed border-[var(--border)] px-3 py-2">
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

      <p className="mt-2 text-[11px] text-[var(--text)]/55">
        Descuento otorgado total:{' '}
        <span className="font-semibold">{moneyFmt.format(descTotal)}</span> (suma de los 4 buckets).
        El apoyo Infonavit se toma del catálogo de tipos de crédito, no se captura.
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
