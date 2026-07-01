/**
 * RuvHitoChips — chips DTU / EXT de una unidad.
 *
 * Un chip aparece solo cuando el hito está capturado en el RUV
 * (`dilesa.unidades.fecha_dtu` / `fecha_extraccion`); el tooltip trae la
 * fecha. Mismo componente en Inventario y Ventas para que el ojo aprenda
 * una sola vez.
 */
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';

export function RuvHitoChips({
  fechaDtu,
  fechaExtraccion,
}: {
  fechaDtu: string | null;
  fechaExtraccion: string | null;
}) {
  if (!fechaDtu && !fechaExtraccion) return null;
  return (
    <>
      {fechaDtu ? (
        <Badge tone="neutral" title={`DTU: ${formatDate(fechaDtu)}`}>
          DTU
        </Badge>
      ) : null}
      {fechaExtraccion ? (
        <Badge tone="accent" title={`Extracción: ${formatDate(fechaExtraccion)}`}>
          EXT
        </Badge>
      ) : null}
    </>
  );
}
