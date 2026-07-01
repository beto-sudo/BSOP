/**
 * Tipos + normalización del reporte «Unidades escriturables» (ADR-047).
 *
 * Módulo PURO (sin red ni DOM) — la vista y el PDF consumen el mismo motor.
 *
 * Universo (candidatas a escriturar), definido con Beto (2026-07-01):
 *  (a) **inventario** — unidades vendibles hoy (mismo criterio que el módulo
 *      Inventario: `estado IN ('en_construccion','terminada')`, `activo_id
 *      IS NULL`, no muestra), y
 *  (b) **asignadas** — unidades de ventas `activa`s que aún NO se marcan
 *      escrituradas (`numero_escritura IS NULL`), sin importar la fase.
 *
 * **Escriturable** = obra terminada + extracción del RUV capturada
 * (`dilesa.unidades.fecha_extraccion`). La extracción siempre ocurre después
 * del DTU en el trámite, por eso basta la extracción como señal del RUV.
 *
 * Obra terminada: `unidades.estado = 'terminada'` (caso inventario) **o** su
 * construcción con `fecha_terminada` / `estado = 'terminada'` (caso asignadas,
 * donde el estado comercial de la unidad pisa el físico).
 */

export type UnidadEscriturableRaw = {
  id: string;
  identificador: string;
  estado: string;
  proyecto_id: string | null;
  producto_id: string | null;
  fecha_dtu: string | null;
  fecha_extraccion: string | null;
  activo_id: string | null;
};

/** Venta activa sin escriturar (ya filtrada así en la query). */
export type VentaCandidataRaw = {
  id: string;
  unidad_id: string | null;
  persona_id: string;
  fase_actual: string | null;
};

export type ObraRaw = {
  unidad_id: string;
  fecha_terminada: string | null;
  estado: string;
};

export type EscriturableSituacion = 'inventario' | 'asignada';

export type UnidadEscriturableRow = {
  unidadId: string;
  /** Identificador con sufijo de prototipo (ej. `M3-L9-LDLE-ISC`). */
  identificadorCompleto: string;
  proyectoNombre: string;
  prototipo: string | null;
  situacion: EscriturableSituacion;
  /** Comprador (solo asignadas). */
  cliente: string | null;
  /** Fase actual de la venta (solo asignadas). */
  faseActual: string | null;
  obraTerminada: boolean;
  /** `fecha_terminada` de la construcción más reciente, si existe. */
  fechaObraTerminada: string | null;
  fechaDtu: string | null;
  fechaExtraccion: string | null;
  /** obra terminada + extracción capturada. */
  escriturable: boolean;
};

export type EscriturablesBundle = {
  unidades: readonly UnidadEscriturableRaw[];
  /** Ventas activas con `numero_escritura IS NULL`. */
  ventas: readonly VentaCandidataRaw[];
  obras: readonly ObraRaw[];
  proyectos: ReadonlyArray<{ id: string; nombre: string }>;
  productos: ReadonlyArray<{ id: string; nombre: string }>;
  /** persona_id → nombre completo del comprador. */
  clientes: ReadonlyMap<string, string>;
};

export const UNIDADES_ESCRITURABLES_SELECT =
  'id, identificador, estado, proyecto_id, producto_id, fecha_dtu, fecha_extraccion, activo_id';
export const VENTAS_CANDIDATAS_SELECT = 'id, unidad_id, persona_id, fase_actual';
export const OBRAS_SELECT = 'unidad_id, fecha_terminada, estado';

/** Estados de unidad que cuentan como inventario vendible (espejo del módulo Inventario). */
const ESTADOS_INVENTARIO = new Set(['en_construccion', 'terminada']);

export function normalizarEscriturables(b: EscriturablesBundle): UnidadEscriturableRow[] {
  const proyectoMap = new Map(b.proyectos.map((p) => [p.id, p.nombre]));
  const productoMap = new Map(b.productos.map((p) => [p.id, p.nombre]));

  // Una venta activa sin escriturar por unidad (si hubiera más de una — no
  // debería — gana la primera; el reporte es por unidad, no por venta).
  const ventaPorUnidad = new Map<string, VentaCandidataRaw>();
  for (const v of b.ventas) {
    if (v.unidad_id && !ventaPorUnidad.has(v.unidad_id)) ventaPorUnidad.set(v.unidad_id, v);
  }

  // Obra terminada por unidad: fecha_terminada más reciente o estado terminal.
  const fechaObraMap = new Map<string, string>();
  const obraTerminadaSet = new Set<string>();
  for (const o of b.obras) {
    if (o.estado === 'terminada') obraTerminadaSet.add(o.unidad_id);
    if (o.fecha_terminada) {
      obraTerminadaSet.add(o.unidad_id);
      const prev = fechaObraMap.get(o.unidad_id);
      if (!prev || o.fecha_terminada > prev) fechaObraMap.set(o.unidad_id, o.fecha_terminada);
    }
  }

  const rows: UnidadEscriturableRow[] = [];
  for (const u of b.unidades) {
    const venta = ventaPorUnidad.get(u.id) ?? null;
    // Situación: la venta activa manda; si no hay, entra solo si es
    // inventario vendible (excluye planeada/lote_urbanizado/portafolio y
    // las vendidas ya escrituradas).
    let situacion: EscriturableSituacion;
    if (venta) situacion = 'asignada';
    else if (ESTADOS_INVENTARIO.has(u.estado) && u.activo_id == null) situacion = 'inventario';
    else continue;

    const proto = u.producto_id ? (productoMap.get(u.producto_id) ?? null) : null;
    const protoSufijo = proto ? proto.split('-').pop() : null;
    const obraTerminada = u.estado === 'terminada' || obraTerminadaSet.has(u.id);

    rows.push({
      unidadId: u.id,
      identificadorCompleto: protoSufijo ? `${u.identificador}-${protoSufijo}` : u.identificador,
      proyectoNombre: u.proyecto_id ? (proyectoMap.get(u.proyecto_id) ?? '') : '',
      prototipo: proto,
      situacion,
      cliente: venta ? (b.clientes.get(venta.persona_id) ?? '(sin comprador)') : null,
      faseActual: venta?.fase_actual ?? null,
      obraTerminada,
      fechaObraTerminada: fechaObraMap.get(u.id) ?? null,
      fechaDtu: u.fecha_dtu,
      fechaExtraccion: u.fecha_extraccion,
      escriturable: obraTerminada && u.fecha_extraccion != null,
    });
  }
  return rows;
}

export function proyectosDeEscriturables(rows: readonly UnidadEscriturableRow[]): string[] {
  return [...new Set(rows.map((r) => r.proyectoNombre).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es')
  );
}
