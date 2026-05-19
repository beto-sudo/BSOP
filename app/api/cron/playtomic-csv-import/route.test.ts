import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Tests para `GET /api/cron/playtomic-csv-import`.
 *
 * El endpoint reproduce el login de Playtomic Manager y escribe en
 * `playtomic.payments_import`. Sin el gate `Authorization: Bearer
 * ${CRON_SECRET}` cualquier llamador podría disparar un login a Playtomic
 * + import de datos. Igual que `app/api/welcome-email/route.test.ts`, este
 * test asegura que el gate se mantenga cerrado y que el happy-path llame al
 * upsert con los argumentos correctos.
 *
 * Mocks: el cliente de Playtomic (red) + el helper de upsert (Supabase IO)
 * + `next/cache`. El parser real corre sobre un CSV mínimo (ya está bien
 * cubierto en `lib/playtomic/csv-import.test.ts`).
 */

let downloadResult: { csv: string; tenantId: string } | Error = {
  csv: '',
  tenantId: 'tenant-rdb',
};
let adminClient: object | null = {};
let upsertResult:
  | {
      ok: true;
      rows_inserted: number;
      rows_updated: number;
      service_date_min: string | null;
      service_date_max: string | null;
      payment_date_max: string | null;
    }
  | { ok: false; error: string } = {
  ok: true,
  rows_inserted: 1,
  rows_updated: 0,
  service_date_min: null,
  service_date_max: null,
  payment_date_max: null,
};
const upsertSpy = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/playtomic/manager-api', () => ({
  downloadPlaytomicPaymentsCsv: vi.fn(async () => {
    if (downloadResult instanceof Error) throw downloadResult;
    return downloadResult;
  }),
}));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: () => adminClient,
}));

vi.mock('@/lib/playtomic/payments-import-upsert', () => ({
  upsertPaymentsRows: vi.fn(async (...args: unknown[]) => {
    upsertSpy(...args);
    return upsertResult;
  }),
}));

import { GET } from './route';

// CSV mínimo que el parser real acepta: línea header + 1 fila con
// payment_id en el índice 2 y ≥16 columnas.
const HEADER = 'Corporate Name;Club payment id;Payment id' + ';col'.repeat(34);
const ROW = ['RDB', 'cp1', 'PAY-1', ...Array(34).fill('')].join(';');
const VALID_CSV = `Resumen;ignorar\n${HEADER}\n${ROW}\n`;

function makeReq(authHeader?: string, query = ''): NextRequest {
  const headers = new Headers();
  if (authHeader) headers.set('authorization', authHeader);
  return new NextRequest(`https://bsop.test/api/cron/playtomic-csv-import${query}`, { headers });
}

const ORIGINAL_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret';
  downloadResult = { csv: VALID_CSV, tenantId: 'tenant-rdb' };
  adminClient = {};
  upsertResult = {
    ok: true,
    rows_inserted: 1,
    rows_updated: 0,
    service_date_min: null,
    service_date_max: null,
    payment_date_max: null,
  };
  upsertSpy.mockClear();
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
});

describe('GET /api/cron/playtomic-csv-import — auth gate', () => {
  it('401 sin header Authorization', async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('401 con secret equivocado', async () => {
    const res = await GET(makeReq('Bearer wrong'));
    expect(res.status).toBe(401);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('401 si CRON_SECRET no está configurado en el entorno', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeReq('Bearer test-secret'));
    expect(res.status).toBe(401);
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});

describe('GET /api/cron/playtomic-csv-import — ejecución', () => {
  it('500 si falta el cliente admin de Supabase', async () => {
    adminClient = null;
    const res = await GET(makeReq('Bearer test-secret'));
    expect(res.status).toBe(500);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('happy path: parsea el CSV y llama upsert con uploadedBy=null', async () => {
    const res = await GET(makeReq('Bearer test-secret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.rows_in_csv).toBe(1);
    expect(body.rows_inserted).toBe(1);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const meta = upsertSpy.mock.calls[0][2] as {
      uploadedBy: string | null;
      sourceFilename: string;
    };
    expect(meta.uploadedBy).toBeNull();
    expect(meta.sourceFilename).toMatch(/^auto:cron@/);
  });

  it('respeta y limita lookbackDays del query param', async () => {
    const res = await GET(makeReq('Bearer test-secret', '?lookbackDays=99999'));
    const body = await res.json();
    expect(body.lookback_days).toBe(400); // clamp a MAX_LOOKBACK_DAYS
  });

  it('502 si la descarga de Playtomic falla (sin filtrar secretos)', async () => {
    downloadResult = new Error('Playtomic /api/v3/auth/login respondió 401.');
    const res = await GET(makeReq('Bearer test-secret'));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('401');
  });

  it('200 con note (sin llamar upsert) si el CSV no trae filas', async () => {
    downloadResult = { csv: 'Corporate Name;solo header\n', tenantId: 't' };
    const res = await GET(makeReq('Bearer test-secret'));
    // 0 filas → respuesta ok con note, no error.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows_in_csv).toBe(0);
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});
