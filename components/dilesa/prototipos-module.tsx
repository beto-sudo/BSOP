'use client';

/**
 * PrototiposModule — lista de prototipos de vivienda DILESA.
 *
 * Iniciativa dilesa-construccion · Sprint tabs+protos. Tab "Prototipos"
 * del hub Construcción. Lista filtrable de `dilesa.productos` (~14
 * prototipos por proyecto): nombre, proyecto, m² construcción, costo
 * materiales, último precio MO/m² histórico (derivado de la
 * construcción más reciente con ese producto_id), total MO calculado,
 * count de obras en construcción / terminadas.
 *
 * Click → /dilesa/construccion/prototipos/[id] con detalle: datos
 * generales, grid de planos (JSONB productos.planos), plantilla de
 * tareas con costo MO calculado por tarea, KPIs derivados.
 *
 * Atributos del JSONB `productos.atributos`:
 *   - modelo (string) — sufijo del prototipo (ej. "ISC")
 *   - m2_construccion (number) — usado por el form de contrato para
 *     calcular valor MO = precio_mo_x_m2 × m².
 *   - costo_materiales / tiempo_construccion (number, opcionales) —
 *     poblados desde Coda en imports históricos; "—" si ausentes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, ModuleKpiStrip, type Column, type ModuleKpi } from '@/components/module-page';
import { Input } from '@/components/ui/input';
import { Home, RefreshCw, Search } from 'lucide-react';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency, formatNumber } from '@/lib/format';

export type PrototipoRow = {
  id: string;
  nombre: string;
  proyectoNombre: string;
  m2_construccion: number | null;
  tiempo_construccion: number | null;
  costo_materiales: number | null;
  ultimoPrecioMoM2: number | null;
  totalMoCalculado: number | null;
  obrasEnConstruccion: number;
  obrasTerminadas: number;
  valor_comercial_referencia: number | null;
  costo_urbanizacion_referencia: number | null;
  costo_materiales_referencia: number | null;
  costo_mo_referencia: number | null;
  registro_ruv_referencia: number | null;
  seguro_calidad_referencia: number | null;
  costo_comercializacion_referencia: number | null;
};

const EN_CURSO = new Set(['arrancada', 'en_progreso']);
const TERMINADA = new Set(['terminada', 'dtu', 'seguro_calidad', 'extraida']);

/** KPIs reactivos a filtros — ADR-034. */
export function deriveKpis(rows: readonly PrototipoRow[]): readonly ModuleKpi[] {
  const total = rows.length;
  const obrasEnCurso = rows.reduce((acc, p) => acc + p.obrasEnConstruccion, 0);
  const obrasTerminadas = rows.reduce((acc, p) => acc + p.obrasTerminadas, 0);

  const mos = rows.map((p) => p.totalMoCalculado).filter((v): v is number => typeof v === 'number');
  const moPromedio = mos.length === 0 ? null : mos.reduce((a, b) => a + b, 0) / mos.length;

  const m2s = rows.map((p) => p.m2_construccion).filter((v): v is number => typeof v === 'number');
  const m2Promedio = m2s.length === 0 ? null : m2s.reduce((a, b) => a + b, 0) / m2s.length;

  return [
    { key: 'total', label: 'Prototipos', value: total },
    { key: 'obras_curso', label: 'Obras activas', value: obrasEnCurso },
    { key: 'obras_term', label: 'Obras terminadas', value: obrasTerminadas },
    {
      key: 'mo_promedio',
      label: 'MO promedio',
      value: moPromedio == null ? '—' : formatCurrency(moPromedio, { compact: true }),
    },
    {
      key: 'm2',
      label: 'm² promedio',
      value: m2Promedio == null ? '—' : `${formatNumber(m2Promedio, { decimals: 0 })} m²`,
    },
  ];
}

/**
 * Lee la m² del JSONB atributos (coerciona string a number cuando viene
 * como texto desde imports legacy). Devuelve null si no hay o no parsea.
 */
function readNumFromAttrs(
  attrs: Record<string, unknown> | null | undefined,
  key: string
): number | null {
  if (!attrs) return null;
  const raw = attrs[key];
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function PrototiposModule({ empresaId }: { empresaId: string }) {
  const router = useRouter();
  const [prototipos, setPrototipos] = useState<PrototipoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [proyectoFiltro, setProyectoFiltro] = useState('');

  const fetchPrototipos = useCallback(async (): Promise<{
    data?: PrototipoRow[];
    error?: string;
  }> => {
    const sb = createSupabaseBrowserClient();

    // 3 queries paralelas: productos + proyectos (lookup) + construcciones
    // (para último precio MO histórico + counts).
    const [productosRes, proyectosRes, obrasRes] = await Promise.all([
      sb
        .schema('dilesa')
        .from('productos')
        .select(
          'id, nombre, proyecto_id, atributos, valor_comercial_referencia, costo_urbanizacion_referencia, costo_materiales_referencia, costo_mo_referencia, registro_ruv_referencia, seguro_calidad_referencia, costo_comercializacion_referencia'
        )
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('proyectos')
        .select('id, nombre')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('construccion')
        .select('producto_id, precio_mo_x_m2, fecha_arranque, estado')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
    ]);

    const firstErr = productosRes.error ?? proyectosRes.error ?? obrasRes.error;
    if (firstErr) {
      return { error: getSupabaseErrorMessage(firstErr, 'No se pudieron cargar los prototipos.') };
    }

    const proyectoMap = new Map<string, string>();
    for (const p of proyectosRes.data ?? []) proyectoMap.set(p.id as string, p.nombre as string);

    // Derivados por producto_id: último precio (max fecha_arranque con
    // precio_mo_x_m2 not null), conteo por estado.
    type Agg = {
      ultimoPrecio: number | null;
      ultimaFecha: string | null;
      enCurso: number;
      terminadas: number;
    };
    const aggMap = new Map<string, Agg>();
    for (const o of obrasRes.data ?? []) {
      const pid = o.producto_id as string;
      const agg = aggMap.get(pid) ?? {
        ultimoPrecio: null,
        ultimaFecha: null,
        enCurso: 0,
        terminadas: 0,
      };
      const estado = o.estado as string;
      if (EN_CURSO.has(estado)) agg.enCurso += 1;
      else if (TERMINADA.has(estado)) agg.terminadas += 1;
      const precio = o.precio_mo_x_m2 as number | null;
      const fecha = o.fecha_arranque as string | null;
      if (precio != null && fecha != null) {
        if (!agg.ultimaFecha || fecha > agg.ultimaFecha) {
          agg.ultimaFecha = fecha;
          agg.ultimoPrecio = Number(precio);
        }
      }
      aggMap.set(pid, agg);
    }

    const rows: PrototipoRow[] = (productosRes.data ?? []).map((p) => {
      const attrs = (p.atributos as Record<string, unknown> | null) ?? {};
      const m2 = readNumFromAttrs(attrs, 'm2_construccion');
      const tiempo = readNumFromAttrs(attrs, 'tiempo_construccion');
      const costoMat = readNumFromAttrs(attrs, 'costo_materiales');
      const agg = aggMap.get(p.id as string) ?? {
        ultimoPrecio: null,
        ultimaFecha: null,
        enCurso: 0,
        terminadas: 0,
      };
      const totalMo = m2 != null && agg.ultimoPrecio != null ? m2 * agg.ultimoPrecio : null;
      return {
        id: p.id as string,
        nombre: p.nombre as string,
        proyectoNombre: proyectoMap.get(p.proyecto_id as string) ?? '',
        m2_construccion: m2,
        tiempo_construccion: tiempo,
        costo_materiales: costoMat,
        ultimoPrecioMoM2: agg.ultimoPrecio,
        totalMoCalculado: totalMo,
        obrasEnConstruccion: agg.enCurso,
        obrasTerminadas: agg.terminadas,
        valor_comercial_referencia: p.valor_comercial_referencia as number | null,
        costo_urbanizacion_referencia: p.costo_urbanizacion_referencia as number | null,
        costo_materiales_referencia: p.costo_materiales_referencia as number | null,
        costo_mo_referencia: p.costo_mo_referencia as number | null,
        registro_ruv_referencia: p.registro_ruv_referencia as number | null,
        seguro_calidad_referencia: p.seguro_calidad_referencia as number | null,
        costo_comercializacion_referencia: p.costo_comercializacion_referencia as number | null,
      };
    });

    return { data: rows };
  }, [empresaId]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await fetchPrototipos();
    if (e) {
      setError(e);
      setPrototipos([]);
    } else setPrototipos(data ?? []);
    setLoading(false);
  }, [fetchPrototipos]);

  useEffect(() => {
    let activo = true;
    void fetchPrototipos().then(({ data, error: e }) => {
      if (!activo) return;
      if (e) {
        setError(e);
        setPrototipos([]);
      } else setPrototipos(data ?? []);
      setLoading(false);
    });
    return () => {
      activo = false;
    };
  }, [fetchPrototipos]);

  const proyectosPresentes = useMemo(
    () => [...new Set(prototipos.map((p) => p.proyectoNombre).filter(Boolean))].sort(),
    [prototipos]
  );

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prototipos.filter((p) => {
      if (proyectoFiltro && p.proyectoNombre !== proyectoFiltro) return false;
      if (q) {
        const hay =
          p.nombre.toLowerCase().includes(q) || p.proyectoNombre.toLowerCase().includes(q);
        if (!hay) return false;
      }
      return true;
    });
  }, [prototipos, search, proyectoFiltro]);

  const kpis = useMemo(() => deriveKpis(filtrados), [filtrados]);

  const columns: Column<PrototipoRow>[] = [
    {
      key: 'nombre',
      label: 'Prototipo',
      type: 'text',
      sticky: true,
      width: 'min-w-[220px]',
    },
    { key: 'proyectoNombre', label: 'Proyecto', type: 'text' },
    {
      key: 'm2_construccion',
      label: 'm² construcción',
      type: 'custom',
      accessor: (p) => p.m2_construccion ?? 0,
      render: (p) =>
        p.m2_construccion != null ? (
          <span className="tabular-nums">{p.m2_construccion.toFixed(2)}</span>
        ) : (
          '—'
        ),
    },
    {
      key: 'tiempo_construccion',
      label: 'Días est.',
      type: 'custom',
      accessor: (p) => p.tiempo_construccion ?? 0,
      render: (p) =>
        p.tiempo_construccion != null ? (
          <span className="tabular-nums">{p.tiempo_construccion}</span>
        ) : (
          '—'
        ),
    },
    {
      key: 'ultimoPrecioMoM2',
      label: 'Último MO/m²',
      type: 'custom',
      accessor: (p) => p.ultimoPrecioMoM2 ?? 0,
      render: (p) =>
        p.ultimoPrecioMoM2 != null ? (
          <span className="tabular-nums">${p.ultimoPrecioMoM2.toFixed(0)}</span>
        ) : (
          <span className="text-[var(--text)]/40">—</span>
        ),
    },
    {
      key: 'totalMoCalculado',
      label: 'Total MO',
      type: 'custom',
      accessor: (p) => p.totalMoCalculado ?? 0,
      render: (p) =>
        p.totalMoCalculado != null ? (
          <span className="tabular-nums">${p.totalMoCalculado.toFixed(0)}</span>
        ) : (
          <span className="text-[var(--text)]/40">—</span>
        ),
    },
    {
      key: 'valor_comercial_referencia',
      label: 'Valor comercial',
      type: 'custom',
      accessor: (p) => p.valor_comercial_referencia ?? 0,
      render: (p) =>
        p.valor_comercial_referencia != null ? (
          <span className="tabular-nums">{formatCurrency(p.valor_comercial_referencia)}</span>
        ) : (
          <span className="text-[var(--text)]/40">—</span>
        ),
    },
    {
      key: 'costo_materiales_referencia',
      label: 'Materiales ref',
      type: 'custom',
      accessor: (p) => p.costo_materiales_referencia ?? 0,
      render: (p) =>
        p.costo_materiales_referencia != null ? (
          <span className="tabular-nums">{formatCurrency(p.costo_materiales_referencia)}</span>
        ) : (
          <span className="text-[var(--text)]/40">—</span>
        ),
    },
    {
      key: 'costo_mo_referencia',
      label: 'MO ref',
      type: 'custom',
      accessor: (p) => p.costo_mo_referencia ?? 0,
      render: (p) =>
        p.costo_mo_referencia != null ? (
          <span className="tabular-nums">{formatCurrency(p.costo_mo_referencia)}</span>
        ) : (
          <span className="text-[var(--text)]/40">—</span>
        ),
    },
    {
      key: 'costo_urbanizacion_referencia',
      label: 'Urbanización ref',
      type: 'custom',
      accessor: (p) => p.costo_urbanizacion_referencia ?? 0,
      render: (p) =>
        p.costo_urbanizacion_referencia != null ? (
          <span className="tabular-nums">{formatCurrency(p.costo_urbanizacion_referencia)}</span>
        ) : (
          <span className="text-[var(--text)]/40">—</span>
        ),
    },
    {
      key: 'registro_ruv_referencia',
      label: 'RUV ref',
      type: 'custom',
      accessor: (p) => p.registro_ruv_referencia ?? 0,
      render: (p) =>
        p.registro_ruv_referencia != null ? (
          <span className="tabular-nums">{formatCurrency(p.registro_ruv_referencia)}</span>
        ) : (
          <span className="text-[var(--text)]/40">—</span>
        ),
    },
    {
      key: 'seguro_calidad_referencia',
      label: 'Seguro cal. ref',
      type: 'custom',
      accessor: (p) => p.seguro_calidad_referencia ?? 0,
      render: (p) =>
        p.seguro_calidad_referencia != null ? (
          <span className="tabular-nums">{formatCurrency(p.seguro_calidad_referencia)}</span>
        ) : (
          <span className="text-[var(--text)]/40">—</span>
        ),
    },
    {
      key: 'costo_comercializacion_referencia',
      label: 'Comercializ. ref',
      type: 'custom',
      accessor: (p) => p.costo_comercializacion_referencia ?? 0,
      render: (p) =>
        p.costo_comercializacion_referencia != null ? (
          <span className="tabular-nums">
            {formatCurrency(p.costo_comercializacion_referencia)}
          </span>
        ) : (
          <span className="text-[var(--text)]/40">—</span>
        ),
    },
    { key: 'obrasEnConstruccion', label: 'En curso', type: 'number' },
    { key: 'obrasTerminadas', label: 'Terminadas', type: 'number' },
  ];

  const onRowClick = (p: PrototipoRow) => {
    router.push(`/dilesa/construccion/prototipos/${p.id}`);
  };

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <Home className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Prototipos</h1>
          <p className="text-sm text-[var(--text)]/60">
            Modelos de vivienda por proyecto con planos, plantilla de tareas, y costo MO calculado
            del último precio histórico.
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
            placeholder="Buscar prototipo o proyecto…"
            className="w-72 pl-9"
          />
        </div>
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
        <button
          type="button"
          onClick={() => void cargar()}
          className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refrescar
        </button>
        <span className="ml-auto text-sm text-[var(--text)]/60">
          {filtrados.length} de {prototipos.length} prototipos
        </span>
      </div>

      <DataTable
        data={filtrados}
        columns={columns}
        rowKey="id"
        loading={loading}
        error={error}
        onRetry={() => void cargar()}
        onRowClick={onRowClick}
        initialSort={{ key: 'nombre', dir: 'asc' }}
        emptyTitle="Sin prototipos"
        emptyDescription="No hay prototipos que coincidan con los filtros actuales."
        emptyIcon={<Home className="h-6 w-6" />}
        maxHeight="calc(100vh - 280px)"
      />
    </div>
  );
}
