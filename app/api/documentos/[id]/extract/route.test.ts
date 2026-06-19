import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Tests para `POST /api/documentos/[id]/extract`.
 *
 * Sprint 3B de tech-debt-h1-2026 — fortifica el flujo de extracción IA
 * (Claude + OpenAI embeddings). Sin tests, una regresión podría:
 *
 *   - Dejar documentos colgados en estado `procesando` cuando Claude
 *     falla (rollback roto).
 *   - Saltarse el lock optimista y permitir 2 procesamientos paralelos
 *     del mismo doc (gasto duplicado en API de Claude).
 *   - Fallar el rename del archivo storage sin que la UI se entere
 *     (drift entre `adjuntos.url` y el path real).
 *
 * **Mock strategy A**: mockeamos `@/lib/documentos/extraction-core` al
 * nivel de módulo. La cobertura de los wrappers reales (Claude/OpenAI
 * SDK) vive en `lib/documentos/extraction-core.test.ts` (existente).
 * Aquí enfocamos la lógica del **route**: auth, lock, rollback,
 * rename. Decisión documentada en `docs/planning/tech-debt-h1-2026.md`.
 */

// ── State del test ─────────────────────────────────────────────────────

let serverUser: { email: string } | null = null;
let userDocResult: { data: unknown; error: { message: string } | null } = {
  data: null,
  error: null,
};
let adminAvailable = true;
let adjuntosResult: { data: unknown; error: { message: string } | null } = {
  data: null,
  error: null,
};
let empresaSlug: string | null = 'dilesa';
let lockResult: { data: unknown; error: { message: string } | null } = {
  data: [{ id: 'doc-1' }],
  error: null,
};
let downloadResult: { data: Blob | null; error: { message: string } | null } = {
  data: null,
  error: null,
};
let tipoResult: { tipo: string | null } = { tipo: 'escritura' };
let extractWithClaudeImpl: () => Promise<unknown> = async () => ({});
let embedContentImpl: () => Promise<number[]> = async () => [];
let updateDocResult: { data: unknown; error: { message: string } | null } = {
  data: { id: 'doc-1' },
  error: null,
};
let moveResult: { error: { message: string } | null } = { error: null };
let isTituloStandard = false;

// Captura de updates a `documentos` para verificar rollbacks/locks.
let documentoUpdates: Array<Record<string, unknown>> = [];
// Captura de moves de storage.
let storageMoves: Array<{ from: string; to: string }> = [];

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: serverUser } }) },
    schema: (_schemaName: string) => ({
      from: (_tableName: string) => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: async () => userDocResult,
            }),
          }),
        }),
      }),
    }),
  }),
}));

/* eslint-disable @typescript-eslint/no-explicit-any -- test doubles */
function buildAdminMock(): any {
  return {
    schema(schemaName: string) {
      return {
        from(tableName: string) {
          const builder: any = {
            _filters: {} as Record<string, unknown>,
            _payload: undefined as unknown,
            _op: '' as string,
            select(_cols: string) {
              this._op = this._op || 'select';
              return this;
            },
            insert(payload: unknown) {
              this._op = 'insert';
              this._payload = payload;
              return this;
            },
            update(payload: unknown) {
              this._op = 'update';
              this._payload = payload;
              return this;
            },
            eq(col: string, val: unknown) {
              this._filters[col] = val;
              return this;
            },
            in(col: string, vals: unknown[]) {
              this._filters[col] = vals;
              return this;
            },
            is(_col: string, _val: unknown) {
              return this;
            },
            order(_col: string, _opts: unknown) {
              // Resolver fetch adjuntos al pedir order(): el route hace
              // .order() como último call.
              if (schemaName === 'erp' && tableName === 'adjuntos') {
                return Promise.resolve(adjuntosResult);
              }
              return this;
            },
            async maybeSingle() {
              if (schemaName === 'core' && tableName === 'empresas') {
                return { data: empresaSlug ? { slug: empresaSlug } : null, error: null };
              }
              return { data: null, error: null };
            },
            async single() {
              if (schemaName === 'erp' && tableName === 'documentos' && this._op === 'select') {
                return { data: tipoResult, error: null };
              }
              if (schemaName === 'erp' && tableName === 'documentos' && this._op === 'update') {
                // El commit final usa `.update().eq().select('*').single()`
                // — capturamos el payload aquí (en `then` no llega porque
                // se resuelve via single, no via await directo).
                if (
                  this._payload &&
                  typeof this._payload === 'object' &&
                  'extraccion_status' in (this._payload as Record<string, unknown>)
                ) {
                  documentoUpdates.push(this._payload as Record<string, unknown>);
                }
                return updateDocResult;
              }
              return { data: null, error: null };
            },
            then(onFulfilled: (r: { data: unknown; error: unknown }) => unknown) {
              // Branch por (schema.table, op).
              if (
                schemaName === 'erp' &&
                tableName === 'documentos' &&
                this._op === 'update' &&
                this._payload &&
                typeof this._payload === 'object' &&
                'extraccion_status' in (this._payload as Record<string, unknown>)
              ) {
                const payload = this._payload as Record<string, unknown>;
                documentoUpdates.push(payload);
                // Si es el lock optimista, devolver lockResult.
                if (payload.extraccion_status === 'procesando') {
                  return Promise.resolve(lockResult).then(onFulfilled);
                }
                // Rollback en catch (status 'error').
                if (payload.extraccion_status === 'error') {
                  return Promise.resolve({ data: null, error: null }).then(onFulfilled);
                }
              }
              if (schemaName === 'erp' && tableName === 'adjuntos' && this._op === 'update') {
                return Promise.resolve({ data: null, error: null }).then(onFulfilled);
              }
              return Promise.resolve({ data: null, error: null }).then(onFulfilled);
            },
          };
          return builder;
        },
      };
    },
    storage: {
      from(_bucket: string) {
        return {
          async download(_path: string) {
            return downloadResult;
          },
          async move(from: string, to: string) {
            storageMoves.push({ from, to });
            return moveResult;
          },
        };
      },
    },
  };
}

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: () => (adminAvailable ? buildAdminMock() : null),
}));

vi.mock('@/lib/adjuntos', () => ({
  getAdjuntoPath: (url: string | null | undefined) => url ?? null,
}));

vi.mock('@/lib/documentos/extraction-core', () => ({
  ensurePdfFitsForClaude: async (raw: Uint8Array) => raw,
  extractWithClaude: async (..._args: unknown[]) => extractWithClaudeImpl(),
  embedContent: async (..._args: unknown[]) => embedContentImpl(),
  extraccionToDocumentoUpdates: (e: unknown) => {
    // Pass-through simplificado para tests: solo extraemos los campos
    // que el route distingue (`fecha_emision`, `numero_documento`).
    const extr = e as Record<string, unknown>;
    return {
      fecha_emision: extr.fecha_emision ?? null,
      numero_documento: extr.numero_documento ?? null,
      contenido_texto: extr.contenido_texto ?? '',
    };
  },
}));

vi.mock('@/lib/documentos/naming', () => ({
  buildStandardTitulo: ({
    tipo,
    fecha,
    numero,
  }: {
    tipo: unknown;
    fecha: unknown;
    numero: unknown;
  }) => {
    if (tipo && fecha && numero) return `STD_${tipo}_${fecha}_${numero}`;
    return null;
  },
  buildStandardFilename: (titulo: string) => `${titulo}.pdf`,
  isStandardTitulo: () => isTituloStandard,
}));

// ── Setup ──────────────────────────────────────────────────────────────

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  // Reset state
  serverUser = { email: 'beto@anorte.com' };
  userDocResult = {
    data: { id: 'doc-1', empresa_id: 'emp-1', titulo: 'Original', extraccion_status: 'pendiente' },
    error: null,
  };
  adminAvailable = true;
  adjuntosResult = {
    data: [{ id: 'adj-1', url: 'dilesa/escrituras/file.pdf', nombre: 'file.pdf' }],
    error: null,
  };
  empresaSlug = 'dilesa';
  lockResult = { data: [{ id: 'doc-1' }], error: null };
  downloadResult = {
    data: new Blob([new Uint8Array(100)], { type: 'application/pdf' }),
    error: null,
  };
  tipoResult = { tipo: 'escritura' };
  extractWithClaudeImpl = async () => ({
    fecha_emision: '2026-01-15',
    numero_documento: '123',
    contenido_texto: 'texto del documento',
  });
  embedContentImpl = async () => Array(1536).fill(0.1);
  updateDocResult = {
    data: { id: 'doc-1', titulo: 'STD_escritura_2026-01-15_123' },
    error: null,
  };
  moveResult = { error: null };
  isTituloStandard = false;
  documentoUpdates = [];
  storageMoves = [];

  // Env vars
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  process.env.OPENAI_API_KEY = 'test-openai-key';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// ── Test ───────────────────────────────────────────────────────────────

import { POST } from './route';

function makeReq(documentoId = 'doc-1'): {
  req: NextRequest;
  ctx: { params: Promise<{ id: string }> };
} {
  const req = new NextRequest(new URL(`http://localhost/api/documentos/${documentoId}/extract`), {
    method: 'POST',
  });
  return { req, ctx: { params: Promise.resolve({ id: documentoId }) } };
}

describe('POST /api/documentos/[id]/extract', () => {
  it('500 si ANTHROPIC_API_KEY no está configurada', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { req, ctx } = makeReq();
    const res = await POST(req, ctx);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('500 si OPENAI_API_KEY no está configurada', async () => {
    delete process.env.OPENAI_API_KEY;
    const { req, ctx } = makeReq();
    const res = await POST(req, ctx);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/OPENAI_API_KEY/);
  });

  it('401 si no hay sesión', async () => {
    serverUser = null;
    const { req, ctx } = makeReq();
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
  });

  it('404 si documento no existe (RLS bloquea o no encontrado)', async () => {
    userDocResult = { data: null, error: null };
    const { req, ctx } = makeReq();
    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
  });

  it('500 si error al fetch del documento', async () => {
    userDocResult = { data: null, error: { message: 'connection lost' } };
    const { req, ctx } = makeReq();
    const res = await POST(req, ctx);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/fetch documento/);
  });

  it('500 si admin client no está disponible', async () => {
    adminAvailable = false;
    const { req, ctx } = makeReq();
    const res = await POST(req, ctx);
    expect(res.status).toBe(500);
  });

  it('500 si error al fetch adjuntos', async () => {
    adjuntosResult = { data: null, error: { message: 'storage error' } };
    const { req, ctx } = makeReq();
    const res = await POST(req, ctx);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/fetch adjuntos/);
  });

  it('400 si el documento no tiene PDF principal adjunto', async () => {
    adjuntosResult = { data: [], error: null };
    const { req, ctx } = makeReq();
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/PDF principal/i);
  });

  it('409 si el lock optimista falla (otro request lo tomó)', async () => {
    lockResult = { data: [], error: null };
    const { req, ctx } = makeReq();
    const res = await POST(req, ctx);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/ya est[áa] procesándose|otro request/i);
  });

  it('500 si la query del lock lanza error', async () => {
    lockResult = { data: null, error: { message: 'rls violation' } };
    const { req, ctx } = makeReq();
    const res = await POST(req, ctx);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/lock/);
  });

  it('marca el documento como `procesando` antes de llamar a la IA', async () => {
    let claudeCalledAt = -1;
    let lockSeenAt = -1;
    extractWithClaudeImpl = async () => {
      claudeCalledAt = documentoUpdates.length;
      return {
        fecha_emision: '2026-01-15',
        numero_documento: '123',
        contenido_texto: 'texto',
      };
    };
    const { req, ctx } = makeReq();
    await POST(req, ctx);
    // El lock fue el primer update; Claude se llamó después.
    lockSeenAt = documentoUpdates.findIndex((u) => u.extraccion_status === 'procesando');
    expect(lockSeenAt).toBe(0);
    expect(claudeCalledAt).toBeGreaterThanOrEqual(1);
  });

  it('rollback a `error` si Claude falla', async () => {
    extractWithClaudeImpl = async () => {
      throw new Error('Claude API rate limit');
    };
    const { req, ctx } = makeReq();
    const res = await POST(req, ctx);
    expect(res.status).toBe(500);
    // Debe haber un update con status='error' tras el lock.
    const errorUpdate = documentoUpdates.find((u) => u.extraccion_status === 'error');
    expect(errorUpdate).toBeDefined();
    expect(errorUpdate?.extraccion_error).toMatch(/Claude API rate limit/);
  });

  it('rollback a `error` si OpenAI embedding falla', async () => {
    embedContentImpl = async () => {
      throw new Error('OpenAI quota exceeded');
    };
    const { req, ctx } = makeReq();
    const res = await POST(req, ctx);
    expect(res.status).toBe(500);
    const errorUpdate = documentoUpdates.find((u) => u.extraccion_status === 'error');
    expect(errorUpdate).toBeDefined();
    expect(errorUpdate?.extraccion_error).toMatch(/OpenAI/);
  });

  it('success path: extrae, embebe y commitea con status=completado', async () => {
    const { req, ctx } = makeReq();
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.documento).toBeDefined();
    // Hubo un update final con status='completado'.
    const completedUpdate = documentoUpdates.find((u) => u.extraccion_status === 'completado');
    expect(completedUpdate).toBeDefined();
  });

  it('renombra el archivo en storage si el título estandarizado difiere', async () => {
    isTituloStandard = false; // El actual no es estándar
    const { req, ctx } = makeReq();
    await POST(req, ctx);
    // Storage move se invocó.
    expect(storageMoves.length).toBeGreaterThan(0);
    const move = storageMoves[0];
    expect(move.to).toContain('STD_escritura_2026-01-15_123.pdf');
  });

  it('NO renombra si el título ya está en formato estándar (respeta edición humana)', async () => {
    isTituloStandard = true; // Ya estándar — respetar
    // Cambiar el path actual al que sería el target, así no es un caso de
    // "el mismo título genera mismo path"
    userDocResult = {
      data: {
        id: 'doc-1',
        empresa_id: 'emp-1',
        titulo: 'STD_escritura_2026-01-15_123',
        extraccion_status: 'pendiente',
      },
      error: null,
    };
    const { req, ctx } = makeReq();
    await POST(req, ctx);
    // El move puede no haberse llamado, o haberse llamado pero a misma path.
    // El test importante es que el `updates.titulo` NO se sobrescribe.
    const completedUpdate = documentoUpdates.find((u) => u.extraccion_status === 'completado');
    expect(completedUpdate?.titulo).toBeUndefined();
  });

  it('preserva fecha_emision/numero_documento humanos cuando IA devuelve null', async () => {
    extractWithClaudeImpl = async () => ({
      fecha_emision: null,
      numero_documento: null,
      contenido_texto: 'algo',
    });
    const { req, ctx } = makeReq();
    await POST(req, ctx);
    const completedUpdate = documentoUpdates.find((u) => u.extraccion_status === 'completado');
    // No deben aparecer estos campos en el update final (delete del route).
    expect(completedUpdate).toBeDefined();
    expect(completedUpdate?.fecha_emision).toBeUndefined();
    expect(completedUpdate?.numero_documento).toBeUndefined();
  });
});
