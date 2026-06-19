'use client';
/**
 * Título de la fase que se está capturando.
 *
 * La cabecera de contexto del expediente (back-link + ficha
 * `OperacionResumen` + barra de tabs) la monta ahora `VentaCapturaShell` en el
 * layout, persistente por encima de todas las páginas de captura. Este
 * componente queda solo con lo propio de la fase: título + chip de pipeline +
 * descripción, debajo de esa Zona A.
 *
 * En Fase 11 (Escriturada) agrega como contexto los datos relevantes de la
 * Fase 10 (firma programada + notario), leídos del resumen que el shell ya
 * cargó (`useVentaCapturaResumen`) — sin queries extra.
 */
import { Badge } from '@/components/ui/badge';
import { useVentaCapturaResumen } from '@/components/dilesa/venta-detalle/captura-shell';

function fmtFechaCorta(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function CapturarFaseHeader({
  faseposicion,
  faseNombre,
  descripcion,
}: {
  faseposicion: number;
  faseNombre: string;
  descripcion?: string;
}) {
  const resumen = useVentaCapturaResumen();
  const extras = resumen.status === 'ready' ? resumen.extras : null;

  return (
    <header className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Fase {faseposicion} — {faseNombre}
        </h1>
        <Badge tone="neutral">Pipeline DILESA</Badge>
      </div>
      {descripcion ? <p className="text-sm text-[var(--text)]/60">{descripcion}</p> : null}

      {faseposicion === 11 && extras && (extras.fechaFirmaProgramada || extras.notarioNombre) ? (
        <p className="text-xs text-[var(--text)]/60">
          Contexto de la Fase 10:
          {extras.fechaFirmaProgramada
            ? ` firma programada el ${fmtFechaCorta(extras.fechaFirmaProgramada)}`
            : ''}
          {extras.fechaFirmaProgramada && extras.notarioNombre ? ' ·' : ''}
          {extras.notarioNombre ? ` notario ${extras.notarioNombre}` : ''}
        </p>
      ) : null}
    </header>
  );
}
