/**
 * Fuente ÚNICA de las fases del pipeline de ventas DILESA.
 *
 * La identidad de una fase es su POSICIÓN (1–17): estable y cableada en los
 * triggers de DB (estado terminada=17, plan CxC 2–11, encuesta/entrega 15…).
 * El `nombre` es solo la etiqueta visible — se renombra editando SOLO este
 * archivo + una migración que reescribe `venta_fase_catalogo` y el historial
 * (`venta_fases.fase`, `ventas.fase_actual`) por posición. El `slug` es la
 * carpeta de captura (`/dilesa/ventas/[id]/capturar/<slug>`): una URL estable
 * que NO cambia con los renombres.
 *
 * Convención de nombres (2026-06-24, Beto): "acción a realizar" — el nombre
 * dice qué hay que hacer para avanzar (Asignar, Escriturar, Entregar), salvo
 * "Validación Patronal" que conserva el nombre del documento.
 *
 * Todo lo demás deriva de aquí: las vistas (FASES_ORDEN en el detalle,
 * FASES_PIPELINE en captura), el lookup posición→nombre y el mapa documental
 * FASE_ROLES (llaveado por posición). Una sola lista que mantener. Sin imports
 * con efectos → importable desde client y server.
 */

export type FaseVenta = {
  readonly posicion: number;
  readonly nombre: string;
  readonly slug: string;
};

export const FASES_VENTA = [
  { posicion: 1, nombre: 'Solicitar asignación', slug: '1-solicitud-asignacion' },
  { posicion: 2, nombre: 'Asignar unidad', slug: '2-asignada' },
  { posicion: 3, nombre: 'Formalizar promesa', slug: '3-formalizada' },
  { posicion: 4, nombre: 'Solicitar avalúo', slug: '4-solicitud-avaluo' },
  { posicion: 5, nombre: 'Cerrar avalúo', slug: '5-avaluo-cerrado' },
  { posicion: 6, nombre: 'Inscribir crédito', slug: '6-inscrita' },
  { posicion: 7, nombre: 'Solicitar dictamen', slug: '7-solicitud-dictamen' },
  { posicion: 8, nombre: 'Dictaminar', slug: '8-dictaminada' },
  { posicion: 9, nombre: 'Validación Patronal', slug: '9-validacion-patronal' },
  { posicion: 10, nombre: 'Programar firmas', slug: '10-firmas-programadas' },
  { posicion: 11, nombre: 'Escriturar', slug: '11-escriturada' },
  { posicion: 12, nombre: 'Detonar crédito', slug: '12-detonada' },
  { posicion: 13, nombre: 'Facturar', slug: '13-facturada' },
  { posicion: 14, nombre: 'Preparar entrega', slug: '14-preparada-entrega' },
  { posicion: 15, nombre: 'Entregar', slug: '15-entregada' },
  { posicion: 16, nombre: 'Recabar conformidad', slug: '16-conformidad' },
  { posicion: 17, nombre: 'Cerrar operación', slug: '17-operacion-terminada' },
] as const;

export type FaseSlug = (typeof FASES_VENTA)[number]['slug'];

const NOMBRE_BY_POS: ReadonlyMap<number, string> = new Map(
  FASES_VENTA.map((f) => [f.posicion, f.nombre])
);

/** Nombre visible de una fase por su posición. Fallback defensivo si no existe. */
export function nombreFase(posicion: number): string {
  return NOMBRE_BY_POS.get(posicion) ?? `Fase ${posicion}`;
}

/** Record posición → nombre, para lookups O(1) en server actions y rutas API. */
export const FASES_NOMBRE_BY_POS: Readonly<Record<number, string>> = Object.fromEntries(
  FASES_VENTA.map((f) => [f.posicion, f.nombre])
);
