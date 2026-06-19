/**
 * Log de uso/costo de IA (iniciativa registro-ia, Sprint 2).
 *
 * Cada invocación de los wrappers (`runGenerateObject`/`runEmbed`) registra una
 * fila en `core.ai_invocaciones`. FAIL-OPEN absoluto: el log nunca debe tumbar
 * una extracción — si no hay service role (ej. browser) o el insert falla (ej.
 * la tabla aún no está en prod), se ignora en silencio.
 */

import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { estimarCostoUsd } from './pricing';
import { AI_USOS, type AiUsoId } from './registry';

export async function logInvocacion(opts: {
  usoId: AiUsoId;
  modelo: string;
  tokensIn: number;
  tokensOut: number;
  exito: boolean;
  error?: string | null;
  duracionMs: number;
}): Promise<void> {
  try {
    const admin = getSupabaseAdminClient();
    if (!admin) return; // sin service role → no se loggea (no rompe nada)
    const uso = AI_USOS[opts.usoId];
    // core.ai_invocaciones no está en los tipos generados hasta aplicar la
    // migración del Sprint 2 a prod → cast. El catch de abajo cubre el caso de
    // que la tabla todavía no exista (deploy del código antes de la migración).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin.schema('core') as any).from('ai_invocaciones').insert({
      uso_id: opts.usoId,
      modelo: opts.modelo,
      proveedor: uso.proveedor,
      empresa: uso.empresa,
      tokens_in: Math.round(opts.tokensIn),
      tokens_out: Math.round(opts.tokensOut),
      costo_estimado_usd: estimarCostoUsd(opts.modelo, opts.tokensIn, opts.tokensOut),
      exito: opts.exito,
      error: opts.error ?? null,
      duracion_ms: Math.round(opts.duracionMs),
    });
  } catch {
    // fail-open: el log de uso nunca debe tumbar una extracción.
  }
}
