import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendDictamenSolicitudEmail, type DictamenSolicitudContext } from './dictamen-emails';
import type { EmpresaBranding } from './email-branding';

const branding: EmpresaBranding = {
  empresaId: 'emp-1',
  nombreComercial: 'DILESA',
  headerUrl: 'https://bsop.io/brand/dilesa/header-email.png',
  colorPrimario: '#7D812E',
  colorPrimarioDark: '#646725',
  colorSecundario: '#4F4C4D',
  colorTextoTitulo: '#1F1F1F',
  colorFondoBrand: '#FAF7EE',
  colorInverso: '#FFFFFF',
  sitioWeb: 'dilesa.mx',
  telefono: '(878) 791-1818',
};

function makeCtx(overrides: Partial<DictamenSolicitudContext> = {}): DictamenSolicitudContext {
  return {
    branding,
    ventaId: 'venta-1',
    empresaId: 'emp-1',
    uploadUrl: 'https://bsop.io/dilesa/notario/dictamen/tok.tok',
    notarioEmail: 'notario@example.com',
    notarioNombre: 'Lic. Notario Pérez <test>',
    clienteNombre: 'Juan Cliente',
    clienteCurp: 'CURP123456',
    clienteTelefono: '8781234567',
    proyectoNombre: 'Fracc Delicias',
    unidadIdentificador: 'D-165',
    manzana: '5',
    lote: '12',
    prototipo: 'A',
    domicilioOficial: 'CALLE X #10',
    areaM2: 120.5,
    m2Construccion: 90.25,
    tipoCredito: 'INFONAVIT',
    precioVenta: 1_200_000,
    montoCreditoTitular: 900_000,
    montoCreditoCotitular: 300_000,
    vendedorNombre: 'Vendedor Uno',
    vendedorEmail: 'vendedor@example.com',
    ...overrides,
  };
}

type FetchMock = ReturnType<typeof vi.fn>;

function mockFetch(resp: { ok: boolean; status: number; text?: string }): FetchMock {
  const fn = vi.fn(async () => ({
    ok: resp.ok,
    status: resp.status,
    text: async () => resp.text ?? '',
  }));
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

function bodyOf(fn: FetchMock): Record<string, unknown> {
  const init = fn.mock.calls[0]![1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe('dictamen-emails · sendDictamenSolicitudEmail', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = realFetch;
    delete process.env.RESEND_API_KEY;
  });

  it('sin RESEND_API_KEY → ok:false y no llama fetch', async () => {
    delete process.env.RESEND_API_KEY;
    const fn = mockFetch({ ok: true, status: 200 });
    const res = await sendDictamenSolicitudEmail(makeCtx());
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/RESEND_API_KEY/);
    expect(res.sentTo).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('sin email del notario → ok:false', async () => {
    process.env.RESEND_API_KEY = 'rk_test';
    const fn = mockFetch({ ok: true, status: 200 });
    const res = await sendDictamenSolicitudEmail(makeCtx({ notarioEmail: '' }));
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/notario/i);
    expect(fn).not.toHaveBeenCalled();
  });

  it('happy path (header con imagen, con cotitular y cc al vendedor)', async () => {
    process.env.RESEND_API_KEY = 'rk_test';
    const fn = mockFetch({ ok: true, status: 200, text: '{"id":"e1"}' });
    const res = await sendDictamenSolicitudEmail(makeCtx());

    expect(res.ok).toBe(true);
    expect(res.sentTo).toEqual(['notario@example.com', 'vendedor@example.com']);
    expect(fn).toHaveBeenCalledOnce();

    const [url, init] = fn.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer rk_test');

    const body = bodyOf(fn);
    expect(body.from).toContain('DILESA');
    expect(body.to).toEqual(['notario@example.com']);
    expect(body.cc).toEqual(['vendedor@example.com']);
    expect(body.subject).toContain('Fracc Delicias');
    expect(body.subject).toContain('D-165');

    const html = body.html as string;
    // El nombre del notario va escapado (escapeHtml convierte < y >).
    expect(html).toContain('Lic. Notario Pérez &lt;test&gt;');
    expect(html).toContain('Subir Carta de Instrucción');
    expect(html).toContain('https://bsop.io/dilesa/notario/dictamen/tok.tok');
    // Header con imagen → debe renderizar el <img> del branding.
    expect(html).toContain('header-email.png');
    // Montos formateados como moneda MXN.
    expect(html).toContain('$1,200,000');
    expect(html).toContain('$300,000');
  });

  it('header sin imagen + sin cotitular + sin vendedorEmail → sin cc', async () => {
    process.env.RESEND_API_KEY = 'rk_test';
    const fn = mockFetch({ ok: true, status: 200 });
    const res = await sendDictamenSolicitudEmail(
      makeCtx({
        branding: { ...branding, headerUrl: null },
        montoCreditoCotitular: null,
        vendedorEmail: null,
        clienteCurp: null,
        clienteTelefono: null,
        prototipo: null,
        domicilioOficial: null,
        areaM2: null,
        m2Construccion: null,
        precioVenta: null,
        montoCreditoTitular: null,
        tipoCredito: null,
      })
    );
    expect(res.ok).toBe(true);
    expect(res.sentTo).toEqual(['notario@example.com']);
    const body = bodyOf(fn);
    expect(body.cc).toBeUndefined();
    // Sin headerUrl → logo de texto con el nombre comercial.
    expect(body.html as string).toContain('DILESA');
  });

  it('vendedorEmail igual al del notario → no se agrega cc', async () => {
    process.env.RESEND_API_KEY = 'rk_test';
    const fn = mockFetch({ ok: true, status: 200 });
    const res = await sendDictamenSolicitudEmail(makeCtx({ vendedorEmail: 'notario@example.com' }));
    expect(res.ok).toBe(true);
    expect(res.sentTo).toEqual(['notario@example.com']);
    expect(bodyOf(fn).cc).toBeUndefined();
  });

  it('Resend responde error → ok:false con el status', async () => {
    process.env.RESEND_API_KEY = 'rk_test';
    mockFetch({ ok: false, status: 422, text: 'boom' });
    const res = await sendDictamenSolicitudEmail(makeCtx());
    expect(res.ok).toBe(false);
    expect(res.error).toContain('422');
    expect(res.sentTo).toEqual(['notario@example.com']);
  });
});
