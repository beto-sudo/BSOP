import type { UsuarioEmpresa } from './actions';
import { requisitosDe } from '@/lib/permissions-deps';

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

/** Permiso por slug — la moneda de una plantilla al aplicarse (S3). */
export interface PermisoSlug {
  slug: string;
  acceso_lectura: boolean;
  acceso_escritura: boolean;
}

/**
 * Expande un set de permisos con los requisitos de navegación que le faltan
 * (S3): por cada permiso encendido, sus `requisitosDe` (clausura transitiva,
 * `lib/permissions-deps.ts`) quedan al menos en LECTURA — la escritura nunca
 * se agrega implícita (misma regla que el auto-marcado de la matriz, S1).
 * Así un rol creado desde plantilla es coherente aunque la plantilla
 * envejezca. Permisos todo-false se descartan (no aportan a un rol nuevo).
 */
export function expandirPermisosConRequisitos(permisos: PermisoSlug[]): PermisoSlug[] {
  const porSlug = new Map<string, PermisoSlug>();
  for (const p of permisos) {
    if (!p.acceso_lectura && !p.acceso_escritura) continue;
    porSlug.set(p.slug, { ...p });
  }
  for (const p of [...porSlug.values()]) {
    for (const req of requisitosDe(p.slug)) {
      const existente = porSlug.get(req);
      if (existente) {
        existente.acceso_lectura = true;
      } else {
        porSlug.set(req, { slug: req, acceso_lectura: true, acceso_escritura: false });
      }
    }
  }
  return [...porSlug.values()];
}

/** Permiso por modulo_id — la forma en que plantilla y rol viven en DB. */
export interface PermisoModulo {
  modulo_id: string;
  acceso_lectura: boolean;
  acceso_escritura: boolean;
}

/**
 * Resuelve los items de una plantilla a los permisos a insertar al crear el
 * rol (S3): traduce modulo_id → slug, expande requisitos de navegación y
 * regresa a modulo_id. Items cuyo módulo ya no exista en la empresa (o
 * requisitos sin módulo en DB) se descartan — la plantilla aplica lo
 * aplicable, nunca truena por un slug viejo.
 */
export function resolverPermisosDePlantilla(
  items: PermisoModulo[],
  modulos: Array<{ id: string; slug: string }>
): PermisoModulo[] {
  const slugById = new Map(modulos.map((m) => [m.id, m.slug]));
  const idBySlug = new Map(modulos.map((m) => [m.slug, m.id]));
  const porSlug = items.flatMap((i) => {
    const slug = slugById.get(i.modulo_id);
    return slug
      ? [{ slug, acceso_lectura: i.acceso_lectura, acceso_escritura: i.acceso_escritura }]
      : [];
  });
  return expandirPermisosConRequisitos(porSlug).flatMap((p) => {
    const modulo_id = idBySlug.get(p.slug);
    return modulo_id
      ? [{ modulo_id, acceso_lectura: p.acceso_lectura, acceso_escritura: p.acceso_escritura }]
      : [];
  });
}
