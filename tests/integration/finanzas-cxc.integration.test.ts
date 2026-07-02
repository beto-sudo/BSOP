import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  serviceClient,
  crearFixturesFinancieras,
  crearCargo,
  leerCargo,
  type FixturasFinancieras,
} from './helpers';

/**
 * Tests de COMPORTAMIENTO del subledger CxC (`blindaje-financiero` S2).
 *
 * Ejercitan las RPCs de dinero contra el stack local assertando SALDOS —
 * no existencia. Son la red de seguridad de la clase del incidente FIFO:
 * si una migración redefine `cxc_pago_registrar` partiendo de una versión
 * vieja (p.ej. reintroduce el AND que filtraba por fuente), estos tests
 * truenan en CI antes del merge.
 *
 * Invariantes lockeadas:
 *   - FIFO por fecha_vencimiento/numero, SIN filtrar por fuente
 *     (decisión 20260601180854: la fuente es etiqueta de reportería).
 *   - Cancelar un abono revierte los saldos de los cargos (trigger recalc).
 *   - Re-aplicar valida Σ aplicaciones ≤ monto del abono.
 *   - Ajustar un cargo respeta el piso de lo ya pagado y deriva el estado.
 *   - Registrar con cuenta bancaria emite el movimiento espejo (ADR-037 D4).
 */

let svc: SupabaseClient;
let fx: FixturasFinancieras;

beforeAll(async () => {
  svc = serviceClient();
  fx = await crearFixturesFinancieras(svc);
});

/** RPC helper — truena el test si la RPC regresa error (para el camino feliz). */
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await svc.schema('erp').rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

describe('cxc_pago_registrar — auto-aplicación FIFO', () => {
  const ventaId = randomUUID();
  let cargo1: string, cargo2: string, cargo3: string;
  let abono1: string;

  beforeAll(async () => {
    // 3 cargos escalonados: 100 (vence primero), 200, 300.
    cargo1 = await crearCargo(svc, fx, {
      origenId: ventaId,
      numero: 1,
      monto: 100,
      fechaVencimiento: '2026-01-15',
    });
    cargo2 = await crearCargo(svc, fx, {
      origenId: ventaId,
      numero: 2,
      monto: 200,
      fechaVencimiento: '2026-02-15',
    });
    cargo3 = await crearCargo(svc, fx, {
      origenId: ventaId,
      numero: 3,
      monto: 300,
      fechaVencimiento: '2026-03-15',
    });
  });

  it('aplica FIFO: liquida el cargo más viejo y deja parcial el siguiente', async () => {
    abono1 = await rpc<string>('cxc_pago_registrar', {
      p_empresa_id: fx.empresaId,
      p_persona_id: fx.clienteId,
      p_origen_id: ventaId,
      p_monto: 250,
    });
    expect(abono1).toBeTruthy();

    const c1 = await leerCargo(svc, cargo1);
    expect(c1).toMatchObject({ monto_pagado: 100, saldo: 0, estado: 'liquidado' });

    const c2 = await leerCargo(svc, cargo2);
    expect(c2).toMatchObject({ monto_pagado: 150, saldo: 50, estado: 'parcial' });

    const c3 = await leerCargo(svc, cargo3);
    expect(c3).toMatchObject({ monto_pagado: 0, saldo: 300, estado: 'pendiente' });
  });

  it('un abono de OTRA fuente baja el mismo saldo (sin filtrar por fuente)', async () => {
    // Regresión directa del incidente FIFO: el AND por fuente dejaba cargos
    // pendientes para siempre. Un abono de la institución debe saldar los
    // cargos del cliente también.
    await rpc<string>('cxc_pago_registrar', {
      p_empresa_id: fx.empresaId,
      p_persona_id: fx.clienteId,
      p_origen_id: ventaId,
      p_monto: 50,
      p_fuente: 'institucion',
    });
    const c2 = await leerCargo(svc, cargo2);
    expect(c2).toMatchObject({ monto_pagado: 200, saldo: 0, estado: 'liquidado' });
  });

  it('el excedente del abono queda SIN aplicar (no infla cargos)', async () => {
    // Cargos restantes: solo cargo3 con saldo 300. Abono de 400 → aplica 300.
    const abonoGrande = await rpc<string>('cxc_pago_registrar', {
      p_empresa_id: fx.empresaId,
      p_persona_id: fx.clienteId,
      p_origen_id: ventaId,
      p_monto: 400,
    });

    const c3 = await leerCargo(svc, cargo3);
    expect(c3).toMatchObject({ monto_pagado: 300, saldo: 0, estado: 'liquidado' });

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { data: apps } = await (svc.schema('erp') as any)
      .from('cxc_pago_aplicaciones')
      .select('monto_aplicado')
      .eq('pago_id', abonoGrande);
    const aplicado = (apps ?? []).reduce(
      (s: number, a: { monto_aplicado: string | number }) => s + Number(a.monto_aplicado),
      0
    );
    expect(aplicado).toBe(300); // 100 quedan como saldo a favor, sin aplicación.
  });

  it('rechaza monto <= 0', async () => {
    const { error } = await svc.schema('erp').rpc('cxc_pago_registrar', {
      p_empresa_id: fx.empresaId,
      p_persona_id: fx.clienteId,
      p_origen_id: ventaId,
      p_monto: 0,
    });
    expect(error?.message).toMatch(/debe ser > 0/);
  });

  it('cancelar el abono revierte los saldos de los cargos', async () => {
    // abono1 (250) cubría: cargo1 100 + cargo2 150.
    await rpc('cxc_pago_cancelar', { p_pago_id: abono1, p_motivo: 'test revert' });

    const c1 = await leerCargo(svc, cargo1);
    expect(c1).toMatchObject({ monto_pagado: 0, saldo: 100, estado: 'pendiente' });

    // cargo2 conserva SOLO el abono de institución (50).
    const c2 = await leerCargo(svc, cargo2);
    expect(c2).toMatchObject({ monto_pagado: 50, saldo: 150, estado: 'parcial' });

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { data: pago } = await (svc.schema('erp') as any)
      .from('cxc_pagos')
      .select('deleted_at')
      .eq('id', abono1)
      .single();
    expect(pago?.deleted_at).not.toBeNull();
  });

  it('cancelar dos veces truena (ya está cancelado)', async () => {
    const { error } = await svc
      .schema('erp')
      .rpc('cxc_pago_cancelar', { p_pago_id: abono1, p_motivo: 'doble' });
    expect(error?.message).toMatch(/no existe o ya está cancelado/);
  });
});

describe('cxc_pago_aplicar — re-aplicación manual', () => {
  const ventaId = randomUUID();
  let cargoA: string, cargoB: string;
  let pagoId: string;

  beforeAll(async () => {
    cargoA = await crearCargo(svc, fx, {
      origenId: ventaId,
      numero: 1,
      monto: 500,
      fechaVencimiento: '2026-01-01',
    });
    cargoB = await crearCargo(svc, fx, {
      origenId: ventaId,
      numero: 2,
      monto: 500,
      fechaVencimiento: '2026-02-01',
    });
    pagoId = await rpc<string>('cxc_pago_registrar', {
      p_empresa_id: fx.empresaId,
      p_persona_id: fx.clienteId,
      p_origen_id: ventaId,
      p_monto: 600,
      p_auto_aplicar: false, // sin FIFO — la aplicación es manual en este flujo
    });
  });

  it('sin auto-aplicar, los cargos quedan intactos', async () => {
    const a = await leerCargo(svc, cargoA);
    expect(a).toMatchObject({ monto_pagado: 0, estado: 'pendiente' });
  });

  it('re-aplica reemplazando (no acumulando) y recalcula saldos', async () => {
    await rpc('cxc_pago_aplicar', {
      p_pago_id: pagoId,
      p_aplicaciones: [
        { cargo_id: cargoA, monto: 400 },
        { cargo_id: cargoB, monto: 200 },
      ],
    });
    expect((await leerCargo(svc, cargoA)).monto_pagado).toBe(400);
    expect((await leerCargo(svc, cargoB)).monto_pagado).toBe(200);

    // Segunda aplicación REEMPLAZA (delete + insert), no suma.
    await rpc('cxc_pago_aplicar', {
      p_pago_id: pagoId,
      p_aplicaciones: [{ cargo_id: cargoA, monto: 600 }],
    });
    const a = await leerCargo(svc, cargoA);
    expect(a).toMatchObject({ monto_pagado: 600, estado: 'liquidado' });
    expect((await leerCargo(svc, cargoB)).monto_pagado).toBe(0);
  });

  it('rechaza Σ aplicaciones > monto del abono', async () => {
    const { error } = await svc.schema('erp').rpc('cxc_pago_aplicar', {
      p_pago_id: pagoId,
      p_aplicaciones: [
        { cargo_id: cargoA, monto: 500 },
        { cargo_id: cargoB, monto: 500 },
      ],
    });
    expect(error?.message).toMatch(/excede el monto del abono/);
  });
});

describe('cxc_cargo_ajustar — gobierno del monto', () => {
  const ventaId = randomUUID();
  let cargoId: string;

  beforeAll(async () => {
    cargoId = await crearCargo(svc, fx, {
      origenId: ventaId,
      numero: 1,
      monto: 1000,
      fechaVencimiento: '2026-01-01',
    });
    await rpc('cxc_pago_registrar', {
      p_empresa_id: fx.empresaId,
      p_persona_id: fx.clienteId,
      p_origen_id: ventaId,
      p_monto: 400,
    });
  });

  it('rechaza bajar el monto por debajo de lo ya pagado', async () => {
    const { error } = await svc.schema('erp').rpc('cxc_cargo_ajustar', {
      p_cargo_id: cargoId,
      p_nuevo_monto: 300,
      p_motivo: 'test',
    });
    expect(error?.message).toMatch(/no puede ser menor a lo ya pagado/);
  });

  it('ajustar el monto al pagado exacto lo deja liquidado', async () => {
    await rpc('cxc_cargo_ajustar', { p_cargo_id: cargoId, p_nuevo_monto: 400, p_motivo: 'test' });
    const c = await leerCargo(svc, cargoId);
    expect(c).toMatchObject({ monto: 400, saldo: 0, estado: 'liquidado' });
  });

  it('subir el monto lo regresa a parcial', async () => {
    await rpc('cxc_cargo_ajustar', { p_cargo_id: cargoId, p_nuevo_monto: 900, p_motivo: 'test' });
    const c = await leerCargo(svc, cargoId);
    expect(c).toMatchObject({ monto: 900, monto_pagado: 400, saldo: 500, estado: 'parcial' });
  });
});

describe('cxc_pago_registrar — gancho de tesorería (ADR-037 D4)', () => {
  it('con cuenta bancaria emite el movimiento espejo tipo abono', async () => {
    const ventaId = randomUUID();
    await crearCargo(svc, fx, {
      origenId: ventaId,
      numero: 1,
      monto: 750,
      fechaVencimiento: '2026-01-01',
    });
    const pagoId = await rpc<string>('cxc_pago_registrar', {
      p_empresa_id: fx.empresaId,
      p_persona_id: fx.clienteId,
      p_origen_id: ventaId,
      p_monto: 750,
      p_cuenta_bancaria_id: fx.cuentaBancariaId,
      p_referencia: 'SPEI-TEST-1',
    });

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { data: movs } = await (svc.schema('erp') as any)
      .from('movimientos_bancarios')
      .select('tipo, monto, referencia_tipo, referencia_id, cuenta_id, conciliado')
      .eq('referencia_tipo', 'cxc_pago')
      .eq('referencia_id', pagoId);
    expect(movs).toHaveLength(1);
    expect(movs![0]).toMatchObject({
      tipo: 'abono',
      referencia_tipo: 'cxc_pago',
      cuenta_id: fx.cuentaBancariaId,
      conciliado: false,
    });
    expect(Number(movs![0].monto)).toBe(750);
  });

  it('sin cuenta bancaria NO emite movimiento', async () => {
    const ventaId = randomUUID();
    await crearCargo(svc, fx, {
      origenId: ventaId,
      numero: 1,
      monto: 100,
      fechaVencimiento: '2026-01-01',
    });
    const pagoId = await rpc<string>('cxc_pago_registrar', {
      p_empresa_id: fx.empresaId,
      p_persona_id: fx.clienteId,
      p_origen_id: ventaId,
      p_monto: 100,
    });
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { data: movs } = await (svc.schema('erp') as any)
      .from('movimientos_bancarios')
      .select('id')
      .eq('referencia_tipo', 'cxc_pago')
      .eq('referencia_id', pagoId);
    expect(movs).toHaveLength(0);
  });
});
