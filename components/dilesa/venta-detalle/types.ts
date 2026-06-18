/**
 * Tipos, constantes y helpers puros compartidos por el expediente de venta
 * DILESA (`app/dilesa/ventas/[id]/**`).
 *
 * Extraídos del antiguo monolito `[id]/page.tsx` (iniciativa
 * `dilesa-ventas-expediente-tabs`) para que el provider, los sub-componentes
 * de UI y las páginas de cada tab compartan una sola fuente. Sin estado ni
 * 'use client' — solo datos puros, importable desde cualquier capa.
 */
import type { BadgeTone } from '@/components/ui/badge';
import type { Json } from '@/types/supabase';

export type Venta = {
  id: string;
  empresa_id: string;
  persona_id: string;
  unidad_id: string | null;
  vendedor_usuario_id: string | null;
  estado: string;
  expira_at: string | null;
  fase_actual: string | null;
  fase_posicion: number | null;
  tipo_credito: string | null;
  valor_comercial: number | null;
  valor_escrituracion: number | null;
  precio_asignacion: number | null;
  productos_adicionales: number | null;
  // Desglose nuevo (ADR-045): marcadores del modelo desglosado.
  precio_base: number | null;
  incremento_credito: number | null;
  promocion_gastos_monto: number | null;
  // Geometría del lote (migración 20260618): componentes del precio.
  valor_excedente_terreno: number | null;
  valor_frente_verde: number | null;
  valor_esquina: number | null;
  valor_venta_futuro: number | null;
  monto_credito_titular: number | null;
  monto_credito_cotitular: number | null;
  credito_titular_ref: string | null;
  credito_cotitular_ref: string | null;
  monto_credito_directo: number | null;
  enganche_requerido: number | null;
  descuento_total: number | null;
  comision_vendedor: number | null;
  comision_gerencia: number | null;
  anticipo_comision: number | null;
  monto_avaluo: number | null;
  gastos_escrituracion: number | null;
  numero_cheque_notaria: string | null;
  monto_cheque_notaria: number | null;
  apoyo_infonavit: number | null;
  descuento_precio: number | null;
  descuento_equipamiento: number | null;
  descuento_gastos_escrituracion: number | null;
  descuento_nota_credito: number | null;
  descuento_maximo_autorizado: number | null;
  promocion_id: string | null;
  coda_row_id: string | null;
  monto_detonado: number | null;
  numero_escritura: string | null;
  fecha_escritura: string | null;
  // Opcional hasta que la migración 20260611190612 esté aplicada (select('*')).
  notif_escrituracion_at?: string | null;
  // Fechas/montos por fase (resumen "qué se capturó" del pipeline).
  fecha_solicitud_avaluo: string | null;
  fecha_avaluo_cerrado: string | null;
  fecha_solicitud_dictamen: string | null;
  fecha_dictaminada: string | null;
  fecha_validacion_patronal: string | null;
  fecha_firma_programada: string | null;
  fecha_detonacion: string | null;
  valor_facturado: number | null;
  valor_real_venta_dilesa: number | null;
  monto_nota_credito: number | null;
  vendedor: string | null;
  notario: string | null;
  casa_valuadora: string | null;
  valuador_id: string | null;
  notario_id: string | null;
  es_pep: boolean | null;
  ocupacion: string | null;
  ine_numero: string | null;
  forma_pago: string | null;
  uso_efectivo: string | null;
  conocimiento_dueno_beneficiario: string | null;
  motivo_desasignacion: string | null;
  notas: string | null;
  // Snapshot del desglose de precio (regla Beto 2026-06-15) — congelado al
  // asignar; el detalle NO recalcula en vivo. Ver lib/dilesa/desglose-precio.
  desglose_precio: Json | null;
};

export type Persona = {
  nombre: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  email: string | null;
  telefono: string | null;
  curp: string | null;
  rfc: string | null;
  nss: string | null;
  fecha_nacimiento: string | null;
  nacionalidad: string | null;
  tipo_persona: string | null;
  estado_civil: string | null;
  domicilio: string | null;
  // KYC + INE + domicilio estructurado (form Sprint 7c-2) — la resolución
  // persona-vs-venta vive en lib/dilesa/kyc-efectivo.
  ocupacion: string | null;
  forma_pago_kyc: string | null;
  uso_efectivo_kyc: string | null;
  conocimiento_dueno_beneficiario: string | null;
  es_pep: boolean | null;
  numero_credencial_ine: string | null;
  domicilio_calle: string | null;
  domicilio_numero_exterior: string | null;
  domicilio_numero_interior: string | null;
  domicilio_colonia: string | null;
  domicilio_codigo_postal: string | null;
  domicilio_ciudad: string | null;
  domicilio_estado: string | null;
};

export type UnidadInfo = {
  identificador: string;
  proyecto_id: string | null;
  producto_id: string | null;
};

export type Fase = {
  id: string;
  fase: string;
  posicion: number | null;
  fecha: string | null;
  registrado_por: string | null;
};

export type Cargo = {
  id: string;
  tipo_cargo: string;
  numero: number;
  concepto: string | null;
  monto: number;
  monto_pagado: number;
  saldo: number;
  fecha_vencimiento: string | null;
  estado: string;
  fuente_esperada: string;
};

export type Abono = {
  id: string;
  fecha: string | null;
  monto_total: number;
  fuente: string;
  forma_pago: string | null;
  referencia: string | null;
  notas: string | null;
  /** Folio fiscal del recibo de caja (CFDI) — null si se capturó sin XML. */
  uuid_sat: string | null;
};

export type Adjunto = {
  id: string;
  entidad_tipo: string;
  entidad_id: string;
  rol: string;
  nombre: string;
  url: string;
  tipo_mime: string | null;
};

export const moneyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

/**
 * Slugs de captura disponibles — mapea posición de fase → slug de la page de
 * captura. Si la fase no está aquí, el botón "Capturar" no aparece (la fase no
 * es capturable aún desde BSOP).
 */
export const CAPTURAR_SLUG_BY_POSICION: Record<number, string> = {
  2: '2-asignada',
  3: '3-formalizada',
  4: '4-solicitud-avaluo',
  5: '5-avaluo-cerrado',
  6: '6-inscrita',
  7: '7-solicitud-dictamen',
  8: '8-dictaminada',
  9: '9-validacion-patronal',
  10: '10-firmas-programadas',
  11: '11-escriturada',
  12: '12-detonada',
  13: '13-facturada',
  14: '14-preparada-entrega',
  15: '15-entregada',
  16: '16-conformidad',
  17: '17-operacion-terminada',
};

/**
 * Gate de apertura por fase cuando NO es la inmediata anterior. Beto
 * (2026-06-10): la preparación de entrega (14) arranca desde que se registra
 * la escritura (11) — no espera Detonada (12) ni Facturada (13).
 */
export const GATE_PREVIA_OVERRIDE: Record<number, number> = {
  14: 11,
};

/** Las 17 fases canónicas en orden — para mostrar incluso las no alcanzadas. */
export const FASES_ORDEN: Array<{ pos: number; nombre: string }> = [
  { pos: 1, nombre: 'Solicitud de Asignación' },
  { pos: 2, nombre: 'Asignada' },
  { pos: 3, nombre: 'Formalizada' },
  { pos: 4, nombre: 'Solicitud de Avalúo' },
  { pos: 5, nombre: 'Avalúo Cerrado' },
  { pos: 6, nombre: 'Inscrita' },
  { pos: 7, nombre: 'Solicitud de Dictaminación' },
  { pos: 8, nombre: 'Dictaminada' },
  { pos: 9, nombre: 'Validación Patronal' },
  { pos: 10, nombre: 'Firmas Programadas' },
  { pos: 11, nombre: 'Escriturada' },
  { pos: 12, nombre: 'Detonada' },
  { pos: 13, nombre: 'Facturada' },
  { pos: 14, nombre: 'Preparada para Entrega' },
  { pos: 15, nombre: 'Entregada' },
  { pos: 16, nombre: 'Conformidad del Cliente' },
  { pos: 17, nombre: 'Operación Terminada' },
];

/**
 * Las 17 fases agrupadas en 5 macro-etapas (Zona B del Expediente de
 * Operación) — para que el pipeline se lea como 5 pasos, no como 17.
 */
export const MACRO_ETAPAS: Array<{ nombre: string; desde: number; hasta: number }> = [
  { nombre: 'Comercial', desde: 1, hasta: 3 },
  { nombre: 'Crédito', desde: 4, hasta: 9 },
  { nombre: 'Cierre legal', desde: 10, hasta: 12 },
  { nombre: 'Administrativo', desde: 13, hasta: 13 },
  { nombre: 'Entrega', desde: 14, hasta: 17 },
];

export function fmtMoney(n: number | null | undefined): string | null {
  return n == null ? null : moneyFmt.format(n);
}

export function fmtFecha(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function capitalizar(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

export function fuenteLabel(f: string): string {
  return f === 'institucion' ? 'Institución' : 'Cliente';
}

export function estadoTone(e: string): BadgeTone {
  switch (e) {
    case 'liquidado':
      return 'success';
    case 'parcial':
      return 'warning';
    case 'cancelado':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function fuenteTone(f: string): BadgeTone {
  return f === 'institucion' ? 'accent' : 'info';
}
