/**
 * resolveModel: override desde core.ai_config + fail-open al default del registry
 * (iniciativa registro-ia, Sprint 2).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

let adminAvailable = true;
let configRows: { uso_id: string; modelo: string }[] | null = null;
let configError: unknown = null;

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: () =>
    adminAvailable
      ? {
          schema: () => ({
            from: () => ({
              select: () => Promise.resolve({ data: configRows, error: configError }),
            }),
          }),
        }
      : null,
}));

import { resolveModel, __resetAiConfigCache } from './config';
import { AI_USOS } from './registry';

const DEFAULT_DOCS = AI_USOS['documentos-extraccion'].modeloDefault;

beforeEach(() => {
  adminAvailable = true;
  configRows = [];
  configError = null;
  __resetAiConfigCache();
});

describe('registro-ia · resolveModel', () => {
  it('sin override → default del registry', async () => {
    expect(await resolveModel('documentos-extraccion')).toBe(DEFAULT_DOCS);
  });

  it('con override en core.ai_config → usa el override', async () => {
    configRows = [{ uso_id: 'documentos-extraccion', modelo: 'claude-sonnet-4-6' }];
    expect(await resolveModel('documentos-extraccion')).toBe('claude-sonnet-4-6');
    // Un uso sin override sigue en su default.
    expect(await resolveModel('csf-extraccion')).toBe(AI_USOS['csf-extraccion'].modeloDefault);
  });

  it('sin service role → fail-open al default', async () => {
    adminAvailable = false;
    expect(await resolveModel('dilesa-plano')).toBe(AI_USOS['dilesa-plano'].modeloDefault);
  });

  it('error de query (ej. tabla inexistente) → fail-open al default', async () => {
    configRows = null;
    configError = { message: 'relation "core.ai_config" does not exist' };
    expect(await resolveModel('dilesa-pld-informe')).toBe(
      AI_USOS['dilesa-pld-informe'].modeloDefault
    );
  });
});
