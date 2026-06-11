'use client';

/**
 * SaldosBancosModule — captura manual de saldos bancarios DILESA con historial.
 *
 * Iniciativa `tesoreria` (Sprint 3). Reemplaza la captura de saldos que hoy
 * vive en Coda y alimenta el bloque #1 ("Saldos Bancos") del correo diario al
 * Consejo (`dilesa-resumen-consejo`).
 *
 * Una fila por cuenta bancaria activa de DILESA. El último saldo se lee de la
 * vista `erp.v_cuenta_saldo_actual` (DISTINCT ON por cuenta); las cuentas que
 * todavía no tienen ningún snapshot se incluyen igual leyendo
 * `erp.cuentas_bancarias` y haciendo merge (saldo = null). Cada captura apila
 * un snapshot nuevo en `erp.cuenta_saldos` vía la server action `capturarSaldo`
 * (audit trail — no se edita el anterior).
 *
 * Multi-moneda: BBVA Dólares es USD; el resto MXN. Como `moneda_id` viene null
 * en las cuentas DILESA (la migración Sprint 1 solo cargó nombre/banco), la
 * moneda se infiere del nombre de la cuenta (ver `monedaDeCuenta`). No se suma
 * entre monedas distintas — cada cuenta muestra su saldo individual y los
 * totales del KPI van por moneda.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { IdCard, Plus, RefreshCw, Wallet } from 'lucide-react';

import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { formatCurrency, formatDate } from '@/lib/format';
import { DataTable, ModuleKpiStrip, type Column, type ModuleKpi } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SaldoCaptureDrawer } from '@/components/dilesa/saldo-capture-drawer';
import { CuentaFichaDrawer } from '@/components/dilesa/cuenta-ficha-drawer';
import {
  type CuentaSaldoRow,
  computeAntiguedadDias,
  monedaDeCuenta,
} from '@/components/dilesa/saldos-bancos-utils';

// ─── Antigüedad → tono del badge ─────────────────────────────────────────────
//
// Un saldo stale (como Finamex en Coda, sin actualizar desde noviembre) debe
// saltar a la vista. Verde ≤ 3 días, ámbar 4–14, rojo > 14, gris si nunca se
// capturó.
function antiguedadTone(dias: number | null): BadgeTone {
  if (dias == null) return 'neutral';
  if (dias <= 3) return 'success';
  if (dias <= 14) return 'warning';
  return 'danger';
}

function antiguedadLabel(dias: number | null): string {
  if (dias == null) return 'Sin captura';
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  return `${dias} días`;
}

export function SaldosBancosModule({ empresaId = DILESA_EMPRESA_ID }: { empresaId?: string }) {
  const [rows, setRows] = useState<CuentaSaldoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | string | null>(null);
  const [capturaCuenta, setCapturaCuenta] = useState<CuentaSaldoRow | null>(null);
  const [fichaCuenta, setFichaCuenta] = useState<CuentaSaldoRow | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sb = createSupabaseBrowserClient();

    // Cuentas activas (base) + último saldo por cuenta (vista). Dos queries
    // separados, merge en JS: la vista solo trae cuentas con al menos un
    // snapshot, así que la base garantiza que aparezcan también las vacías.
    const [cuentasRes, saldosRes] = await Promise.all([
      sb
        .schema('erp')
        .from('cuentas_bancarias')
        .select(
          'id, nombre, banco, moneda, tipo, numero_cuenta, clabe, numero_cliente, contrato, sucursal, telefono, contacto, titular, notas'
        )
        .eq('empresa_id', empresaId)
        .eq('activo', true)
        .order('nombre', { ascending: true }),
      sb
        .schema('erp')
        .from('v_cuenta_saldo_actual')
        .select('cuenta_id, saldo, fecha_saldo, capturado_at')
        .eq('empresa_id', empresaId),
    ]);

    if (cuentasRes.error) {
      setError(getSupabaseErrorMessage(cuentasRes.error, 'No se pudieron cargar las cuentas.'));
      setRows([]);
      setLoading(false);
      return;
    }
    if (saldosRes.error) {
      setError(getSupabaseErrorMessage(saldosRes.error, 'No se pudieron cargar los saldos.'));
      setRows([]);
      setLoading(false);
      return;
    }

    const saldoPorCuenta = new Map((saldosRes.data ?? []).map((s) => [s.cuenta_id, s] as const));

    const merged: CuentaSaldoRow[] = (cuentasRes.data ?? []).map((c) => {
      const s = c.id ? saldoPorCuenta.get(c.id) : undefined;
      return {
        cuentaId: c.id,
        nombre: c.nombre,
        banco: c.banco,
        moneda: monedaDeCuenta(c.nombre, c.banco, c.moneda),
        saldo: s?.saldo ?? null,
        fechaSaldo: s?.fecha_saldo ?? null,
        capturadoAt: s?.capturado_at ?? null,
        ficha: {
          tipo: c.tipo,
          numeroCuenta: c.numero_cuenta,
          clabe: c.clabe,
          numeroCliente: c.numero_cliente,
          contrato: c.contrato,
          sucursal: c.sucursal,
          telefono: c.telefono,
          contacto: c.contacto,
          titular: c.titular,
          notas: c.notas,
        },
      };
    });

    setRows(merged);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => {
    let activo = true;
    void (async () => {
      await cargar();
      if (!activo) return;
    })();
    return () => {
      activo = false;
    };
  }, [cargar]);

  // ─── KPIs: total por moneda + cuentas con saldo stale ──────────────────────
  const kpis = useMemo<ModuleKpi[]>(() => {
    const totalMXN = rows
      .filter((r) => r.moneda === 'MXN' && r.saldo != null)
      .reduce((acc, r) => acc + (r.saldo ?? 0), 0);
    const totalUSD = rows
      .filter((r) => r.moneda === 'USD' && r.saldo != null)
      .reduce((acc, r) => acc + (r.saldo ?? 0), 0);
    const sinCaptura = rows.filter((r) => r.saldo == null).length;
    const stale = rows.filter((r) => {
      const dias = computeAntiguedadDias(r.fechaSaldo);
      return dias != null && dias > 14;
    }).length;

    return [
      {
        key: 'total-mxn',
        label: 'Total MXN',
        value: formatCurrency(totalMXN, { currency: 'MXN' }),
      },
      {
        key: 'total-usd',
        label: 'Total USD',
        value: formatCurrency(totalUSD, { currency: 'USD' }),
      },
      {
        key: 'sin-captura',
        label: 'Sin captura',
        value: sinCaptura,
        valueClassName: sinCaptura > 0 ? 'text-amber-500' : undefined,
      },
      {
        key: 'stale',
        label: 'Saldo viejo (>14d)',
        value: stale,
        valueClassName: stale > 0 ? 'text-red-500' : undefined,
      },
    ];
  }, [rows]);

  const columns: Column<CuentaSaldoRow>[] = [
    {
      key: 'nombre',
      label: 'Cuenta',
      type: 'text',
      sticky: true,
      width: 'min-w-[220px]',
      render: (r) => (
        <div className="min-w-0">
          <div className="font-medium text-[var(--text)]">{r.nombre}</div>
          {r.banco && r.banco !== r.nombre ? (
            <div className="text-xs text-[var(--text)]/60">{r.banco}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'moneda',
      label: 'Moneda',
      type: 'custom',
      sortable: false,
      render: (r) => <Badge tone={r.moneda === 'USD' ? 'info' : 'neutral'}>{r.moneda}</Badge>,
    },
    {
      key: 'saldo',
      label: 'Último saldo',
      type: 'currency',
      align: 'right',
      accessor: (r) => r.saldo ?? Number.NEGATIVE_INFINITY,
      render: (r) =>
        r.saldo != null ? (
          formatCurrency(r.saldo, { currency: r.moneda })
        ) : (
          <span className="text-[var(--text)]/40">—</span>
        ),
    },
    {
      key: 'fechaSaldo',
      label: 'Fecha del saldo',
      type: 'text',
      align: 'right',
      accessor: (r) => r.fechaSaldo ?? '',
      render: (r) => (r.fechaSaldo ? formatDate(r.fechaSaldo) : '—'),
    },
    {
      key: 'antiguedad',
      label: 'Antigüedad',
      type: 'custom',
      align: 'right',
      sortable: false,
      render: (r) => {
        const dias = computeAntiguedadDias(r.fechaSaldo);
        return <Badge tone={antiguedadTone(dias)}>{antiguedadLabel(dias)}</Badge>;
      },
    },
    {
      key: 'capturar',
      label: '',
      type: 'custom',
      sortable: false,
      align: 'right',
      render: (r) => (
        <DataTable.InteractiveCell>
          <div className="flex items-center justify-end gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFichaCuenta(r)}
              className="gap-1.5"
            >
              <IdCard className="h-3.5 w-3.5" />
              Ficha
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCapturaCuenta(r)}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Capturar saldo
            </Button>
          </div>
        </DataTable.InteractiveCell>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* El título del módulo vive en el layout (ModuleHeader + tabs, ADR-030). */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => void cargar()}
          className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refrescar
        </button>
      </div>

      <ModuleKpiStrip stats={kpis} cols={4} />

      <DataTable
        data={rows}
        columns={columns}
        rowKey="cuentaId"
        loading={loading}
        error={error}
        onRetry={() => void cargar()}
        onRowClick={(r) => setCapturaCuenta(r)}
        initialSort={{ key: 'nombre', dir: 'asc' }}
        emptyTitle="Sin cuentas bancarias"
        emptyDescription="No hay cuentas bancarias activas para DILESA."
        emptyIcon={<Wallet className="h-6 w-6" />}
        maxHeight="calc(100vh - 320px)"
      />

      <SaldoCaptureDrawer
        cuenta={capturaCuenta}
        open={capturaCuenta != null}
        onOpenChange={(o) => {
          if (!o) setCapturaCuenta(null);
        }}
        onDone={() => void cargar()}
      />

      <CuentaFichaDrawer
        cuenta={fichaCuenta}
        open={fichaCuenta != null}
        onOpenChange={(o) => {
          if (!o) setFichaCuenta(null);
        }}
      />
    </div>
  );
}
