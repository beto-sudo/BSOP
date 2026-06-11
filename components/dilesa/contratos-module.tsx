'use client';

/**
 * ContratosModule — lista de contratos de construcción DILESA.
 *
 * Iniciativa dilesa-construccion · Sprint tabs+protos; sub-vistas por tipo
 * de dilesa-contratos-estimaciones · Sprint 2. Tab "Contratos" del hub
 * Construcción, dividido en dos vistas (los dos sistemas son distintos y
 * estaban revueltos):
 *
 *   - **Vivienda**: contratos de MO por lotes (destajos semanales,
 *     ADR-033) — columnas código/contratista/lotes/valor MO.
 *   - **Obra de proyecto**: urbanización / obra de cabecera / tarea menor
 *     (ADR-038) — columnas con badge de tipo, contratado, devengado
 *     (Σ estimaciones autorizadas, D4) y por devengar; KPIs propios.
 *
 * Click en fila → /dilesa/construccion/contratos/[id] con la ficha
 * completa.
 *
 * Carga cross-schema con queries paralelas + lookups Map (mismo patrón
 * que construccion-module / contratistas-module — evita embeds de
 * PostgREST cuando la tabla embebida vive en > 1 schema y permite
 * filtros sobre los nombres derivados sin hits adicionales).
 *
 * Botón "+ Nuevo contrato" lleva al form combinado de Sprint 4 que crea
 * cabecera + arranca N lotes en una sola operación.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { usePermissions } from '@/components/providers';
import { DataTable, ModuleKpiStrip, type Column, type ModuleKpi } from '@/components/module-page';
import { Input } from '@/components/ui/input';
import {
  DateRangeFilter,
  EMPTY_DATE_RANGE,
  isInDateRange,
  type DateRange,
} from '@/components/filters/date-range-filter';
import { FileText, HardHat, Plus, RefreshCw, Search, Wrench } from 'lucide-react';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency } from '@/lib/format';
import { TIPO_CONTRATO_LABEL } from '@/lib/dilesa/contratos-estado-cuenta';

export type ContratoRow = {
  id: string;
  codigo: string;
  fecha_contrato: string;
  contratista_id: string;
  proyecto_id: string | null;
  valor_total: number;
  /** vivienda | urbanizacion | obra_cabecera | tarea_menor (ADR-038). */
  tipo: string;
  /** Cancelado (p2p-cancelaciones): badge en la lista; excluido de KPI/comprometido. */
  cancelada_at: string | null;
  /** Computed: nombre del contratista (erp.personas). */
  contratistaNombre: string;
  contratistaAbreviacion: string | null;
  /** Computed: nombre del proyecto (dilesa.proyectos). */
  proyectoNombre: string;
  /** Computed: count de contrato_lotes (no soft-deleted). */
  lotesCount: number;
  /** Computed: Σ estimaciones autorizadas+pagadas (devengo, D4). Solo obra. */
  devengado: number;
};

export type VistaContratos = 'vivienda' | 'obra';

export function esContratoObra(c: Pick<ContratoRow, 'tipo'>): boolean {
  return c.tipo !== 'vivienda';
}

/**
 * KPIs reactivos a filtros — ADR-034. Pivote vs curaduría: "% consumido
 * promedio" y "próximo vencimiento" no son derivables del row plano.
 * Reemplazados por agregados del portafolio de contratos.
 */
export function deriveKpis(rows: readonly ContratoRow[]): readonly ModuleKpi[] {
  const total = rows.length;
  const valorTotal = rows.reduce((acc, r) => acc + (r.valor_total ?? 0), 0);
  const lotesAsignados = rows.reduce((acc, r) => acc + r.lotesCount, 0);
  const promedio = total === 0 ? null : valorTotal / total;

  const porContratista = new Map<string, number>();
  for (const r of rows) {
    porContratista.set(r.contratistaNombre, (porContratista.get(r.contratistaNombre) ?? 0) + 1);
  }
  let topContratista: string | null = null;
  let topCount = 0;
  for (const [nombre, count] of [...porContratista.entries()].sort(([a], [b]) =>
    a.localeCompare(b, 'es')
  )) {
    if (count > topCount) {
      topCount = count;
      topContratista = nombre;
    }
  }

  return [
    { key: 'total', label: 'Contratos', value: total },
    {
      key: 'valor',
      label: 'Valor total',
      value: total === 0 ? '—' : formatCurrency(valorTotal, { compact: true }),
    },
    { key: 'lotes', label: 'Lotes asignados', value: lotesAsignados },
    {
      key: 'promedio',
      label: 'Promedio/contrato',
      value: promedio == null ? '—' : formatCurrency(promedio, { compact: true }),
    },
    {
      key: 'top',
      label: 'Top contratista',
      value: topContratista ? `${topContratista} (${topCount})` : '—',
    },
  ];
}

/**
 * KPIs de la vista Obra de proyecto (dilesa-contratos-estimaciones S2):
 * el pulso financiero del portafolio de contratos de obra. Los cancelados
 * cuentan en "Contratos" (visibles con badge) pero NO suman dinero —
 * espejo del comprometido de v_partida_control (ADR-042).
 */
export function deriveKpisObra(rows: readonly ContratoRow[]): readonly ModuleKpi[] {
  const activos = rows.filter((r) => !r.cancelada_at);
  const contratado = activos.reduce((acc, r) => acc + (r.valor_total ?? 0), 0);
  const devengado = activos.reduce((acc, r) => acc + (r.devengado ?? 0), 0);
  const avancePct = contratado > 0 ? (devengado / contratado) * 100 : null;

  return [
    { key: 'total', label: 'Contratos', value: rows.length },
    {
      key: 'contratado',
      label: 'Contratado',
      value: activos.length === 0 ? '—' : formatCurrency(contratado, { compact: true }),
    },
    {
      key: 'devengado',
      label: 'Devengado (Σ est. autorizadas)',
      value: activos.length === 0 ? '—' : formatCurrency(devengado, { compact: true }),
    },
    {
      key: 'por_devengar',
      label: 'Por devengar',
      value: activos.length === 0 ? '—' : formatCurrency(contratado - devengado, { compact: true }),
    },
    {
      key: 'avance',
      label: 'Avance financiero',
      value: avancePct == null ? '—' : `${avancePct.toFixed(0)}%`,
    },
  ];
}

export function ContratosModule({ empresaId }: { empresaId: string }) {
  const router = useRouter();
  const { permissions } = usePermissions();
  const puedeCrear =
    permissions.isAdmin || permissions.modulos.get('dilesa.construccion.contratos')?.write === true;

  const [contratos, setContratos] = useState<ContratoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<VistaContratos>('vivienda');
  const [search, setSearch] = useState('');
  const [contratistaFiltro, setContratistaFiltro] = useState('');
  const [proyectoFiltro, setProyectoFiltro] = useState('');
  const [rangoFecha, setRangoFecha] = useState<DateRange>(EMPTY_DATE_RANGE);

  const fetchContratos = useCallback(async (): Promise<{
    data?: ContratoRow[];
    error?: string;
  }> => {
    const sb = createSupabaseBrowserClient();

    // Queries paralelas: contratos + contrato_lotes (count vivienda) +
    // estimaciones (devengado obra) + personas (contratistas) + proyectos
    // (+ satélite de abrev en aparte para no inflar el cross-join).
    const [contratosRes, lotesRes, estimacionesRes, personasRes, proyectosRes, datosRes] =
      await Promise.all([
        sb
          .schema('dilesa')
          .from('contratos_construccion')
          .select(
            'id, codigo, fecha_contrato, contratista_id, proyecto_id, valor_total, tipo, cancelada_at'
          )
          .eq('empresa_id', empresaId)
          .is('deleted_at', null),
        sb
          .schema('dilesa')
          .from('contrato_lotes')
          .select('contrato_id')
          .eq('empresa_id', empresaId)
          .is('deleted_at', null),
        // Devengado por contrato (D4) = Σ estimaciones autorizadas+pagadas.
        // `estado` (S1) aún no está en types — se regeneran al aplicar.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb.schema('dilesa') as any)
          .from('obra_estimaciones')
          .select('contrato_id, monto_total, estado')
          .eq('empresa_id', empresaId)
          .is('deleted_at', null)
          .in('estado', ['autorizada', 'pagada']),
        sb
          .schema('erp')
          .from('personas')
          .select('id, nombre, apellido_paterno, apellido_materno')
          .eq('empresa_id', empresaId)
          .eq('tipo', 'contratista'),
        sb
          .schema('dilesa')
          .from('proyectos')
          .select('id, nombre')
          .eq('empresa_id', empresaId)
          .is('deleted_at', null),
        sb
          .schema('dilesa')
          .from('contratistas_datos')
          .select('persona_id, abreviacion')
          .eq('empresa_id', empresaId)
          .is('deleted_at', null),
      ]);

    const firstErr =
      contratosRes.error ??
      lotesRes.error ??
      estimacionesRes.error ??
      personasRes.error ??
      proyectosRes.error ??
      datosRes.error;
    if (firstErr) {
      return { error: getSupabaseErrorMessage(firstErr, 'No se pudieron cargar los contratos.') };
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
    const proyectoMap = new Map<string, string>();
    for (const p of proyectosRes.data ?? []) proyectoMap.set(p.id as string, p.nombre as string);

    const lotesByContrato = new Map<string, number>();
    for (const l of lotesRes.data ?? []) {
      const cid = l.contrato_id as string;
      lotesByContrato.set(cid, (lotesByContrato.get(cid) ?? 0) + 1);
    }

    const devengadoByContrato = new Map<string, number>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const e of (estimacionesRes.data ?? []) as any[]) {
      const cid = e.contrato_id as string;
      devengadoByContrato.set(
        cid,
        (devengadoByContrato.get(cid) ?? 0) + Number(e.monto_total ?? 0)
      );
    }

    const rows: ContratoRow[] = (contratosRes.data ?? []).map((c) => {
      const cid = c.contratista_id as string;
      const pid = c.proyecto_id as string | null;
      return {
        id: c.id as string,
        codigo: c.codigo as string,
        cancelada_at: (c.cancelada_at as string | null) ?? null,
        fecha_contrato: c.fecha_contrato as string,
        contratista_id: cid,
        proyecto_id: pid,
        valor_total: Number(c.valor_total ?? 0),
        tipo: (c.tipo as string) ?? 'vivienda',
        contratistaNombre: personaMap.get(cid) ?? '(sin contratista)',
        contratistaAbreviacion: abrevMap.get(cid) ?? null,
        proyectoNombre: pid ? (proyectoMap.get(pid) ?? '') : '',
        lotesCount: lotesByContrato.get(c.id as string) ?? 0,
        devengado: devengadoByContrato.get(c.id as string) ?? 0,
      };
    });

    return { data: rows };
  }, [empresaId]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await fetchContratos();
    if (e) {
      setError(e);
      setContratos([]);
    } else setContratos(data ?? []);
    setLoading(false);
  }, [fetchContratos]);

  useEffect(() => {
    let activo = true;
    void fetchContratos().then(({ data, error: e }) => {
      if (!activo) return;
      if (e) {
        setError(e);
        setContratos([]);
      } else setContratos(data ?? []);
      setLoading(false);
    });
    return () => {
      activo = false;
    };
  }, [fetchContratos]);

  const contratistasPresentes = useMemo(
    () => [...new Set(contratos.map((c) => c.contratistaNombre).filter(Boolean))].sort(),
    [contratos]
  );
  const proyectosPresentes = useMemo(
    () => [...new Set(contratos.map((c) => c.proyectoNombre).filter(Boolean))].sort(),
    [contratos]
  );

  const conteoVistas = useMemo(
    () => ({
      vivienda: contratos.filter((c) => !esContratoObra(c)).length,
      obra: contratos.filter(esContratoObra).length,
    }),
    [contratos]
  );

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contratos.filter((c) => {
      if (vista === 'obra' ? !esContratoObra(c) : esContratoObra(c)) return false;
      if (contratistaFiltro && c.contratistaNombre !== contratistaFiltro) return false;
      if (proyectoFiltro && c.proyectoNombre !== proyectoFiltro) return false;
      if (!isInDateRange(c.fecha_contrato, rangoFecha)) return false;
      if (q) {
        const hay =
          c.codigo.toLowerCase().includes(q) ||
          c.contratistaNombre.toLowerCase().includes(q) ||
          c.proyectoNombre.toLowerCase().includes(q);
        if (!hay) return false;
      }
      return true;
    });
  }, [contratos, vista, search, contratistaFiltro, proyectoFiltro, rangoFecha]);

  const kpis = useMemo(
    () => (vista === 'obra' ? deriveKpisObra(filtrados) : deriveKpis(filtrados)),
    [vista, filtrados]
  );

  const colCodigo: Column<ContratoRow> = {
    key: 'codigo',
    label: 'Código',
    type: 'custom',
    accessor: (c) => c.codigo,
    sticky: true,
    width: 'min-w-[240px]',
    render: (c) =>
      c.cancelada_at ? (
        <span className="flex items-center gap-1.5">
          <span className="text-[var(--text)]/60 line-through">{c.codigo}</span>
          <span className="rounded bg-destructive/10 px-1 text-[10px] text-destructive">
            cancelado
          </span>
        </span>
      ) : (
        c.codigo
      ),
  };
  const colContratista: Column<ContratoRow> = {
    key: 'contratistaNombre',
    label: 'Contratista',
    type: 'custom',
    accessor: (c) => c.contratistaNombre,
    render: (c) =>
      c.contratistaAbreviacion ? (
        <span title={c.contratistaNombre}>
          <span className="font-medium">{c.contratistaAbreviacion}</span>
          <span className="ml-1 text-[var(--text)]/40">·</span>
          <span className="ml-1 text-[var(--text)]/60">{c.contratistaNombre}</span>
        </span>
      ) : (
        c.contratistaNombre
      ),
  };
  const colProyecto: Column<ContratoRow> = {
    key: 'proyectoNombre',
    label: 'Proyecto',
    type: 'text',
    render: (c) => c.proyectoNombre || '—',
  };

  const columnsVivienda: Column<ContratoRow>[] = [
    colCodigo,
    { key: 'fecha_contrato', label: 'Fecha', type: 'date' },
    colContratista,
    colProyecto,
    { key: 'lotesCount', label: 'Lotes', type: 'number' },
    { key: 'valor_total', label: 'Valor MO', type: 'currency' },
  ];

  const columnsObra: Column<ContratoRow>[] = [
    colCodigo,
    { key: 'fecha_contrato', label: 'Fecha', type: 'date' },
    colContratista,
    colProyecto,
    {
      key: 'tipo',
      label: 'Tipo',
      type: 'custom',
      accessor: (c) => TIPO_CONTRATO_LABEL[c.tipo] ?? c.tipo,
      render: (c) => (
        <span className="inline-block rounded bg-[var(--text)]/5 px-1.5 py-0.5 text-[11px] text-[var(--text)]/70">
          {TIPO_CONTRATO_LABEL[c.tipo] ?? c.tipo}
        </span>
      ),
    },
    { key: 'valor_total', label: 'Contratado', type: 'currency' },
    { key: 'devengado', label: 'Devengado', type: 'currency' },
    {
      key: 'por_devengar',
      label: 'Por devengar',
      type: 'custom',
      accessor: (c) => c.valor_total - c.devengado,
      render: (c) => (
        <span className="tabular-nums">{formatCurrency(c.valor_total - c.devengado)}</span>
      ),
    },
  ];

  const onRowClick = (c: ContratoRow) => {
    router.push(`/dilesa/construccion/contratos/${c.id}`);
  };

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Contratos</h1>
          <p className="text-sm text-[var(--text)]/60">
            {vista === 'vivienda'
              ? 'Contratos de MO por lotes. Cada uno cubre 1+ lotes con su precio MO/m² y arranca obras en una sola operación; se pagan por destajos semanales.'
              : 'Contratos de obra del proyecto (urbanización, cabecera, tareas menores). Su avance se devenga con estimaciones autorizadas por Dirección.'}
          </p>
        </div>
      </header>

      {/* Sub-vistas por tipo (dilesa-contratos-estimaciones S2): vivienda y
          obra de proyecto son sistemas distintos (destajos vs estimaciones). */}
      <div
        role="tablist"
        aria-label="Tipo de contrato"
        className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--card)] p-0.5"
      >
        <VistaTab
          activa={vista === 'vivienda'}
          onClick={() => setVista('vivienda')}
          icon={<HardHat className="h-3.5 w-3.5" />}
          label={`Vivienda (${conteoVistas.vivienda})`}
        />
        <VistaTab
          activa={vista === 'obra'}
          onClick={() => setVista('obra')}
          icon={<Wrench className="h-3.5 w-3.5" />}
          label={`Obra de proyecto (${conteoVistas.obra})`}
        />
      </div>

      <ModuleKpiStrip stats={kpis} cols={5} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar código, contratista o proyecto…"
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
          value={proyectoFiltro}
          onChange={(e) => setProyectoFiltro(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Todos los proyectos</option>
          {proyectosPresentes.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <DateRangeFilter
          label="Fecha"
          ariaPrefix="Fecha contrato"
          value={rangoFecha}
          onChange={setRangoFecha}
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
          {filtrados.length} de {contratos.length} contratos
        </span>
        {puedeCrear && vista === 'vivienda' ? (
          <Link
            href="/dilesa/construccion/contratos/nuevo"
            className="flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo contrato + arranques
          </Link>
        ) : null}
        {puedeCrear && vista === 'obra' ? (
          <Link
            href="/dilesa/construccion/contratos/nuevo-obra"
            className="flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo contrato de obra
          </Link>
        ) : null}
      </div>

      <DataTable
        data={filtrados}
        columns={vista === 'obra' ? columnsObra : columnsVivienda}
        rowKey="id"
        loading={loading}
        error={error}
        onRetry={() => void cargar()}
        onRowClick={onRowClick}
        initialSort={{ key: 'fecha_contrato', dir: 'desc' }}
        emptyTitle="Sin contratos"
        emptyDescription="No hay contratos que coincidan con los filtros actuales."
        emptyIcon={<FileText className="h-6 w-6" />}
        maxHeight="calc(100vh - 280px)"
      />
    </div>
  );
}

function VistaTab({
  activa,
  onClick,
  icon,
  label,
}: {
  activa: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        activa
          ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
          : 'text-[var(--text)]/60 hover:text-[var(--text)]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
