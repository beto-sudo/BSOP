'use client';
/**
 * Header reusable para las páginas de captura de fase.
 *
 * Muestra back-link a la venta + título de la fase + chip de posición, y
 * debajo la cabecera completa del Expediente de Operación
 * (`<OperacionResumen>`: cliente, vivienda, comercial y mini-cuadratura)
 * cargada por `useVentaResumen` — el operador captura con todo el contexto
 * a la vista, sin que cada página de fase cargue nada extra (remate
 * post-cierre de `dilesa-ventas-expediente`: "captura a ciegas").
 *
 * En Fase 11 (Escriturada) agrega los datos relevantes de la Fase 10:
 * fecha de firma programada y notario asignado.
 *
 * Fail-soft: si el resumen no carga (error o scope de vendedor), la
 * captura sigue funcionando con el header simple — el contexto es ayuda,
 * no gate.
 */
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { OperacionResumen } from '@/components/dilesa/operacion-resumen';
import { useVentaResumen, type VentaResumenState } from '@/lib/dilesa/use-venta-resumen';

function fmtFechaCorta(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function CapturarFaseHeader({
  ventaId,
  clienteNombre,
  identificacionInventario,
  faseposicion,
  faseNombre,
  descripcion,
  resumen: resumenExterno,
}: {
  ventaId: string;
  clienteNombre: string | null;
  identificacionInventario: string | null;
  faseposicion: number;
  faseNombre: string;
  descripcion?: string;
  /**
   * Resumen pre-cargado por la página (cuando ella también lo necesita,
   * ej. F13 pinta la cuadratura). Si viene, el hook interno no carga nada
   * (ventaId null lo deja inerte) — evita duplicar las queries.
   */
  resumen?: VentaResumenState;
}) {
  const resumenInterno = useVentaResumen(resumenExterno ? null : ventaId);
  const resumen = resumenExterno ?? resumenInterno;

  return (
    <header className="space-y-3">
      <div className="space-y-2">
        <Link
          href={`/dilesa/ventas/${ventaId}`}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text)]/60 hover:text-[var(--text)]"
        >
          <ArrowLeft className="size-4" />
          Volver a {clienteNombre || 'la venta'}
          {identificacionInventario ? ` (${identificacionInventario})` : ''}
        </Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Fase {faseposicion} — {faseNombre}
          </h1>
          <Badge tone="neutral">Pipeline DILESA</Badge>
        </div>
        {descripcion ? <p className="text-sm text-[var(--text)]/60">{descripcion}</p> : null}
      </div>

      {
        resumen.status === 'loading' ? (
          <Skeleton className="h-36 w-full rounded-xl" />
        ) : resumen.status === 'ready' ? (
          <div className="space-y-2">
            <OperacionResumen {...resumen.props} />
            {faseposicion === 11 &&
            (resumen.extras.fechaFirmaProgramada || resumen.extras.notarioNombre) ? (
              <p className="text-xs text-[var(--text)]/60">
                Contexto de la Fase 10:
                {resumen.extras.fechaFirmaProgramada
                  ? ` firma programada el ${fmtFechaCorta(resumen.extras.fechaFirmaProgramada)}`
                  : ''}
                {resumen.extras.fechaFirmaProgramada && resumen.extras.notarioNombre ? ' ·' : ''}
                {resumen.extras.notarioNombre ? ` notario ${resumen.extras.notarioNombre}` : ''}
              </p>
            ) : null}
          </div>
        ) : null /* error/forbidden: header simple, la captura no se bloquea */
      }
    </header>
  );
}
