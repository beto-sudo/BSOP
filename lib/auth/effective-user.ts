import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { getPreviewUserId } from './preview-guard';

export type EffectiveUser = {
  /** `core.usuarios.id` of the effective user (real or impersonated). */
  id: string;
  email: string;
  isAdmin: boolean;
  /** True only when the caller is admin AND a preview cookie is active. */
  isPreviewing: boolean;
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
    .select('id, email, rol, activo')
    .eq('email', callerEmail)
    .eq('activo', true)
    .maybeSingle();

  if (!caller) return null;

  const callerSelf: EffectiveUser = {
    id: caller.id,
    email: caller.email,
    isAdmin: caller.rol === 'admin',
    isPreviewing: false,
  };

  if (caller.rol !== 'admin') return callerSelf;

  const previewUserId = await getPreviewUserId();
  if (!previewUserId) return callerSelf;

  const { data: target } = await admin
    .schema('core')
    .from('usuarios')
    .select('id, email, rol, activo')
    .eq('id', previewUserId)
    .eq('activo', true)
    .maybeSingle();

  if (!target) return callerSelf;

  return {
    id: target.id,
    email: target.email,
    isAdmin: target.rol === 'admin',
    isPreviewing: true,
  };
}
