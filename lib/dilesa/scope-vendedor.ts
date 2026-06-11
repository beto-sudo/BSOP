/**
 * Scope de acceso del rol Vendedor en DILESA Ventas (pedido de Beto):
 * un vendedor solo ve SUS clientes y SUS ventas.
 *
 * Implementación en capa app (consistente con el aislamiento de erp.* —
 * la RLS de dilesa.* es por empresa, no por fila):
 *   - Lista de ventas y clientes: filtro `vendedor_usuario_id = uid`.
 *   - Detalle: guard que bloquea ventas ajenas.
 *
 * Regla: el scope aplica si el usuario tiene rol "Vendedor" en DILESA y NO
 * tiene ninguno de los roles amplios (los que por su función ven todo).
 * Admin global nunca queda bloqueado (política Beto 2026-06-10).
 */

/** Roles que ven todas las ventas de la empresa. */
export const ROLES_AMPLIOS = [
  'Dirección',
  'Gerencia Ventas',
  'Administración',
  'Contabilidad',
  'Obra',
  'Comité',
  'Accionista',
  'Consejero',
];

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** ¿El set de roles del usuario lo limita a ver solo sus propias ventas? */
export function esSoloVendedor(roles: string[]): boolean {
  const normalizados = roles.map(norm);
  const esVendedor = normalizados.some((r) => r === 'vendedor');
  if (!esVendedor) return false;
  const amplios = new Set(ROLES_AMPLIOS.map(norm));
  return !normalizados.some((r) => amplios.has(r));
}
