'use client';

/**
 * PredialesModule — control anual del impuesto predial (tab Prediales del
 * hub Portafolio, iniciativa `dilesa-portafolio-predios` · S3).
 *
 * Matriz cuenta catastral × ejercicio con filtros (ejercicio, zona, estado,
 * búsqueda) y KPIs del conjunto filtrado. El adeudo neto se DERIVA de los
 * montos del recibo + convenio vigente (lib/dilesa/prediales). Registrar
 * pago = server action gated Dirección/admin + comprobante en erp.adjuntos.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, ModuleKpiStrip, type Column, type ModuleKpi } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/format';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { useEffectiveUser } from '@/components/providers';
import { PredialPagoDialog } from '@/components/dilesa/predial-pago-dialog';
import {
  adeudoNetoEjercicio,
  ESTADO_EJERCICIO_LABEL,
  ESTADO_EJERCICIO_TONE,
  resumenPrediales,
  totalBrutoEjercicio,
  type PredialEjercicio,
} from '@/lib/dilesa/prediales';
import { Landmark, RefreshCw, Search } from 'lucide-react';

type CuentaRow = {
  id: string;
  clave_catastral: string;
  folio: string | null;
  superficie_fiscal_m2: number | null;
  estatus: string;
  activo: { id: string; nombre: string; zona: string | null } | null;
};

type Row = PredialEjercicio & {
  cuenta: CuentaRow;
};

type FetchResult = { ok: true; rows: Row[] } | { ok: false; error: string };

async function fetchPrediales(empresaId: string): Promise<FetchResult> {
  const sb = createSupabaseBrowserClient();
  const [ctsRes, ejsRes] = await Promise.all([
    sb
      .schema('dilesa')
      .from('cuentas_prediales')
      .select(
        'id, clave_catastral, folio, superficie_fiscal_m2, estatus, activo:activos(id, nombre, zona)'
      )
      .eq('empresa_id', empresaId)
      .is('deleted_at', null),
    sb
      .schema('dilesa')
      .from('prediales_ejercicios')
      .select(
        'id, cuenta_id, ejercicio, predial, recargos, aseo, recargos_aseo, bomberos, recargos_bomberos, estado, fecha_pago, monto_pagado, notas, convenio:prediales_convenios(id, nombre, descuento_pct, estado)'
      )
      .eq('empresa_id', empresaId),
  ]);
  if (ctsRes.error) {
    return {
      ok: false,
      error: getSupabaseErrorMessage(ctsRes.error, 'No se pudieron cargar las cuentas.'),
    };
  }
  if (ejsRes.error) {
    return {
      ok: false,
      error: getSupabaseErrorMessage(ejsRes.error, 'No se pudieron cargar los ejercicios.'),
    };
  }
  const cuentas = new Map(
    ((ctsRes.data ?? []) as unknown as CuentaRow[]).map((c) => [c.id, c] as const)
  );
  const rows: Row[] = [];
  for (const e of (ejsRes.data ?? []) as unknown as PredialEjercicio[]) {
    const cuenta = cuentas.get(e.cuenta_id);
    if (cuenta) rows.push({ ...e, cuenta });
  }
  return { ok: true, rows };
}

export function PredialesModule({ empresaId }: { empresaId: string }) {
  const router = useRouter();
  const { data: effectiveUser } = useEffectiveUser();
  const puedeAdmin =
    !!effectiveUser?.isAdmin || (effectiveUser?.direccionEmpresaIds ?? []).includes(empresaId);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState('');
  const [ejercicioFiltro, setEjercicioFiltro] = useState<string>('');
  const [zonaFiltro, setZonaFiltro] = useState<string>('');
  const [estadoFiltro, setEstadoFiltro] = useState<string>('');
  const [pago, setPago] = useState<Row | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchPrediales(empresaId).then((r) => {
      if (!vivo) return;
      if (r.ok) {
        setRows(r.rows);
        setError(null);
      } else {
        setError(r.error);
        setRows([]);
      }
      setLoading(false);
    });
    return () => {
      vivo = false;
    };
  }, [empresaId, refreshKey]);

  const ejerciciosPresentes = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.ejercicio)))
        .sort((a, b) => b - a)
        .map(String),
    [rows]
  );
  const zonasPresentes = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => r.cuenta.activo?.zona).filter(Boolean) as string[])
      ).sort(),
    [rows]
  );

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (ejercicioFiltro && String(r.ejercicio) !== ejercicioFiltro) return false;
      if (zonaFiltro && (r.cuenta.activo?.zona ?? '') !== zonaFiltro) return false;
      if (estadoFiltro && r.estado !== estadoFiltro) return false;
      if (
        q &&
        !r.cuenta.clave_catastral.toLowerCase().includes(q) &&
        !(r.cuenta.activo?.nombre ?? '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [rows, search, ejercicioFiltro, zonaFiltro, estadoFiltro]);

  const kpis = useMemo<ModuleKpi[]>(() => {
    const r = resumenPrediales(filtrados);
    return [
      { key: 'adeudo', label: 'Adeudo neto', value: formatCurrency(r.adeudoNeto) },
      { key: 'bruto', label: 'Cargos pendientes (bruto)', value: formatCurrency(r.brutoPendiente) },
      { key: 'pendientes', label: 'Ejercicios con adeudo', value: String(r.pendientes) },
      { key: 'pagados', label: 'Ejercicios pagados', value: String(r.pagados) },
    ];
  }, [filtrados]);

  const columns: Column<Row>[] = [
    {
      key: 'clave',
      label: 'Clave catastral',
      type: 'custom',
      sticky: true,
      width: 'min-w-[150px]',
      render: (r) => <span className="tabular-nums">{r.cuenta.clave_catastral}</span>,
    },
    {
      key: 'predio',
      label: 'Predio',
      type: 'custom',
      width: 'min-w-[220px]',
      render: (r) => (
        <span className="block max-w-[320px] truncate">{r.cuenta.activo?.nombre ?? '—'}</span>
      ),
    },
    {
      key: 'zona',
      label: 'Zona',
      type: 'custom',
      render: (r) => r.cuenta.activo?.zona ?? '—',
    },
    {
      key: 'ejercicio',
      label: 'Año',
      type: 'custom',
      render: (r) => <span className="tabular-nums">{r.ejercicio}</span>,
    },
    {
      key: 'bruto',
      label: 'Cargos',
      type: 'custom',
      render: (r) => {
        const b = totalBrutoEjercicio(r);
        return <span className="tabular-nums">{b > 0 ? formatCurrency(b) : '—'}</span>;
      },
    },
    {
      key: 'neto',
      label: 'Adeudo neto',
      type: 'custom',
      render: (r) => {
        const n = adeudoNetoEjercicio(r);
        return n > 0 ? (
          <span className="font-medium tabular-nums text-[var(--danger)]">{formatCurrency(n)}</span>
        ) : (
          <span className="text-[var(--text)]/40">—</span>
        );
      },
    },
    {
      key: 'estado',
      label: 'Estado',
      type: 'custom',
      render: (r) => (
        <Badge tone={ESTADO_EJERCICIO_TONE[r.estado] ?? 'neutral'}>
          {ESTADO_EJERCICIO_LABEL[r.estado] ?? r.estado}
        </Badge>
      ),
    },
    {
      key: 'pago',
      label: 'Pago',
      type: 'custom',
      render: (r) =>
        r.estado === 'pagado' ? (
          <span className="text-xs text-[var(--text)]/60">
            {r.fecha_pago ?? ''}
            {r.monto_pagado != null ? ` · ${formatCurrency(r.monto_pagado)}` : ''}
          </span>
        ) : puedeAdmin ? (
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              setPago(r);
            }}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text)]/70 hover:text-[var(--text)]"
          >
            Registrar pago
          </button>
        ) : (
          <span className="text-[var(--text)]/40">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <Landmark className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Prediales</h1>
          <p className="text-sm text-[var(--text)]/60">
            Control anual del impuesto predial por cuenta catastral. Los montos son los del recibo
            municipal; el adeudo neto aplica el convenio vigente.
          </p>
        </div>
      </header>

      <ModuleKpiStrip stats={kpis} cols={4} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Clave catastral o predio…"
            className="w-64 pl-9"
          />
        </div>
        <select
          value={ejercicioFiltro}
          onChange={(e) => setEjercicioFiltro(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Todos los años</option>
          {ejerciciosPresentes.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          value={estadoFiltro}
          onChange={(e) => setEstadoFiltro(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_EJERCICIO_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        {zonasPresentes.length > 0 ? (
          <select
            value={zonaFiltro}
            onChange={(e) => setZonaFiltro(e.target.value)}
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
          >
            <option value="">Todas las zonas</option>
            {zonasPresentes.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refrescar
        </button>
      </div>

      <DataTable
        data={filtrados}
        columns={columns}
        rowKey="id"
        loading={loading}
        error={error}
        onRetry={() => setRefreshKey((k) => k + 1)}
        onRowClick={(r) => {
          if (r.cuenta.activo) router.push(`/dilesa/portafolio/activo/${r.cuenta.activo.id}`);
        }}
        initialSort={{ key: 'ejercicio', dir: 'desc' }}
        emptyTitle="Sin ejercicios"
        emptyDescription="No hay ejercicios de predial capturados con estos filtros."
        emptyIcon={<Landmark className="h-6 w-6" />}
      />

      <PredialPagoDialog
        row={pago}
        empresaId={empresaId}
        open={pago != null}
        onOpenChange={(o) => {
          if (!o) setPago(null);
        }}
        onSaved={() => {
          setPago(null);
          setRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}
