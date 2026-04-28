'use client';

/* eslint-disable react-hooks/set-state-in-effect --
 * Mismo data-sync pattern que el resto de /rdb/inventario/levantamientos.
 */

/**
 * Reporte de levantamiento — vista print-friendly.
 *
 * Estructura (orden vertical):
 *   1. Membrete RDB (full-width)
 *   2. Encabezado: folio, almacén, contador, fechas
 *   3. KPIs (4 tarjetas)
 *   4. Tabla de líneas con diferencia ≠ 0
 *   5. Sección de líneas fuera de tolerancia con notas
 *   6. Pie con N bloques de firma (si aplicado)
 *
 * Render strategy: el contenido vive en la misma página; `@media print` oculta
 * la navegación de pantalla y deja sólo el documento. Auto-`window.print()`
 * 400 ms después del mount, replicando el patrón de `handlePrintLista` en
 * `/rdb/inventario/page.tsx`.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import Image from 'next/image';
import { RequireAccess } from '@/components/require-access';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LevantamientoStatusBadge } from '@/components/inventario/levantamiento-status-badge';
import {
  formatCurrency,
  formatDateShort,
  formatDateTime,
  formatNumber,
} from '@/lib/inventario/format';
import { getLineasParaRevisar } from '../../actions';
import type { LineaParaRevisar } from '../../types';

type LevReporte = {
  id: string;
  folio: string | null;
  estado: string;
  fecha_programada: string;
  fecha_inicio: string | null;
  fecha_cierre: string | null;
  fecha_aplicado: string | null;
  almacen_nombre: string | null;
  contador_nombre: string | null;
  notas: string | null;
};

type FirmaRow = {
  id: string;
  paso: number;
  rol: string;
  firmante_nombre: string;
  firmado_at: string;
  comentario: string | null;
};

export default function ReportePage() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.inventario">
      <ReporteInner />
    </RequireAccess>
  );
}

const REPORTE_STYLES = `
@media print {
  .reporte-screen-only { display: none !important; }
  .reporte-doc { margin: 0; padding: 0; background: white; }
  .reporte-doc table { page-break-inside: auto; }
  .reporte-doc tr { page-break-inside: avoid; page-break-after: auto; }
  .reporte-firmas { page-break-inside: avoid; }
}
.reporte-doc {
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
  color: #111;
}
.reporte-doc table { width: 100%; border-collapse: collapse; }
.reporte-doc th {
  font-weight: 700; text-align: left; padding: 6px 8px;
  border-bottom: 2px solid #1a1a2e; font-size: 9.5px;
  text-transform: uppercase; letter-spacing: 0.04em;
  color: #1a1a2e; background: #f5f5f8;
}
.reporte-doc td {
  padding: 5px 8px; border-bottom: 1px solid #eee;
  vertical-align: middle; font-size: 11px;
}
.reporte-doc tr:nth-child(even) td { background: #fafafa; }
.reporte-doc .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.reporte-doc .rojo { color: #dc2626; font-weight: 600; }
.reporte-doc .ambar { color: #d97706; font-weight: 600; }
.reporte-doc .verde { color: #16a34a; }
.reporte-doc .gris { color: #777; }
`;

function ReporteInner() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [lev, setLev] = useState<LevReporte | null>(null);
  const [lineas, setLineas] = useState<LineaParaRevisar[]>([]);
  const [firmas, setFirmas] = useState<FirmaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();

    const [{ data: levRow, error: levErr }, lineasRes, { data: firmasRows }] = await Promise.all([
      supabase
        .schema('erp')
        .from('inventario_levantamientos')
        .select(
          `id, folio, estado, fecha_programada, fecha_inicio, fecha_cierre, fecha_aplicado,
           contador_id, notas, almacenes(nombre)`
        )
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle(),
      getLineasParaRevisar(id),
      supabase
        .schema('erp')
        .from('inventario_levantamiento_firmas')
        .select('id, paso, rol, firmante_nombre, firmado_at, comentario')
        .eq('levantamiento_id', id)
        .order('paso', { ascending: true }),
    ]);

    if (levErr) {
      setError(levErr.message);
      setLoading(false);
      return;
    }
    if (!levRow) {
      setError('Levantamiento no encontrado.');
      setLoading(false);
      return;
    }
    if (!lineasRes.ok) {
      setError(lineasRes.error);
      setLoading(false);
      return;
    }

    type LevQuery = {
      id: string;
      folio: string | null;
      estado: string;
      fecha_programada: string;
      fecha_inicio: string | null;
      fecha_cierre: string | null;
      fecha_aplicado: string | null;
      contador_id: string | null;
      notas: string | null;
      almacenes: { nombre: string } | null;
    };
    const lr = levRow as unknown as LevQuery;

    let contador_nombre: string | null = null;
    if (lr.contador_id) {
      const { data: u } = await supabase
        .schema('core')
        .from('usuarios')
        .select('first_name, email')
        .eq('id', lr.contador_id)
        .maybeSingle();
      if (u) contador_nombre = u.first_name?.trim() || u.email || null;
    }

    setLev({
      id: lr.id,
      folio: lr.folio,
      estado: lr.estado,
      fecha_programada: lr.fecha_programada,
      fecha_inicio: lr.fecha_inicio,
      fecha_cierre: lr.fecha_cierre,
      fecha_aplicado: lr.fecha_aplicado,
      almacen_nombre: lr.almacenes?.nombre ?? null,
      contador_nombre,
      notas: lr.notas,
    });
    setLineas(lineasRes.data);
    setFirmas((firmasRows ?? []) as FirmaRow[]);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-print 400ms después de cargar (replica el patrón de handlePrintLista).
  useEffect(() => {
    if (loading || error || !lev) return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [loading, error, lev]);

  const kpis = useMemo(() => {
    const conDiff = lineas.filter((l) => (l.diferencia ?? 0) !== 0);
    const fuera = lineas.filter((l) => l.fuera_de_tolerancia);
    const ajusteNeto = lineas.reduce((s, l) => s + (Number(l.diferencia_valor) || 0), 0);
    return {
      total: lineas.length,
      conDiff: conDiff.length,
      fuera: fuera.length,
      ajusteNeto,
    };
  }, [lineas]);

  const conDiff = useMemo(() => lineas.filter((l) => (l.diferencia ?? 0) !== 0), [lineas]);
  const fueraDeTolerancia = useMemo(() => lineas.filter((l) => l.fuera_de_tolerancia), [lineas]);

  if (loading) {
    return (
      <div className="container mx-auto max-w-5xl space-y-4 px-4 py-6 print:hidden">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !lev) {
    return (
      <div className="container mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Link
          href={`/rdb/inventario/levantamientos/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Volver al levantamiento
        </Link>
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Levantamiento no encontrado.'}
        </div>
      </div>
    );
  }

  const fechaImpresion = formatDateTime(new Date().toISOString());

  return (
    <div className="reporte-root">
      {/* Estilos print + screen específicos del reporte. Inyectados como
          <style> simple — no usamos styled-jsx en el resto del repo. */}
      <style
        dangerouslySetInnerHTML={{
          __html: REPORTE_STYLES,
        }}
      />

      {/* ─── Encabezado de pantalla (oculto al imprimir) ─────────────── */}
      <div className="reporte-screen-only border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="container mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
          <Link
            href={`/rdb/inventario/levantamientos/${lev.id}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Volver al levantamiento
          </Link>
          <div className="flex items-center gap-2">
            <LevantamientoStatusBadge estado={lev.estado} />
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="size-4" />
              Imprimir
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Documento ────────────────────────────────────────────────── */}
      <div className="reporte-doc container mx-auto max-w-5xl px-6 py-6">
        {/* Membrete */}
        <div className="mb-1">
          <Image
            src="/brand/rdb/header-email.png"
            alt="Rincón del Bosque"
            width={1240}
            height={300}
            className="h-auto w-full"
            priority
          />
        </div>

        {/* Encabezado del reporte */}
        <div className="mt-3 flex items-baseline justify-between border-b pb-3 text-xs">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Reporte de levantamiento físico
            </span>
            <h1 className="mt-1 text-xl font-bold tracking-tight">Folio {lev.folio ?? '—'}</h1>
          </div>
          <div className="text-right text-[11px] text-muted-foreground">
            <div>Impreso: {fechaImpresion}</div>
            {lev.fecha_aplicado && <div>Aplicado: {formatDateTime(lev.fecha_aplicado)}</div>}
          </div>
        </div>

        {/* Metadata principal */}
        <dl className="mt-4 grid grid-cols-2 gap-y-1.5 text-[11px] sm:grid-cols-4">
          <Meta label="Almacén" value={lev.almacen_nombre ?? '—'} />
          <Meta label="Programado" value={formatDateShort(lev.fecha_programada)} />
          <Meta label="Inicio" value={formatDateTime(lev.fecha_inicio)} />
          <Meta label="Cierre" value={formatDateTime(lev.fecha_aplicado ?? lev.fecha_cierre)} />
          {lev.contador_nombre && <Meta label="Contador" value={lev.contador_nombre} colSpan={2} />}
          {lev.notas && <Meta label="Notas" value={lev.notas} colSpan={4} />}
        </dl>

        {/* KPIs ejecutivos */}
        <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ReportKpi label="Productos" value={formatNumber(kpis.total)} />
          <ReportKpi label="Con diferencia" value={formatNumber(kpis.conDiff)} />
          <ReportKpi
            label="Fuera de tolerancia"
            value={formatNumber(kpis.fuera)}
            highlight={kpis.fuera > 0 ? 'rojo' : undefined}
          />
          <ReportKpi
            label="Ajuste neto"
            value={formatCurrency(kpis.ajusteNeto)}
            highlight={kpis.ajusteNeto < 0 ? 'rojo' : kpis.ajusteNeto > 0 ? 'verde' : undefined}
          />
        </section>

        {/* Tabla de líneas con diferencia */}
        <section className="mt-6">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider">
            Líneas con diferencia ({conDiff.length})
          </h2>
          {conDiff.length === 0 ? (
            <p className="rounded border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Sin diferencias — el conteo físico coincide con el sistema en todas las líneas.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th className="num">Sistema</th>
                  <th className="num">Contado</th>
                  <th className="num">Δ</th>
                  <th className="num">Δ $</th>
                  <th>Tol.</th>
                </tr>
              </thead>
              <tbody>
                {conDiff.map((l) => (
                  <tr key={l.linea_id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{l.producto_nombre}</div>
                      <div className="gris" style={{ fontSize: '9.5px' }}>
                        {l.producto_codigo}
                      </div>
                    </td>
                    <td className="gris">{l.categoria ?? '—'}</td>
                    <td className="num">
                      {formatNumber(l.stock_efectivo)} {l.unidad}
                    </td>
                    <td className="num">
                      {formatNumber(l.cantidad_contada)} {l.unidad}
                    </td>
                    <td
                      className={`num ${l.fuera_de_tolerancia ? 'rojo' : (l.diferencia ?? 0) < 0 ? 'ambar' : 'verde'}`}
                    >
                      {(l.diferencia ?? 0) > 0 ? '+' : ''}
                      {formatNumber(l.diferencia)} {l.unidad}
                    </td>
                    <td
                      className={`num ${l.fuera_de_tolerancia ? 'rojo' : (l.diferencia_valor ?? 0) < 0 ? 'ambar' : ''}`}
                    >
                      {formatCurrency(l.diferencia_valor)}
                    </td>
                    <td>
                      {l.fuera_de_tolerancia ? (
                        <span className="rojo">Fuera</span>
                      ) : (
                        <span className="ambar">Dentro</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Sección de líneas fuera de tolerancia con notas */}
        {fueraDeTolerancia.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider">
              Fuera de tolerancia — justificaciones ({fueraDeTolerancia.length})
            </h2>
            <ul className="space-y-2">
              {fueraDeTolerancia.map((l) => (
                <li
                  key={l.linea_id}
                  className="rounded border border-destructive/30 bg-destructive/5 p-2 text-[11px]"
                >
                  <div className="flex justify-between gap-2">
                    <div>
                      <strong>{l.producto_nombre}</strong>{' '}
                      <span className="gris">({l.producto_codigo})</span>
                    </div>
                    <div className="rojo">
                      Δ {formatNumber(l.diferencia)} {l.unidad} (
                      {formatCurrency(l.diferencia_valor)})
                    </div>
                  </div>
                  <div className="mt-1">
                    {l.notas_diferencia ? (
                      <span style={{ whiteSpace: 'pre-wrap' }}>{l.notas_diferencia}</span>
                    ) : (
                      <span className="gris" style={{ fontStyle: 'italic' }}>
                        Sin nota registrada.
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Pie con firmas */}
        <section className="reporte-firmas mt-8">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider">
            Firmas {firmas.length > 0 ? `(${firmas.length})` : ''}
          </h2>
          {firmas.length === 0 ? (
            <p className="rounded border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Sin firmas registradas para este levantamiento.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
              {firmas.map((f) => (
                <div key={f.id} className="text-[11px]">
                  <div className="border-b border-foreground pb-12" />
                  <div className="mt-1 font-semibold">{f.firmante_nombre}</div>
                  <div className="text-muted-foreground capitalize">
                    {f.rol} · paso {f.paso}
                  </div>
                  <div className="text-muted-foreground">{formatDateTime(f.firmado_at)}</div>
                  {f.comentario && <div className="mt-1 italic">&ldquo;{f.comentario}&rdquo;</div>}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Nota de movimientos generados */}
        {lev.estado === 'aplicado' && (
          <section className="mt-6 rounded border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            Ajustes contables generados — referencia <strong>{lev.folio ?? '—'}</strong> ·{' '}
            {kpis.conDiff} movimiento{kpis.conDiff === 1 ? '' : 's'} de inventario.
          </section>
        )}
      </div>
    </div>
  );
}

function Meta({ label, value, colSpan }: { label: string; value: string; colSpan?: 2 | 4 }) {
  const span = colSpan === 4 ? 'sm:col-span-4' : colSpan === 2 ? 'sm:col-span-2' : '';
  return (
    <div className={span}>
      <dt className="text-[9.5px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function ReportKpi({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: 'rojo' | 'verde';
}) {
  const tone =
    highlight === 'rojo'
      ? 'text-destructive'
      : highlight === 'verde'
        ? 'text-emerald-700'
        : 'text-foreground';
  return (
    <div className="rounded border bg-card px-3 py-2">
      <div className="text-[9.5px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-base font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
