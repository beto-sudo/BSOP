import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { anonClient } from './helpers';

/**
 * Caso ANON-NEGATIVO (`blindaje-financiero` S2 — red del Sprint 0).
 *
 * El Sprint 0 de la revisión 2026-06-12 (PRs #876/#877 + migración
 * 20260613032841) revocó EXECUTE de `anon` en las RPCs financieras y el
 * default grant que lo perpetuaba. Antes de eso, un cliente con la anon key
 * (pública, viaja en el bundle de Vercel) INSERTÓ un cxc_pago real en prod.
 *
 * Estos tests son la red de regresión de ese perímetro: si una migración
 * futura re-otorga EXECUTE a anon (o un default grant nuevo lo revive),
 * truenan en CI. La aserción es estricta: el error debe ser de PERMISO
 * (42501 / permission denied) — NO de lógica de negocio, porque eso
 * significaría que anon ALCANZÓ a ejecutar el cuerpo de la función.
 */

let anon: SupabaseClient;

beforeAll(() => {
  anon = anonClient();
});

/** Las RPCs mutadoras de dinero que el Sprint 0 cerró a anon. */
const RPCS_MUTADORAS: Array<{ fn: string; args: Record<string, unknown> }> = [
  {
    fn: 'cxc_pago_registrar',
    args: {
      p_empresa_id: randomUUID(),
      p_persona_id: randomUUID(),
      p_origen_id: randomUUID(),
      p_monto: 1,
    },
  },
  {
    fn: 'cxc_pago_aplicar',
    args: { p_pago_id: randomUUID(), p_aplicaciones: [] },
  },
  {
    fn: 'cxc_pago_cancelar',
    args: { p_pago_id: randomUUID(), p_motivo: 'x' },
  },
  {
    fn: 'cxc_cargo_ajustar',
    args: { p_cargo_id: randomUUID(), p_nuevo_monto: 1, p_motivo: 'x' },
  },
  {
    fn: 'cxp_factura_alta',
    args: { p_empresa_id: randomUUID(), p_proveedor_id: randomUUID(), p_total: 1 },
  },
  {
    fn: 'cxp_pago_programar',
    args: { p_empresa_id: randomUUID(), p_proveedor_id: randomUUID(), p_aplicaciones: [] },
  },
  { fn: 'cxp_pago_aprobar', args: { p_pago_id: randomUUID() } },
  { fn: 'cxp_pago_cancelar', args: { p_pago_id: randomUUID(), p_motivo: 'x' } },
  { fn: 'fn_aplicar_levantamiento', args: { p_levantamiento_id: randomUUID() } },
];

describe('perímetro anon — RPCs mutadoras de dinero', () => {
  for (const { fn, args } of RPCS_MUTADORAS) {
    it(`anon NO puede ejecutar erp.${fn}`, async () => {
      const { error } = await anon.schema('erp').rpc(fn, args);
      // Debe fallar...
      expect(error, `anon ejecutó erp.${fn} sin error`).not.toBeNull();
      // ...y fallar por PERMISO, no por lógica interna (42501 = insufficient
      // privilege). Un error de negocio ("no existe", "debe ser > 0")
      // significaría que anon entró al cuerpo de la función.
      expect(
        error!.code === '42501' || /permission denied/i.test(error!.message),
        `erp.${fn}: anon alcanzó el cuerpo de la función — error inesperado: [${error!.code}] ${error!.message}`
      ).toBe(true);
    });
  }
});

describe('perímetro anon — lecturas financieras', () => {
  it('anon NO lee erp.v_partida_control (regresión C2, security_invoker)', async () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { data, error } = await (anon.schema('erp') as any)
      .from('v_partida_control')
      .select('*')
      .limit(1);
    // Aceptamos dos desenlaces seguros: error de permiso o 0 filas (RLS).
    // Lo que NO puede pasar: filas con montos.
    if (error) {
      expect(error.code === '42501' || /permission denied/i.test(error.message)).toBe(true);
    } else {
      expect(data).toHaveLength(0);
    }
  });

  it('anon NO lee erp.cxc_pagos', async () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { data, error } = await (anon.schema('erp') as any)
      .from('cxc_pagos')
      .select('id')
      .limit(1);
    if (error) {
      expect(error.code === '42501' || /permission denied/i.test(error.message)).toBe(true);
    } else {
      expect(data).toHaveLength(0);
    }
  });

  it('anon NO lee erp.movimientos_bancarios', async () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { data, error } = await (anon.schema('erp') as any)
      .from('movimientos_bancarios')
      .select('id')
      .limit(1);
    if (error) {
      expect(error.code === '42501' || /permission denied/i.test(error.message)).toBe(true);
    } else {
      expect(data).toHaveLength(0);
    }
  });
});
