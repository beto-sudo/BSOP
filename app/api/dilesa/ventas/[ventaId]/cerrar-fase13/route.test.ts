import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Tests del gate de cierre de Fase 13 (Sprint 3 de
 * `dilesa-ventas-captura-colaborativa`). El gate es la pieza de control de
 * la iniciativa: cerrar solo con revisión PLD vigente en verde, u override
 * de Dirección con motivo auditado. Estos tests fijan ese contrato.
 *
 * Mocks: supabase server (auth) + admin client con builder por tabla +
 * `checkDireccionEmpresa`.
 */

// ── State del test ─────────────────────────────────────────────────────

let currentUser: { id: string } | null = { id: 'user-1' };
let usuarioRow: { rol: string } | null = null;
let membershipRow: { usuario_id: string } | null = { usuario_id: 'user-1' };
let ventaRow: Record<string, unknown> | null = null;
let fasesRows: { posicion: number }[] = [];
let adjuntosRows: Record<string, unknown>[] = [];
let revisionRow: Record<string, unknown> | null = null;
let direccionAutorizado = false;
let inserts: Record<string, Record<string, unknown>[]> = {};
let updates: Record<string, Record<string, unknown>[]> = {};

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
  }),
}));

vi.mock('@/lib/auth/direccion-gate', () => ({
  checkDireccionEmpresa: async () => ({
    ok: true,
    autorizado: direccionAutorizado,
    authUserId: 'user-1',
    coreUserId: 'user-1',
  }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: () => makeAdmin(),
}));

function resultadoDe(tabla: string): { maybeSingle: unknown; lista: unknown } {
  switch (tabla) {
    case 'usuarios':
      return { maybeSingle: usuarioRow, lista: [] };
    case 'usuarios_empresas':
      return { maybeSingle: membershipRow, lista: [] };
    case 'ventas':
      return { maybeSingle: ventaRow, lista: [] };
    case 'venta_fases':
      return { maybeSingle: null, lista: fasesRows };
    case 'adjuntos':
      return { maybeSingle: null, lista: adjuntosRows };
    case 'venta_fase_revisiones':
      return { maybeSingle: revisionRow, lista: [] };
    default:
      return { maybeSingle: null, lista: [] };
  }
}

function makeTable(tabla: string) {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit']) {
    builder[m] = vi.fn(() => builder);
  }
  builder.insert = vi.fn((fila: Record<string, unknown>) => {
    (inserts[tabla] ??= []).push(fila);
    return builder;
  });
  builder.update = vi.fn((fila: Record<string, unknown>) => {
    (updates[tabla] ??= []).push(fila);
    return builder;
  });
  builder.maybeSingle = vi.fn(async () => ({ data: resultadoDe(tabla).maybeSingle }));
  builder.single = vi.fn(async () => ({ data: { id: `${tabla}-id` }, error: null }));
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: resultadoDe(tabla).lista, error: null }).then(resolve);
  return builder;
}

function makeAdmin() {
  return { schema: () => ({ from: (tabla: string) => makeTable(tabla) }) };
}

import { POST } from './route';

// ── Helpers ────────────────────────────────────────────────────────────

const VENTA_ID = '11111111-2222-3333-4444-555555555555';

function post(body?: Record<string, unknown>) {
  return POST(
    new NextRequest(`http://localhost/api/dilesa/ventas/${VENTA_ID}/cerrar-fase13`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
      headers: { 'Content-Type': 'application/json' },
    }),
    { params: Promise.resolve({ ventaId: VENTA_ID }) }
  );
}

function adjunto(rol: string, id: string, total?: number) {
  return {
    id,
    rol,
    metadata: total != null ? { cfdi: { uuid: `uuid-${id}`, total }, checks: [] } : null,
    created_at: '2026-06-12T16:00:00Z',
  };
}

beforeEach(() => {
  currentUser = { id: 'user-1' };
  usuarioRow = null;
  membershipRow = { usuario_id: 'user-1' };
  ventaRow = { id: VENTA_ID, valor_escrituracion: 899000, fase_posicion: 12 };
  fasesRows = [{ posicion: 12 }];
  adjuntosRows = [adjunto('factura_xml', 'fx-1', 899000), adjunto('aviso_pld', 'pld-1')];
  revisionRow = {
    id: 'rev-1',
    adjunto_id: 'pld-1',
    estado: 'completada',
    veredicto: 'verde',
  };
  direccionAutorizado = false;
  inserts = {};
  updates = {};
});

// ── Tests ──────────────────────────────────────────────────────────────

describe('POST /api/dilesa/ventas/[ventaId]/cerrar-fase13', () => {
  it('cierra con revisión vigente en verde: inserta la fase y audita fase13_cerrada', async () => {
    const res = await post({ valorRealSnapshot: 897378 });
    expect(res.status).toBe(200);

    const fase = inserts['venta_fases']?.[0];
    expect(fase?.posicion).toBe(13);
    expect(fase?.registrado_por).toBe('user-1');
    expect(fase?.notas).toBeNull();

    const audit = inserts['audit_log']?.[0];
    expect(audit?.accion).toBe('fase13_cerrada');

    // Snapshot: facturado del XML + valor real del body.
    const upd = updates['ventas']?.[0];
    expect(upd?.valor_facturado).toBe(899000);
    expect(upd?.valor_real_venta_dilesa).toBe(897378);
    expect(upd?.fase_posicion).toBe(13);
  });

  it('409 si la Fase 12 no está cerrada', async () => {
    fasesRows = [];
    expect((await post()).status).toBe(409);
  });

  it('409 si la Fase 13 ya está cerrada', async () => {
    fasesRows = [{ posicion: 12 }, { posicion: 13 }];
    expect((await post()).status).toBe(409);
  });

  it('409 si faltan documentos requeridos', async () => {
    adjuntosRows = [adjunto('aviso_pld', 'pld-1')]; // sin factura_xml
    const res = await post();
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('XML Factura');
  });

  it('403 requiereDireccion si la revisión no está en verde y no hay override', async () => {
    revisionRow = { ...revisionRow!, veredicto: 'advertencias' };
    const res = await post();
    expect(res.status).toBe(403);
    const json = (await res.json()) as { requiereDireccion?: boolean; error: string };
    expect(json.requiereDireccion).toBe(true);
    expect(json.error).toContain('Dirección');
    expect(inserts['venta_fases']).toBeUndefined();
  });

  it('403 si la revisión quedó stale (el PLD se versionó después)', async () => {
    revisionRow = { ...revisionRow!, adjunto_id: 'pld-VIEJO' };
    const res = await post();
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('cambió');
  });

  it('403 si hay override con motivo pero el caller no es Dirección', async () => {
    revisionRow = { ...revisionRow!, veredicto: 'rojo' };
    direccionAutorizado = false;
    const res = await post({ override: { motivo: 'urgencia comercial' } });
    expect(res.status).toBe(403);
    expect(inserts['venta_fases']).toBeUndefined();
  });

  it('Dirección puede autorizar con motivo: cierra, deja nota y audita el override', async () => {
    revisionRow = { ...revisionRow!, veredicto: 'rojo' };
    direccionAutorizado = true;
    const res = await post({ override: { motivo: 'Diferencia validada con el notario' } });
    expect(res.status).toBe(200);

    const fase = inserts['venta_fases']?.[0];
    expect(String(fase?.notas)).toContain('Diferencia validada con el notario');

    const audit = inserts['audit_log']?.[0];
    expect(audit?.accion).toBe('fase13_cierre_override');
    expect((audit?.datos_nuevos as Record<string, unknown>)?.motivo).toContain('notario');
  });

  it('sin revisión alguna también exige Dirección', async () => {
    revisionRow = null;
    const res = await post();
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('no tiene revisión');
  });
});
