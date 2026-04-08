'use client';

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
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Package, RefreshCw, Search, Tag, Box, Settings2, Save } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Producto = {
  id: string;
  waitry_item_id: number | null;
  nombre: string;
  descripcion: string | null;
  precio: number;
  categoria: string | null;
  activo: boolean;
  unidad: string | null;
  stock_minimo: number | null;
  created_at: string | null;
  updated_at: string | null;
  inventariable: boolean;
  parent_id: string | null;
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
  const [formParentId, setFormParentId] = useState<string>('none');

  const fetchProductos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: err } = await supabase
        .schema('rdb')
        .from('productos')
        .select('*')
        .order('nombre');
      if (err) throw err;
      setProductos(data ?? []);
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
    setFormParentId(p.parent_id || 'none');
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!selectedProducto) return;
    setSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: err } = await supabase
        .schema('rdb')
        .from('productos')
        .update({
          categoria: formCategoria.trim() || null,
          inventariable: formInventariable,
          parent_id: formParentId === 'none' ? null : formParentId,
          updated_at: new Date().toISOString(),
        })
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

  const categorias = Array.from(
    new Set(productos.map((p) => p.categoria).filter((c): c is string => !!c)),
  ).sort();

  const filtered = productos.filter((p) => {
    if (activoFilter !== 'all' && String(p.activo) !== activoFilter) return false;
    if (categoriaFilter !== 'all' && p.categoria !== categoriaFilter) return false;
    if (inventariableFilter !== 'all' && String(p.inventariable ?? true) !== inventariableFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.nombre.toLowerCase().includes(q) ||
      (p.categoria ?? '').toLowerCase().includes(q) ||
      (p.descripcion ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
          <p className="text-sm text-muted-foreground">Catálogo de productos y servicios</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-muted-foreground">
             Total: <span className="font-semibold text-foreground">{filtered.length}</span>
          </div>
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

        <Select value={categoriaFilter} onValueChange={(v) => setCategoriaFilter(v ?? 'all')}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categorias.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={inventariableFilter} onValueChange={(v) => setInventariableFilter(v ?? 'all')}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="true">Inventariable</SelectItem>
            <SelectItem value="false">Servicio / Varios</SelectItem>
          </SelectContent>
        </Select>

        <Select value={activoFilter} onValueChange={(v) => setActivoFilter(v ?? 'all')}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos (Activos)</SelectItem>
            <SelectItem value="true">Solo Activos</SelectItem>
            <SelectItem value="false">Solo Inactivos</SelectItem>
          </SelectContent>
        </Select>

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
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead>Padre</TableHead>
              <TableHead>Estado</TableHead>
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
              filtered.map((p) => {
                const parent = p.parent_id ? productos.find(x => x.id === p.parent_id) : null;
                return (
                <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDrawer(p)}>
                  <TableCell>
                    <div className="font-medium">{p.nombre}</div>
                    {p.descripcion && (
                      <div className="text-xs text-muted-foreground">{p.descripcion}</div>
                    )}
                  </TableCell>
                  <TableCell>
                     {p.inventariable ?? true ? (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">Producto</Badge>
                     ) : (
                        <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">Servicio</Badge>
                     )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.categoria ?? '—'}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(p.precio)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {parent ? parent.nombre : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.activo ? 'default' : 'secondary'}>
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={(e) => { e.stopPropagation(); openDrawer(p); }}>
                       <Settings2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );})
            )}
          </TableBody>
        </Table>
      </div>

      {/* Detail/Config Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="sm:max-w-[600px]">
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
                    Precio: {formatCurrency(selectedProducto.precio)} • {selectedProducto.unidad || 'pieza'}
                 </div>
              </div>

              <div className="space-y-4">
                 
                 {/* Inventariable Toggle */}
                 <div className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                    <div className="space-y-0.5">
                       <label className="text-base font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Es inventariable</label>
                       <p className="text-sm text-muted-foreground">
                          Actívalo para llevar control de stock y kardex en RDB.
                          Apágalo para servicios, rentas, cortesías.
                       </p>
                    </div>
                    <div className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={formInventariable}
                        onChange={(e) => setFormInventariable(e.target.checked)} 
                      />
                      <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </div>
                 </div>

                 {/* Categoria */}
                 <div className="space-y-2">
                    <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70" htmlFor="cat">Categoría</label>
                    <Input
                       id="cat"
                       placeholder="Ej. Cervezas, Snacks, Servicios..."
                       value={formCategoria}
                       onChange={(e) => setFormCategoria(e.target.value)}
                    />
                 </div>

                 {/* Producto Padre (Anidar) */}
                 <div className="space-y-2">
                    <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Producto Padre (Agrupador)</label>
                    <p className="text-sm text-muted-foreground mb-2">
                       Si este producto es una variante o sabor, selecciona su producto principal.
                    </p>
                    <Select value={formParentId} onValueChange={(v) => setFormParentId(v ?? 'none')}>
                       <SelectTrigger>
                          <SelectValue placeholder="Seleccionar producto padre..." />
                       </SelectTrigger>
                       <SelectContent>
                          <SelectItem value="none" className="italic text-muted-foreground">Ninguno (Es producto raíz)</SelectItem>
                          {productos
                             .filter(p => p.id !== selectedProducto.id) // Cannot be parent of itself
                             .map(p => (
                             <SelectItem key={p.id} value={p.id}>
                                {p.nombre}
                             </SelectItem>
                          ))}
                       </SelectContent>
                    </Select>
                 </div>

              </div>

              <div className="flex justify-end pt-6 border-t">
                 <Button onClick={handleSave} disabled={saving} className="gap-2">
                    {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Guardar Configuración
                 </Button>
              </div>

            </div>
          )}
        </SheetContent>
      </Sheet>

    </div>
  );
}
