/**
 * Los wrappers loggean uso/costo y son fail-open (iniciativa registro-ia, S2).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const generateObjectMock = vi.fn();
const generateTextMock = vi.fn();
const embedMock = vi.fn();
vi.mock('ai', () => ({
  generateObject: (...a: unknown[]) => generateObjectMock(...a),
  generateText: (...a: unknown[]) => generateTextMock(...a),
  embed: (...a: unknown[]) => embedMock(...a),
  stepCountIs: (n: number) => ({ __stepCountIs: n }),
}));

vi.mock('./clients', () => {
  // La web-search tool vive en anthropic.tools (createAnthropic real la expone).
  const anthropic = Object.assign((m: string) => ({ __model: m }), {
    tools: { webSearch_20250305: (cfg: unknown) => ({ __webSearch: cfg }) },
  });
  return {
    anthropic,
    openai: { embedding: (m: string) => ({ __model: m }) },
  };
});

// Modelo fijo para aislar el wiring del resolver.
vi.mock('./config', () => ({ resolveModel: async () => 'claude-opus-4-8' }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const inserted: any[] = [];
let adminAvailable = true;
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: () =>
    adminAvailable
      ? {
          schema: () => ({
            from: () => ({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              insert: (row: any) => {
                inserted.push(row);
                return Promise.resolve({ error: null });
              },
            }),
          }),
        }
      : null,
}));

import { runGenerateObject, runGenerateText, runEmbed } from './run';

beforeEach(() => {
  inserted.length = 0;
  adminAvailable = true;
  generateObjectMock.mockReset();
  generateTextMock.mockReset();
  embedMock.mockReset();
});

describe('registro-ia · run wrappers', () => {
  it('runGenerateObject devuelve el objeto y loggea costo', async () => {
    generateObjectMock.mockResolvedValue({
      object: { ok: true },
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
    });
    const out = await runGenerateObject({
      usoId: 'documentos-extraccion',
      schema: z.object({ ok: z.boolean() }),
      messages: [],
    });
    expect(out).toEqual({ ok: true });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].uso_id).toBe('documentos-extraccion');
    expect(inserted[0].modelo).toBe('claude-opus-4-8');
    expect(inserted[0].proveedor).toBe('anthropic');
    expect(inserted[0].costo_estimado_usd).toBeCloseTo(30, 6); // 5 + 25
    expect(inserted[0].exito).toBe(true);
  });

  it('runGenerateText devuelve el texto y loggea costo', async () => {
    generateTextMock.mockResolvedValue({
      text: '# Briefing',
      usage: { inputTokens: 2_000_000, outputTokens: 1_000_000 },
    });
    const out = await runGenerateText({
      usoId: 'daily-briefing',
      system: 'sys',
      prompt: 'arma el briefing',
    });
    expect(out).toBe('# Briefing');
    expect(inserted).toHaveLength(1);
    expect(inserted[0].uso_id).toBe('daily-briefing');
    expect(inserted[0].costo_estimado_usd).toBeCloseTo(35, 6); // 2*5 + 1*25
    expect(inserted[0].exito).toBe(true);
  });

  it('runGenerateText con web search pasa la tool y el stopWhen', async () => {
    generateTextMock.mockResolvedValue({ text: 'ok', usage: {} });
    await runGenerateText({ usoId: 'daily-briefing', prompt: 'x', webSearchMaxUses: 5 });
    const arg = generateTextMock.mock.calls[0][0] as {
      tools?: Record<string, unknown>;
      stopWhen?: unknown;
    };
    expect(arg.tools?.web_search).toBeTruthy();
    expect(arg.stopWhen).toEqual({ __stepCountIs: 8 }); // 5 + 3
  });

  it('runGenerateText: error en el modelo loggea exito=false y re-lanza', async () => {
    generateTextMock.mockRejectedValue(new Error('kaput'));
    await expect(runGenerateText({ usoId: 'daily-briefing', prompt: 'x' })).rejects.toThrow(
      'kaput'
    );
    expect(inserted[0].exito).toBe(false);
    expect(inserted[0].error).toBe('kaput');
  });

  it('runEmbed devuelve el embedding y loggea (solo input)', async () => {
    embedMock.mockResolvedValue({ embedding: [0.1, 0.2], usage: { tokens: 500_000 } });
    const emb = await runEmbed({ usoId: 'busqueda-semantica', value: 'hola', dimensions: 1536 });
    expect(emb).toEqual([0.1, 0.2]);
    expect(inserted[0].tokens_in).toBe(500_000);
    expect(inserted[0].tokens_out).toBe(0);
  });

  it('error en el modelo → loggea exito=false y re-lanza', async () => {
    generateObjectMock.mockRejectedValue(new Error('boom'));
    await expect(
      runGenerateObject({ usoId: 'csf-extraccion', schema: z.object({}), messages: [] })
    ).rejects.toThrow('boom');
    expect(inserted[0].exito).toBe(false);
    expect(inserted[0].error).toBe('boom');
  });

  it('sin service role: loggea nada pero NO rompe la extracción', async () => {
    adminAvailable = false;
    generateObjectMock.mockResolvedValue({ object: { ok: 1 }, usage: {} });
    const out = await runGenerateObject({
      usoId: 'dilesa-plano',
      schema: z.object({ ok: z.number() }),
      messages: [],
    });
    expect(out).toEqual({ ok: 1 });
    expect(inserted).toHaveLength(0);
  });
});
