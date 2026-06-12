import { describe, expect, it } from 'vitest';
import { faltantesParaCerrar, resolverVigentes, type DocFase } from './docs-fase';

function doc(partial: Partial<DocFase> & Pick<DocFase, 'id' | 'rol' | 'subidoAt'>): DocFase {
  return {
    nombre: `${partial.id}.pdf`,
    url: `dilesa/ventas/v1/${partial.id}.pdf`,
    tipoMime: 'application/pdf',
    tamanoBytes: 1024,
    subidoPor: 'u1',
    subidoPorNombre: 'Usuario Uno',
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
