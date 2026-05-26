/**
 * log.ts — escritura a `core.notification_log` post-envío.
 *
 * Iniciativa notificaciones-catalogo · Sprint 1. Cada handler debe llamar
 * `writeNotificationLog` después de enviar (o intentar enviar) un email,
 * con el resultado real. Esto alimenta la UI de catálogo (Sprint 3) y
 * permite responder "¿cuándo fue el último envío exitoso?", "¿qué
 * recipientes recibieron?", "¿qué falló esta semana?".
 *
 * Diseño:
 *  - FAIL-OPEN: si la escritura falla (DB caída, RLS, etc.), NO tira
 *    excepción — solo logea. El email ya se mandó; perder el log es
 *    menos malo que romper el handler entero.
 *  - Una sola función para los 3 estatus (sent/failed/skipped) para que el
 *    handler no tenga que pensar cuál escribir según el caso.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type LogStatus = 'sent' | 'failed' | 'skipped';

export type LogRecipients = {
  to: string[];
  cc?: string[];
  bcc?: string[];
};

export type WriteLogInput = {
  /** ID de la definition que se intentó usar. NULL si no hay (fail-open). */
  definitionId: string | null;
  /** Contexto de empresa del envío (puede diferir de def.empresa_id). */
  empresaId?: string | null;
  status: LogStatus;
  recipients: LogRecipients;
  subject?: string | null;
  /** ID que Resend devuelve en 200 OK. */
  resendId?: string | null;
  /** Solo para status=failed. */
  errorMessage?: string | null;
  /** ID del user que disparó (server actions). NULL si cron sin sesión. */
  triggeredByUserId?: string | null;
  /** JSON libre con IDs/data del envío para drill-down (junta_id, etc.). */
  context?: Record<string, unknown>;
};

/**
 * Escribe una fila en `core.notification_log`. Fail-open: errores se logean
 * a stderr pero no bubble up — el handler que envió el email NO debe
 * fallar porque la traza no se pudo guardar.
 */
export async function writeNotificationLog(
  sb: SupabaseClient,
  input: WriteLogInput
): Promise<void> {
  const { error } = await sb
    .schema('core')
    .from('notification_log')
    .insert({
      definition_id: input.definitionId,
      empresa_id: input.empresaId ?? null,
      status: input.status,
      recipients: input.recipients,
      subject: input.subject ?? null,
      resend_id: input.resendId ?? null,
      error_message: input.errorMessage ?? null,
      triggered_by_user_id: input.triggeredByUserId ?? null,
      context: input.context ?? {},
    });

  if (error) {
    // Log to stderr — el email ya se mandó, esto es solo trazabilidad.
    console.error('[notifications] writeNotificationLog falló:', error.message);
  }
}
