/**
 * Catálogo y derivadas del embudo de evaluación de compra de terrenos
 * (iniciativa `dilesa-portafolio-predios` · S6). Espeja el CHECK de
 * `dilesa.activo_terreno.etapa`. `.ts` plano: lo consumen client
 * components y server actions.
 */

export const ETAPAS_EMBUDO = [
  { value: 'detectado', label: 'Detectado' },
  { value: 'analisis', label: 'En análisis' },
  { value: 'negociacion', label: 'Negociación' },
  { value: 'decision', label: 'En decisión' },
] as const;

export type EtapaEmbudo = (typeof ETAPAS_EMBUDO)[number]['value'];

/** Días de inactividad a partir de los cuales un prospecto se considera estancado. */
export const DIAS_ESTANCAMIENTO = 30;

/**
 * Días transcurridos desde la última revisión (o desde que entró el
 * prospecto, si nunca se ha revisado). `hoyISO` viene del caller para no
 * depender del reloj aquí (testeable y respeta el "hoy" local Matamoros).
 */
export function diasSinRevision(
  hoyISO: string,
  fechaUltimaRevision: string | null,
  createdAt: string | null
): number | null {
  const base = fechaUltimaRevision ?? createdAt?.slice(0, 10) ?? null;
  if (!base) return null;
  const ms = Date.parse(`${hoyISO}T00:00:00Z`) - Date.parse(`${base.slice(0, 10)}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Promedio simple de $/m² solicitados, ignorando nulls/ceros. */
export function promedioPrecioM2(valores: (number | null | undefined)[]): number | null {
  const v = valores.filter((x): x is number => x != null && x > 0);
  if (v.length === 0) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}
