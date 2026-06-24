/**
 * Completitud del expediente KYC de una persona (cliente DILESA).
 *
 * El alta de cliente *nuevo* en la captura de Fase 1 exige el expediente KYC
 * completo (Sprint 7c-2: todo en Fase 1, no se difiere — alimenta FICU + los
 * 3 PDFs + el EBR). Pero al reasignar un *cliente existente* el form viejo
 * solo pedía seleccionar la persona, sin revalidar su KYC: una persona dada
 * de alta antes (o migrada de Coda) con campos faltantes arrancaba la venta
 * con el expediente incompleto (ej. sin número de INE).
 *
 * Estos helpers detectan qué falta y arman el payload para completarlo. Se
 * usan desde `app/dilesa/ventas/nueva/page.tsx` (gate de submit + UPDATE de
 * la persona) y se testean aquí de forma pura.
 */

import { domicilioTexto } from './kyc-efectivo';

/** Subconjunto de columnas de `erp.personas` que toca la captura de venta. */
export type PersonaKycSnapshot = {
  nombre: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  curp: string | null;
  rfc: string | null;
  telefono: string | null;
  email: string | null;
  fecha_nacimiento: string | null;
  nss: string | null;
  numero_credencial_ine: string | null;
  // Domicilio: blob histórico de Coda (`domicilio`) y/o campos estructurados.
  // La completitud lo considera satisfecho si existe CUALQUIERA (ver abajo).
  domicilio: string | null;
  domicilio_calle: string | null;
  domicilio_numero_exterior: string | null;
  domicilio_numero_interior: string | null;
  domicilio_colonia: string | null;
  domicilio_codigo_postal: string | null;
  domicilio_ciudad: string | null;
  domicilio_estado: string | null;
  tipo_persona: string | null;
  nacionalidad: string | null;
  estado_civil: string | null;
  ocupacion: string | null;
  es_pep: boolean | null;
  forma_pago_kyc: string | null;
  uso_efectivo_kyc: string | null;
  conocimiento_dueno_beneficiario: string | null;
};

/**
 * Campos obligatorios (escalares) para arrancar una venta. El domicilio NO va
 * aquí: se valida aparte porque se considera completo si existe el blob
 * histórico de Coda (`domicilio`) O los campos estructurados — la mayoría de
 * clientes migrados traen la dirección como blob y forzar re-capturar lo que
 * ya tenemos sería ruido. Quedan FUERA a propósito:
 *   - `apellido_materno` y `domicilio_numero_interior`: legítimamente opcionales.
 *   - `tipo_persona`, `nacionalidad`, `es_pep`, `conocimiento_dueno_beneficiario`:
 *     tienen default sensato (fisica / Mexicana / false / 'No'), nunca quedan
 *     "vacíos".
 * Si cambia la lista del alta de cliente nuevo, actualizar aquí también.
 */
export const CAMPOS_KYC_OBLIGATORIOS: { col: keyof PersonaKycSnapshot; label: string }[] = [
  { col: 'nombre', label: 'Nombre' },
  { col: 'apellido_paterno', label: 'Apellido paterno' },
  { col: 'curp', label: 'CURP' },
  { col: 'rfc', label: 'RFC' },
  { col: 'telefono', label: 'Teléfono' },
  { col: 'email', label: 'Email' },
  { col: 'fecha_nacimiento', label: 'Fecha de nacimiento' },
  { col: 'nss', label: 'NSS' },
  { col: 'numero_credencial_ine', label: 'Número de credencial INE' },
  { col: 'estado_civil', label: 'Estado civil' },
  { col: 'ocupacion', label: 'Ocupación' },
  { col: 'forma_pago_kyc', label: 'Forma de pago' },
  { col: 'uso_efectivo_kyc', label: 'Uso de efectivo' },
];

function vacio(v: string | null | undefined): boolean {
  return v == null || v.trim() === '';
}

/** Etiquetas de los campos KYC obligatorios que la persona NO tiene. */
export function camposKycFaltantes(p: PersonaKycSnapshot | null | undefined): string[] {
  if (!p) return [];
  // Columnas escalares (todas de texto: string | null).
  const faltantes = CAMPOS_KYC_OBLIGATORIOS.filter(({ col }) => vacio(p[col] as string | null)).map(
    ({ label }) => label
  );
  // Domicilio: completo si hay blob de Coda O campos estructurados.
  if (!domicilioTexto(p)) faltantes.push('Domicilio');
  return faltantes;
}

/** `true` si la persona trae el expediente KYC obligatorio completo. */
export function kycPersonaCompleto(p: PersonaKycSnapshot | null | undefined): boolean {
  return p != null && camposKycFaltantes(p).length === 0;
}

function txt(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

/** Columnas de `erp.personas` que escribe la captura (forma del UPDATE/INSERT). */
export type PersonaKycPayload = {
  // nombre y apellido_paterno son NOT NULL en erp.personas.
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  curp: string | null;
  rfc: string | null;
  telefono: string | null;
  email: string | null;
  fecha_nacimiento: string | null;
  nss: string | null;
  numero_credencial_ine: string | null;
  domicilio_calle: string | null;
  domicilio_numero_exterior: string | null;
  domicilio_numero_interior: string | null;
  domicilio_colonia: string | null;
  domicilio_codigo_postal: string | null;
  domicilio_ciudad: string | null;
  domicilio_estado: string | null;
  tipo_persona: string;
  nacionalidad: string | null;
  estado_civil: string | null;
  ocupacion: string | null;
  es_pep: boolean;
  forma_pago_kyc: string | null;
  uso_efectivo_kyc: string | null;
  conocimiento_dueno_beneficiario: string;
};

/**
 * Payload de columnas `erp.personas` a partir de lo capturado en el form.
 * Normaliza igual que el INSERT del alta nueva: CURP/RFC/INE en mayúsculas,
 * strings vacíos → null, `conocimiento_dueno_beneficiario` cae a 'No'.
 */
export function buildPersonaKycPayload(snap: PersonaKycSnapshot): PersonaKycPayload {
  return {
    // NOT NULL: para una persona real siempre vienen poblados (fallback defensivo).
    nombre: txt(snap.nombre) ?? '',
    apellido_paterno: txt(snap.apellido_paterno) ?? '',
    apellido_materno: txt(snap.apellido_materno),
    curp: txt(snap.curp)?.toUpperCase() ?? null,
    rfc: txt(snap.rfc)?.toUpperCase() ?? null,
    telefono: txt(snap.telefono),
    email: txt(snap.email),
    fecha_nacimiento: txt(snap.fecha_nacimiento),
    nss: txt(snap.nss),
    numero_credencial_ine: txt(snap.numero_credencial_ine)?.toUpperCase() ?? null,
    domicilio_calle: txt(snap.domicilio_calle),
    domicilio_numero_exterior: txt(snap.domicilio_numero_exterior),
    domicilio_numero_interior: txt(snap.domicilio_numero_interior),
    domicilio_colonia: txt(snap.domicilio_colonia),
    domicilio_codigo_postal: txt(snap.domicilio_codigo_postal),
    domicilio_ciudad: txt(snap.domicilio_ciudad),
    domicilio_estado: txt(snap.domicilio_estado),
    tipo_persona: snap.tipo_persona ?? 'fisica',
    nacionalidad: txt(snap.nacionalidad),
    estado_civil: txt(snap.estado_civil),
    ocupacion: txt(snap.ocupacion),
    es_pep: snap.es_pep ?? false,
    forma_pago_kyc: txt(snap.forma_pago_kyc),
    uso_efectivo_kyc: txt(snap.uso_efectivo_kyc),
    conocimiento_dueno_beneficiario: txt(snap.conocimiento_dueno_beneficiario) ?? 'No',
  };
}
