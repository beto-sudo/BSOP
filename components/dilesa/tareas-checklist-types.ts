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
 * Pasos canónicos del ciclo de vida operativo de una tarea (Sprint 3).
 * Cada tarea instancia los 4 pasos al crearse; el operador marca
 * `no_aplica` los que no apliquen para su flujo específico.
 */
export const TAREA_PASOS_VALIDOS = ['cotizacion', 'factura', 'pago', 'resultado'] as const;
export type TareaPaso = (typeof TAREA_PASOS_VALIDOS)[number];

/**
 * Estados válidos de `dilesa.proyecto_tarea_pasos.estado`. `no_aplica`
 * saca al paso del denominador del avance.
 */
export const PASO_ESTADOS_VALIDOS = ['pendiente', 'hecho', 'no_aplica'] as const;
export type PasoEstado = (typeof PASO_ESTADOS_VALIDOS)[number];

/**
 * Mapping del paso canónico al estado de la partida presupuestal
 * vinculada (auto-flujo D4). Cuando un paso pasa a `hecho`, la partida
 * se mueve al estado correspondiente:
 *
 *   cotizacion → preliminar (monto_estimado = monto del paso)
 *   factura    → autorizada (monto_aprobado = monto del paso)
 *   pago       → en_ejercicio (monto_ejercido = monto del paso)
 *   resultado  → (no toca partida, cierra el ciclo cuando los 3
 *                financieros aplicables están hechos)
 */
export const PASO_TO_PARTIDA_ESTADO: Record<TareaPaso, PartidaEstado | null> = {
  cotizacion: 'preliminar',
  factura: 'autorizada',
  pago: 'en_ejercicio',
  resultado: null,
};

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
