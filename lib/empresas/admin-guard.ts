/**
 * Admin guard para los endpoints `/api/empresas/*`.
 *
 * El alcance v1 de la iniciativa `empresas-csf-config` es solo-admin
 * (decisión cerrada por Beto: las pantallas de `/settings/empresas` ya
 * son admin-only vía `<RequireAccess adminOnly>`; los endpoints reflejan
 * lo mismo).
 *
 * Patrón: el client del usuario (con su JWT) consulta su email →
 * `core.usuarios.rol === 'admin'`. Es el mismo patrón que `lib/permissions.ts`
 * y `app/api/impersonate/route.ts`. No usamos el RPC `core.fn_is_admin()`
 * porque queremos el shape `{ id, rol, email }` para devolverlo a quien lo
 * necesita.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type AdminCheckResult =
  | { ok: true; usuario: { id: string; email: string; rol: 'admin' } }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Verifica que el usuario autenticado en el `userClient` es admin.
 * El `adminClient` se usa para leer `core.usuarios` con su email; RLS de
 * `core.usuarios` puede no permitir self-read según la política, así que
 * vamos por el admin client (el filtro por email es seguro porque el JWT
 * ya está validado por Supabase).
 */
/* eslint-disable @typescript-eslint/no-explicit-any --
 * supabase-js solo tipa el schema `public` por default; para `core.usuarios`
 * usamos `as any`. Mismo patrón que el resto del repo.
 */
export async function requireAdmin(
  userClient: SupabaseClient,
  adminClient: SupabaseClient
): Promise<AdminCheckResult> {
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, error: 'No autenticado' };
  }
  const email = user.email;
  if (!email) {
    return { ok: false, status: 401, error: 'JWT sin email claim' };
  }

  const { data: coreUser, error } = await (adminClient.schema('core') as any)
    .from('usuarios')
    .select('id, email, rol, activo')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (error) {
    return { ok: false, status: 403, error: `lookup admin: ${error.message}` };
  }
  if (!coreUser || !coreUser.activo) {
    return { ok: false, status: 403, error: 'Usuario sin acceso activo' };
  }
  if (coreUser.rol !== 'admin') {
    return { ok: false, status: 403, error: 'Esta acción requiere rol admin' };
  }

  return {
    ok: true,
    usuario: { id: coreUser.id, email: coreUser.email, rol: 'admin' },
  };
}
