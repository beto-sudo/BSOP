'use client';

import { RequireAccess } from '@/components/require-access';
import { useCallback, useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableHead } from '@/components/ui/sortable-head';
import { useSortableTable } from '@/hooks/use-sortable-table';
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
import { Package, RefreshCw, Search, Tag, Box, Settings2, Save } from 'lucide-react';

const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

// ─── Types ────────────────────────────────────────────────────────────────────

type Producto = {
  id: string;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  precio: number;
  categoria: string | null;
  activo: boolean;
  unidad: string | null;
  created_at: string | null;
  updated_at: string | null;
  inventariable: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number | null | undefined) {
  if (amount == null) return '—';
  return amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [categoriaFilter, setCategoriaFilter] = useState('all');
  const [activoFilter, setActivoFilter] = useState('all');
  const [inventariableFilter, setInventariableFilter] = useState('all');

  const [selectedProducto, setSelectedProducto] = useState<Producto | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form State
  const [formCategoria, setFormCategoria] = useState('');
  const [formInventariable, setFormInventariable] = useState(false);

  // Create Form State
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [newNombre, setNewNombre] = useState('');
  const [newPrecio, setNewPrecio] = useState('0');
  const [newCategoria, setNewCategoria] = useState('');
  const [newInventariable, setNewInventariable] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchProductos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: err } = await supabase
        .schema('erp')
        .from('productos')
        .select(
          'id, codigo, nombre, descripcion, tipo, activo, unidad, inventariable, created_at, updated_at, productos_precios(precio_venta)'
        )
        .eq('empresa_id', RDB_EMPRESA_ID)
        .order('nombre');
      if (err) throw err;
      const mapped: Producto[] = (data ?? []).map((p) => {
        const precios = p.productos_precios as { precio_venta: number | null }[] | null;
        return {
          id: p.id,
          codigo: p.codigo ?? null,
          nombre: p.nombre,
          descripcion: p.descripcion ?? null,
          precio: precios?.[0]?.precio_venta ?? 0,
          categoria: p.tipo ?? null,
          activo: p.activo,
          unidad: p.unidad ?? null,
          created_at: p.created_at ?? null,
          updated_at: p.updated_at ?? null,
          inventariable: p.inventariable,
        };
      });
      setProductos(mapped);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar productos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProductos();
  }, [fetchProductos]);

  const openDrawer = (p: Producto) => {
    setSelectedProducto(p);
    setFormCategoria(p.categoria || '');
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
          tipo: formCategoria.trim() || 'producto',
          inventariable: formInventariable,
          updated_at: new Date().toISOString(),
        })
        .eq('empresa_id', RDB_EMPRESA_ID)
        .eq('id', selectedProducto.id);

      if (err) throw err;

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
          tipo: newCategoria.trim() || 'producto',
          inventariable: newInventariable,
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
      setNewCategoria('');
      setNewInventariable(true);
      void fetchProductos();
    } catch (e) {
      console.error(e);
      alert('Error al crear el producto');
    } finally {
      setCreating(false);
    }
  };

  const categorias = Array.from(
    new Set(productos.map((p) => p.categoria).filter((c): c is string => !!c))
  ).sort();

  const filtered = productos.filter((p) => {
    if (activoFilter !== 'all' && String(p.activo) !== activoFilter) return false;
    if (categoriaFilter !== 'all' && p.categoria !== categoriaFilter) return false;
    if (inventariableFilter !== 'all' && String(p.inventariable ?? true) !== inventariableFilter)
      return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.nombre.toLowerCase().includes(q) ||
      (p.categoria ?? '').toLowerCase().includes(q) ||
      (p.descripcion ?? '').toLowerCase().includes(q)
    );
  });

  const { sortKey, sortDir, onSort, sortData } = useSortableTable<Producto>('nombre', 'asc');
  return (
    <RequireAccess empresa="rdb" modulo="rdb.productos">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
            <p className="text-sm text-muted-foreground">Catálogo de productos y servicios</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              Total: <span className="font-semibold text-foreground">{filtered.length}</span>
            </div>
            <Button onClick={() => setCreateDrawerOpen(true)}>+ Nuevo Producto</Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-52">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o categoría…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <FilterCombobox
            value={categoriaFilter}
            onChange={setCategoriaFilter}
            options={categorias.map((cat) => ({ id: cat, label: cat }))}
            placeholder="Categoría"
            searchPlaceholder="Buscar categoría..."
            clearLabel="Todas las categorías"
            className="w-44"
          />

          <FilterCombobox
            value={inventariableFilter}
            onChange={setInventariableFilter}
            options={[
              { id: 'true', label: 'Inventariable' },
              { id: 'false', label: 'Servicio / Varios' },
            ]}
            placeholder="Tipo"
            searchPlaceholder="Buscar tipo..."
            clearLabel="Todos los tipos"
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
            className="w-36"
          />

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
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  sortKey="nombre"
                  label="Nombre"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
                <SortableHead
                  sortKey="tipo"
                  label="Tipo"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
                <SortableHead
                  sortKey="categoria"
                  label="Categoría"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
                <SortableHead
                  sortKey="precio"
                  label="Precio"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="text-right"
                />
                <SortableHead
                  sortKey="activo"
                  label="Estado"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    No se encontraron productos.
                  </TableCell>
                </TableRow>
              ) : (
                sortData(filtered).map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openDrawer(p)}
                  >
                    <TableCell>
                      <div className="font-medium">{p.nombre}</div>
                      {p.descripcion && (
                        <div className="text-xs text-muted-foreground">{p.descripcion}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {(p.inventariable ?? true) ? (
                        <Badge
                          variant="outline"
                          className="text-emerald-600 border-emerald-200 bg-emerald-50"
                        >
                          Producto
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-blue-600 border-blue-200 bg-blue-50"
                        >
                          Servicio
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.categoria ?? '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(p.precio)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.activo ? 'default' : 'secondary'}>
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDrawer(p);
                        }}
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Detail/Config Drawer */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent className="sm:max-w-[600px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Configurar Producto</SheetTitle>
              <SheetDescription>
                Ajusta las reglas de inventario, agrupaciones y categorías.
              </SheetDescription>
            </SheetHeader>

            {selectedProducto && (
              <div className="mt-8 space-y-6">
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="font-semibold text-lg">{selectedProducto.nombre}</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Precio: {formatCurrency(selectedProducto.precio)} •{' '}
                    {selectedProducto.unidad || 'pieza'}
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Inventariable Toggle */}
                  <div className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                    <div className="space-y-0.5">
                      <label className="text-base font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Es inventariable
                      </label>
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

                  {/* Tipo / Categoría */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Tipo
                    </label>
                    <Combobox
                      value={formCategoria || 'producto'}
                      onChange={(v) => setFormCategoria(v || 'producto')}
                      options={[
                        { value: 'producto', label: 'Producto' },
                        { value: 'servicio', label: 'Servicio' },
                        { value: 'insumo', label: 'Insumo' },
                        { value: 'refaccion', label: 'Refacción' },
                      ]}
                      placeholder="Seleccionar tipo..."
                    />
                  </div>
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
                    value={newCategoria || 'producto'}
                    onChange={(v) => setNewCategoria(v || 'producto')}
                    options={[
                      { value: 'producto', label: 'Producto' },
                      { value: 'servicio', label: 'Servicio' },
                      { value: 'insumo', label: 'Insumo' },
                      { value: 'refaccion', label: 'Refacción' },
                    ]}
                    placeholder="Seleccionar tipo..."
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
