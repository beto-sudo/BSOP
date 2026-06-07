'use server';

// Next.js requires `'use server'` modules to export only async functions —
// los tipos compartidos con el cliente viven en ./types.ts.

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { assertNotInPreview } from '@/lib/auth/preview-guard';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import type { ActionResult, CapturarSaldoInput } from './types';

/**
 * Registra un snapshot de saldo de una cuenta bancaria DILESA.
 *
 * Apila un row en `erp.cuenta_saldos` (no edita el anterior — audit trail,
 * ver iniciativa `tesoreria`). La vista `erp.v_cuenta_saldo_actual` deriva
 * automáticamente el último saldo por cuenta (DISTINCT ON), que es lo que
 * consume el correo diario al Consejo (`dilesa-resumen-consejo`, bloque #1).
 *
 * - `assertNotInPreview()` bloquea la mutación cuando un admin está en modo
 *   "Viendo como" (contrato read-only de `viendo-como-readonly`).
 * - `capturado_por` se resuelve del usuario autenticado (no se confía en el
 *   cliente). `empresa_id` se fija a DILESA (golden D1).
 * - El saldo llega como string desde el form para no perder precisión; se
 *   convierte a number aquí tras validar que sea finito.
 */
export async function capturarSaldo(input: CapturarSaldoInput): Promise<ActionResult> {
  await assertNotInPreview();

  const cuentaId = input.cuentaId?.trim();
  if (!cuentaId) {
    return { ok: false, error: 'Falta la cuenta a capturar.' };
  }

  const fecha = input.fecha?.trim();
  if (!fecha) {
    return { ok: false, error: 'Indica la fecha del saldo.' };
  }

  const saldo = Number(input.saldo);
  if (!Number.isFinite(saldo)) {
    return { ok: false, error: 'El saldo debe ser un número válido.' };
  }

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'No autenticado. Vuelve a iniciar sesión.' };
  }

  const notas = input.notas?.trim();

  const { error } = await supabase
    .schema('erp')
    .from('cuenta_saldos')
    .insert({
      empresa_id: DILESA_EMPRESA_ID,
      cuenta_id: cuentaId,
      fecha,
      // numeric en Postgres acepta number; el valor ya pasó por el form con
      // step=0.01, así que mantiene 2 decimales sin float drift relevante.
      saldo,
      capturado_por: user.id,
      notas: notas && notas.length > 0 ? notas : null,
    });

  if (error) {
    return { ok: false, error: getSupabaseErrorMessage(error, 'No se pudo registrar el saldo.') };
  }

  revalidatePath('/dilesa/saldos-bancos');
  return { ok: true };
}
