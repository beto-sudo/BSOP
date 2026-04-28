/* eslint-disable @typescript-eslint/no-explicit-any --
 * supabase-js solo tipa el schema `public` por default; para leer/escribir
 * en `erp` usamos `as any`. Es el mismo patrón que el resto del proyecto
 * (ver components/documentos/documentos-module.tsx).
 */

/**
 * POST /api/documentos/[id]/extract
 *
 * Dispara la extracción IA para un documento individual. El usuario debe
 * estar autenticado y tener permiso de write sobre el doc (lo valida RLS).
 *
 * Flujo:
 *   1. Valida sesión y que el doc exista con adjunto PDF.
 *   2. Marca extraccion_status='procesando' (lock optimista).
 *   3. Descarga PDF, comprime si es necesario.
 *   4. Llama Claude con el schema compartido (lib/documentos/extraction-core).
 *   5. Genera embedding con OpenAI 1536 dims.
 *   6. Actualiza erp.documentos con TODO + titulo estandarizado si aplica.
 *   7. Renombra el archivo en el bucket al formato estándar si difería.
 *   8. Devuelve el doc actualizado al cliente para que refresque la UI.
 *
 * Tiempo típico: 60-120s. El cliente muestra spinner. Si el usuario cierra
 * la pestaña, el server termina de todos modos (next/node mantiene la
 * request hasta que la promesa resuelve).
 */

import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { getAdjuntoPath } from '@/lib/adjuntos';
import {
  ensurePdfFitsForClaude,
  embedContent,
  extractWithClaude,
  extraccionToDocumentoUpdates,
  MODELO_CLAUDE,
} from '@/lib/documentos/extraction-core';
import {
  buildStandardFilename,
  buildStandardTitulo,
  isStandardTitulo,
} from '@/lib/documentos/naming';

// Next.js puede abortar el route handler a los 10s en Edge; declaramos
// explícitamente que usamos Node runtime y hasta 5 min para que la llamada
// a Claude tenga margen holgado.
export const runtime = 'nodejs';
export const maxDuration = 300;

const BUCKET = 'adjuntos';

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { id: documentoId } = await params;

  if (!process.env.ANTHROPIC_API_KEY || !process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'Servidor sin ANTHROPIC_API_KEY/OPENAI_API_KEY configuradas.' },
      { status: 500 }
    );
  }

  // 1) Autenticación del caller (respeta cookies + RLS)
  const userSupa = await createSupabaseServerClient();
  const {
    data: { user },
  } = await userSupa.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  // Fetch con el client del usuario: si RLS no le deja leer el doc, 404.
  const { data: docRow, error: docErr } = await (userSupa.schema('erp') as any)
    .from('documentos')
    .select('id, empresa_id, titulo, extraccion_status')
    .eq('id', documentoId)
    .is('deleted_at', null)
    .maybeSingle();
  if (docErr) {
    return NextResponse.json({ error: `fetch documento: ${docErr.message}` }, { status: 500 });
  }
  if (!docRow) {
    return NextResponse.json({ error: 'Documento no encontrado o sin acceso' }, { status: 404 });
  }

  // 2) Todo lo pesado usa service role (bypass RLS para storage + updates).
  //    Ya validamos acceso arriba con el user client — esto es seguro.
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server config error (admin client)' }, { status: 500 });
  }

  // Adjuntos del doc, más recientes primero (mismo patrón que el script batch).
  const { data: adjuntos, error: adjErr } = await (admin.schema('erp') as any)
    .from('adjuntos')
    .select('id, url, nombre, rol, created_at')
    .eq('entidad_tipo', 'documento')
    .eq('rol', 'documento_principal')
    .eq('entidad_id', documentoId)
    .order('created_at', { ascending: false });
  if (adjErr) {
    return NextResponse.json({ error: `fetch adjuntos: ${adjErr.message}` }, { status: 500 });
  }
  if (!adjuntos || adjuntos.length === 0) {
    return NextResponse.json(
      { error: 'Este documento no tiene un PDF principal adjunto.' },
      { status: 400 }
    );
  }

  // Slug de la empresa (para el título estandarizado).
  const { data: empresa } = await (admin.schema('core') as any)
    .from('empresas')
    .select('slug')
    .eq('id', docRow.empresa_id)
    .maybeSingle();
  const empresaSlug = empresa?.slug ?? null;

  // 3) Lock optimista
  const { data: lockData, error: lockErr } = await (admin.schema('erp') as any)
    .from('documentos')
    .update({ extraccion_status: 'procesando', extraccion_error: null })
    .eq('id', documentoId)
    .in('extraccion_status', ['pendiente', 'error', 'completado'])
    .select('id');
  if (lockErr) {
    return NextResponse.json({ error: `lock: ${lockErr.message}` }, { status: 500 });
  }
  if (!lockData || lockData.length === 0) {
    return NextResponse.json(
      { error: 'El documento ya está procesándose (otro request lo tomó).' },
      { status: 409 }
    );
  }

  try {
    // 4) Itera candidatos hasta encontrar uno que se pueda descargar y que quepa.
    let pdfBytes: Uint8Array | null = null;
    let sourceAdjunto: { id: string; url: string; nombre: string } | null = null;
    const errors: string[] = [];
    for (const a of adjuntos as Array<{ id: string; url: string; nombre: string }>) {
      const path = getAdjuntoPath(a.url);
      if (!path) {
        errors.push(`url inválido: ${a.url}`);
        continue;
      }
      const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(path);
      if (dlErr || !blob) {
        errors.push(`download ${path}: ${dlErr?.message ?? 'sin data'}`);
        continue;
      }
      try {
        const raw = new Uint8Array(await blob.arrayBuffer());
        pdfBytes = await ensurePdfFitsForClaude(raw);
        sourceAdjunto = { id: a.id, url: a.url, nombre: a.nombre };
        break;
      } catch (err) {
        errors.push(`compress ${path}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (!pdfBytes || !sourceAdjunto) {
      throw new Error(`Ningún PDF utilizable — ${errors.join(' | ')}`);
    }

    // 5) Claude + embedding
    const extraccion = await extractWithClaude(pdfBytes, docRow.titulo);
    const embedding = await embedContent(extraccion.contenido_texto);

    // 6) Título estandarizado — si podemos armarlo con la data extraída
    //    (tipo del doc + fecha + número), y el título actual NO está ya
    //    en formato estándar, lo sobrescribimos. Si el usuario editó el
    //    título manualmente a algo custom, respetamos su edición.
    const { data: tipoRow } = await (admin.schema('erp') as any)
      .from('documentos')
      .select('tipo')
      .eq('id', documentoId)
      .single();
    const tipoGeneral: string | null = tipoRow?.tipo ?? null;

    const nuevoTitulo = buildStandardTitulo({
      empresaSlug,
      tipo: tipoGeneral,
      fecha: extraccion.fecha_emision,
      numero: extraccion.numero_documento,
    });

    // `extraccionToDocumentoUpdates` aplana `predio.*` a columnas top-level
    // y normaliza "" → null y 0 → null para `superficie_m2`. El sync_trigger
    // de core.empresa_documentos depende de `null = ausente` en
    // `subtipo_meta`. Centralizado en lib/documentos/extraction-core.ts para
    // que API route y script batch no diverjan.
    const documentoUpdates = extraccionToDocumentoUpdates(extraccion);

    const updates: Record<string, unknown> = {
      ...documentoUpdates,
      contenido_embedding: embedding,
      extraccion_status: 'completado',
      extraccion_fecha: new Date().toISOString(),
      extraccion_modelo: MODELO_CLAUDE,
      extraccion_error: null,
      updated_at: new Date().toISOString(),
    };

    // `fecha_emision` y `numero_documento` solo se sobrescriben si la IA los
    // determinó (no null) — preservamos el valor humano si existía.
    if (!documentoUpdates.fecha_emision) delete updates.fecha_emision;
    if (!documentoUpdates.numero_documento) delete updates.numero_documento;
    // Solo sobrescribimos el título si podemos generar uno estándar nuevo y
    // el actual no está ya en formato estándar (respetamos ediciones humanas).
    const titleIsStandard = isStandardTitulo(docRow.titulo);
    if (nuevoTitulo && !titleIsStandard) {
      updates.titulo = nuevoTitulo;
    }

    // 7) Renombrar archivo en el bucket si difiere del estándar y tenemos
    //    nombre objetivo. No es crítico — si falla, loggeamos y seguimos.
    let renamedTo: string | null = null;
    if (nuevoTitulo) {
      const currentPath = getAdjuntoPath(sourceAdjunto.url);
      const targetFilename = buildStandardFilename(nuevoTitulo);
      // Conservamos el prefijo de la carpeta actual (ej. `dilesa/escrituras/`)
      // para mantener organización existente. Si no había carpeta, usamos
      // `{empresa_slug}/escrituras/` como default.
      const prefix = currentPath?.includes('/')
        ? currentPath.slice(0, currentPath.lastIndexOf('/') + 1)
        : `${empresaSlug?.toLowerCase() ?? 'docs'}/escrituras/`;
      const targetPath = `${prefix}${targetFilename}`;

      if (currentPath && currentPath !== targetPath) {
        const { error: mvErr } = await admin.storage.from(BUCKET).move(currentPath, targetPath);
        if (mvErr) {
          console.warn(`[extract] move(${currentPath} → ${targetPath}) falló: ${mvErr.message}`);
        } else {
          renamedTo = targetPath;
          const { error: adjErr2 } = await (admin.schema('erp') as any)
            .from('adjuntos')
            .update({ url: targetPath, nombre: targetFilename })
            .eq('id', sourceAdjunto.id);
          if (adjErr2) {
            console.warn(`[extract] update adjunto url falló: ${adjErr2.message}`);
          }
        }
      }
    }

    // 8) Commit de la extracción
    const { data: updated, error: updErr } = await (admin.schema('erp') as any)
      .from('documentos')
      .update(updates)
      .eq('id', documentoId)
      .select('*')
      .single();
    if (updErr) throw new Error(`update: ${updErr.message}`);

    return NextResponse.json({
      ok: true,
      documento: updated,
      renamedTo,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Marcar como error para que el usuario pueda reintentar
    await (admin.schema('erp') as any)
      .from('documentos')
      .update({
        extraccion_status: 'error',
        extraccion_error: msg.slice(0, 2000),
        extraccion_fecha: new Date().toISOString(),
      })
      .eq('id', documentoId);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
