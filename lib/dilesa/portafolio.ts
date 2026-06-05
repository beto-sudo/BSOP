/**
 * Catálogos y helpers del workflow "Liberar unidad ↔ Portafolio de activos"
 * (iniciativa dilesa-portafolio-activos).
 *
 * Vive en `.ts` plano (no en el server action ni en el client component) porque
 * lo consumen ambos lados: el server action `liberarUnidadAlPortafolio` valida
 * contra estas listas y el drawer/dialog de la UI las renderiza. Un archivo
 * `'use server'` solo puede exportar funciones async; un `'use client'` no debe
 * ser el origen de constantes que importa un route/server.
 *
 * Las listas espejan los CHECK constraints de `dilesa.activos`
 * (`activos_tipo_check`, `activos_modalidad_check`) y el RPC
 * `dilesa.fn_liberar_unidad_portafolio`.
 */

/** Tipos de activo que una unidad de fraccionamiento puede tomar al liberarse. */
export const ACTIVO_TIPOS = [
  'casa',
  'lote',
  'local',
  'terreno',
  'departamento',
  'edificio',
  'nave',
] as const;

export type ActivoTipo = (typeof ACTIVO_TIPOS)[number];

export const ACTIVO_TIPO_LABEL: Record<ActivoTipo, string> = {
  casa: 'Casa',
  lote: 'Lote',
  local: 'Local',
  terreno: 'Terreno',
  departamento: 'Departamento',
  edificio: 'Edificio',
  nave: 'Nave industrial',
};

/** Destino del activo en el portafolio. Ortogonal al `estado` (ciclo de vida). */
export const ACTIVO_MODALIDADES = [
  'venta',
  'renta',
  'uso_propio',
  'renta_venta',
  'sin_definir',
] as const;

export type ActivoModalidad = (typeof ACTIVO_MODALIDADES)[number];

export const ACTIVO_MODALIDAD_LABEL: Record<ActivoModalidad, string> = {
  venta: 'En venta',
  renta: 'En renta',
  uso_propio: 'Uso propio',
  renta_venta: 'Renta o venta',
  sin_definir: 'Sin definir',
};

export function isActivoTipo(v: string): v is ActivoTipo {
  return (ACTIVO_TIPOS as readonly string[]).includes(v);
}

export function isActivoModalidad(v: string): v is ActivoModalidad {
  return (ACTIVO_MODALIDADES as readonly string[]).includes(v);
}

/**
 * Tipo de activo por defecto al liberar, inferido del `tipo_lote` de la unidad.
 * Es solo un default — el operador lo puede cambiar en el diálogo.
 * - Comercial → `lote` (terreno comercial vendible).
 * - Residencial (interés social / habitacional / residencial) → `casa`.
 * - Resto / sin tipo → `lote`.
 */
export function inferActivoTipo(tipoLote: string | null | undefined): ActivoTipo {
  const t = (tipoLote ?? '').toLowerCase();
  if (/comercial/.test(t)) return 'lote';
  if (/interes social|interés social|habitacional|residencial/.test(t)) return 'casa';
  return 'lote';
}

/**
 * Estados de unidad desde los que tiene sentido liberar al portafolio: la pieza
 * ya es física (urbanizada o construida). No se libera algo `planeada` o
 * `en_construccion`.
 */
const ESTADOS_LIBERABLES = new Set([
  'lote_urbanizado',
  'terminada',
  'asignada',
  'vendida',
  'escriturada',
  'entregada',
]);

export function puedeLiberarse(estadoUnidad: string): boolean {
  return ESTADOS_LIBERABLES.has(estadoUnidad);
}
