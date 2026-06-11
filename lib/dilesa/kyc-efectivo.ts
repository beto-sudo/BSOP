/**
 * Resolución de fuentes para los datos KYC/identificación del cliente en
 * el expediente DILESA (FICU, promesa, pagaré, pantalla de detalle).
 *
 * Hay DOS poblaciones de ventas con los datos en lugares distintos:
 *
 *   - Importadas de Coda: KYC + INE per-venta en `dilesa.ventas`
 *     (ocupacion, forma_pago, uso_efectivo, conocimiento_dueno_beneficiario,
 *     es_pep, ine_numero) y domicilio como blob en `erp.personas.domicilio`.
 *   - Capturadas en BSOP (form Sprint 7c-2): todo en `erp.personas`
 *     (ocupacion, forma_pago_kyc, uso_efectivo_kyc, es_pep,
 *     numero_credencial_ine, domicilio_* estructurado).
 *
 * El backfill 20260611181150 copió los KYC Coda→persona, pero la INE y el
 * domicilio siguen divididos. Regla: gana la fuente con dato; PEP es OR de
 * ambas (nunca degradar un true); la INE per-venta (Coda) gana sobre la de
 * la persona porque es la credencial específica del expediente.
 */

export type KycPersonaFuente = {
  ocupacion?: string | null;
  forma_pago_kyc?: string | null;
  uso_efectivo_kyc?: string | null;
  conocimiento_dueno_beneficiario?: string | null;
  es_pep?: boolean | null;
  numero_credencial_ine?: string | null;
  domicilio?: string | null;
  domicilio_calle?: string | null;
  domicilio_numero_exterior?: string | null;
  domicilio_numero_interior?: string | null;
  domicilio_colonia?: string | null;
  domicilio_codigo_postal?: string | null;
  domicilio_ciudad?: string | null;
  domicilio_estado?: string | null;
};

export type KycVentaFuente = {
  ocupacion?: string | null;
  forma_pago?: string | null;
  uso_efectivo?: string | null;
  conocimiento_dueno_beneficiario?: string | null;
  es_pep?: boolean | null;
  ine_numero?: string | null;
};

export type KycEfectivo = {
  ocupacion: string | null;
  formaPago: string | null;
  usoEfectivo: string | null;
  conocimientoDuenoBeneficiario: string | null;
  esPep: boolean;
  ineNumero: string | null;
};

export function kycEfectivo(
  persona: KycPersonaFuente | null | undefined,
  venta: KycVentaFuente | null | undefined
): KycEfectivo {
  return {
    ocupacion: persona?.ocupacion ?? venta?.ocupacion ?? null,
    formaPago: persona?.forma_pago_kyc ?? venta?.forma_pago ?? null,
    usoEfectivo: persona?.uso_efectivo_kyc ?? venta?.uso_efectivo ?? null,
    conocimientoDuenoBeneficiario:
      persona?.conocimiento_dueno_beneficiario ?? venta?.conocimiento_dueno_beneficiario ?? null,
    esPep: Boolean(persona?.es_pep || venta?.es_pep),
    ineNumero: venta?.ine_numero ?? persona?.numero_credencial_ine ?? null,
  };
}

export type DomicilioEstructurado = {
  calle: string | null;
  numeroExterior: string | null;
  numeroInterior: string | null;
  colonia: string | null;
  municipio: string | null;
  codigoPostal: string | null;
  entidadFederativa: string | null;
};

/** Campos estructurados de la persona, o null si no hay ninguno. */
export function domicilioEstructurado(
  persona: KycPersonaFuente | null | undefined
): DomicilioEstructurado | null {
  if (!persona) return null;
  const d: DomicilioEstructurado = {
    calle: persona.domicilio_calle ?? null,
    numeroExterior: persona.domicilio_numero_exterior ?? null,
    numeroInterior: persona.domicilio_numero_interior ?? null,
    colonia: persona.domicilio_colonia ?? null,
    municipio: persona.domicilio_ciudad ?? null,
    codigoPostal: persona.domicilio_codigo_postal ?? null,
    entidadFederativa: persona.domicilio_estado ?? null,
  };
  const tieneAlgo = Object.values(d).some(Boolean);
  return tieneAlgo ? d : null;
}

/**
 * Domicilio como una línea de texto (para promesa, pagaré y pantalla):
 * el blob histórico de Coda si existe; si no, compuesto desde los campos
 * estructurados con el mismo formato del blob
 * ("CALLE 123 INT 4, COLONIA, CIUDAD, ESTADO, CP 26070").
 */
export function domicilioTexto(persona: KycPersonaFuente | null | undefined): string | null {
  if (persona?.domicilio) return persona.domicilio;
  const d = domicilioEstructurado(persona);
  if (!d) return null;
  const calleNumero = [
    [d.calle, d.numeroExterior].filter(Boolean).join(' '),
    d.numeroInterior ? `INT ${d.numeroInterior}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  const partes = [
    calleNumero || null,
    d.colonia,
    d.municipio,
    d.entidadFederativa,
    d.codigoPostal ? `CP ${d.codigoPostal}` : null,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(', ') : null;
}
