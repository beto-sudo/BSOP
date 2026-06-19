/**
 * Resolución del modelo efectivo de un uso de IA (iniciativa `registro-ia`).
 *
 * Sprint 1: devuelve el default del registry. El override por DB
 * (`core.ai_config`, editable desde la UI sin redeploy — en Vercel una env var
 * NO es hot-swap: las lambdas warm cachean `process.env`) llega en Sprint 2.
 *
 * Ya es `async` a propósito: así agregar la lectura de `core.ai_config` (con
 * cache + fail-open al default) en Sprint 2 es drop-in y ningún call-site
 * cambia de firma. Fail-open por diseño — ante cualquier duda, el default.
 */

import { AI_USOS, type AiUsoId } from './registry';

export async function resolveModel(usoId: AiUsoId): Promise<string> {
  return AI_USOS[usoId].modeloDefault;
}
