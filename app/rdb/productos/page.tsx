'use client';

import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { DataTable, type Column } from '@/components/module-page';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FilterCombobox } from '@/components/ui/filter-combobox';
import { Combobox } from '@/components/ui/combobox';
import { DetailDrawer, DetailDrawerContent } from '@/components/detail-page';
import { RefreshCw, Search, Settings2, Save, X, BarChart3 } from 'lucide-react';
import { upsertReceta, updateCategoria } from './actions';
import {
  UNIDAD_DEFAULT,
  unidadOptions,
  factorRecetaAStock,
  rendimientoServir,
} from '@/lib/unidades';

const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

// ─── Types ────────────────────────────────────────────────────────────────────

type Producto = {
  id: string;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  tipo: string | null;
  unidad: string | null;
  activo: boolean;
  inventariable: boolean;
  categoria_id: string | null;
  categoria_nombre: string | null;
  categoria_color: string | null;
  ultimo_costo: number | null;
  ultimo_precio_venta: number | null;
  margen_pct: number | null;
  stock_actual: number;
  ultima_venta_at: string | null;
  total_unidades_vendidas: number;
};

type Categoria = {
  id: string;
  nombre: string;
  color: string | null;
  orden: number;
};

type RecetaRow = {
  id?: string;
  insumo_id: string;
  insumo_nombre: string;
  cantidad: number;
  unidad: string;
  // Datos del insumo para el preview de conversión (cuánto descuenta del stock).
  insumo_unidad: string | null;
  insumo_contenido: number | null;
  insumo_unidad_base: string | null;
};

type InsumoDisponible = {
  id: string;
  nombre: string;
  unidad: string;
  contenido: number | null;
  unidad_base: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

import { formatCurrency, formatNumber } from '@/lib/format';

function MargenBadge({ pct }: { pct: number | null }) {
  if (pct === null || pct === undefined)
    return <span className="text-muted-foreground text-xs">—</span>;
  const cls =
    pct >= 30
      ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
      : pct >= 10
        ? 'text-amber-600 bg-amber-50 border-amber-200'
        : 'text-red-600 bg-red-50 border-red-200';
  return (
    <Badge variant="outline" className={cls}>
      {pct.toFixed(1)}%
    </Badge>
  );
}

function UltimaVentaCell({ at, now }: { at: string | null; now: number }) {
  if (!at) return <span className="text-muted-foreground text-xs">Nunca</span>;
  const days = Math.floor((now - new Date(at).getTime()) / 86400000);
  if (days === 0) return <span className="text-emerald-600 text-xs">Hoy</span>;
  if (days <= 7) return <span className="text-emerald-600 text-xs">Hace {days}d</span>;
  if (days <= 30) return <span className="text-amber-600 text-xs">Hace {days}d</span>;
  return <span className="text-red-600 text-xs">Hace {days}d</span>;
}

function productoColumns(now: number, openDrawer: (p: Producto) => void): Column<Producto>[] {
  return [
    {
      key: 'nombre',
      label: 'Nombre',
      render: (p) => (
        <>
          <div className="font-medium">{p.nombre}</div>
          {p.descripcion && <div className="text-xs text-muted-foreground">{p.descripcion}</div>}
        </>
      ),
    },
    {
      key: 'codigo',
      label: 'Código',
      cellClassName: 'text-xs text-muted-foreground tabular-nums',
      render: (p) => p.codigo ?? '—',
    },
    {
      key: 'inventariable',
      label: 'Inventario',
      render: (p) =>
        (p.inventariable ?? true) ? (
          <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">
            Producto físico
          </Badge>
        ) : (
          <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
            Servicio
          </Badge>
        ),
    },
    {
      key: 'categoria_nombre',
      label: 'Categoría',
      render: (p) => <CategoriaBadge nombre={p.categoria_nombre} color={p.categoria_color} />,
    },
    {
      key: 'ultimo_costo',
      label: 'Costo',
      type: 'currency',
      cellClassName: 'text-sm',
    },
    {
      key: 'ultimo_precio_venta',
      label: 'Precio',
      type: 'currency',
      cellClassName: 'text-sm font-medium',
    },
    {
      key: 'margen_pct',
      label: 'Margen',
      align: 'right',
      render: (p) => <MargenBadge pct={p.margen_pct} />,
    },
    {
      key: 'stock_actual',
      label: 'Stock',
      type: 'number',
      cellClassName: 'text-sm',
      render: (p) => (p.inventariable ? formatNumber(p.stock_actual, { decimals: 0 }) : '—'),
    },
    {
      key: 'ultima_venta_at',
      label: 'Última venta',
      render: (p) => <UltimaVentaCell at={p.ultima_venta_at} now={now} />,
    },
    {
      key: 'activo',
      label: 'Estado',
      render: (p) => (
        <Badge variant={p.activo ? 'default' : 'secondary'}>
          {p.activo ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
    {
      key: 'acciones',
      label: '',
      sortable: false,
      align: 'right',
      render: (p) => (
        <DataTable.InteractiveCell>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={() => openDrawer(p)}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </DataTable.InteractiveCell>
      ),
    },
  ];
}

function CategoriaBadge({ nombre, color }: { nombre: string | null; color: string | null }) {
  if (!nombre) return <span className="text-muted-foreground text-xs">—</span>;
  if (!color)
    return (
      <Badge variant="outline" className="text-xs">
        {nombre}
      </Badge>
    );
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium"
      style={{
        borderColor: `${color}40`,
        backgroundColor: `${color}10`,
        color,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {nombre}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

/**
 * @module Productos (RDB)
 * @responsive desktop-only
 */
export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  const [search, setSearch] = useState('');
  const [categoriaFilter, setCategoriaFilter] = useState('all');
  const [activoFilter, setActivoFilter] = useState('all');
  const [inventariableFilter, setInventariableFilter] = useState('all');
  const [margenFilter, setMargenFilter] = useState('all'); // all | low | mid | high | sinprecio
  const [sinMovimientoFilter, setSinMovimientoFilter] = useState(false);
  const [sinCategoriaFilter, setSinCategoriaFilter] = useState(false);

  const [selectedProducto, setSelectedProducto] = useState<Producto | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state (edit drawer)
  const [formTipo, setFormTipo] = useState('producto');
  const [formUnidad, setFormUnidad] = useState(UNIDAD_DEFAULT);
  const [formCategoriaId, setFormCategoriaId] = useState<string>('');
  const [formInventariable, setFormInventariable] = useState(false);
  // Contenido de la presentación: cuántas `unidad_base` rinde 1 `unidad` de compra
  // (ej. 980 ml por botella). Habilita el descuento fraccionado por receta.
  const [formUnidadBase, setFormUnidadBase] = useState<string>('');
  const [formContenido, setFormContenido] = useState<string>('');

  // Receta state
  const [recetaRows, setRecetaRows] = useState<RecetaRow[]>([]);
  const [insumosDisponibles, setInsumosDisponibles] = useState<InsumoDisponible[]>([]);
  const [recetaLoading, setRecetaLoading] = useState(false);
  const [insumoToAdd, setInsumoToAdd] = useState('');

  // Create form state
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [newNombre, setNewNombre] = useState('');
  const [newPrecio, setNewPrecio] = useState('0');
  const [newTipo, setNewTipo] = useState('producto');
  const [newUnidad, setNewUnidad] = useState(UNIDAD_DEFAULT);
  const [newCategoriaId, setNewCategoriaId] = useState('');
  const [newInventariable, setNewInventariable] = useState(true);
  const [creating, setCreating] = useState(false);

  // Drill-down desde la tab Categorías: si la URL trae ?categoria=<id>,
  // pre-selecciona ese filtro al montar. Se lee de window.location en vez
  // de useSearchParams para no requerir un Suspense boundary (ADR-030) —
  // este page es un componente único grande, sin <XBody/> separado.
  useEffect(() => {
    const cat = new URLSearchParams(window.location.search).get('categoria');
    if (cat) setCategoriaFilter(cat);
  }, []);

  const fetchProductos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const [prodRes, catRes] = await Promise.all([
        supabase.schema('rdb').from('v_productos_tabla').select('*').order('nombre'),
        supabase
          .schema('erp')
          .from('categorias_producto')
          .select('id, nombre, color, orden')
          .eq('empresa_id', RDB_EMPRESA_ID)
          .eq('activo', true)
          .order('orden'),
      ]);
      if (prodRes.error) throw prodRes.error;
      if (catRes.error) throw catRes.error;
      const mapped: Producto[] = (prodRes.data ?? []).map((p) => ({
        id: p.id as string,
        codigo: (p.codigo as string | null) ?? null,
        nombre: p.nombre as string,
        descripcion: (p.descripcion as string | null) ?? null,
        tipo: (p.tipo as string | null) ?? null,
        unidad: (p.unidad as string | null) ?? null,
        activo: p.activo as boolean,
        inventariable: p.inventariable as boolean,
        categoria_id: (p.categoria_id as string | null) ?? null,
        categoria_nombre: (p.categoria_nombre as string | null) ?? null,
        categoria_color: (p.categoria_color as string | null) ?? null,
        ultimo_costo: p.ultimo_costo == null ? null : Number(p.ultimo_costo),
        ultimo_precio_venta: p.ultimo_precio_venta == null ? null : Number(p.ultimo_precio_venta),
        margen_pct: p.margen_pct == null ? null : Number(p.margen_pct),
        stock_actual: Number(p.stock_actual ?? 0),
        ultima_venta_at: (p.ultima_venta_at as string | null) ?? null,
        total_unidades_vendidas: Number(p.total_unidades_vendidas ?? 0),
      }));
      setProductos(mapped);
      setCategorias(
        (catRes.data ?? []).map((c) => ({
          id: c.id as string,
          nombre: c.nombre as string,
          color: (c.color as string | null) ?? null,
          orden: c.orden as number,
        }))
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar productos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProductos();
  }, [fetchProductos]);

  useEffect(() => {
    setNow(Date.now());
  }, [productos]);

  useEffect(() => {
    if (!drawerOpen || !selectedProducto) {
      setRecetaRows([]);
      setInsumosDisponibles([]);
      setInsumoToAdd('');
      return;
    }
    let cancelled = false;
    setRecetaLoading(true);
    const supabase = createSupabaseBrowserClient();
    void Promise.all([
      supabase
        .schema('erp')
        .from('producto_receta')
        .select(
          'id, insumo_id, cantidad, unidad, insumo:productos!insumo_id(nombre, unidad, contenido, unidad_base)'
        )
        .eq('producto_venta_id', selectedProducto.id),
      supabase
        .schema('erp')
        .from('productos')
        .select('id, nombre, unidad, contenido, unidad_base')
        .eq('empresa_id', RDB_EMPRESA_ID)
        .eq('inventariable', true)
        .eq('activo', true)
        .is('deleted_at', null)
        .order('nombre'),
      supabase
        .schema('erp')
        .from('productos')
        .select('contenido, unidad_base')
        .eq('id', selectedProducto.id)
        .maybeSingle(),
    ]).then(([rec, ins, self]) => {
      if (cancelled) return;
      if (rec.data) {
        setRecetaRows(
          rec.data.map((r) => {
            const insumo = r.insumo as {
              nombre?: string;
              unidad?: string | null;
              contenido?: number | null;
              unidad_base?: string | null;
            } | null;
            return {
              id: r.id,
              insumo_id: r.insumo_id,
              insumo_nombre: insumo?.nombre ?? '—',
              cantidad: Number(r.cantidad),
              unidad: r.unidad,
              insumo_unidad: insumo?.unidad ?? null,
              insumo_contenido: insumo?.contenido == null ? null : Number(insumo.contenido),
              insumo_unidad_base: insumo?.unidad_base ?? null,
            };
          })
        );
      } else {
        setRecetaRows([]);
      }
      if (ins.data) {
        setInsumosDisponibles(
          ins.data.map((i) => ({
            id: i.id,
            nombre: i.nombre,
            unidad: i.unidad || UNIDAD_DEFAULT,
            contenido: i.contenido == null ? null : Number(i.contenido),
            unidad_base: (i.unidad_base as string | null) ?? null,
          }))
        );
      }
      if (self.data) {
        setFormContenido(self.data.contenido == null ? '' : String(self.data.contenido));
        setFormUnidadBase((self.data.unidad_base as string | null) ?? '');
      }
      setRecetaLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [drawerOpen, selectedProducto]);

  const openDrawer = (p: Producto) => {
    setSelectedProducto(p);
    setFormTipo(p.tipo || 'producto');
    setFormUnidad(p.unidad || UNIDAD_DEFAULT);
    setFormCategoriaId(p.categoria_id ?? '');
    setFormInventariable(p.inventariable ?? true);
    // Se llenan con el valor real en el effect del drawer; reset para no
    // arrastrar el contenido del producto abierto anteriormente.
    setFormUnidadBase('');
    setFormContenido('');
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!selectedProducto) return;

    // Contenido + unidad de consumo van juntos (o ninguno). El contenido, si se
    // captura, debe ser un número > 0.
    const contenidoTrim = formContenido.trim();
    const unidadBaseTrim = formUnidadBase.trim();
    const contenidoNum = contenidoTrim === '' ? null : Number(contenidoTrim);
    if (contenidoNum !== null && (!Number.isFinite(contenidoNum) || contenidoNum <= 0)) {
      alert('El contenido debe ser un número mayor a 0.');
      return;
    }
    if (contenidoNum !== null && unidadBaseTrim === '') {
      alert('Indica la unidad de consumo (ej. mililitro) que corresponde al contenido.');
      return;
    }
    // Sin contenido, la unidad de consumo no aplica (se guarda en null).
    const unidadBaseFinal = contenidoNum === null ? null : unidadBaseTrim || null;

    setSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: err } = await supabase
        .schema('erp')
        .from('productos')
        .update({
          tipo: formTipo.trim() || 'producto',
          unidad: formUnidad || UNIDAD_DEFAULT,
          inventariable: formInventariable,
          unidad_base: unidadBaseFinal,
          contenido: contenidoNum,
          updated_at: new Date().toISOString(),
        })
        .eq('empresa_id', RDB_EMPRESA_ID)
        .eq('id', selectedProducto.id);
      if (err) throw err;

      // Categoría via server action (revalida path)
      const catResult = await updateCategoria({
        producto_id: selectedProducto.id,
        categoria_id: formCategoriaId || null,
      });
      if (!catResult.ok) {
        alert(`Error al guardar la categoría: ${catResult.error}`);
        return;
      }

      const recetaResult = await upsertReceta({
        producto_venta_id: selectedProducto.id,
        insumos: recetaRows.map((r) => ({
          insumo_id: r.insumo_id,
          cantidad: r.cantidad,
          unidad: r.unidad,
        })),
      });
      if (!recetaResult.ok) {
        alert(`Error al guardar la receta: ${recetaResult.error}`);
        return;
      }

      setDrawerOpen(false);
      void fetchProductos();
    } catch (e) {
      console.error(e);
      alert('Error al guardar el producto');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newNombre.trim()) {
      alert('El nombre es obligatorio');
      return;
    }
    setCreating(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: newProd, error: err } = await supabase
        .schema('erp')
        .from('productos')
        .insert({
          empresa_id: RDB_EMPRESA_ID,
          nombre: newNombre.trim(),
          tipo: newTipo.trim() || 'producto',
          unidad: newUnidad || UNIDAD_DEFAULT,
          inventariable: newInventariable,
          categoria_id: newCategoriaId || null,
          activo: true,
        })
        .select('id')
        .single();
      if (err) throw err;

      const precioNum = parseFloat(newPrecio) || 0;
      if (newProd && precioNum > 0) {
        await supabase.schema('erp').from('productos_precios').insert({
          empresa_id: RDB_EMPRESA_ID,
          producto_id: newProd.id,
          precio_venta: precioNum,
          vigente: true,
        });
      }

      setCreateDrawerOpen(false);
      setNewNombre('');
      setNewPrecio('0');
      setNewTipo('producto');
      setNewUnidad(UNIDAD_DEFAULT);
      setNewCategoriaId('');
      setNewInventariable(true);
      void fetchProductos();
    } catch (e) {
      console.error(e);
      alert('Error al crear el producto');
    } finally {
      setCreating(false);
    }
  };

  const filtered = useMemo(() => {
    return productos.filter((p) => {
      if (activoFilter !== 'all' && String(p.activo) !== activoFilter) return false;
      if (categoriaFilter !== 'all' && p.categoria_id !== categoriaFilter) return false;
      if (sinCategoriaFilter && p.categoria_id !== null) return false;
      if (inventariableFilter !== 'all' && String(p.inventariable ?? true) !== inventariableFilter)
        return false;

      if (margenFilter === 'sinprecio' && p.margen_pct !== null) return false;
      if (margenFilter === 'low' && (p.margen_pct === null || p.margen_pct >= 10)) return false;
      if (
        margenFilter === 'mid' &&
        (p.margen_pct === null || p.margen_pct < 10 || p.margen_pct >= 30)
      )
        return false;
      if (margenFilter === 'high' && (p.margen_pct === null || p.margen_pct < 30)) return false;

      if (sinMovimientoFilter) {
        if (!p.ultima_venta_at) return true; // nunca vendido = sin movimiento
        const days = Math.floor((now - new Date(p.ultima_venta_at).getTime()) / 86400000);
        if (days <= 30) return false;
      }

      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.nombre.toLowerCase().includes(q) ||
        (p.codigo ?? '').toLowerCase().includes(q) ||
        (p.categoria_nombre ?? '').toLowerCase().includes(q) ||
        (p.descripcion ?? '').toLowerCase().includes(q)
      );
    });
  }, [
    productos,
    activoFilter,
    categoriaFilter,
    inventariableFilter,
    margenFilter,
    sinMovimientoFilter,
    sinCategoriaFilter,
    search,
    now,
  ]);

  // Productos pendientes de clasificar (auto-creados por el trigger de Waitry sin categoría,
  // o creados a mano sin asignarla). Iniciativa rdb-waitry-autoalta-productos.
  const sinCategoriaCount = useMemo(
    () => productos.filter((p) => p.categoria_id === null).length,
    [productos]
  );

  return (
    <RequireAccess empresa="rdb" modulo="rdb.productos.catalogo">
      <DesktopOnlyNotice module="Productos" />
      <div className="hidden sm:block space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
            <p className="text-sm text-muted-foreground">
              Catálogo de productos y servicios — costo, precio, margen, stock y última venta.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              Total: <span className="font-semibold text-foreground">{filtered.length}</span>
            </div>
            {sinCategoriaCount > 0 && (
              <button
                type="button"
                onClick={() => setSinCategoriaFilter((v) => !v)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  sinCategoriaFilter
                    ? 'border-amber-500 bg-amber-500/20 text-amber-700'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20'
                }`}
                title="Productos sin categoría (incluye los que entran solos desde Waitry) — clic para filtrar"
              >
                {sinCategoriaCount} sin categoría
              </button>
            )}
            <Link href="/rdb/productos/analisis">
              <Button variant="outline" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Análisis
              </Button>
            </Link>
            <Button onClick={() => setCreateDrawerOpen(true)}>+ Nuevo Producto</Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-52">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, código o categoría…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <FilterCombobox
            value={categoriaFilter}
            onChange={setCategoriaFilter}
            options={categorias.map((c) => ({ id: c.id, label: c.nombre }))}
            placeholder="Categoría"
            searchPlaceholder="Buscar categoría..."
            clearLabel="Todas las categorías"
            className="w-48"
          />

          <FilterCombobox
            value={inventariableFilter}
            onChange={setInventariableFilter}
            options={[
              { id: 'true', label: 'Producto físico' },
              { id: 'false', label: 'Servicio' },
            ]}
            placeholder="Inventario"
            searchPlaceholder="Buscar..."
            clearLabel="Todos"
            className="w-44"
          />

          <FilterCombobox
            value={margenFilter}
            onChange={setMargenFilter}
            options={[
              { id: 'high', label: 'Margen ≥ 30%' },
              { id: 'mid', label: 'Margen 10–30%' },
              { id: 'low', label: 'Margen < 10%' },
              { id: 'sinprecio', label: 'Sin precio' },
            ]}
            placeholder="Margen"
            searchPlaceholder="Buscar..."
            clearLabel="Todos"
            className="w-40"
          />

          <FilterCombobox
            value={activoFilter}
            onChange={setActivoFilter}
            options={[
              { id: 'true', label: 'Solo Activos' },
              { id: 'false', label: 'Solo Inactivos' },
            ]}
            placeholder="Activos"
            searchPlaceholder="Buscar..."
            clearLabel="Todos (Activos)"
            className="w-40"
          />

          <Button
            variant={sinMovimientoFilter ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSinMovimientoFilter((v) => !v)}
            className="h-9"
          >
            Sin movimiento &gt;30d
          </Button>

          <Button
            variant={sinCategoriaFilter ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSinCategoriaFilter((v) => !v)}
            className="h-9"
          >
            Sin categoría
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={() => void fetchProductos()}
            aria-label="Actualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Table */}
        <DataTable<Producto>
          data={filtered}
          columns={productoColumns(now, openDrawer)}
          rowKey="id"
          loading={loading}
          onRowClick={openDrawer}
          initialSort={{ key: 'nombre', dir: 'asc' }}
          emptyTitle="No se encontraron productos"
          showDensityToggle={false}
        />

        {/* Detail/Config Drawer */}
        <DetailDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          size="md"
          title="Configurar Producto"
          description="Ajusta categoría, tipo, reglas de inventario y receta de insumos."
        >
          {selectedProducto && (
            <DetailDrawerContent>
              <div className="space-y-6">
                <div className="rounded-lg border bg-muted/30 p-4 space-y-1">
                  <div className="font-semibold text-lg">{selectedProducto.nombre}</div>
                  <div className="text-sm text-muted-foreground">
                    {selectedProducto.codigo && (
                      <>
                        Código <span className="font-mono">{selectedProducto.codigo}</span> ·{' '}
                      </>
                    )}
                    Precio: {formatCurrency(selectedProducto.ultimo_precio_venta)} · Costo:{' '}
                    {formatCurrency(selectedProducto.ultimo_costo)} ·{' '}
                    {selectedProducto.unidad || 'pieza'}
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <MargenBadge pct={selectedProducto.margen_pct} />
                    {selectedProducto.inventariable && (
                      <span className="text-xs text-muted-foreground">
                        Stock: {formatNumber(selectedProducto.stock_actual, { decimals: 0 })}
                      </span>
                    )}
                    <UltimaVentaCell at={selectedProducto.ultima_venta_at} now={now} />
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Inventariable Toggle */}
                  <div className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                    <div className="space-y-0.5">
                      <label className="text-base font-medium leading-none">Es inventariable</label>
                      <p className="text-sm text-muted-foreground">
                        Actívalo para llevar control de stock y kardex en RDB. Apágalo para
                        servicios, rentas, cortesías.
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={formInventariable}
                        onChange={(e) => setFormInventariable(e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>

                  {/* Tipo */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">Tipo</label>
                    <Combobox
                      value={formTipo || 'producto'}
                      onChange={(v) => setFormTipo(v || 'producto')}
                      options={[
                        { value: 'producto', label: 'Producto' },
                        { value: 'servicio', label: 'Servicio' },
                        { value: 'insumo', label: 'Insumo' },
                        { value: 'refaccion', label: 'Refacción' },
                      ]}
                      placeholder="Seleccionar tipo..."
                    />
                  </div>

                  {/* Unidad */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">Unidad</label>
                    <Combobox
                      value={formUnidad || UNIDAD_DEFAULT}
                      onChange={(v) => setFormUnidad(v || UNIDAD_DEFAULT)}
                      options={unidadOptions(formUnidad)}
                      placeholder="Seleccionar unidad..."
                    />
                  </div>

                  {/* Contenido de la presentación (insumos fraccionables) */}
                  {formInventariable && (
                    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                      <label className="text-sm font-medium leading-none">
                        Contenido por {formUnidad || 'unidad'}
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Si en las recetas este producto se consume fraccionado (ej. mililitros de
                        una botella), indica cuánto rinde 1 {formUnidad || 'unidad'}. Déjalo vacío
                        si se consume entero.
                      </p>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={formContenido}
                          onChange={(e) => setFormContenido(e.target.value)}
                          placeholder="980"
                          className="w-28 text-right"
                          aria-label="Contenido por unidad de compra"
                        />
                        <Combobox
                          value={formUnidadBase}
                          onChange={(v) => setFormUnidadBase(v)}
                          options={unidadOptions(formUnidadBase)}
                          placeholder="Unidad de consumo…"
                          className="flex-1"
                        />
                      </div>
                      {formContenido.trim() !== '' && formUnidadBase.trim() !== '' && (
                        <p className="text-xs text-emerald-700">
                          1 {formUnidad || 'unidad'} = {formContenido} {formUnidadBase}. Las recetas
                          en {formUnidadBase} descontarán la fracción correcta.
                        </p>
                      )}
                      {(() => {
                        const r = rendimientoServir(Number(formContenido), formUnidadBase);
                        if (!r) return null;
                        return (
                          <p className="text-xs font-medium text-muted-foreground">
                            Rinde: {formatNumber(r.onzas, { decimals: 0 })} oz ·{' '}
                            {formatNumber(r.copas, { decimals: 0 })} copas
                          </p>
                        );
                      })()}
                    </div>
                  )}

                  {/* Categoría */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">Categoría</label>
                    <Combobox
                      value={formCategoriaId}
                      onChange={(v) => setFormCategoriaId(v)}
                      options={categorias.map((c) => ({ value: c.id, label: c.nombre }))}
                      placeholder="Sin categoría"
                    />
                  </div>
                </div>

                {/* Receta */}
                <div className="space-y-3 border-t pt-4">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      Receta (insumos por venta)
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Por cada venta de este producto, se descontarán estos insumos del inventario.
                    </p>
                  </div>

                  {recetaLoading ? (
                    <Skeleton className="h-20 w-full" />
                  ) : (
                    <>
                      {recetaRows.length === 0 && (
                        <div className="text-sm italic text-muted-foreground">
                          Sin receta. Las ventas de este producto no descontarán inventario.
                        </div>
                      )}

                      {recetaRows.map((row, idx) => {
                        const factor = factorRecetaAStock(row.unidad, {
                          unidad: row.insumo_unidad,
                          unidadBase: row.insumo_unidad_base,
                          contenido: row.insumo_contenido,
                        });
                        const stockUnidad = row.insumo_unidad ?? 'unidad';
                        return (
                          <div key={row.id ?? `new-${idx}`} className="space-y-1">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 truncate text-sm">{row.insumo_nombre}</div>
                              <Input
                                type="number"
                                step="0.0001"
                                min="0"
                                value={row.cantidad}
                                onChange={(e) => {
                                  const v = parseFloat(e.target.value);
                                  setRecetaRows((rows) =>
                                    rows.map((r, i) =>
                                      i === idx ? { ...r, cantidad: Number.isFinite(v) ? v : 0 } : r
                                    )
                                  );
                                }}
                                className="w-24 text-right"
                                aria-label={`Cantidad de ${row.insumo_nombre}`}
                              />
                              <Combobox
                                value={row.unidad}
                                onChange={(v) =>
                                  setRecetaRows((rows) =>
                                    rows.map((r, i) => (i === idx ? { ...r, unidad: v } : r))
                                  )
                                }
                                options={unidadOptions(row.unidad)}
                                className="w-32"
                                size="sm"
                                aria-label={`Unidad de ${row.insumo_nombre}`}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() =>
                                  setRecetaRows((rows) => rows.filter((_, i) => i !== idx))
                                }
                                aria-label={`Quitar ${row.insumo_nombre}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="pl-1 text-xs">
                              {factor === null ? (
                                <span className="text-amber-600">
                                  ⚠ Sin conversión a «{stockUnidad}». Configura el contenido de «
                                  {row.insumo_nombre}» para que descuente bien.
                                </span>
                              ) : (
                                <span className="text-muted-foreground">
                                  Descuenta {formatNumber(row.cantidad * factor, { decimals: 4 })}{' '}
                                  {stockUnidad} por venta
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      <div className="flex items-center gap-2 border-t pt-2">
                        <Combobox
                          value={insumoToAdd}
                          onChange={(insumo_id) => {
                            if (!insumo_id) return;
                            const ins = insumosDisponibles.find((i) => i.id === insumo_id);
                            if (!ins) return;
                            if (recetaRows.some((r) => r.insumo_id === insumo_id)) return;
                            if (ins.id === selectedProducto.id) return;
                            setRecetaRows((rows) => [
                              ...rows,
                              {
                                insumo_id: ins.id,
                                insumo_nombre: ins.nombre,
                                cantidad: 1,
                                unidad: ins.unidad,
                                insumo_unidad: ins.unidad,
                                insumo_contenido: ins.contenido,
                                insumo_unidad_base: ins.unidad_base,
                              },
                            ]);
                            setInsumoToAdd('');
                          }}
                          options={insumosDisponibles
                            .filter(
                              (i) =>
                                i.id !== selectedProducto.id &&
                                !recetaRows.some((r) => r.insumo_id === i.id)
                            )
                            .map((i) => ({ value: i.id, label: i.nombre }))}
                          placeholder="+ Agregar insumo…"
                          className="flex-1"
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="flex justify-end pt-6 border-t">
                  <Button onClick={handleSave} disabled={saving} className="gap-2">
                    {saving ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Guardar Configuración
                  </Button>
                </div>
              </div>
            </DetailDrawerContent>
          )}
        </DetailDrawer>

        {/* Create Producto Drawer */}
        <DetailDrawer
          open={createDrawerOpen}
          onOpenChange={setCreateDrawerOpen}
          size="md"
          title="Nuevo Producto"
          description="Da de alta un producto o insumo manualmente (ej. para Órdenes de Compra o almacén interno)."
        >
          <DetailDrawerContent>
            <div className="mt-8 space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Nombre</label>
                  <Input
                    value={newNombre}
                    onChange={(e) => setNewNombre(e.target.value)}
                    placeholder="Ej. Servilletas de barra"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Precio (Opcional)</label>
                  <Input
                    type="number"
                    value={newPrecio}
                    onChange={(e) => setNewPrecio(e.target.value)}
                    placeholder="0"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Tipo</label>
                  <Combobox
                    value={newTipo || 'producto'}
                    onChange={(v) => setNewTipo(v || 'producto')}
                    options={[
                      { value: 'producto', label: 'Producto' },
                      { value: 'servicio', label: 'Servicio' },
                      { value: 'insumo', label: 'Insumo' },
                      { value: 'refaccion', label: 'Refacción' },
                    ]}
                    placeholder="Seleccionar tipo..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Unidad</label>
                  <Combobox
                    value={newUnidad || UNIDAD_DEFAULT}
                    onChange={(v) => setNewUnidad(v || UNIDAD_DEFAULT)}
                    options={unidadOptions()}
                    placeholder="Seleccionar unidad..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Categoría</label>
                  <Combobox
                    value={newCategoriaId}
                    onChange={setNewCategoriaId}
                    options={categorias.map((c) => ({ value: c.id, label: c.nombre }))}
                    placeholder="Sin categoría"
                  />
                </div>

                {/* Inventariable Toggle */}
                <div className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <label className="text-base font-medium leading-none">Es inventariable</label>
                    <p className="text-sm text-muted-foreground">
                      Actívalo si lo contarás en stock.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={newInventariable}
                      onChange={(e) => setNewInventariable(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
              </div>

              <div className="flex justify-end pt-6 border-t">
                <Button onClick={handleCreate} disabled={creating} className="gap-2">
                  {creating ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Crear Producto
                </Button>
              </div>
            </div>
          </DetailDrawerContent>
        </DetailDrawer>
      </div>
    </RequireAccess>
  );
}
