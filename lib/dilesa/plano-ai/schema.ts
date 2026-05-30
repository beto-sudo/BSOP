/**
 * Schema Zod del análisis con IA del plano del anteproyecto.
 * Sprint 4E de `dilesa-proyectos-checklist-inline`.
 *
 * Claude vision recibe el plano (PDF/imagen) y debe retornar un JSON
 * estructurado con las métricas geométricas + observaciones libres.
 *
 * Respeta el límite de Anthropic de 16 union-type fields:
 *   - Los m² individuales son `number` con default 0 → '0 = ausente'
 *     (normalizado en el consumer).
 *   - Recomendaciones son `string[]` (no nullable).
 *   - Confianza es enum.
 *
 * Convención: el modelo retorna 0 cuando un dato no aparece o no
 * puede determinarlo con confianza. El consumer normaliza 0 → null
 * antes de persistir.
 */

import { z } from 'zod';

export const PlanoAiAnalisisSchema = z.object({
  area_total_m2: z
    .number()
    .default(0)
    .describe(
      'Área total del terreno en metros cuadrados, según el plano. 0 si no se puede determinar.'
    ),
  area_vendible_m2: z
    .number()
    .default(0)
    .describe(
      'Área vendible (suma de lotes residenciales/comerciales) en metros cuadrados. 0 si no se puede determinar.'
    ),
  areas_verdes_m2: z
    .number()
    .default(0)
    .describe('Área de zonas verdes / parques en metros cuadrados. 0 si no se puede determinar.'),
  area_vialidades_m2: z
    .number()
    .default(0)
    .describe(
      'Área de vialidades, banquetas y arroyos vehiculares en metros cuadrados. 0 si no se puede determinar.'
    ),
  lotes_proyectados: z
    .number()
    .int()
    .default(0)
    .describe('Cantidad total de lotes proyectados. 0 si no se puede determinar.'),
  tamano_lote_promedio_m2: z
    .number()
    .default(0)
    .describe(
      'Tamaño promedio de los lotes en metros cuadrados (área vendible / cantidad de lotes). 0 si no se puede determinar.'
    ),
  tipologia_principal: z
    .string()
    .default('')
    .describe(
      'Tipología inmobiliaria predominante observada: "interes_social", "residencial_medio", "residencial_alto", "plaza_comercial", "usos_mixtos", "naves_industriales", "oficinas", "departamentos", "lotificacion". Vacío si no es identificable.'
    ),
  observaciones: z
    .string()
    .default('')
    .describe(
      'Texto libre con observaciones técnicas relevantes: trazo de calles, ubicación de áreas comunes, accesos, infraestructura mostrada, irregularidades, escala, orientación, fecha del plano si visible, etc. Máximo 2 párrafos.'
    ),
  recomendaciones: z
    .array(z.string())
    .default([])
    .describe(
      'Lista de recomendaciones concretas para el desarrollo: aspectos a revisar, ajustes sugeridos a la lotificación, riesgos identificados, oportunidades de mejor aprovechamiento. Hasta 6 puntos cortos.'
    ),
  confianza: z
    .enum(['alta', 'media', 'baja'])
    .describe(
      'Auto-evaluación de la confianza del análisis. "alta" si el plano es legible y las métricas son explícitas; "media" si parte se infirió por escala/proporción; "baja" si la calidad del plano impide leer datos con certeza.'
    ),
});

export type PlanoAiAnalisis = z.infer<typeof PlanoAiAnalisisSchema>;

/** Normaliza 0 → null en los campos numéricos (convención del prompt). */
export function normalizarAnalisis(raw: PlanoAiAnalisis): {
  area_total_m2: number | null;
  area_vendible_m2: number | null;
  areas_verdes_m2: number | null;
  area_vialidades_m2: number | null;
  lotes_proyectados: number | null;
  tamano_lote_promedio_m2: number | null;
  tipologia_principal: string | null;
  observaciones: string | null;
  recomendaciones: string[];
  confianza: 'alta' | 'media' | 'baja';
} {
  const num = (n: number) => (n > 0 ? n : null);
  const str = (s: string) => (s.trim().length > 0 ? s : null);
  return {
    area_total_m2: num(raw.area_total_m2),
    area_vendible_m2: num(raw.area_vendible_m2),
    areas_verdes_m2: num(raw.areas_verdes_m2),
    area_vialidades_m2: num(raw.area_vialidades_m2),
    lotes_proyectados: num(raw.lotes_proyectados),
    tamano_lote_promedio_m2: num(raw.tamano_lote_promedio_m2),
    tipologia_principal: str(raw.tipologia_principal),
    observaciones: str(raw.observaciones),
    recomendaciones: raw.recomendaciones.filter((r) => r.trim().length > 0).slice(0, 6),
    confianza: raw.confianza,
  };
}
