import type { UserPermissions } from '@/lib/permissions';
import { canAccessModulo, canAccessModuloOrChild } from '@/lib/permissions';
import type { ManualDoc } from './load';

/**
 * RBAC del contenido del manual (hardening de Sprint 2, riesgo R3 del
 * planning doc): **cada quien ve solo la ayuda de los módulos a los que
 * tiene acceso** — el manual describe cómo opera el negocio y no debe ser
 * legible completo por cualquier usuario con sesión.
 *
 * El módulo de un doc sale de su frontmatter `modulo:` (todos los docs lo
 * llevan; fallback defensivo: el path del slug con `.`). Reglas:
 *
 * - admin global → todo (política "admin nunca bloqueado").
 * - módulo plano → `canAccessModulo` (lectura).
 * - módulo umbrella (`dilesa.ventas`, `dilesa.compras`) → acceso al padre O a
 *   CUALQUIER sub-slug (`canAccessModuloOrChild`, espejo de la visibilidad de
 *   sidebar SS8/ADR-030): quien captura cualquier tab del hub puede leer el
 *   doc del hub.
 *
 * Consumidores: portada (server), `/api/manual/search`, `/api/manual/[...slug]`
 * y la vista imprimible. El drawer contextual queda cubierto vía el endpoint.
 */

export function manualDocModulo(doc: ManualDoc): string {
  return doc.frontmatter.modulo ?? doc.slug.join('.');
}

export function canReadManualDoc(perms: UserPermissions, doc: ManualDoc): boolean {
  if (perms.isAdmin) return true;
  const modulo = manualDocModulo(doc);
  return canAccessModulo(perms, modulo) || canAccessModuloOrChild(perms, modulo);
}

/** Filtra los docs a los legibles por el usuario (orden intacto). */
export function filterManualDocs(perms: UserPermissions, docs: ManualDoc[]): ManualDoc[] {
  return docs.filter((doc) => canReadManualDoc(perms, doc));
}
