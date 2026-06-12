'use client';

/**
 * VentasModule — lista de ventas DILESA.
 *
 * Iniciativa dilesa-portafolio-activos · Sprint 4 (UI ventas). Lista
 * filtrable de las ventas importadas en Fase 4: comprador (cross-schema
 * a `erp.personas`), unidad+proyecto (same-schema embed), fase actual,
 * precio, vendedor. Click en una fila navega a `/dilesa/ventas/[id]`
 * con la ficha completa, pipeline (de `venta_fases`), pagos y expediente.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useScopeVendedorDilesa } from '@/lib/dilesa/use-scope-vendedor';
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
import { Plus, Receipt, RefreshCw, Search } from 'lucide-react';
import Link from 'next/link';
import { usePermissions } from '@/components/providers';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency, formatPercent } from '@/lib/format';

type VentaRow = {
  id: string;
  persona_id: string;
  unidad_id: string | null;
  estado: string;
  fase_actual: string | null;
  fase_posicion: number | null;
  valor_escrituracion: number | null;
  valor_comercial: number | null;
  tipo_credito: string | null;
  vendedor: string | null;
  vendedor_usuario_id: string | null;
  numero_escritura: string | null;
  fecha_escritura: string | null;
};

export type VentaListaRow = VentaRow & {
  cliente: string;
  unidadIdentificador: string | null;
  proyectoNombre: string;
  prototipo: string | null;
  /** Precio efectivo: `valor_escrituracion ?? valor_comercial`. */
  precio: number | null;
};

const ESTADO_TONE: Record<string, BadgeTone> = {
  activa: 'info',
  desasignada: 'neutral',
};
const ESTADO_LABEL: Record<string, string> = {
  activa: 'Activa',
  desasignada: 'Desasignada',
};

/**
 * KPIs reactivos a filtros — ADR-034 (Module-level KPI strips).
 * Deriva 100% client-side desde el array que alimenta la tabla (KPI2);
 * cuando los filtros cambian, los KPIs y la tabla recalculan en el mismo
 * render (KPI3). Cap 5 (KPI1).
 *
 * Ajustes vs curaduría Sprint 0 (planning doc § "KPIs aprobados — Ventas"):
 * - KPI3 "% cerradas" → "% Escrituradas": el modelo solo tiene estado
 *   `activa | desasignada`; "cerrada" en el negocio inmobiliario significa
 *   escriturada → `numero_escritura IS NOT NULL` es la señal canónica.
 * - KPI4 "Días promedio en fase" → "Avance promedio": `fase_posicion` no
 *   trae fecha de entrada a la fase, pero el promedio de la posición en el
 *   pipeline de 17 fases es proxy directo del avance global.
 * - KPI5 "Top vendedor" por `$ pipeline` (no por count) — la decisión de
 *   reconocer/replicar al top opera sobre $ cerrado, no sobre conteo.
 */
export function deriveKpis(rows: readonly VentaListaRow[]): readonly ModuleKpi[] {
  const total = rows.length;
  const pipeline = rows.reduce((acc, r) => acc + (r.precio ?? 0), 0);
  const escrituradas = rows.filter((r) => r.numero_escritura != null).length;
  const pctEscrituradas = total === 0 ? null : escrituradas / total;

  // Avance promedio = mean(fase_posicion) / max(fase_posicion en el dataset).
  // Si el dataset filtrado no trae fase_posicion (caso borde), KPI = "—".
  const posiciones = rows
    .map((r) => r.fase_posicion)
    .filter((p): p is number => typeof p === 'number');
  const maxFase = posiciones.length === 0 ? 0 : Math.max(...posiciones);
  const avgFase =
    posiciones.length === 0 ? null : posiciones.reduce((a, b) => a + b, 0) / posiciones.length;
  const avancePct = avgFase == null || maxFase === 0 ? null : avgFase / maxFase;

  // Top vendedor por $ pipeline. Tie-break por nombre alfabético (estable).
  const vendedorMap = new Map<string, number>();
  for (const r of rows) {
    if (r.vendedor && r.precio != null) {
      vendedorMap.set(r.vendedor, (vendedorMap.get(r.vendedor) ?? 0) + r.precio);
    }
  }
  let topVendedor: string | null = null;
  let topMonto = -1;
  for (const [vendedor, monto] of [...vendedorMap.entries()].sort(([a], [b]) =>
    a.localeCompare(b, 'es')
  )) {
    if (monto > topMonto) {
      topMonto = monto;
      topVendedor = vendedor;
    }
  }

  return [
    { key: 'count', label: 'Ventas', value: total },
    {
      key: 'pipeline',
      label: 'Pipeline',
      value: total === 0 ? '—' : formatCurrency(pipeline, { compact: true }),
    },
    { key: 'escrituradas', label: '% Escrituradas', value: formatPercent(pctEscrituradas) },
    { key: 'avance', label: 'Avance promedio', value: formatPercent(avancePct) },
    { key: 'top_vendedor', label: 'Top vendedor', value: topVendedor ?? '—' },
  ];
}

/**
 * Búsqueda de texto de la lista: matchea comprador o identificador de
 * unidad (ej. "M22-L5-LDLE") — el identificador es como Ventas ubica una
 * operación cuando el dato que tiene a la mano es la unidad, no el cliente.
 */
export function matchVentaSearch(v: VentaListaRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    v.cliente.toLowerCase().includes(q) || (v.unidadIdentificador ?? '').toLowerCase().includes(q)
  );
}

export function VentasModule({ empresaId }: { empresaId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { permissions } = usePermissions();
  const puedeCrearSolicitud =
    permissions.isAdmin ||
    permissions.modulos.get('dilesa.ventas.fase01_solicitud')?.write === true;
  const [ventas, setVentas] = useState<VentaListaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [proyectoFiltro, setProyectoFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [rangoEscritura, setRangoEscritura] = useState<DateRange>(EMPTY_DATE_RANGE);

  // `faseFiltro` se deriva del query param (single source of truth: el URL).
  // Deep-link desde tab Fases (`/dilesa/ventas?fase=<nombre>`) pre-selecciona
  // sin state intermedio. El dropdown actualiza el URL via `setFaseEnUrl`.
  const faseFiltro = searchParams.get('fase') ?? '';
  const setFaseEnUrl = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set('fase', value);
      else next.delete('fase');
      const qs = next.toString();
      router.replace(qs ? `/dilesa/ventas?${qs}` : '/dilesa/ventas');
    },
    [router, searchParams]
  );

  // Fetch puro: regresa data o mensaje de error, NO toca state.
  // Rol Vendedor: scoped a sus propias ventas (pedido de Beto).
  const scopeVendedor = useScopeVendedorDilesa();

  const fetchVentas = useCallback(async (): Promise<{
    data?: VentaListaRow[];
    error?: string;
  }> => {
    const sb = createSupabaseBrowserClient();
    // Mientras el scope del usuario resuelve, no mostramos nada (evita el
    // flash de "todas las ventas" para un vendedor scoped).
    if (scopeVendedor.loading) return { data: [] };
    // Sin embeds para evitar quirks de PostgREST cuando el nombre de la
    // tabla embebida existe en otros schemas (proyectos también en `erp`).
    // 4 queries: ventas + unidades + proyectos + personas (cross-schema).
    let ventasQuery = sb
      .schema('dilesa')
      .from('ventas')
      .select(
        'id, persona_id, unidad_id, estado, fase_actual, fase_posicion, valor_escrituracion, valor_comercial, tipo_credito, vendedor, vendedor_usuario_id, numero_escritura, fecha_escritura'
      )
      .eq('empresa_id', empresaId)
      .is('deleted_at', null);
    if (scopeVendedor.soloVendedor && scopeVendedor.userId) {
      ventasQuery = ventasQuery.eq('vendedor_usuario_id', scopeVendedor.userId);
    }
    const { data: rawVentas, error: vErr } = await ventasQuery;
    if (vErr) {
      return { error: getSupabaseErrorMessage(vErr, 'No se pudieron cargar las ventas.') };
    }
    const ventasArr = (rawVentas ?? []) as VentaRow[];

    // Unidades + productos (prototipo) + proyectos: `.eq(empresa_id)` en
    // lugar de `.in(ids[])` para evitar URLs > 8KB (Cloudflare rechaza con
    // HTTP 400 "Bad Request").
    const { data: uns, error: uErr } = await sb
      .schema('dilesa')
      .from('unidades')
      .select('id, identificador, proyecto_id, producto_id')
      .eq('empresa_id', empresaId);
    if (uErr) {
      return { error: getSupabaseErrorMessage(uErr, 'No se pudieron cargar las unidades.') };
    }
    const unidadMap = new Map<
      string,
      { identificador: string; proyecto_id: string | null; producto_id: string | null }
    >();
    for (const u of uns ?? []) {
      unidadMap.set(u.id as string, {
        identificador: u.identificador as string,
        proyecto_id: (u.proyecto_id as string | null) ?? null,
        producto_id: (u.producto_id as string | null) ?? null,
      });
    }

    const { data: prjs, error: prjErr } = await sb
      .schema('dilesa')
      .from('proyectos')
      .select('id, nombre')
      .eq('empresa_id', empresaId);
    if (prjErr) {
      return { error: getSupabaseErrorMessage(prjErr, 'No se pudieron cargar los proyectos.') };
    }
    const proyectoMap = new Map<string, string>();
    for (const p of prjs ?? []) proyectoMap.set(p.id as string, p.nombre as string);

    const { data: prods, error: prodErr } = await sb
      .schema('dilesa')
      .from('productos')
      .select('id, nombre')
      .eq('empresa_id', empresaId)
      .is('deleted_at', null);
    if (prodErr) {
      return { error: getSupabaseErrorMessage(prodErr, 'No se pudieron cargar los prototipos.') };
    }
    const productoMap = new Map<string, string>();
    for (const p of prods ?? []) productoMap.set(p.id as string, p.nombre as string);

    // Personas cross-schema — mismo patrón `.eq(empresa_id) + tipo='cliente'`.
    const { data: personas, error: pErr } = await sb
      .schema('erp')
      .from('personas')
      .select('id, nombre, apellido_paterno, apellido_materno')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'cliente');
    if (pErr) {
      return { error: getSupabaseErrorMessage(pErr, 'No se pudieron cargar los compradores.') };
    }
    const personaMap = new Map<string, string>();
    for (const p of personas ?? []) {
      const nombre = [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ');
      personaMap.set(p.id as string, nombre || '(sin nombre)');
    }

    // Vendedores cross-schema — resolución desde `core.usuarios` por FK.
    // Las ventas creadas en BSOP llevan `vendedor_usuario_id` (FK) pero
    // tienen el campo legacy `vendedor` (text) vacío. Las migradas de
    // Coda al revés. Resolvemos prioritizando la FK y caemos al text legacy.
    const vendedorIds = [
      ...new Set(ventasArr.map((v) => v.vendedor_usuario_id).filter((x): x is string => !!x)),
    ];
    const usuarioMap = new Map<string, string>();
    if (vendedorIds.length > 0) {
      const { data: usuarios } = await sb
        .schema('core')
        .from('usuarios')
        .select('id, first_name, last_name, email')
        .in('id', vendedorIds);
      for (const u of usuarios ?? []) {
        const nombreCompleto = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
        const fallback = (u.email as string | null) ?? '';
        usuarioMap.set(u.id as string, nombreCompleto || fallback);
      }
    }

    return {
      data: ventasArr.map((v) => {
        const u = v.unidad_id ? unidadMap.get(v.unidad_id) : null;
        // Vendedor: priorizamos la FK a core.usuarios (ventas nuevas);
        // si no hay, fallback al campo legacy text (ventas migradas de Coda).
        const vendedorResuelto = v.vendedor_usuario_id
          ? (usuarioMap.get(v.vendedor_usuario_id) ?? v.vendedor ?? null)
          : v.vendedor;
        return {
          ...v,
          vendedor: vendedorResuelto,
          cliente: personaMap.get(v.persona_id) ?? '(sin comprador)',
          unidadIdentificador: u?.identificador ?? null,
          proyectoNombre: u?.proyecto_id ? (proyectoMap.get(u.proyecto_id) ?? '') : '',
          prototipo: u?.producto_id ? (productoMap.get(u.producto_id) ?? null) : null,
          // `Valor de Escrituración` es el precio correcto de venta (Beto);
          // fallback a `Valor Comercial` para las que aún no escrituran.
          precio: v.valor_escrituracion ?? v.valor_comercial,
        };
      }),
    };
  }, [empresaId, scopeVendedor]);

  // Botón refrescar: setState síncrono OK en event handler.
  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await fetchVentas();
    if (e) {
      setError(e);
      setVentas([]);
    } else setVentas(data ?? []);
    setLoading(false);
  }, [fetchVentas]);

  // Carga inicial: los setState van solo dentro de `.then` para no
  // dispararse síncronamente dentro del effect.
  useEffect(() => {
    let activo = true;
    void fetchVentas().then(({ data, error: e }) => {
      if (!activo) return;
      if (e) {
        setError(e);
        setVentas([]);
      } else setVentas(data ?? []);
      setLoading(false);
    });
    return () => {
      activo = false;
    };
  }, [fetchVentas]);

  const proyectosPresentes = useMemo(
    () => [...new Set(ventas.map((v) => v.proyectoNombre).filter(Boolean))].sort(),
    [ventas]
  );
  const fasesPresentes = useMemo(
    () =>
      [...new Set(ventas.map((v) => v.fase_actual).filter((f): f is string => !!f))].sort(
        (a, b) => {
          const va = ventas.find((v) => v.fase_actual === a)?.fase_posicion ?? 0;
          const vb = ventas.find((v) => v.fase_actual === b)?.fase_posicion ?? 0;
          return va - vb;
        }
      ),
    [ventas]
  );

  const filtrados = useMemo(() => {
    return ventas.filter((v) => {
      if (proyectoFiltro && v.proyectoNombre !== proyectoFiltro) return false;
      if (faseFiltro && v.fase_actual !== faseFiltro) return false;
      if (estadoFiltro && v.estado !== estadoFiltro) return false;
      if (!isInDateRange(v.fecha_escritura, rangoEscritura)) return false;
      if (!matchVentaSearch(v, search)) return false;
      return true;
    });
  }, [ventas, search, proyectoFiltro, faseFiltro, estadoFiltro, rangoEscritura]);

  const kpis = useMemo(() => deriveKpis(filtrados), [filtrados]);

  const columns: Column<VentaListaRow>[] = [
    { key: 'cliente', label: 'Comprador', type: 'text', sticky: true, width: 'min-w-[260px]' },
    { key: 'proyectoNombre', label: 'Proyecto', type: 'text' },
    {
      key: 'unidadIdentificador',
      label: 'Unidad',
      type: 'text',
      render: (v) => v.unidadIdentificador ?? '—',
    },
    {
      key: 'prototipo',
      label: 'Prototipo',
      type: 'text',
      render: (v) => v.prototipo ?? '—',
    },
    {
      key: 'fase_actual',
      label: 'Fase',
      type: 'custom',
      accessor: (v) => (v.estado === 'desasignada' ? -1 : (v.fase_posicion ?? 0)),
      render: (v) =>
        // Si la venta está desasignada, no mostramos la fase — evita el
        // efecto contradictorio "Asignada + Desasignada" que Beto reportó.
        v.estado === 'desasignada' ? (
          <span className="text-[var(--text)]/30">—</span>
        ) : v.fase_actual ? (
          <Badge tone="neutral">{v.fase_actual}</Badge>
        ) : (
          <span>—</span>
        ),
    },
    { key: 'precio', label: 'Precio', type: 'currency' },
    {
      key: 'tipo_credito',
      label: 'Crédito',
      type: 'text',
      render: (v) => v.tipo_credito ?? <span className="text-[var(--text)]/30">—</span>,
    },
    { key: 'fecha_escritura', label: 'Escritura', type: 'date' },
    {
      key: 'estado',
      label: 'Estado',
      type: 'custom',
      render: (v) => (
        <Badge tone={ESTADO_TONE[v.estado] ?? 'neutral'}>
          {ESTADO_LABEL[v.estado] ?? v.estado}
        </Badge>
      ),
    },
    { key: 'vendedor', label: 'Vendedor', type: 'text', render: (v) => v.vendedor ?? '—' },
  ];

  const onRowClick = (v: VentaListaRow) => {
    router.push(`/dilesa/ventas/${v.id}`);
  };

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <Receipt className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Ventas</h1>
          <p className="text-sm text-[var(--text)]/60">
            Ventas de unidades DILESA: comprador, pipeline de 17 fases, pagos y expediente digital.
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
            placeholder="Buscar comprador o unidad…"
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
          value={faseFiltro}
          onChange={(e) => setFaseEnUrl(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Todas las fases</option>
          {fasesPresentes.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select
          value={estadoFiltro}
          onChange={(e) => setEstadoFiltro(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Activa + Desasignada</option>
          <option value="activa">Activa</option>
          <option value="desasignada">Desasignada</option>
        </select>
        <DateRangeFilter
          label="Escritura"
          ariaPrefix="Fecha escritura"
          value={rangoEscritura}
          onChange={setRangoEscritura}
        />
        <button
          type="button"
          onClick={() => void cargar()}
          className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refrescar
        </button>
        {puedeCrearSolicitud ? (
          <Link
            href="/dilesa/ventas/nueva"
            className="ml-auto flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            Nueva solicitud
          </Link>
        ) : null}
      </div>

      <DataTable
        data={filtrados}
        columns={columns}
        rowKey="id"
        loading={loading}
        error={error}
        onRetry={() => void cargar()}
        onRowClick={onRowClick}
        initialSort={{ key: 'cliente', dir: 'asc' }}
        emptyTitle="Sin ventas"
        emptyDescription="Aún no hay ventas en DILESA."
        emptyIcon={<Receipt className="h-6 w-6" />}
        maxHeight="calc(100vh - 280px)"
      />
    </div>
  );
}
