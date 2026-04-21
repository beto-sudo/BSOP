/* eslint-disable @typescript-eslint/no-explicit-any --
 * Shared helper consumido tanto desde server (lib/juntas/email.ts, con
 * service-role) como desde browser (páginas de junta con cliente ERP).
 * No podemos exigir un tipado Database común entre ambos callers sin
 * refactor mayor — mismo trade-off que el resto del repo para rows de
 * Supabase sin tipar.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Trae los avances (`erp.task_updates`) asociados a una junta.
 *
 * Ligados explícitamente por `junta_id` — el trigger en DB lo popula desde
 * `core.usuarios.junta_activa_id` al momento del insert. No hay fallback
 * temporal: las juntas anteriores a la implementación del feature no tenían
 * avances, y el fallback hacía que los avances de hoy (huérfanos, sin
 * junta_activa_id) se colaran en la ventana de juntas viejas sin
 * fecha_terminada.
 *
 * `columns` permite acotar el SELECT para queries ligeros (email builder).
 */
export async function fetchJuntaUpdates(
  supabase: SupabaseClient<any, any, any>,
  args: { juntaId: string; columns?: string }
) {
  const { juntaId, columns = '*' } = args;

  return supabase
    .schema('erp')
    .from('task_updates')
    .select(columns)
    .eq('junta_id', juntaId)
    .order('created_at', { ascending: false });
}
