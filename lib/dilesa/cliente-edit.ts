/**
 * Edición de los datos de un cliente (`erp.personas`).
 *
 * Contrato compartido entre el drawer de edición (`'use client'`) y el route
 * handler `PATCH /api/dilesa/clientes/[id]`. Vive en `.ts` plano para no
 * arrastrar el árbol cliente al bundle del server
 * (ver `feedback_use_client_constants_import`).
 *
 * La edición está gateada a Dirección/admin en el server (no en la UI) y queda
 * registrada en `core.audit_log` con el antes/después de cada campo cambiado.
 */

/** Campos editables del cliente (form ⇄ API). Strings vacíos = "sin valor". */
export type ClienteEditInput = {
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string;
  curp: string;
  rfc: string;
  nss: string;
  numero_credencial_ine: string;
  fecha_nacimiento: string;
  estado_civil: string;
  nacionalidad: string;
  tipo_persona: string;
  email: string;
  telefono: string;
  domicilio_calle: string;
  domicilio_numero_exterior: string;
  domicilio_numero_interior: string;
  domicilio_colonia: string;
  domicilio_codigo_postal: string;
  domicilio_ciudad: string;
  domicilio_estado: string;
  ocupacion: string;
  es_pep: boolean;
  forma_pago_kyc: string;
  uso_efectivo_kyc: string;
  conocimiento_dueno_beneficiario: string;
};

export type ClienteEditCampo = keyof ClienteEditInput;

/** Etiqueta legible por columna (para el audit log y mensajes). */
export const CLIENTE_CAMPO_LABEL: Record<ClienteEditCampo, string> = {
  nombre: 'Nombre',
  apellido_paterno: 'Apellido paterno',
  apellido_materno: 'Apellido materno',
  curp: 'CURP',
  rfc: 'RFC',
  nss: 'NSS',
  numero_credencial_ine: 'Número de credencial INE',
  fecha_nacimiento: 'Fecha de nacimiento',
  estado_civil: 'Estado civil',
  nacionalidad: 'Nacionalidad',
  tipo_persona: 'Tipo de persona',
  email: 'Email',
  telefono: 'Teléfono',
  domicilio_calle: 'Calle',
  domicilio_numero_exterior: 'Número exterior',
  domicilio_numero_interior: 'Número interior',
  domicilio_colonia: 'Colonia',
  domicilio_codigo_postal: 'Código postal',
  domicilio_ciudad: 'Ciudad',
  domicilio_estado: 'Estado',
  ocupacion: 'Ocupación',
  es_pep: 'PEP',
  forma_pago_kyc: 'Forma de pago',
  uso_efectivo_kyc: 'Uso de efectivo',
  conocimiento_dueno_beneficiario: 'Dueño beneficiario',
};

/** Campos NOT NULL en `erp.personas` — no se pueden dejar vacíos al editar. */
export const CLIENTE_CAMPOS_REQUERIDOS: ClienteEditCampo[] = ['nombre'];

/** Columnas que se guardan en mayúsculas. */
const COLS_UPPER: ReadonlySet<ClienteEditCampo> = new Set(['curp', 'rfc', 'numero_credencial_ine']);

export type ClienteEditValue = string | boolean | null;
export type ClienteEditNormalizado = Record<ClienteEditCampo, ClienteEditValue>;

function normCampo(col: ClienteEditCampo, value: string | boolean): ClienteEditValue {
  if (typeof value === 'boolean') return value;
  const t = value.trim();
  if (t === '') return null;
  return COLS_UPPER.has(col) ? t.toUpperCase() : t;
}

/**
 * Normaliza lo capturado en el form a valores de columna de `erp.personas`:
 * trim, mayúsculas en CURP/RFC/INE, strings vacíos → null. Los booleanos
 * (es_pep) pasan tal cual.
 */
export function normalizeClienteEdit(input: ClienteEditInput): ClienteEditNormalizado {
  const out = {} as ClienteEditNormalizado;
  (Object.keys(input) as ClienteEditCampo[]).forEach((col) => {
    out[col] = normCampo(col, input[col]);
  });
  return out;
}

/** Campos requeridos que quedaron vacíos (para rechazar el guardado). */
export function camposRequeridosVacios(norm: ClienteEditNormalizado): string[] {
  return CLIENTE_CAMPOS_REQUERIDOS.filter((col) => norm[col] == null || norm[col] === '').map(
    (col) => CLIENTE_CAMPO_LABEL[col]
  );
}

/** Fila actual de la persona (subconjunto relevante para el diff de audit). */
export type ClientePersonaActual = Partial<Record<ClienteEditCampo, ClienteEditValue>>;

/**
 * Compara la fila actual contra lo normalizado y devuelve SOLO lo que cambió,
 * con antes/después por columna — listo para `core.audit_log` y para el UPDATE.
 */
export function diffClienteEdit(
  actual: ClientePersonaActual,
  nuevo: ClienteEditNormalizado
): { anteriores: Record<string, ClienteEditValue>; nuevos: Record<string, ClienteEditValue> } {
  const anteriores: Record<string, ClienteEditValue> = {};
  const nuevos: Record<string, ClienteEditValue> = {};
  (Object.keys(nuevo) as ClienteEditCampo[]).forEach((col) => {
    const a = actual[col] ?? null;
    const b = nuevo[col] ?? null;
    if (a !== b) {
      anteriores[col] = a;
      nuevos[col] = b;
    }
  });
  return { anteriores, nuevos };
}
