'use server';

// Next.js requires `'use server'` modules to export only async functions —
// constants, types and helpers live in ./types.ts.

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import type { Json } from '@/types/supabase';
import {
  RDB_EMPRESA_ID,
  type ActionResult,
  type CrearLevantamientoInput,
  type FirmarPasoData,
  type FirmarPasoInput,
  type LineaParaCapturar,
  type LineaParaRevisar,
} from './types';

// ─── Crear ────────────────────────────────────────────────────────────────────

export async function crearLevantamiento(
  input: CrearLevantamientoInput
): Promise<ActionResult<{ id: string; folio: string | null }>> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return { ok: false, error: 'No autenticado. Vuelve a iniciar sesión.' };
  }

  const { data, error } = await supabase
    .schema('erp')
    .from('inventario_levantamientos')
    .insert({
      empresa_id: RDB_EMPRESA_ID,
      almacen_id: input.almacen_id,
      fecha_programada: input.fecha_programada,
      notas: input.notas?.trim() || null,
      tolerancia_pct_override: input.tolerancia_pct_override ?? null,
      tolerancia_monto_override: input.tolerancia_monto_override ?? null,
      tipo: input.tipo ?? 'fisico',
      created_by: session.user.id,
    })
    .select('id, folio')
    .single();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Sin datos de respuesta al crear levantamiento.' };

  revalidatePath('/rdb/inventario/levantamientos');
  return { ok: true, data: { id: data.id, folio: data.folio } };
}

// ─── Captura: iniciar / guardar conteo / cerrar ───────────────────────────────

export async function iniciarCaptura(
  levantamiento_id: string
): Promise<ActionResult<{ lineasSembradas: number }>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .schema('erp')
    .rpc('fn_iniciar_captura_levantamiento', { p_levantamiento_id: levantamiento_id });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/rdb/inventario/levantamientos');
  revalidatePath(`/rdb/inventario/levantamientos/${levantamiento_id}`);
  return { ok: true, data: { lineasSembradas: data ?? 0 } };
}

export async function guardarConteo(
  levantamiento_id: string,
  producto_id: string,
  cantidad: number
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.schema('erp').rpc('fn_guardar_conteo', {
    p_levantamiento_id: levantamiento_id,
    p_producto_id: producto_id,
    p_cantidad: cantidad,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function cerrarCaptura(levantamiento_id: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .schema('erp')
    .rpc('fn_cerrar_captura_levantamiento', { p_levantamiento_id: levantamiento_id });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/rdb/inventario/levantamientos');
  revalidatePath(`/rdb/inventario/levantamientos/${levantamiento_id}`);
  return { ok: true };
}

// ─── Firma ────────────────────────────────────────────────────────────────────

export async function firmarPaso(input: FirmarPasoInput): Promise<ActionResult<FirmarPasoData>> {
  const supabase = await createSupabaseServerClient();
  const hdrs = await headers();
  const ipHeader =
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? hdrs.get('x-real-ip') ?? null;
  const userAgent = hdrs.get('user-agent') ?? undefined;

  const { data, error } = await supabase.schema('erp').rpc('fn_firmar_levantamiento', {
    p_levantamiento_id: input.levantamiento_id,
    p_paso: input.paso,
    p_rol: input.rol,
    p_comentario: input.comentario,
    p_ip: ipHeader ?? undefined,
    p_user_agent: userAgent,
  });

  if (error) return { ok: false, error: error.message };

  const parsed = parseFirmarPasoResult(data);
  if (!parsed) {
    return { ok: false, error: 'Respuesta inesperada al firmar levantamiento.' };
  }

  revalidatePath('/rdb/inventario/levantamientos');
  revalidatePath(`/rdb/inventario/levantamientos/${input.levantamiento_id}`);
  return { ok: true, data: parsed };
}

function parseFirmarPasoResult(raw: Json | null): FirmarPasoData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const firmas_actuales = Number(obj.firmas_actuales);
  const firmas_requeridas = Number(obj.firmas_requeridas);
  const aplicado = Boolean(obj.aplicado);
  const movimientos_generados = Number(obj.movimientos_generados ?? 0);
  if (!Number.isFinite(firmas_actuales) || !Number.isFinite(firmas_requeridas)) {
    return null;
  }
  return { firmas_actuales, firmas_requeridas, aplicado, movimientos_generados };
}

// ─── Cancelar ─────────────────────────────────────────────────────────────────

export async function cancelarLevantamiento(
  levantamiento_id: string,
  motivo: string
): Promise<ActionResult> {
  const motivoTrim = motivo.trim();
  if (!motivoTrim) {
    return { ok: false, error: 'El motivo de cancelación es requerido.' };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.schema('erp').rpc('fn_cancelar_levantamiento', {
    p_levantamiento_id: levantamiento_id,
    p_motivo: motivoTrim,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/rdb/inventario/levantamientos');
  revalidatePath(`/rdb/inventario/levantamientos/${levantamiento_id}`);
  return { ok: true };
}

// ─── Lecturas (RPC, RLS-safe) ─────────────────────────────────────────────────

export async function getLineasParaCapturar(
  levantamiento_id: string
): Promise<ActionResult<LineaParaCapturar[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .schema('erp')
    .rpc('fn_get_lineas_para_capturar', { p_levantamiento_id: levantamiento_id });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as LineaParaCapturar[] };
}

export async function getLineasParaRevisar(
  levantamiento_id: string
): Promise<ActionResult<LineaParaRevisar[]>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .schema('erp')
    .rpc('fn_get_lineas_para_revisar', { p_levantamiento_id: levantamiento_id });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as LineaParaRevisar[] };
}
