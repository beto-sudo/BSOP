'use client';

/**
 * Editor de descuentos de la cuadratura (pestaña Cuadratura del Expediente de
 * Operación). Tiene DOS modos según el modelo de la venta:
 *
 * - CON DESGLOSE (ADR-045 — ventas activas y nuevas): el descuento ya NO se
 *   captura aquí; se deriva. Muestra el DESCUENTO REAL (= Escrituración − Valor
 *   Real, la columna "Descuento" de Michelle) partido en dos: el "descuento por
 *   promoción" (el bono autorizado del catálogo `dilesa.promociones`, topado al
 *   máximo) y el "descuento por sobreprecio" (el resto, que DILESA concede
 *   subiendo el precio — pendiente de formalizar como Máxima Aportación en la
 *   solicitud). Los 4 buckets viejos ya no aplican al modelo desglosado.
 *
 * - LEGACY (ventas viejas de Coda sin desglose): editor de los 4 buckets. El
 *   total se AUTO-CALCULA como la suma de los buckets (ya no se captura aparte —
 *   antes era un campo manual que había que cuadrar a mano). Las ventas
 *   total-only de Coda conservan su total hasta que se itemice en buckets.
 *
 * Derivados read-only en ambos modos: Apoyo Infonavit (catálogo
 * `tipos_credito`) y Descuento Máximo Autorizado (promoción de la solicitud).
 *
 * Iniciativa `dilesa-cuadratura-sobreprecio`.
 */

import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { useToast } from '@/components/ui/toast';
import { partirDescuento } from '@/lib/dilesa/cuadratura';

export type CuadraturaInputsStr = {
  /** Total del descuento. Con buckets = su suma (auto); legacy total-only = lo capturado en Coda. */
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

export function CuadraturaAjustes({
  ventaId,
  values,
  onPatch,
  canWrite,
  apoyoInfonavit,
  tipoCredito,
  descuentoMaximo,
  descuentoMaximoFuente,
  tieneDesglose,
  descuentoPromocion,
  descuentoReal,
  sobreprecioCapturado,
  saldoGastosResolucion,
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
  /** Si la venta usa el modelo desglosado (ADR-045). */
  tieneDesglose: boolean;
  /** Promoción/bono de gastos AUTORIZADA (catálogo de promociones). Es el TOPE
   *  del "descuento por promoción"; el resto del descuento real es sobreprecio. */
  descuentoPromocion: number;
  /** Descuento real = Escrituración − Valor Real (columna "Descuento" de
   *  Michelle). El total que se parte en promoción (topada al autorizado) +
   *  sobreprecio (el resto que DILESA concede subiendo el precio). */
  descuentoReal: number;
  /** Sobreprecio YA capturado como productos adicionales (precio inflado). Sirve
   *  para señalar cuánto del descuento por sobreprecio falta formalizar como
   *  Máxima Aportación en la solicitud. */
  sobreprecioCapturado: number;
  /** Resolución del faltante de gastos en la dictaminación (Sprint 3 de
   *  `dilesa-saldos-residuales`). Renombra la parte del "descuento" sin sobreprecio
   *  capturado detrás según la decisión de Dirección, para que no se lea como
   *  "sobreprecio" cuando en realidad es un saldo a resolver. `null` = sin resolver. */
  saldoGastosResolucion?: 'cobrar' | 'absorber' | null;
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  // ── Modo DESGLOSE: el descuento total (= Escrituración − Valor Real, columna
  //    "Descuento" de Michelle) se PARTE en promoción (bono autorizado, topado al
  //    máximo) + sobreprecio (el resto, que DILESA concede subiendo el precio).
  //    No se captura aquí; se deriva. ──
  if (tieneDesglose) {
    const descuentoTotal = Math.round(descuentoReal * 100) / 100;
    // Parte el descuento real en sobreprecio (piso = el capturado, que sube el
    // precio para que el crédito absorba gastos) + promoción (bono autorizado, el
    // residual). Mismo helper que la card de cobertura del presupuesto notarial.
    const { promocion: descuentoPorPromocion, sobreprecio: descuentoPorSobreprecio } =
      partirDescuento(descuentoReal, descuentoPromocion, sobreprecioCapturado);
    // La parte del "descuento por sobreprecio" SIN sobreprecio capturado detrás no es
    // sobreprecio real: es el faltante de gastos que Dirección resuelve en la
    // dictaminación (cobrar/absorber/depósito). Se separa para no leerlo como
    // "sobreprecio". El total NO cambia (= descuento real); cuando el cliente paga, el
    // valor real sube y el descuento real baja solo. (Sprint 3 dilesa-saldos-residuales.)
    const saldoGastosPorResolver = Math.max(
      0,
      Math.round((descuentoPorSobreprecio - sobreprecioCapturado) * 100) / 100
    );
    const sobreprecioReal =
      Math.round((descuentoPorSobreprecio - saldoGastosPorResolver) * 100) / 100;
    const saldoGastosLabel =
      saldoGastosResolucion === 'absorber'
        ? '(+) Aportación DILESA (Máxima Aportación)'
        : saldoGastosResolucion === 'cobrar'
          ? '(+) Por cobrar al cliente (pagaré)'
          : '(+) Saldo de gastos por resolver';
    return (
      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text)]/55">
          Descuento de la operación
        </h3>
        <div className="space-y-1">
          <DerivadoRow
            label="Descuento por promoción (bono autorizado)"
            value={moneyFmt.format(descuentoPorPromocion)}
          />
          {sobreprecioReal > 0.5 ? (
            <DerivadoRow
              label="(+) Descuento por sobreprecio"
              value={moneyFmt.format(sobreprecioReal)}
            />
          ) : null}
          {saldoGastosPorResolver > 0.5 ? (
            <DerivadoRow
              label={saldoGastosLabel}
              value={moneyFmt.format(saldoGastosPorResolver)}
              tone={saldoGastosResolucion == null ? 'warn' : undefined}
            />
          ) : null}
          <div className="my-1 border-t border-[var(--border)]" />
          <DerivadoRow
            label="(=) Descuento real frente al escriturado"
            value={moneyFmt.format(descuentoTotal)}
            strong
          />
        </div>
        <div className="mt-2 flex items-center justify-between rounded-md border border-dashed border-[var(--border)] px-3 py-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--text)]/50">
            Apoyo Infonavit · subsidio (no es descuento DILESA)
            {tipoCredito ? ` · ${tipoCredito}` : ''}
          </span>
          <span className="text-xs font-semibold tabular-nums text-[var(--text)]/85">
            {moneyFmt.format(apoyoInfonavit)}
          </span>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--text)]/50">
          El <strong>descuento por promoción</strong> es el bono autorizado del catálogo (tope{' '}
          {moneyFmt.format(descuentoPromocion)}).
          {sobreprecioReal > 0.5
            ? ` El descuento por sobreprecio (${moneyFmt.format(sobreprecioReal)}) es lo que DILESA concede subiendo el precio (ya capturado).`
            : ''}
          {saldoGastosPorResolver > 0.5
            ? ` El ${saldoGastosResolucion == null ? 'saldo de gastos por resolver' : saldoGastosResolucion === 'absorber' ? 'monto que DILESA absorbe (Máxima Aportación)' : 'monto por cobrar al cliente'} (${moneyFmt.format(saldoGastosPorResolver)}) no es sobreprecio: el bono y el enganche no alcanzan a cubrir los gastos. Dirección lo resuelve en la dictaminación (cobrar con pagaré, absorber como Máxima Aportación, o que el cliente lo deposite); al pagarse, el descuento real baja solo.`
            : ''}{' '}
          Todo junto es el descuento real frente al valor escriturado (
          {moneyFmt.format(descuentoTotal)}).
        </p>
      </section>
    );
  }

  // ── Modo LEGACY: buckets con total auto-calculado (suma de los buckets) ──
  const hasBuckets =
    values.descuentoPrecio.trim() !== '' ||
    values.descuentoEquipamiento.trim() !== '' ||
    values.descuentoGastosEscr.trim() !== '' ||
    values.descuentoNotaCredito.trim() !== '';
  const sumBuckets =
    (Number(values.descuentoPrecio) || 0) +
    (Number(values.descuentoEquipamiento) || 0) +
    (Number(values.descuentoGastosEscr) || 0) +
    (Number(values.descuentoNotaCredito) || 0);
  // El total ES la suma de los buckets cuando hay reparto; si no, el total
  // legacy capturado en Coda (se conserva hasta que se itemice).
  const total = hasBuckets ? sumBuckets : Number(values.descuentoTotal) || 0;

  async function guardar() {
    setSaving(true);
    const sb = createSupabaseBrowserClient();
    // Vía RPC auditada. Con buckets → los manda + el total = su suma (la función
    // exige sum=total, que se cumple por construcción). Sin buckets → modo
    // total-only (no toca el reparto), preservando el total legacy.
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

      <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[var(--text)]/40">
        Reparto del descuento · en qué se aplica
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

      {/* Total = suma de los buckets (auto, ya no se captura). */}
      <div className="mt-3 flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--bg)]/30 px-3 py-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--text)]/50">
          Descuento total {hasBuckets ? '· suma de los buckets' : '· legacy (sin desglose)'}
        </span>
        <span className="text-xs font-semibold tabular-nums text-[var(--text)]/85">
          {moneyFmt.format(total)}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between rounded-md border border-dashed border-[var(--border)] px-3 py-2">
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
          total > descuentoMaximo
            ? 'font-medium text-red-600 dark:text-red-400'
            : 'text-[var(--text)]/55'
        }`}
      >
        El total es la suma de los buckets.
        {total > descuentoMaximo
          ? ` EXCEDE el máximo autorizado de ${moneyFmt.format(descuentoMaximo)}.`
          : ` Máximo autorizado: ${moneyFmt.format(descuentoMaximo)}.`}{' '}
        El tope viene de la promoción de la solicitud y el apoyo Infonavit del catálogo de tipos de
        crédito — ninguno se captura.
      </p>
    </section>
  );
}

function DerivadoRow({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'warn';
}) {
  const valueTone = tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--text)]';
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className={strong ? 'font-medium text-[var(--text)]/80' : 'text-[var(--text)]/65'}>
        {label}
      </span>
      <span
        className={`tabular-nums ${valueTone} ${strong ? 'text-base font-semibold' : 'font-medium'}`}
      >
        {value}
      </span>
    </div>
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
