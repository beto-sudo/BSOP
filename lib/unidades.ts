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
