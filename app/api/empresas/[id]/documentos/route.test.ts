/* eslint-disable @typescript-eslint/no-explicit-any -- Test fixtures for fluent mocks. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────

let serverUser: { email: string } | null = null;
let adminAvailable = true;

// Per-test fixtures.
type Script = {
  callerUser?: { id: string; email: string; rol: string; activo: boolean } | null;
  empresa?: { id: string; slug: string } | null;
  documento?: { id: string; empresa_id: string } | null;
  rows?: Array<{
    id: string;
    documento_id: string;
    rol: string;
    es_default: boolean;
    asignado_por: string | null;
    asignado_at: string;
    notas: string | null;
    created_at: string;
  }>;
  documentosByIds?: Array<{
    id: string;
    titulo: string | null;
    numero_documento: string | null;
    fecha_emision: string | null;
    archivo_url: string | null;
    subtipo_meta: Record<string, unknown> | null;
    tipo: string | null;
    tipo_operacion: string | null;
    extraccion_status: string | null;
  }>;
  insertResult?: { data: any; error: { message: string } | null };
  updateResult?: { error: { message: string } | null };
};

let script: Script = {};

function buildAdmin(): any {
  return {
    schema(schemaName: string) {
      return {
        from(tableName: string) {
          const key = `${schemaName}.${tableName}`;
          const filters: Record<string, unknown> = {};
          let pendingInsert: unknown = null;
          let pendingUpdate: unknown = null;

          const builder: any = {
            select() {
              return builder;
            },
            insert(row: unknown) {
              pendingInsert = row;
              return builder;
            },
            update(row: unknown) {
              pendingUpdate = row;
              return builder;
            },
            eq(col: string, val: unknown) {
              filters[col] = val;
              return builder;
            },
            in(_col: string, _vals: unknown[]) {
              return builder;
            },
            is() {
              return builder;
            },
            order() {
              return builder;
            },
            async maybeSingle() {
              if (key === 'core.usuarios') return { data: script.callerUser ?? null, error: null };
              if (key === 'core.empresas') return { data: script.empresa ?? null, error: null };
              if (key === 'erp.documentos') return { data: script.documento ?? null, error: null };
              return { data: null, error: null };
            },
            async single() {
              if (pendingInsert && key === 'core.empresa_documentos') {
                return (
                  script.insertResult ?? {
                    data: {
                      id: 'asg-new',
                      empresa_id: 'e1',
                      documento_id: 'd1',
                      rol: 'acta_constitutiva',
                      es_default: false,
                      asignado_por: 'admin-uuid',
                      asignado_at: '2026-04-28T00:00:00Z',
                      notas: null,
                    },
                    error: null,
                  }
                );
              }
              return { data: null, error: null };
            },
            then(onF: (r: any) => unknown, onR?: (r: unknown) => unknown) {
              const result = pendingUpdate
                ? (script.updateResult ?? { data: null, error: null })
                : key === 'core.empresa_documentos'
                  ? { data: script.rows ?? [], error: null }
                  : key === 'erp.documentos'
                    ? { data: script.documentosByIds ?? [], error: null }
                    : { data: [], error: null };
              return Promise.resolve(result).then(onF, onR);
            },
          };
          return builder;
        },
      };
    },
  };
}

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: serverUser } }) },
  }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: () => (adminAvailable ? buildAdmin() : null),
}));

import { GET, POST } from './route';

beforeEach(() => {
  serverUser = { email: 'admin@example.com' };
  script = {
    callerUser: { id: 'admin-uuid', email: 'admin@example.com', rol: 'admin', activo: true },
    empresa: { id: 'e1', slug: 'rdb' },
    documento: { id: 'd1', empresa_id: 'e1' },
    rows: [],
    documentosByIds: [],
    insertResult: undefined,
    updateResult: { error: null },
  };
  adminAvailable = true;
});

function makeReq(method: 'GET' | 'POST', body?: unknown, id = 'e1') {
  const req = new NextRequest(new URL(`http://localhost/api/empresas/${id}/documentos`), {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { req, ctx: { params: Promise.resolve({ id }) } };
}

describe('GET /api/empresas/[id]/documentos', () => {
  it('401 si no hay user', async () => {
    serverUser = null;
    const { req, ctx } = makeReq('GET');
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
  });

  it('403 si caller no es admin', async () => {
    script.callerUser = { id: 'u1', email: 'x@y.com', rol: 'usuario', activo: true };
    const { req, ctx } = makeReq('GET');
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
  });

  it('404 si la empresa no existe', async () => {
    script.empresa = null;
    const { req, ctx } = makeReq('GET');
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it('200 con asignaciones vacías', async () => {
    const { req, ctx } = makeReq('GET');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.asignaciones).toEqual([]);
  });

  it('200 con asignaciones hidratadas con metadata del documento', async () => {
    script.rows = [
      {
        id: 'asg1',
        documento_id: 'd1',
        rol: 'acta_constitutiva',
        es_default: true,
        asignado_por: 'admin-uuid',
        asignado_at: '2026-04-28T00:00:00Z',
        notas: null,
        created_at: '2026-04-28T00:00:00Z',
      },
    ];
    script.documentosByIds = [
      {
        id: 'd1',
        titulo: 'Escritura Constitutiva',
        numero_documento: '12345',
        fecha_emision: '2010-05-15',
        archivo_url: 'erp/x.pdf',
        subtipo_meta: { numero_escritura: '12345', notario_nombre: 'JUAN' },
        tipo: 'legal',
        tipo_operacion: 'constitutiva',
        extraccion_status: 'completado',
      },
    ];
    const { req, ctx } = makeReq('GET');
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.asignaciones).toHaveLength(1);
    expect(json.asignaciones[0].documento.titulo).toBe('Escritura Constitutiva');
    expect(json.asignaciones[0].es_default).toBe(true);
  });
});

describe('POST /api/empresas/[id]/documentos', () => {
  it('401 si no hay user', async () => {
    serverUser = null;
    const { req, ctx } = makeReq('POST', {
      documento_id: 'e52ac307-9373-4115-b65e-1178f0c4e1aa',
      rol: 'acta_constitutiva',
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
  });

  it('403 si caller no es admin', async () => {
    script.callerUser = { id: 'u1', email: 'x@y.com', rol: 'usuario', activo: true };
    const { req, ctx } = makeReq('POST', {
      documento_id: 'e52ac307-9373-4115-b65e-1178f0c4e1aa',
      rol: 'acta_constitutiva',
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(403);
  });

  it('400 si body trae llaves desconocidas (strict)', async () => {
    const { req, ctx } = makeReq('POST', {
      documento_id: 'e52ac307-9373-4115-b65e-1178f0c4e1aa',
      rol: 'acta_constitutiva',
      extra: 'x',
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
  });

  it('400 si rol no está en el enum permitido', async () => {
    const { req, ctx } = makeReq('POST', {
      documento_id: 'e52ac307-9373-4115-b65e-1178f0c4e1aa',
      rol: 'rol_inventado',
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
  });

  it('400 si documento_id no es UUID', async () => {
    const { req, ctx } = makeReq('POST', { documento_id: 'no-uuid', rol: 'acta_constitutiva' });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
  });

  it('404 si la empresa no existe', async () => {
    script.empresa = null;
    const { req, ctx } = makeReq('POST', {
      documento_id: 'e52ac307-9373-4115-b65e-1178f0c4e1aa',
      rol: 'acta_constitutiva',
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
  });

  it('404 si el documento no existe', async () => {
    script.documento = null;
    const { req, ctx } = makeReq('POST', {
      documento_id: 'e52ac307-9373-4115-b65e-1178f0c4e1aa',
      rol: 'acta_constitutiva',
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(404);
  });

  it('403 si el documento pertenece a otra empresa', async () => {
    script.documento = { id: 'd1', empresa_id: 'OTRA-EMPRESA' };
    const { req, ctx } = makeReq('POST', {
      documento_id: 'e52ac307-9373-4115-b65e-1178f0c4e1aa',
      rol: 'acta_constitutiva',
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(403);
  });

  it('200 con flujo OK (es_default=false default)', async () => {
    const { req, ctx } = makeReq('POST', {
      documento_id: 'e52ac307-9373-4115-b65e-1178f0c4e1aa',
      rol: 'acta_constitutiva',
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.asignacion).toBeDefined();
  });

  it('200 con es_default=true (limpia defaults previos del rol)', async () => {
    const { req, ctx } = makeReq('POST', {
      documento_id: 'e52ac307-9373-4115-b65e-1178f0c4e1aa',
      rol: 'poder_general_administracion',
      es_default: true,
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
  });

  it('409 si UNIQUE constraint falla (doc ya asignado al mismo rol)', async () => {
    script.insertResult = {
      data: null,
      error: { message: 'duplicate key value violates unique constraint' },
    };
    const { req, ctx } = makeReq('POST', {
      documento_id: 'e52ac307-9373-4115-b65e-1178f0c4e1aa',
      rol: 'acta_constitutiva',
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(409);
  });
});
