'use client';

import { RequireAccess } from '@/components/require-access';
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { RefreshCw, Search, Settings2, Save, X, BarChart3 } from 'lucide-react';
import { upsertReceta, updateCategoria } from './actions';

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
};

type InsumoDisponible = {
  id: string;
  nombre: string;
  unidad: string;
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

  const [selectedProducto, setSelectedProducto] = useState<Producto | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state (edit drawer)
  const [formTipo, setFormTipo] = useState('producto');
  const [formCategoriaId, setFormCategoriaId] = useState<string>('');
  const [formInventariable, setFormInventariable] = useState(false);

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
  const [newCategoriaId, setNewCategoriaId] = useState('');
  const [newInventariable, setNewInventariable] = useState(true);
  const [creating, setCreating] = useState(false);

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
        .select('id, insumo_id, cantidad, unidad, insumo:productos!insumo_id(nombre)')
        .eq('producto_venta_id', selectedProducto.id),
      supabase
        .schema('erp')
        .from('productos')
        .select('id, nombre, unidad')
        .eq('empresa_id', RDB_EMPRESA_ID)
        .eq('inventariable', true)
        .eq('activo', true)
        .is('deleted_at', null)
        .order('nombre'),
    ]).then(([rec, ins]) => {
      if (cancelled) return;
      if (rec.data) {
        setRecetaRows(
          rec.data.map((r) => {
            const insumo = r.insumo as { nombre?: string } | null;
            return {
              id: r.id,
              insumo_id: r.insumo_id,
              insumo_nombre: insumo?.nombre ?? '—',
              cantidad: Number(r.cantidad),
              unidad: r.unidad,
            };
          })
        );
      } else {
        setRecetaRows([]);
      }
      if (ins.data) {
        setInsumosDisponibles(
          ins.data.map((i) => ({ id: i.id, nombre: i.nombre, unidad: i.unidad ?? 'pieza' }))
        );
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
    setFormCategoriaId(p.categoria_id ?? '');
    setFormInventariable(p.inventariable ?? true);
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!selectedProducto) return;
    setSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: err } = await supabase
        .schema('erp')
        .from('productos')
        .update({
          tipo: formTipo.trim() || 'producto',
          inventariable: formInventariable,
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
    search,
    now,
  ]);

  return (
    <RequireAccess empresa="rdb" modulo="rdb.productos">
      <div className="space-y-6">
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
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent className="sm:max-w-[600px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Configurar Producto</SheetTitle>
              <SheetDescription>
                Ajusta categoría, tipo, reglas de inventario y receta de insumos.
              </SheetDescription>
            </SheetHeader>

            {selectedProducto && (
              <div className="mt-8 space-y-6">
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

                      {recetaRows.map((row, idx) => (
                        <div key={row.id ?? `new-${idx}`} className="flex items-center gap-2">
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
                          <div className="w-16 text-xs text-muted-foreground">{row.unidad}</div>
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
                      ))}

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
            )}
          </SheetContent>
        </Sheet>

        {/* Create Producto Drawer */}
        <Sheet open={createDrawerOpen} onOpenChange={setCreateDrawerOpen}>
          <SheetContent className="sm:max-w-[600px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Nuevo Producto</SheetTitle>
              <SheetDescription>
                Da de alta un producto o insumo manualmente (ej. para Órdenes de Compra o almacén
                interno).
              </SheetDescription>
            </SheetHeader>

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
          </SheetContent>
        </Sheet>
      </div>
    </RequireAccess>
  );
}
