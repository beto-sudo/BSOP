/**
 * registry.ts — types + lectura de `core.notification_definitions`.
 *
 * Iniciativa notificaciones-catalogo · Sprint 1. Cada handler que envía email
 * (Sprint 2 refactoriza los 6 actuales) llama `getDefinitionBySlug(slug, empresaId?)`
 * para obtener la config runtime-editable y respetar el kill switch `activo`.
 *
 * Diseño:
 *  - Una sola fila por (slug, empresa_id) gracias al UNIQUE en la migración.
 *  - empresa_id NULL = global. Lookup hace fallback: primero busca exacto por
 *    (slug, empresa_id); si no existe y empresa_id != NULL, busca (slug, NULL).
 *  - Sin caching en v1 — Supabase responde en <50ms y los handlers no son
 *    hot paths. Si en futuro pesa, cachear con Vercel Runtime Cache.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type RecipientExtraType = 'cc' | 'bcc' | 'always';

export type RecipientExtra = {
  email: string;
  type: RecipientExtraType;
};

export type TriggerType = 'cron' | 'manual' | 'webhook';

export type NotificationDefinition = {
  id: string;
  slug: string;
  empresa_id: string | null;
  nombre: string;
  descripcion: string | null;
  trigger_type: TriggerType;
  trigger_config: Record<string, unknown>;
  from_email: string;
  from_name: string | null;
  reply_to: string | null;
  recipients_extra: RecipientExtra[];
  subject_template: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

/**
 * Lee la definición runtime de un email.
 *
 * Devuelve la más específica disponible:
 *  1. Si `empresaId` != null y existe row con (slug, empresaId) → esa.
 *  2. Si no, fallback a la global (slug, NULL).
 *  3. Si tampoco → null.
 *
 * Diseñado para FAIL-OPEN: si la query falla por algo (DB lenta, RLS mal
 * configurado, etc.), el handler debe usar su config hardcoded de fallback.
 * Por eso esta función LOG-ea el error y devuelve null en lugar de tirar
 * excepción.
 */
export async function getDefinitionBySlug(
  sb: SupabaseClient,
  slug: string,
  empresaId: string | null = null
): Promise<NotificationDefinition | null> {
  // Wrap todo en try/catch — el helper está documentado FAIL-OPEN: si la query
  // falla por cualquier motivo (DB caída, RLS mal config, cliente mock sin
  // .schema() en tests), el handler debe usar config hardcoded como fallback.
  try {
    // Si nos pasan empresa, intentamos exacta primero. Si no, vamos directo a global.
    if (empresaId) {
      const { data, error } = await sb
        .schema('core')
        .from('notification_definitions')
        .select('*')
        .eq('slug', slug)
        .eq('empresa_id', empresaId)
        .maybeSingle();

      if (error) {
        console.error(`[notifications] error leyendo def per-empresa ${slug}:`, error.message);
        // Caer a global como fallback en lugar de retornar null acá.
      } else if (data) {
        return data as NotificationDefinition;
      }
    }

    // Global fallback (empresa_id IS NULL).
    const { data, error } = await sb
      .schema('core')
      .from('notification_definitions')
      .select('*')
      .eq('slug', slug)
      .is('empresa_id', null)
      .maybeSingle();

    if (error) {
      console.error(`[notifications] error leyendo def global ${slug}:`, error.message);
      return null;
    }
    return (data as NotificationDefinition | null) ?? null;
  } catch (e) {
    console.error(`[notifications] excepción leyendo def ${slug}:`, (e as Error).message);
    return null;
  }
}

/**
 * Renderiza un subject template reemplazando `{var}` con valores del map.
 * Tolerante: vars no presentes en el map se dejan literales (mejor ver
 * `{firstName}` en el subject que silenciosamente quitarlas).
 *
 *   renderSubject("Bienvenido {firstName}", {firstName: "Beto"})
 *     → "Bienvenido Beto"
 */
export function renderSubject(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const v = vars[key];
    return v === undefined ? match : String(v);
  });
}

/**
 * Agrupa los recipients_extra de la definition en arrays cc/bcc/always para
 * pasar al payload de Resend. `always` se suma al `to` principal.
 */
export function splitRecipientsExtra(extras: RecipientExtra[]): {
  to: string[];
  cc: string[];
  bcc: string[];
} {
  const to: string[] = [];
  const cc: string[] = [];
  const bcc: string[] = [];
  for (const r of extras) {
    if (r.type === 'always') to.push(r.email);
    else if (r.type === 'cc') cc.push(r.email);
    else if (r.type === 'bcc') bcc.push(r.email);
  }
  return { to, cc, bcc };
}
