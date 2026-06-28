'use client';

/**
 * Shell del expediente de venta DILESA — la "Zona A" persistente: back-link,
 * cabecera (cliente + badges), banner de hold, ficha `OperacionResumen` y la
 * barra de tabs routed. Debajo monta `children` (el cuerpo del tab activo).
 *
 * Vive en el layout `[id]/layout.tsx` (rama expediente, dentro del
 * `VentaDetalleProvider`) para que cliente/ficha/tabs persistan al cambiar de
 * tab sin recargar. Centraliza el gating (loading / error / scope de vendedor)
 * que antes vivía en el monolito `[id]/page.tsx` — las páginas de tab solo se
 * montan cuando la venta ya está lista.
 *
 * La barra de tabs vive en `./tabs` (`VentaExpedienteTabs`) para compartirse
 * con el shell de captura sin arrastrar el `VentaDetalleProvider`.
 */

import type { ReactNode } from 'react';
import { OperacionResumen } from '@/components/dilesa/operacion-resumen';
import { Badge } from '@/components/ui/badge';
import { VENTA_ESTADO_CONFIG } from '@/lib/status-tokens';
import { Skeleton } from '@/components/ui/skeleton';
import { useVentaDetalle } from './provider';
import { BackLink, HoldBanner } from './ui';
import { VentaExpedienteTabs } from './tabs';
import { BotonSiguienteFase } from './boton-siguiente-fase';
import { FASES_ORDEN } from './types';
import { diasEnFase, colorDiasFase } from '@/lib/dilesa/dias-en-fase';

export function VentaExpedienteShell({ children }: { children: ReactNode }) {
  const d = useVentaDetalle();
  const { venta, loading, error, scopeVendedor } = d;

  if (loading) {
    return (
      <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !venta) {
    return (
      <div className="container mx-auto max-w-6xl space-y-4 px-4 py-6">
        <BackLink />
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error ?? 'Venta no encontrada.'}
        </div>
      </div>
    );
  }

  // Vendedor scoped: no puede abrir ventas de otros asesores.
  if (
    !scopeVendedor.loading &&
    scopeVendedor.soloVendedor &&
    venta.vendedor_usuario_id !== scopeVendedor.userId
  ) {
    return (
      <div className="container mx-auto max-w-6xl space-y-4 px-4 py-6">
        <BackLink />
        <div className="rounded-lg border border-amber-400/40 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          Esta operación pertenece a otro asesor. Tu acceso está limitado a tus propios clientes y
          ventas.
        </div>
      </div>
    );
  }

  const {
    persona,
    unidad,
    proyectoNombre,
    prototipoNombre,
    clienteNombre,
    vendedorNombre,
    cuadratura,
    holdSnapshot,
  } = d;

  // Días en la fase actual (S1 dilesa-fluidez-pipeline): se computa desde la
  // fecha de entrada a la fase actual (la fila de venta_fases con la posición
  // vigente, ya cargada por el provider) — sin query extra. Solo para ventas en
  // pipeline vivo (no desasignadas).
  const fechaFaseActual =
    venta.estado !== 'desasignada' && venta.fase_posicion != null
      ? (d.fases.find((f) => f.posicion === venta.fase_posicion)?.fecha ?? null)
      : null;
  const diasFaseActual = diasEnFase(fechaFaseActual);

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6">
      <BackLink />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">
            {clienteNombre || '(sin nombre)'}
          </h1>
          {proyectoNombre && unidad?.identificador ? (
            <p
              className={`mt-1 text-sm ${
                venta.estado === 'desasignada'
                  ? 'text-[var(--text)]/35 line-through decoration-[var(--text)]/35'
                  : 'text-[var(--text)]/60'
              }`}
              title={
                venta.estado === 'desasignada'
                  ? 'Unidad liberada — la venta fue desasignada'
                  : undefined
              }
            >
              {proyectoNombre} · {unidad.identificador}
              {venta.estado === 'desasignada' ? (
                <span className="ml-2 text-xs not-italic no-underline">(liberada)</span>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {/* Si la venta está desasignada, NO mostramos el badge de fase — evita
                el efecto contradictorio "2. Asignada · Desasignada". */}
            {venta.fase_actual && venta.estado !== 'desasignada' ? (
              <Badge tone="neutral">
                {venta.fase_posicion ? `${venta.fase_posicion}. ` : ''}
                {venta.fase_actual}
              </Badge>
            ) : null}
            {diasFaseActual != null ? (
              <span
                className={`text-xs font-medium tabular-nums ${colorDiasFase(diasFaseActual)}`}
                title={`${diasFaseActual} día${diasFaseActual === 1 ? '' : 's'} en esta fase`}
              >
                {diasFaseActual} d en fase
              </span>
            ) : null}
            <Badge
              tone={
                VENTA_ESTADO_CONFIG[venta.estado as keyof typeof VENTA_ESTADO_CONFIG]?.tone ??
                'neutral'
              }
            >
              {VENTA_ESTADO_CONFIG[venta.estado as keyof typeof VENTA_ESTADO_CONFIG]?.label ??
                venta.estado}
            </Badge>
            {venta.tipo_credito ? <Badge tone="neutral">{venta.tipo_credito}</Badge> : null}
          </div>
          {/* Atajo a la captura de la fase siguiente (si el usuario tiene permiso). */}
          <BotonSiguienteFase />
        </div>
      </header>

      {holdSnapshot && holdSnapshot.estado !== 'no_aplica' ? (
        <HoldBanner snapshot={holdSnapshot} />
      ) : null}

      {/* Zona A — cabecera persistente del Expediente de Operación. */}
      <OperacionResumen
        cliente={{
          nombre: clienteNombre || '(sin nombre)',
          contacto: [persona?.telefono, persona?.email].filter(Boolean).join(' · ') || null,
          curp: persona?.curp ?? null,
          // INE de la persona; fallback al del KYC de la venta (migradas Coda).
          ine: persona?.numero_credencial_ine ?? venta.ine_numero ?? null,
        }}
        vivienda={{
          proyecto: proyectoNombre,
          mzLote: null,
          prototipo: prototipoNombre,
          domicilio: null,
          identificador: unidad?.identificador ?? null,
        }}
        precioAsignacion={venta.precio_asignacion}
        valorEscrituracion={venta.valor_escrituracion}
        vendedor={vendedorNombre ?? venta.vendedor}
        faseActual={venta.fase_actual}
        fasePosicion={venta.fase_posicion}
        totalFases={FASES_ORDEN.length}
        diasEnFase={diasFaseActual}
        cuadratura={cuadratura}
      />

      {/* Zona C — tabs del panel de trabajo (Expediente de Operación). */}
      <VentaExpedienteTabs id={venta.id} />

      {children}
    </div>
  );
}
