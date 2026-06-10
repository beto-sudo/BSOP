import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Gate de autorización "Dirección" para server actions.
 *
 * Criterio (espejo de `EffectiveUser.direccionEmpresaIds` y de
 * `erp.fn_es_direccion` en DB): admin global (`core.usuarios.rol`) O un
 * rol cuyo nombre matchee "Dirección" (case-insensitive) activo en la
 * empresa via `core.roles` + `core.usuarios_empresas`.
 *
 * Trabaja con el client de la sesión del request (no admin client):
 * las tablas core consultadas son legibles por el propio usuario.
 */
export type DireccionGateResult =
  | { ok: true; autorizado: boolean; authUserId: string; coreUserId: string }
  | { ok: false; error: string };

export async function checkDireccionEmpresa(
  supabase: SupabaseClient,
  empresaId: string
): Promise<DireccionGateResult> {
  if (!empresaId) return { ok: false, error: 'empresaId requerido' };

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes?.user) return { ok: false, error: 'No autenticado' };
  const email = userRes.user.email;
  if (!email) return { ok: false, error: 'JWT sin email' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coreSb = supabase.schema('core') as any;

  const { data: coreUser, error: lookupErr } = await coreSb
    .from('usuarios')
    .select('id, rol')
    .eq('email', email)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };
  if (!coreUser) return { ok: false, error: 'Usuario no encontrado en core.usuarios' };

  const base = { ok: true as const, authUserId: userRes.user.id, coreUserId: coreUser.id };

  if (coreUser.rol === 'admin') return { ...base, autorizado: true };

  const { data: direccionRoles, error: rolesErr } = await coreSb
    .from('roles')
    .select('id')
    .eq('empresa_id', empresaId)
    .ilike('nombre', 'direcci%n');
  if (rolesErr) return { ok: false, error: rolesErr.message };

  const roleIds = (direccionRoles ?? []).map((r: { id: string }) => r.id);
  if (roleIds.length === 0) return { ...base, autorizado: false };

  const { data: asgs, error: asgErr } = await coreSb
    .from('usuarios_empresas')
    .select('rol_id')
    .eq('usuario_id', coreUser.id)
    .eq('empresa_id', empresaId)
    .eq('activo', true)
    .in('rol_id', roleIds);
  if (asgErr) return { ok: false, error: asgErr.message };

  return { ...base, autorizado: (asgs ?? []).length > 0 };
}
