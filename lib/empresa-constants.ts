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
