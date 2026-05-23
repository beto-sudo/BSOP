'use client';

/**
 * VentasModule — lista de ventas DILESA.
 *
 * Iniciativa dilesa-portafolio-activos · Sprint 4 (UI ventas). Lista
 * filtrable de las ventas importadas en Fase 4: comprador (cross-schema
 * a `erp.personas`), unidad+proyecto (same-schema embed), fase actual,
 * precio, vendedor. Click en una fila abre `VentaDetailDrawer` con la
 * ficha completa, pipeline (de `venta_fases`), pagos y expediente.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, type Column } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Receipt, RefreshCw, Search } from 'lucide-react';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { VentaDetailDrawer, type VentaDetalle } from './venta-detail-drawer';

type VentaRow = {
  id: string;
  persona_id: string;
  estado: string;
  fase_actual: string | null;
  fase_posicion: number | null;
  precio_asignacion: number | null;
  tipo_credito: string | null;
  vendedor: string | null;
  unidad: {
    identificador: string;
    proyecto: { nombre: string } | null;
  } | null;
};

type VentaListaRow = VentaRow & { cliente: string; proyectoNombre: string };

const ESTADO_TONE: Record<string, BadgeTone> = {
  activa: 'info',
  desasignada: 'neutral',
};
const ESTADO_LABEL: Record<string, string> = {
  activa: 'Activa',
  desasignada: 'Desasignada',
};

export function VentasModule({ empresaId }: { empresaId: string }) {
  const [ventas, setVentas] = useState<VentaListaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [proyectoFiltro, setProyectoFiltro] = useState('');
  const [faseFiltro, setFaseFiltro] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [selected, setSelected] = useState<VentaDetalle | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Fetch puro: regresa data o mensaje de error, NO toca state.
  const fetchVentas = useCallback(async (): Promise<{
    data?: VentaListaRow[];
    error?: string;
  }> => {
    const sb = createSupabaseBrowserClient();
    const { data: rawVentas, error: vErr } = await sb
      .schema('dilesa')
      .from('ventas')
      .select(
        'id, persona_id, estado, fase_actual, fase_posicion, precio_asignacion, tipo_credito, vendedor, unidad:unidades(identificador, proyecto:proyectos(nombre))'
      )
      .eq('empresa_id', empresaId)
      .is('deleted_at', null);
    if (vErr) return { error: getSupabaseErrorMessage(vErr, 'No se pudieron cargar las ventas.') };
    const ventasArr = (rawVentas ?? []) as unknown as VentaRow[];
    // Personas cross-schema: una segunda query con .in() (memoria
    // reference_supabase_cross_schema_fk).
    const personaIds = [...new Set(ventasArr.map((v) => v.persona_id))];
    const personaMap = new Map<string, string>();
    if (personaIds.length) {
      const { data: personas, error: pErr } = await sb
        .schema('erp')
        .from('personas')
        .select('id, nombre, apellido_paterno, apellido_materno')
        .in('id', personaIds);
      if (pErr)
        return { error: getSupabaseErrorMessage(pErr, 'No se pudieron cargar los compradores.') };
      for (const p of personas ?? []) {
        const nombre = [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ');
        personaMap.set(p.id as string, nombre || '(sin nombre)');
      }
    }
    return {
      data: ventasArr.map((v) => ({
        ...v,
        cliente: personaMap.get(v.persona_id) ?? '(sin comprador)',
        proyectoNombre: v.unidad?.proyecto?.nombre ?? '',
      })),
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
      key: 'unidad',
      label: 'Unidad',
      type: 'custom',
      accessor: (v) => v.unidad?.identificador ?? '',
      render: (v) => v.unidad?.identificador ?? '—',
    },
    {
      key: 'fase_actual',
      label: 'Fase',
      type: 'custom',
      accessor: (v) => v.fase_posicion ?? 0,
      render: (v) =>
        v.fase_actual ? <Badge tone="neutral">{v.fase_actual}</Badge> : <span>—</span>,
    },
    { key: 'precio_asignacion', label: 'Precio', type: 'currency' },
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
    setSelected({
      id: v.id,
      persona_id: v.persona_id,
      estado: v.estado,
      fase_actual: v.fase_actual,
      fase_posicion: v.fase_posicion,
      tipo_credito: v.tipo_credito,
      cliente: v.cliente,
      unidadIdentificador: v.unidad?.identificador ?? null,
      proyectoNombre: v.proyectoNombre || null,
    });
    setDrawerOpen(true);
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
      />

      <VentaDetailDrawer venta={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
