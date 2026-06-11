'use server';

// Next.js requires `'use server'` modules to export only async functions —
// los tipos compartidos con el cliente viven en ./types.ts.

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { assertNotInPreview } from '@/lib/auth/preview-guard';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { checksumDiff, periodoDia1, TOLERANCIA } from '@/components/dilesa/estados-cuenta-utils';
import type { ActionResult, GuardarEstadoCuentaInput } from './types';

function parseMonto(v: string | undefined, campo: string): number | { error: string } {
  if (v == null || v.trim() === '') return { error: `Falta ${campo}.` };
  const n = Number(v);
  if (!Number.isFinite(n)) return { error: `${campo} debe ser un número válido.` };
  return n;
}

function parseConteo(v: string | undefined): number | null {
  if (v == null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * Guarda (alta o re-captura) el estado de cuenta mensual de una cuenta
 * bancaria DILESA en `erp.estados_cuenta`.
 *
 * - Valida el checksum interno (SI + depósitos − retiros = SF ± $0.01) y
 *   rechaza si no cuadra: los bancos reportan la carátula exacta; un
 *   descuadre aquí siempre es error de captura/extracción.
 * - Upsert por (cuenta_id, periodo): re-subir el mismo mes reemplaza la
 *   fila (updated_at marca la re-captura; `extraccion` guarda el payload
 *   IA más reciente para audit).
 * - `assertNotInPreview()` bloquea en modo "Viendo como" (read-only).
 */
export async function guardarEstadoCuenta(input: GuardarEstadoCuentaInput): Promise<ActionResult> {
  await assertNotInPreview();

  const cuentaId = input.cuentaId?.trim();
  if (!cuentaId) return { ok: false, error: 'Elige la cuenta bancaria.' };

  const periodoRaw = input.periodo?.trim();
  if (!periodoRaw || !/^\d{4}-\d{2}/.test(periodoRaw)) {
    return { ok: false, error: 'Indica el mes del periodo (YYYY-MM).' };
  }
  const periodo = periodoDia1(periodoRaw);

  const fechaCorte = input.fechaCorte?.trim();
  if (!fechaCorte || !/^\d{4}-\d{2}-\d{2}$/.test(fechaCorte)) {
    return { ok: false, error: 'Indica la fecha de corte (YYYY-MM-DD).' };
  }

  const montos = {
    saldoInicial: parseMonto(input.saldoInicial, 'el saldo inicial'),
    depositos: parseMonto(input.depositos, 'el total de depósitos'),
    retiros: parseMonto(input.retiros, 'el total de retiros'),
    saldoFinal: parseMonto(input.saldoFinal, 'el saldo final'),
    saldoInversiones: parseMonto(input.saldoInversiones ?? '0', 'el saldo en inversiones'),
  };
  for (const v of Object.values(montos)) {
    if (typeof v === 'object') return { ok: false, error: v.error };
  }
  const saldoInicial = montos.saldoInicial as number;
  const depositos = montos.depositos as number;
  const retiros = montos.retiros as number;
  const saldoFinal = montos.saldoFinal as number;
  const saldoInversiones = montos.saldoInversiones as number;

  const diff = checksumDiff({ saldoInicial, depositos, retiros, saldoFinal });
  if (Math.abs(diff) > TOLERANCIA) {
    return {
      ok: false,
      error:
        `No cuadra la carátula: saldo inicial + depósitos − retiros difiere del saldo final ` +
        `por $${diff.toFixed(2)}. Revisa los montos contra el PDF.`,
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'No autenticado. Vuelve a iniciar sesión.' };
  }

  const notas = input.notas?.trim();
  const archivoPath = input.archivoPath?.trim();

  const row = {
    empresa_id: DILESA_EMPRESA_ID,
    cuenta_id: cuentaId,
    periodo,
    fecha_corte: fechaCorte,
    saldo_inicial: saldoInicial,
    depositos,
    retiros,
    saldo_final: saldoFinal,
    saldo_inversiones: saldoInversiones,
    num_abonos: parseConteo(input.numAbonos),
    num_cargos: parseConteo(input.numCargos),
    comisiones: input.comisiones?.trim() ? Number(input.comisiones) : null,
    archivo_path: archivoPath && archivoPath.length > 0 ? archivoPath : null,
    extraccion: input.extraccion ?? null,
    notas: notas && notas.length > 0 ? notas : null,
    capturado_por: user.id,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .schema('erp')
    .from('estados_cuenta')
    .upsert(row, { onConflict: 'cuenta_id,periodo' });

  if (error) {
    return {
      ok: false,
      error: getSupabaseErrorMessage(error, 'No se pudo guardar el estado de cuenta.'),
    };
  }

  revalidatePath('/dilesa/saldos-bancos/estados');
  return { ok: true };
}
