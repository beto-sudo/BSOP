import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Helpers compartidos de la suite de integración financiera
 * (`blindaje-financiero` S2). Corren contra el stack LOCAL de Supabase
 * (`supabase start`) — nunca contra prod.
 *
 * Las llaves son los JWTs demo estándar del CLI de Supabase para stacks
 * locales (iss `supabase-demo`, públicos y documentados) — NO son secrets.
 * Mismo patrón que `smoke.integration.test.ts`.
 */

export const SUPABASE_LOCAL_URL = process.env.SUPABASE_LOCAL_URL ?? 'http://127.0.0.1:54321';

export const SERVICE_ROLE_KEY =
  process.env.SUPABASE_LOCAL_SERVICE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export const ANON_KEY =
  process.env.SUPABASE_LOCAL_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_LOCAL_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_LOCAL_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── Fixtures financieras ──────────────────────────────────────────────────────

export interface FixturasFinancieras {
  empresaId: string;
  clienteId: string;
  proveedorId: string;
  cuentaBancariaId: string;
  /** Marca única de esta corrida — los fixtures no chocan entre corridas. */
  runTag: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- inserts ad-hoc de
   fixtures: los types generados no cubren el patrón .schema() dinámico. */

/**
 * Crea el mundo mínimo para ejercitar las RPCs de dinero: una empresa de
 * prueba, un cliente, un proveedor y una cuenta bancaria. Idempotente entre
 * corridas por slug único (no limpia lo de corridas anteriores: la shadow es
 * desechable y en local no estorba).
 */
export async function crearFixturesFinancieras(svc: SupabaseClient): Promise<FixturasFinancieras> {
  const runTag = randomUUID().slice(0, 8);

  const { data: empresa, error: eErr } = await (svc.schema('core') as any)
    .from('empresas')
    .insert({ nombre: `Test Blindaje ${runTag}`, slug: `test-blindaje-${runTag}` })
    .select('id')
    .single();
  if (eErr) throw new Error(`fixture empresa: ${eErr.message}`);

  const { data: cliente, error: cErr } = await (svc.schema('erp') as any)
    .from('personas')
    .insert({ empresa_id: empresa.id, nombre: `Cliente Test ${runTag}`, tipo: 'cliente' })
    .select('id')
    .single();
  if (cErr) throw new Error(`fixture cliente: ${cErr.message}`);

  const { data: proveedor, error: pErr } = await (svc.schema('erp') as any)
    .from('personas')
    .insert({ empresa_id: empresa.id, nombre: `Proveedor Test ${runTag}`, tipo: 'proveedor' })
    .select('id')
    .single();
  if (pErr) throw new Error(`fixture proveedor: ${pErr.message}`);

  const { data: cuenta, error: cbErr } = await (svc.schema('erp') as any)
    .from('cuentas_bancarias')
    .insert({ empresa_id: empresa.id, nombre: `Cuenta Test ${runTag}`, banco: 'Banco Test' })
    .select('id')
    .single();
  if (cbErr) throw new Error(`fixture cuenta: ${cbErr.message}`);

  return {
    empresaId: empresa.id,
    clienteId: cliente.id,
    proveedorId: proveedor.id,
    cuentaBancariaId: cuenta.id,
    runTag,
  };
}

/**
 * Crea un cargo CxC directo (fixture, no vía RPC — el plan de cargos lo
 * origina la venta en prod; aquí solo necesitamos el adeudo).
 */
export async function crearCargo(
  svc: SupabaseClient,
  fx: FixturasFinancieras,
  args: {
    origenId: string;
    numero: number;
    monto: number;
    fechaVencimiento: string;
    tipoCargo?: string;
  }
): Promise<string> {
  const { data, error } = await (svc.schema('erp') as any)
    .from('cxc_cargos')
    .insert({
      empresa_id: fx.empresaId,
      persona_id: fx.clienteId,
      origen_tipo: 'venta_dilesa',
      origen_id: args.origenId,
      // CHECK cxc_cargos_tipo_cargo_check: enganche|mensualidad|credito|contado|otro|renta|deposito|penalizacion
      tipo_cargo: args.tipoCargo ?? 'enganche',
      numero: args.numero,
      monto: args.monto,
      fecha_vencimiento: args.fechaVencimiento,
    })
    .select('id')
    .single();
  if (error) throw new Error(`fixture cargo: ${error.message}`);
  return data.id;
}

export interface CargoEstado {
  id: string;
  monto: number;
  monto_pagado: number;
  saldo: number;
  estado: string;
}

export async function leerCargo(svc: SupabaseClient, cargoId: string): Promise<CargoEstado> {
  const { data, error } = await (svc.schema('erp') as any)
    .from('cxc_cargos')
    .select('id, monto, monto_pagado, saldo, estado')
    .eq('id', cargoId)
    .single();
  if (error) throw new Error(`leerCargo: ${error.message}`);
  return {
    ...data,
    monto: Number(data.monto),
    monto_pagado: Number(data.monto_pagado),
    saldo: Number(data.saldo),
  };
}

// ── Usuarios autenticados con rol ─────────────────────────────────────────────

export interface UsuarioDePrueba {
  userId: string;
  email: string;
  client: SupabaseClient;
}

/**
 * Crea un usuario REAL de auth (GoTrue local) + su fila en `core.usuarios`
 * con **id = auth.uid()** (requisito de `core.fn_user_has_role`, que matchea
 * `usuarios_empresas.usuario_id = auth.uid()`; el FK de `core.audit_log`
 * también apunta a `core.usuarios.id`) y, si se pide, un rol por nombre en
 * la empresa. Devuelve un cliente AUTENTICADO (anon key + sesión password).
 */
export async function crearUsuarioConRol(
  svc: SupabaseClient,
  empresaId: string,
  rolNombre: string | null,
  runTag: string
): Promise<UsuarioDePrueba> {
  const marker = randomUUID().slice(0, 8);
  const email = `test-${rolNombre ? rolNombre.toLowerCase().replace(/\W+/g, '-') : 'sin-rol'}-${runTag}-${marker}@blindaje.test`;
  const password = `pw-${randomUUID()}`;

  const { data: created, error: auErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (auErr || !created.user) throw new Error(`auth createUser: ${auErr?.message}`);
  const userId = created.user.id;

  const { error: uErr } = await (svc.schema('core') as any).from('usuarios').insert({
    id: userId, // MISMO uuid que auth.users — ver docstring.
    email,
    rol: 'viewer',
    activo: true,
    first_name: 'Test',
    last_name: rolNombre ?? 'SinRol',
  });
  if (uErr) throw new Error(`fixture core.usuarios: ${uErr.message}`);

  if (rolNombre) {
    const { data: rol, error: rErr } = await (svc.schema('core') as any)
      .from('roles')
      .insert({ nombre: rolNombre, empresa_id: empresaId })
      .select('id')
      .single();
    if (rErr) throw new Error(`fixture rol: ${rErr.message}`);

    const { error: ueErr } = await (svc.schema('core') as any).from('usuarios_empresas').insert({
      usuario_id: userId,
      empresa_id: empresaId,
      rol_id: rol.id,
      activo: true,
    });
    if (ueErr) throw new Error(`fixture usuarios_empresas: ${ueErr.message}`);
  }

  const client = anonClient();
  const { error: siErr } = await client.auth.signInWithPassword({ email, password });
  if (siErr) throw new Error(`signIn: ${siErr.message}`);

  return { userId, email, client };
}
