import type { UsuarioEmpresa } from './actions';

/**
 * Reglas puras del alta de acceso usuario↔empresa (accesos-intuitivos S2).
 *
 * Viven en un `.ts` plano (mismo patrón que `modulos-tree.ts`) para que el
 * server action y el client compartan la regla y los tests la importen sin
 * arrastrar el árbol del client component.
 *
 * Contexto: un acceso con `rol_id NULL` deja al usuario viendo la empresa
 * sin ningún módulo (caso Nelcy, ver planning de accesos-intuitivos). La
 * regla S2: no se otorga acceso sin rol, y los accesos legacy sin rol se
 * reportan como incompletos para sanearlos.
 */

/**
 * Valida que `rolId` sea un rol real de la empresa. Devuelve el mensaje de
 * error a mostrar, o `null` si el par rol↔empresa es válido. `empresa_id`
 * admite null porque la columna `core.roles.empresa_id` es nullable — un rol
 * sin empresa nunca valida.
 */
export function validarRolParaEmpresa(
  rolId: string | null | undefined,
  empresaId: string,
  roles: Array<{ id: string; empresa_id: string | null }>
): string | null {
  if (!rolId) {
    return 'Elige un rol para dar acceso — sin rol, el usuario ve la empresa sin ningún módulo.';
  }
  const rol = roles.find((r) => r.id === rolId);
  if (!rol) return 'El rol seleccionado no existe.';
  if (rol.empresa_id !== empresaId) return 'El rol seleccionado pertenece a otra empresa.';
  return null;
}

/** Accesos incompletos: la empresa se ve en el menú pero sin ningún módulo. */
export function accesosSinRol(accesos: UsuarioEmpresa[]): UsuarioEmpresa[] {
  return accesos.filter((ue) => ue.rol_id === null);
}
