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

import { embed, generateObject, generateText, stepCountIs, type ModelMessage } from 'ai';
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
 * Generación de texto libre con Claude (no estructurada). Devuelve el `text`
 * final. Para tareas que necesitan navegar la web (briefing diario, etc.) se
 * habilita la web-search tool server-side de Anthropic pasando
 * `webSearchMaxUses` — el modelo decide cuántas búsquedas hace, hasta ese tope.
 * El modelo sale del registry/override del `usoId` y el uso/costo (en tokens) se
 * loggea en `core.ai_invocaciones`. OJO: el costo de la web-search tool (por
 * búsqueda) NO está en el token-pricing; queda fuera del costo estimado.
 */
export async function runGenerateText(opts: {
  usoId: AiUsoId;
  system?: string;
  prompt?: string;
  messages?: ModelMessage[];
  /** Si > 0, habilita la web-search tool de Anthropic con ese máximo de usos. */
  webSearchMaxUses?: number;
  maxRetries?: number;
}): Promise<string> {
  const model = await resolveModel(opts.usoId);
  const start = Date.now();
  const tools =
    opts.webSearchMaxUses && opts.webSearchMaxUses > 0
      ? { web_search: anthropic.tools.webSearch_20250305({ maxUses: opts.webSearchMaxUses }) }
      : undefined;
  try {
    const base = {
      model: anthropic(model),
      system: opts.system,
      tools,
      // Con web search el modelo alterna búsqueda↔texto en varios steps; sin
      // tope se quedaría en un solo turno. Holgura sobre el máximo de búsquedas.
      stopWhen: tools ? stepCountIs((opts.webSearchMaxUses ?? 0) + 3) : undefined,
      maxRetries: opts.maxRetries,
    };
    // generateText exige prompt XOR messages (no ambos `undefined`).
    const { text, usage } = await generateText(
      opts.messages ? { ...base, messages: opts.messages } : { ...base, prompt: opts.prompt ?? '' }
    );
    const { tokensIn, tokensOut } = leerUsage(usage);
    await logInvocacion({
      usoId: opts.usoId,
      modelo: model,
      tokensIn,
      tokensOut,
      exito: true,
      duracionMs: Date.now() - start,
    });
    return text;
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
