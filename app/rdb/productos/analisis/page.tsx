'use client';

import { RequireAccess } from '@/components/require-access';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Download,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  Star,
  PieChart,
} from 'lucide-react';

const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

// ─── Types ────────────────────────────────────────────────────────────────────

type Metrica = {
  id: string;
  nombre: string;
  codigo: string | null;
  activo: boolean;
  inventariable: boolean;
  categoria_id: string | null;
  categoria_nombre: string | null;
  categoria_color: string | null;
  costo: number | null;
  precio_venta: number | null;
  margen_pct: number | null;
  stock_actual: number;
  valor_stock: number;
  unidades_30d: number;
  importe_30d: number;
  unidades_90d: number;
  importe_90d: number;
  ultima_venta_at: string | null;
  dias_sin_venta: number;
  utilidad_30d: number;
};

type CategoriaResumen = {
  categoria_id: string;
  categoria: string;
  color: string | null;
  orden: number;
  total_productos: number;
  productos_con_venta_30d: number;
  importe_total_30d: number;
  utilidad_total_30d: number;
  margen_promedio_pct: number | null;
  valor_stock_total: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number | null | undefined) {
  if (amount == null) return '—';
  return amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function formatCurrencyCompact(amount: number | null | undefined) {
  if (amount == null) return '—';
  if (Math.abs(amount) >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  if (Math.abs(amount) >= 1_000) return `$${(amount / 1_000).toFixed(1)}k`;
  return formatCurrency(amount);
}

function formatNumber(n: number | null | undefined, frac = 0) {
  if (n == null) return '—';
  return n.toLocaleString('es-MX', { minimumFractionDigits: frac, maximumFractionDigits: frac });
}

function formatDate(at: string | null) {
  if (!at) return 'Nunca';
  return new Date(at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
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

// CSV export — escapes commas, quotes, newlines.
function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const csv = [headers.join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'warn' | 'danger' | 'good';
}) {
  const toneCls =
    tone === 'good'
      ? 'border-emerald-200 bg-emerald-50/50'
      : tone === 'warn'
        ? 'border-amber-200 bg-amber-50/50'
        : tone === 'danger'
          ? 'border-red-200 bg-red-50/50'
          : 'border-border';
  return (
    <div className={`rounded-xl border ${toneCls} p-4`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
  onExport,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onExport?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          {icon}
          {title}
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      {onExport && (
        <Button variant="outline" size="sm" onClick={onExport} className="gap-2">
          <Download className="h-3.5 w-3.5" />
          CSV
        </Button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductosAnalisisPage() {
  const [metricas, setMetricas] = useState<Metrica[]>([]);
  const [categorias, setCategorias] = useState<CategoriaResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const [mRes, cRes] = await Promise.all([
        supabase.schema('rdb').from('v_producto_metricas').select('*'),
        supabase.schema('rdb').from('v_categoria_resumen').select('*'),
      ]);
      if (mRes.error) throw mRes.error;
      if (cRes.error) throw cRes.error;

      setMetricas(
        (mRes.data ?? []).map((r) => ({
          id: r.id as string,
          nombre: r.nombre as string,
          codigo: (r.codigo as string | null) ?? null,
          activo: r.activo as boolean,
          inventariable: r.inventariable as boolean,
          categoria_id: (r.categoria_id as string | null) ?? null,
          categoria_nombre: (r.categoria_nombre as string | null) ?? null,
          categoria_color: (r.categoria_color as string | null) ?? null,
          costo: r.costo == null ? null : Number(r.costo),
          precio_venta: r.precio_venta == null ? null : Number(r.precio_venta),
          margen_pct: r.margen_pct == null ? null : Number(r.margen_pct),
          stock_actual: Number(r.stock_actual ?? 0),
          valor_stock: Number(r.valor_stock ?? 0),
          unidades_30d: Number(r.unidades_30d ?? 0),
          importe_30d: Number(r.importe_30d ?? 0),
          unidades_90d: Number(r.unidades_90d ?? 0),
          importe_90d: Number(r.importe_90d ?? 0),
          ultima_venta_at: (r.ultima_venta_at as string | null) ?? null,
          dias_sin_venta: Number(r.dias_sin_venta ?? 9999),
          utilidad_30d: Number(r.utilidad_30d ?? 0),
        }))
      );

      setCategorias(
        (cRes.data ?? []).map((r) => ({
          categoria_id: r.categoria_id as string,
          categoria: r.categoria as string,
          color: (r.color as string | null) ?? null,
          orden: Number(r.orden ?? 0),
          total_productos: Number(r.total_productos ?? 0),
          productos_con_venta_30d: Number(r.productos_con_venta_30d ?? 0),
          importe_total_30d: Number(r.importe_total_30d ?? 0),
          utilidad_total_30d: Number(r.utilidad_total_30d ?? 0),
          margen_promedio_pct: r.margen_promedio_pct == null ? null : Number(r.margen_promedio_pct),
          valor_stock_total: Number(r.valor_stock_total ?? 0),
        }))
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar análisis');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ─── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const activas = metricas.filter((m) => m.activo);
    const ventas30d = activas.reduce((s, m) => s + m.importe_30d, 0);
    const utilidad30d = activas.reduce((s, m) => s + m.utilidad_30d, 0);
    const valorStock = activas.reduce((s, m) => s + m.valor_stock, 0);
    const sinMov = activas.filter((m) => m.dias_sin_venta > 30).length;
    const sinPrecio = activas.filter((m) => m.precio_venta === null || m.precio_venta === 0).length;
    const sinCosto = activas.filter((m) => m.costo === null || m.costo === 0).length;
    // Margen promedio ponderado por importe_30d
    const importeConMargen = activas.reduce(
      (s, m) => (m.margen_pct !== null ? s + m.importe_30d : s),
      0
    );
    const margenPond =
      importeConMargen > 0
        ? activas.reduce(
            (s, m) => (m.margen_pct !== null ? s + m.importe_30d * m.margen_pct : s),
            0
          ) / importeConMargen
        : null;

    return {
      totalActivos: activas.length,
      ventas30d,
      utilidad30d,
      valorStock,
      sinMov,
      sinPrecio,
      sinCosto,
      margenPond,
    };
  }, [metricas]);

  // ─── Sin movimiento + stock ────────────────────────────────────────────────
  const sinMovimiento = useMemo(
    () =>
      metricas
        .filter(
          (m) =>
            m.activo && m.inventariable && m.stock_actual > 0 && m.dias_sin_venta > 30
        )
        .sort((a, b) => b.valor_stock - a.valor_stock),
    [metricas]
  );

  // ─── Estrellas ─────────────────────────────────────────────────────────────
  const estrellas = useMemo(
    () =>
      metricas
        .filter(
          (m) =>
            m.activo &&
            m.unidades_30d >= 30 &&
            m.margen_pct !== null &&
            m.margen_pct >= 30
        )
        .sort((a, b) => b.utilidad_30d - a.utilidad_30d),
    [metricas]
  );

  // ─── Margen bajo + alta rotación ───────────────────────────────────────────
  const margenBajo = useMemo(
    () =>
      metricas
        .filter(
          (m) =>
            m.activo &&
            m.unidades_30d >= 30 &&
            m.margen_pct !== null &&
            m.margen_pct < 20
        )
        .sort((a, b) => b.unidades_30d - a.unidades_30d),
    [metricas]
  );

  // ─── Comparativa por categoría (max para barra %) ──────────────────────────
  const maxImporte = useMemo(
    () => Math.max(1, ...categorias.map((c) => c.importe_total_30d)),
    [categorias]
  );

  // ─── CSV exporters ─────────────────────────────────────────────────────────
  const exportSinMov = () =>
    downloadCsv(
      'sin-movimiento.csv',
      ['Producto', 'Categoría', 'Stock', 'Días sin venta', 'Valor en stock', 'Última venta'],
      sinMovimiento.map((m) => [
        m.nombre,
        m.categoria_nombre ?? '',
        m.stock_actual,
        m.dias_sin_venta === 9999 ? 'Nunca' : m.dias_sin_venta,
        m.valor_stock,
        m.ultima_venta_at ?? '',
      ])
    );

  const exportEstrellas = () =>
    downloadCsv(
      'estrellas.csv',
      [
        'Producto',
        'Categoría',
        'Unidades 30d',
        'Importe 30d',
        'Margen %',
        'Utilidad 30d',
        'Stock',
      ],
      estrellas.map((m) => [
        m.nombre,
        m.categoria_nombre ?? '',
        m.unidades_30d,
        m.importe_30d,
        m.margen_pct ?? '',
        m.utilidad_30d,
        m.stock_actual,
      ])
    );

  const exportMargenBajo = () =>
    downloadCsv(
      'margen-bajo.csv',
      [
        'Producto',
        'Categoría',
        'Unidades 30d',
        'Importe 30d',
        'Costo',
        'Precio',
        'Margen %',
        'Utilidad 30d',
      ],
      margenBajo.map((m) => [
        m.nombre,
        m.categoria_nombre ?? '',
        m.unidades_30d,
        m.importe_30d,
        m.costo ?? '',
        m.precio_venta ?? '',
        m.margen_pct ?? '',
        m.utilidad_30d,
      ])
    );

  const exportCategorias = () =>
    downloadCsv(
      'comparativa-categorias.csv',
      [
        'Categoría',
        'Productos',
        'Productos con venta 30d',
        'Importe 30d',
        'Utilidad 30d',
        'Margen promedio %',
        'Valor stock',
      ],
      categorias.map((c) => [
        c.categoria,
        c.total_productos,
        c.productos_con_venta_30d,
        c.importe_total_30d,
        c.utilidad_total_30d,
        c.margen_promedio_pct ?? '',
        c.valor_stock_total,
      ])
    );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <RequireAccess empresa="rdb" modulo="rdb.productos">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/rdb/productos">
              <Button variant="ghost" size="icon" aria-label="Volver">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Análisis de productos</h1>
              <p className="text-sm text-muted-foreground">
                KPIs, capital atorado, estrellas, margen bajo y comparativa por categoría — últimos
                30 días.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => void fetchData()}
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

        {/* KPIs */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Resumen RDB últimos 30 días
          </h2>
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Productos activos" value={formatNumber(kpis.totalActivos)} />
              <KpiCard
                label="Ventas 30d"
                value={formatCurrencyCompact(kpis.ventas30d)}
                tone="good"
              />
              <KpiCard
                label="Utilidad estimada 30d"
                value={formatCurrencyCompact(kpis.utilidad30d)}
                tone="good"
                hint="Ingreso − (unidades × costo)"
              />
              <KpiCard
                label="Margen promedio ponderado"
                value={kpis.margenPond === null ? '—' : `${kpis.margenPond.toFixed(1)}%`}
                hint="Por ingreso 30d"
              />
              <KpiCard
                label="Valor inventario"
                value={formatCurrencyCompact(kpis.valorStock)}
                hint="Suma de stock × costo"
              />
              <KpiCard
                label="Sin movimiento (>30d)"
                value={formatNumber(kpis.sinMov)}
                tone={kpis.sinMov > 50 ? 'warn' : 'default'}
              />
              <KpiCard
                label="Sin precio"
                value={formatNumber(kpis.sinPrecio)}
                tone={kpis.sinPrecio > 0 ? 'warn' : 'default'}
              />
              <KpiCard
                label="Sin costo"
                value={formatNumber(kpis.sinCosto)}
                tone={kpis.sinCosto > 0 ? 'warn' : 'default'}
              />
            </div>
          )}
        </section>

        {/* Sin movimiento */}
        <section>
          <SectionHeader
            icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
            title="Productos sin movimiento — capital atorado"
            subtitle="Candidatos a promoción urgente o baja. Ordenados por valor en stock."
            onExport={sinMovimiento.length > 0 ? exportSinMov : undefined}
          />
          <div className="rounded-xl border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Días sin venta</TableHead>
                  <TableHead className="text-right">Valor en stock</TableHead>
                  <TableHead>Última venta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : sinMovimiento.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground text-sm">
                      Ningún producto inventariable con stock y sin venta en &gt;30 días. ✓
                    </TableCell>
                  </TableRow>
                ) : (
                  sinMovimiento.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.nombre}</TableCell>
                      <TableCell>
                        <CategoriaBadge nombre={m.categoria_nombre} color={m.categoria_color} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(m.stock_actual, 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-red-600">
                        {m.dias_sin_venta === 9999 ? 'Nunca' : `${m.dias_sin_venta}d`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatCurrency(m.valor_stock)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(m.ultima_venta_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* Estrellas */}
        <section>
          <SectionHeader
            icon={<Star className="h-5 w-5 text-emerald-600" />}
            title="Estrellas — alta rotación + margen sano"
            subtitle="Productos rentables clave (≥30 unidades 30d, margen ≥30%). No te quedes sin stock."
            onExport={estrellas.length > 0 ? exportEstrellas : undefined}
          />
          <div className="rounded-xl border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Unidades 30d</TableHead>
                  <TableHead className="text-right">Importe 30d</TableHead>
                  <TableHead className="text-right">Margen</TableHead>
                  <TableHead className="text-right">Utilidad 30d</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : estrellas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground text-sm">
                      Sin estrellas que cumplan el criterio. Revisa precios y costos.
                    </TableCell>
                  </TableRow>
                ) : (
                  estrellas.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.nombre}</TableCell>
                      <TableCell>
                        <CategoriaBadge nombre={m.categoria_nombre} color={m.categoria_color} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(m.unidades_30d, 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(m.importe_30d)}
                      </TableCell>
                      <TableCell className="text-right">
                        <MargenBadge pct={m.margen_pct} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-emerald-600">
                        {formatCurrency(m.utilidad_30d)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.inventariable ? formatNumber(m.stock_actual, 0) : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* Margen bajo */}
        <section>
          <SectionHeader
            icon={<TrendingUp className="h-5 w-5 text-red-600" />}
            title="Vende mucho, deja poco — candidatos a subir precio o renegociar costo"
            subtitle="Alta rotación (≥30 unidades 30d) + margen <20%."
            onExport={margenBajo.length > 0 ? exportMargenBajo : undefined}
          />
          <div className="rounded-xl border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Unidades 30d</TableHead>
                  <TableHead className="text-right">Importe 30d</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Margen</TableHead>
                  <TableHead className="text-right">Utilidad 30d</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : margenBajo.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground text-sm">
                      Ningún producto con alta rotación y margen bajo. ✓
                    </TableCell>
                  </TableRow>
                ) : (
                  margenBajo.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.nombre}</TableCell>
                      <TableCell>
                        <CategoriaBadge nombre={m.categoria_nombre} color={m.categoria_color} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(m.unidades_30d, 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(m.importe_30d)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(m.costo)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(m.precio_venta)}
                      </TableCell>
                      <TableCell className="text-right">
                        <MargenBadge pct={m.margen_pct} />
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-medium ${
                          m.utilidad_30d < 0 ? 'text-red-600' : ''
                        }`}
                      >
                        {formatCurrency(m.utilidad_30d)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* Comparativa por categoría — bar chart CSS */}
        <section>
          <SectionHeader
            icon={<PieChart className="h-5 w-5 text-blue-600" />}
            title="Comparativa por categoría"
            subtitle="Importe y utilidad estimada últimos 30 días."
            onExport={categorias.length > 0 ? exportCategorias : undefined}
          />
          <div className="rounded-xl border bg-card p-4">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : categorias.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">
                Sin categorías para mostrar.
              </div>
            ) : (
              <div className="space-y-3">
                {categorias.map((c) => {
                  const pct = (c.importe_total_30d / maxImporte) * 100;
                  const utilidadPct =
                    c.importe_total_30d > 0
                      ? (c.utilidad_total_30d / c.importe_total_30d) * 100
                      : 0;
                  return (
                    <div key={c.categoria_id} className="space-y-1">
                      <div className="flex items-baseline justify-between text-sm">
                        <div className="flex items-center gap-2 font-medium">
                          {c.color && (
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: c.color }}
                            />
                          )}
                          {c.categoria}
                          <span className="text-xs font-normal text-muted-foreground">
                            ({c.productos_con_venta_30d}/{c.total_productos} con venta)
                          </span>
                        </div>
                        <div className="flex gap-4 tabular-nums">
                          <span>{formatCurrency(c.importe_total_30d)}</span>
                          <span className="text-emerald-600 text-xs">
                            util {formatCurrency(c.utilidad_total_30d)}
                          </span>
                        </div>
                      </div>
                      <div className="relative h-6 rounded-md bg-muted overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: c.color ?? '#94a3b8',
                            opacity: 0.85,
                          }}
                        />
                        {c.importe_total_30d > 0 && (
                          <div
                            className="absolute inset-y-0 left-0 bg-emerald-600/30 transition-all"
                            style={{ width: `${pct * (utilidadPct / 100)}%` }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Barra de color = importe vendido. Sombra verde = porción atribuible a utilidad
              estimada. Charts más detallados (tendencia 12 semanas, drill-down por producto)
              quedan pendientes hasta integrar lib de charts.
            </p>
          </div>
        </section>
      </div>
    </RequireAccess>
  );
}
