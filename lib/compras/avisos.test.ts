import { describe, it, expect } from 'vitest';
import {
  diasTranscurridos,
  tieneRespuesta,
  montoMejorRespondido,
  buildComprasPorAutorizar,
  buildSolicitudesPorUsuario,
  type AvisoLookups,
  type RawCotizacionAviso,
} from './avisos';

const NOW = Date.parse('2026-06-22T18:00:00Z');

describe('diasTranscurridos', () => {
  it('cuenta días enteros hacia atrás', () => {
    expect(diasTranscurridos('2026-06-19T18:00:00Z', NOW)).toBe(3);
    expect(diasTranscurridos('2026-06-22T06:00:00Z', NOW)).toBe(0);
  });
  it('null/futuro/ inválido → 0', () => {
    expect(diasTranscurridos(null, NOW)).toBe(0);
    expect(diasTranscurridos('2026-07-01T00:00:00Z', NOW)).toBe(0);
    expect(diasTranscurridos('no-fecha', NOW)).toBe(0);
  });
});

describe('tieneRespuesta / montoMejorRespondido', () => {
  it('detecta respuesta solo en respondida|elegida', () => {
    expect(tieneRespuesta([{ estado: 'invitado' }])).toBe(false);
    expect(tieneRespuesta([{ estado: 'invitado' }, { estado: 'respondida' }])).toBe(true);
    expect(tieneRespuesta([{ estado: 'elegida' }])).toBe(true);
  });
  it('toma el menor monto entre respondidos, ignora invitados/null', () => {
    expect(
      montoMejorRespondido([
        { estado: 'invitado', monto_total: 100 },
        { estado: 'respondida', monto_total: 900 },
        { estado: 'respondida', monto_total: 750 },
        { estado: 'elegida', monto_total: null },
      ])
    ).toBe(750);
  });
  it('null cuando nadie respondió con monto', () => {
    expect(montoMejorRespondido([{ estado: 'invitado', monto_total: 100 }])).toBeNull();
    expect(montoMejorRespondido([{ estado: 'respondida', monto_total: null }])).toBeNull();
  });
});

const lookups: AvisoLookups = {
  partida: new Map([
    ['p1', { conceptoTexto: 'Concreto premezclado', proyectoId: 'proy1' }],
    ['p2', { conceptoTexto: 'Acero de refuerzo', proyectoId: 'proy1' }],
  ]),
  proyecto: new Map([['proy1', 'Lomas del Sol']]),
  usuario: new Map([['u1', 'Nahum']]),
};

const baseCot = (over: Partial<RawCotizacionAviso>): RawCotizacionAviso => ({
  id: 'c1',
  codigo: 'RFQ-1',
  descripcion: 'Material de cimentación',
  creado_por: 'u1',
  created_at: '2026-06-12T18:00:00Z',
  lineas: [{ partida_id: 'p1' }],
  proveedores: [{ estado: 'respondida', monto_total: 500 }],
  ...over,
});

describe('buildComprasPorAutorizar', () => {
  it('arma la fila con solicitante, concepto, monto, partida, proyecto y días', () => {
    const out = buildComprasPorAutorizar([baseCot({})], lookups, NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      codigo: 'RFQ-1',
      concepto: 'Material de cimentación',
      solicitante: 'Nahum',
      monto: 500,
      partida: 'Concreto premezclado',
      proyecto: 'Lomas del Sol',
      dias: 10,
    });
  });

  it('descarta cotizaciones sin ninguna respuesta', () => {
    const sinResp = baseCot({ id: 'c2', proveedores: [{ estado: 'invitado', monto_total: null }] });
    expect(buildComprasPorAutorizar([sinResp], lookups, NOW)).toHaveLength(0);
  });

  it('etiqueta "N partidas" con varias y "Sin partida" sin ninguna', () => {
    const varias = baseCot({ lineas: [{ partida_id: 'p1' }, { partida_id: 'p2' }] });
    expect(buildComprasPorAutorizar([varias], lookups, NOW)[0].partida).toBe('2 partidas');
    const ninguna = baseCot({ lineas: [{ partida_id: null }] });
    expect(buildComprasPorAutorizar([ninguna], lookups, NOW)[0].partida).toBe('Sin partida');
  });

  it('usa el folio cuando la descripción viene vacía y "—" para faltantes', () => {
    const out = buildComprasPorAutorizar(
      [baseCot({ descripcion: '   ', creado_por: 'desconocido', lineas: [{ partida_id: null }] })],
      lookups,
      NOW
    );
    expect(out[0].concepto).toBe('RFQ-1');
    expect(out[0].solicitante).toBe('—');
    expect(out[0].proyecto).toBe('—');
  });

  it('ordena de más vieja a más nueva (más rezagada arriba)', () => {
    const vieja = baseCot({ id: 'a', codigo: 'RFQ-A', created_at: '2026-06-01T18:00:00Z' });
    const nueva = baseCot({ id: 'b', codigo: 'RFQ-B', created_at: '2026-06-20T18:00:00Z' });
    const out = buildComprasPorAutorizar([nueva, vieja], lookups, NOW);
    expect(out.map((o) => o.codigo)).toEqual(['RFQ-A', 'RFQ-B']);
  });
});

describe('buildSolicitudesPorUsuario', () => {
  it('agrupa requisiciones sin OC y cotizaciones en curso por usuario', () => {
    const map = buildSolicitudesPorUsuario(
      [
        {
          id: 'r1',
          codigo: 'REQ-1',
          justificacion: 'Cemento',
          solicitante_id: 'u1',
          created_at: '2026-06-10T18:00:00Z',
          conOc: false,
        },
        {
          id: 'r2',
          codigo: 'REQ-2',
          justificacion: 'Ya ordenada',
          solicitante_id: 'u1',
          created_at: '2026-06-10T18:00:00Z',
          conOc: true,
        },
      ],
      [
        {
          id: 'c1',
          codigo: 'RFQ-9',
          descripcion: 'Pintura',
          creado_por: 'u1',
          created_at: '2026-06-15T18:00:00Z',
          estado: 'comparada',
        },
        {
          id: 'c2',
          codigo: 'RFQ-X',
          descripcion: 'Adjudicada',
          creado_por: 'u1',
          created_at: '2026-06-01T18:00:00Z',
          estado: 'adjudicada',
        },
      ],
      NOW
    );
    const items = map.get('u1');
    expect(items).toBeDefined();
    // r2 (conOc) y c2 (adjudicada) se excluyen → quedan r1 + c1, más viejo arriba
    expect(items!.map((i) => i.codigo)).toEqual(['REQ-1', 'RFQ-9']);
    expect(items![0]).toMatchObject({ tipo: 'requisicion', estado: 'Solicitada', dias: 12 });
    expect(items![1]).toMatchObject({ tipo: 'cotizacion', estado: 'En cotización' });
  });

  it('no agrupa cuando el solicitante es null', () => {
    const map = buildSolicitudesPorUsuario(
      [
        {
          id: 'r1',
          codigo: 'REQ-1',
          justificacion: null,
          solicitante_id: null,
          created_at: '2026-06-18T18:00:00Z',
          conOc: false,
        },
      ],
      [],
      NOW
    );
    expect(map.size).toBe(0);
  });
});
