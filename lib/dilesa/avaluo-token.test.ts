import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AVALUO_TOKEN_TTL_SECONDS, signAvaluoToken, verifyAvaluoToken } from './avaluo-token';

const SECRET = 'test-secret-32-bytes-long-padding-padding';

describe('avaluo-token', () => {
  beforeEach(() => {
    process.env.AVALUO_UPLOAD_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.AVALUO_UPLOAD_SECRET;
  });

  it('sign + verify roundtrip retorna el payload original', async () => {
    const token = await signAvaluoToken(
      { ventaId: 'venta-1', valuadorId: 'val-1' },
      { now: 1_000_000 }
    );
    const res = await verifyAvaluoToken(token, { now: 1_000_000 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.payload.ventaId).toBe('venta-1');
      expect(res.payload.valuadorId).toBe('val-1');
      expect(res.payload.exp).toBe(1_000_000 + AVALUO_TOKEN_TTL_SECONDS);
    }
  });

  it('TTL custom se respeta', async () => {
    const token = await signAvaluoToken(
      { ventaId: 'v', valuadorId: 'va' },
      { now: 1000, ttlSeconds: 60 }
    );
    const res = await verifyAvaluoToken(token, { now: 1059 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.payload.exp).toBe(1060);
  });

  it('rechaza token expirado', async () => {
    const token = await signAvaluoToken(
      { ventaId: 'v', valuadorId: 'va' },
      { now: 1000, ttlSeconds: 60 }
    );
    const res = await verifyAvaluoToken(token, { now: 1100 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('expired');
  });

  it('rechaza token con firma manipulada', async () => {
    const token = await signAvaluoToken({ ventaId: 'v', valuadorId: 'va' }, { now: 1000 });
    // Cambiar último carácter de la firma
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    const res = await verifyAvaluoToken(tampered, { now: 1000 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('bad_signature');
  });

  it('rechaza token con payload manipulado (firma queda inválida)', async () => {
    const token = await signAvaluoToken(
      { ventaId: 'venta-original', valuadorId: 'va' },
      { now: 1000 }
    );
    const [body, sig] = token.split('.') as [string, string];
    const fakeBody = body.slice(0, -2) + 'XX';
    const res = await verifyAvaluoToken(`${fakeBody}.${sig}`, { now: 1000 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('bad_signature');
  });

  it('rechaza token malformed (sin punto)', async () => {
    const res = await verifyAvaluoToken('no-tiene-punto', { now: 1000 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('malformed');
  });

  it('rechaza token con secret distinto al firmar/verificar', async () => {
    const token = await signAvaluoToken({ ventaId: 'v', valuadorId: 'va' }, { now: 1000 });
    process.env.AVALUO_UPLOAD_SECRET = 'otro-secret-completamente-distinto';
    const res = await verifyAvaluoToken(token, { now: 1000 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('bad_signature');
  });

  it('rechaza si no hay secret configurado', async () => {
    delete process.env.AVALUO_UPLOAD_SECRET;
    const res = await verifyAvaluoToken('a.b', { now: 1000 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('missing_secret');
  });

  it('signAvaluoToken throw si no hay secret', async () => {
    delete process.env.AVALUO_UPLOAD_SECRET;
    await expect(signAvaluoToken({ ventaId: 'v', valuadorId: 'va' })).rejects.toThrow(
      /AVALUO_UPLOAD_SECRET/
    );
  });

  it('token no contiene chars ilegales para URL', async () => {
    const token = await signAvaluoToken(
      { ventaId: 'venta-con-guiones', valuadorId: 'val-uuid' },
      { now: 1000 }
    );
    // base64url: solo A-Z, a-z, 0-9, -, _ y un punto separador
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });
});
