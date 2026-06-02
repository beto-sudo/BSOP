'use client';

/**
 * CxP · Proveedores — módulo compartido cross-empresa (ADR-011, SM1-SM6).
 *
 * Por cada proveedor con facturas de egreso: saldo total abierto, número de
 * facturas abiertas (saldo > 0, no canceladas) y fecha del último pago
 * (`erp.cxp_pagos` con `fecha_pago`/`pagado_at`). 100% derivado client-side.
 *
 * Parametrizado por `empresaId` (UUID). RDB y DILESA lo reusan con pages
 * delgados (SM1).
 */

import { useEffect, useMemo, useState } from 'react';

import { DesktopOnlyNotice } from '@/components/responsive';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency } from '@/lib/format';

const TZ = 'America/Matamoros';

export type CxpProveedoresModuleProps = {
  /** UUID de la empresa (`core.empresas.id`). Filtra todas las queries. */
  empresaId: string;
};

type Row = {
  key: string;
  proveedor: string;
  saldoTotal: number;
  facturasAbiertas: number;
  ultimoPago: string | null;
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value.length <= 10 ? `${value}T12:00:00` : value);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', { timeZone: TZ, dateStyle: 'medium' }).format(d);
}

export function CxpProveedoresModule({ empresaId }: CxpProveedoresModuleProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    (async () => {
      const sb = createSupabaseBrowserClient();

      const [factRes, pagoRes] = await Promise.all([
        sb
          .schema('erp')
          .from('facturas')
          .select('proveedor_id, emisor_nombre, emisor_rfc, saldo, estado_cxp')
          .eq('empresa_id', empresaId)
          .eq('flujo', 'egreso')
          .neq('estado_cxp', 'cancelada'),
        sb
          .schema('erp')
          .from('cxp_pagos')
          .select('proveedor_id, fecha_pago, pagado_at')
          .eq('empresa_id', empresaId)
          .is('deleted_at', null),
      ]);
      if (!activo) return;
      if (factRes.error) {
        setError(getSupabaseErrorMessage(factRes.error, 'No se pudieron cargar los proveedores.'));
        setLoading(false);
        return;
      }

      type RawFact = {
        proveedor_id: string | null;
        emisor_nombre: string | null;
        emisor_rfc: string | null;
        saldo: number | null;
        estado_cxp: string;
      };
      type RawPago = {
        proveedor_id: string | null;
        fecha_pago: string | null;
        pagado_at: string | null;
      };

      // Último pago por proveedor_id (la fecha real o, si falta, el timestamp).
      const ultimoPagoPorProveedor = new Map<string, string>();
      for (const p of (pagoRes.data ?? []) as RawPago[]) {
        if (!p.proveedor_id) continue;
        const fecha = p.fecha_pago ?? p.pagado_at;
        if (!fecha) continue;
        const prev = ultimoPagoPorProveedor.get(p.proveedor_id);
        if (!prev || fecha > prev) ultimoPagoPorProveedor.set(p.proveedor_id, fecha);
      }

      const byProveedor = new Map<string, Row>();
      const personaIds = new Set<string>();

      for (const f of (factRes.data ?? []) as RawFact[]) {
        const key = f.proveedor_id ?? f.emisor_rfc ?? f.emisor_nombre ?? '(sin proveedor)';
        if (f.proveedor_id) personaIds.add(f.proveedor_id);
        const r =
          byProveedor.get(key) ??
          ({
            key,
            proveedor: f.emisor_nombre || f.emisor_rfc || '(sin proveedor)',
            saldoTotal: 0,
            facturasAbiertas: 0,
            ultimoPago: f.proveedor_id
              ? (ultimoPagoPorProveedor.get(f.proveedor_id) ?? null)
              : null,
          } satisfies Row);
        if (!r.proveedor || r.proveedor === '(sin proveedor)') {
          r.proveedor = f.emisor_nombre || f.emisor_rfc || r.proveedor;
        }
        const saldo = Number(f.saldo ?? 0);
        if (saldo > 0) {
          r.saldoTotal += saldo;
          r.facturasAbiertas += 1;
        }
        byProveedor.set(key, r);
      }

      // Resolver nombres (erp.personas) para filas sin emisor_nombre.
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

      setRows([...byProveedor.values()].sort((a, b) => b.saldoTotal - a.saldoTotal));
      setLoading(false);
    })();
    return () => {
      activo = false;
    };
  }, [empresaId]);

  const totalSaldo = useMemo(() => rows.reduce((acc, r) => acc + r.saldoTotal, 0), [rows]);

  return (
    <>
      <DesktopOnlyNotice module="Cuentas por Pagar" />
      <div className="hidden px-4 pb-8 sm:block sm:px-6">
        <h1 className="mb-1 text-lg font-semibold text-[var(--text)]">Saldo por proveedor</h1>
        <p className="mb-4 text-sm text-[var(--text)]/60">
          Saldo abierto, facturas pendientes y último pago por proveedor.
        </p>

        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        {loading ? (
          <p className="text-sm text-[var(--text)]/60">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--text)]/60">Sin proveedores con facturas.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--text)]/50">
                <th className="py-1 pr-2 font-medium">Proveedor</th>
                <th className="py-1 pr-2 text-right font-medium">Facturas abiertas</th>
                <th className="py-1 pr-2 text-right font-medium">Último pago</th>
                <th className="py-1 pl-2 text-right font-medium">Saldo total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-[var(--border)]/40">
                  <td className="py-1.5 pr-2">{r.proveedor || '(sin proveedor)'}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-[var(--text)]/70">
                    {r.facturasAbiertas}
                  </td>
                  <td className="py-1.5 pr-2 text-right text-[var(--text)]/70">
                    {formatDate(r.ultimoPago)}
                  </td>
                  <td
                    className={`py-1.5 pl-2 text-right font-medium tabular-nums ${
                      r.saldoTotal > 0 ? 'text-amber-600' : 'text-[var(--text)]/50'
                    }`}
                  >
                    {formatCurrency(r.saldoTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--border)] font-medium">
                <td
                  className="py-1.5 pr-2 text-xs uppercase tracking-wide text-[var(--text)]/50"
                  colSpan={3}
                >
                  Total ({rows.length})
                </td>
                <td className="py-1.5 pl-2 text-right tabular-nums">
                  {formatCurrency(totalSaldo)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </>
  );
}
