/**
 * Hitos RUV (DTU / extracción) como característica filtrable — helpers puros.
 *
 * Los hitos viven en `dilesa.unidades.fecha_dtu` / `fecha_extraccion` (fuente
 * de verdad; los captura el módulo RUV vía `marcarHito`). "Tiene DTU" =
 * `fecha_dtu IS NOT NULL`; ídem extracción. La extracción siempre ocurre
 * DESPUÉS del DTU en el trámite, por eso "con extracción" es la señal fuerte
 * de escriturabilidad (junto con obra terminada).
 *
 * Las opciones incluyen los cortes negativos (Sin DTU / Sin extracción):
 * la lista de trabajo del área es tanto "cuáles ya están listas" como "a
 * cuáles les falta el hito". Semántica AND — cada opción seleccionada es una
 * condición que la fila debe cumplir (seleccionar "Con DTU" + "Sin DTU" da
 * vacío por construcción, no es un estado inválido).
 */
import type { FilterComboboxOption } from '@/components/ui/filter-combobox';

export const HITO_RUV_OPTIONS: readonly FilterComboboxOption[] = [
  { id: 'con_dtu', label: 'Con DTU' },
  { id: 'sin_dtu', label: 'Sin DTU' },
  { id: 'con_extraccion', label: 'Con extracción' },
  { id: 'sin_extraccion', label: 'Sin extracción' },
];

/**
 * ¿La unidad (representada por sus fechas de hito) cumple TODAS las opciones
 * de hito RUV seleccionadas? Ids desconocidos se ignoran (permite mezclar
 * estas opciones con otras características en el mismo multi-select).
 */
export function matchHitosRuv(
  fechaDtu: string | null,
  fechaExtraccion: string | null,
  seleccion: readonly string[]
): boolean {
  for (const s of seleccion) {
    if (s === 'con_dtu' && !fechaDtu) return false;
    if (s === 'sin_dtu' && fechaDtu) return false;
    if (s === 'con_extraccion' && !fechaExtraccion) return false;
    if (s === 'sin_extraccion' && fechaExtraccion) return false;
  }
  return true;
}
