/**
 * Capa única de acceso a IA (iniciativa `registro-ia`, ADR-046).
 *
 * Importá SIEMPRE desde aquí (`@/lib/ai`). El drift-guard falla el build si
 * algún archivo fuera de `lib/ai/` importa `@ai-sdk/*` o `'ai'` directamente.
 *
 *   import { runGenerateObject, runEmbed, EMBEDDING_DIMS } from '@/lib/ai';
 */

export { DEFAULT_CLAUDE_MODEL, DEFAULT_EMBEDDING_MODEL, EMBEDDING_DIMS } from './models';
export {
  AI_USOS,
  AI_USO_IDS,
  getUso,
  type AiUso,
  type AiUsoId,
  type AiProveedor,
  type AiEmpresa,
  type AiModalidad,
  type AiCriticidad,
} from './registry';
export { resolveModel } from './config';
export { runGenerateObject, runGenerateText, runEmbed } from './run';
export { PRICING, estimarCostoUsd, type Precio } from './pricing';
