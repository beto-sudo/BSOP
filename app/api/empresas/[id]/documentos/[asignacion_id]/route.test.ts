/* eslint-disable @typescript-eslint/no-explicit-any -- Test fixtures for fluent mocks. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────

let serverUser: { email: string } | null = null;
let adminAvailable = true;

type Script = {
  callerUser?: { id: string; email: string; rol: string; activo: boolean } | null;
  asignacion?: { id: string; empresa_id: string; rol: string; es_default: boolean } | null;
  updateResult?: { error: { message: string } | null };
  deleteResult?: { error: { message: string } | null };
};

let script: Script = {};

function buildAdmin(): any {
  return {
    schema(_schemaName: string) {
      return {
        from(_tableName: string) {
          let pendingUpdate: unknown = null;
          let pendingDelete = false;

          const builder: any = {
            select() {
              return builder;
            },
            update(row: unknown) {
              pendingUpdate = row;
              return builder;
            },
            delete() {
              pendingDelete = true;
              return builder;
            },
            eq() {
              return builder;
            },
            async maybeSingle() {
              // Las dos lookups del PATCH/DELETE son: core.usuarios y
              // core.empresa_documentos. El fluent mock no distingue tabla
              // aquí, devuelve por orden de llamada usando un counter.
              counter += 1;
              if (counter === 1) return { data: script.callerUser ?? null, error: null };
              if (counter === 2) return { data: script.asignacion ?? null, error: null };
              return { data: null, error: null };
            },
            then(onF: (r: any) => unknown, onR?: (r: unknown) => unknown) {
              const result = pendingDelete
                ? (script.deleteResult ?? { data: null, error: null })
                : pendingUpdate
                  ? (script.updateResult ?? { data: null, error: null })
                  : { data: null, error: null };
              return Promise.resolve(result).then(onF, onR);
            },
          };
          return builder;
        },
      };
    },
  };
}

let counter = 0;

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: serverUser } }) },
  }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: () => (adminAvailable ? buildAdmin() : null),
}));

import { PATCH, DELETE } from './route';

beforeEach(() => {
  counter = 0;
  serverUser = { email: 'admin@example.com' };
  script = {
    callerUser: { id: 'admin-uuid', email: 'admin@example.com', rol: 'admin', activo: true },
    asignacion: { id: 'asg1', empresa_id: 'e1', rol: 'acta_constitutiva', es_default: false },
    updateResult: { error: null },
    deleteResult: { error: null },
  };
  adminAvailable = true;
});

function makeReq(method: 'PATCH' | 'DELETE', body?: unknown, id = 'e1', asignacionId = 'asg1') {
  const req = new NextRequest(
    new URL(`http://localhost/api/empresas/${id}/documentos/${asignacionId}`),
    {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }
  );
  return { req, ctx: { params: Promise.resolve({ id, asignacion_id: asignacionId }) } };
}

describe('PATCH /api/empresas/[id]/documentos/[asignacion_id]', () => {
  it('401 sin user', async () => {
    serverUser = null;
    const { req, ctx } = makeReq('PATCH', { es_default: true });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(401);
  });

  it('403 si caller no es admin', async () => {
    script.callerUser = { id: 'u1', email: 'x@y.com', rol: 'usuario', activo: true };
    const { req, ctx } = makeReq('PATCH', { es_default: true });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(403);
  });

  it('400 si body trae llaves desconocidas', async () => {
    const { req, ctx } = makeReq('PATCH', { es_default: true, extra: 'x' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it('400 si body vacío', async () => {
    const { req, ctx } = makeReq('PATCH', {});
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it('404 si la asignación no existe', async () => {
    script.asignacion = null;
    const { req, ctx } = makeReq('PATCH', { es_default: true });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(404);
  });

  it('403 si la asignación pertenece a otra empresa', async () => {
    script.asignacion = {
      id: 'asg1',
      empresa_id: 'OTRA',
      rol: 'acta_constitutiva',
      es_default: false,
    };
    const { req, ctx } = makeReq('PATCH', { es_default: true });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(403);
  });

  it('200 al cambiar es_default=true', async () => {
    const { req, ctx } = makeReq('PATCH', { es_default: true });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fields_updated).toContain('es_default');
  });

  it('200 al actualizar solo notas', async () => {
    const { req, ctx } = makeReq('PATCH', { notas: 'doc legacy migrado de Coda' });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
  });

  it('200 al limpiar notas con null', async () => {
    const { req, ctx } = makeReq('PATCH', { notas: null });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/empresas/[id]/documentos/[asignacion_id]', () => {
  it('401 sin user', async () => {
    serverUser = null;
    const { req, ctx } = makeReq('DELETE');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(401);
  });

  it('403 si caller no es admin', async () => {
    script.callerUser = { id: 'u1', email: 'x@y.com', rol: 'usuario', activo: true };
    const { req, ctx } = makeReq('DELETE');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(403);
  });

  it('404 si la asignación no existe', async () => {
    script.asignacion = null;
    const { req, ctx } = makeReq('DELETE');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(404);
  });

  it('403 si la asignación pertenece a otra empresa', async () => {
    script.asignacion = {
      id: 'asg1',
      empresa_id: 'OTRA',
      rol: 'acta_constitutiva',
      es_default: false,
    };
    const { req, ctx } = makeReq('DELETE');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(403);
  });

  it('200 al borrar', async () => {
    const { req, ctx } = makeReq('DELETE');
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe(true);
  });
});
