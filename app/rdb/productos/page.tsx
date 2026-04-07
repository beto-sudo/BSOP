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
import { Package, RefreshCw, Search, Tag, Box } from 'lucide-react';

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
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number | null | undefined) {
  if (amount == null) return '—';
  return amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

// ─── Summary Bar ──────────────────────────────────────────────────────────────

function SummaryBar({ productos }: { productos: Producto[] }) {
  const activos = productos.filter((p) => p.activo).length;
  const categorias = new Set(productos.map((p) => p.categoria).filter(Boolean)).size;

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Package className="h-3.5 w-3.5" />
          Total
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{productos.length}</div>
      </div>
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Box className="h-3.5 w-3.5" />
          Activos
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{activos}</div>
      </div>
      <div className="rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Tag className="h-3.5 w-3.5" />
          Categorías
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{categorias}</div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoriaFilter, setCategoriaFilter] = useState('all');
  const [activoFilter, setActivoFilter] = useState('all');

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

  const categorias = Array.from(
    new Set(productos.map((p) => p.categoria).filter((c): c is string => !!c)),
  ).sort();

  const filtered = productos.filter((p) => {
    if (activoFilter !== 'all' && String(p.activo) !== activoFilter) return false;
    if (categoriaFilter !== 'all' && p.categoria !== categoriaFilter) return false;
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
        <p className="text-sm text-muted-foreground">Catálogo de productos del restaurante</p>
      </div>

      {/* Summary */}
      {!loading && !error && <SummaryBar productos={filtered} />}

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

        <Select value={activoFilter} onValueChange={(v) => setActivoFilter(v ?? 'all')}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="true">Activos</SelectItem>
            <SelectItem value="false">Inactivos</SelectItem>
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

        <span className="text-sm text-muted-foreground">
          {loading ? 'Cargando…' : `${filtered.length} producto${filtered.length !== 1 ? 's' : ''}`}
        </span>
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
              <TableHead>Categoría</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-right">Stock Mín.</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                  No se encontraron productos.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.nombre}</div>
                    {p.descripcion && (
                      <div className="text-xs text-muted-foreground">{p.descripcion}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.categoria ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.unidad ?? 'pieza'}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(p.precio)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                    {p.stock_minimo ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.activo ? 'default' : 'secondary'}>
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
