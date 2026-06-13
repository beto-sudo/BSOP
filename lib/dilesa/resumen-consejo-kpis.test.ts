import { describe, it, expect } from 'vitest';
import {
  armarKpis,
  calcularDeltas,
  fechaLocalMatamoros,
  computeKpisDelDia,
  upsertKpiSnapshot,
  fetchSnapshotPrevio,
  type KpisDelDia,
  type KpisRaw,
} from './resumen-consejo-kpis';

const RAW_VACIO: KpisRaw = {
  fasesHoy: [],
  ventaMontos: [],
  pagosHoy: [],
  cargosAbiertos: [],
  saldos: [],
  casasEnObra: 0,
  fechaLocal: '2026-06-13',
};

/**
 * Mock mínimo del query-builder de supabase-js: cada método de filtro devuelve
 * el mismo chain (thenable) que resuelve al resultado de su tabla. Soporta los
 * chains que usan computeKpisDelDia / upsert / fetchSnapshotPrevio.
 */
function makeSupabase(results: Record<string, unknown> = {}) {
  const calls: { upsert: { table: string; row: unknown; opts: unknown } | null } = { upsert: null };
  const chainFor = (table: string) => {
    const result = (results[table] as Record<string, unknown>) ?? { data: [] };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'in', 'lt', 'order', 'limit']) chain[m] = () => chain;
    chain.maybeSingle = () => Promise.resolve(result);
    chain.upsert = (row: unknown, opts: unknown) => {
      calls.upsert = { table, row, opts };
      return Promise.resolve({ error: (results.__upsertError as unknown) ?? null });
    };
    chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej);
    return chain;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = { schema: () => ({ from: chainFor }), __calls: calls };
  return sb;
}

describe('fechaLocalMatamoros — fecha local con DST real', () => {
  it('verano (CDT, UTC-5): 01:00 UTC = 20:00 del día anterior', () => {
    expect(fechaLocalMatamoros(new Date('2026-06-13T01:00:00Z'))).toBe('2026-06-12');
  });
  it('invierno (CST, UTC-6): 02:00 UTC = 20:00 del día anterior', () => {
    expect(fechaLocalMatamoros(new Date('2026-01-13T02:00:00Z'))).toBe('2026-01-12');
  });
});

describe('armarKpis — agregación pura', () => {
  it('separa asignaciones de escrituras y suma sus montos por venta', () => {
    const kpis = armarKpis({
      ...RAW_VACIO,
      fasesHoy: [
        { venta_id: 'v1', fase: 'Asignada' },
        { venta_id: 'v2', fase: 'Escriturada' },
      ],
      ventaMontos: [
        { id: 'v1', precio_asignacion: 100, valor_escrituracion: null },
        { id: 'v2', precio_asignacion: null, valor_escrituracion: 500 },
      ],
    });
    expect(kpis.ventas_hoy_n).toBe(1);
    expect(kpis.ventas_hoy_monto).toBe(100);
    expect(kpis.escrituras_hoy_n).toBe(1);
    expect(kpis.escrituras_hoy_monto).toBe(500);
  });

  it('suma cobranza del día y liquidez de todas las cuentas', () => {
    const kpis = armarKpis({
      ...RAW_VACIO,
      pagosHoy: [{ monto_total: 30 }, { monto_total: 20 }, { monto_total: null }],
      saldos: [{ saldo: 128 }, { saldo: 5 }, { saldo: null }],
    });
    expect(kpis.cobrado_hoy).toBe(50);
    expect(kpis.liquidez_total).toBe(133);
  });

  it('CxC abierto = todos los cargos; vencido = solo los con fecha < hoy', () => {
    const kpis = armarKpis({
      ...RAW_VACIO,
      fechaLocal: '2026-06-13',
      cargosAbiertos: [
        { saldo: 1000, fecha_vencimiento: '2026-06-01' }, // vencido
        { saldo: 500, fecha_vencimiento: '2026-12-31' }, // al corriente
        { saldo: 200, fecha_vencimiento: null }, // sin fecha → no vencido
      ],
    });
    expect(kpis.cxc_abierto).toBe(1700);
    expect(kpis.cxc_vencido).toBe(1000);
  });

  it('casas en obra pasa directo', () => {
    expect(armarKpis({ ...RAW_VACIO, casasEnObra: 12 }).casas_en_obra).toBe(12);
  });
});

describe('calcularDeltas', () => {
  const HOY: KpisDelDia = {
    ventas_hoy_n: 3,
    ventas_hoy_monto: 5400,
    escrituras_hoy_n: 2,
    escrituras_hoy_monto: 3200,
    cobrado_hoy: 1800,
    liquidez_total: 137,
    cxc_abierto: 133,
    cxc_vencido: 47,
    casas_en_obra: 12,
  };

  it('sin snapshot previo, todos los deltas son null', () => {
    const d = calcularDeltas(HOY, null);
    expect(d.liquidez_total).toBeNull();
    expect(d.cxc_vencido).toBeNull();
  });

  it('con previo, el delta es la diferencia campo a campo', () => {
    const previo: KpisDelDia = { ...HOY, liquidez_total: 140, cxc_vencido: 50, casas_en_obra: 11 };
    const d = calcularDeltas(HOY, previo);
    expect(d.liquidez_total).toBe(-3);
    expect(d.cxc_vencido).toBe(-3);
    expect(d.casas_en_obra).toBe(1);
    expect(d.ventas_hoy_n).toBe(0);
  });
});

describe('computeKpisDelDia — wiring de queries', () => {
  it('arma los KPIs desde las filas de cada tabla', async () => {
    const sb = makeSupabase({
      venta_fases: {
        data: [
          { venta_id: 'v1', fase: 'Asignada' },
          { venta_id: 'v2', fase: 'Escriturada' },
        ],
      },
      ventas: {
        data: [
          { id: 'v1', precio_asignacion: 100, valor_escrituracion: null },
          { id: 'v2', precio_asignacion: null, valor_escrituracion: 500 },
        ],
      },
      cxc_pagos: { data: [{ monto_total: 30 }, { monto_total: 20 }] },
      cxc_cargos: {
        data: [
          { saldo: 1000, fecha_vencimiento: '2026-06-01' },
          { saldo: 500, fecha_vencimiento: '2026-12-31' },
        ],
      },
      v_cuenta_saldo_actual: { data: [{ saldo: 128 }, { saldo: 5 }] },
      construccion: { count: 12 },
    });
    const kpis = await computeKpisDelDia(sb, 'e1', '2026-06-13');
    expect(kpis).toEqual({
      ventas_hoy_n: 1,
      ventas_hoy_monto: 100,
      escrituras_hoy_n: 1,
      escrituras_hoy_monto: 500,
      cobrado_hoy: 50,
      liquidez_total: 133,
      cxc_abierto: 1500,
      cxc_vencido: 1000,
      casas_en_obra: 12,
    });
  });

  it('sin fases del día no consulta ventas y los flujos quedan en 0', async () => {
    const sb = makeSupabase({ construccion: { count: 0 } });
    const kpis = await computeKpisDelDia(sb, 'e1', '2026-06-13');
    expect(kpis.ventas_hoy_n).toBe(0);
    expect(kpis.escrituras_hoy_n).toBe(0);
  });
});

describe('upsertKpiSnapshot', () => {
  it('upserta por empresa+fecha y devuelve ok', async () => {
    const sb = makeSupabase();
    const kpis = { ...RAW_VACIO } as unknown as KpisDelDia;
    const res = await upsertKpiSnapshot(sb, 'e1', '2026-06-13', {
      ...kpis,
      ventas_hoy_n: 3,
    } as KpisDelDia);
    expect(res.ok).toBe(true);
    expect(sb.__calls.upsert.table).toBe('kpi_snapshot');
    expect(sb.__calls.upsert.row).toMatchObject({
      empresa_id: 'e1',
      fecha: '2026-06-13',
      ventas_hoy_n: 3,
    });
    expect(sb.__calls.upsert.opts).toEqual({ onConflict: 'empresa_id,fecha' });
  });

  it('propaga error del upsert', async () => {
    const sb = makeSupabase({ __upsertError: { message: 'boom' } });
    const res = await upsertKpiSnapshot(sb, 'e1', '2026-06-13', {} as KpisDelDia);
    expect(res.ok).toBe(false);
    expect(res.error).toEqual({ message: 'boom' });
  });
});

describe('fetchSnapshotPrevio', () => {
  it('mapea la fila previa a KpisDelDia', async () => {
    const sb = makeSupabase({
      kpi_snapshot: {
        data: {
          ventas_hoy_n: 2,
          ventas_hoy_monto: 200,
          escrituras_hoy_n: 1,
          escrituras_hoy_monto: 100,
          cobrado_hoy: 50,
          liquidez_total: 140,
          cxc_abierto: 130,
          cxc_vencido: 50,
          casas_en_obra: 11,
        },
      },
    });
    const previo = await fetchSnapshotPrevio(sb, 'e1', '2026-06-13');
    expect(previo?.liquidez_total).toBe(140);
    expect(previo?.casas_en_obra).toBe(11);
  });

  it('devuelve null cuando no hay snapshot previo', async () => {
    const sb = makeSupabase({ kpi_snapshot: { data: null } });
    expect(await fetchSnapshotPrevio(sb, 'e1', '2026-06-13')).toBeNull();
  });
});
