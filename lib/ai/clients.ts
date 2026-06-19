/**
 * Clientes de los proveedores de IA (iniciativa `registro-ia`).
 *
 * Este es el ÚNICO módulo del repo que importa los SDK de proveedor
 * (`@ai-sdk/*`). El drift-guard (`lib/ai/guard.test.ts`) falla el build si
 * algún archivo fuera de `lib/ai/` los importa. Todo call-site pasa por
 * `runGenerateObject` / `runEmbed` (`lib/ai/run.ts`).
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';

// baseURL explícito — evita que una `ANTHROPIC_BASE_URL` del shell (p.ej.
// cuando este código corre dentro de Claude Code) rompa las llamadas. Coincide
// con el default oficial. (Movido desde lib/documentos/extraction-core.ts.)
export const anthropic = createAnthropic({ baseURL: 'https://api.anthropic.com/v1' });

export { openai };
