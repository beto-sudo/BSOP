'use client';

/**
 * Captura del crédito directo (pagaré) de una venta DILESA.
 *
 * Extraído de la fase 10 (Firmas Programadas) para reusarse en la **fase 8
 * (Dictaminada)**, donde se cierra la cuadratura con el saldo REAL del Anexo B
 * (ADR-048). El pagaré se define donde ya se conocen el crédito exacto y los
 * gastos notariales — no con el estimado de la fase 10.
 *
 * Recibe el `saldo` (pagaré necesario que deriva el motor de cuadratura) y los
 * valores persistidos; maneja su propio state, validación, guardado y la
 * generación del pagaré PDF. Reporta al padre si quedó guardado (gate del
 * submit de la fase). NO incluye la cobertura/cuadratura: eso lo pinta el panel
 * de cuadratura del contenedor.
 *
 * Tasas (regla Beto 2026-06-11): interés ORDINARIO = TIIE 28d + spread (mínimo
 * 4 puntos); interés MORATORIO = 3× el ordinario. Se derivan aquí y se
 * persisten como snapshot pactado de la venta.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { desglosarPagare } from '@/lib/dilesa/pagare-interes';
import { hoyISOMatamoros } from '@/lib/fecha-mx';

export type PlanPagoJson = { num?: number; fecha?: string; monto?: number };
type PlanRow = { fecha: string; monto: string };

export type CreditoDirectoInicial = {
  monto: number | null;
  plan: PlanPagoJson[] | null;
  tiie: number | null;
  spread: number | null;
  fechaSuscripcion: string | null;
  avalNombre: string | null;
  avalDomicilio: string | null;
};

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 2,
});
const money = (n: number | null | undefined): string =>
  n == null ? '—' : moneyFmt.format(Number(n));
const hoy = () => hoyISOMatamoros();

export function CreditoDirectoCaptura({
  ventaId,
  saldo,
  inicial,
  onGuardadoChange,
  canWrite = true,
}: {
  ventaId: string;
  /** Pagaré necesario (faltante de gastos) que deriva el motor de cuadratura. */
  saldo: number;
  inicial: CreditoDirectoInicial;
  /** Reporta al contenedor si el crédito directo quedó guardado (gate del submit). */
  onGuardadoChange?: (guardado: boolean) => void;
  /** Solo Dirección guarda/modifica el crédito directo (ADR-048). */
  canWrite?: boolean;
}) {
  const toast = useToast();
  const sb = useMemo(() => createSupabaseBrowserClient(), []);

  const [montoCD, setMontoCD] = useState<string>(
    inicial.monto != null ? String(inicial.monto) : ''
  );
  const [planPagos, setPlanPagos] = useState<PlanRow[]>(() => {
    if (inicial.monto == null) return [];
    const plan = Array.isArray(inicial.plan) ? inicial.plan : [];
    return plan.length > 0
      ? plan.map((p) => ({ fecha: p?.fecha ?? '', monto: String(p?.monto ?? '') }))
      : [{ fecha: '', monto: String(inicial.monto) }];
  });
  const [fechaSuscripcion, setFechaSuscripcion] = useState<string>(
    inicial.fechaSuscripcion || hoy()
  );
  const [tiie, setTiie] = useState<string>(inicial.tiie != null ? String(inicial.tiie) : '');
  const [spread, setSpread] = useState<string>(
    inicial.spread != null ? String(inicial.spread) : '4'
  );
  const [avalNombre, setAvalNombre] = useState<string>(inicial.avalNombre ?? '');
  const [avalDomicilio, setAvalDomicilio] = useState<string>(inicial.avalDomicilio ?? '');
  const [cdGuardado, setCdGuardado] = useState<boolean>(inicial.monto != null);
  const [savingCD, setSavingCD] = useState<boolean>(false);

  // Reporta el estado "guardado" al contenedor (gate del submit de la fase).
  useEffect(() => {
    onGuardadoChange?.(cdGuardado);
  }, [cdGuardado, onGuardadoChange]);

  // Default del monto del pagaré: el faltante que deriva el motor, una sola vez
  // y solo si aún no se capturó/persistió (igual patrón que la fase 10).
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || cdGuardado) return;
    if (inicial.monto != null) return;
    if (saldo <= 0.0049) return;
    prefilled.current = true;
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setMontoCD(saldo.toFixed(2));
    setPlanPagos([{ fecha: '', monto: saldo.toFixed(2) }]);
  }, [saldo, cdGuardado, inicial.monto]);

  const sumaPlan = useMemo(
    () => planPagos.reduce((s, r) => s + (Number(r.monto) || 0), 0),
    [planPagos]
  );
  const montoCDNum = Number(montoCD) || 0;
  const planCuadra = Math.abs(sumaPlan - montoCDNum) < 0.01 && montoCDNum > 0;

  const tiieNum = Number(tiie) || 0;
  const spreadNum = Number(spread) || 0;
  const ordinarioPct = tiieNum > 0 ? Math.round((tiieNum + spreadNum) * 100) / 100 : 0;
  const moratorioPct = ordinarioPct > 0 ? Math.round(ordinarioPct * 3 * 100) / 100 : 0;
  const desglose = useMemo(() => {
    if (ordinarioPct <= 0) return null;
    const filas = planPagos.filter((r) => r.fecha && Number(r.monto) > 0);
    if (filas.length === 0) return null;
    return desglosarPagare(
      filas.map((r) => ({ fecha: r.fecha, monto: Number(r.monto) })),
      ordinarioPct,
      fechaSuscripcion || null
    );
  }, [planPagos, ordinarioPct, fechaSuscripcion]);

  // Cualquier edición invalida el "guardado" (re-guardar antes del pagaré).
  const touchCD = useCallback(() => setCdGuardado(false), []);

  const setPlanRow = useCallback(
    (i: number, patch: Partial<PlanRow>) => {
      setPlanPagos((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
      touchCD();
    },
    [touchCD]
  );
  const addPlanRow = useCallback(() => {
    setPlanPagos((rows) => [...rows, { fecha: '', monto: '' }]);
    touchCD();
  }, [touchCD]);
  const removePlanRow = useCallback(
    (i: number) => {
      setPlanPagos((rows) => (rows.length <= 1 ? rows : rows.filter((_, idx) => idx !== i)));
      touchCD();
    },
    [touchCD]
  );

  const guardarCreditoDirecto = useCallback(async () => {
    if (montoCDNum <= 0) {
      toast.add({
        title: 'Monto inválido',
        description: 'Captura el monto del crédito directo.',
        type: 'error',
      });
      return;
    }
    if (planPagos.some((r) => !r.fecha || !(Number(r.monto) > 0))) {
      toast.add({
        title: 'Plan de pagos incompleto',
        description: 'Cada pago necesita fecha y monto mayor a cero.',
        type: 'error',
      });
      return;
    }
    if (!(tiieNum > 0)) {
      toast.add({
        title: 'Falta la TIIE',
        description: 'Captura la TIIE a 28 días vigente — el interés ordinario es TIIE + spread.',
        type: 'error',
      });
      return;
    }
    if (spreadNum < 4) {
      toast.add({
        title: 'Spread fuera de regla',
        description: 'El spread del interés ordinario es mínimo 4 puntos sobre la TIIE.',
        type: 'error',
      });
      return;
    }
    if (!planCuadra) {
      toast.add({
        title: 'El plan no cuadra',
        description: `La suma de los pagos (${money(sumaPlan)}) debe igualar el monto del crédito (${money(montoCDNum)}).`,
        type: 'error',
      });
      return;
    }
    setSavingCD(true);
    const planJson = planPagos.map((r, i) => ({
      num: i + 1,
      fecha: r.fecha,
      monto: Math.round((Number(r.monto) || 0) * 100) / 100,
    }));
    const { error: upErr } = await sb
      .schema('dilesa')
      .from('ventas')
      .update({
        monto_credito_directo: Math.round(montoCDNum * 100) / 100,
        cd_plan_pagos: planJson,
        cd_tiie28_pct: tiieNum,
        cd_spread_ordinario_pct: spreadNum,
        cd_interes_ordinario_pct: ordinarioPct,
        cd_interes_moratorio_pct: moratorioPct,
        cd_fecha_suscripcion: fechaSuscripcion || null,
        cd_aval_nombre: avalNombre.trim() || null,
        cd_aval_domicilio: avalDomicilio.trim() || null,
      })
      .eq('id', ventaId);
    setSavingCD(false);
    if (upErr) {
      toast.add({
        title: 'No se pudo guardar el crédito directo',
        description: getSupabaseErrorMessage(upErr, 'Error desconocido.'),
        type: 'error',
      });
      return;
    }
    setCdGuardado(true);
    toast.add({
      title: 'Crédito directo guardado',
      description: 'Ya puedes generar el pagaré.',
      type: 'success',
    });
  }, [
    avalDomicilio,
    avalNombre,
    fechaSuscripcion,
    montoCDNum,
    moratorioPct,
    ordinarioPct,
    planCuadra,
    planPagos,
    sb,
    spreadNum,
    sumaPlan,
    tiieNum,
    toast,
    ventaId,
  ]);

  return (
    <div>
      <p className="mb-3 text-xs text-[var(--text)]/60">
        Configura el monto y el plan de pagos, guarda, genera el pagaré, imprímelo y súbelo firmado.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Monto del crédito directo *">
          <Input
            type="number"
            step="0.01"
            min="0"
            value={montoCD}
            onChange={(e) => {
              setMontoCD(e.target.value);
              touchCD();
            }}
          />
          <Hint>Saldo a cubrir: {money(saldo)}</Hint>
        </Field>
        <Field label="Fecha de suscripción del pagaré">
          <Input
            type="date"
            value={fechaSuscripcion}
            onChange={(e) => {
              setFechaSuscripcion(e.target.value);
              touchCD();
            }}
          />
        </Field>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
            Plan de pagos *
          </span>
          <button
            type="button"
            onClick={addPlanRow}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text)]/80 hover:bg-[var(--bg)]/40"
          >
            <Plus className="h-3 w-3" /> Agregar pago
          </button>
        </div>
        <div className="space-y-2">
          {planPagos.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 text-xs text-[var(--text)]/50">{i + 1}.</span>
              <Input
                type="date"
                value={r.fecha}
                onChange={(e) => setPlanRow(i, { fecha: e.target.value })}
                className="flex-1"
              />
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="Monto"
                value={r.monto}
                onChange={(e) => setPlanRow(i, { monto: e.target.value })}
                className="w-36"
              />
              <button
                type="button"
                onClick={() => removePlanRow(i)}
                disabled={planPagos.length <= 1}
                className="rounded-md p-1.5 text-[var(--text)]/50 hover:bg-[var(--bg)]/40 hover:text-red-500 disabled:opacity-30"
                title="Quitar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <p
          className={`mt-2 text-[11px] ${
            planCuadra
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-amber-700 dark:text-amber-300'
          }`}
        >
          Suma del plan (capital): {money(sumaPlan)} / {money(montoCDNum)}{' '}
          {planCuadra
            ? '✓ cuadra'
            : '— debe igualar el monto del crédito; el interés ordinario se calcula aparte'}
        </p>

        {desglose ? (
          <div className="mt-3 overflow-hidden rounded-md border border-[var(--border)]">
            <div className="border-b border-[var(--border)] bg-[var(--bg)]/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text)]/60">
              Desglose con interés ordinario ({ordinarioPct}% anual, saldos insolutos, año de 360
              días) — así saldrá en el pagaré
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[var(--text)]/50">
                  <th className="px-3 py-1 text-left font-medium">No.</th>
                  <th className="px-3 py-1 text-left font-medium">Vencimiento</th>
                  <th className="px-3 py-1 text-right font-medium">Capital</th>
                  <th className="px-3 py-1 text-right font-medium">Interés</th>
                  <th className="px-3 py-1 text-right font-medium">Pago total</th>
                </tr>
              </thead>
              <tbody>
                {desglose.parcialidades.map((p) => (
                  <tr key={p.num} className="border-t border-[var(--border)]/60">
                    <td className="px-3 py-1">{p.num}</td>
                    <td className="px-3 py-1">
                      {p.fecha}
                      <span className="ml-1 text-[var(--text)]/40">({p.dias} días)</span>
                    </td>
                    <td className="px-3 py-1 text-right">{money(p.capital)}</td>
                    <td className="px-3 py-1 text-right">{money(p.interes)}</td>
                    <td className="px-3 py-1 text-right font-medium">{money(p.pago)}</td>
                  </tr>
                ))}
                <tr className="border-t border-[var(--border)] bg-[var(--bg)]/40 font-semibold">
                  <td className="px-3 py-1.5" colSpan={2}>
                    Total
                  </td>
                  <td className="px-3 py-1.5 text-right">{money(desglose.totalCapital)}</td>
                  <td className="px-3 py-1.5 text-right">{money(desglose.totalInteres)}</td>
                  <td className="px-3 py-1.5 text-right">{money(desglose.totalPagar)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="TIIE 28d (%) *">
          <Input
            type="number"
            step="0.01"
            min="0"
            value={tiie}
            onChange={(e) => {
              setTiie(e.target.value);
              touchCD();
            }}
          />
          <Hint>Tasa vigente a la suscripción</Hint>
        </Field>
        <Field label="Spread ordinario (puntos) *">
          <Input
            type="number"
            step="0.01"
            min="4"
            value={spread}
            onChange={(e) => {
              setSpread(e.target.value);
              touchCD();
            }}
          />
          <Hint>Mínimo 4 sobre la TIIE, editable a más</Hint>
        </Field>
      </div>
      {ordinarioPct > 0 ? (
        <p className="mt-2 rounded-md border border-[var(--border)] bg-[var(--bg)]/30 px-3 py-2 text-[11px] text-[var(--text)]/70">
          Interés ordinario: TIIE {tiieNum.toFixed(2)}% + {spreadNum.toFixed(2)} puntos ={' '}
          <span className="font-semibold">{ordinarioPct.toFixed(2)}% anual</span> · Interés
          moratorio (3× ordinario):{' '}
          <span className="font-semibold">{moratorioPct.toFixed(2)}% anual</span>
          {spreadNum < 4 ? (
            <span className="ml-1 text-amber-700 dark:text-amber-300">— el spread mínimo es 4</span>
          ) : null}
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
          Captura la TIIE para derivar el interés ordinario (TIIE + spread) y el moratorio (3×
          ordinario).
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Aval — nombre (opcional)">
          <Input
            value={avalNombre}
            onChange={(e) => {
              setAvalNombre(e.target.value);
              touchCD();
            }}
          />
        </Field>
        <Field label="Aval — domicilio (opcional)">
          <Input
            value={avalDomicilio}
            onChange={(e) => {
              setAvalDomicilio(e.target.value);
              touchCD();
            }}
          />
        </Field>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={guardarCreditoDirecto}
          disabled={savingCD || !canWrite}
        >
          {savingCD ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" /> Guardando…
            </>
          ) : (
            <>
              <Save className="mr-2 size-4" /> Guardar crédito directo
            </>
          )}
        </Button>
        {!canWrite ? (
          <span className="text-[11px] text-amber-700 dark:text-amber-300">
            Solo Dirección guarda el crédito directo.
          </span>
        ) : null}
        {cdGuardado ? (
          <a
            href={`/api/dilesa/ventas/${ventaId}/pdf/pagare-credito-directo`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--text)]/80 hover:bg-[var(--bg)]/40 hover:text-[var(--text)]"
          >
            <Download className="h-3.5 w-3.5" /> Generar pagaré
          </a>
        ) : (
          <span className="text-[11px] text-[var(--text)]/50">
            Guarda el crédito directo para habilitar el pagaré.
          </span>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--text)]/50">
        {label}
      </span>
      {children}
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-[var(--text)]/50">{children}</p>;
}
