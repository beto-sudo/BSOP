'use server';

/**
 * Server actions de /settings/ia (iniciativa registro-ia · Sprint 3). Admin-only.
 *
 * Setean/limpian el override del modelo por uso en `core.ai_config` — surte sin
 * redeploy (resolveModel lo lee con cache de 60s + fail-open). El catálogo de
 * usos vive en código (lib/ai/registry.ts); acá solo se overridea el modelo.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/empresas/admin-guard';
import { AI_USOS, type AiUsoId } from '@/lib/ai/registry';
import { MODELOS_POR_PROVEEDOR } from '@/lib/ai/pricing';

type Result = { ok: true } | { ok: false; error: string };

async function getClients() {
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
          // no-op — las server actions no setean cookies de Supabase aquí
        },
      },
    }
  );
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false as const, error: 'admin client unavailable' };
  const guard = await requireAdmin(userSupa, admin);
  if (!guard.ok) return { ok: false as const, error: guard.error };
  return { ok: true as const, admin, guard };
}

function esUsoValido(usoId: string): usoId is AiUsoId {
  return usoId in AI_USOS;
}

export async function setModeloOverrideAction(usoId: string, modelo: string): Promise<Result> {
  if (!esUsoValido(usoId)) return { ok: false, error: 'uso desconocido' };
  // El override solo puede apuntar a un modelo del mismo proveedor que el uso.
  const permitidos = MODELOS_POR_PROVEEDOR[AI_USOS[usoId].proveedor];
  if (!permitidos.includes(modelo)) {
    return { ok: false, error: 'modelo no permitido para el proveedor de este uso' };
  }
  const c = await getClients();
  if (!c.ok) return { ok: false, error: c.error };
  const { error } = await (
    c.admin.schema('core') as unknown as {
      from: (t: string) => {
        upsert: (
          row: Record<string, unknown>,
          opts: { onConflict: string }
        ) => Promise<{ error: { message: string } | null }>;
      };
    }
  )
    .from('ai_config')
    .upsert(
      {
        uso_id: usoId,
        modelo,
        actualizado_por: c.guard.usuario.id,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: 'uso_id' }
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/ia');
  return { ok: true };
}

export async function clearModeloOverrideAction(usoId: string): Promise<Result> {
  if (!esUsoValido(usoId)) return { ok: false, error: 'uso desconocido' };
  const c = await getClients();
  if (!c.ok) return { ok: false, error: c.error };
  const { error } = await (
    c.admin.schema('core') as unknown as {
      from: (t: string) => {
        delete: () => {
          eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    }
  )
    .from('ai_config')
    .delete()
    .eq('uso_id', usoId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/ia');
  return { ok: true };
}
