import { createSupabaseServerClient } from '@/lib/supabase-server';
import { fetchUserPermissions, type UserPermissions } from '@/lib/permissions';

/**
 * Contexto server del manual: sesión + permisos del usuario, con la MISMA
 * semántica que el sidebar (`fetchUserPermissions`). Lo comparten la portada,
 * la vista imprimible y los route handlers (`/api/manual/*`) para filtrar el
 * contenido por módulo (ver `lib/manual/access.ts`).
 *
 * Devuelve `null` sin sesión — cada superficie decide su 401/redirect.
 */
export async function getManualReaderContext(): Promise<{
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  perms: UserPermissions;
} | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const perms = await fetchUserPermissions(supabase);
  return { supabase, perms };
}
