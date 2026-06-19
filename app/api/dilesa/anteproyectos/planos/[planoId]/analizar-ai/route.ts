/**
 * POST /api/dilesa/anteproyectos/planos/[planoId]/analizar-ai
 *
 * Corre Claude vision sobre el archivo principal del plano y guarda
 * el resultado en `dilesa.proyecto_planos.ai_analisis` (jsonb).
 *
 * Sprint 4E de `dilesa-proyectos-checklist-inline`.
 *
 * Flujo:
 *   1) Carga el row del plano vía RLS (el usuario debe pertenecer a
 *      la empresa).
 *   2) Busca el primer adjunto físico vinculado en `erp.adjuntos`
 *      con `entidad_tipo='proyecto_plano' AND entidad_id=planoId`.
 *      Si hay varios, toma el más reciente (created_at desc).
 *   3) Descarga los bytes desde Storage bucket `adjuntos` con
 *      service-role (RLS de Storage no aplica al admin client).
 *   4) Llama Claude vision con el schema estructurado.
 *   5) Normaliza el output (0 → null, "" → null).
 *   6) UPDATE el jsonb + analizado_en timestamp.
 *
 * Cost approx: ~$0.01-0.05 por análisis dependiendo del tamaño del
 * plano. Modelo de visión del registry (uso `dilesa-plano`, lib/ai).
 */

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { resolveModel } from '@/lib/ai';
import { analizarPlanoConClaude } from '@/lib/dilesa/plano-ai/analizar';
import { normalizarAnalisis } from '@/lib/dilesa/plano-ai/schema';

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

const SUPPORTED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

function mediaTypeFromName(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'heic':
    case 'heif':
    case 'tiff':
      return ''; // no soportado por Claude vision directo
    default:
      return '';
  }
}

export async function POST(_req: Request, { params }: { params: Promise<{ planoId: string }> }) {
  const { planoId } = await params;
  if (!planoId) {
    return NextResponse.json({ error: 'planoId requerido' }, { status: 400 });
  }

  const sb = await makeServerClient();

  // 1) Cargar plano vía RLS — confirma acceso del user a la empresa.
  const { data: plano, error: planoErr } = await sb
    .schema('dilesa')
    .from('proyecto_planos')
    .select('id, empresa_id, proyecto_id, version')
    .eq('id', planoId)
    .is('deleted_at', null)
    .maybeSingle();
  if (planoErr) {
    return NextResponse.json({ error: planoErr.message }, { status: 500 });
  }
  if (!plano) {
    return NextResponse.json({ error: 'Plano no encontrado' }, { status: 404 });
  }

  // 2) Buscar el adjunto más reciente vinculado.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: adjuntos, error: adjErr } = await (sb.schema('erp') as any)
    .from('adjuntos')
    .select('id, nombre, url, created_at')
    .eq('entidad_tipo', 'proyecto_plano')
    .eq('entidad_id', planoId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (adjErr) {
    return NextResponse.json({ error: adjErr.message }, { status: 500 });
  }
  if (!adjuntos || adjuntos.length === 0) {
    return NextResponse.json(
      { error: 'Esta versión del plano no tiene archivo. Sube un PDF o imagen primero.' },
      { status: 400 }
    );
  }
  const adjunto = adjuntos[0] as { id: string; nombre: string; url: string };

  // 3) Validar MIME soportado.
  const mediaType = mediaTypeFromName(adjunto.nombre);
  if (!mediaType || !SUPPORTED_MIME.has(mediaType)) {
    return NextResponse.json(
      {
        error:
          'Formato no soportado por Claude vision. Sube PDF, PNG, JPG o WebP (HEIC/TIFF no aceptados).',
      },
      { status: 400 }
    );
  }

  // 4) Descargar bytes con service-role (bypassea RLS de Storage; la
  //    autorización ya la hizo la RLS de proyecto_planos arriba).
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Cliente admin no disponible' }, { status: 500 });
  }
  const { data: blob, error: dlErr } = await admin.storage.from('adjuntos').download(adjunto.url);
  if (dlErr || !blob) {
    return NextResponse.json(
      { error: `No se pudo descargar el archivo: ${dlErr?.message ?? 'unknown'}` },
      { status: 500 }
    );
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());

  // 5) Llamar Claude vision con schema estructurado.
  let analisisRaw;
  try {
    analisisRaw = await analizarPlanoConClaude(bytes, mediaType);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[analizar-plano-ai] Claude vision falló', { planoId, msg });
    return NextResponse.json({ error: `Claude vision falló: ${msg}` }, { status: 500 });
  }

  const analisis = normalizarAnalisis(analisisRaw);

  // 6) UPDATE el jsonb + analizado_en timestamp.
  const payload = {
    ...analisis,
    archivo_nombre: adjunto.nombre,
    archivo_adjunto_id: adjunto.id,
    analizado_en: new Date().toISOString(),
    modelo: await resolveModel('dilesa-plano'),
  };

  const { error: upErr } = await sb
    .schema('dilesa')
    .from('proyecto_planos')
    .update({
      ai_analisis: payload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', planoId);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, analisis: payload });
}

export const runtime = 'nodejs';
// Claude vision sobre planos grandes puede tardar — extendemos timeout.
export const maxDuration = 120;
