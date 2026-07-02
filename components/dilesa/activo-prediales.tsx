'use client';

/**
 * ActivoPrediales — panel de prediales de UN activo (expediente S2,
 * iniciativa `dilesa-portafolio-predios`).
 *
 * Muestra las cuentas catastrales del activo y su historia por ejercicio
 * (montos del recibo municipal + estado + convenio). El adeudo neto se
 * DERIVA: suma de montos × (1 − descuento del convenio) — los montos
 * capturados nunca se reescriben. v1 lectura; el registro de pagos vive en
 * el tab Prediales del hub (S3).
 */

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/format';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import {
  adeudoNetoEjercicio,
  ESTADO_EJERCICIO_LABEL,
  ESTADO_EJERCICIO_TONE,
  totalBrutoEjercicio,
  type PredialCuenta,
  type PredialEjercicio,
} from '@/lib/dilesa/prediales';

export function ActivoPrediales({ activoId, empresaId }: { activoId: string; empresaId: string }) {
  const [cuentas, setCuentas] = useState<PredialCuenta[]>([]);
  const [ejercicios, setEjercicios] = useState<PredialEjercicio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    // Sin setState síncrono antes del primer await (regla react-hooks):
    // loading arranca true del useState.
    void (async () => {
      const sb = createSupabaseBrowserClient();
      const { data: cts, error: cErr } = await sb
        .schema('dilesa')
        .from('cuentas_prediales')
        .select('id, clave_catastral, folio, superficie_fiscal_m2, estatus, notas')
        .eq('empresa_id', empresaId)
        .eq('activo_id', activoId)
        .is('deleted_at', null)
        .order('clave_catastral');
      if (!vivo) return;
      if (cErr) {
        setError(getSupabaseErrorMessage(cErr, 'No se pudieron cargar las cuentas prediales.'));
        setLoading(false);
        return;
      }
      const cuentasData = (cts ?? []) as PredialCuenta[];
      setCuentas(cuentasData);
      if (cuentasData.length === 0) {
        setEjercicios([]);
        setLoading(false);
        return;
      }
      const { data: ejs, error: eErr } = await sb
        .schema('dilesa')
        .from('prediales_ejercicios')
        .select(
          'id, cuenta_id, ejercicio, predial, recargos, aseo, recargos_aseo, bomberos, recargos_bomberos, estado, fecha_pago, monto_pagado, notas, convenio:prediales_convenios(id, nombre, descuento_pct, estado)'
        )
        .in(
          'cuenta_id',
          cuentasData.map((c) => c.id)
        )
        .order('ejercicio', { ascending: false });
      if (!vivo) return;
      if (eErr) {
        setError(getSupabaseErrorMessage(eErr, 'No se pudieron cargar los ejercicios.'));
      } else {
        setEjercicios((ejs ?? []) as unknown as PredialEjercicio[]);
      }
      setLoading(false);
    })();
    return () => {
      vivo = false;
    };
  }, [activoId, empresaId]);

  const adeudoTotal = useMemo(
    () => ejercicios.reduce((acc, e) => acc + adeudoNetoEjercicio(e), 0),
    [ejercicios]
  );

  if (loading) {
    return (
      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="h-5 w-40 animate-pulse rounded bg-[var(--border)]/60" />
        <div className="mt-4 h-24 animate-pulse rounded bg-[var(--border)]/40" />
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--text)]/60">
          Prediales
        </h2>
        {adeudoTotal > 0 ? (
          <span className="text-sm font-semibold text-[var(--danger)]">
            Adeudo: {formatCurrency(adeudoTotal)}
          </span>
        ) : cuentas.length > 0 ? (
          <Badge tone="success">Al corriente</Badge>
        ) : null}
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      {cuentas.length === 0 && !error ? (
        <p className="text-sm text-[var(--text)]/60">
          Este activo no tiene cuentas prediales registradas.
        </p>
      ) : null}

      <div className="space-y-4">
        {cuentas.map((c) => {
          const ejs = ejercicios.filter((e) => e.cuenta_id === c.id);
          return (
            <div key={c.id}>
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium tabular-nums text-[var(--text)]">
                  {c.clave_catastral}
                </span>
                {c.folio ? (
                  <span className="text-xs text-[var(--text)]/50">folio {c.folio}</span>
                ) : null}
                {c.superficie_fiscal_m2 != null ? (
                  <span className="text-xs text-[var(--text)]/50">
                    {c.superficie_fiscal_m2.toLocaleString('es-MX')} m² fiscales
                  </span>
                ) : null}
                {c.estatus !== 'activa' ? <Badge tone="warning">{c.estatus}</Badge> : null}
              </div>
              {ejs.length === 0 ? (
                <p className="text-xs text-[var(--text)]/50">Sin ejercicios capturados.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                      <th className="py-1 font-medium">Año</th>
                      <th className="py-1 text-right font-medium">Cargos</th>
                      <th className="py-1 text-right font-medium">Adeudo neto</th>
                      <th className="py-1 text-right font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ejs.map((e) => {
                      const bruto = totalBrutoEjercicio(e);
                      const neto = adeudoNetoEjercicio(e);
                      return (
                        <tr key={e.id} className="border-t border-[var(--border)]/50">
                          <td className="py-1.5 tabular-nums">{e.ejercicio}</td>
                          <td
                            className="py-1.5 text-right tabular-nums"
                            title={[
                              e.predial != null ? `Predial ${formatCurrency(e.predial)}` : null,
                              e.recargos != null ? `Recargos ${formatCurrency(e.recargos)}` : null,
                              e.aseo != null ? `Aseo ${formatCurrency(e.aseo)}` : null,
                              e.bomberos != null ? `Bomberos ${formatCurrency(e.bomberos)}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          >
                            {bruto > 0 ? formatCurrency(bruto) : '—'}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {e.estado === 'pagado' || e.estado === 'condonado' ? (
                              <span className="text-[var(--text)]/40">—</span>
                            ) : neto > 0 ? (
                              <span className="font-medium">{formatCurrency(neto)}</span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-1.5 text-right">
                            <Badge tone={ESTADO_EJERCICIO_TONE[e.estado] ?? 'neutral'}>
                              {ESTADO_EJERCICIO_LABEL[e.estado] ?? e.estado}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>

      {ejercicios.some((e) => e.convenio && e.estado === 'convenio') ? (
        <p className="mt-3 border-t border-[var(--border)]/50 pt-2 text-xs text-[var(--text)]/50">
          El adeudo neto aplica el descuento del convenio vigente (
          {ejercicios.find((e) => e.convenio)?.convenio?.nombre}). Los montos del recibo se
          conservan íntegros.
        </p>
      ) : null}
    </section>
  );
}
