'use server';

/**
 * Server actions del módulo Arrendamiento (DILESA). Iniciativa `arrendamiento`
 * · Sprint 1e. El alta llama la RPC atómica `erp.arrendamiento_alta` (S1c). El
 * gate (admin global o Dirección DILESA) se aplica aquí; la UI solo muestra el
 * botón a esos roles.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { getEffectiveUser } from '@/lib/auth/effective-user';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import type { Database, Json } from '@/types/supabase';

type Result = { ok: true; id: string } | { ok: false; error: string };

async function getActionClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
}

async function puedeAdministrar(
  supabase: Awaited<ReturnType<typeof getActionClient>>
): Promise<boolean> {
  const eu = await getEffectiveUser(supabase);
  if (!eu) return false;
  return eu.isAdmin === true || (eu.direccionEmpresaIds ?? []).includes(DILESA_EMPRESA_ID);
}

export type ArrendamientoLineaInput = {
  activo_id: string;
  tipo_operacion_fiscal?: string;
  renta_subtotal: number;
  regimen_iva?: string;
  iva_tasa_pct?: number;
  vigencia_inicio?: string | null;
  vigencia_fin?: string | null;
  estado?: string;
};

/**
 * Alta de un contrato de arrendamiento (master + líneas + periodo inicial) vía
 * la RPC atómica. Devuelve el id creado para que el caller navegue/refresque.
 */
export async function crearArrendamiento(
  master: Record<string, unknown>,
  lineas: ArrendamientoLineaInput[]
): Promise<Result> {
  if (!String(master.arrendatario_persona_id ?? '').trim()) {
    return { ok: false, error: 'El arrendatario es obligatorio.' };
  }
  if (!lineas.length) {
    return { ok: false, error: 'Agrega al menos un espacio rentado.' };
  }
  for (const l of lineas) {
    if (!l.activo_id) return { ok: false, error: 'Cada espacio necesita un activo.' };
    if (!(l.renta_subtotal > 0))
      return { ok: false, error: 'La renta de cada espacio debe ser mayor a 0.' };
  }

  const supabase = await getActionClient();
  if (!(await puedeAdministrar(supabase))) {
    return { ok: false, error: 'Solo Dirección o un administrador puede dar de alta contratos.' };
  }

  const { data, error } = await supabase.schema('erp').rpc('arrendamiento_alta', {
    p_empresa_id: DILESA_EMPRESA_ID,
    p_master: master as unknown as Json,
    p_lineas: lineas as unknown as Json,
  });
  if (error) {
    return { ok: false, error: getSupabaseErrorMessage(error, 'No se pudo crear el contrato.') };
  }

  revalidatePath('/dilesa/arrendamiento');
  return { ok: true, id: data as string };
}

type GenerarResult = { ok: true; creados: number } | { ok: false; error: string };

/**
 * Genera los cargos de renta de un periodo (formato 'YYYYMM') para todos los
 * contratos vigentes vía la RPC `erp.arrendamiento_generar_cargos` (S2a). Es
 * idempotente: re-correr el mismo periodo no duplica cargos. Devuelve cuántos
 * cargos nuevos creó.
 */
export async function generarCargosDelMes(periodo: string): Promise<GenerarResult> {
  const p = (periodo ?? '').trim();
  if (!/^\d{6}$/.test(p)) {
    return { ok: false, error: 'El periodo debe tener formato YYYYMM (ej. 202606).' };
  }

  const supabase = await getActionClient();
  if (!(await puedeAdministrar(supabase))) {
    return { ok: false, error: 'Solo Dirección o un administrador puede generar cargos.' };
  }

  const { data, error } = await supabase.schema('erp').rpc('arrendamiento_generar_cargos', {
    p_empresa_id: DILESA_EMPRESA_ID,
    p_periodo: p,
  });
  if (error) {
    return {
      ok: false,
      error: getSupabaseErrorMessage(error, 'No se pudieron generar los cargos.'),
    };
  }

  revalidatePath('/dilesa/arrendamiento');
  return { ok: true, creados: (data as number | null) ?? 0 };
}

export type RegistrarPagoInput = {
  persona_id: string;
  arrendamiento_id: string;
  monto: number;
  periodo?: string | null;
  fecha?: string | null;
  forma_pago?: string | null;
  referencia?: string | null;
  uuid_sat?: string | null;
  notas?: string | null;
};

type PagoResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Registra un abono de renta vía `erp.arrendamiento_pago_registrar` (S2a). Con
 * `periodo` aplica dirigido a ese cargo; sin él, aplica al saldo más antiguo
 * (auto-aplicar). Devuelve el id del pago creado.
 */
export async function registrarPagoRenta(input: RegistrarPagoInput): Promise<PagoResult> {
  if (!input.persona_id || !input.arrendamiento_id) {
    return { ok: false, error: 'Falta el contrato o el arrendatario del pago.' };
  }
  if (!(input.monto > 0)) {
    return { ok: false, error: 'El monto del pago debe ser mayor a 0.' };
  }
  const periodo = (input.periodo ?? '').trim();
  if (periodo && !/^\d{6}$/.test(periodo)) {
    return { ok: false, error: 'El periodo debe tener formato YYYYMM (ej. 202606).' };
  }

  const supabase = await getActionClient();
  if (!(await puedeAdministrar(supabase))) {
    return { ok: false, error: 'Solo Dirección o un administrador puede registrar pagos.' };
  }

  const { data, error } = await supabase.schema('erp').rpc('arrendamiento_pago_registrar', {
    p_empresa_id: DILESA_EMPRESA_ID,
    p_persona_id: input.persona_id,
    p_arrendamiento_id: input.arrendamiento_id,
    p_monto: input.monto,
    p_periodo: periodo || undefined,
    p_fecha: input.fecha?.trim() || undefined,
    p_forma_pago: input.forma_pago?.trim() || undefined,
    p_referencia: input.referencia?.trim() || undefined,
    p_uuid_sat: input.uuid_sat?.trim() || undefined,
    p_notas: input.notas?.trim() || undefined,
  });
  if (error) {
    return { ok: false, error: getSupabaseErrorMessage(error, 'No se pudo registrar el pago.') };
  }

  revalidatePath('/dilesa/arrendamiento');
  return { ok: true, id: data as string };
}
