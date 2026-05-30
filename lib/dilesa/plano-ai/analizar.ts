/**
 * Análisis con IA del plano del anteproyecto vía Claude vision.
 * Sprint 4E de `dilesa-proyectos-checklist-inline`.
 *
 * Reusa la infraestructura de `lib/documentos/extraction-core.ts`:
 * cliente Anthropic con baseURL explícito + modelo
 * `claude-opus-4-7` con vision capability. Pasamos el plano en
 * `content.type='file'` (PDF) o `content.type='image'` según
 * extensión.
 *
 * El prompt instruye al modelo a:
 *   - Leer áreas, lotes, vialidades, etc. de la lotificación.
 *   - Inferir métricas faltantes desde escala / proporción cuando
 *     sea razonable.
 *   - Retornar 0 si no puede determinar un valor con confianza
 *     (convención del schema; el consumer normaliza 0 → null).
 *   - Auto-evaluar confianza (alta/media/baja).
 *   - Listar recomendaciones concretas para el desarrollo.
 */

import { generateObject } from 'ai';
import { anthropic, MODELO_CLAUDE } from '@/lib/documentos/extraction-core';
import { PlanoAiAnalisisSchema, type PlanoAiAnalisis } from './schema';

const PROMPT = `Eres analista inmobiliario senior de DILESA, una desarrolladora
de fraccionamientos residenciales y comerciales en Coahuila, México.

Recibes el plano del **anteproyecto** de un fraccionamiento (puede ser un
borrador, NO es el plano oficial). Tu trabajo es leer el plano y devolver
un JSON con las métricas geométricas + observaciones técnicas + recomendaciones.

Reglas:

1. Lee con cuidado **TODA la información visible**: leyendas, tablas de
   datos generales, cuadros de superficies, simbología, escalas. Los planos
   profesionales suelen traer un cuadro "Resumen" con áreas exactas.

2. Si el plano NO tiene tabla resumen, infiere las áreas desde:
   - La escala declarada (1:1000, 1:500, etc.).
   - La proporción visual entre regiones.
   - El total declarado del predio.

3. Métricas a extraer (m² o conteo):
   - **area_total_m2**: superficie total del polígono del predio.
   - **area_vendible_m2**: suma de las áreas de lotes (residenciales,
     comerciales, mixtos). Excluye vialidades, áreas verdes, donaciones.
   - **areas_verdes_m2**: áreas marcadas como parques, jardines,
     plaza, donación de área verde, andador peatonal con vegetación.
   - **area_vialidades_m2**: arroyo vehicular + banquetas + camellones.
   - **lotes_proyectados**: conteo total de lotes individuales del plano.
   - **tamano_lote_promedio_m2**: si lo declara la tabla resumen úsalo,
     sino calcula area_vendible_m2 / lotes_proyectados.

4. Tipología:
   - **tipologia_principal**: usa SOLO uno de estos códigos exactos
     según el patrón observado: \`interes_social\`, \`residencial_medio\`,
     \`residencial_alto\`, \`plaza_comercial\`, \`usos_mixtos\`,
     \`naves_industriales\`, \`oficinas\`, \`departamentos\`,
     \`lotificacion\`. Pista: lotes <120 m² suelen ser interés social;
     200-400 m² residencial medio; >400 m² residencial alto.

5. Observaciones (texto libre, español, máximo 2 párrafos):
   - Trazo de calles (rectangular, curvo, mixto).
   - Ubicación de áreas comunes y accesos.
   - Infraestructura visible (tanques, subestaciones).
   - Calidad del plano, escala, orientación, fecha si aparece.
   - Irregularidades o cosas que llamen la atención.

6. Recomendaciones (lista corta, máximo 6 puntos):
   - Aspectos a revisar antes de aprobar.
   - Ajustes sugeridos para mejor aprovechamiento.
   - Riesgos identificados.
   - Oportunidades de optimización.

7. Confianza:
   - \`alta\` si las métricas vienen de tabla resumen o son explícitas.
   - \`media\` si parte se infirió desde escala/proporción.
   - \`baja\` si el plano es ilegible o faltan datos críticos.

8. **Si un dato no se puede determinar con confianza razonable, retorna
   0** (numéricos) o cadena vacía (strings). NO inventes números.

Devuelve SOLO el objeto JSON, sin texto adicional.`;

/**
 * Analiza el plano (bytes del archivo) con Claude vision y devuelve el
 * análisis estructurado.
 *
 * `mediaType` puede ser:
 *   - `'application/pdf'` — Claude soporta PDFs hasta 32MB directos.
 *   - `'image/png'`, `'image/jpeg'`, `'image/webp'` — imágenes hasta
 *     ~3.75MB después de base64.
 *
 * Si el plano es muy grande, comprimirlo / convertirlo a imagen del
 * lado del caller (no aquí — esto solo orquesta la llamada).
 */
export async function analizarPlanoConClaude(
  bytes: Uint8Array,
  mediaType: string
): Promise<PlanoAiAnalisis> {
  const isImage = mediaType.startsWith('image/');
  const { object } = await generateObject({
    model: anthropic(MODELO_CLAUDE),
    schema: PlanoAiAnalisisSchema,
    maxRetries: 3,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          isImage
            ? { type: 'image', image: bytes, mediaType }
            : { type: 'file', data: bytes, mediaType },
        ],
      },
    ],
  });
  return object;
}
