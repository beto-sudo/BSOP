/**
 * POST /api/dilesa/notario/dictamen/[token]
 *
 * Endpoint público (sin login) para que el notario suba la Carta de
 * Instrucción Notarial directo desde el magic link del email de Fase 7.
 *
 * Flujo:
 *  1. Verifica el token (HMAC + expiración + purpose='dictamen_upload_v1').
 *  2. Lee la venta + notario con admin client (sin RLS).
 *  3. Valida venta activa, Fase 7 cerrada, Fase 8 NO cerrada, y notario
 *     del token coincide con el de la venta.
 *  4. Sube el PDF a Storage con rol `carta_instruccion_notarial`.
 *  5. Persiste `fecha_dictaminada` + comentarios opcionales del notario.
 *  6. Inserta fila en `venta_fases` posición 8 + sincroniza
 *     `fase_actual`/`fase_posicion`.
 *
 * Mismo patrón que `/api/dilesa/valuador/avaluo/[token]/route.ts`.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { verifyDictamenToken } from '@/lib/dilesa/dictamen-token';
import { buildAdjuntoPath } from '@/lib/storage/path';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 4 * 1024 * 1024;

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  // ── 1. Verificar token ─────────────────────────────────────────────────
  const verify = await verifyDictamenToken(token);
  if (!verify.ok) {
    const msg =
      verify.error === 'expired'
        ? 'El enlace expiró. Solicita uno nuevo a Gerencia de Ventas.'
        : 'El enlace no es válido.';
    return NextResponse.json({ ok: false, error: msg }, { status: 401 });
  }
  const { ventaId, notarioId } = verify.payload;

  // ── 2. Parsear FormData ────────────────────────────────────────────────
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'FormData inválido' }, { status: 400 });
  }

  const fecha = (form.get('fecha') as string | null)?.trim() || null;
  const comentarios = (form.get('comentarios') as string | null)?.trim() || null;
  const archivo = form.get('archivo');
  // Opcional: Condiciones Financieras Definitivas (Anexo B) — el notario las
  // manda junto con la carta en créditos INFONAVIT.
  const archivoCondiciones = form.get('archivo_condiciones');

  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json(
      { ok: false, error: 'La fecha debe estar en formato YYYY-MM-DD.' },
      { status: 400 }
    );
  }
  if (!(archivo instanceof File)) {
    return NextResponse.json(
      { ok: false, error: 'Adjunta el PDF de la Carta de Instrucción Notarial.' },
      { status: 400 }
    );
  }
  if (archivo.size === 0) {
    return NextResponse.json({ ok: false, error: 'El archivo está vacío.' }, { status: 400 });
  }
  if (archivo.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { ok: false, error: `El archivo supera el límite de ${MAX_FILE_BYTES / 1024 / 1024}MB.` },
      { status: 413 }
    );
  }
  if (archivoCondiciones instanceof File && archivoCondiciones.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: `Las condiciones financieras superan el límite de ${MAX_FILE_BYTES / 1024 / 1024}MB.`,
      },
      { status: 413 }
    );
  }

  // ── 3. Validar venta + Fase 7 cerrada + Fase 8 NO cerrada ─────────────
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Admin client no disponible' }, { status: 500 });
  }

  const { data: venta, error: vErr } = await admin
    .schema('dilesa')
    .from('ventas')
    .select('id, estado, notario_id')
    .eq('id', ventaId)
    .is('deleted_at', null)
    .maybeSingle();
  if (vErr || !venta) {
    return NextResponse.json({ ok: false, error: 'Venta no encontrada' }, { status: 404 });
  }
  if (venta.estado !== 'activa') {
    return NextResponse.json(
      { ok: false, error: `La venta ya no está activa (${venta.estado}).` },
      { status: 409 }
    );
  }
  if (venta.notario_id !== notarioId) {
    return NextResponse.json(
      { ok: false, error: 'El enlace ya no corresponde a esta venta.' },
      { status: 409 }
    );
  }

  const { data: fases } = await admin
    .schema('dilesa')
    .from('venta_fases')
    .select('posicion')
    .eq('venta_id', ventaId)
    .is('deleted_at', null);
  const posiciones = new Set<number>((fases ?? []).map((f) => f.posicion as number));
  if (!posiciones.has(7)) {
    return NextResponse.json(
      { ok: false, error: 'La Fase 7 (Solicitud de Dictaminación) no está cerrada.' },
      { status: 409 }
    );
  }
  if (posiciones.has(8)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'El dictamen ya fue capturado para esta venta. Contacta a Gerencia de Ventas si necesitas corregir algo.',
      },
      { status: 409 }
    );
  }

  // ── 4. Subir el PDF ────────────────────────────────────────────────────
  const filename = sanitizeFilename(archivo.name);
  const path = buildAdjuntoPath({
    empresa: 'dilesa',
    entidad: 'ventas',
    entidadId: ventaId,
    filename,
  });
  const { error: upErr } = await admin.storage.from('adjuntos').upload(path, archivo, {
    contentType: archivo.type || 'application/pdf',
    upsert: false,
  });
  if (upErr) {
    console.warn('[notario-dictamen-upload] storage upload error:', upErr.message);
    return NextResponse.json(
      { ok: false, error: 'No se pudo subir el archivo. Intenta de nuevo.' },
      { status: 500 }
    );
  }

  // ── 5. Persistir adjunto + fecha ──────────────────────────────────────
  const notas = comentarios
    ? `Subido por notario. Comentarios: ${comentarios}`
    : 'Subido por notario.';
  const { error: adjErr } = await admin
    .schema('erp')
    .from('adjuntos')
    .insert({
      empresa_id: DILESA_EMPRESA_ID,
      entidad_tipo: 'venta',
      entidad_id: ventaId,
      rol: 'carta_instruccion_notarial',
      nombre: filename,
      url: path,
      tipo_mime: archivo.type || 'application/pdf',
      tamano_bytes: archivo.size,
      uploaded_by: null,
    });
  if (adjErr) {
    console.warn('[notario-dictamen-upload] adjuntos insert error:', adjErr.message);
    return NextResponse.json(
      { ok: false, error: 'Archivo subido pero no se registró. Contacta a Gerencia.' },
      { status: 500 }
    );
  }

  // Condiciones Financieras (opcional) — mismo tratamiento, rol propio.
  if (archivoCondiciones instanceof File && archivoCondiciones.size > 0) {
    const cfFilename = sanitizeFilename(archivoCondiciones.name);
    const cfPath = buildAdjuntoPath({
      empresa: 'dilesa',
      entidad: 'ventas',
      entidadId: ventaId,
      filename: cfFilename,
    });
    const { error: cfUpErr } = await admin.storage
      .from('adjuntos')
      .upload(cfPath, archivoCondiciones, {
        contentType: archivoCondiciones.type || 'application/pdf',
        upsert: false,
      });
    if (cfUpErr) {
      console.warn('[notario-dictamen-upload] condiciones storage error:', cfUpErr.message);
      return NextResponse.json(
        { ok: false, error: 'No se pudieron subir las condiciones financieras. Intenta de nuevo.' },
        { status: 500 }
      );
    }
    const { error: cfAdjErr } = await admin
      .schema('erp')
      .from('adjuntos')
      .insert({
        empresa_id: DILESA_EMPRESA_ID,
        entidad_tipo: 'venta',
        entidad_id: ventaId,
        rol: 'condiciones_financieras',
        nombre: cfFilename,
        url: cfPath,
        tipo_mime: archivoCondiciones.type || 'application/pdf',
        tamano_bytes: archivoCondiciones.size,
        uploaded_by: null,
      });
    if (cfAdjErr) {
      console.warn('[notario-dictamen-upload] condiciones insert error:', cfAdjErr.message);
      return NextResponse.json(
        { ok: false, error: 'Condiciones subidas pero no registradas. Contacta a Gerencia.' },
        { status: 500 }
      );
    }
  }

  // ADR-048: el magic link sube el dictamen y registra su fecha, pero YA NO
  // avanza la fase. Dirección cuadra y cierra la fase 8 (la cuadratura + el
  // pagaré se definen ahí, con los datos reales del Anexo B). Antes este endpoint
  // hacía `fase_posicion = 8` + INSERT en `venta_fases`; se quitó para que el
  // cierre financiero lo controle Dirección. La nota del notario se preserva en
  // el adjunto / la captura de Gerencia.
  void notas;
  const { error: vUpErr } = await admin
    .schema('dilesa')
    .from('ventas')
    .update({
      fecha_dictaminada: fecha,
    })
    .eq('id', ventaId);
  if (vUpErr) {
    console.warn('[notario-dictamen-upload] ventas update error:', vUpErr.message);
    return NextResponse.json(
      { ok: false, error: 'Archivo subido pero no se registró la fecha del dictamen.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

function sanitizeFilename(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_');
  return safe.length > 0 ? safe : `dictamen-${Date.now()}.pdf`;
}
