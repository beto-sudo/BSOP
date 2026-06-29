/**
 * Tipos + normalización de DEPÓSITOS DILESA para el reporte de detonaciones
 * (ADR-047). Grano: un abono de `erp.cxc_pagos` ligado a una venta DILESA vía
 * `origen_id` (mismo amarre que `cuadratura-server`). Distingue origen
 * cliente (enganche/abono) vs institución (liberación de crédito = la
 * «detonación» de fase 12).
 *
 * Módulo PURO (sin Supabase ni React): lo comparten el hook del browser
 * (`use-detonaciones-reporte`) y el loader server (`detonaciones-data-server`,
 * rutas PDF/CSV). `normalizarDepositos` deriva el shape una sola vez →
 * paridad pantalla ↔ PDF ↔ CSV.
 */

/** Origen del depósito tal como lo guarda `erp.cxc_pagos.fuente`. */
export type FuenteDeposito = 'cliente' | 'institucion' | 'otro';

/** Depósito normalizado con los campos que consume el reporte. */
export type DepositoReporteRow = {
  id: string;
  /** Fecha del depósito `YYYY-MM-DD`. */
  fecha: string;
  /** Mes del depósito `YYYY-MM` (agrupador). */
  mes: string;
  monto: number;
  fuente: FuenteDeposito;
  /** Forma de pago libre (transferencia, cheque, efectivo…). */
  formaPago: string | null;
  /** Referencia/folio del movimiento. */
  referencia: string | null;
  /** Nombre de la cuenta bancaria que recibió (null si no asignada). */
  cuentaBancaria: string | null;
  /** UUID del CFDI si el abono trae comprobante fiscal. */
  uuidSat: string | null;
  /** Venta ligada (null = depósito sin ligar a una venta). */
  ventaId: string | null;
  cliente: string;
  proyectoId: string | null;
  proyectoNombre: string;
  unidadIdentificador: string | null;
  /** Tipo de crédito de la venta = la institución cuando `fuente='institucion'`. */
  tipoCredito: string | null;
  faseActual: string | null;
  estadoVenta: string | null;
  /** ¿La venta llegó a Detonada (fase ≥ 12)? Contexto contable. */
  ventaDetonada: boolean;
};

export type DepositoRaw = {
  id: string;
  fecha: string;
  monto_total: number | null;
  fuente: string | null;
  forma_pago: string | null;
  referencia: string | null;
  cuenta_bancaria_id: string | null;
  uuid_sat: string | null;
  origen_id: string | null;
};

export type VentaDepositoRaw = {
  id: string;
  persona_id: string;
  unidad_id: string | null;
  tipo_credito: string | null;
  fase_actual: string | null;
  fase_posicion: number | null;
  estado: string | null;
};

export type DepositosRawBundle = {
  depositos: readonly DepositoRaw[];
  ventas: ReadonlyArray<VentaDepositoRaw>;
  unidades: ReadonlyArray<{ id: string; identificador: string | null; proyecto_id: string | null }>;
  proyectos: ReadonlyArray<{ id: string; nombre: string }>;
  personas: ReadonlyArray<{
    id: string;
    nombre: string | null;
    apellido_paterno: string | null;
    apellido_materno: string | null;
  }>;
  cuentas: ReadonlyArray<{ id: string; nombre: string }>;
};

/** El SELECT de depósitos que necesita el reporte (mantener en sync con DepositoRaw). */
export const DEPOSITOS_SELECT =
  'id, fecha, monto_total, fuente, forma_pago, referencia, cuenta_bancaria_id, uuid_sat, origen_id';

/** El SELECT de ventas para el reporte de depósitos (mantener en sync con VentaDepositoRaw). */
export const VENTAS_DEPOSITO_SELECT =
  'id, persona_id, unidad_id, tipo_credito, fase_actual, fase_posicion, estado';

/** Normaliza `cxc_pagos.fuente` (texto libre) al enum del reporte. */
export function normalizarFuente(f: string | null): FuenteDeposito {
  if (f === 'cliente') return 'cliente';
  if (f === 'institucion') return 'institucion';
  return 'otro';
}

/** Etiqueta legible de la fuente. */
export function etiquetaFuente(f: FuenteDeposito): string {
  if (f === 'cliente') return 'Cliente';
  if (f === 'institucion') return 'Institución';
  return 'Otro';
}

/**
 * Normaliza el bundle crudo a filas de reporte. Pura: la usan tanto el fetch
 * del browser como el del server (misma derivación → paridad pantalla/PDF/CSV).
 */
export function normalizarDepositos(b: DepositosRawBundle): DepositoReporteRow[] {
  const ventaMap = new Map(b.ventas.map((v) => [v.id, v]));
  const unidadMap = new Map(
    b.unidades.map((u) => [u.id, { identificador: u.identificador, proyectoId: u.proyecto_id }])
  );
  const proyectoMap = new Map(b.proyectos.map((p) => [p.id, p.nombre]));
  const personaMap = new Map(
    b.personas.map((p) => [
      p.id,
      [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ') ||
        '(sin nombre)',
    ])
  );
  const cuentaMap = new Map(b.cuentas.map((c) => [c.id, c.nombre]));

  return b.depositos.map((d) => {
    const venta = d.origen_id ? ventaMap.get(d.origen_id) : undefined;
    const u = venta?.unidad_id ? unidadMap.get(venta.unidad_id) : null;
    return {
      id: d.id,
      fecha: d.fecha,
      mes: d.fecha.slice(0, 7),
      monto: d.monto_total ?? 0,
      fuente: normalizarFuente(d.fuente),
      formaPago: d.forma_pago,
      referencia: d.referencia,
      cuentaBancaria: d.cuenta_bancaria_id ? (cuentaMap.get(d.cuenta_bancaria_id) ?? null) : null,
      uuidSat: d.uuid_sat,
      ventaId: venta?.id ?? null,
      cliente: venta
        ? (personaMap.get(venta.persona_id) ?? '(sin comprador)')
        : '(sin venta ligada)',
      proyectoId: u?.proyectoId ?? null,
      proyectoNombre: u?.proyectoId ? (proyectoMap.get(u.proyectoId) ?? '') : '',
      unidadIdentificador: u?.identificador ?? null,
      tipoCredito: venta?.tipo_credito ?? null,
      faseActual: venta?.fase_actual ?? null,
      estadoVenta: venta?.estado ?? null,
      ventaDetonada: (venta?.fase_posicion ?? 0) >= 12,
    };
  });
}

/**
 * Proyectos presentes EN LOS DEPÓSITOS (para el selector de filtro), únicos por
 * id y ordenados por nombre. Simétrico con `proyectosPresentes` de `ventas-data`:
 * se deriva del propio dataset para no traer cascarones del catálogo.
 */
export function proyectosDepositos(
  depositos: readonly DepositoReporteRow[]
): Array<{ id: string; nombre: string }> {
  const porId = new Map<string, string>();
  for (const d of depositos) {
    if (d.proyectoId && d.proyectoNombre) porId.set(d.proyectoId, d.proyectoNombre);
  }
  return [...porId.entries()]
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
