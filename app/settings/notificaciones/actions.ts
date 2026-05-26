'use server';

/**
 * Server actions de /settings/notificaciones.
 *
 * Iniciativa notificaciones-catalogo · Sprint 4. Admin-only.
 *
 *  - updateDefinition(id, patch) — edita los campos runtime de una def.
 *  - testSendDefinition(id) — manda un correo dummy al admin actual.
 *
 * Las dos verifican admin con `requireAdmin` antes de tocar nada.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/empresas/admin-guard';
import type { RecipientExtra } from '@/lib/notifications';

type AdminClients =
  | {
      ok: true;
      admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>;
      guard: { ok: true; usuario: { id: string; email: string; rol: 'admin' } };
    }
  | { ok: false; error: string };

async function getClients(): Promise<AdminClients> {
  const cookieStore = await cookies();
  const userSupa = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // no-op — server actions no setean cookies de Supabase aquí
        },
      },
    }
  );
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, error: 'admin client unavailable' };
  const guard = await requireAdmin(userSupa, admin);
  if (!guard.ok) return { ok: false, error: guard.error };
  return { ok: true, admin, guard };
}

export type UpdateDefinitionPatch = {
  from_email?: string;
  from_name?: string | null;
  reply_to?: string | null;
  recipients_extra?: RecipientExtra[];
  subject_template?: string;
  activo?: boolean;
};

export async function updateDefinitionAction(
  id: string,
  patch: UpdateDefinitionPatch
): Promise<{ ok: true } | { ok: false; error: string }> {
  const clients = await getClients();
  if (!clients.ok) return { ok: false, error: clients.error };
  const { admin, guard } = clients;

  // Validación mínima en server-side (la UI ya valida, esto es defensa).
  if (patch.from_email !== undefined && (!patch.from_email || !patch.from_email.includes('@'))) {
    return { ok: false, error: 'from_email inválido' };
  }
  if (patch.subject_template !== undefined && !patch.subject_template.trim()) {
    return { ok: false, error: 'subject_template no puede estar vacío' };
  }
  if (patch.recipients_extra !== undefined) {
    for (const r of patch.recipients_extra) {
      if (!r.email || !r.email.includes('@')) {
        return { ok: false, error: `recipiente extra inválido: ${r.email}` };
      }
      if (!['cc', 'bcc', 'always'].includes(r.type)) {
        return { ok: false, error: `tipo inválido: ${r.type}` };
      }
    }
  }

  // Patch parcial — armamos el objeto solo con keys presentes para no
  // sobrescribir columnas no editadas. Cast a unknown porque el tipo de
  // Supabase del update es estricto y rechaza Record<string, unknown>.
  const update = {
    updated_by: guard.usuario.id,
    ...(patch.from_email !== undefined && { from_email: patch.from_email }),
    ...(patch.from_name !== undefined && { from_name: patch.from_name }),
    ...(patch.reply_to !== undefined && { reply_to: patch.reply_to }),
    ...(patch.recipients_extra !== undefined && { recipients_extra: patch.recipients_extra }),
    ...(patch.subject_template !== undefined && { subject_template: patch.subject_template }),
    ...(patch.activo !== undefined && { activo: patch.activo }),
  };

  const { error } = await admin
    .schema('core')
    .from('notification_definitions')
    .update(update)
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/notificaciones');
  return { ok: true };
}
