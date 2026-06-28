/**
 * Días en la fase actual de una venta DILESA — iniciativa dilesa-fluidez-pipeline, S1.
 *
 * Dato directo (no es el "score de fluidez", que llega en S2): cuántos días lleva
 * una venta en su fase actual del pipeline de 17 fases. En la lista de ventas se
 * lee de la vista `dilesa.v_ventas_lista_antiguedad` (calculado en la base); en el
 * expediente se computa aquí desde la fecha de entrada a la fase (la fila de mayor
 * posición en `venta_fases`, ya cargada por el provider) para no pegarle a la API.
 *
 * Umbrales provisionales (S1): se reusa el del reporte de estancadas como "rojo".
 * En S2 los reemplaza el benchmark por fase (mediana/p90). Aquí no pintamos verde:
 * lo normal queda atenuado y solo se marca lo que pide atención (ámbar/rojo), para
 * no convertir cada fila en un semáforo ruidoso.
 */
import { UMBRAL_ESTANCADA_DEFAULT } from './reportes/estancadas';

/** A partir de aquí (días) los días en fase se marcan en ámbar (ojo). */
export const UMBRAL_DIAS_FASE_AMBAR = 15;
/** A partir de aquí (días) se marcan en rojo — mismo umbral que "estancada". */
export const UMBRAL_DIAS_FASE_ROJO = UMBRAL_ESTANCADA_DEFAULT;

/**
 * Días transcurridos desde la entrada a la fase actual hasta hoy (truncado al día).
 *
 * `fechaEntrada` es la columna DATE ('YYYY-MM-DD') de `venta_fases`. Se interpreta
 * en UTC y se compara contra la fecha UTC de hoy, para empatar con el
 * `CURRENT_DATE - fecha` que calcula la vista en Postgres (evita que lista y
 * expediente difieran por un día en el borde de medianoche). Negativos (fechas
 * inconsistentes de la migración Coda) se clampан a 0. `null` si no hay fecha.
 */
export function diasEnFase(
  fechaEntrada: string | null | undefined,
  hoy: Date = new Date()
): number | null {
  if (!fechaEntrada) return null;
  const entradaMs = Date.parse(`${fechaEntrada.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(entradaMs)) return null;
  const hoyUTC = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  const dias = Math.floor((hoyUTC - entradaMs) / 86_400_000);
  return Math.max(0, dias);
}

/** Banda de atención según los días en fase (S1, umbrales fijos). */
export type BandaDiasFase = 'normal' | 'ambar' | 'rojo';

export function bandaDiasFase(dias: number | null | undefined): BandaDiasFase | null {
  if (dias == null) return null;
  if (dias >= UMBRAL_DIAS_FASE_ROJO) return 'rojo';
  if (dias >= UMBRAL_DIAS_FASE_AMBAR) return 'ambar';
  return 'normal';
}

/** Clase de color de texto para los días en fase (atenuado en normal). */
export function colorDiasFase(dias: number | null | undefined): string {
  switch (bandaDiasFase(dias)) {
    case 'rojo':
      return 'text-red-500';
    case 'ambar':
      return 'text-amber-500';
    default:
      return 'text-[var(--text)]/55';
  }
}
