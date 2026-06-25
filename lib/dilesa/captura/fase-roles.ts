/**
 * Catálogo documental del pipeline de ventas: qué adjuntos (roles) aporta
 * cada fase, sus labels humanos, y cuáles son condicionales según los datos
 * de la venta. Fuente única para el detalle (chips cargados/faltantes), el
 * copiloto de cierre y la página de Operación Terminada (F17).
 *
 * Iniciativa dilesa-ventas-expediente (movido del detalle en S4).
 */

// Llaveado por POSICIÓN (1–17), no por nombre: los renombres de fase (que viven
// en `lib/dilesa/fases.ts`) no tocan este mapa. El comentario al lado de cada
// entrada recuerda qué fase es.
export const FASE_ROLES: Record<number, string[]> = {
  1: ['solicitud_asignacion'], // Asignación Solicitada
  2: ['solicitud_asignacion', 'expediente_digital', 'ficu', 'aviso_privacidad'], // Asignada
  3: ['contrato_promesa'], // Formalizada
  4: [], // Avalúo Solicitado
  // Avalúo Cerrado. Los 2 docs del seguro de calidad (RUV) solo se EXIGEN en
  // créditos Infonavit/Cofinavit — `rolesOpcionales` los exime en el resto.
  5: ['avaluo_comercial', 'orden_pago_seguro_calidad', 'solicitud_pago_seguro_calidad'],
  // Beto: las Constancias de Crédito (titular + co-titular) van al inscribir el
  // crédito (pos 6) — el banco las entrega ahí. La Carta de instrucción notarial
  // queda en el dictamen (pos 8, sale después con el dictamen jurídico).
  6: ['constancia_credito_titular', 'constancia_credito_cotitular'], // Inscrita
  7: ['aprobacion_credito'], // Dictamen Solicitado
  8: ['carta_instruccion_notarial', 'condiciones_financieras'], // Dictaminada
  9: ['validacion_patronal'], // Validación Patronal
  10: [], // Firmas Programadas
  11: ['pagare'], // Escriturada
  12: ['imagen_detonacion'], // Detonada
  13: ['factura', 'nota_credito', 'aviso_pld'], // Facturada
  14: ['checklist_pre_entrega'], // Preparada para Entrega
  15: ['checklist_entrega'], // Entregada
  16: [], // Conformidad del Cliente
  17: [], // Operación Terminada
};

export const ROL_LABEL: Record<string, string> = {
  factura: 'Factura',
  aprobacion_credito: 'Aprobación de crédito',
  constancia_credito_titular: 'Constancia de crédito (titular)',
  constancia_credito_cotitular: 'Constancia de crédito (co-titular)',
  aviso_pld: 'Aviso PLD',
  avaluo_comercial: 'Avalúo comercial',
  orden_pago_seguro_calidad: 'Orden de pago del seguro de calidad',
  solicitud_pago_seguro_calidad: 'Solicitud de pago del seguro de calidad',
  contrato_promesa: 'Contrato promesa de compraventa',
  solicitud_asignacion: 'Solicitud de asignación',
  recibos_caja: 'Recibos de caja',
  expediente_digital: 'Expediente digital',
  ficu: 'FICU',
  aviso_privacidad: 'Aviso de privacidad',
  carta_instruccion_notarial: 'Carta instrucción notarial',
  checklist_entrega: 'Checklist de entrega',
  checklist_pre_entrega: 'Checklist pre-entrega',
  validacion_patronal: 'Validación patronal',
  nota_credito: 'Nota de crédito',
  pagare: 'Pagaré',
  imagen_detonacion: 'Imagen de detonación',
  recibo_caja: 'Recibo de caja',
};

export type VentaFlagsDocs = {
  monto_credito_cotitular: number | null;
  monto_credito_directo: number | null;
  monto_nota_credito: number | null;
  tipo_credito: string | null;
};

/**
 * El seguro de calidad (RUV) solo es obligatorio en créditos Infonavit —
 * incluye Cofinavit, que es cofinanciamiento Infonavit + banco (Beto,
 * 2026-06-24). En Fovissste, bancario y contado no aplica. Criterio aparte de
 * `condiciones_financieras` (Anexo B), que sí excluye a Cofinavit.
 */
export function requiereSeguroCalidad(tipoCredito: string | null): boolean {
  const t = (tipoCredito ?? '').toLowerCase();
  return t.includes('infonavit') || t.includes('cofinavit');
}

/**
 * Roles que NO se exigen para el cierre porque la venta no los amerita:
 * - constancia co-titular: solo si hay crédito de co-titular.
 * - pagaré: solo si hay crédito directo (CD).
 * - nota de crédito: solo si el monto de nota de crédito es > 0.
 * - condiciones financieras (Anexo B): formato INFONAVIT — en otros créditos
 *   el notario no lo manda.
 * - orden/solicitud del seguro de calidad: solo en créditos Infonavit/Cofinavit
 *   (ver `requiereSeguroCalidad`).
 */
export function rolesOpcionales(v: VentaFlagsDocs): Set<string> {
  const opc = new Set<string>();
  if (!v.monto_credito_cotitular || Number(v.monto_credito_cotitular) <= 0) {
    opc.add('constancia_credito_cotitular');
  }
  if (!v.monto_credito_directo || Number(v.monto_credito_directo) <= 0) {
    opc.add('pagare');
  }
  if (!v.monto_nota_credito || Number(v.monto_nota_credito) <= 0) {
    opc.add('nota_credito');
  }
  if (!(v.tipo_credito ?? '').toLowerCase().includes('infonavit')) {
    opc.add('condiciones_financieras');
  }
  if (!requiereSeguroCalidad(v.tipo_credito)) {
    opc.add('orden_pago_seguro_calidad');
    opc.add('solicitud_pago_seguro_calidad');
  }
  return opc;
}
