'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de /rdb/inventario/levantamientos.
 */

/**
 * Captura a ciegas — pantalla mobile para conteo físico.
 *
 * Diseño:
 *   - El usuario busca un producto (input + scanner USB-HID friendly), tap
 *     para seleccionarlo, ingresa cantidad con NumPad, y "Guardar y siguiente"
 *     persiste el conteo y limpia para el próximo producto.
 *   - "A ciegas": NO se muestra `stock_inicial` — la RPC `fn_get_lineas_para_capturar`
 *     no lo devuelve. La diferencia se calcula al cerrar la captura.
 *   - Offline-tolerant: usa `useCapturaQueue` que encola en IndexedDB y reenvía
 *     en background. La UI no espera la red para resolver "Guardar".
 *   - Sticky header con folio + progreso y botón cerrar (vuelve al detail,
 *     NO cierra la captura).
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  RotateCcw,
  Search,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { NumPad } from '@/components/ui/num-pad';
import { useCapturaQueue } from '@/hooks/use-captura-queue';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { formatNumber } from '@/lib/inventario/format';
import { cn } from '@/lib/utils';
import { getLineasParaCapturar } from '../../actions';
import type { LineaParaCapturar } from '../../types';

type LevantamientoMeta = {
  id: string;
  folio: string | null;
  estado: string;
  almacen_nombre: string | null;
};

export default function CapturarPage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.inventario" write>
      <CapturarInner />
    </RequireAccess>
  );
}

function CapturarInner() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const toast = useToast();
  const queue = useCapturaQueue();

  const [meta, setMeta] = useState<LevantamientoMeta | null>(null);
  const [lineas, setLineas] = useState<LineaParaCapturar[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState('');
  const [activoId, setActivoId] = useState<string | null>(null);
  const [valor, setValor] = useState('0');
  const [showPendientes, setShowPendientes] = useState(false);
  const [saving, setSaving] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const supabase = createSupabaseBrowserClient();

    const [{ data: lev, error: levErr }, lineasRes] = await Promise.all([
      supabase
        .schema('erp')
        .from('inventario_levantamientos')
        .select('id, folio, estado, almacenes(nombre)')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle(),
      getLineasParaCapturar(id),
    ]);

    if (levErr) {
      setLoadError(levErr.message);
      setLoading(false);
      return;
    }
    if (!lev) {
      setLoadError('Levantamiento no encontrado.');
      setLoading(false);
      return;
    }

    type LevQuery = {
      id: string;
      folio: string | null;
      estado: string;
      almacenes: { nombre: string } | null;
    };
    const levRow = lev as unknown as LevQuery;
    setMeta({
      id: levRow.id,
      folio: levRow.folio,
      estado: levRow.estado,
      almacen_nombre: levRow.almacenes?.nombre ?? null,
    });

    if (!lineasRes.ok) {
      setLoadError(lineasRes.error);
      setLoading(false);
      return;
    }
    setLineas(lineasRes.data);
    setLoading(false);
    setRefreshing(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!loading) searchInputRef.current?.focus();
  }, [loading]);

  // Filtrado fuzzy client-side (case-insensitive sobre nombre + código).
  const resultados = useMemo(() => {
    if (!search.trim()) return [] as LineaParaCapturar[];
    const q = search.toLowerCase();
    return lineas
      .filter(
        (l) =>
          l.producto_nombre.toLowerCase().includes(q) || l.producto_codigo.toLowerCase().includes(q)
      )
      .slice(0, 25);
  }, [lineas, search]);

  const pendientes = useMemo(() => lineas.filter((l) => l.contado_at == null), [lineas]);
  const total = lineas.length;
  const contadas = total - pendientes.length;
  const pct = total === 0 ? 0 : Math.round((contadas / total) * 100);

  const activa = useMemo(
    () => (activoId ? (lineas.find((l) => l.producto_id === activoId) ?? null) : null),
    [activoId, lineas]
  );

  const seleccionar = (productoId: string) => {
    setActivoId(productoId);
    setSearch('');
    setValor('0');
  };

  // Scanner USB-HID: typing rápido + Enter en el buscador. Si hay un match
  // exacto por código, lo seleccionamos directo; si hay uno solo de nombre,
  // también; en otro caso, el usuario selecciona manualmente.
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = search.trim().toLowerCase();
    if (!q) return;
    const exactCode = lineas.find((l) => l.producto_codigo.toLowerCase() === q);
    if (exactCode) {
      seleccionar(exactCode.producto_id);
      return;
    }
    if (resultados.length === 1) seleccionar(resultados[0].producto_id);
  };

  const guardarYSiguiente = async () => {
    if (!activa || !id) return;
    const cantidad = Number(valor);
    if (!Number.isFinite(cantidad) || cantidad < 0) {
      toast.add({ title: 'Cantidad inválida', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      await queue.guardar({
        lev_id: id,
        producto_id: activa.producto_id,
        cantidad,
        ts: Date.now(),
      });
    } catch (err) {
      setSaving(false);
      toast.add({
        title: 'Error al guardar',
        description: err instanceof Error ? err.message : 'Intenta de nuevo.',
        type: 'error',
      });
      return;
    }
    setSaving(false);

    // Optimistic local update — el sync real puede tardar; el UI ya refleja el conteo.
    setLineas((prev) =>
      prev.map((l) =>
        l.producto_id === activa.producto_id
          ? {
              ...l,
              cantidad_contada: cantidad,
              contado_at: l.contado_at ?? new Date().toISOString(),
              recontada: l.contado_at != null,
            }
          : l
      )
    );

    setActivoId(null);
    setValor('0');
    setSearch('');
    searchInputRef.current?.focus();
  };

  const saltar = () => {
    setActivoId(null);
    setValor('0');
    setSearch('');
    searchInputRef.current?.focus();
  };

  const refresh = async () => {
    setRefreshing(true);
    await load();
  };

  if (loading) {
    return (
      <div className="container mx-auto max-w-xl space-y-4 px-4 py-6">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
    );
  }

  if (loadError || !meta) {
    return (
      <div className="container mx-auto max-w-xl space-y-4 px-4 py-6">
        <Link
          href={`/rdb/inventario/levantamientos/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Volver al levantamiento
        </Link>
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {loadError ?? 'Levantamiento no encontrado.'}
        </div>
      </div>
    );
  }

  if (meta.estado !== 'capturando') {
    return (
      <div className="container mx-auto max-w-xl space-y-4 px-4 py-6">
        <Link
          href={`/rdb/inventario/levantamientos/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Volver al levantamiento
        </Link>
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          Captura solo permitida en estado <strong>capturando</strong>. Estado actual:{' '}
          <strong>{meta.estado}</strong>.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      {/* ─── Header sticky ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/rdb/inventario/levantamientos/${id}`}
            aria-label="Salir de la captura"
            className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Salir
          </Link>
          <div className="flex flex-col items-end text-xs">
            <span className="font-medium tabular-nums">{meta.folio ?? '—'}</span>
            <span className="text-muted-foreground">{meta.almacen_nombre ?? 'Sin almacén'}</span>
          </div>
        </div>
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs">
            <span className="tabular-nums">
              {contadas} / {total} · {pct}%
            </span>
            <SyncIndicator
              pendientes={queue.pendientes}
              syncing={queue.syncing}
              fallback={queue.fallbackMode}
            />
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-sky-500 transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </header>

      <main className="space-y-4 px-4 py-4">
        {/* ─── Buscador ────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <label
            htmlFor="capturar-search"
            className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
          >
            Buscar producto
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              id="capturar-search"
              autoFocus
              autoComplete="off"
              inputMode="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Nombre o código (incluye scanner)"
              className="h-12 pl-10 text-base"
            />
          </div>

          {search.trim() && (
            <ul className="rounded-md border bg-card text-sm">
              {resultados.length === 0 ? (
                <li className="px-3 py-2 text-muted-foreground">Sin coincidencias.</li>
              ) : (
                resultados.map((l) => {
                  const yaContada = l.contado_at != null;
                  return (
                    <li key={l.linea_id}>
                      <button
                        type="button"
                        onClick={() => seleccionar(l.producto_id)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/40"
                      >
                        <div className="min-w-0">
                          <div className="font-medium">{l.producto_nombre}</div>
                          <div className="text-xs text-muted-foreground">
                            {l.producto_codigo}
                            {l.categoria ? ` · ${l.categoria}` : ''}
                          </div>
                        </div>
                        {yaContada && (
                          <CheckCircle2
                            className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                            aria-label="Ya contada"
                          />
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>

        {/* ─── Producto activo + NumPad ────────────────────────────────── */}
        {activa ? (
          <section className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Capturando
                </div>
                <div className="mt-0.5 truncate text-base font-semibold">
                  {activa.producto_nombre}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {activa.producto_codigo}
                  {activa.categoria ? ` · ${activa.categoria}` : ''} · {activa.unidad}
                </div>
                {activa.contado_at && (
                  <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                    <RotateCcw className="size-3" /> Recontando — el último valor reemplaza al
                    anterior
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setActivoId(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
            </div>

            <div className="my-4 flex h-20 items-center justify-center rounded-lg bg-muted/40 px-4 text-4xl font-bold tabular-nums">
              {valor}{' '}
              <span className="ml-2 text-base font-medium text-muted-foreground">
                {activa.unidad}
              </span>
            </div>

            <NumPad value={valor} onChange={setValor} quickValues={[0, 1, 6, 12, 24]} />

            <div className="mt-3 flex flex-col gap-2">
              <Button
                type="button"
                onClick={guardarYSiguiente}
                disabled={saving}
                className="h-14 text-base"
              >
                {saving ? <Loader2 className="size-5 animate-spin" /> : null}
                Guardar y siguiente
              </Button>
              <Button type="button" variant="outline" onClick={saltar} disabled={saving}>
                Saltar
              </Button>
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
            Selecciona un producto para capturar su cantidad.
          </section>
        )}

        {/* ─── Pendientes (colapsable) ─────────────────────────────────── */}
        <section className="rounded-lg border bg-card">
          <button
            type="button"
            onClick={() => setShowPendientes((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
          >
            <span>Pendientes ({pendientes.length})</span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void refresh();
                }}
                disabled={refreshing}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted/40"
                aria-label="Actualizar"
              >
                {refreshing ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <RotateCcw className="size-3" />
                )}
                Refrescar
              </button>
              {showPendientes ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </span>
          </button>
          {showPendientes && (
            <ul className="border-t">
              {pendientes.length === 0 ? (
                <li className="px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="mr-1 inline size-3.5" /> Todos los productos están
                  contados.
                </li>
              ) : (
                pendientes.map((l) => (
                  <li key={l.linea_id} className="border-b last:border-b-0">
                    <button
                      type="button"
                      onClick={() => seleccionar(l.producto_id)}
                      className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{l.producto_nombre}</div>
                        <div className="text-xs text-muted-foreground">
                          {l.producto_codigo}
                          {l.categoria ? ` · ${l.categoria}` : ''}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">{l.unidad}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </section>

        <ResumenContadas
          contadas={lineas.filter((l) => l.contado_at != null)}
          onReabrir={(productoId) => seleccionar(productoId)}
        />
      </main>
    </div>
  );
}

function SyncIndicator({
  pendientes,
  syncing,
  fallback,
}: {
  pendientes: number;
  syncing: boolean;
  fallback: boolean;
}) {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
        !online && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
        online && pendientes > 0 && 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
        online && pendientes === 0 && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      )}
      title={
        fallback
          ? 'IndexedDB no disponible — usando localStorage como respaldo'
          : online
            ? 'Conectado'
            : 'Sin conexión — los conteos se sincronizan cuando vuelva la red'
      }
    >
      {!online ? (
        <>
          <WifiOff className="size-3" />
          Sin red · {pendientes} pendiente{pendientes === 1 ? '' : 's'}
        </>
      ) : pendientes > 0 ? (
        <>
          {syncing ? <Loader2 className="size-3 animate-spin" /> : <Wifi className="size-3" />}
          {pendientes} sync
        </>
      ) : (
        <>
          <Wifi className="size-3" />
          Sincronizado
        </>
      )}
    </span>
  );
}

function ResumenContadas({
  contadas,
  onReabrir,
}: {
  contadas: LineaParaCapturar[];
  onReabrir: (productoId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (contadas.length === 0) return null;
  return (
    <section className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
      >
        <span>Ya contados ({contadas.length})</span>
        {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>
      {open && (
        <ul className="max-h-72 overflow-auto border-t">
          {contadas.map((l) => (
            <li key={l.linea_id} className="border-b last:border-b-0">
              <button
                type="button"
                onClick={() => onReabrir(l.producto_id)}
                className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{l.producto_nombre}</div>
                  <div className="text-xs text-muted-foreground">
                    {l.producto_codigo}
                    {l.recontada ? ' · recontado' : ''}
                  </div>
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatNumber(l.cantidad_contada)} {l.unidad}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
