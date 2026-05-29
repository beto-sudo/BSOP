import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { getPreviewUserId } from './preview-guard';

export type EffectiveUser = {
  /** `core.usuarios.id` of the effective user (real or impersonated). */
  id: string;
  email: string;
  /** `core.usuarios.first_name`; null when not set. Drives the `/inicio` greeting. */
  firstName: string | null;
  isAdmin: boolean;
  /** True only when the caller is admin AND a preview cookie is active. */
  isPreviewing: boolean;
  /**
   * IDs de empresas donde el usuario efectivo tiene un rol cuyo nombre matchea
   * "Dirección" (case-insensitive). Sirve para gates de autorización
   * operativos como el de promoción a desarrollo (Sprint 4A DILESA).
   * Los admin globales NO necesitan estar listados aquí — el `isAdmin=true`
   * los habilita en cualquier empresa.
   */
  direccionEmpresaIds: string[];
};

/**
 * Resolves who the request should "act as" for personal data widgets
 * (`/inicio`, "mis tareas", "mis juntas", etc.).
 *
 * Rules:
 *   - Caller is not admin → effective user IS the caller, regardless of cookie.
 *   - Caller is admin without preview cookie → effective user IS the caller.
 *   - Caller is admin with preview cookie → effective user is the cookie target,
 *     validated against `core.usuarios.activo = true`. If the target is no
 *     longer active (or doesn't exist), falls back to the caller.
 *
 * Read-only enforcement is enforced separately in proxy.ts and server actions.
 * This helper only swaps identity for *reads* of personal data.
 *
 * Returns `null` when the caller is not authenticated.
 */
export async function getEffectiveUser(
  supabase: SupabaseClient<Database>
): Promise<EffectiveUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const callerEmail = user.email.toLowerCase();

  const admin = getSupabaseAdminClient();
  if (!admin) return null;

  const { data: caller } = await admin
    .schema('core')
    .from('usuarios')
    .select('id, email, rol, activo, first_name')
    .eq('email', callerEmail)
    .eq('activo', true)
    .maybeSingle();

  if (!caller) return null;

  const callerDireccion = await loadDireccionEmpresaIds(admin, caller.id);

  const callerSelf: EffectiveUser = {
    id: caller.id,
    email: caller.email,
    firstName: caller.first_name ?? null,
    isAdmin: caller.rol === 'admin',
    isPreviewing: false,
    direccionEmpresaIds: callerDireccion,
  };

  if (caller.rol !== 'admin') return callerSelf;

  const previewUserId = await getPreviewUserId();
  if (!previewUserId) return callerSelf;

  const { data: target } = await admin
    .schema('core')
    .from('usuarios')
    .select('id, email, rol, activo, first_name')
    .eq('id', previewUserId)
    .eq('activo', true)
    .maybeSingle();

  if (!target) return callerSelf;

  const targetDireccion = await loadDireccionEmpresaIds(admin, target.id);

  return {
    id: target.id,
    email: target.email,
    firstName: target.first_name ?? null,
    isAdmin: target.rol === 'admin',
    isPreviewing: true,
    direccionEmpresaIds: targetDireccion,
  };
}

/**
 * Lee las empresas donde el usuario tiene un rol cuyo nombre matchea
 * "Dirección" (case-insensitive) en `core.roles`. Usado para gates
 * operativos por empresa (ej. autorizar promoción a desarrollo DILESA).
 *
 * Falla silencioso a `[]` en caso de error — el gate es additive sobre
 * `isAdmin`, así que un fallo de lectura no rompe a los admin globales.
 */
async function loadDireccionEmpresaIds(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  usuarioId: string
): Promise<string[]> {
  if (!admin) return [];
  // Dos pasos para no depender de embeds cross-schema:
  // 1) IDs de roles llamados "Dirección" (cualquier empresa, case-insensitive).
  // 2) Asignaciones activas del usuario contra esos roles.
  const { data: roles, error: rolesErr } = await admin
    .schema('core')
    .from('roles')
    .select('id, empresa_id, nombre')
    .ilike('nombre', 'direcci%n');
  if (rolesErr || !roles?.length) return [];

  const roleIdToEmpresa = new Map(roles.map((r) => [r.id, r.empresa_id]));
  const roleIds = roles.map((r) => r.id);

  const { data: asgs, error: asgErr } = await admin
    .schema('core')
    .from('usuarios_empresas')
    .select('rol_id, empresa_id, activo')
    .eq('usuario_id', usuarioId)
    .eq('activo', true)
    .in('rol_id', roleIds);
  if (asgErr || !asgs?.length) return [];

  const out = new Set<string>();
  for (const a of asgs) {
    if (!a.rol_id || !a.empresa_id) continue;
    // Doble check: el rol asignado matchea y la empresa coincide.
    const empresaRol = roleIdToEmpresa.get(a.rol_id);
    if (empresaRol && empresaRol === a.empresa_id) {
      out.add(a.empresa_id);
    }
  }
  return Array.from(out);
}
