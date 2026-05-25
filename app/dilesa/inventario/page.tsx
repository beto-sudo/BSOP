import { redirect } from 'next/navigation';

/**
 * Redirect de compatibilidad: el módulo Inventario fue movido a
 * `/dilesa/ventas/inventario` cuando Ventas se convirtió en hub (sprint
 * tabs-hub). Cualquier URL vieja (bookmarks, links externos, etc.) cae
 * acá y se redirige a la nueva ubicación.
 *
 * Mantener mientras haya tráfico — borrar cuando ya no haya bookmarks
 * apuntando aquí. El slug top-level `dilesa.inventario` se elimina en la
 * migración 20260525112633_dilesa_ventas_tabs_hub.sql, así que el RBAC
 * ya no aplica acá; el sub-slug `dilesa.ventas.inventario` gobierna en
 * la página destino.
 */
export default function DilesaInventarioRedirectPage() {
  redirect('/dilesa/ventas/inventario');
}
