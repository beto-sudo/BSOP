/**
 * POST /api/dilesa/valuador/avaluo/[token]
 *
 * Endpoint público (sin login) para que el valuador suba el dictamen
 * del avalúo directo desde el magic link del email de Fase 4.
 *
 * Flujo:
 *  1. Verifica el token (HMAC + expiración).
 *  2. Lee la venta + valuador desde DB con admin client (sin RLS).
 *  3. Valida que la venta sigue activa, Fase 4 cerrada, Fase 5 NO cerrada,
 *     y que el valuador del token coincide con el de la venta.
 *  4. Sube el PDF a Storage (bucket adjuntos) con rol `avaluo_comercial`.
 *  5. Persiste `monto_avaluo`, `fecha_avaluo_cerrado` y nota del valuador.
 *  6. Inserta fila en `venta_fases` posición 5 + sincroniza
 *     `fase_actual`/`fase_posicion` (mismo patrón que marcarFase).
 *  7. (TODO) Notifica a Gerencia Ventas + Dirección del avalúo recibido.
 *
 * Security:
 *  - Token firmado HMAC-SHA256, expira en 30 días.
 *  - Solo permite UPDATE de la venta específica del token, en rol fijo.
 *  - Sin acceso a otras ventas/datos sensibles.
 *
 * Falla:
 *  - Token inválido/expirado → 401.
 *  - Venta no apta para subir (ya capturada, desasignada, etc.) → 409.
 *  - Storage/DB error → 500 con mensaje genérico.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { verifyAvaluoToken } from '@/lib/dilesa/avaluo-token';
import { buildAdjuntoPath } from '@/lib/storage/path';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { nombreFase } from '@/lib/dilesa/fases';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Tamaño máximo del PDF — coincide con el límite operativo del bucket
// adjuntos. Vercel también tiene su propio límite (~4.5MB para serverless
// functions). 4MB es seguro.
const MAX_FILE_BYTES = 4 * 1024 * 1024;

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  // ── 1. Verificar token ─────────────────────────────────────────────────
  const verify = await verifyAvaluoToken(token);
  if (!verify.ok) {
    const msg =
      verify.error === 'expired'
        ? 'El enlace expiró. Solicita uno nuevo a Gerencia de Ventas.'
        : 'El enlace no es válido.';
    return NextResponse.json({ ok: false, error: msg }, { status: 401 });
  }
  const { ventaId, valuadorId } = verify.payload;

  // ── 2. Parsear FormData (monto, fecha, archivo, comentarios) ──────────
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'FormData inválido' }, { status: 400 });
  }

  const monto = Number(form.get('monto'));
  const fecha = (form.get('fecha') as string | null)?.trim() || null;
  const comentarios = (form.get('comentarios') as string | null)?.trim() || null;
  const archivo = form.get('archivo');

  if (!Number.isFinite(monto) || monto <= 0) {
    return NextResponse.json(
      { ok: false, error: 'Captura un monto válido (mayor a cero).' },
      { status: 400 }
    );
  }
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json(
      { ok: false, error: 'La fecha debe estar en formato YYYY-MM-DD.' },
      { status: 400 }
    );
  }
  if (!(archivo instanceof File)) {
    return NextResponse.json({ ok: false, error: 'Adjunta el PDF del dictamen.' }, { status: 400 });
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

  // ── 3. Validar venta + Fase 4 cerrada + Fase 5 NO cerrada ─────────────
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Admin client no disponible' }, { status: 500 });
  }

  const { data: venta, error: vErr } = await admin
    .schema('dilesa')
    .from('ventas')
    .select('id, estado, valuador_id, fase_posicion')
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
  if (venta.valuador_id !== valuadorId) {
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
  if (!posiciones.has(4)) {
    return NextResponse.json(
      { ok: false, error: 'La Fase 4 (Solicitar avalúo) no está cerrada.' },
      { status: 409 }
    );
  }
  if (posiciones.has(5)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'El avalúo ya fue capturado para esta venta. Contacta a Gerencia de Ventas si necesitas corregir algo.',
      },
      { status: 409 }
    );
  }

  // ── 4. Subir el PDF a Storage ──────────────────────────────────────────
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
    console.warn('[valuador-avaluo-upload] storage upload error:', upErr.message);
    return NextResponse.json(
      { ok: false, error: 'No se pudo subir el archivo. Intenta de nuevo.' },
      { status: 500 }
    );
  }

  // ── 5. Persistir adjunto + monto + fecha ──────────────────────────────
  const notas = comentarios
    ? `Subido por valuador. Comentarios: ${comentarios}`
    : 'Subido por valuador.';
  const { error: adjErr } = await admin
    .schema('erp')
    .from('adjuntos')
    .insert({
      empresa_id: DILESA_EMPRESA_ID,
      entidad_tipo: 'venta',
      entidad_id: ventaId,
      rol: 'avaluo_comercial',
      nombre: filename,
      url: path,
      tipo_mime: archivo.type || 'application/pdf',
      tamano_bytes: archivo.size,
      // uploaded_by null porque el valuador no es un core.usuarios
      uploaded_by: null,
    });
  if (adjErr) {
    console.warn('[valuador-avaluo-upload] adjuntos insert error:', adjErr.message);
    return NextResponse.json(
      { ok: false, error: 'Archivo subido pero no se registró. Contacta a Gerencia.' },
      { status: 500 }
    );
  }

  // UPDATE de campos en ventas + sincronización de fase (mismo patrón
  // que marcarFase para evitar drift entre `ventas.fase_actual` y
  // `venta_fases`).
  const { error: vUpErr } = await admin
    .schema('dilesa')
    .from('ventas')
    .update({
      monto_avaluo: monto,
      fecha_avaluo_cerrado: fecha,
      fase_actual: nombreFase(5),
      fase_posicion: 5,
    })
    .eq('id', ventaId);
  if (vUpErr) {
    console.warn('[valuador-avaluo-upload] ventas update error:', vUpErr.message);
    return NextResponse.json(
      { ok: false, error: 'Archivo subido pero no se cerró la fase.' },
      { status: 500 }
    );
  }

  // ── 6. INSERT en venta_fases ──────────────────────────────────────────
  const { error: fErr } = await admin
    .schema('dilesa')
    .from('venta_fases')
    .insert({
      empresa_id: DILESA_EMPRESA_ID,
      venta_id: ventaId,
      fase: nombreFase(5),
      posicion: 5,
      fecha: new Date().toISOString().slice(0, 10),
      registrado_por: null,
      notas,
    });
  if (fErr) {
    console.warn('[valuador-avaluo-upload] venta_fases insert error:', fErr.message);
    return NextResponse.json(
      { ok: false, error: 'Datos guardados pero no se cerró la fase. Avisa a Gerencia.' },
      { status: 500 }
    );
  }

  // TODO Sprint 7e: notificar a Gerencia Ventas + Dirección del avalúo
  // recibido (email "Avalúo cargado por <valuador> — <unidad>").

  return NextResponse.json({ ok: true });
}

/**
 * Sanitiza el nombre de archivo para evitar paths raros que rompan el
 * builder de Storage. Conserva extensión y caracteres alfanuméricos.
 */
function sanitizeFilename(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_');
  return safe.length > 0 ? safe : `avaluo-${Date.now()}.pdf`;
}
