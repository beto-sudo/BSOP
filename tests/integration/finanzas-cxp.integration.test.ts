import { describe, it, expect, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  serviceClient,
  crearFixturesFinancieras,
  crearUsuarioConRol,
  type FixturasFinancieras,
  type UsuarioDePrueba,
} from './helpers';

/**
 * Tests de COMPORTAMIENTO del subledger CxP (`blindaje-financiero` S2).
 *
 * Además de los saldos, aquí se lockea el GATE de autorización de
 * `cxp_pago_aprobar` (admin global O rol Dirección de la empresa — política
 * 2026-06-10) con usuarios de auth REALES: uno con rol Dirección, uno sin
 * rol. Es el patrón correcto que el reporte 2026-06-12 pide replicar al
 * resto de las RPCs mutadoras (Sprint 4).
 */

let svc: SupabaseClient;
let fx: FixturasFinancieras;
let direccion: UsuarioDePrueba;
let sinRol: UsuarioDePrueba;

beforeAll(async () => {
  svc = serviceClient();
  fx = await crearFixturesFinancieras(svc);
  direccion = await crearUsuarioConRol(svc, fx.empresaId, 'Dirección', fx.runTag);
  sinRol = await crearUsuarioConRol(svc, fx.empresaId, null, fx.runTag);
});

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await svc.schema('erp').rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

async function altaFactura(total: number): Promise<string> {
  return rpc<string>('cxp_factura_alta', {
    p_empresa_id: fx.empresaId,
    p_proveedor_id: fx.proveedorId,
    p_total: total,
  });
}

describe('cxp_factura_alta + cxp_pago_programar — comprometido vivo', () => {
  let facturaId: string;

  beforeAll(async () => {
    facturaId = await altaFactura(1000);
  });

  it('la factura nace por_pagar con el total correcto', async () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { data: f } = await (svc.schema('erp') as any)
      .from('facturas')
      .select('estado_cxp, total, flujo')
      .eq('id', facturaId)
      .single();
    expect(f).toMatchObject({ estado_cxp: 'por_pagar', flujo: 'egreso' });
    expect(Number(f.total)).toBe(1000);
  });

  it('programa un pago parcial y valida el comprometido vivo en el segundo', async () => {
    const pago1 = await rpc<string>('cxp_pago_programar', {
      p_empresa_id: fx.empresaId,
      p_proveedor_id: fx.proveedorId,
      p_aplicaciones: [{ factura_id: facturaId, monto: 700 }],
    });
    expect(pago1).toBeTruthy();

    // Solo quedan 300 por programar: 400 debe tronar.
    const { error } = await svc.schema('erp').rpc('cxp_pago_programar', {
      p_empresa_id: fx.empresaId,
      p_proveedor_id: fx.proveedorId,
      p_aplicaciones: [{ factura_id: facturaId, monto: 400 }],
    });
    expect(error?.message).toMatch(/excede lo disponible por programar/);

    // 300 exactos sí pasan.
    const pago2 = await rpc<string>('cxp_pago_programar', {
      p_empresa_id: fx.empresaId,
      p_proveedor_id: fx.proveedorId,
      p_aplicaciones: [{ factura_id: facturaId, monto: 300 }],
    });
    expect(pago2).toBeTruthy();
  });

  it('cancelar un pago libera lo comprometido (se puede reprogramar)', async () => {
    const factura = await altaFactura(500);
    const pago = await rpc<string>('cxp_pago_programar', {
      p_empresa_id: fx.empresaId,
      p_proveedor_id: fx.proveedorId,
      p_aplicaciones: [{ factura_id: factura, monto: 500 }],
    });

    // Comprometida al 100%: no cabe ni un peso más.
    const { error: llena } = await svc.schema('erp').rpc('cxp_pago_programar', {
      p_empresa_id: fx.empresaId,
      p_proveedor_id: fx.proveedorId,
      p_aplicaciones: [{ factura_id: factura, monto: 1 }],
    });
    expect(llena?.message).toMatch(/excede lo disponible/);

    await rpc('cxp_pago_cancelar', { p_pago_id: pago, p_motivo: 'test' });

    // Liberada: el total vuelve a estar disponible.
    const reprogramado = await rpc<string>('cxp_pago_programar', {
      p_empresa_id: fx.empresaId,
      p_proveedor_id: fx.proveedorId,
      p_aplicaciones: [{ factura_id: factura, monto: 500 }],
    });
    expect(reprogramado).toBeTruthy();
  });

  it('rechaza factura de otra empresa', async () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { data: otraEmpresa } = await (svc.schema('core') as any)
      .from('empresas')
      .insert({ nombre: `Otra ${fx.runTag}`, slug: `test-otra-${fx.runTag}` })
      .select('id')
      .single();
    const { error } = await svc.schema('erp').rpc('cxp_pago_programar', {
      p_empresa_id: otraEmpresa.id,
      p_proveedor_id: fx.proveedorId,
      p_aplicaciones: [{ factura_id: facturaId, monto: 10 }],
    });
    expect(error?.message).toMatch(/no existe o es de otra empresa/);
  });

  it('dedup por uuid_sat: la misma factura no entra dos veces', async () => {
    const uuidSat = `TEST-UUID-${fx.runTag}`;
    await rpc<string>('cxp_factura_alta', {
      p_empresa_id: fx.empresaId,
      p_proveedor_id: fx.proveedorId,
      p_total: 100,
      p_uuid_sat: uuidSat,
    });
    const { error } = await svc.schema('erp').rpc('cxp_factura_alta', {
      p_empresa_id: fx.empresaId,
      p_proveedor_id: fx.proveedorId,
      p_total: 100,
      p_uuid_sat: uuidSat,
    });
    expect(error?.message).toMatch(/Ya existe una factura con uuid_sat/);
  });
});

describe('cxp_pago_aprobar — gate de autorización (admin O Dirección)', () => {
  let pagoId: string;

  beforeAll(async () => {
    const factura = await altaFactura(2500);
    pagoId = await rpc<string>('cxp_pago_programar', {
      p_empresa_id: fx.empresaId,
      p_proveedor_id: fx.proveedorId,
      p_aplicaciones: [{ factura_id: factura, monto: 2500 }],
    });
  });

  it('un usuario SIN rol no puede aprobar', async () => {
    const { error } = await sinRol.client.schema('erp').rpc('cxp_pago_aprobar', {
      p_pago_id: pagoId,
    });
    expect(error?.message).toMatch(/Solo admin o un usuario con rol Dirección/);
  });

  it('service role sin sesión tampoco (el gate no asume contexto)', async () => {
    const { error } = await svc.schema('erp').rpc('cxp_pago_aprobar', { p_pago_id: pagoId });
    expect(error?.message).toMatch(/Solo admin o un usuario con rol Dirección/);
  });

  it('un usuario con rol Dirección de la empresa SÍ aprueba (y queda auditado)', async () => {
    const { error } = await direccion.client.schema('erp').rpc('cxp_pago_aprobar', {
      p_pago_id: pagoId,
    });
    expect(error).toBeNull();

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { data: pago } = await (svc.schema('erp') as any)
      .from('cxp_pagos')
      .select('estado, aprobado_por, aprobado_at')
      .eq('id', pagoId)
      .single();
    expect(pago.estado).toBe('aprobado');
    expect(pago.aprobado_por).toBe(direccion.userId);
    expect(pago.aprobado_at).not.toBeNull();

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { data: audit } = await (svc.schema('core') as any)
      .from('audit_log')
      .select('usuario_id, accion')
      .eq('accion', 'cxp_pago_aprobado')
      .eq('registro_id', pagoId);
    expect(audit).toHaveLength(1);
    expect(audit![0].usuario_id).toBe(direccion.userId);
  });

  it('aprobar dos veces truena (ya no está programado)', async () => {
    const { error } = await direccion.client.schema('erp').rpc('cxp_pago_aprobar', {
      p_pago_id: pagoId,
    });
    expect(error?.message).toMatch(/no está en estado programado/);
  });

  it('el rol Dirección de OTRA empresa no autoriza en ésta', async () => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const { data: otraEmpresa } = await (svc.schema('core') as any)
      .from('empresas')
      .insert({ nombre: `Ajena ${fx.runTag}`, slug: `test-ajena-${fx.runTag}` })
      .select('id')
      .single();
    const direccionAjena = await crearUsuarioConRol(svc, otraEmpresa.id, 'Dirección', fx.runTag);

    const factura = await altaFactura(100);
    const pago = await rpc<string>('cxp_pago_programar', {
      p_empresa_id: fx.empresaId,
      p_proveedor_id: fx.proveedorId,
      p_aplicaciones: [{ factura_id: factura, monto: 100 }],
    });

    const { error } = await direccionAjena.client.schema('erp').rpc('cxp_pago_aprobar', {
      p_pago_id: pago,
    });
    expect(error?.message).toMatch(/Solo admin o un usuario con rol Dirección/);
  });
});
