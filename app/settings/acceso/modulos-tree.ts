import type { Modulo } from './actions';

/**
 * Helpers puros de la matriz de permisos (Accesos · Roles y Permisos).
 *
 * Viven en un `.ts` plano (sin `'use client'` ni server actions) para que
 * los tests los importen sin arrastrar el árbol del client component — el
 * `import type` de arriba se borra en compilación.
 */

/** Módulo con sus sub-slugs anidados (hub de routed tabs, ADR-030). */
export interface ModuloNode {
  modulo: Modulo;
  hijos: Modulo[];
}

/**
 * Anida sub-slugs (`<padre>.<tab>`, ADR-030) bajo su módulo padre cuando el
 * padre existe en la misma lista. Un slug solo se considera "hijo" si algún
 * prefijo suyo es un módulo real — así los slugs planos de 3 segmentos
 * (`dilesa.admin.tasks`, cuyo prefijo `dilesa.admin` no es módulo) quedan
 * top-level y la matriz no inventa jerarquías que no existen en RBAC.
 */
export function nestModulosByHub(modulos: Modulo[]): ModuloNode[] {
  const slugs = new Set(modulos.map((m) => m.slug));
  const tieneAncestro = (slug: string): boolean => {
    let idx = slug.lastIndexOf('.');
    while (idx > 0) {
      const prefijo = slug.slice(0, idx);
      if (slugs.has(prefijo)) return true;
      idx = prefijo.lastIndexOf('.');
    }
    return false;
  };
  return modulos
    .filter((m) => !tieneAncestro(m.slug))
    .map((padre) => ({
      modulo: padre,
      hijos: modulos.filter((m) => m.slug.startsWith(`${padre.slug}.`)),
    }));
}

/**
 * Nombre corto de un sub-módulo dentro de su hub: los nombres en DB siguen
 * la convención "Padre · Hijo" ("Compras · Órdenes") — indentado bajo su
 * padre, repetir el prefijo es ruido. Si el nombre no sigue la convención,
 * se muestra completo.
 */
export function shortChildName(hijo: Modulo, padre: Modulo): string {
  const prefijo = `${padre.nombre} · `;
  return hijo.nombre.startsWith(prefijo) ? hijo.nombre.slice(prefijo.length) : hijo.nombre;
}
