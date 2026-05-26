'use client';

/**
 * InventarioModule — vista comercial de unidades disponibles DILESA.
 *
 * Iniciativa dilesa-portafolio-activos. Distinta de Portafolio (que muestra
 * todos los activos patrimoniales). Aquí solo aparecen unidades que se
 * pueden ofrecer a un cliente hoy:
 *   estado IN ('en_construccion', 'terminada')
 *
 * Regla operativa DILESA: una unidad NO es vendible hasta que su obra
 * cruzó el 20% de avance (trigger `tg_construccion_avance` marca la unidad
 * como `en_construccion` automáticamente). Las `planeada` / `lote_urbanizado`
 * son lotes sin obra arrancada y no aparecen aquí.
 *
 * Cada fila muestra el precio calculado (vía RPC fn_calcular_precio_venta)
 * para que el vendedor pueda cotizar sin tener que abrir el form. Click en
 * "Asignar a cliente" navega a /dilesa/ventas/nueva?unidad=<id>.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, ModuleKpiStrip, type Column, type ModuleKpi } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DateRangeFilter,
  EMPTY_DATE_RANGE,
  isInDateRange,
  type DateRange,
} from '@/components/filters/date-range-filter';
import { Boxes, RefreshCw, Search, ArrowRight } from 'lucide-react';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency } from '@/lib/format';

type UnidadRow = {
  id: string;
  identificador: string;
  area_m2: number | null;
  m2_construccion: number | null;
  es_esquina: boolean | null;
  tiene_frente_verde: boolean | null;
  estado: string;
  proyecto_id: string;
  producto_id: string | null;
  created_at: string;
};

export type UnidadListaRow = UnidadRow & {
  proyectoNombre: string;
  prototipo: string | null;
  /** Identificador "Coda-style": M3-L9-LDLE-ISC (con sufijo prototipo). */
  identificadorCompleto: string;
  /** Precio total calculado por la RPC (sin tipo de crédito — base) */
  precio: number | null;
  /** Días en inventario desde unidad.created_at */
  diasInventario: number;
};

const ESTADO_TONE: Record<string, BadgeTone> = {
  en_construccion: 'info',
  terminada: 'success',
};

const ESTADO_LABEL: Record<string, string> = {
  en_construccion: 'En construcción',
  terminada: 'Terminada',
};

/**
 * KPIs reactivos a filtros — ADR-034 (Module-level KPI strips).
 *
 * Pivote vs curaduría Sprint 0 (D9, ver planning doc):
 * La curaduría original proponía "Disponibles · Apartadas · Vendidas ·
 * % ocupación · $ inventario disponible". Auditando el schema:
 *
 * 1. No existe estado "apartada" en `dilesa.unidades` — son `planeada`,
 *    `lote_urbanizado`, `en_construccion`, `terminada`, `vendida`.
 * 2. El módulo Inventario es vista comercial: solo trae las unidades
 *    vendibles (`en_construccion` + `terminada`), no el universo. Por
 *    ende KPIs sobre vendidas/no-vendibles violarían KPI2 (derivación
 *    desde el dataset de la tabla) — requerirían query extra.
 *
 * KPIs ajustados que sí respetan KPI2 al 100% y dan panorama útil sobre
 * "qué está disponible para vender ahora":
 * 1. Disponibles — total vendibles ahora.
 * 2. En construcción — cuántas todavía no físicamente listas.
 * 3. Terminadas — listas para entrega inmediata.
 * 4. Valor disponible — $ total del inventario vendible ahora.
 * 5. Días promedio en inventario — mean(diasInventario) → señal de
 *    estancamiento. Si sube, algo no se mueve.
 */
export function deriveKpis(rows: readonly UnidadListaRow[]): readonly ModuleKpi[] {
  const total = rows.length;
  const enConstruccion = rows.filter((u) => u.estado === 'en_construccion').length;
  const terminadas = rows.filter((u) => u.estado === 'terminada').length;
  const valorDisponible = rows.reduce((acc, u) => acc + (u.precio ?? 0), 0);

  const dias = rows.map((u) => u.diasInventario);
  const diasPromedio = dias.length === 0 ? null : dias.reduce((a, b) => a + b, 0) / dias.length;

  return [
    { key: 'disponibles', label: 'Disponibles', value: total },
    { key: 'en_construccion', label: 'En construcción', value: enConstruccion },
    { key: 'terminadas', label: 'Terminadas', value: terminadas },
    {
      key: 'valor',
      label: 'Valor disponible',
      value: total === 0 ? '—' : formatCurrency(valorDisponible, { compact: true }),
    },
    {
      key: 'dias_inventario',
      label: 'Días en inventario',
      value: diasPromedio == null ? '—' : `${Math.round(diasPromedio)} días`,
    },
  ];
}

export function InventarioModule({ empresaId }: { empresaId: string }) {
  const [unidades, setUnidades] = useState<UnidadListaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [proyectoFiltro, setProyectoFiltro] = useState('');
  const [prototipoFiltro, setPrototipoFiltro] = useState('');
  const [caracteristicaFiltro, setCaracteristicaFiltro] = useState<'' | 'esquina' | 'frente_verde'>(
    ''
  );
  const [rangoIngreso, setRangoIngreso] = useState<DateRange>(EMPTY_DATE_RANGE);

  const fetchUnidades = useCallback(async (): Promise<{
    data?: UnidadListaRow[];
    error?: string;
  }> => {
    const sb = createSupabaseBrowserClient();

    // Unidades disponibles para asignar = obra arrancada con avance >= 20%
    // (`en_construccion`, set automático por trigger `tg_construccion_avance`)
    // o ya terminada físicamente (`terminada`). Las `planeada`/`lote_urbanizado`
    // NO aparecen aquí — son lotes sin obra arrancada y no son vendibles aún
    // bajo la regla operativa DILESA. `.eq(empresa_id)` para evitar `.in(ids[])`
    // que rebasaría URL si hubiera muchas; filtro de estado en query (no JS).
    const { data: uns, error: uErr } = await sb
      .schema('dilesa')
      .from('unidades')
      .select(
        'id, identificador, area_m2, m2_construccion, es_esquina, tiene_frente_verde, estado, proyecto_id, producto_id, created_at'
      )
      .eq('empresa_id', empresaId)
      .is('deleted_at', null)
      .in('estado', ['en_construccion', 'terminada']);
    if (uErr) return { error: getSupabaseErrorMessage(uErr, 'No se pudo cargar el inventario.') };
    const unidadesArr = (uns ?? []) as UnidadRow[];

    // Proyectos + productos para mapping (mismo patrón cross-schema/large
    // arrays que ventas-module).
    const [prjRes, prodRes] = await Promise.all([
      sb
        .schema('dilesa')
        .from('proyectos')
        .select('id, nombre')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('productos')
        .select('id, nombre')
        .eq('empresa_id', empresaId)
        .is('deleted_at', null),
    ]);
    if (prjRes.error || prodRes.error) {
      return {
        error: getSupabaseErrorMessage(
          prjRes.error ?? prodRes.error,
          'No se pudieron cargar proyectos/prototipos.'
        ),
      };
    }
    const prjMap = new Map((prjRes.data ?? []).map((p) => [p.id as string, p.nombre as string]));
    const prodMap = new Map((prodRes.data ?? []).map((p) => [p.id as string, p.nombre as string]));

    // Calcular precios via RPC en batch — una llamada por unidad para
    // mostrar precio inline. Concurrencia limitada para no saturar.
    const precios = new Map<string, number | null>();
    const CONC = 8;
    for (let i = 0; i < unidadesArr.length; i += CONC) {
      const chunk = unidadesArr.slice(i, i + CONC);
      await Promise.all(
        chunk.map(async (u) => {
          const { data, error } = await sb.schema('dilesa').rpc('fn_calcular_precio_venta', {
            p_unidad_id: u.id,
          });
          if (error || !data) {
            precios.set(u.id, null);
            return;
          }
          const json = data as { precio_venta_total?: number; error?: string };
          precios.set(u.id, json.error ? null : (json.precio_venta_total ?? null));
        })
      );
    }

    const now = Date.now();
    const data = unidadesArr.map((u) => {
      const proto = u.producto_id ? (prodMap.get(u.producto_id) ?? null) : null;
      const protoSufijo = proto ? proto.split('-').pop() : null;
      return {
        ...u,
        proyectoNombre: prjMap.get(u.proyecto_id) ?? '',
        prototipo: proto,
        identificadorCompleto: protoSufijo ? `${u.identificador}-${protoSufijo}` : u.identificador,
        precio: precios.get(u.id) ?? null,
        diasInventario: Math.max(
          0,
          Math.floor((now - new Date(u.created_at).getTime()) / (1000 * 60 * 60 * 24))
        ),
      };
    });

    return { data };
  }, [empresaId]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await fetchUnidades();
    if (e) {
      setError(e);
      setUnidades([]);
    } else setUnidades(data ?? []);
    setLoading(false);
  }, [fetchUnidades]);

  useEffect(() => {
    let activo = true;
    void fetchUnidades().then(({ data, error: e }) => {
      if (!activo) return;
      if (e) {
        setError(e);
        setUnidades([]);
      } else setUnidades(data ?? []);
      setLoading(false);
    });
    return () => {
      activo = false;
    };
  }, [fetchUnidades]);

  const proyectosPresentes = useMemo(
    () => [...new Set(unidades.map((u) => u.proyectoNombre).filter(Boolean))].sort(),
    [unidades]
  );
  const prototiposPresentes = useMemo(
    () => [...new Set(unidades.map((u) => u.prototipo).filter((p): p is string => !!p))].sort(),
    [unidades]
  );

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return unidades.filter((u) => {
      if (proyectoFiltro && u.proyectoNombre !== proyectoFiltro) return false;
      if (prototipoFiltro && u.prototipo !== prototipoFiltro) return false;
      if (caracteristicaFiltro === 'esquina' && !u.es_esquina) return false;
      if (caracteristicaFiltro === 'frente_verde' && !u.tiene_frente_verde) return false;
      if (!isInDateRange(u.created_at, rangoIngreso)) return false;
      if (q && !u.identificadorCompleto.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [unidades, search, proyectoFiltro, prototipoFiltro, caracteristicaFiltro, rangoIngreso]);

  const kpis = useMemo(() => deriveKpis(filtrados), [filtrados]);

  const columns: Column<UnidadListaRow>[] = [
    {
      key: 'identificadorCompleto',
      label: 'Unidad',
      type: 'text',
      sticky: true,
      width: 'min-w-[180px]',
    },
    { key: 'proyectoNombre', label: 'Proyecto', type: 'text' },
    { key: 'prototipo', label: 'Prototipo', type: 'text', render: (u) => u.prototipo ?? '—' },
    {
      key: 'area_m2',
      label: 'Área m²',
      type: 'number',
      render: (u) => (u.area_m2 != null ? u.area_m2.toFixed(2) : '—'),
    },
    {
      key: 'm2_construccion',
      label: 'm² constr.',
      type: 'number',
      render: (u) => (u.m2_construccion != null ? u.m2_construccion.toFixed(2) : '—'),
    },
    {
      key: 'caracteristicas',
      label: 'Características',
      type: 'custom',
      sortable: false,
      render: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.es_esquina ? <Badge tone="info">Esquina</Badge> : null}
          {u.tiene_frente_verde ? <Badge tone="success">Frente verde</Badge> : null}
          {!u.es_esquina && !u.tiene_frente_verde ? (
            <span className="text-[var(--text)]/30">—</span>
          ) : null}
        </div>
      ),
    },
    { key: 'precio', label: 'Precio base', type: 'currency' },
    {
      key: 'estado',
      label: 'Estado',
      type: 'custom',
      render: (u) => (
        <Badge tone={ESTADO_TONE[u.estado] ?? 'neutral'}>
          {ESTADO_LABEL[u.estado] ?? u.estado}
        </Badge>
      ),
    },
    {
      key: 'diasInventario',
      label: 'Días en inv.',
      type: 'number',
      render: (u) => `${u.diasInventario}d`,
    },
    {
      key: 'asignar',
      label: '',
      type: 'custom',
      sortable: false,
      render: (u) => (
        <DataTable.InteractiveCell>
          <Link
            href={`/dilesa/ventas/nueva?unidad=${u.id}`}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text)]/70 hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            Asignar
            <ArrowRight className="h-3 w-3" />
          </Link>
        </DataTable.InteractiveCell>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <Boxes className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Inventario</h1>
          <p className="text-sm text-[var(--text)]/60">
            Unidades disponibles para asignar a un cliente. Precio calculado con la fórmula de
            DILESA (sin crédito).
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
            placeholder="Buscar unidad…"
            className="w-64 pl-9"
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
        <select
          value={prototipoFiltro}
          onChange={(e) => setPrototipoFiltro(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Todos los prototipos</option>
          {prototiposPresentes.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={caracteristicaFiltro}
          onChange={(e) =>
            setCaracteristicaFiltro(e.target.value as '' | 'esquina' | 'frente_verde')
          }
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Cualquier característica</option>
          <option value="esquina">Solo esquinas</option>
          <option value="frente_verde">Solo frente verde</option>
        </select>
        <DateRangeFilter
          label="Ingreso"
          ariaPrefix="Fecha de ingreso a inventario"
          value={rangoIngreso}
          onChange={setRangoIngreso}
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
          {filtrados.length} de {unidades.length} unidades
        </span>
      </div>

      <DataTable
        data={filtrados}
        columns={columns}
        rowKey="id"
        loading={loading}
        error={error}
        onRetry={() => void cargar()}
        initialSort={{ key: 'identificadorCompleto', dir: 'asc' }}
        emptyTitle="Sin inventario"
        emptyDescription="No hay unidades disponibles para los filtros actuales."
        emptyIcon={<Boxes className="h-6 w-6" />}
        maxHeight="calc(100vh - 280px)"
      />
    </div>
  );
}
