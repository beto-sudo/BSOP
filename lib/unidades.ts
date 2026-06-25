/**
 * Catálogo canónico de unidades de medida para captura de productos e insumos.
 *
 * Los `value` son los strings que se persisten en DB (`erp.productos.unidad`,
 * `erp.producto_receta.unidad`, `erp.requisiciones_detalle.unidad`):
 * minúsculas, sin acentos, singular. El `label` es solo presentación.
 *
 * Para agregar una unidad nueva basta sumarla aquí — todos los dropdowns
 * (alta/edición de producto, receta, requisiciones) leen de esta lista.
 */

export type UnidadOption = { value: string; label: string };

export const UNIDAD_DEFAULT = 'pieza';

export const UNIDADES: UnidadOption[] = [
  { value: 'pieza', label: 'Pieza (pza)' },
  { value: 'kilo', label: 'Kilo (kg)' },
  { value: 'gramo', label: 'Gramo (g)' },
  { value: 'litro', label: 'Litro (L)' },
  { value: 'mililitro', label: 'Mililitro (ml)' },
  { value: 'onza', label: 'Onza fluida (oz)' },
  { value: 'caja', label: 'Caja' },
  { value: 'paquete', label: 'Paquete' },
  { value: 'bolsa', label: 'Bolsa' },
  { value: 'botella', label: 'Botella' },
  { value: 'lata', label: 'Lata' },
  { value: 'galon', label: 'Galón' },
  { value: 'cubeta', label: 'Cubeta' },
  { value: 'costal', label: 'Costal' },
  { value: 'rollo', label: 'Rollo' },
  { value: 'par', label: 'Par' },
  { value: 'juego', label: 'Juego / kit' },
  { value: 'metro', label: 'Metro (m)' },
  { value: 'servicio', label: 'Servicio' },
];

/**
 * Opciones para un Combobox de unidad. Si `current` trae un valor legacy que
 * no está en el catálogo (datos previos a la estandarización), se agrega como
 * opción extra para que el registro se pueda seguir editando sin perderlo.
 */
export function unidadOptions(current?: string | null): UnidadOption[] {
  const c = current?.trim();
  if (!c || UNIDADES.some((u) => u.value === c)) return UNIDADES;
  return [...UNIDADES, { value: c, label: c }];
}

// ─── Conversión de unidades (descuento de inventario por receta) ───────────────
//
// Espejo en TS de `erp.fn_factor_universal` / `erp.fn_factor_receta_a_stock`
// (migración 20260625150117). Se usa SOLO para el preview en la UI; la verdad
// del descuento vive en el trigger SQL. Mantener ambos en sync.

type DimUnidad = 'V' | 'M'; // Volumen | Masa

const PESO_POR_UNIDAD: Record<string, { dim: DimUnidad; peso: number }> = {
  mililitro: { dim: 'V', peso: 1 },
  litro: { dim: 'V', peso: 1000 },
  onza: { dim: 'V', peso: 29.5735 }, // onza fluida US
  galon: { dim: 'V', peso: 3785.412 },
  gramo: { dim: 'M', peso: 1 },
  kilo: { dim: 'M', peso: 1000 },
};

/** Factor para pasar `de → a` dentro de la misma dimensión (litro↔ml, kilo↔g). null si no aplica. */
export function factorUniversal(de: string, a: string): number | null {
  const d = PESO_POR_UNIDAD[de?.trim().toLowerCase()];
  const x = PESO_POR_UNIDAD[a?.trim().toLowerCase()];
  if (!d || !x || d.dim !== x.dim) return null;
  return d.peso / x.peso;
}

export type InsumoConversion = {
  /** Unidad de compra/stock del insumo (ej. `pieza`, `botella`, `kilo`). */
  unidad: string | null;
  /** Unidad fina en que se expresa `contenido` (ej. `mililitro`, `gramo`). */
  unidadBase: string | null;
  /** Cuántas `unidadBase` trae 1 `unidad` de compra (ej. 980 ml por botella). */
  contenido: number | null;
};

/**
 * Factor F tal que `cantidad_en_unidad_stock = cantidad_receta * F`.
 * `null` = no convertible (el trigger no descuenta ese insumo).
 */
export function factorRecetaAStock(unidadReceta: string, insumo: InsumoConversion): number | null {
  const uReceta = unidadReceta?.trim().toLowerCase();
  const uStock = insumo.unidad?.trim().toLowerCase() ?? '';
  const uBase = insumo.unidadBase?.trim().toLowerCase() ?? null;
  const contenido = insumo.contenido;

  if (!uReceta) return null;
  if (uReceta === uStock) return 1;

  const fac = factorUniversal(uReceta, uStock);
  if (fac !== null) return fac;

  if (contenido != null && contenido > 0 && uBase) {
    const facBase = uReceta === uBase ? 1 : factorUniversal(uReceta, uBase);
    if (facBase !== null) return facBase / contenido;
  }

  return null;
}
