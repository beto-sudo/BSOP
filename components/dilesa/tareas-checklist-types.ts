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
 * Detecta si el subtipo (snapshot del catálogo) corresponde a una tarea
 * de cotización. Usado en cliente (decidir si mostrar input de monto)
 * y en servidor (auto-vinculación con partida presupuestal). Mismo
 * criterio en ambos lados para no divergir.
 */
export function esTareaCotizacion(subtipoSnapshot: string | null | undefined): boolean {
  return (subtipoSnapshot ?? '').toLowerCase().includes('cotizac');
}
