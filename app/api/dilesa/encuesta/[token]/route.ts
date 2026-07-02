/**
 * POST /api/dilesa/encuesta/[token] — el cliente envía sus respuestas de la
 * Encuesta de Conformidad (Fase 16) desde el magic link. **Sin login.**
 *
 * 1. Verifica el token (HMAC + expiración + purpose='encuesta_posventa_v1').
 * 2. Valida las respuestas (NPS 0-10, calificaciones 1-5, comentario opt).
 * 3. Guarda en dilesa.venta_encuestas (estado='respondida').
 * 4. Cierra la Fase 16 (INSERT venta_fases pos 16 + sync fase_actual) si no
 *    estaba cerrada — responder la encuesta ES el cierre de la fase.
 *
 * Iniciativa `dilesa-ventas-expediente` · S5 final.
 */
import { NextResponse } from 'next/server';
import { verifyEncuestaToken } from '@/lib/dilesa/encuesta-token';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { nombreFase } from '@/lib/dilesa/fases';
import { hoyISOMatamoros } from '@/lib/fecha-mx';

const FASE_POSICION = 16;
const FASE_NOMBRE = nombreFase(FASE_POSICION);

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verify = await verifyEncuestaToken(token);
  if (!verify.ok) {
    const msg = verify.error === 'expired' ? 'La liga expiró.' : 'Liga inválida.';
    return NextResponse.json({ ok: false, error: msg }, { status: 401 });
  }
  const ventaId = verify.payload.ventaId;

  const body = (await req.json().catch(() => null)) as {
    nps?: number;
    calif_vivienda?: number;
    calif_proceso?: number;
    comentario?: string | null;
  } | null;

  const entero = (n: unknown, min: number, max: number): number | null =>
    typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max ? n : null;

  const nps = entero(body?.nps, 0, 10);
  const califVivienda = entero(body?.calif_vivienda, 1, 5);
  const califProceso = entero(body?.calif_proceso, 1, 5);
  if (nps == null || califVivienda == null || califProceso == null) {
    return NextResponse.json(
      { ok: false, error: 'Responde las 3 calificaciones (NPS 0-10 y estrellas 1-5).' },
      { status: 400 }
    );
  }
  const comentario =
    typeof body?.comentario === 'string' ? body.comentario.trim().slice(0, 4000) || null : null;

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Configuración incompleta.' }, { status: 500 });
  }

  // La encuesta debe existir (el trigger de F15 la crea). Si no, la creamos
  // defensivamente — el token firmado ya prueba que la venta es legítima.
  const { data: encuesta } = await admin
    .schema('dilesa')
    .from('venta_encuestas')
    .select('id, respondida_at')
    .eq('venta_id', ventaId)
    .maybeSingle();

  if (encuesta?.respondida_at) {
    return NextResponse.json({ ok: true, already: true });
  }

  const respuestas = {
    estado: 'respondida',
    canal: 'email',
    nps,
    calif_vivienda: califVivienda,
    calif_proceso: califProceso,
    comentario,
    respondida_at: new Date().toISOString(),
  };

  if (encuesta) {
    const { error: upErr } = await admin
      .schema('dilesa')
      .from('venta_encuestas')
      .update(respuestas)
      .eq('id', encuesta.id);
    if (upErr) {
      return NextResponse.json({ ok: false, error: 'No se pudo guardar.' }, { status: 500 });
    }
  } else {
    const { error: insErr } = await admin
      .schema('dilesa')
      .from('venta_encuestas')
      .insert({
        empresa_id: DILESA_EMPRESA_ID,
        venta_id: ventaId,
        programada_para: hoyISOMatamoros(),
        ...respuestas,
      });
    if (insErr) {
      return NextResponse.json({ ok: false, error: 'No se pudo guardar.' }, { status: 500 });
    }
  }

  // Cerrar Fase 16 si no está cerrada (idempotente por re-respuestas).
  const { data: fase16 } = await admin
    .schema('dilesa')
    .from('venta_fases')
    .select('id')
    .eq('venta_id', ventaId)
    .eq('posicion', FASE_POSICION)
    .is('deleted_at', null)
    .maybeSingle();

  if (!fase16) {
    await admin.schema('dilesa').from('venta_fases').insert({
      empresa_id: DILESA_EMPRESA_ID,
      venta_id: ventaId,
      fase: FASE_NOMBRE,
      posicion: FASE_POSICION,
      fecha: hoyISOMatamoros(),
      registrado_por: null,
      notas: 'Encuesta respondida por el cliente (magic link).',
    });

    // Sync del caché fase_actual/posicion — solo avanza, nunca retrocede.
    const { data: venta } = await admin
      .schema('dilesa')
      .from('ventas')
      .select('fase_posicion')
      .eq('id', ventaId)
      .maybeSingle();
    if (((venta?.fase_posicion as number | null) ?? 0) < FASE_POSICION) {
      await admin
        .schema('dilesa')
        .from('ventas')
        .update({ fase_actual: FASE_NOMBRE, fase_posicion: FASE_POSICION })
        .eq('id', ventaId);
    }
  }

  return NextResponse.json({ ok: true });
}
