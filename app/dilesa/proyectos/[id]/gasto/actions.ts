'use server';

/**
 * Server actions del gobierno presupuestal (tab Gasto del proyecto).
 * Iniciativa `dilesa-presupuesto-baseline` · Sprint 2.
 *
 * Las mutaciones de montos viven en RPCs de DB con gate Dirección propio
 * (`erp.fn_es_direccion`) + `core.audit_log` (S1). Estas actions agregan la
 * validación temprana con `checkDireccionEmpresa` (error claro antes de
 * llegar a la RPC) y el INSERT/cancelación de solicitudes (que no requieren
 * Dirección — cualquier miembro con write solicita; Dirección resuelve).
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { checkDireccionEmpresa } from '@/lib/auth/direccion-gate';
import {
  CATEGORIAS,
  type OrdenCambioCategoria,
  type OrdenCambioTipo,
} from '@/lib/presupuesto/ordenes-cambio';

type SimpleResult = { ok: true } | { ok: false; error: string };

async function makeServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // no-op
        },
      },
    }
  );
}

function revalidateGasto(proyectoId: string) {
  revalidatePath(`/dilesa/proyectos/${proyectoId}/gasto`);
}

/**
 * Congela el presupuesto inicial del proyecto via RPC
 * `erp.fn_presupuesto_baseline_autorizar`. Gate Dirección (action + RPC).
 */
export async function autorizarBaseline(
  proyectoId: string,
  notas?: string | null
): Promise<{ ok: true; baselineId: string } | { ok: false; error: string }> {
  if (!proyectoId) return { ok: false, error: 'proyectoId requerido' };
  const supabase = await makeServerClient();

  const { data: proyecto, error: pErr } = await supabase
    .schema('dilesa')
    .from('proyectos')
    .select('id, empresa_id')
    .eq('id', proyectoId)
    .maybeSingle();
  if (pErr) return { ok: false, error: pErr.message };
  if (!proyecto) return { ok: false, error: 'Proyecto no encontrado' };

  const gate = await checkDireccionEmpresa(supabase, proyecto.empresa_id);
  if (!gate.ok) return gate;
  if (!gate.autorizado) {
    return { ok: false, error: 'Solo Dirección puede autorizar el presupuesto inicial.' };
  }

  const { data, error } = await supabase
    .schema('erp')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .rpc('fn_presupuesto_baseline_autorizar' as any, {
      p_proyecto_id: proyectoId,
      p_notas: notas?.trim() || null,
    });
  if (error) {
    return { ok: false, error: error.message || 'No se pudo autorizar el presupuesto inicial.' };
  }

  revalidateGasto(proyectoId);
  return { ok: true, baselineId: data as string };
}

export type SolicitarCambioInput = {
  proyectoId: string;
  partidaId: string;
  tipo: OrdenCambioTipo;
  monto: number;
  categoria: OrdenCambioCategoria;
  motivo: string;
};

/**
 * Crea una orden de cambio en estado `solicitada`. No requiere Dirección —
 * el trigger de DB valida integridad (partida activa del proyecto, proyecto
 * con baseline) y la resolución sí queda gateada a Dirección.
 */
export async function solicitarCambio(
  input: SolicitarCambioInput
): Promise<{ ok: true; cambioId: string } | { ok: false; error: string }> {
  const { proyectoId, partidaId, tipo, monto, categoria, motivo } = input;
  if (!proyectoId || !partidaId) return { ok: false, error: 'proyecto y partida requeridos' };
  if (tipo !== 'aditiva' && tipo !== 'deductiva') {
    return { ok: false, error: `Tipo inválido: ${tipo}` };
  }
  if (!Number.isFinite(monto) || monto <= 0) {
    return { ok: false, error: 'El monto del cambio debe ser mayor a 0.' };
  }
  if (!CATEGORIAS.includes(categoria)) {
    return { ok: false, error: `Categoría inválida: ${categoria}` };
  }
  if (!motivo || motivo.trim().length === 0) {
    return { ok: false, error: 'El motivo es obligatorio — es el expediente de la decisión.' };
  }

  const supabase = await makeServerClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes?.user) return { ok: false, error: 'No autenticado' };

  const { data: partida, error: paErr } = await supabase
    .schema('erp')
    .from('presupuesto_partidas')
    .select('id, empresa_id, proyecto_id')
    .eq('id', partidaId)
    .is('deleted_at', null)
    .maybeSingle();
  if (paErr) return { ok: false, error: paErr.message };
  if (!partida || partida.proyecto_id !== proyectoId) {
    return { ok: false, error: 'La partida no existe o no pertenece al proyecto.' };
  }

  const { data, error } = await supabase
    .schema('erp')
    .from('presupuesto_cambios')
    .insert({
      empresa_id: partida.empresa_id,
      proyecto_id: proyectoId,
      partida_id: partidaId,
      tipo,
      monto_delta: monto,
      motivo_categoria: categoria,
      motivo: motivo.trim(),
      solicitado_por: userRes.user.id,
    })
    .select('id')
    .single();
  if (error) {
    return { ok: false, error: error.message || 'No se pudo crear la orden de cambio.' };
  }

  revalidateGasto(proyectoId);
  return { ok: true, cambioId: (data as { id: string }).id };
}

/**
 * Resuelve una orden (autorizada | rechazada) via RPC
 * `erp.fn_presupuesto_cambio_resolver`. Gate Dirección (action + RPC).
 * El rechazo exige motivo (la RPC también lo valida).
 */
export async function resolverCambio(
  cambioId: string,
  decision: 'autorizada' | 'rechazada',
  motivoRechazo?: string | null
): Promise<SimpleResult> {
  if (!cambioId) return { ok: false, error: 'cambioId requerido' };
  if (decision !== 'autorizada' && decision !== 'rechazada') {
    return { ok: false, error: `Decisión inválida: ${decision}` };
  }
  if (decision === 'rechazada' && !motivoRechazo?.trim()) {
    return { ok: false, error: 'El rechazo requiere motivo.' };
  }

  const supabase = await makeServerClient();

  const { data: cambio, error: cErr } = await supabase
    .schema('erp')
    .from('presupuesto_cambios')
    .select('id, empresa_id, proyecto_id')
    .eq('id', cambioId)
    .maybeSingle();
  if (cErr) return { ok: false, error: cErr.message };
  if (!cambio) return { ok: false, error: 'Orden de cambio no encontrada' };

  const gate = await checkDireccionEmpresa(supabase, cambio.empresa_id);
  if (!gate.ok) return gate;
  if (!gate.autorizado) {
    return { ok: false, error: 'Solo Dirección puede resolver órdenes de cambio.' };
  }

  const { error } = await supabase
    .schema('erp')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .rpc('fn_presupuesto_cambio_resolver' as any, {
      p_cambio_id: cambioId,
      p_decision: decision,
      p_motivo_rechazo: motivoRechazo?.trim() || null,
    });
  if (error) {
    return { ok: false, error: error.message || 'No se pudo resolver la orden de cambio.' };
  }

  revalidateGasto(cambio.proyecto_id);
  return { ok: true };
}

/**
 * Retira una solicitud propia (estado → `cancelada`). El trigger de DB
 * garantiza que solo aplica sobre órdenes `solicitada`.
 */
export async function cancelarCambio(cambioId: string): Promise<SimpleResult> {
  if (!cambioId) return { ok: false, error: 'cambioId requerido' };
  const supabase = await makeServerClient();

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes?.user) return { ok: false, error: 'No autenticado' };

  const { data, error } = await supabase
    .schema('erp')
    .from('presupuesto_cambios')
    .update({
      estado: 'cancelada',
      cancelada_at: new Date().toISOString(),
      cancelada_por: userRes.user.id,
    })
    .eq('id', cambioId)
    .eq('estado', 'solicitada')
    .select('proyecto_id')
    .maybeSingle();
  if (error) return { ok: false, error: error.message || 'No se pudo cancelar la solicitud.' };
  if (!data) return { ok: false, error: 'La orden ya no está en estado solicitada.' };

  revalidateGasto((data as { proyecto_id: string }).proyecto_id);
  return { ok: true };
}
