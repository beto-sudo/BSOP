'use client';

/**
 * EstimacionesModule — lista de estimaciones de pago a contratistas DILESA.
 *
 * Iniciativa dilesa-estimaciones · Sprint 3. Tab "Estimaciones" del hub
 * Construcción. Lista filtrable de las filas en `dilesa.estimaciones`:
 * código, fecha de cierre, contratista, # tareas, monto neto, estado.
 *
 * Click en fila → /dilesa/construccion/estimaciones/[id] con la ficha
 * completa + desglose por obra.
 *
 * Carga cross-schema con queries paralelas + lookups Map (mismo patrón
 * que contratos-module / construccion-module).
 *
 * El botón "+ Nueva estimación" se agrega en Sprint 4. En Sprint 3 solo
 * es lectura — Beto verifica el histórico migrado de Coda (188 fichas
 * pagadas, $25M+ acumulado).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { usePermissions } from '@/components/providers';
import { Banknote, Plus, RefreshCw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { DataTable, ModuleKpiStrip, type Column, type ModuleKpi } from '@/components/module-page';
import {
  DateRangeFilter,
  EMPTY_DATE_RANGE,
  isInDateRange,
  type DateRange,
} from '@/components/filters/date-range-filter';
import { Input } from '@/components/ui/input';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency } from '@/lib/format';

export type EstimacionRow = {
  id: string;
  codigo: string;
  fecha_cierre: string;
  fecha_pago_programado: string;
  contratista_id: string;
  monto_bruto: number;
  monto_neto: number;
  estado: string;
  pagada_at: string | null;
  /** Computed cross-schema (erp.personas). */
  contratistaNombre: string;
  contratistaAbreviacion: string | null;
  /** Computed: # de tareas vinculadas. */
  tareasCount: number;
};

const ESTADOS_PENDIENTES = new Set(['borrador', 'aprobada', 'facturada']);

/** KPIs reactivos a filtros — ADR-034. */
export function deriveKpis(rows: readonly EstimacionRow[]): readonly ModuleKpi[] {
  const total = rows.length;
  const pendientes = rows.filter((r) => ESTADOS_PENDIENTES.has(r.estado)).length;
  const pagadas = rows.filter((r) => r.estado === 'pagada').length;
  const netoTotal = rows.reduce((acc, r) => acc + (r.monto_neto ?? 0), 0);
  const netoPendiente = rows
    .filter((r) => ESTADOS_PENDIENTES.has(r.estado))
    .reduce((acc, r) => acc + (r.monto_neto ?? 0), 0);

  return [
    { key: 'total', label: 'Estimaciones', value: total },
    { key: 'pendientes', label: 'Pendientes pago', value: pendientes },
    { key: 'pagadas', label: 'Pagadas', value: pagadas },
    {
      key: 'neto_total',
      label: 'Neto total',
      value: total === 0 ? '—' : formatCurrency(netoTotal, { compact: true }),
    },
    {
      key: 'pendiente_monto',
      label: 'Pendiente pago $',
      value: total === 0 ? '—' : formatCurrency(netoPendiente, { compact: true }),
    },
  ];
}

const ESTADO_TONE: Record<string, BadgeTone> = {
  borrador: 'neutral',
  aprobada: 'info',
  facturada: 'warning',
  pagada: 'success',
  cancelada: 'danger',
};

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador',
  aprobada: 'Aprobada',
  facturada: 'Facturada',
  pagada: 'Pagada',
  cancelada: 'Cancelada',
};

const ESTADO_OPTIONS = ['borrador', 'aprobada', 'facturada', 'pagada', 'cancelada'] as const;

export function EstimacionesModule({ empresaId }: { empresaId: string }) {
  const router = useRouter();
  const { permissions } = usePermissions();
  const puedeCrear =
    permissions.isAdmin ||
    permissions.modulos.get('dilesa.construccion.estimaciones')?.write === true;

  const [estimaciones, setEstimaciones] = useState<EstimacionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [contratistaFiltro, setContratistaFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<string>('');
  const [rangoCierre, setRangoCierre] = useState<DateRange>(EMPTY_DATE_RANGE);
  const [rangoPago, setRangoPago] = useState<DateRange>(EMPTY_DATE_RANGE);

  const fetchEstimaciones = useCallback(async (): Promise<{
    data?: EstimacionRow[];
    error?: string;
  }> => {
    const sb = createSupabaseBrowserClient();

    // 4 queries paralelas: estimaciones + estimacion_tareas (count) +
    // personas (contratistas, cross-schema) + datos satellite (abrev).
    const [eRes, etRes, personasRes, datosRes] = await Promise.all([
      sb
        .schema('dilesa')
        .from('estimaciones')
        .select(
          'id, codigo, fecha_cierre, fecha_pago_programado, contratista_id, monto_bruto, monto_neto, estado, pagada_at'
        )
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('estimacion_tareas')
        .select('estimacion_id')
        .eq('empresa_id', empresaId),
      sb
        .schema('erp')
        .from('personas')
        .select('id, nombre, apellido_paterno, apellido_materno')
        .eq('empresa_id', empresaId)
        .eq('tipo', 'contratista'),
      sb
        .schema('dilesa')
        .from('contratistas_datos')
        .select('persona_id, abreviacion')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
    ]);

    const firstErr = eRes.error ?? etRes.error ?? personasRes.error ?? datosRes.error;
    if (firstErr) {
      return {
        error: getSupabaseErrorMessage(firstErr, 'No se pudieron cargar las estimaciones.'),
      };
    }

    const personaMap = new Map<string, string>();
    for (const p of personasRes.data ?? []) {
      const nombre = [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ');
      personaMap.set(p.id as string, nombre || '(sin nombre)');
    }
    const abrevMap = new Map<string, string | null>();
    for (const d of datosRes.data ?? []) {
      abrevMap.set(d.persona_id as string, (d.abreviacion as string | null) ?? null);
    }

    const tareasByEstim = new Map<string, number>();
    for (const t of etRes.data ?? []) {
      const eid = t.estimacion_id as string;
      tareasByEstim.set(eid, (tareasByEstim.get(eid) ?? 0) + 1);
    }

    const rows: EstimacionRow[] = (eRes.data ?? []).map((e) => {
      const cid = e.contratista_id as string;
      return {
        id: e.id as string,
        codigo: e.codigo as string,
        fecha_cierre: e.fecha_cierre as string,
        fecha_pago_programado: e.fecha_pago_programado as string,
        contratista_id: cid,
        monto_bruto: Number(e.monto_bruto ?? 0),
        monto_neto: Number(e.monto_neto ?? 0),
        estado: e.estado as string,
        pagada_at: (e.pagada_at as string | null) ?? null,
        contratistaNombre: personaMap.get(cid) ?? '(sin contratista)',
        contratistaAbreviacion: abrevMap.get(cid) ?? null,
        tareasCount: tareasByEstim.get(e.id as string) ?? 0,
      };
    });

    return { data: rows };
  }, [empresaId]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await fetchEstimaciones();
    if (e) {
      setError(e);
      setEstimaciones([]);
    } else setEstimaciones(data ?? []);
    setLoading(false);
  }, [fetchEstimaciones]);

  useEffect(() => {
    let activo = true;
    void fetchEstimaciones().then(({ data, error: e }) => {
      if (!activo) return;
      if (e) {
        setError(e);
        setEstimaciones([]);
      } else setEstimaciones(data ?? []);
      setLoading(false);
    });
    return () => {
      activo = false;
    };
  }, [fetchEstimaciones]);

  const contratistasPresentes = useMemo(
    () => [...new Set(estimaciones.map((e) => e.contratistaNombre).filter(Boolean))].sort(),
    [estimaciones]
  );

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return estimaciones.filter((e) => {
      if (contratistaFiltro && e.contratistaNombre !== contratistaFiltro) return false;
      if (estadoFiltro && e.estado !== estadoFiltro) return false;
      if (!isInDateRange(e.fecha_cierre, rangoCierre)) return false;
      if (!isInDateRange(e.pagada_at, rangoPago)) return false;
      if (q) {
        const hay =
          e.codigo.toLowerCase().includes(q) || e.contratistaNombre.toLowerCase().includes(q);
        if (!hay) return false;
      }
      return true;
    });
  }, [estimaciones, search, contratistaFiltro, estadoFiltro, rangoCierre, rangoPago]);

  const kpis = useMemo(() => deriveKpis(filtradas), [filtradas]);

  /** Suma de montos visibles según filtros — útil para el operador que
   *  filtra por contratista/semana y quiere ver el total acumulado. */
  const totalesFiltrados = useMemo(() => {
    let bruto = 0;
    let neto = 0;
    for (const e of filtradas) {
      bruto += e.monto_bruto;
      neto += e.monto_neto;
    }
    return { bruto, neto };
  }, [filtradas]);

  const columns: Column<EstimacionRow>[] = [
    {
      key: 'codigo',
      label: 'Código',
      type: 'text',
      sticky: true,
      width: 'min-w-[260px]',
    },
    { key: 'fecha_cierre', label: 'Fecha cierre', type: 'date' },
    { key: 'fecha_pago_programado', label: 'Pago programado', type: 'date' },
    {
      key: 'pagada_at',
      label: 'Pagada',
      type: 'custom',
      accessor: (e) => e.pagada_at ?? '',
      render: (e) =>
        e.pagada_at ? (
          new Date(e.pagada_at).toLocaleDateString('es-MX', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          })
        ) : (
          <span className="text-[var(--text)]/30">—</span>
        ),
    },
    {
      key: 'contratistaNombre',
      label: 'Contratista',
      type: 'custom',
      accessor: (e) => e.contratistaNombre,
      render: (e) =>
        e.contratistaAbreviacion ? (
          <span title={e.contratistaNombre}>
            <span className="font-medium">{e.contratistaAbreviacion}</span>
            <span className="ml-1 text-[var(--text)]/40">·</span>
            <span className="ml-1 text-[var(--text)]/60">{e.contratistaNombre}</span>
          </span>
        ) : (
          e.contratistaNombre
        ),
    },
    { key: 'tareasCount', label: 'Tareas', type: 'number' },
    { key: 'monto_bruto', label: 'Bruto', type: 'currency' },
    { key: 'monto_neto', label: 'Neto', type: 'currency' },
    {
      key: 'estado',
      label: 'Estado',
      type: 'custom',
      accessor: (e) => e.estado,
      render: (e) => (
        <Badge tone={ESTADO_TONE[e.estado] ?? 'neutral'}>
          {ESTADO_LABEL[e.estado] ?? e.estado}
        </Badge>
      ),
    },
  ];

  const onRowClick = (e: EstimacionRow) => {
    router.push(`/dilesa/construccion/estimaciones/${e.id}`);
  };

  const moneyFmt = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  });

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <Banknote className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Estimaciones</h1>
          <p className="text-sm text-[var(--text)]/60">
            Ciclo de pago semanal a contratistas: cierre miércoles, pago jueves. Cada estimación
            agrupa las tareas terminadas pendientes y aplica retención 5%.
          </p>
        </div>
      </header>

      <ModuleKpiStrip stats={kpis} cols={5} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar código o contratista…"
            className="w-72 pl-9"
          />
        </div>
        <select
          value={contratistaFiltro}
          onChange={(e) => setContratistaFiltro(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Todos los contratistas</option>
          {contratistasPresentes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={estadoFiltro}
          onChange={(e) => setEstadoFiltro(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Todos los estados</option>
          {ESTADO_OPTIONS.map((e) => (
            <option key={e} value={e}>
              {ESTADO_LABEL[e]}
            </option>
          ))}
        </select>
        <DateRangeFilter
          label="Cierre"
          ariaPrefix="Fecha cierre"
          value={rangoCierre}
          onChange={setRangoCierre}
        />
        <DateRangeFilter
          label="Pago"
          ariaPrefix="Fecha pagada"
          value={rangoPago}
          onChange={setRangoPago}
        />
        <button
          type="button"
          onClick={() => void cargar()}
          className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refrescar
        </button>
        <span className="ml-auto text-sm text-[var(--text)]/60">
          {filtradas.length} de {estimaciones.length} estimaciones
          {filtradas.length > 0 ? (
            <>
              {' · '}
              <span className="tabular-nums text-[var(--text)]/80">
                Neto {moneyFmt.format(totalesFiltrados.neto)}
              </span>
            </>
          ) : null}
        </span>
        {puedeCrear ? (
          <Link
            href="/dilesa/construccion/estimaciones/nueva"
            className="flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            Nueva estimación
          </Link>
        ) : null}
      </div>

      <DataTable
        data={filtradas}
        columns={columns}
        rowKey="id"
        loading={loading}
        error={error}
        onRetry={() => void cargar()}
        onRowClick={onRowClick}
        initialSort={{ key: 'fecha_cierre', dir: 'desc' }}
        emptyTitle="Sin estimaciones"
        emptyDescription="No hay estimaciones que coincidan con los filtros actuales."
        emptyIcon={<Banknote className="h-6 w-6" />}
        maxHeight="calc(100vh - 280px)"
      />
    </div>
  );
}
