'use client';

/**
 * Cobranza · Saldos — antigüedad de saldos por cliente (CxC Sprint 3).
 *
 * Agrega los cargos abiertos (`erp.cxc_cargos` con saldo > 0) por cliente
 * y los reparte en buckets de vencimiento (vigente / 1-30 / 31-60 / 61-90
 * / >90). 100% derivado, sin captura. Cálculo client-side sobre los cargos
 * pendientes; nombres cargados en chunks (límite de URL de `.in()`).
 *
 * @responsive desktop-only — reporte de cobranza en escritorio.
 */

import { useEffect, useMemo, useState } from 'react';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive/desktop-only-notice';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

type Row = {
  personaId: string;
  cliente: string;
  vigente: number;
  b1: number;
  b2: number;
  b3: number;
  b4: number;
  total: number;
};

/** Días vencidos de un cargo; ≤ 0 (o sin fecha) = vigente. */
function diasVencido(fecha: string | null): number {
  if (!fecha) return 0;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(`${fecha}T00:00:00`);
  return Math.floor((hoy.getTime() - venc.getTime()) / 86400000);
}

export default function CobranzaAgingPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.cobranza.aging">
      <AgingBody />
    </RequireAccess>
  );
}

function AgingBody() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    (async () => {
      const sb = createSupabaseBrowserClient();
      const { data: cargos, error: cErr } = await sb
        .schema('erp')
        .from('cxc_cargos')
        .select('persona_id, saldo, fecha_vencimiento')
        .gt('saldo', 0)
        .neq('estado', 'cancelado')
        .is('deleted_at', null);
      if (!activo) return;
      if (cErr) {
        setError(getSupabaseErrorMessage(cErr, 'No se pudo cargar el aging.'));
        setLoading(false);
        return;
      }

      const byPersona = new Map<string, Row>();
      for (const c of (cargos ?? []) as {
        persona_id: string;
        saldo: number;
        fecha_vencimiento: string | null;
      }[]) {
        const r =
          byPersona.get(c.persona_id) ??
          ({
            personaId: c.persona_id,
            cliente: '',
            vigente: 0,
            b1: 0,
            b2: 0,
            b3: 0,
            b4: 0,
            total: 0,
          } satisfies Row);
        const s = Number(c.saldo);
        const d = diasVencido(c.fecha_vencimiento);
        if (d <= 0) r.vigente += s;
        else if (d <= 30) r.b1 += s;
        else if (d <= 60) r.b2 += s;
        else if (d <= 90) r.b3 += s;
        else r.b4 += s;
        r.total += s;
        byPersona.set(c.persona_id, r);
      }

      // Nombres en chunks (evita URL > 8KB con muchos IDs).
      const ids = [...byPersona.keys()];
      for (let i = 0; i < ids.length; i += 150) {
        const chunk = ids.slice(i, i + 150);
        const { data: personas } = await sb
          .schema('erp')
          .from('personas')
          .select('id, nombre, apellido_paterno, apellido_materno')
          .in('id', chunk);
        for (const p of personas ?? []) {
          const r = byPersona.get(p.id as string);
          if (r) {
            r.cliente =
              [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ') ||
              '(sin nombre)';
          }
        }
      }
      if (!activo) return;

      setRows([...byPersona.values()].sort((a, b) => b.total - a.total));
      setLoading(false);
    })();
    return () => {
      activo = false;
    };
  }, []);

  const totales = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          vigente: acc.vigente + r.vigente,
          b1: acc.b1 + r.b1,
          b2: acc.b2 + r.b2,
          b3: acc.b3 + r.b3,
          b4: acc.b4 + r.b4,
          total: acc.total + r.total,
        }),
        { vigente: 0, b1: 0, b2: 0, b3: 0, b4: 0, total: 0 }
      ),
    [rows]
  );

  return (
    <>
      <DesktopOnlyNotice module="Cobranza" />
      <div className="hidden px-4 pb-8 sm:block sm:px-6">
        <h1 className="mb-1 text-lg font-semibold text-[var(--text)]">Antigüedad de saldos</h1>
        <p className="mb-4 text-sm text-[var(--text)]/60">
          Saldo abierto por cliente, repartido por días de vencimiento.
        </p>

        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        {loading ? (
          <p className="text-sm text-[var(--text)]/60">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">Sin saldos abiertos.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                <th className="py-1 pr-2 font-medium">Cliente</th>
                <th className="py-1 pr-2 text-right font-medium">Vigente</th>
                <th className="py-1 pr-2 text-right font-medium">1-30</th>
                <th className="py-1 pr-2 text-right font-medium">31-60</th>
                <th className="py-1 pr-2 text-right font-medium">61-90</th>
                <th className="py-1 pr-2 text-right font-medium">&gt;90</th>
                <th className="py-1 pl-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.personaId} className="border-b border-[var(--border)]/40">
                  <td className="py-1.5 pr-2">{r.cliente || '(sin nombre)'}</td>
                  <Celda v={r.vigente} />
                  <Celda v={r.b1} />
                  <Celda v={r.b2} warn={r.b2 > 0} />
                  <Celda v={r.b3} warn={r.b3 > 0} />
                  <Celda v={r.b4} danger={r.b4 > 0} />
                  <td className="py-1.5 pl-2 text-right font-medium tabular-nums">
                    {moneyFmt.format(r.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--border)] font-medium">
                <td className="py-1.5 pr-2 text-xs uppercase tracking-wide text-[var(--text)]/50">
                  Total ({rows.length})
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {moneyFmt.format(totales.vigente)}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {moneyFmt.format(totales.b1)}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {moneyFmt.format(totales.b2)}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {moneyFmt.format(totales.b3)}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {moneyFmt.format(totales.b4)}
                </td>
                <td className="py-1.5 pl-2 text-right tabular-nums">
                  {moneyFmt.format(totales.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </>
  );
}

function Celda({
  v,
  warn = false,
  danger = false,
}: {
  v: number;
  warn?: boolean;
  danger?: boolean;
}) {
  return (
    <td
      className={`py-1.5 pr-2 text-right tabular-nums ${
        danger ? 'text-red-500' : warn ? 'text-amber-600' : 'text-[var(--text)]/70'
      }`}
    >
      {v > 0 ? moneyFmt.format(v) : '—'}
    </td>
  );
}
