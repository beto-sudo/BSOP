'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Data-sync pattern: setLoading/setError antes de firing async fetch; mismo
 * patrón que terrenos/[id], prototipos/[id] y resto del panel.
 */

/**
 * Editor M:N de dilesa.fraccionamiento_prototipo.
 *
 * Sprint dilesa-1 UI (branch feat/dilesa-ui-proyectos). Comercial por proyecto:
 * qué prototipos se ofrecen, en qué cantidad y a qué precio.
 *
 *  - Escribe directo al cliente Supabase (RLS gobierna; mismo criterio que
 *    anteproyectos_prototipos_referencia en el PR de Anteproyectos).
 *  - Edit inline con debounce 500ms por campo.
 *  - precio_venta nullable: si es null, el cálculo usa prototipos.valor_comercial
 *    como fallback. Mostramos "auto" en el input para comunicarlo.
 *  - UK (proyecto_id, prototipo_id) — manejamos violación 23505 con refetch
 *    silencioso en caso de doble-click.
 *  - Cuando el proyecto tiene anteproyecto_id, comparamos contra
 *    v_anteproyectos_analisis.valor_comercial_proyecto para delta en %.
 *
 * Schema: supabase/SCHEMA_REF.md §dilesa.fraccionamiento_prototipo.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Check, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { DILESA_EMPRESA_ID, formatCurrency } from '@/lib/dilesa-constants';

type FraccionamientoRow = {
  id: string;
  proyecto_id: string;
  prototipo_id: string;
  cantidad_unidades: number;
  precio_venta: number | null;
  notas: string | null;
  prototipo: {
    id: string;
    nombre: string;
    codigo: string | null;
    valor_comercial: number | null;
    clasificacion_inmobiliaria: { nombre: string } | null;
  } | null;
};

type FraccionamientoUpdate = {
  cantidad_unidades?: number;
  precio_venta?: number | null;
  notas?: string | null;
};

type PrototipoOption = {
  id: string;
  nombre: string;
  codigo: string | null;
  valor_comercial: number | null;
  clasificacion_inmobiliaria: { nombre: string } | null;
};

type DirtyField = 'cantidad_unidades' | 'precio_venta' | 'notas';

export function FraccionamientoEditor({
  proyectoId,
  anteproyectoId,
}: {
  proyectoId: string;
  anteproyectoId: string | null;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [rows, setRows] = useState<FraccionamientoRow[]>([]);
  const [catalogo, setCatalogo] = useState<PrototipoOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [anteValorComercial, setAnteValorComercial] = useState<number | null>(null);

  // edits locales por fila/campo — se guardan con debounce
  const [localEdits, setLocalEdits] = useState<Record<string, Partial<Record<DirtyField, string>>>>(
    {}
  );
  // flashes de "guardado" por fila (UX quiet)
  const [savedFlash, setSavedFlash] = useState<Record<string, number>>({});
  // timers por fila/campo
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const fetchRows = useCallback(async () => {
    const { data, error: err } = await supabase
      .schema('dilesa')
      .from('fraccionamiento_prototipo')
      .select(
        'id, proyecto_id, prototipo_id, cantidad_unidades, precio_venta, notas, prototipo:prototipo_id(id, nombre, codigo, valor_comercial, clasificacion_inmobiliaria:clasificacion_inmobiliaria_id(nombre))'
      )
      .eq('proyecto_id', proyectoId)
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (err) {
      setError(err.message);
      return;
    }
    setRows((data ?? []) as unknown as FraccionamientoRow[]);
  }, [supabase, proyectoId]);

  const fetchCatalogo = useCallback(async () => {
    const { data, error: err } = await supabase
      .schema('dilesa')
      .from('prototipos')
      .select(
        'id, nombre, codigo, valor_comercial, clasificacion_inmobiliaria:clasificacion_inmobiliaria_id(nombre)'
      )
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null)
      .order('nombre');
    if (err) return;
    setCatalogo((data ?? []) as unknown as PrototipoOption[]);
  }, [supabase]);

  const fetchAnteReferencia = useCallback(async () => {
    if (!anteproyectoId) return;
    const { data, error: err } = await supabase
      .schema('dilesa')
      .from('v_anteproyectos_analisis')
      .select('valor_comercial_proyecto')
      .eq('id', anteproyectoId)
      .maybeSingle();
    if (err || !data) return;
    setAnteValorComercial(
      (data as { valor_comercial_proyecto: number | null }).valor_comercial_proyecto
    );
  }, [supabase, anteproyectoId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const init = async () => {
      await Promise.all([fetchRows(), fetchCatalogo(), fetchAnteReferencia()]);
      if (!cancelled) setLoading(false);
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [fetchRows, fetchCatalogo, fetchAnteReferencia]);

  // limpia timers al desmontar
  useEffect(() => {
    const handlers = timers.current;
    return () => {
      Object.values(handlers).forEach((t) => clearTimeout(t));
    };
  }, []);

  const flashSaved = useCallback((rowId: string) => {
    setSavedFlash((prev) => ({ ...prev, [rowId]: Date.now() }));
    setTimeout(() => {
      setSavedFlash((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
    }, 1500);
  }, []);

  const persistUpdate = useCallback(
    async (rowId: string, payload: FraccionamientoUpdate) => {
      const { error: err } = await supabase
        .schema('dilesa')
        .from('fraccionamiento_prototipo')
        .update(payload)
        .eq('id', rowId);
      if (err) {
        alert(`Error al guardar: ${err.message}`);
        await fetchRows();
        return;
      }
      setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...payload } : r)));
      setLocalEdits((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      flashSaved(rowId);
    },
    [supabase, fetchRows, flashSaved]
  );

  const scheduleUpdate = useCallback(
    (rowId: string, field: DirtyField, raw: string) => {
      setLocalEdits((prev) => ({
        ...prev,
        [rowId]: { ...prev[rowId], [field]: raw },
      }));
      const key = `${rowId}:${field}`;
      if (timers.current[key]) clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => {
        const trimmed = raw.trim();
        let payload: FraccionamientoUpdate = {};
        if (field === 'cantidad_unidades') {
          const n = trimmed ? Number(trimmed) : 0;
          if (Number.isNaN(n) || n < 0) return;
          payload = { cantidad_unidades: Math.floor(n) };
        } else if (field === 'precio_venta') {
          if (!trimmed) {
            payload = { precio_venta: null };
          } else {
            const n = Number(trimmed);
            if (Number.isNaN(n) || n < 0) return;
            payload = { precio_venta: n };
          }
        } else if (field === 'notas') {
          payload = { notas: trimmed || null };
        }
        void persistUpdate(rowId, payload);
      }, 500);
    },
    [persistUpdate]
  );

  const handleAddPrototipo = useCallback(
    async (prototipoId: string) => {
      setAddOpen(false);
      setAdding(true);
      const { error: err } = await supabase
        .schema('dilesa')
        .from('fraccionamiento_prototipo')
        .insert({
          empresa_id: DILESA_EMPRESA_ID,
          proyecto_id: proyectoId,
          prototipo_id: prototipoId,
          precio_venta: null,
        });
      setAdding(false);
      if (err) {
        // 23505 = unique_violation. Puede pasar por doble-click o carrera.
        if (err.code === '23505') {
          await fetchRows();
          return;
        }
        alert(`Error al agregar prototipo: ${err.message}`);
        return;
      }
      await fetchRows();
    },
    [supabase, proyectoId, fetchRows]
  );

  const handleRemove = useCallback(
    async (row: FraccionamientoRow) => {
      const ok = window.confirm(
        `¿Quitar "${row.prototipo?.nombre ?? 'prototipo'}" del fraccionamiento? Se archiva (deleted_at); se puede restaurar por SQL.`
      );
      if (!ok) return;
      const { error: err } = await supabase
        .schema('dilesa')
        .from('fraccionamiento_prototipo')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', row.id);
      if (err) {
        alert(`Error al quitar: ${err.message}`);
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    },
    [supabase]
  );

  const totals = useMemo(() => {
    let unidades = 0;
    let valorProyectado = 0;
    rows.forEach((row) => {
      const cantidadStr = localEdits[row.id]?.cantidad_unidades;
      const precioStr = localEdits[row.id]?.precio_venta;
      const cantidad = cantidadStr != null ? Number(cantidadStr) || 0 : row.cantidad_unidades;
      let precioEfectivo: number;
      if (precioStr != null) {
        precioEfectivo =
          precioStr.trim() === '' ? (row.prototipo?.valor_comercial ?? 0) : Number(precioStr) || 0;
      } else {
        precioEfectivo = row.precio_venta ?? row.prototipo?.valor_comercial ?? 0;
      }
      unidades += cantidad;
      valorProyectado += cantidad * precioEfectivo;
    });
    return { unidades, valorProyectado };
  }, [rows, localEdits]);

  const deltaVsAnte = useMemo(() => {
    if (!anteproyectoId || anteValorComercial == null || anteValorComercial === 0) return null;
    const pct = (totals.valorProyectado - anteValorComercial) / anteValorComercial;
    return { pct, base: anteValorComercial };
  }, [anteproyectoId, anteValorComercial, totals.valorProyectado]);

  const idsYaAgregados = useMemo(() => new Set(rows.map((r) => r.prototipo_id)), [rows]);
  const catalogoDisponible = useMemo(
    () => catalogo.filter((p) => !idsYaAgregados.has(p.id)),
    [catalogo, idsYaAgregados]
  );

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400"
      >
        No se pudo cargar el fraccionamiento: {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--text)]/55">
          Prototipos que se comercializan en este proyecto. Cantidad × precio efectivo alimenta el
          valor comercial proyectado.
        </p>
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger
            render={(triggerProps) => (
              <Button
                {...triggerProps}
                type="button"
                size="sm"
                variant="outline"
                disabled={adding || catalogoDisponible.length === 0}
              >
                {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Agregar prototipo
              </Button>
            )}
          />
          <PopoverContent align="end" className="w-80 p-0">
            <Command>
              <div className="border-b border-[var(--border)] p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text)]/40" />
                  <CommandInput placeholder="Buscar prototipo…" className="h-8 pl-7 text-sm" />
                </div>
              </div>
              <CommandList>
                <CommandEmpty>Sin prototipos disponibles.</CommandEmpty>
                <CommandGroup>
                  {catalogoDisponible.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={`${p.nombre} ${p.codigo ?? ''} ${p.clasificacion_inmobiliaria?.nombre ?? ''}`}
                      onSelect={() => void handleAddPrototipo(p.id)}
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm text-[var(--text)]">{p.nombre}</span>
                        <span className="truncate text-[10px] text-[var(--text)]/50">
                          {p.codigo ? `${p.codigo} · ` : ''}
                          {p.clasificacion_inmobiliaria?.nombre ?? 'sin clasificación'}
                          {' · '}
                          {formatCurrency(p.valor_comercial, { compact: true })}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]/40 p-8 text-center">
          <p className="text-sm text-[var(--text)]/65">
            Aún no hay prototipos comerciales asignados a este proyecto.
          </p>
          <p className="mt-1 text-xs text-[var(--text)]/45">
            Usa &ldquo;Agregar prototipo&rdquo; para comenzar a armar el fraccionamiento.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[10px] font-semibold uppercase tracking-widest text-[var(--text)]/50">
                <th className="px-3 py-2 text-left">Prototipo</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
                <th className="px-3 py-2 text-right">Precio venta</th>
                <th className="px-3 py-2 text-left">Notas</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 w-10" aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const edits = localEdits[row.id] ?? {};
                const cantidadValue = edits.cantidad_unidades ?? String(row.cantidad_unidades ?? 0);
                const precioValue =
                  edits.precio_venta ?? (row.precio_venta != null ? String(row.precio_venta) : '');
                const notasValue = edits.notas ?? row.notas ?? '';
                const cantidadNum = Number(cantidadValue) || 0;
                const precioEfectivo =
                  precioValue.trim() === ''
                    ? (row.prototipo?.valor_comercial ?? 0)
                    : Number(precioValue) || 0;
                const total = cantidadNum * precioEfectivo;
                const showFallback = precioValue.trim() === '';
                const flash = savedFlash[row.id];

                return (
                  <tr key={row.id} className="border-t border-[var(--border)] align-top">
                    <td className="px-3 py-2">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium text-[var(--text)]">
                          {row.prototipo?.nombre ?? '(prototipo archivado)'}
                        </span>
                        <span className="truncate text-[10px] text-[var(--text)]/50">
                          {row.prototipo?.codigo ? `${row.prototipo.codigo} · ` : ''}
                          {row.prototipo?.clasificacion_inmobiliaria?.nombre ?? 'sin clasificación'}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={cantidadValue}
                        onChange={(e) =>
                          scheduleUpdate(row.id, 'cantidad_unidades', e.target.value)
                        }
                        className="h-8 w-24 text-right text-sm tabular-nums"
                        aria-label={`Cantidad de ${row.prototipo?.nombre ?? 'prototipo'}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col items-end gap-0.5">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={precioValue}
                          onChange={(e) => scheduleUpdate(row.id, 'precio_venta', e.target.value)}
                          placeholder="auto"
                          className="h-8 w-28 text-right text-sm tabular-nums"
                          aria-label={`Precio venta de ${row.prototipo?.nombre ?? 'prototipo'}`}
                        />
                        {showFallback && row.prototipo?.valor_comercial != null ? (
                          <span
                            className="text-[10px] text-[var(--text)]/40"
                            title="Fallback a valor_comercial del prototipo"
                          >
                            ← {formatCurrency(row.prototipo.valor_comercial)}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="text"
                        value={notasValue}
                        onChange={(e) => scheduleUpdate(row.id, 'notas', e.target.value)}
                        placeholder="(opcional)"
                        className="h-8 text-sm"
                        aria-label={`Notas de ${row.prototipo?.nombre ?? 'prototipo'}`}
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-sm tabular-nums text-[var(--text)]">
                      {formatCurrency(total)}
                      {flash ? (
                        <span
                          className="ml-1 inline-flex items-center text-emerald-400"
                          aria-label="Guardado"
                        >
                          <Check className="size-3" />
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={() => void handleRemove(row)}
                        aria-label="Quitar prototipo"
                        className="text-red-400"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--border)] bg-[var(--card)]/60">
                <td className="px-3 py-2 text-xs font-semibold uppercase tracking-widest text-[var(--text)]/55">
                  Total unidades
                </td>
                <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-[var(--text)]">
                  {totals.unidades.toLocaleString('es-MX')}
                </td>
                <td className="px-3 py-2 text-right text-xs uppercase tracking-widest text-[var(--text)]/55">
                  Valor proyectado
                </td>
                <td />
                <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-[var(--text)]">
                  {formatCurrency(totals.valorProyectado)}
                </td>
                <td />
              </tr>
              {deltaVsAnte ? (
                <tr className="border-t border-[var(--border)] bg-[var(--card)]/40">
                  <td className="px-3 py-2 text-xs uppercase tracking-widest text-[var(--text)]/55">
                    Δ vs anteproyecto
                  </td>
                  <td
                    colSpan={4}
                    className="px-3 py-2 text-right text-sm tabular-nums text-[var(--text)]/70"
                  >
                    Base anteproyecto:{' '}
                    <span className="text-[var(--text)]/85">
                      {formatCurrency(deltaVsAnte.base, { compact: true })}
                    </span>
                    <span
                      className={`ml-3 inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium ${
                        deltaVsAnte.pct >= 0
                          ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                          : 'border-red-500/25 bg-red-500/10 text-red-400'
                      }`}
                    >
                      {deltaVsAnte.pct >= 0 ? '+' : ''}
                      {(deltaVsAnte.pct * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td />
                </tr>
              ) : null}
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
