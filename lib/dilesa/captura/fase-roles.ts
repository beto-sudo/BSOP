/**
 * Catálogo documental del pipeline de ventas: qué adjuntos (roles) aporta
 * cada fase, sus labels humanos, y cuáles son condicionales según los datos
 * de la venta. Fuente única para el detalle (chips cargados/faltantes), el
 * copiloto de cierre y la página de Operación Terminada (F17).
 *
 * Iniciativa dilesa-ventas-expediente (movido del detalle en S4).
 */

export const FASE_ROLES: Record<string, string[]> = {
  'Solicitud de Asignación': ['solicitud_asignacion'],
  Asignada: ['solicitud_asignacion', 'expediente_digital', 'ficu', 'aviso_privacidad'],
  Formalizada: ['contrato_promesa'],
  'Solicitud de Avalúo': [],
  'Avalúo Cerrado': ['avaluo_comercial'],
  // Beto: las Constancias de Crédito (titular + co-titular) van en Inscrita
  // (el banco las entrega al inscribir el crédito). La Carta de instrucción
  // notarial queda en Dictaminada (sale después con el dictamen jurídico).
  Inscrita: ['constancia_credito_titular', 'constancia_credito_cotitular'],
  'Solicitud de Dictaminación': ['aprobacion_credito'],
  Dictaminada: ['carta_instruccion_notarial', 'condiciones_financieras'],
  'Validación Patronal': ['validacion_patronal'],
  'Firmas Programadas': [],
  Escriturada: ['pagare'],
  Detonada: ['imagen_detonacion'],
  Facturada: ['factura', 'nota_credito', 'aviso_pld'],
  'Preparada para Entrega': ['checklist_pre_entrega'],
  Entregada: ['checklist_entrega'],
  'Conformidad del Cliente': [],
  'Operación Terminada': [],
};

export const ROL_LABEL: Record<string, string> = {
  factura: 'Factura',
  aprobacion_credito: 'Aprobación de crédito',
  constancia_credito_titular: 'Constancia de crédito (titular)',
  constancia_credito_cotitular: 'Constancia de crédito (co-titular)',
  aviso_pld: 'Aviso PLD',
  avaluo_comercial: 'Avalúo comercial',
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
 * Roles que NO se exigen para el cierre porque la venta no los amerita:
 * - constancia co-titular: solo si hay crédito de co-titular.
 * - pagaré: solo si hay crédito directo (CD).
 * - nota de crédito: solo si el monto de nota de crédito es > 0.
 * - condiciones financieras (Anexo B): formato INFONAVIT — en otros créditos
 *   el notario no lo manda.
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
  return opc;
}
