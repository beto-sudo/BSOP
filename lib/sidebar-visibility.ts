import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

/**
 * Fetches the set of top-level sidebar nav slugs that an admin has hidden
 * globally — a denylist stored in `core.sidebar_oculto` (presence = hidden).
 *
 * The slug is the key of `NAV_TO_EMPRESA` (e.g. `sanren`, `personas_fisicas`),
 * NOT necessarily a real empresa — some sidebar items are virtual placeholders.
 *
 * Hiding is purely cosmetic (it removes the item from the sidebar for ALL users,
 * admin included). It does NOT block route access — RBAC still governs that.
 *
 * Fails OPEN: on any error returns an empty set so the sidebar shows everything
 * rather than hiding the whole menu on a transient fetch failure.
 */
export async function fetchSidebarHidden(supabase: SupabaseClient<Database>): Promise<Set<string>> {
  const { data, error } = await supabase.schema('core').from('sidebar_oculto').select('nav_slug');
  if (error || !data) return new Set();
  return new Set(data.map((row) => row.nav_slug));
}
