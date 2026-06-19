/**
 * Wrappers de invocación de IA (iniciativa `registro-ia`).
 *
 * ÚNICO punto de entrada para llamar a un modelo. Resuelve el modelo del uso
 * (`resolveModel`), invoca el SDK y devuelve el resultado. El hook de logging
 * de uso/costo a `core.ai_invocaciones` se engancha aquí en el Sprint 2 (la
 * firma no cambia: `result.usage` ya trae los tokens).
 *
 * Los call-sites NO importan `@ai-sdk/*` ni `'ai'` — el drift-guard
 * (`guard.test.ts`) lo enforce. Pasan su `usoId` (tipado contra el registry),
 * su schema/zod y sus `messages`.
 */

import { embed, generateObject, type ModelMessage } from 'ai';
import type { z } from 'zod';

import { anthropic, openai } from './clients';
import { resolveModel } from './config';
import type { AiUsoId } from './registry';

/**
 * Extracción estructurada con Claude (visión / texto). Devuelve el objeto
 * validado por `schema`. El modelo sale del registry/override del `usoId`.
 */
export async function runGenerateObject<OBJECT>(opts: {
  usoId: AiUsoId;
  schema: z.ZodType<OBJECT>;
  messages: ModelMessage[];
  maxRetries?: number;
}): Promise<OBJECT> {
  const model = await resolveModel(opts.usoId);
  const { object, usage } = await generateObject({
    model: anthropic(model),
    schema: opts.schema,
    messages: opts.messages,
    maxRetries: opts.maxRetries,
  });
  // Sprint 2 (registro-ia): logInvocacion({ usoId: opts.usoId, model, usage }).
  void usage;
  return object;
}

/**
 * Embedding de un texto con OpenAI. `dimensions` debe coincidir con la columna
 * destino (hoy `vector(1536)`). El modelo sale del registry/override del `usoId`.
 */
export async function runEmbed(opts: {
  usoId: AiUsoId;
  value: string;
  dimensions: number;
  maxRetries?: number;
}): Promise<number[]> {
  const model = await resolveModel(opts.usoId);
  const { embedding, usage } = await embed({
    model: openai.embedding(model),
    value: opts.value,
    providerOptions: { openai: { dimensions: opts.dimensions } },
    maxRetries: opts.maxRetries,
  });
  // Sprint 2 (registro-ia): logInvocacion({ usoId: opts.usoId, model, usage }).
  void usage;
  return embedding;
}
