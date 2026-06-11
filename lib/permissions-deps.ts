/**
 * Dependencias de navegación entre sub-permisos (iniciativa
 * `accesos-intuitivos`, S1).
 *
 * Un permiso "depende" de otro cuando su página vive ANIDADA bajo una página
 * gobernada por otro slug: para capturar la Fase 3 de una venta atraviesas la
 * lista (`/dilesa/ventas`) y el expediente (`/dilesa/ventas/[id]`), ambos
 * gobernados por `dilesa.ventas.lista`. Un rol con la fase pero sin la lista
 * es incoherente: el usuario ve "Acceso restringido" antes de llegar (caso
 * Nelcy, 2026-06-11).
 *
 * La matriz de Accesos usa este mapa para auto-activar la LECTURA de los
 * requisitos al otorgar un permiso (la escritura nunca se otorga implícita).
 *
 * Reglas de mantenimiento (el test de sync las enforza):
 * - TODO slug usado por una página (`ROUTE_TO_MODULE` + los RequireAccess de
 *   páginas anidadas) debe tener entrada aquí — vacía si no depende de nada.
 * - Tabs hermanas de un hub (ADR-030) NO se dependen entre sí: cada una
 *   gobierna su contenido y el sidebar las resuelve solo (#811).
 * - Solo se declara el requisito DIRECTO; la clausura transitiva la calcula
 *   `requisitosDe`.
 */

/** Sub-slug → slugs cuya LECTURA requiere para ser alcanzable navegando. */
export const MODULE_DEPS: Record<string, readonly string[]> = {
  // ── DILESA · Ventas ────────────────────────────────────────────────────────
  // Las capturas de fase viven bajo el expediente (/dilesa/ventas/[id]/capturar/*)
  // y el expediente + la lista piden `dilesa.ventas.lista`.
  'dilesa.ventas.lista': [],
  'dilesa.ventas.fase01_solicitud': ['dilesa.ventas.lista'],
  'dilesa.ventas.autorizar': ['dilesa.ventas.lista'], // captura Fase 2 — Asignada
  'dilesa.ventas.fase03_formalizada': ['dilesa.ventas.lista'],
  'dilesa.ventas.fase04_solicitud_avaluo': ['dilesa.ventas.lista'],
  'dilesa.ventas.fase05_avaluo_cerrado': ['dilesa.ventas.lista'],
  'dilesa.ventas.fase06_inscrita': ['dilesa.ventas.lista'],
  'dilesa.ventas.fase07_solicitud_dictamen': ['dilesa.ventas.lista'],
  'dilesa.ventas.fase08_dictaminada': ['dilesa.ventas.lista'],
  'dilesa.ventas.fase09_validacion_patronal': ['dilesa.ventas.lista'],
  'dilesa.ventas.fase10_firmas_programadas': ['dilesa.ventas.lista'],
  'dilesa.ventas.fase11_escriturada': ['dilesa.ventas.lista'],
  'dilesa.ventas.fase12_detonada': ['dilesa.ventas.lista'],
  'dilesa.ventas.fase13_facturada': ['dilesa.ventas.lista'],
  'dilesa.ventas.fase14_preparada_entrega': ['dilesa.ventas.lista'],
  'dilesa.ventas.fase15_entregada': ['dilesa.ventas.lista'],
  'dilesa.ventas.fase16_conformidad': ['dilesa.ventas.lista'],
  'dilesa.ventas.fase17_operacion_terminada': ['dilesa.ventas.lista'],
  // `fase02_asignada` existe en RBAC pero la pantalla de Fase 2 la gobierna
  // `autorizar`; se conserva sin dependencias mientras no gobierne página.
  'dilesa.ventas.fase02_asignada': [],
  'dilesa.ventas.clientes': [],
  'dilesa.ventas.fases': [],
  'dilesa.ventas.inventario': [],
  'dilesa.ventas.vendedores': [],

  // ── DILESA · Proyectos ─────────────────────────────────────────────────────
  // El tab Gasto vive bajo el detalle del proyecto (/dilesa/proyectos/[id]/gasto),
  // gobernado por `dilesa.proyectos.activos`.
  'dilesa.proyectos.activos': [],
  'dilesa.proyectos.gasto': ['dilesa.proyectos.activos'],
  'dilesa.proyectos.anteproyectos': [],

  // ── Resto: tabs hermanas / páginas top-level, sin dependencias ─────────────
  'dilesa.cobranza.pagos': [],
  'dilesa.cobranza.aging': [],
  'dilesa.compras.ordenes': [],
  'dilesa.compras.costo_materiales': [],
  'dilesa.compras.cotizaciones': [],
  'dilesa.compras.recepciones': [],
  'dilesa.compras.requisiciones': [],
  'dilesa.construccion.obras': [],
  'dilesa.construccion.contratistas': [],
  'dilesa.construccion.contratos': [],
  'dilesa.construccion.costeo': [],
  'dilesa.construccion.estimaciones': [],
  'dilesa.construccion.prototipos': [],
  'dilesa.cxp.facturas': [],
  'dilesa.cxp.aging': [],
  'dilesa.cxp.pagos': [],
  'dilesa.cxp.programacion': [],
  'dilesa.cxp.proveedores': [],
  'dilesa.manual': [],
  'dilesa.portafolio': [],
  'dilesa.proveedores': [],
  'dilesa.ruv': [],
  'dilesa.saldos-bancos': [],
  'rdb.admin.documentos': [],
  'rdb.admin.juntas': [],
  'rdb.cxp.facturas': [],
  'rdb.cxp.aging': [],
  'rdb.cxp.pagos': [],
  'rdb.cxp.programacion': [],
  'rdb.cxp.proveedores': [],
  'rdb.home': [],
  'rdb.inventario.stock': [],
  'rdb.inventario.levantamientos': [],
  'rdb.inventario.movimientos': [],
  'rdb.ordenes_compra': [],
  'rdb.productos.catalogo': [],
  'rdb.productos.analisis': [],
  'rdb.productos.auditoria': [],
  'rdb.productos.categorias': [],
  'rdb.productos.recetas': [],
  'rdb.proveedores': [],
  'rdb.recepciones': [],
  'rdb.requisiciones': [],
  'rdb.rh.departamentos': [],
  'rdb.rh.empleados': [],
  'rdb.rh.puestos': [],
  'rdb.ventas': [],
  'settings.empresas': [],
};

/**
 * Clausura transitiva de requisitos de un slug (sin incluir el slug mismo).
 * Orden estable: BFS desde las dependencias directas.
 */
export function requisitosDe(slug: string): string[] {
  const vistos = new Set<string>();
  const cola = [...(MODULE_DEPS[slug] ?? [])];
  while (cola.length > 0) {
    const dep = cola.shift()!;
    if (vistos.has(dep)) continue;
    vistos.add(dep);
    cola.push(...(MODULE_DEPS[dep] ?? []));
  }
  return [...vistos];
}

/**
 * Requisitos de `slug` que NO están en el set de slugs con lectura activa.
 * La matriz de Accesos los auto-activa (lectura) al otorgar `slug`.
 */
export function requisitosFaltantes(slug: string, conLectura: ReadonlySet<string>): string[] {
  return requisitosDe(slug).filter((dep) => !conLectura.has(dep));
}
