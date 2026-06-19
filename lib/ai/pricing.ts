/**
 * Pricing estimado de los modelos de IA (iniciativa registro-ia, Sprint 2).
 *
 * USD por 1M de tokens. Fuente: referencia de la API de Claude (Anthropic) +
 * OpenAI para el embedding. Los tokens loggeados en `core.ai_invocaciones` son
 * FACTUALES (del `usage` de la API); el costo es DERIVADO de esta tabla — si el
 * pricing cambia, actualizá acá y el costo se recalcula hacia adelante (lo
 * histórico queda con el costo del momento). Verificado 2026-06-19.
 */

export interface Precio {
  /** USD por 1M tokens de input. */
  input: number;
  /** USD por 1M tokens de output (0 para embeddings). */
  output: number;
}

export const PRICING: Record<string, Precio> = {
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-fable-5': { input: 10, output: 50 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
};

/**
 * Costo estimado en USD de una llamada. Modelo desconocido → 0 (los tokens
 * igual quedan loggeados; al sumar el pricing acá, el costo histórico se puede
 * recomputar desde los tokens).
 */
export function estimarCostoUsd(modelo: string, tokensIn: number, tokensOut: number): number {
  const p = PRICING[modelo];
  if (!p) return 0;
  return (tokensIn * p.input + tokensOut * p.output) / 1_000_000;
}
