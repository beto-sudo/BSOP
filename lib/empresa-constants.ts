/**
 * Constantes globales de empresa — fuente única de verdad de los UUIDs.
 *
 * Estas constantes parametrizan los componentes cross-empresa
 * (`components/<modulo>/<modulo>-module.tsx`) según la convención
 * SM1-SM5 codificada en ADR-011.
 *
 * Los valores deben coincidir 1:1 con `core.empresas.id` en Supabase.
 * Verificar contra `supabase/SCHEMA_REF.md` ante cualquier duda.
 *
 * ANSA y COAGAN se agregarán cuando esos módulos entren al repo —
 * no se exportan placeholders para evitar imports prematuros que
 * compilen pero apunten a UUIDs inválidos.
 */

export const DILESA_EMPRESA_ID = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479';
export const RDB_EMPRESA_ID = 'e52ac307-9373-4115-b65e-1178f0c4e1aa';

/**
 * Mapeo inverso UUID → slug. Usado por widgets cross-usuario que reciben
 * `empresa_id` desde la DB y necesitan construir URLs `/<empresa>/...`.
 *
 * Solo incluye las empresas con módulos activos en el repo. ANSA / COAGAN
 * / Nigropetense se agregan cuando esos módulos entren.
 */
export const EMPRESA_ID_TO_SLUG: Record<string, string> = {
  [DILESA_EMPRESA_ID]: 'dilesa',
  [RDB_EMPRESA_ID]: 'rdb',
};

/**
 * Resuelve el slug a partir del UUID de empresa. Devuelve `null` cuando
 * la empresa no tiene módulos activos en el repo (caller debe decidir si
 * oculta el link o lo deja como display-only).
 */
export function empresaSlugFromId(id: string): string | null {
  return EMPRESA_ID_TO_SLUG[id] ?? null;
}
