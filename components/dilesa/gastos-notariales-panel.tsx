'use client';

/**
 * Panel de cálculo de gastos notariales en la fase de dictaminar.
 *
 * Muestra el desglose que calcula `lib/dilesa/gastos-notariales` (Municipio /
 * Registro Público / Otros) para que Dirección lo confirme o ajuste contra el
 * presupuesto del notario — reemplaza el «los calcula el notario» opaco. El
 * total precarga el campo «Gastos de escrituración»; aquí vive el botón para
 * (re)aplicarlo y el check de propiedad previa que elige la columna del
 * tabulador de compraventa. Iniciativa `dilesa-gastos-notariales`.
 */

import { CheckCircle2 } from 'lucide-react';

import type { GastosNotarialesDesglose } from '@/lib/dilesa/gastos-notariales';
import { Button } from '@/components/ui/button';

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});
const money = (n: number | null | undefined): string =>
  n == null ? '—' : moneyFmt.format(Number(n));

export type GastosNotarialesPanelProps = {
  desglose: GastosNotarialesDesglose;
  /** Lo que hay hoy en el campo «Gastos de escrituración» (para comparar). */
  gastosCapturado: number | null;
  tienePropiedad: boolean;
  onTienePropiedadChange: (v: boolean) => void;
  /** Valor catastral (string del input) + setter — alimenta la valuación catastral. */
  valorCatastral: string;
  onValorCatastralChange: (v: string) => void;
  /** Setea el campo de gastos = total calculado. */
  onUsarCalculo: () => void;
  /** Solo Dirección edita el check y aplica el cálculo. */
  editable: boolean;
};

export function GastosNotarialesPanel({
  desglose,
  gastosCapturado,
  tienePropiedad,
  onTienePropiedadChange,
  valorCatastral,
  onValorCatastralChange,
  onUsarCalculo,
  editable,
}: GastosNotarialesPanelProps) {
  const total = desglose.total;
  const hayCapturado = gastosCapturado != null && gastosCapturado > 0;
  const coincide = hayCapturado && Math.abs((gastosCapturado as number) - total) < 0.5;
  const diferencia = hayCapturado ? (gastosCapturado as number) - total : 0;

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text)]/80">
        <input
          type="checkbox"
          checked={tienePropiedad}
          onChange={(e) => onTienePropiedadChange(e.target.checked)}
          disabled={!editable}
          className="h-4 w-4 rounded border-[var(--border)]"
        />
        ¿Algún derechohabiente ya tiene propiedad a su nombre?
        <span className="text-[var(--text)]/45">(cambia la tarifa de compraventa)</span>
      </label>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="text-[var(--text)]/80">Valor catastral:</label>
        <input
          type="number"
          min="0"
          step="1"
          value={valorCatastral}
          onChange={(e) => onValorCatastralChange(e.target.value)}
          disabled={!editable}
          placeholder="del predial / CLG"
          className="w-44 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
        />
        {desglose.faltaValorCatastral ? (
          <span className="text-[12px] text-amber-600">
            falta — la valuación catastral queda en $0
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {desglose.bloques.map((b) => (
          <div
            key={b.clave}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
          >
            <div className="mb-2 text-xs font-medium text-[var(--text)]/60">{b.etiqueta}</div>
            <div className="space-y-1">
              {b.lineas.map((l) => (
                <div key={l.clave} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className={l.calculado ? 'text-[var(--text)]' : 'text-[var(--text)]/60'}>
                    {l.calculado ? (
                      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" />
                    ) : null}
                    {l.etiqueta}
                  </span>
                  <span className="tabular-nums">{money(l.monto)}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between border-t border-[var(--border)] pt-2 text-[13px] font-medium">
              <span>Subtotal</span>
              <span className="tabular-nums">{money(b.subtotal)}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-[var(--text)]/45">
        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" />
        calculado por operación · el resto son cuotas fijas de configuración
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
        <div>
          <div className="text-xs text-[var(--text)]/60">Total calculado</div>
          <div className="text-2xl font-semibold tabular-nums">{money(total)}</div>
        </div>

        {coincide ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-1.5 text-[13px] text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            Coincide con lo capturado
          </span>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {hayCapturado ? (
              <span className="text-[13px] text-[var(--text)]/70">
                Capturado {money(gastosCapturado)} ·{' '}
                <span className={diferencia > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                  {diferencia > 0 ? '+' : ''}
                  {money(diferencia)}
                </span>
              </span>
            ) : null}
            {editable ? (
              <Button type="button" variant="outline" size="sm" onClick={onUsarCalculo}>
                {hayCapturado ? 'Usar el cálculo' : 'Usar este total'}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
