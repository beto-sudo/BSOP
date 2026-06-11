import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signEncuestaToken } from '@/lib/dilesa/encuesta-token';

/**
 * Tests para `POST /api/dilesa/encuesta/[token]` — la respuesta del cliente
 * a la Encuesta de Conformidad (Fase 16) vía magic link.
 *
 * Cubre: token inválido/expirado, validación de respuestas (NPS 0-10,
 * estrellas 1-5), guardado + cierre de fase, idempotencia (ya respondida),
 * y que el caché fase_actual solo avanza.
 *
 * Mock: `getSupabaseAdminClient` con un stub chainable en memoria.
 */

const SECRET = 'test-secret-32-bytes-long-padding-padding';

// ── Stub del admin client ──────────────────────────────────────────────
type Row = Record<string, unknown>;
let encuestaRow: Row | null = null;
let fase16Row: Row | null = null;
let ventaRow: Row = { fase_posicion: 15 };
const updates: Array<{ tabla: string; patch: Row }> = [];
const inserts: Array<{ tabla: string; row: Row }> = [];

function makeQuery(tabla: string) {
  const chain = {
    _tabla: tabla,
    select() {
      return this;
    },
    update(patch: Row) {
      updates.push({ tabla, patch });
      return this;
    },
    insert(row: Row) {
      inserts.push({ tabla, row });
      return Promise.resolve({ error: null });
    },
    eq() {
      return this;
    },
    is() {
      return this;
    },
    maybeSingle() {
      if (tabla === 'venta_encuestas') return Promise.resolve({ data: encuestaRow });
      if (tabla === 'venta_fases') return Promise.resolve({ data: fase16Row });
      if (tabla === 'ventas') return Promise.resolve({ data: ventaRow });
      return Promise.resolve({ data: null });
    },
    then(resolve: (v: { error: null }) => void) {
      // permite `await admin...update().eq(...)`
      resolve({ error: null });
    },
  };
  return chain;
}

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: () => ({
    schema: () => ({ from: (tabla: string) => makeQuery(tabla) }),
  }),
}));

async function postRespuesta(token: string, body: unknown) {
  const { POST } = await import('./route');
  const req = new Request(`http://test/api/dilesa/encuesta/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ token }) });
}

describe('POST /api/dilesa/encuesta/[token]', () => {
  beforeEach(() => {
    process.env.AVALUO_UPLOAD_SECRET = SECRET;
    encuestaRow = { id: 'enc-1', respondida_at: null };
    fase16Row = null;
    ventaRow = { fase_posicion: 15 };
    updates.length = 0;
    inserts.length = 0;
  });
  afterEach(() => {
    delete process.env.AVALUO_UPLOAD_SECRET;
  });

  it('token inválido → 401', async () => {
    const res = await postRespuesta('garbage', { nps: 9, calif_vivienda: 5, calif_proceso: 5 });
    expect(res.status).toBe(401);
  });

  it('respuestas fuera de rango → 400', async () => {
    const token = await signEncuestaToken({ ventaId: 'v-1' });
    for (const body of [
      { nps: 11, calif_vivienda: 5, calif_proceso: 5 },
      { nps: 9, calif_vivienda: 0, calif_proceso: 5 },
      { nps: 9, calif_vivienda: 5 },
      { nps: 9.5, calif_vivienda: 5, calif_proceso: 5 },
    ]) {
      const res = await postRespuesta(token, body);
      expect(res.status).toBe(400);
    }
  });

  it('respuesta válida: guarda, cierra fase 16 y avanza el caché', async () => {
    const token = await signEncuestaToken({ ventaId: 'v-1' });
    const res = await postRespuesta(token, {
      nps: 9,
      calif_vivienda: 5,
      calif_proceso: 4,
      comentario: '  Todo excelente  ',
    });
    expect(res.status).toBe(200);

    const upEncuesta = updates.find((u) => u.tabla === 'venta_encuestas');
    expect(upEncuesta?.patch).toMatchObject({
      estado: 'respondida',
      nps: 9,
      calif_vivienda: 5,
      calif_proceso: 4,
      comentario: 'Todo excelente',
    });

    const insFase = inserts.find((i) => i.tabla === 'venta_fases');
    expect(insFase?.row).toMatchObject({ posicion: 16, fase: 'Conformidad del Cliente' });

    const upVenta = updates.find((u) => u.tabla === 'ventas');
    expect(upVenta?.patch).toMatchObject({ fase_posicion: 16 });
  });

  it('ya respondida → ok idempotente sin escrituras', async () => {
    encuestaRow = { id: 'enc-1', respondida_at: '2026-06-12T00:00:00Z' };
    const token = await signEncuestaToken({ ventaId: 'v-1' });
    const res = await postRespuesta(token, { nps: 9, calif_vivienda: 5, calif_proceso: 5 });
    expect(res.status).toBe(200);
    expect(updates.length).toBe(0);
    expect(inserts.length).toBe(0);
  });

  it('fase 16 ya cerrada: guarda respuestas pero no duplica la fase', async () => {
    fase16Row = { id: 'f-16' };
    const token = await signEncuestaToken({ ventaId: 'v-1' });
    const res = await postRespuesta(token, { nps: 8, calif_vivienda: 4, calif_proceso: 4 });
    expect(res.status).toBe(200);
    expect(inserts.find((i) => i.tabla === 'venta_fases')).toBeUndefined();
  });

  it('venta más adelante (pos 17): no regresa el caché', async () => {
    ventaRow = { fase_posicion: 17 };
    const token = await signEncuestaToken({ ventaId: 'v-1' });
    const res = await postRespuesta(token, { nps: 8, calif_vivienda: 4, calif_proceso: 4 });
    expect(res.status).toBe(200);
    expect(updates.find((u) => u.tabla === 'ventas')).toBeUndefined();
  });
});
