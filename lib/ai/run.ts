/**
 * Wrappers de invocación de IA (iniciativa registro-ia).
 *
 * ÚNICO punto de entrada para llamar a un modelo. Resuelve el modelo del uso
 * (`resolveModel`), invoca el SDK, loggea uso/costo en `core.ai_invocaciones`
 * (fail-open) y devuelve el resultado.
 *
 * Los call-sites NO importan `@ai-sdk/*` ni `'ai'` — el drift-guard
 * (`guard.test.ts`) lo enforce. Pasan su `usoId` (tipado contra el registry),
 * su schema/zod y sus `messages`.
 */

import { embed, generateObject, type ModelMessage } from 'ai';
import type { z } from 'zod';

import { anthropic, openai } from './clients';
import { resolveModel } from './config';
import { logInvocacion } from './log';
import type { AiUsoId } from './registry';

/** Lee tokens del `usage` del SDK sin acoplarse a su shape exacto. */
function leerUsage(usage: unknown): { tokensIn: number; tokensOut: number } {
  const u = (usage ?? {}) as {
    inputTokens?: number;
    outputTokens?: number;
    tokens?: number; // embeddings: solo input
  };
  return {
    tokensIn: u.inputTokens ?? u.tokens ?? 0,
    tokensOut: u.outputTokens ?? 0,
  };
}

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
  const start = Date.now();
  try {
    const { object, usage } = await generateObject({
      model: anthropic(model),
      schema: opts.schema,
      messages: opts.messages,
      maxRetries: opts.maxRetries,
    });
    const { tokensIn, tokensOut } = leerUsage(usage);
    await logInvocacion({
      usoId: opts.usoId,
      modelo: model,
      tokensIn,
      tokensOut,
      exito: true,
      duracionMs: Date.now() - start,
    });
    return object;
  } catch (err) {
    await logInvocacion({
      usoId: opts.usoId,
      modelo: model,
      tokensIn: 0,
      tokensOut: 0,
      exito: false,
      error: err instanceof Error ? err.message : String(err),
      duracionMs: Date.now() - start,
    });
    throw err;
  }
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
  const start = Date.now();
  try {
    const { embedding, usage } = await embed({
      model: openai.embedding(model),
      value: opts.value,
      providerOptions: { openai: { dimensions: opts.dimensions } },
      maxRetries: opts.maxRetries,
    });
    const { tokensIn, tokensOut } = leerUsage(usage);
    await logInvocacion({
      usoId: opts.usoId,
      modelo: model,
      tokensIn,
      tokensOut,
      exito: true,
      duracionMs: Date.now() - start,
    });
    return embedding;
  } catch (err) {
    await logInvocacion({
      usoId: opts.usoId,
      modelo: model,
      tokensIn: 0,
      tokensOut: 0,
      exito: false,
      error: err instanceof Error ? err.message : String(err),
      duracionMs: Date.now() - start,
    });
    throw err;
  }
}
