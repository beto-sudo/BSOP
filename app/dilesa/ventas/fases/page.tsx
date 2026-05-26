'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de páginas de lectura DILESA
 * (cf. app/dilesa/ventas/[id]/page.tsx, components/dilesa/construccion-module.tsx).
 */

/**
 * @module Ventas · Fases (DILESA)
 * @responsive desktop-only
 *
 * Tab "Fases" del hub Ventas (sprint tabs-hub) — vista pipeline global
 * de las 17 fases del proceso de comercialización DILESA. Cada fase se
 * muestra como una card con el conteo de ventas activas que están "en"
 * esa fase (definida por `dilesa.ventas.fase_actual` denormalizado).
 *
 * Click en una card filtra hacia la lista de ventas en esa fase
 * (`/dilesa/ventas?fase=<nombre>`) — la lista del tab Ventas no consume
 * el query param hoy pero la URL queda como deep link futuro; mientras
 * tanto manda al usuario al tab Ventas con scroll natural a la lista.
 *
 * Filtros: proyecto, vendedor, mes. Filtran las ventas que se cuentan
 * en cada fase. Los catálogos (las 17 fases) se cargan desde
 * `dilesa.venta_fase_catalogo` (single source of truth — viene del Coda
 * original).
 *
 * Gate: sub-slug `dilesa.ventas.fases` (ADR-030 SS5).
 */

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, GitBranch, RefreshCw } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { ModuleKpiStrip } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { deriveFasesKpis } from '@/lib/dilesa/kpis/fases';

type Fase = {
  posicion: number;
  nombre: string;
  rol: string | null;
};

type Venta = {
  id: string;
  fase_actual: string | null;
  fase_posicion: number | null;
  estado: string;
  vendedor: string | null;
  vendedor_usuario_id: string | null;
  unidad_id: string | null;
  created_at: string;
};

type Unidad = {
  id: string;
  proyecto_id: string | null;
};

const DEFAULT_FILTERS = {
  proyecto: '',
  vendedor: '',
  mes: '',
};

export default function VentasFasesPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.fases">
      <Suspense fallback={<FasesSkeleton />}>
        <VentasFasesBody />
      </Suspense>
    </RequireAccess>
  );
}

function VentasFasesBody() {
  const { filters, setFilter, clearAll, activeCount } = useUrlFilters(DEFAULT_FILTERS);

  const [fases, setFases] = useState<Fase[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [unidadProyecto, setUnidadProyecto] = useState<Map<string, string>>(new Map());
  const [proyectos, setProyectos] = useState<Array<{ id: string; nombre: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sb = createSupabaseBrowserClient();

    const [fasesRes, ventasRes, unidadesRes, prjRes] = await Promise.all([
      sb
        .schema('dilesa')
        .from('venta_fase_catalogo')
        .select('posicion, nombre, rol')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null)
        .order('posicion', { ascending: true }),
      sb
        .schema('dilesa')
        .from('ventas')
        .select(
          'id, fase_actual, fase_posicion, estado, vendedor, vendedor_usuario_id, unidad_id, created_at'
        )
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('unidades')
        .select('id, proyecto_id')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null),
      sb
        .schema('dilesa')
        .from('proyectos')
        .select('id, nombre')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .is('deleted_at', null)
        .order('nombre', { ascending: true }),
    ]);

    const firstErr = fasesRes.error ?? ventasRes.error ?? unidadesRes.error ?? prjRes.error;
    if (firstErr) {
      setError(getSupabaseErrorMessage(firstErr, 'No se pudieron cargar las fases.'));
      setLoading(false);
      return;
    }

    setFases((fasesRes.data ?? []) as Fase[]);
    setVentas((ventasRes.data ?? []) as Venta[]);
    const m = new Map<string, string>();
    for (const u of (unidadesRes.data ?? []) as Unidad[]) {
      if (u.proyecto_id) m.set(u.id, u.proyecto_id);
    }
    setUnidadProyecto(m);
    setProyectos((prjRes.data ?? []) as Array<{ id: string; nombre: string }>);
    setLoading(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Vendedores únicos (de vendedor texto + usuario_id) para el filtro.
  // El campo `vendedor` (texto legacy) es lo único user-friendly que
  // podemos mostrar — usuario_id se omite del selector.
  const vendedoresUnicos = useMemo(() => {
    const set = new Set<string>();
    for (const v of ventas) {
      if (v.vendedor && v.vendedor.trim()) set.add(v.vendedor.trim());
    }
    return [...set].sort();
  }, [ventas]);

  // Filtrado de ventas según filtros.
  const ventasFiltradas = useMemo(() => {
    return ventas.filter((v) => {
      // Filtro proyecto: vía unidad → proyecto_id
      if (filters.proyecto) {
        if (!v.unidad_id) return false;
        const pid = unidadProyecto.get(v.unidad_id);
        if (pid !== filters.proyecto) return false;
      }
      // Filtro vendedor: solo por campo texto (`vendedor`)
      if (filters.vendedor) {
        if (v.vendedor !== filters.vendedor) return false;
      }
      // Filtro mes: YYYY-MM contra created_at
      if (filters.mes) {
        const m = v.created_at.slice(0, 7); // ISO → 'YYYY-MM'
        if (m !== filters.mes) return false;
      }
      return true;
    });
  }, [ventas, filters, unidadProyecto]);

  // Conteo de ventas por nombre de fase. Solo cuenta ventas activas.
  const conteoPorFase = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of ventasFiltradas) {
      if (v.estado !== 'activa') continue;
      const key = v.fase_actual ?? '__sin_fase__';
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return m;
  }, [ventasFiltradas]);

  const totalActivas = useMemo(
    () => [...conteoPorFase.values()].reduce((s, n) => s + n, 0),
    [conteoPorFase]
  );

  // KPIs sobre el dataset filtrado — ADR-034. Deriva del mismo array
  // que alimenta las cards (cero queries extras, recalcula en mismo
  // render que las cards cuando cambian los filtros).
  const kpis = useMemo(() => deriveFasesKpis(ventasFiltradas), [ventasFiltradas]);

  // Meses únicos (YYYY-MM) presentes en las ventas — para el filtro
  const mesesPresentes = useMemo(() => {
    const s = new Set<string>();
    for (const v of ventas) s.add(v.created_at.slice(0, 7));
    return [...s].sort().reverse();
  }, [ventas]);

  if (loading) return <FasesSkeleton />;

  if (error) {
    return (
      <div className="container mx-auto max-w-7xl space-y-4 px-4 py-6">
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
        <button
          type="button"
          onClick={() => void cargar()}
          className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <GitBranch className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Fases</h1>
          <p className="text-sm text-[var(--text)]/60">
            Pipeline global — las 17 fases del proceso de comercialización DILESA. Click en una fase
            para ver las ventas correspondientes.
          </p>
        </div>
      </header>

      <ModuleKpiStrip stats={kpis} cols={5} />

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filters.proyecto}
          onChange={(e) => setFilter('proyecto', e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Todos los proyectos</option>
          {proyectos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <select
          value={filters.vendedor}
          onChange={(e) => setFilter('vendedor', e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Todos los vendedores</option>
          {vendedoresUnicos.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={filters.mes}
          onChange={(e) => setFilter('mes', e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
        >
          <option value="">Cualquier mes (creación)</option>
          {mesesPresentes.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={() => clearAll()}
            className="text-xs text-[var(--text)]/60 underline hover:text-[var(--text)]"
          >
            Limpiar filtros
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void cargar()}
          className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refrescar
        </button>
        <span className="ml-auto text-sm text-[var(--text)]/60">
          {totalActivas} ventas activas en pipeline
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {fases.map((f) => {
          const cuenta = conteoPorFase.get(f.nombre) ?? 0;
          return <FaseCard key={f.posicion} fase={f} cuenta={cuenta} />;
        })}
      </div>

      {(conteoPorFase.get('__sin_fase__') ?? 0) > 0 ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
          {conteoPorFase.get('__sin_fase__')} venta(s) sin fase asignada (debug: revisar
          `dilesa.ventas.fase_actual`).
        </div>
      ) : null}
    </div>
  );
}

function FaseCard({ fase, cuenta }: { fase: Fase; cuenta: number }) {
  const href = `/dilesa/ventas?fase=${encodeURIComponent(fase.nombre)}`;
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--accent)] hover:shadow-sm"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-xs text-[var(--text)]/40">
          {String(fase.posicion).padStart(2, '0')}
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-[var(--text)]/30 transition group-hover:text-[var(--accent)]" />
      </div>
      <div className="mt-1 text-sm font-semibold leading-tight text-[var(--text)]">
        {fase.nombre}
      </div>
      {fase.rol ? (
        <div className="mt-1 text-[11px] text-[var(--text)]/50">
          Resp.: <span className="text-[var(--text)]/70">{fase.rol}</span>
        </div>
      ) : null}
      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wide text-[var(--text)]/40">
          Ventas activas
        </span>
        <Badge tone={cuenta > 0 ? 'info' : 'neutral'}>{cuenta}</Badge>
      </div>
    </Link>
  );
}

function FasesSkeleton() {
  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6">
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-9 w-full" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 17 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
