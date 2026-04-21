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
 * Estrategia:
 *   1) Ligados explícitamente vía `junta_id` (trigger en DB lo popula desde
 *      `core.usuarios.junta_activa_id` al momento del insert).
 *   2) Fallback temporal para históricos con `junta_id IS NULL`: dentro de
 *      la ventana [fecha_hora, fecha_terminada] y misma empresa. Registros
 *      ambiguos del pasado (solapamiento entre juntas) quedan en NULL a
 *      propósito y seguirán apareciendo en ambas minutas como antes.
 *
 * `columns` permite acotar el SELECT para queries ligeros (email builder).
 */
export async function fetchJuntaUpdates(
  supabase: SupabaseClient<any, any, any>,
  args: {
    juntaId: string;
    empresaId: string;
    fechaHora: string;
    fechaTerminada?: string | null;
    columns?: string;
  }
) {
  const { juntaId, empresaId, fechaHora, fechaTerminada, columns = '*' } = args;

  const linkedPromise = supabase
    .schema('erp')
    .from('task_updates')
    .select(columns)
    .eq('junta_id', juntaId)
    .order('created_at', { ascending: false });

  let orphanBuilder = supabase
    .schema('erp')
    .from('task_updates')
    .select(columns)
    .is('junta_id', null)
    .eq('empresa_id', empresaId)
    .gte('created_at', fechaHora);
  if (fechaTerminada) {
    orphanBuilder = orphanBuilder.lte('created_at', fechaTerminada);
  }

  const [{ data: linked, error: linkedErr }, { data: orphan, error: orphanErr }] =
    await Promise.all([linkedPromise, orphanBuilder.order('created_at', { ascending: false })]);

  if (linkedErr) return { data: null, error: linkedErr };
  if (orphanErr) return { data: null, error: orphanErr };

  const merged = [...(linked ?? []), ...(orphan ?? [])].sort((a: any, b: any) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    return tb - ta;
  });

  return { data: merged, error: null };
}
