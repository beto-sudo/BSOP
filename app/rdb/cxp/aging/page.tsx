'use client';

/**
 * CxP · Saldos — antigüedad de saldos por proveedor (RDB golden, Sprint 3).
 *
 * Agrega las facturas de egreso con saldo abierto (`erp.facturas`,
 * `flujo='egreso'`, `saldo > 0`, `estado_cxp != 'cancelada'`) por proveedor
 * y las reparte en buckets de vencimiento (vigente / 1-30 / 31-60 / 61-90
 * / >90). Fecha base: `fecha_pago_programada` (fallback `fecha_vencimiento`).
 * 100% derivado client-side, sin captura. Gemelo de `dilesa/cobranza/aging`.
 *
 * @responsive desktop-only — reporte de CxP en escritorio.
 */

import { useEffect, useMemo, useState } from 'react';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency } from '@/lib/format';

const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

type Row = {
  key: string;
  proveedor: string;
  vigente: number;
  b1: number;
  b2: number;
  b3: number;
  b4: number;
  total: number;
};

/** Días vencidos de una factura; ≤ 0 (o sin fecha) = vigente. */
function diasVencido(fecha: string | null): number {
  if (!fecha) return 0;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(`${fecha}T00:00:00`);
  if (isNaN(venc.getTime())) return 0;
  return Math.floor((hoy.getTime() - venc.getTime()) / 86400000);
}

export default function CxpAgingPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.cxp.aging">
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
      const { data: facturas, error: fErr } = await sb
        .schema('erp')
        .from('facturas')
        .select(
          'proveedor_id, emisor_nombre, emisor_rfc, saldo, fecha_pago_programada, fecha_vencimiento'
        )
        .eq('empresa_id', RDB_EMPRESA_ID)
        .eq('flujo', 'egreso')
        .gt('saldo', 0)
        .neq('estado_cxp', 'cancelada');
      if (!activo) return;
      if (fErr) {
        setError(getSupabaseErrorMessage(fErr, 'No se pudo cargar el aging.'));
        setLoading(false);
        return;
      }

      type Raw = {
        proveedor_id: string | null;
        emisor_nombre: string | null;
        emisor_rfc: string | null;
        saldo: number | null;
        fecha_pago_programada: string | null;
        fecha_vencimiento: string | null;
      };

      const byProveedor = new Map<string, Row>();
      const personaIds = new Set<string>();

      for (const f of (facturas ?? []) as Raw[]) {
        // Clave de agrupación: proveedor_id si existe, si no el RFC, si no el
        // nombre del emisor. Garantiza agrupar incluso facturas sin proveedor
        // matcheado (carga inclusiva).
        const key = f.proveedor_id ?? f.emisor_rfc ?? f.emisor_nombre ?? '(sin proveedor)';
        if (f.proveedor_id) personaIds.add(f.proveedor_id);
        const r =
          byProveedor.get(key) ??
          ({
            key,
            proveedor: f.emisor_nombre || f.emisor_rfc || '(sin proveedor)',
            vigente: 0,
            b1: 0,
            b2: 0,
            b3: 0,
            b4: 0,
            total: 0,
          } satisfies Row);
        // Si una factura del mismo proveedor trae nombre y la fila aún no, lo
        // adopta (las claves por id pueden empezar con nombre vacío).
        if (!r.proveedor || r.proveedor === '(sin proveedor)') {
          r.proveedor = f.emisor_nombre || f.emisor_rfc || r.proveedor;
        }
        const s = Number(f.saldo ?? 0);
        const d = diasVencido(f.fecha_pago_programada ?? f.fecha_vencimiento);
        if (d <= 0) r.vigente += s;
        else if (d <= 30) r.b1 += s;
        else if (d <= 60) r.b2 += s;
        else if (d <= 90) r.b3 += s;
        else r.b4 += s;
        r.total += s;
        byProveedor.set(key, r);
      }

      // Resolver nombres de proveedor (erp.personas) para filas con
      // proveedor_id cuyo emisor_nombre venía vacío. Chunk por límite de URL.
      const ids = [...personaIds];
      for (let i = 0; i < ids.length; i += 150) {
        const chunk = ids.slice(i, i + 150);
        const { data: personas } = await sb
          .schema('erp')
          .from('personas')
          .select('id, nombre, apellido_paterno, apellido_materno')
          .in('id', chunk);
        for (const p of personas ?? []) {
          const r = byProveedor.get(p.id as string);
          if (r && (!r.proveedor || r.proveedor === '(sin proveedor)')) {
            r.proveedor =
              [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ') ||
              '(sin proveedor)';
          }
        }
      }
      if (!activo) return;

      setRows([...byProveedor.values()].sort((a, b) => b.total - a.total));
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
      <DesktopOnlyNotice module="Cuentas por Pagar" />
      <div className="hidden px-4 pb-8 sm:block sm:px-6">
        <h1 className="mb-1 text-lg font-semibold text-[var(--text)]">Antigüedad de saldos</h1>
        <p className="mb-4 text-sm text-[var(--text)]/60">
          Saldo abierto por proveedor, repartido por días de vencimiento.
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
                <th className="py-1 pr-2 font-medium">Proveedor</th>
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
                <tr key={r.key} className="border-b border-[var(--border)]/40">
                  <td className="py-1.5 pr-2">{r.proveedor || '(sin proveedor)'}</td>
                  <Celda v={r.vigente} />
                  <Celda v={r.b1} />
                  <Celda v={r.b2} warn={r.b2 > 0} />
                  <Celda v={r.b3} warn={r.b3 > 0} />
                  <Celda v={r.b4} danger={r.b4 > 0} />
                  <td className="py-1.5 pl-2 text-right font-medium tabular-nums">
                    {formatCurrency(r.total)}
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
                  {formatCurrency(totales.vigente)}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {formatCurrency(totales.b1)}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {formatCurrency(totales.b2)}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {formatCurrency(totales.b3)}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">
                  {formatCurrency(totales.b4)}
                </td>
                <td className="py-1.5 pl-2 text-right tabular-nums">
                  {formatCurrency(totales.total)}
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
      {v > 0 ? formatCurrency(v) : '—'}
    </td>
  );
}
