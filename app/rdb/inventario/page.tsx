'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  Plus,
  Printer,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  ModuleKpiStrip,
  ModuleFilters,
  ModuleContent,
  EmptyState,
  TableSkeleton,
  ErrorBanner,
  ActiveFiltersChip,
} from '@/components/module-page';
import { CategoryFilterStrip } from '@/components/inventario/category-filter-strip';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { SortableHead } from '@/components/ui/sortable-head';
import { useSortableTable } from '@/hooks/use-sortable-table';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { Combobox } from '@/components/ui/combobox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StockDetailDrawer } from '@/components/inventario/stock-detail-drawer';
import { RegistrarMovimientoDialog } from '@/components/inventario/registrar-movimiento-dialog';
import { printStockList } from '@/components/inventario/print-stock-list';
import { type StockItem } from '@/components/inventario/types';
import { computeStockStats, formatCurrency } from '@/components/inventario/utils';

const FILTER_DEFAULTS = {
  search: '',
  showServicios: false,
  showBajoMinimo: false,
  categoriaFiltro: '',
  clasificacionFiltro: '',
  fechaCorte: '',
};

/**
 * Inventario · tab "Stock" (default landing del módulo).
 *
 * Layout (ADR-005, `docs/adr/005_module_with_submodules_routed_tabs.md`)
 * vive en `app/rdb/inventario/layout.tsx` y provee `<ModulePage>`,
 * `<ModuleHeader>`, `<RoutedModuleTabs>` y `<RequireAccess>`. Esta página
 * solo aporta el contenido específico de Stock (KPIs, filtros, tabla,
 * drawer de detalle, dialog de registrar movimiento).
 */
export default function InventarioStockPage() {
  // Stock state
  const [items, setItems] = useState<StockItem[]>([]);
  const [loadingStock, setLoadingStock] = useState(true);
  const [errorStock, setErrorStock] = useState<string | null>(null);
  const { sortKey, sortDir, onSort, sortData } = useSortableTable('nombre', 'asc');

  // URL-synced filters
  const { filters, setFilter, clearAll, activeCount } = useUrlFilters(FILTER_DEFAULTS);
  const {
    search,
    showServicios,
    showBajoMinimo,
    categoriaFiltro,
    clasificacionFiltro,
    fechaCorte,
  } = filters;

  // UI-only state (drawers / dialogs are not URL-synced)
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchStock = useCallback(async () => {
    setLoadingStock(true);
    setErrorStock(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .schema('rdb')
        .from('v_inventario_stock')
        .select('*')
        .order('nombre');
      if (error) throw error;
      setItems((data ?? []) as StockItem[]);
    } catch (e: unknown) {
      setErrorStock(e instanceof Error ? e.message : 'Error al cargar inventario');
    } finally {
      setLoadingStock(false);
    }
  }, []);

  const fetchStockHistorico = useCallback(async (dateStr: string) => {
    setLoadingStock(true);
    setErrorStock(null);
    try {
      const supabase = createSupabaseBrowserClient();
      // Fin del día en UTC para la fecha seleccionada (sin conversión timezone)
      const p_fecha = `${dateStr}T23:59:59.999Z`;
      const { data, error } = await supabase
        .schema('rdb')
        .rpc('fn_inventario_al_corte', { p_fecha });
      if (error) throw error;
      setItems((data ?? []) as StockItem[]);
    } catch (e: unknown) {
      setErrorStock(e instanceof Error ? e.message : 'Error al cargar inventario histórico');
    } finally {
      setLoadingStock(false);
    }
  }, []);

  useEffect(() => {
    if (fechaCorte) void fetchStockHistorico(fechaCorte);
    else void fetchStock();
  }, [fechaCorte, fetchStock, fetchStockHistorico]);

  const handleRefresh = () => {
    if (fechaCorte) void fetchStockHistorico(fechaCorte);
    else void fetchStock();
  };

  const handleSuccess = () => {
    void fetchStock();
  };

  const fechaLabel = useMemo(
    () =>
      fechaCorte
        ? new Date(fechaCorte + 'T12:00:00').toLocaleDateString('es-MX', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })
        : null,
    [fechaCorte]
  );

  const filteredStock = items.filter((i) => {
    if (showServicios && i.inventariable) return false;
    if (!showServicios && !i.inventariable) return false;
    if (showBajoMinimo && !i.bajo_minimo) return false;
    if (categoriaFiltro && i.categoria !== categoriaFiltro) return false;
    if (clasificacionFiltro && i.clasificacion !== clasificacionFiltro) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return i.nombre.toLowerCase().includes(q) || (i.categoria ?? '').toLowerCase().includes(q);
  });

  return (
    <>
      {!loadingStock &&
        !errorStock &&
        (() => {
          const s = computeStockStats(filteredStock);
          return (
            <ModuleKpiStrip
              stats={[
                {
                  key: 'productos',
                  label: 'Productos',
                  value: s.productos,
                  icon: <Boxes className="h-3.5 w-3.5" />,
                },
                {
                  key: 'bajo',
                  label: 'Bajo mínimo',
                  value: s.bajosMinimo,
                  icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />,
                  valueClassName: s.bajosMinimo > 0 ? 'text-amber-500' : '',
                },
                {
                  key: 'sin',
                  label: 'Sin stock',
                  value: s.sinStock,
                  icon: <TrendingDown className="h-3.5 w-3.5 text-destructive" />,
                  valueClassName: s.sinStock > 0 ? 'text-destructive' : '',
                },
                {
                  key: 'valor',
                  label: 'Valor Inventario',
                  value: formatCurrency(s.totalValue),
                  icon: <TrendingUp className="h-3.5 w-3.5" />,
                },
              ]}
            />
          );
        })()}

      {!loadingStock && !errorStock && (
        <CategoryFilterStrip
          items={filteredStock}
          activeCategory={categoriaFiltro}
          onSelect={(value) => setFilter('categoriaFiltro', value)}
        />
      )}

      <ModuleFilters
        count={
          loadingStock
            ? 'Cargando…'
            : `${filteredStock.length} producto${filteredStock.length !== 1 ? 's' : ''}`
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => printStockList(filteredStock, fechaCorte || null)}
              className="gap-2"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir lista
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="h-3.5 w-3.5" />
              Registrar Movimiento
            </Button>
          </div>
        }
      >
        <div className="relative min-w-52">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar producto…"
            value={search}
            onChange={(e) => setFilter('search', e.target.value)}
            className="pl-9"
          />
        </div>

        <Button
          variant={showServicios ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('showServicios', !showServicios)}
          className="gap-2"
        >
          <Boxes className="h-3.5 w-3.5" />
          Ver no inventariables
        </Button>

        <Button
          variant={showBajoMinimo ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('showBajoMinimo', !showBajoMinimo)}
          className="gap-2"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Solo bajo mínimo
        </Button>

        <Combobox
          value={categoriaFiltro}
          onChange={(value) => setFilter('categoriaFiltro', value ?? '')}
          options={[
            'Alimentos',
            'Bebidas',
            'Licores',
            'Artículos',
            'Deportes',
            'Consumibles',
            'Propinas',
          ].map((c) => ({ value: c, label: c }))}
          placeholder="Categoría"
          allowClear
          size="sm"
          className="w-40"
        />

        <Combobox
          value={clasificacionFiltro}
          onChange={(value) => setFilter('clasificacionFiltro', value ?? '')}
          options={['inventariable', 'consumible', 'merchandising', 'activo_fijo'].map((c) => ({
            value: c,
            label: c,
          }))}
          placeholder="Clasificación"
          allowClear
          size="sm"
          className="w-40"
        />

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Al corte:</span>
          <input
            type="date"
            max={new Date().toISOString().split('T')[0]}
            value={fechaCorte}
            onChange={(e) => setFilter('fechaCorte', e.target.value)}
            className="rounded-md border border-input bg-transparent px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {fechaCorte && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilter('fechaCorte', '')}
              className="text-xs h-7 px-2"
            >
              × Hoy
            </Button>
          )}
        </div>

        <ActiveFiltersChip count={activeCount} onClearAll={clearAll} />

        <Button variant="outline" size="icon" onClick={handleRefresh} aria-label="Actualizar">
          <RefreshCw className={`h-4 w-4 ${loadingStock ? 'animate-spin' : ''}`} />
        </Button>
      </ModuleFilters>

      {errorStock && <ErrorBanner error={errorStock} onRetry={handleRefresh} />}

      {fechaCorte && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-600 dark:text-blue-400">
          <span>📅</span>
          <span>Inventario al cierre del {fechaLabel} — solo movimientos hasta esa fecha</span>
        </div>
      )}

      <ModuleContent>
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  sortKey="nombre"
                  label="Producto"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
                <SortableHead
                  sortKey="clasificacion"
                  label="Clasif."
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
                  sortKey="stock_actual"
                  label="Stock Actual"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="text-right"
                />
                <SortableHead
                  sortKey="stock_minimo"
                  label="Mínimo"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="text-right"
                />
                <SortableHead
                  sortKey="ultimo_costo"
                  label="Último Costo"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="text-right"
                />
                <SortableHead
                  sortKey="valor_inventario"
                  label="Valor Total"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                  className="text-right"
                />
                <SortableHead
                  sortKey="bajo_minimo"
                  label="Estado"
                  currentSort={sortKey}
                  currentDir={sortDir}
                  onSort={onSort}
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingStock ? (
                <TableSkeleton rows={8} columns={8} />
              ) : filteredStock.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="p-0">
                    <EmptyState
                      icon={<Boxes className="h-8 w-8" />}
                      title={
                        activeCount > 0
                          ? 'Ningún producto coincide con los filtros'
                          : 'Aún no hay productos'
                      }
                      description={
                        activeCount > 0
                          ? 'Limpia los filtros para ver el inventario completo.'
                          : 'Registra el primer movimiento para que aparezca aquí.'
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                sortData(filteredStock).map((item) => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setSelectedItem(item);
                      setDrawerOpen(true);
                    }}
                  >
                    <TableCell>
                      <span className="font-medium">{item.nombre}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs font-normal">
                        {item.clasificacion ?? '—'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.categoria ?? '—'}
                    </TableCell>
                    <TableCell
                      className={[
                        'text-right font-semibold tabular-nums',
                        item.stock_actual <= 0
                          ? 'text-destructive'
                          : item.bajo_minimo
                            ? 'text-amber-500'
                            : '',
                      ].join(' ')}
                    >
                      {item.stock_actual} {item.unidad ?? 'pzs'}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {item.stock_minimo ?? '—'} {item.unidad ?? 'pzs'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(item.costo_unitario ?? item.ultimo_costo)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatCurrency(item.valor_inventario)}
                    </TableCell>
                    <TableCell>
                      {item.stock_actual <= 0 ? (
                        <Badge variant="destructive">Sin stock</Badge>
                      ) : item.bajo_minimo ? (
                        <Badge variant="outline" className="border-amber-500/50 text-amber-500">
                          Bajo mínimo
                        </Badge>
                      ) : (
                        <Badge variant="default">OK</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </ModuleContent>

      <StockDetailDrawer
        item={selectedItem}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      <RegistrarMovimientoDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        productos={items}
        onSuccess={handleSuccess}
      />
    </>
  );
}
