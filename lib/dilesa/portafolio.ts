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

/**
 * Destino del activo en el portafolio. Desde la iniciativa
 * `dilesa-portafolio-destinos` es un CATÁLOGO EN TABLA (`dilesa.portafolio_destinos`),
 * no un enum fijo: el operador agrega destinos sin migración (Demo/Show House,
 * Arrendamiento, Oficina, Bodega, Venta, …). La UI los carga de la DB; aquí solo
 * vive el shape de una fila del catálogo. `modalidad` (el CHECK legacy de
 * `dilesa.activos`) se deriva del destino en el RPC y queda en retiro.
 */
export type PortafolioDestino = {
  id: string;
  slug: string;
  label: string;
  cuenta_renta: boolean;
  cuenta_venta: boolean;
};

export function isActivoTipo(v: string): v is ActivoTipo {
  return (ACTIVO_TIPOS as readonly string[]).includes(v);
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
 * Estados de unidad desde los que tiene sentido liberar al portafolio. Decisión
 * Beto 2026-06-16 (`dilesa-portafolio-destinos`): el portafolio es el marcador
 * de "fuera del programa de venta de vivienda", así que se libera desde
 * CUALQUIER estado de obra — no hace falta que esté terminada (el avance se
 * muestra en el portafolio). Se excluyen los estados comprometidos con un
 * cliente (`asignada`/`vendida`/`escriturada`/`entregada`): esos requieren
 * desasignar la venta primero. El RPC `fn_liberar_unidad_portafolio` refuerza
 * esto con un guard de venta viva (con override de admin auditado).
 */
const ESTADOS_LIBERABLES = new Set(['planeada', 'lote_urbanizado', 'en_construccion', 'terminada']);

export function puedeLiberarse(estadoUnidad: string): boolean {
  return ESTADOS_LIBERABLES.has(estadoUnidad);
}
