import { ROUTE_TO_MODULE } from '@/lib/permissions';

/**
 * Resuelve la ruta del doc de ayuda para una pantalla, derivada de su módulo
 * RBAC: el slug del módulo (`dilesa.ventas.lista`) corresponde 1:1 a la ruta
 * del `.md` bajo `content/manual/` (`dilesa/ventas/lista`).
 *
 * Así el botón "?" global del header muestra la ayuda de la pantalla actual
 * sin necesidad de un mapa aparte que mantener — reusa `ROUTE_TO_MODULE`.
 *
 * Devuelve `null` cuando la ruta no tiene módulo mapeado (rutas dinámicas de
 * detalle, `/inicio`, etc.) → el drawer muestra "todavía no hay ayuda".
 */
export function resolveHelpSlug(pathname: string): string | null {
  const moduloSlug = ROUTE_TO_MODULE[pathname];
  return moduloSlug ? moduloSlug.replaceAll('.', '/') : null;
}
