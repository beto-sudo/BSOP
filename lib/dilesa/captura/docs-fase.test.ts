import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  faltantesParaCerrar,
  fetchDocsFase,
  resolverVigentes,
  subirDocFase,
  type DocFase,
} from './docs-fase';

function doc(partial: Partial<DocFase> & Pick<DocFase, 'id' | 'rol' | 'subidoAt'>): DocFase {
  return {
    nombre: `${partial.id}.pdf`,
    url: `dilesa/ventas/v1/${partial.id}.pdf`,
    tipoMime: 'application/pdf',
    tamanoBytes: 1024,
    subidoPor: 'u1',
    subidoPorNombre: 'Usuario Uno',
    metadata: null,
    ...partial,
  };
}

describe('resolverVigentes', () => {
  it('devuelve vacío sin documentos', () => {
    expect(resolverVigentes([])).toEqual({});
  });

  it('el vigente por rol es el más reciente, sin importar el orden de llegada', () => {
    const docs = [
      doc({ id: 'a', rol: 'factura', subidoAt: '2026-06-11T18:00:00Z' }),
      doc({ id: 'b', rol: 'factura', subidoAt: '2026-06-12T09:00:00Z' }),
      doc({ id: 'c', rol: 'factura', subidoAt: '2026-06-10T08:00:00Z' }),
    ];
    const vigentes = resolverVigentes(docs);
    expect(vigentes.factura?.vigente.id).toBe('b');
    expect(vigentes.factura?.versiones).toBe(3);

    // Mismo resultado con otro orden (el GET no garantiza orden).
    const alReves = resolverVigentes([...docs].reverse());
    expect(alReves.factura?.vigente.id).toBe('b');
  });

  it('separa roles y conserva el conteo de versiones por rol', () => {
    const vigentes = resolverVigentes([
      doc({ id: 'f1', rol: 'factura', subidoAt: '2026-06-11T18:00:00Z' }),
      doc({ id: 'p1', rol: 'aviso_pld', subidoAt: '2026-06-11T19:00:00Z' }),
      doc({ id: 'p2', rol: 'aviso_pld', subidoAt: '2026-06-11T20:00:00Z' }),
    ]);
    expect(vigentes.factura?.versiones).toBe(1);
    expect(vigentes.aviso_pld?.versiones).toBe(2);
    expect(vigentes.aviso_pld?.vigente.id).toBe('p2');
    expect(vigentes.nota_credito).toBeUndefined();
  });
});

describe('faltantesParaCerrar', () => {
  const vigentes = resolverVigentes([
    doc({ id: 'f1', rol: 'factura', subidoAt: '2026-06-11T18:00:00Z' }),
  ]);

  it('reporta los roles requeridos sin documento', () => {
    expect(faltantesParaCerrar(vigentes, ['factura', 'aviso_pld'])).toEqual(['aviso_pld']);
  });

  it('vacío cuando todo lo requerido está en el expediente', () => {
    expect(faltantesParaCerrar(vigentes, ['factura'])).toEqual([]);
  });

  it('los opcionales (no listados) no bloquean', () => {
    expect(faltantesParaCerrar(vigentes, [])).toEqual([]);
  });
});

// ── subirDocFase (mocks de storage + insert) ────────────────────────────

type MockResult = { error: { message: string } | null };

function makeSb(opts: { uploadError?: string; insertError?: string }) {
  const upload = vi.fn(
    async (..._args: unknown[]): Promise<MockResult> =>
      opts.uploadError ? { error: { message: opts.uploadError } } : { error: null }
  );
  const insert = vi.fn(
    async (..._args: unknown[]): Promise<MockResult> =>
      opts.insertError ? { error: { message: opts.insertError } } : { error: null }
  );
  const sb = {
    storage: { from: vi.fn(() => ({ upload })) },
    schema: vi.fn(() => ({ from: vi.fn(() => ({ insert })) })),
  };
  return { sb: sb as unknown as SupabaseClient, upload, insert };
}

function archivo(nombre = 'factura.pdf'): File {
  return new File(['%PDF-1.4'], nombre, { type: 'application/pdf' });
}

describe('subirDocFase', () => {
  it('sube a storage e inserta el adjunto con uploaded_by', async () => {
    const { sb, upload, insert } = makeSb({});
    const r = await subirDocFase(sb, {
      ventaId: 'v1',
      rol: 'factura',
      archivo: archivo(),
      userId: 'user-1',
    });
    expect(r.ok).toBe(true);
    expect(upload).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledOnce();
    const fila = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(fila.entidad_tipo).toBe('venta');
    expect(fila.entidad_id).toBe('v1');
    expect(fila.rol).toBe('factura');
    expect(fila.uploaded_by).toBe('user-1');
    expect(fila.nombre).toBe('factura.pdf');
  });

  it('reporta el error de storage sin intentar el insert', async () => {
    const { sb, insert } = makeSb({ uploadError: 'bucket lleno' });
    const r = await subirDocFase(sb, {
      ventaId: 'v1',
      rol: 'factura',
      archivo: archivo(),
      userId: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('bucket lleno');
    expect(insert).not.toHaveBeenCalled();
  });

  it('reporta cuando el archivo subió pero el registro falló', async () => {
    const { sb } = makeSb({ insertError: 'RLS' });
    const r = await subirDocFase(sb, {
      ventaId: 'v1',
      rol: 'aviso_pld',
      archivo: archivo('pld.pdf'),
      userId: 'user-2',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('no se registró');
  });
});

// ── fetchDocsFase (mock de fetch) ───────────────────────────────────────

describe('fetchDocsFase', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('agrupa la respuesta del GET en vigentes por rol', async () => {
    const docs: DocFase[] = [
      doc({ id: 'a', rol: 'factura', subidoAt: '2026-06-11T18:00:00Z' }),
      doc({ id: 'b', rol: 'factura', subidoAt: '2026-06-12T09:00:00Z' }),
    ];
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ ok: true, docs }), { status: 200 })
    ) as unknown as typeof fetch;

    const r = await fetchDocsFase('venta-1', ['factura', 'aviso_pld']);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.docs.factura?.vigente.id).toBe('b');
      expect(r.docs.factura?.versiones).toBe(2);
      expect(r.docs.aviso_pld).toBeUndefined();
    }
    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toBe('/api/dilesa/ventas/venta-1/docs?roles=factura%2Caviso_pld');
  });

  it('propaga el error del endpoint', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: false, error: 'Sin acceso a DILESA.' }), { status: 403 })
    ) as unknown as typeof fetch;

    const r = await fetchDocsFase('venta-1', ['factura']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Sin acceso a DILESA.');
  });

  it('convierte un fallo de red en error legible', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const r = await fetchDocsFase('venta-1', ['factura']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('network down');
  });
});
