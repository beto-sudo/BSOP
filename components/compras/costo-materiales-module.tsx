'use client';

/**
 * CostoMaterialesModule — captura del costo final de materiales por
 * vivienda terminada (tab "Costo materiales" del hub Compras DILESA).
 *
 * Puente post-cutoff del grid Coda "Construcción por Lote": el control de
 * materiales sigue viviendo en CONTPAQ; aquí solo se registra el monto
 * final por vivienda cuando se termina, para que avance la cobertura de
 * costeo (alimenta `dilesa.productos.costo_materiales_referencia` y el
 * análisis financiero de anteproyectos). El módulo de control de
 * materiales en BSOP lo sustituirá cuando exista.
 *
 * Universo: construcciones en estado terminada/dtu/seguro_calidad/extraida
 * (el costo FINAL solo existe con la vivienda terminada — la RPC rechaza
 * estados anteriores). Vista default "Pendientes" = sin costo capturado.
 *
 * Captura inline con commit on-blur (patrón MoneyCell de
 * `anteproyecto-analisis-financiero`). El write va por la RPC
 * `dilesa.fn_construccion_capturar_costo_materiales`, que re-valida el
 * permiso server-side, recalcula la referencia del prototipo y deja
 * `core.audit_log` con valor anterior y nuevo.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, PackageSearch, RefreshCw, Search } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { usePermissions } from '@/components/providers';
import { DataTable, ModuleKpiStrip, type Column, type ModuleKpi } from '@/components/module-page';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { formatCurrency } from '@/lib/format';
import { parseMoneyInput } from '@/components/dilesa/analisis-financiero-types';

// Estados donde la vivienda ya terminó y el costo final puede capturarse.
// Mismo set que usa el promedio de referencia (migración 20260530210000).
const ESTADOS_TERMINADA = ['terminada', 'dtu', 'seguro_calidad', 'extraida'] as const;

const ESTADO_LABEL: Record<string, { label: string; tone: BadgeTone }> = {
  terminada: { label: 'Terminada', tone: 'success' },
  dtu: { label: 'DTU', tone: 'info' },
  seguro_calidad: { label: 'Seguro calidad', tone: 'info' },
  extraida: { label: 'Extraída', tone: 'neutral' },
};

type ConstruccionRow = {
  id: string;
  codigo: string;
  unidad_id: string;
  producto_id: string;
  fecha_terminada: string | null;
  estado: string;
  costo_materiales: number | null;
};

type Row = ConstruccionRow & {
  proyectoNombre: string;
  prototipoNombre: string;
};

// ── Money input inline (commit on-blur; Escape cancela) ─────────────────────

function MoneyCell({
  value,
  onCommit,
  pending,
  disabled,
}: {
  value: number | null;
  onCommit: (v: number) => void;
  pending: boolean;
  disabled: boolean;
}) {
  const [raw, setRaw] = useState<string>(value == null ? '' : String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (editing) return;
    // Re-sync con el valor externo tras un commit exitoso del padre.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRaw(value == null ? '' : String(value));
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const parsed = parseMoneyInput(raw);
    // La RPC solo acepta montos > 0; un input vacío/invalido no commitea.
    if (parsed != null && parsed > 0 && parsed !== (value ?? null)) onCommit(parsed);
    else setRaw(value == null ? '' : String(value));
  };

  if (disabled) {
    return value == null ? (
      <span className="text-[var(--text)]/30">—</span>
    ) : (
      <span className="tabular-nums">{formatCurrency(value)}</span>
    );
  }

  if (editing) {
    return (
      <input
        type="text"
        inputMode="decimal"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setRaw(value == null ? '' : String(value));
            setEditing(false);
          }
        }}
        autoFocus
        disabled={pending}
        aria-label="Costo de materiales"
        className="h-8 w-36 rounded-md border border-[var(--accent)] bg-[var(--card)] px-2 text-right text-sm tabular-nums text-[var(--text)] outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      disabled={pending}
      className={`h-8 w-36 rounded-md border px-2 text-right text-sm tabular-nums transition-colors ${
        value == null
          ? 'border-dashed border-amber-400/60 text-amber-600 hover:border-amber-500 hover:bg-amber-50/50'
          : 'border-transparent text-[var(--text)] hover:border-[var(--border)] hover:bg-[var(--card)]'
      }`}
      title={value == null ? 'Capturar costo de materiales' : 'Corregir costo (queda en bitácora)'}
    >
      {pending ? (
        <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" />
      ) : value == null ? (
        'Capturar…'
      ) : (
        formatCurrency(value)
      )}
    </button>
  );
}

// ── Módulo ───────────────────────────────────────────────────────────────────

export function CostoMaterialesModule({ empresaId }: { empresaId: string }) {
  const { permissions } = usePermissions();
  const toast = useToast();
  const puedeCapturar =
    permissions.isAdmin ||
    permissions.modulos.get('dilesa.compras.costo_materiales')?.write === true;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<'pendientes' | 'todas'>('pendientes');
  const [search, setSearch] = useState('');
  const [proyectoFiltro, setProyectoFiltro] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  // Fetch puro (sin setState) + apply separado — el lint del repo prohíbe
  // setState síncrono dentro del effect (patrón recepciones-module).
  const fetchData = useCallback(async (): Promise<{ rows?: Row[]; error?: string }> => {
    const sb = createSupabaseBrowserClient();

    // Sin embeds (patrón construccion-module): lookups paralelos por
    // empresa_id para evitar URLs > 8KB con `.in(ids[])`.
    const [obrasRes, unidadesRes, proyectosRes, productosRes] = await Promise.all([
      sb
        .schema('dilesa')
        .from('construccion')
        .select('id, codigo, unidad_id, producto_id, fecha_terminada, estado, costo_materiales')
        .eq('empresa_id', empresaId)
        .in('estado', [...ESTADOS_TERMINADA])
        .is('deleted_at', null),
      sb.schema('dilesa').from('unidades').select('id, proyecto_id').eq('empresa_id', empresaId),
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

    const firstErr =
      obrasRes.error ?? unidadesRes.error ?? proyectosRes.error ?? productosRes.error;
    if (firstErr) {
      return { error: getSupabaseErrorMessage(firstErr, 'No se pudieron cargar las viviendas.') };
    }

    const unidadProyecto = new Map(
      (unidadesRes.data ?? []).map((u) => [u.id, u.proyecto_id as string | null])
    );
    const proyectoNombre = new Map((proyectosRes.data ?? []).map((p) => [p.id, p.nombre]));
    const productoNombre = new Map((productosRes.data ?? []).map((p) => [p.id, p.nombre]));

    return {
      rows: ((obrasRes.data ?? []) as ConstruccionRow[]).map((o) => {
        const proyectoId = unidadProyecto.get(o.unidad_id) ?? null;
        return {
          ...o,
          proyectoNombre: (proyectoId && proyectoNombre.get(proyectoId)) || '—',
          prototipoNombre: productoNombre.get(o.producto_id) ?? '—',
        };
      }),
    };
  }, [empresaId]);

  const apply = useCallback((res: { rows?: Row[]; error?: string }) => {
    setError(res.error ?? null);
    if (res.rows) setRows(res.rows);
    setLoading(false);
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    apply(await fetchData());
  }, [fetchData, apply]);

  useEffect(() => {
    let activo = true;
    void fetchData().then((res) => {
      if (activo) apply(res);
    });
    return () => {
      activo = false;
    };
  }, [fetchData, apply]);

  const capturar = useCallback(
    async (row: Row, costo: number) => {
      setSavingId(row.id);
      const sb = createSupabaseBrowserClient();
      const { error: e } = await sb
        .schema('dilesa')
        .rpc('fn_construccion_capturar_costo_materiales', {
          p_construccion_id: row.id,
          p_costo: costo,
        });
      setSavingId(null);
      if (e) {
        toast.add({
          title: 'No se pudo guardar',
          description: getSupabaseErrorMessage(e, 'Error al capturar el costo.'),
          type: 'error',
        });
        return;
      }
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, costo_materiales: costo } : r)));
      toast.add({
        title: 'Costo capturado',
        description: `${row.codigo} → ${formatCurrency(costo)}`,
        type: 'success',
      });
    },
    [toast]
  );

  const proyectosPresentes = useMemo(() => {
    const set = new Set(rows.map((r) => r.proyectoNombre));
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [rows]);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (vista === 'pendientes' && r.costo_materiales != null && r.costo_materiales > 0)
        return false;
      if (proyectoFiltro && r.proyectoNombre !== proyectoFiltro) return false;
      if (
        q &&
        !r.codigo.toLowerCase().includes(q) &&
        !r.proyectoNombre.toLowerCase().includes(q) &&
        !r.prototipoNombre.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [rows, vista, proyectoFiltro, search]);

  const kpis: ModuleKpi[] = useMemo(() => {
    const sinCosto = rows.filter((r) => r.costo_materiales == null || r.costo_materiales === 0);
    const conCosto = rows.filter((r) => r.costo_materiales != null && r.costo_materiales > 0);
    const promedio =
      conCosto.length > 0
        ? conCosto.reduce((s, r) => s + (r.costo_materiales ?? 0), 0) / conCosto.length
        : null;
    return [
      { key: 'terminadas', label: 'Viviendas terminadas', value: rows.length },
      {
        key: 'pendientes',
        label: 'Sin costo de materiales',
        value: sinCosto.length,
        valueClassName: sinCosto.length > 0 ? 'text-amber-500' : undefined,
      },
      { key: 'capturadas', label: 'Con costo capturado', value: conCosto.length },
      {
        key: 'promedio',
        label: 'Promedio por vivienda',
        value: promedio == null ? '—' : formatCurrency(promedio),
      },
    ];
  }, [rows]);

  const columns: Column<Row>[] = [
    { key: 'codigo', label: 'Vivienda', type: 'text', sticky: true, width: 'min-w-[220px]' },
    { key: 'proyectoNombre', label: 'Proyecto', type: 'text' },
    { key: 'prototipoNombre', label: 'Prototipo', type: 'text' },
    {
      key: 'fecha_terminada',
      label: 'Terminada',
      type: 'custom',
      accessor: (r) => r.fecha_terminada ?? '',
      render: (r) =>
        r.fecha_terminada ? (
          new Date(r.fecha_terminada).toLocaleDateString('es-MX', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          })
        ) : (
          <span className="text-[var(--text)]/30">—</span>
        ),
    },
    {
      key: 'estado',
      label: 'Estado',
      type: 'custom',
      accessor: (r) => r.estado,
      render: (r) => {
        const cfg = ESTADO_LABEL[r.estado] ?? { label: r.estado, tone: 'neutral' as BadgeTone };
        return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
      },
    },
    {
      key: 'costo_materiales',
      label: 'Costo materiales',
      type: 'custom',
      align: 'right',
      accessor: (r) => r.costo_materiales ?? 0,
      render: (r) => (
        <MoneyCell
          value={r.costo_materiales}
          onCommit={(v) => void capturar(r, v)}
          pending={savingId === r.id}
          disabled={!puedeCapturar}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <PackageSearch className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
            Costo de materiales
          </h1>
          <p className="text-sm text-[var(--text)]/60">
            Registra el costo final de materiales de cada vivienda terminada (dato de CONTPAQ).
            Alimenta el costo de referencia del prototipo. Cada captura queda en bitácora.
          </p>
        </div>
      </header>

      <ModuleKpiStrip stats={kpis} cols={4} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-md border border-[var(--border)]">
          {(
            [
              ['pendientes', 'Pendientes'],
              ['todas', 'Todas'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setVista(key)}
              className={`h-9 px-3 text-sm font-medium transition-colors ${
                vista === key
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--card)] text-[var(--text)]/70 hover:text-[var(--text)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={proyectoFiltro}
          onChange={(e) => setProyectoFiltro(e.target.value)}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
          aria-label="Proyecto"
        >
          <option value="">Todos los proyectos</option>
          {proyectosPresentes.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text)]/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar vivienda, proyecto o prototipo…"
            className="w-72 pl-9"
          />
        </div>
        <button
          type="button"
          onClick={() => void cargar()}
          className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text)]/70 hover:text-[var(--text)]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refrescar
        </button>
        <span className="ml-auto text-sm text-[var(--text)]/60">
          {filtrados.length} {filtrados.length === 1 ? 'vivienda' : 'viviendas'}
        </span>
      </div>

      <DataTable
        data={filtrados}
        columns={columns}
        rowKey="id"
        loading={loading}
        error={error}
        onRetry={() => void cargar()}
        initialSort={{ key: 'fecha_terminada', dir: 'desc' }}
        emptyTitle={vista === 'pendientes' ? 'Todo capturado' : 'Sin viviendas terminadas'}
        emptyDescription={
          vista === 'pendientes'
            ? 'Todas las viviendas terminadas ya tienen costo de materiales.'
            : 'No hay viviendas terminadas que coincidan con los filtros.'
        }
        emptyIcon={<PackageSearch className="h-6 w-6" />}
        maxHeight="calc(100vh - 360px)"
      />
    </div>
  );
}
