'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de páginas de lectura DILESA
 * (cf. app/dilesa/ventas/[id]/page.tsx, components/dilesa/construccion-module.tsx).
 */

/**
 * @module Ventas · Clientes (DILESA)
 * @responsive desktop-only
 *
 * Tab "Clientes" del hub Ventas (sprint tabs-hub). Lista de personas con
 * ≥1 venta DILESA con KPIs derivados de la actividad comercial:
 * # ventas, monto total comprado, fecha de última venta, proyectos donde
 * compró. Click en una fila → `/dilesa/ventas/clientes/[id]` con timeline.
 *
 * Estrategia de carga (cross-schema):
 *   1) `dilesa.ventas` (no-deleted) — agrupar en cliente por persona_id.
 *   2) `dilesa.unidades` (.eq empresa) — para resolver proyecto_id por venta.
 *   3) `dilesa.proyectos` (.eq empresa) — para resolver nombre.
 *   4) `erp.personas` (.eq empresa + tipo='cliente') — para resolver nombre
 *      y datos básicos. Usa `.eq(empresa_id)` en lugar de `.in('id', uuids[])`
 *      para evitar el URL > 8KB que Cloudflare rechaza con HTTP 400
 *      cuando hay > ~200 ids (ver memoria `supabase_in_url_limit`).
 *
 * Gate: sub-slug `dilesa.ventas.clientes` (ADR-030 SS5).
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Users } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, ModuleKpiStrip, type Column } from '@/components/module-page';
import { Input } from '@/components/ui/input';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { deriveClientesKpis } from '@/lib/dilesa/kpis/clientes';

type Venta = {
  id: string;
  persona_id: string;
  unidad_id: string | null;
  estado: string;
  fase_actual: string | null;
  fase_posicion: number | null;
  precio_asignacion: number | null;
  valor_escrituracion: number | null;
  valor_comercial: number | null;
  created_at: string;
};

type Persona = {
  id: string;
  nombre: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  email: string | null;
  telefono: string | null;
};

type ClienteRow = {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  numVentas: number;
  numActivas: number;
  montoTotal: number;
  ultimaVenta: string | null;
  ultimaFase: string | null;
  proyectos: string;
};

export default function VentasClientesPage() {
  return (
    <RequireAccess empresa="dilesa" modulo="dilesa.ventas.clientes">
      <VentasClientesBody />
    </RequireAccess>
  );
}

function VentasClientesBody() {
  const router = useRouter();
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [proyectoFiltro, setProyectoFiltro] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sb = createSupabaseBrowserClient();

    const [ventasRes, unidadesRes, prjRes, personasRes] = await Promise.all([
      sb
        .schema('dilesa')
        .from('ventas')
        .select(
          'id, persona_id, unidad_id, estado, fase_actual, fase_posicion, precio_asignacion, valor_escrituracion, valor_comercial, created_at'
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
        .is('deleted_at', null),
      sb
        .schema('erp')
        .from('personas')
        .select('id, nombre, apellido_paterno, apellido_materno, email, telefono')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .eq('tipo', 'cliente')
        .is('deleted_at', null),
    ]);

    const firstErr = ventasRes.error ?? unidadesRes.error ?? prjRes.error ?? personasRes.error;
    if (firstErr) {
      setError(getSupabaseErrorMessage(firstErr, 'No se pudieron cargar los clientes.'));
      setLoading(false);
      return;
    }

    const ventasArr = (ventasRes.data ?? []) as Venta[];
    const unidadProyecto = new Map<string, string | null>();
    for (const u of (unidadesRes.data ?? []) as Array<{ id: string; proyecto_id: string | null }>) {
      unidadProyecto.set(u.id, u.proyecto_id);
    }
    const proyectoNombre = new Map<string, string>();
    for (const p of (prjRes.data ?? []) as Array<{ id: string; nombre: string }>) {
      proyectoNombre.set(p.id, p.nombre);
    }
    const personaMap = new Map<string, Persona>();
    for (const p of (personasRes.data ?? []) as Persona[]) personaMap.set(p.id, p);

    // Agrupar ventas por persona_id
    const byPersona = new Map<string, Venta[]>();
    for (const v of ventasArr) {
      const arr = byPersona.get(v.persona_id) ?? [];
      arr.push(v);
      byPersona.set(v.persona_id, arr);
    }

    const rows: ClienteRow[] = [];
    for (const [personaId, ventas] of byPersona.entries()) {
      const p = personaMap.get(personaId);
      const nombre =
        [p?.nombre, p?.apellido_paterno, p?.apellido_materno].filter(Boolean).join(' ') ||
        '(sin nombre)';
      const montoTotal = ventas.reduce(
        (s, v) => s + (v.valor_escrituracion ?? v.precio_asignacion ?? v.valor_comercial ?? 0),
        0
      );
      // Ordenar ventas por created_at DESC para tomar la última
      const sorted = [...ventas].sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
      const ultima = sorted[0];
      const proyectos = new Set<string>();
      for (const v of ventas) {
        if (!v.unidad_id) continue;
        const pid = unidadProyecto.get(v.unidad_id);
        if (pid) {
          const nom = proyectoNombre.get(pid);
          if (nom) proyectos.add(nom);
        }
      }
      const proyectosArr = [...proyectos].sort();
      rows.push({
        id: personaId,
        nombre,
        email: p?.email ?? null,
        telefono: p?.telefono ?? null,
        numVentas: ventas.length,
        numActivas: ventas.filter((v) => v.estado === 'activa').length,
        montoTotal,
        ultimaVenta: ultima?.created_at ?? null,
        ultimaFase: ultima?.fase_actual ?? null,
        proyectos: proyectosArr.join(', '),
      });
    }
    rows.sort((a, b) => a.nombre.localeCompare(b.nombre));
    setClientes(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const proyectosPresentes = useMemo(() => {
    const set = new Set<string>();
    for (const c of clientes) {
      if (!c.proyectos) continue;
      for (const p of c.proyectos.split(', ')) set.add(p);
    }
    return [...set].sort();
  }, [clientes]);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clientes.filter((c) => {
      if (proyectoFiltro && !c.proyectos.split(', ').includes(proyectoFiltro)) return false;
      if (q && !c.nombre.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [clientes, search, proyectoFiltro]);

  // KPIs derivados del dataset filtrado — ADR-034 (KPI2+KPI3).
  const kpis = useMemo(() => deriveClientesKpis(filtrados), [filtrados]);

  const columns: Column<ClienteRow>[] = [
    {
      key: 'nombre',
      label: 'Cliente',
      type: 'text',
      sticky: true,
      width: 'min-w-[260px]',
      render: (c) => (
        <div>
          <div className="text-sm text-[var(--text)]">{c.nombre}</div>
          {c.email || c.telefono ? (
            <div className="text-[11px] text-[var(--text)]/50">
              {c.email ?? ''}
              {c.email && c.telefono ? ' · ' : ''}
              {c.telefono ?? ''}
            </div>
          ) : null}
        </div>
      ),
    },
    { key: 'numVentas', label: '# ventas', type: 'number' },
    { key: 'numActivas', label: '# activas', type: 'number' },
    { key: 'montoTotal', label: 'Monto total', type: 'currency' },
    {
      key: 'ultimaVenta',
      label: 'Última venta',
      type: 'custom',
      accessor: (c) => c.ultimaVenta ?? '',
      render: (c) =>
        c.ultimaVenta ? (
          <span className="text-xs text-[var(--text)]/70">
            {new Date(c.ultimaVenta).toLocaleDateString('es-MX', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'ultimaFase',
      label: 'Última fase',
      type: 'text',
      render: (c) => c.ultimaFase ?? '—',
    },
    {
      key: 'proyectos',
      label: 'Proyectos',
      type: 'text',
      render: (c) => c.proyectos || '—',
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Clientes</h1>
          <p className="text-sm text-[var(--text)]/60">
            Personas con al menos una venta DILESA. KPIs derivados de las ventas: # ventas, monto
            total comprado, última venta y proyectos en los que compró.
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
            placeholder="Buscar cliente…"
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
        <button
          type="button"
          onClick={() => void cargar()}
          className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refrescar
        </button>
        <span className="ml-auto text-sm text-[var(--text)]/60">
          {filtrados.length} de {clientes.length} clientes
        </span>
      </div>

      <DataTable
        data={filtrados}
        columns={columns}
        rowKey="id"
        loading={loading}
        error={error}
        onRetry={() => void cargar()}
        onRowClick={(c) => router.push(`/dilesa/ventas/clientes/${c.id}`)}
        initialSort={{ key: 'nombre', dir: 'asc' }}
        emptyTitle="Sin clientes"
        emptyDescription="Aún no hay personas con ventas en DILESA."
        emptyIcon={<Users className="h-6 w-6" />}
        maxHeight="calc(100vh - 280px)"
      />

      <p className="text-[11px] text-[var(--text)]/40">
        Tip: hacé click en una fila para ver el detalle del cliente con timeline de sus ventas.
      </p>
      {/* Anchor sin-uso para futura nav UI */}
      <Link href="/dilesa/ventas" className="hidden">
        ir a ventas
      </Link>
    </div>
  );
}
