/**
 * Mapeo `subtipo_meta` (de `erp.documentos`) → caché jsonb en `core.empresas`
 * (`escritura_constitutiva`, `escritura_poder`).
 *
 * Espejo TypeScript de la lógica que vive en
 * `core.fn_empresa_documentos_sync_escrituras_cache(empresa_id, rol)`
 * dentro de la migración `20260428235000_empresa_documentos_legales.sql`.
 *
 * Existir en TS además de PL/pgSQL nos paga en dos lugares:
 *   - La UI puede previsualizar qué se va a guardar en el caché antes de
 *     hacer el assign (evita "guardé pero no aparece en el contrato").
 *   - El test unitario puede validar el mapeo sin tocar DB.
 *
 * Si una de las dos implementaciones cambia, la otra queda stale —
 * marcador en ambos lados con la convención "espejo de X" para que el
 * próximo lector las compare al editar.
 */

/**
 * Shape canónico del jsonb caché en `core.empresas.escritura_*`,
 * consumido por `lib/rh/datos-fiscales-empresa.ts`.
 */
export type EscrituraCacheJsonb = {
  numero: string | null;
  fecha: string | null;
  fecha_texto: string | null;
  notario: string | null;
  notaria_numero: string | null;
  distrito: string | null;
};

/**
 * Convierte un valor crudo de `subtipo_meta` (jsonb que la extracción IA
 * produjo) a string-or-null. Trim + cadena vacía → null.
 */
function asStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Mapea defensivamente las distintas convenciones de naming que la
 * extracción IA puede producir en `subtipo_meta`, hacia los 5 campos
 * canónicos del jsonb consumido por el validador de RH.
 *
 * Convenciones observadas (ver migración 20260414000020 y prompt en
 * lib/documentos/extraction-core.ts):
 *   - `numero_escritura` o `numero`
 *   - `fecha_escritura` o `fecha` (ISO YYYY-MM-DD)
 *   - `fecha_texto` (texto legible: "quince de mayo del dos mil diez")
 *   - `notario_nombre` o `notario`
 *   - `notaria_numero`
 *   - `distrito_notarial` o `distrito`
 *
 * Si Sprint 2 estandariza a una convención única, este mapping se
 * simplifica. Hasta entonces, COALESCE de las dos opciones.
 *
 * Devuelve `null` si el subtipo_meta es null/undefined o si todos los
 * campos resultan vacíos — el caller usa eso para limpiar la columna.
 */
export function buildEscrituraCacheFromSubtipoMeta(
  subtipoMeta: Record<string, unknown> | null | undefined
): EscrituraCacheJsonb | null {
  if (subtipoMeta == null) return null;

  const cache: EscrituraCacheJsonb = {
    numero:
      asStringOrNull(subtipoMeta['numero_escritura']) ?? asStringOrNull(subtipoMeta['numero']),
    fecha: asStringOrNull(subtipoMeta['fecha_escritura']) ?? asStringOrNull(subtipoMeta['fecha']),
    fecha_texto: asStringOrNull(subtipoMeta['fecha_texto']),
    notario:
      asStringOrNull(subtipoMeta['notario_nombre']) ?? asStringOrNull(subtipoMeta['notario']),
    notaria_numero: asStringOrNull(subtipoMeta['notaria_numero']),
    distrito:
      asStringOrNull(subtipoMeta['distrito_notarial']) ?? asStringOrNull(subtipoMeta['distrito']),
  };

  // Si todos los campos son null, es como si no hubiera escritura → caller
  // usa eso para distinguir "documento sin metadata útil" de "documento ok".
  const allNull = Object.values(cache).every((v) => v == null);
  return allNull ? null : cache;
}

/**
 * Mapeo `rol → columna` de `core.empresas` que recibe el caché.
 * Solo dos roles disparan sync; el resto queda como referencia pura.
 * Espejo de la condición en
 * `core.fn_empresa_documentos_sync_escrituras_cache`.
 */
export const ROL_TO_CACHE_COLUMN: Readonly<Record<string, string>> = {
  acta_constitutiva: 'escritura_constitutiva',
  poder_general_administracion: 'escritura_poder',
};

/**
 * Lista canónica de roles válidos en `core.empresa_documentos.rol`.
 * Espejo del CHECK constraint `empresa_documentos_rol_check` en la
 * migración. Si se agrega un rol allá, agregar aquí también.
 */
export const EMPRESA_DOCUMENTOS_ROLES = [
  'acta_constitutiva',
  'acta_reforma',
  'poder_general_administracion',
  'poder_actos_dominio',
  'poder_pleitos_cobranzas',
  'poder_bancario',
  'representante_legal_imss',
] as const;

export type EmpresaDocumentoRol = (typeof EMPRESA_DOCUMENTOS_ROLES)[number];
