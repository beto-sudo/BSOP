import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

/**
 * Tests del endpoint de edición de cliente. Fijan el contrato de control:
 * solo Dirección/admin edita, los cambios se auditan con antes/después, y al
 * estructurar el domicilio se limpia el blob de Coda.
 *
 * Mocks: supabase server (auth) + `checkDireccionEmpresa` + admin client con
 * builder por tabla (personas: maybeSingle/update; audit_log: insert).
 */

let currentUser: { id: string } | null = { id: 'user-1' };
let direccionAutorizado = true;
let personaRow: Record<string, unknown> | null = null;
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

function makeTable(tabla: string) {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is']) builder[m] = vi.fn(() => builder);
  builder.insert = vi.fn((fila: Record<string, unknown>) => {
    (inserts[tabla] ??= []).push(fila);
    return Promise.resolve({ data: null, error: null });
  });
  builder.update = vi.fn((fila: Record<string, unknown>) => {
    (updates[tabla] ??= []).push(fila);
    return builder;
  });
  builder.maybeSingle = vi.fn(async () => ({
    data: tabla === 'personas' ? personaRow : null,
    error: null,
  }));
  // `update(...).eq(...)` se awaitea → resuelve sin error.
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null }).then(resolve);
  return builder;
}

function makeAdmin() {
  return { schema: () => ({ from: (tabla: string) => makeTable(tabla) }) };
}

import { PATCH } from './route';

const CLIENTE_ID = '11111111-2222-3333-4444-555555555555';

function personaCompleta(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    empresa_id: DILESA_EMPRESA_ID,
    nombre: 'JUAN ANGEL',
    apellido_paterno: 'FLORES',
    apellido_materno: 'FRAUSTO',
    curp: 'FOFJ991018HDGLRN04',
    rfc: 'FOFJ991018KV6',
    nss: '31149920329',
    numero_credencial_ine: '1659206621',
    fecha_nacimiento: '1999-10-18',
    estado_civil: 'Soltero',
    nacionalidad: 'Mexicana',
    tipo_persona: 'fisica',
    email: 'juan@example.com',
    telefono: '8721398418',
    domicilio: 'HUITRON SIN NUMERO, EJIDO HUITRON, GOMEZ PALACIO, DURANGO, CP 35117',
    domicilio_calle: null,
    domicilio_numero_exterior: null,
    domicilio_numero_interior: null,
    domicilio_colonia: null,
    domicilio_codigo_postal: null,
    domicilio_ciudad: null,
    domicilio_estado: null,
    ocupacion: 'EMPLEADO',
    es_pep: false,
    forma_pago_kyc: 'FINANCIAMIENTO HIPOTECARIO',
    uso_efectivo_kyc: 'No',
    conocimiento_dueno_beneficiario: 'No',
    ...over,
  };
}

function patch(body: Record<string, unknown>, id = CLIENTE_ID) {
  return PATCH(
    new NextRequest(`http://localhost/api/dilesa/clientes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.0.1, 1.1.1.1' },
    }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  currentUser = { id: 'user-1' };
  direccionAutorizado = true;
  personaRow = personaCompleta();
  inserts = {};
  updates = {};
});

describe('PATCH /api/dilesa/clientes/[id]', () => {
  it('400 si el id no es UUID', async () => {
    expect((await patch({}, 'no-uuid')).status).toBe(400);
  });

  it('401 si no hay sesión', async () => {
    currentUser = null;
    expect((await patch({ telefono: '111' })).status).toBe(401);
  });

  it('403 si el caller no es Dirección/admin', async () => {
    direccionAutorizado = false;
    const res = await patch({ telefono: '111' });
    expect(res.status).toBe(403);
    expect(updates['personas']).toBeUndefined();
    expect(inserts['audit_log']).toBeUndefined();
  });

  it('404 si el cliente no existe', async () => {
    personaRow = null;
    expect((await patch({ telefono: '111' })).status).toBe(404);
  });

  it('403 si el cliente no es de DILESA', async () => {
    personaRow = personaCompleta({ empresa_id: 'otra-empresa' });
    expect((await patch({ telefono: '111' })).status).toBe(403);
  });

  it('400 si se intenta vaciar el nombre (NOT NULL)', async () => {
    const res = await patch({ nombre: '   ' });
    expect(res.status).toBe(400);
    expect(updates['personas']).toBeUndefined();
  });

  it('edita el teléfono: update + audit con antes/después', async () => {
    const res = await patch({ telefono: '8009999999' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; cambios: number };
    expect(json.cambios).toBe(1);

    const upd = updates['personas']?.[0];
    expect(upd?.telefono).toBe('8009999999');
    expect(upd?.updated_at).toBeTruthy();

    const audit = inserts['audit_log']?.[0];
    expect(audit?.accion).toBe('cliente_editado');
    expect(audit?.tabla).toBe('erp.personas');
    expect(audit?.registro_id).toBe(CLIENTE_ID);
    expect((audit?.datos_anteriores as Record<string, unknown>).telefono).toBe('8721398418');
    expect((audit?.datos_nuevos as Record<string, unknown>).telefono).toBe('8009999999');
    expect(audit?.ip_origen).toBe('10.0.0.1');
  });

  it('estructurar el domicilio limpia el blob de Coda', async () => {
    const res = await patch({
      domicilio_calle: 'HIDALGO',
      domicilio_numero_exterior: '123',
      domicilio_colonia: 'CENTRO',
      domicilio_codigo_postal: '26000',
      domicilio_ciudad: 'PIEDRAS NEGRAS',
      domicilio_estado: 'COAHUILA',
    });
    expect(res.status).toBe(200);
    const upd = updates['personas']?.[0];
    expect(upd?.domicilio_calle).toBe('HIDALGO');
    expect(upd?.domicilio).toBeNull();

    const audit = inserts['audit_log']?.[0];
    expect((audit?.datos_anteriores as Record<string, unknown>).domicilio).toContain('HUITRON');
    expect((audit?.datos_nuevos as Record<string, unknown>).domicilio).toBeNull();
  });

  it('corrige el INE y lo guarda en mayúsculas', async () => {
    const res = await patch({ numero_credencial_ine: 'xy9988' });
    expect(res.status).toBe(200);
    expect(updates['personas']?.[0]?.numero_credencial_ine).toBe('XY9988');
  });

  it('sin cambios reales → 200 cambios:0, sin update ni audit', async () => {
    const res = await patch({ telefono: '8721398418' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { cambios: number };
    expect(json.cambios).toBe(0);
    expect(updates['personas']).toBeUndefined();
    expect(inserts['audit_log']).toBeUndefined();
  });
});
