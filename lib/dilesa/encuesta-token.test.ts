import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ENCUESTA_TOKEN_TTL_SECONDS,
  signEncuestaToken,
  verifyEncuestaToken,
} from './encuesta-token';
import { signDictamenToken } from './dictamen-token';

const SECRET = 'test-secret-32-bytes-long-padding-padding';

describe('encuesta-token', () => {
  beforeEach(() => {
    process.env.AVALUO_UPLOAD_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.AVALUO_UPLOAD_SECRET;
  });

  it('sign + verify roundtrip', async () => {
    const token = await signEncuestaToken({ ventaId: 'v-1' }, { now: 1_000_000 });
    const res = await verifyEncuestaToken(token, { now: 1_000_000 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.payload.ventaId).toBe('v-1');
      expect(res.payload.exp).toBe(1_000_000 + ENCUESTA_TOKEN_TTL_SECONDS);
    }
  });

  it('TTL default = 90 días (el cliente puede responder tarde)', () => {
    expect(ENCUESTA_TOKEN_TTL_SECONDS).toBe(90 * 24 * 60 * 60);
  });

  it('expira', async () => {
    const token = await signEncuestaToken({ ventaId: 'v-1' }, { now: 1_000, ttlSeconds: 10 });
    const res = await verifyEncuestaToken(token, { now: 2_000 });
    expect(res).toEqual({ ok: false, error: 'expired' });
  });

  it('rechaza firma alterada y tokens malformados', async () => {
    const token = await signEncuestaToken({ ventaId: 'v-1' }, { now: 1_000 });
    const [body] = token.split('.');
    expect((await verifyEncuestaToken(`${body}.AAAA`, { now: 1_000 })).ok).toBe(false);
    expect((await verifyEncuestaToken('garbage', { now: 1_000 })).ok).toBe(false);
  });

  it('un token de OTRO purpose (dictamen) no sirve para la encuesta', async () => {
    const ajeno = await signDictamenToken({ ventaId: 'v-1', notarioId: 'n-1' }, { now: 1_000 });
    const res = await verifyEncuestaToken(ajeno, { now: 1_000 });
    expect(res.ok).toBe(false);
  });

  it('sin secret configurado → missing_secret', async () => {
    delete process.env.AVALUO_UPLOAD_SECRET;
    const res = await verifyEncuestaToken('a.b');
    expect(res).toEqual({ ok: false, error: 'missing_secret' });
  });
});
