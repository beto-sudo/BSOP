/**
 * POST /api/empresas/extract-csf
 *
 * Recibe un PDF de Constancia de Situación Fiscal de empresa (multipart/
 * form-data, campo "file"), lo procesa con el extractor compartido
 * (`lib/proveedores/extract-csf.ts`) y devuelve los campos pre-llenados.
 *
 * NO persiste nada — la persistencia ocurre en `create-with-csf` (alta) o
 * `[id]/update-csf` (refresh).
 *
 * Solo admin (decisión Beto en planning).
 */

import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { ensurePdfFitsForClaude } from '@/lib/documentos/extraction-core';
import { extractCsfWithClaude } from '@/lib/proveedores/extract-csf';
import { requireAdmin } from '@/lib/empresas/admin-guard';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_INCOMING_BYTES = 50 * 1024 * 1024; // 50 MB

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Servidor sin ANTHROPIC_API_KEY configurada.' },
      { status: 500 }
    );
  }

  const userSupa = await createSupabaseServerClient();
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server config error (admin client)' }, { status: 500 });
  }

  const guard = await requireAdmin(userSupa, admin);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

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
