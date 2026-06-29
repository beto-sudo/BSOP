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
 * Convención de nombres (2026-06-24, Beto): participio / hito alcanzado — el
 * nombre describe lo que YA se completó en cada paso (Asignada, Escriturada,
 * Entregada). Se probó el infinitivo ("acción a realizar") pero causaba un
 * desfase por uno en los badges de estado: `fase_actual` es la última fase
 * COMPLETADA, no la pendiente, así que una venta "Escriturar" ya había
 * escriturado. "Validación Patronal" conserva el nombre del documento.
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

// Cada fase tiene DOS formas: `nombre` (participio = el ESTADO, "lo que es", lo
// que se persiste en DB) y `accion` (infinitivo = "lo que sigue / lo que se hace
// para llegar a ella"). El estado se muestra en badges/lista/timeline; la acción
// en el CTA "Siguiente fase", el título de la página de captura, y el chip
// "Sigue: …" de cada venta (= la acción de la fase posición+1).
export const FASES_VENTA = [
  {
    posicion: 1,
    nombre: 'Asignación Solicitada',
    accion: 'Solicitar asignación',
    slug: '1-solicitud-asignacion',
  },
  { posicion: 2, nombre: 'Asignada', accion: 'Asignar unidad', slug: '2-asignada' },
  { posicion: 3, nombre: 'Formalizada', accion: 'Formalizar promesa', slug: '3-formalizada' },
  {
    posicion: 4,
    nombre: 'Avalúo Solicitado',
    accion: 'Solicitar avalúo',
    slug: '4-solicitud-avaluo',
  },
  { posicion: 5, nombre: 'Avalúo Cerrado', accion: 'Cerrar avalúo', slug: '5-avaluo-cerrado' },
  { posicion: 6, nombre: 'Inscrita', accion: 'Inscribir crédito', slug: '6-inscrita' },
  {
    posicion: 7,
    nombre: 'Dictamen Solicitado',
    accion: 'Solicitar dictamen',
    slug: '7-solicitud-dictamen',
  },
  { posicion: 8, nombre: 'Dictaminada', accion: 'Dictaminar', slug: '8-dictaminada' },
  {
    posicion: 9,
    nombre: 'Validación Patronal',
    accion: 'Recabar validación patronal',
    slug: '9-validacion-patronal',
  },
  {
    posicion: 10,
    nombre: 'Firmas Programadas',
    accion: 'Programar firmas',
    slug: '10-firmas-programadas',
  },
  { posicion: 11, nombre: 'Escriturada', accion: 'Escriturar', slug: '11-escriturada' },
  { posicion: 12, nombre: 'Detonada', accion: 'Detonar crédito', slug: '12-detonada' },
  { posicion: 13, nombre: 'Facturada', accion: 'Facturar', slug: '13-facturada' },
  {
    posicion: 14,
    nombre: 'Preparada para Entrega',
    accion: 'Preparar entrega',
    slug: '14-preparada-entrega',
  },
  { posicion: 15, nombre: 'Entregada', accion: 'Entregar', slug: '15-entregada' },
  {
    posicion: 16,
    nombre: 'Conformidad del Cliente',
    accion: 'Recabar conformidad',
    slug: '16-conformidad',
  },
  {
    posicion: 17,
    nombre: 'Operación Terminada',
    accion: 'Cerrar operación',
    slug: '17-operacion-terminada',
  },
] as const;

export type FaseSlug = (typeof FASES_VENTA)[number]['slug'];

const NOMBRE_BY_POS: ReadonlyMap<number, string> = new Map(
  FASES_VENTA.map((f) => [f.posicion, f.nombre])
);
const ACCION_BY_POS: ReadonlyMap<number, string> = new Map(
  FASES_VENTA.map((f) => [f.posicion, f.accion])
);

/** Nombre/ESTADO visible de una fase (participio) por su posición. */
export function nombreFase(posicion: number): string {
  return NOMBRE_BY_POS.get(posicion) ?? `Fase ${posicion}`;
}

/** ACCIÓN (infinitivo, "lo que se hace") de una fase por su posición. */
export function accionFase(posicion: number): string {
  return ACCION_BY_POS.get(posicion) ?? nombreFase(posicion);
}

/**
 * Quién controla principalmente el tiempo de cada fase (iniciativa
 * dilesa-fluidez-pipeline, R1). Las de `tercero` (avalúo, Infonavit, notaría) no
 * deben cargarse al equipo cuando lleguen al score por venta (S2b); en el radar
 * por fase (S2a) son solo una etiqueta informativa. `mixta` = depende de ambos.
 *
 * PROPUESTA INICIAL — confirmar con Beto. Es metadata estática y barata de
 * ajustar (solo este mapa).
 */
export type FaseResponsable = 'interna' | 'tercero' | 'mixta';

const RESPONSABLE_BY_POS: ReadonlyMap<number, FaseResponsable> = new Map([
  [1, 'interna'], // Asignación Solicitada
  [2, 'interna'], // Asignada
  [3, 'interna'], // Formalizada (promesa)
  [4, 'interna'], // Avalúo Solicitado (lo pedimos nosotros)
  [5, 'tercero'], // Avalúo Cerrado (perito externo)
  [6, 'tercero'], // Inscrita (Infonavit inscribe el crédito)
  [7, 'interna'], // Dictamen Solicitado
  [8, 'tercero'], // Dictaminada (Infonavit)
  [9, 'tercero'], // Validación Patronal (patrón / Infonavit)
  [10, 'interna'], // Firmas Programadas
  [11, 'tercero'], // Escriturada (notaría)
  [12, 'tercero'], // Detonada (Infonavit deposita)
  [13, 'interna'], // Facturada
  [14, 'interna'], // Preparada para Entrega
  [15, 'interna'], // Entregada
  [16, 'mixta'], // Conformidad del Cliente
  [17, 'interna'], // Operación Terminada
]);

/** Responsable principal del tiempo de una fase (interna/tercero/mixta). */
export function responsableFase(posicion: number): FaseResponsable {
  return RESPONSABLE_BY_POS.get(posicion) ?? 'interna';
}

/**
 * "Lo que sigue" para una venta cuya última fase COMPLETADA es `fasePosicion`:
 * la acción (infinitivo) de la fase siguiente. `null` si ya está en la 17
 * (no hay siguiente) o si no hay posición.
 */
export function proximaFase(
  fasePosicion: number | null | undefined
): { posicion: number; accion: string } | null {
  if (fasePosicion == null || fasePosicion >= 17) return null;
  const siguiente = fasePosicion + 1;
  return { posicion: siguiente, accion: accionFase(siguiente) };
}

/** Record posición → nombre, para lookups O(1) en server actions y rutas API. */
export const FASES_NOMBRE_BY_POS: Readonly<Record<number, string>> = Object.fromEntries(
  FASES_VENTA.map((f) => [f.posicion, f.nombre])
);
