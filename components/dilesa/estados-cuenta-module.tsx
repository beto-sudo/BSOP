'use client';

/**
 * EstadosCuentaModule — archivo mensual de estados de cuenta bancarios DILESA
 * con conciliación a nivel mes (iniciativa `conciliacion-bancaria` v0).
 *
 * Una fila por cuenta × mes desde `erp.estados_cuenta`. Por fila se computan
 * (en cliente, sin estado persistido) los 3 checks:
 *   1. Checksum interno de carátula (SI + depósitos − retiros = SF).
 *   2. Continuidad vs el estado del mes anterior de la misma cuenta.
 *   3. Cruce vs el snapshot capturado en `erp.cuenta_saldos` a la fecha de
 *      corte (saldo total = vista + inversiones).
 *
 * El PDF archivado se abre vía signed URL del bucket privado `adjuntos`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, FileUp, Landmark, RefreshCw } from 'lucide-react';

import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { formatCurrency, formatDate } from '@/lib/format';
import { DataTable, ModuleKpiStrip, type Column, type ModuleKpi } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { EstadoCuentaUploadDrawer } from '@/components/dilesa/estado-cuenta-upload-drawer';
import {
  type EstadoCuentaRow,
  checksumOk,
  continuidadCheck,
  periodoLabel,
  saldoTotalAlCorte,
  snapshotCheck,
} from '@/components/dilesa/estados-cuenta-utils';
import { type CuentaSaldoRow, monedaDeCuenta } from '@/components/dilesa/saldos-bancos-utils';

const BUCKET = 'adjuntos';

type SnapshotRow = { cuentaId: string; fecha: string; saldo: number };

export function EstadosCuentaModule({ empresaId = DILESA_EMPRESA_ID }: { empresaId?: string }) {
  const toast = useToast();
  const [rows, setRows] = useState<EstadoCuentaRow[]>([]);
  const [cuentas, setCuentas] = useState<CuentaSaldoRow[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [estadoEdit, setEstadoEdit] = useState<EstadoCuentaRow | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sb = createSupabaseBrowserClient();

    // Cuentas activas + estados + snapshots de cortes. Tres queries y merge en
    // JS (mismo patrón que SaldosBancosModule — evita depender de embeds).
    const [cuentasRes, estadosRes] = await Promise.all([
      sb
        .schema('erp')
        .from('cuentas_bancarias')
        .select(
          'id, nombre, banco, moneda, tipo, producto, numero_cuenta, clabe, numero_cliente, contrato, sucursal, telefono, contacto, titular, notas'
        )
        .eq('empresa_id', empresaId)
        .eq('activo', true)
        .order('nombre', { ascending: true }),
      sb
        .schema('erp')
        .from('estados_cuenta')
        .select(
          'id, cuenta_id, periodo, fecha_corte, saldo_inicial, depositos, retiros, saldo_final, saldo_inversiones, num_abonos, num_cargos, comisiones, archivo_path, notas, created_at'
        )
        .eq('empresa_id', empresaId)
        .order('periodo', { ascending: false }),
    ]);

    if (cuentasRes.error || estadosRes.error) {
      const err = cuentasRes.error ?? estadosRes.error;
      setError(getSupabaseErrorMessage(err!, 'No se pudieron cargar los estados de cuenta.'));
      setRows([]);
      setLoading(false);
      return;
    }

    const cuentasRows: CuentaSaldoRow[] = (cuentasRes.data ?? []).map((c) => ({
      cuentaId: c.id,
      nombre: c.nombre,
      banco: c.banco,
      moneda: monedaDeCuenta(c.nombre, c.banco, c.moneda),
      saldo: null,
      fechaSaldo: null,
      capturadoAt: null,
      ficha: {
        tipo: c.tipo,
        producto: c.producto,
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
    }));
    setCuentas(cuentasRows);

    const cuentaById = new Map(cuentasRows.map((c) => [c.cuentaId, c] as const));
    const merged: EstadoCuentaRow[] = (estadosRes.data ?? []).map((e) => {
      const c = cuentaById.get(e.cuenta_id);
      return {
        id: e.id,
        cuentaId: e.cuenta_id,
        cuentaNombre: c?.nombre ?? '—',
        banco: c?.banco ?? null,
        moneda: c?.moneda ?? 'MXN',
        periodo: e.periodo,
        fechaCorte: e.fecha_corte,
        saldoInicial: e.saldo_inicial,
        depositos: e.depositos,
        retiros: e.retiros,
        saldoFinal: e.saldo_final,
        saldoInversiones: e.saldo_inversiones,
        numAbonos: e.num_abonos,
        numCargos: e.num_cargos,
        comisiones: e.comisiones,
        archivoPath: e.archivo_path,
        notas: e.notas,
        createdAt: e.created_at,
      };
    });
    setRows(merged);

    // Snapshots en las fechas de corte de los estados cargados (para el
    // cruce #3). `.in()` con pocas fechas — sin riesgo de URL larga.
    const fechasCorte = Array.from(new Set(merged.map((r) => r.fechaCorte)));
    if (fechasCorte.length > 0) {
      const { data: snapData, error: snapErr } = await sb
        .schema('erp')
        .from('cuenta_saldos')
        .select('cuenta_id, fecha, saldo')
        .eq('empresa_id', empresaId)
        .in('fecha', fechasCorte);
      if (!snapErr) {
        setSnapshots(
          (snapData ?? []).map((s) => ({ cuentaId: s.cuenta_id, fecha: s.fecha, saldo: s.saldo }))
        );
      }
    } else {
      setSnapshots([]);
    }

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

  const abrirPdf = async (path: string) => {
    const sb = createSupabaseBrowserClient();
    const { data, error: signErr } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (signErr || !data?.signedUrl) {
      toast.add({
        title: 'No se pudo abrir el PDF',
        description: signErr ? getSupabaseErrorMessage(signErr, '') : undefined,
        type: 'error',
      });
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpis = useMemo<ModuleKpi[]>(() => {
    // Cobertura del mes más reciente con al menos un estado cargado.
    const ultimoPeriodo = rows[0]?.periodo ?? null;
    const cobertura = ultimoPeriodo
      ? `${rows.filter((r) => r.periodo === ultimoPeriodo).length}/${cuentas.length}`
      : `0/${cuentas.length}`;

    const descuadres = rows.filter(
      (r) =>
        !checksumOk(r) ||
        continuidadCheck(r, rows).status === 'descuadre' ||
        snapshotCheck(r, snapshots).status === 'descuadre'
    ).length;
    const sinPdf = rows.filter((r) => !r.archivoPath).length;

    return [
      {
        key: 'cobertura',
        label: ultimoPeriodo ? `Cuentas con ${periodoLabel(ultimoPeriodo)}` : 'Cobertura',
        value: cobertura,
      },
      { key: 'archivados', label: 'Estados archivados', value: rows.length },
      {
        key: 'descuadres',
        label: 'Con descuadre',
        value: descuadres,
        valueClassName: descuadres > 0 ? 'text-red-500' : undefined,
      },
      {
        key: 'sin-pdf',
        label: 'Sin PDF',
        value: sinPdf,
        valueClassName: sinPdf > 0 ? 'text-amber-500' : undefined,
      },
    ];
  }, [rows, cuentas, snapshots]);

  // ── Columnas ────────────────────────────────────────────────────────────────
  const columns: Column<EstadoCuentaRow>[] = [
    {
      key: 'periodo',
      label: 'Periodo',
      type: 'text',
      sticky: true,
      width: 'min-w-[120px]',
      accessor: (r) => r.periodo,
      render: (r) => (
        <span className="font-medium text-[var(--text)]">{periodoLabel(r.periodo)}</span>
      ),
    },
    {
      key: 'cuenta',
      label: 'Cuenta',
      type: 'text',
      width: 'min-w-[180px]',
      accessor: (r) => r.cuentaNombre,
      render: (r) => (
        <div className="min-w-0">
          <div className="text-[var(--text)]">{r.cuentaNombre}</div>
          <div className="text-xs text-[var(--text)]/50">
            Corte {formatDate(r.fechaCorte)} · {r.moneda}
          </div>
        </div>
      ),
    },
    {
      key: 'saldoInicial',
      label: 'Saldo inicial',
      type: 'currency',
      align: 'right',
      accessor: (r) => r.saldoInicial,
      render: (r) => formatCurrency(r.saldoInicial, { currency: r.moneda }),
    },
    {
      key: 'depositos',
      label: 'Depósitos',
      type: 'currency',
      align: 'right',
      accessor: (r) => r.depositos,
      render: (r) => (
        <span className="text-emerald-600">
          {formatCurrency(r.depositos, { currency: r.moneda })}
        </span>
      ),
    },
    {
      key: 'retiros',
      label: 'Retiros',
      type: 'currency',
      align: 'right',
      accessor: (r) => r.retiros,
      render: (r) => (
        <span className="text-red-600">{formatCurrency(r.retiros, { currency: r.moneda })}</span>
      ),
    },
    {
      key: 'saldoTotal',
      label: 'Saldo al corte',
      type: 'currency',
      align: 'right',
      accessor: (r) => saldoTotalAlCorte(r),
      render: (r) => (
        <div>
          <div className="font-medium tabular-nums text-[var(--text)]">
            {formatCurrency(saldoTotalAlCorte(r), { currency: r.moneda })}
          </div>
          {r.saldoInversiones > 0 ? (
            <div className="text-xs text-[var(--text)]/50">
              vista {formatCurrency(r.saldoFinal, { currency: r.moneda })} + inv.
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'checks',
      label: 'Conciliación',
      type: 'custom',
      sortable: false,
      render: (r) => {
        const cks = checksumOk(r);
        const cont = continuidadCheck(r, rows);
        const snap = snapshotCheck(r, snapshots);
        return (
          <div className="flex flex-wrap gap-1">
            <Badge tone={cks ? 'success' : 'danger'}>{cks ? 'Cuadra' : 'No cuadra'}</Badge>
            {cont.status === 'ok' ? (
              <Badge tone="success">Continuidad</Badge>
            ) : cont.status === 'descuadre' ? (
              <Badge tone="danger">Cont. {formatCurrency(cont.diff, { currency: r.moneda })}</Badge>
            ) : (
              <Badge tone="neutral">Sin mes ant.</Badge>
            )}
            {snap.status === 'ok' ? (
              <Badge tone="success">= Captura</Badge>
            ) : snap.status === 'descuadre' ? (
              <Badge tone="warning">
                Captura {formatCurrency(snap.diff, { currency: r.moneda })}
              </Badge>
            ) : (
              <Badge tone="neutral">Sin captura</Badge>
            )}
          </div>
        );
      },
    },
    {
      key: 'acciones',
      label: '',
      type: 'custom',
      sortable: false,
      align: 'right',
      render: (r) => (
        <DataTable.InteractiveCell>
          <div className="flex items-center justify-end gap-1.5">
            {r.archivoPath ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void abrirPdf(r.archivoPath!)}
                className="gap-1.5"
              >
                <FileText className="h-3.5 w-3.5" />
                PDF
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEstadoEdit(r);
                setDrawerOpen(true);
              }}
            >
              Editar
            </Button>
          </div>
        </DataTable.InteractiveCell>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => void cargar()}
          className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refrescar
        </button>
        <Button
          type="button"
          onClick={() => {
            setEstadoEdit(null);
            setDrawerOpen(true);
          }}
          className="gap-1.5"
        >
          <FileUp className="h-4 w-4" />
          Subir estado de cuenta
        </Button>
      </div>

      <ModuleKpiStrip stats={kpis} cols={4} />

      <DataTable
        data={rows}
        columns={columns}
        rowKey="id"
        loading={loading}
        error={error}
        onRetry={() => void cargar()}
        onRowClick={(r) => {
          setEstadoEdit(r);
          setDrawerOpen(true);
        }}
        initialSort={{ key: 'periodo', dir: 'desc' }}
        emptyTitle="Sin estados de cuenta"
        emptyDescription="Sube el primer estado de cuenta del mes — el PDF queda archivado y los totales alimentan la conciliación."
        emptyIcon={<Landmark className="h-6 w-6" />}
        maxHeight="calc(100vh - 380px)"
      />

      <EstadoCuentaUploadDrawer
        cuentas={cuentas}
        estado={estadoEdit}
        open={drawerOpen}
        onOpenChange={(o) => {
          setDrawerOpen(o);
          if (!o) setEstadoEdit(null);
        }}
        onDone={() => void cargar()}
      />
    </div>
  );
}
