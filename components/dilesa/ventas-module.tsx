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
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, type Column } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Receipt, RefreshCw, Search } from 'lucide-react';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

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
};

type VentaListaRow = VentaRow & {
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

export function VentasModule({ empresaId }: { empresaId: string }) {
  const router = useRouter();
  const [ventas, setVentas] = useState<VentaListaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [proyectoFiltro, setProyectoFiltro] = useState('');
  const [faseFiltro, setFaseFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');

  // Fetch puro: regresa data o mensaje de error, NO toca state.
  const fetchVentas = useCallback(async (): Promise<{
    data?: VentaListaRow[];
    error?: string;
  }> => {
    const sb = createSupabaseBrowserClient();
    // Sin embeds para evitar quirks de PostgREST cuando el nombre de la
    // tabla embebida existe en otros schemas (proyectos también en `erp`).
    // 4 queries: ventas + unidades + proyectos + personas (cross-schema).
    const { data: rawVentas, error: vErr } = await sb
      .schema('dilesa')
      .from('ventas')
      .select(
        'id, persona_id, unidad_id, estado, fase_actual, fase_posicion, valor_escrituracion, valor_comercial, tipo_credito, vendedor'
      )
      .eq('empresa_id', empresaId)
      .is('deleted_at', null);
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

    return {
      data: ventasArr.map((v) => {
        const u = v.unidad_id ? unidadMap.get(v.unidad_id) : null;
        return {
          ...v,
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
  }, [empresaId]);

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
    const q = search.trim().toLowerCase();
    return ventas.filter((v) => {
      if (proyectoFiltro && v.proyectoNombre !== proyectoFiltro) return false;
      if (faseFiltro && v.fase_actual !== faseFiltro) return false;
      if (estadoFiltro && v.estado !== estadoFiltro) return false;
      if (q && !v.cliente.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [ventas, search, proyectoFiltro, faseFiltro, estadoFiltro]);

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
      accessor: (v) => v.fase_posicion ?? 0,
      render: (v) =>
        v.fase_actual ? <Badge tone="neutral">{v.fase_actual}</Badge> : <span>—</span>,
    },
    { key: 'precio', label: 'Precio', type: 'currency' },
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

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar comprador…"
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
          onChange={(e) => setFaseFiltro(e.target.value)}
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
        <button
          type="button"
          onClick={() => void cargar()}
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
