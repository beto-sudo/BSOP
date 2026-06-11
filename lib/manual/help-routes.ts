import { ROUTE_TO_MODULE } from '@/lib/permissions';

/**
 * Resuelve la ruta del doc de ayuda para una pantalla. Tres niveles:
 *
 * 1. **Overrides** (`HELP_ROUTE_OVERRIDES`) — pantallas dinámicas con doc
 *    propio que NO se deriva del módulo RBAC: el Expediente de Operación
 *    (`/dilesa/ventas/[id]`) y las 16 pantallas de captura por fase.
 * 2. **Módulo RBAC** — el slug del módulo (`dilesa.ventas.lista`) corresponde
 *    1:1 a la ruta del `.md` bajo `content/manual/` (`dilesa/ventas/lista`).
 *    Reusa `ROUTE_TO_MODULE`, sin mapa aparte que mantener.
 * 3. **Fallback al padre** — rutas sin match (detalles dinámicos sin doc
 *    propio, p.ej. `/dilesa/proyectos/[id]`) suben por la URL hasta el primer
 *    ancestro mapeado y muestran la ayuda del hub (mejor que "no hay ayuda").
 *
 * Los pathnames reales traen IDs (`/dilesa/ventas/3f2a…`); se normalizan a
 * `[id]` antes de buscar (UUID, numérico puro o hex largo).
 *
 * Devuelve `null` solo cuando ni la ruta ni ningún ancestro tienen doc
 * (p.ej. `/inicio`) → el drawer muestra "todavía no hay ayuda".
 */

const ID_SEGMENT_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+|[0-9a-f]{16,})$/i;

/** `/dilesa/ventas/3f2a…-9c/capturar/4-solicitud-avaluo` → `/dilesa/ventas/[id]/capturar/4-solicitud-avaluo` */
export function normalizeHelpPathname(pathname: string): string {
  return pathname
    .split('/')
    .map((seg) => (ID_SEGMENT_RE.test(seg) ? '[id]' : seg))
    .join('/');
}

/**
 * Pantalla (pathname normalizado) → doc del manual. Solo para rutas cuyo doc
 * no sale del módulo RBAC. Las capturas por fase apuntan a su doc
 * `faseNN_<slug>` (mismo naming que los sub-slugs RBAC de ADR-030).
 */
const HELP_ROUTE_OVERRIDES: Record<string, string> = {
  // Expediente de Operación — el workspace de la venta.
  '/dilesa/ventas/[id]': 'dilesa/ventas/expediente',
  // Captura por fase (la F1 vive en /dilesa/ventas/nueva y resuelve por RBAC).
  '/dilesa/ventas/[id]/capturar/2-asignada': 'dilesa/ventas/fase02_asignada',
  '/dilesa/ventas/[id]/capturar/3-formalizada': 'dilesa/ventas/fase03_formalizada',
  '/dilesa/ventas/[id]/capturar/4-solicitud-avaluo': 'dilesa/ventas/fase04_solicitud_avaluo',
  '/dilesa/ventas/[id]/capturar/5-avaluo-cerrado': 'dilesa/ventas/fase05_avaluo_cerrado',
  '/dilesa/ventas/[id]/capturar/6-inscrita': 'dilesa/ventas/fase06_inscrita',
  '/dilesa/ventas/[id]/capturar/7-solicitud-dictamen': 'dilesa/ventas/fase07_solicitud_dictamen',
  '/dilesa/ventas/[id]/capturar/8-dictaminada': 'dilesa/ventas/fase08_dictaminada',
  '/dilesa/ventas/[id]/capturar/9-validacion-patronal': 'dilesa/ventas/fase09_validacion_patronal',
  '/dilesa/ventas/[id]/capturar/10-firmas-programadas': 'dilesa/ventas/fase10_firmas_programadas',
  '/dilesa/ventas/[id]/capturar/11-escriturada': 'dilesa/ventas/fase11_escriturada',
  '/dilesa/ventas/[id]/capturar/12-detonada': 'dilesa/ventas/fase12_detonada',
  '/dilesa/ventas/[id]/capturar/13-facturada': 'dilesa/ventas/fase13_facturada',
  '/dilesa/ventas/[id]/capturar/14-preparada-entrega': 'dilesa/ventas/fase14_preparada_entrega',
  '/dilesa/ventas/[id]/capturar/15-entregada': 'dilesa/ventas/fase15_entregada',
  '/dilesa/ventas/[id]/capturar/16-conformidad': 'dilesa/ventas/fase16_conformidad',
  '/dilesa/ventas/[id]/capturar/17-operacion-terminada': 'dilesa/ventas/fase17_operacion_terminada',
};

export function resolveHelpSlug(pathname: string): string | null {
  const normalized = normalizeHelpPathname(pathname);

  const override = HELP_ROUTE_OVERRIDES[normalized];
  if (override) return override;

  const direct = ROUTE_TO_MODULE[normalized];
  if (direct) return direct.replaceAll('.', '/');

  // Fallback: recortar segmentos del final hasta el primer ancestro mapeado.
  const parts = normalized.split('/');
  for (let i = parts.length - 1; i > 1; i--) {
    const prefix = parts.slice(0, i).join('/');
    const o = HELP_ROUTE_OVERRIDES[prefix];
    if (o) return o;
    const m = ROUTE_TO_MODULE[prefix];
    if (m) return m.replaceAll('.', '/');
  }
  return null;
}
