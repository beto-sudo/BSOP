/**
 * Constantes y types compartidos para el checklist de tareas.
 *
 * Iniciativa `dilesa-proyectos-checklist-inline` Sprint 1.
 *
 * **NO es server action** — vive en archivo separado del módulo
 * `actions.ts` que tiene `'use server'`. Next.js solo permite exports
 * de funciones async desde files con `'use server'`; exportar un const
 * o type rompe el bundle silenciosamente (queda undefined en cliente
 * → cascadea a `x.map is not a function` cuando se intenta iterar el
 * enum). Ver hotfix 2 de la iniciativa.
 */

export const TAREA_ESTADOS_VALIDOS = [
  'pendiente',
  'bloqueada',
  'en_curso',
  'completada',
  'cancelada',
] as const;

export type TareaEstado = (typeof TAREA_ESTADOS_VALIDOS)[number];

/**
 * Estados válidos de `dilesa.proyecto_presupuesto_partidas.estado`.
 * Sprint 2: vista del ciclo de vida de una partida (preliminar →
 * autorizada → planeada → en_ejercicio → cerrada).
 */
export const PARTIDA_ESTADOS_VALIDOS = [
  'preliminar',
  'autorizada',
  'planeada',
  'en_ejercicio',
  'cerrada',
] as const;

export type PartidaEstado = (typeof PARTIDA_ESTADOS_VALIDOS)[number];

/**
 * Detecta si una tarea es de cotización. Las tareas canónicas vienen
 * con `tipo='Cotización'` en el catálogo (las 3 tareas de cotización
 * son: Urbanización / Construcción / Comercialización con
 * subtipo='Urbanismo'/'Construcción'/'Comercial' respectivamente).
 *
 * El criterio mira tanto `tipo_snapshot` (canónico) como
 * `subtipo_snapshot` (defensa por si alguien renombra el catálogo).
 * Mismo criterio en cliente (mostrar input de monto) y servidor
 * (auto-vinculación con partida presupuestal).
 */
export function esTareaCotizacion(
  tipoSnapshot: string | null | undefined,
  subtipoSnapshot?: string | null | undefined
): boolean {
  const t = (tipoSnapshot ?? '').toLowerCase();
  if (t.includes('cotizac')) return true;
  const s = (subtipoSnapshot ?? '').toLowerCase();
  return s.includes('cotizac');
}
