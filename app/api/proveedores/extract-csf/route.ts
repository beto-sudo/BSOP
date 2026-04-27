/**
 * POST /api/proveedores/extract-csf
 *
 * Recibe un PDF de Constancia de Situación Fiscal (multipart/form-data,
 * campo "file"), lo procesa con Claude usando el schema del módulo de
 * proveedores y devuelve los datos extraídos pre-llenados, listos para
 * que la UI los muestre en el form de alta de proveedor.
 *
 * IMPORTANTE: este endpoint NO persiste nada — ni el adjunto, ni el
 * proveedor, ni los datos fiscales. Solo extrae. La persistencia es
 * trabajo del endpoint create-proveedor (Sprint 2), que recibe los
 * campos revisados por el usuario + el PDF y arma todo en transacción.
 *
 * Tiempo típico: 30-90s. El cliente muestra spinner.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { ensurePdfFitsForClaude } from '@/lib/documentos/extraction-core';
import { extractCsfWithClaude } from '@/lib/proveedores/extract-csf';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_INCOMING_BYTES = 50 * 1024 * 1024; // 50 MB pre-compresión

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Servidor sin ANTHROPIC_API_KEY configurada.' },
      { status: 500 }
    );
  }

  // Auth
  const supa = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supa.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  // Parse multipart
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `multipart inválido: ${msg}` }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'Falta el campo "file" (multipart/form-data).' },
      { status: 400 }
    );
  }
  if (file.type && file.type !== 'application/pdf') {
    return NextResponse.json(
      { error: `Tipo de archivo no soportado: ${file.type}. Solo application/pdf.` },
      { status: 415 }
    );
  }
  if (file.size > MAX_INCOMING_BYTES) {
    return NextResponse.json(
      {
        error: `Archivo muy grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo 50 MB.`,
      },
      { status: 413 }
    );
  }

  try {
    const raw = new Uint8Array(await file.arrayBuffer());
    const pdfBytes = await ensurePdfFitsForClaude(raw);
    const extraccion = await extractCsfWithClaude(pdfBytes);

    return NextResponse.json({ ok: true, extraccion });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
