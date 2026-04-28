/* eslint-disable @typescript-eslint/no-explicit-any --
 * supabase-js solo tipa el schema `public`; para `core` y `erp` usamos `as any`.
 */

/**
 * POST /api/empresas/[id]/update-csf
 *
 * Refresca el CSF de una empresa existente con aplicación selectiva por
 * campo. Flujo:
 *
 *   1. UI sube el PDF a `/api/empresas/extract-csf` → recibe los campos.
 *   2. UI muestra modal de diff: estado actual de la empresa vs valor nuevo
 *      del extractor, checkbox por campo.
 *   3. Al aplicar, llama a este endpoint con FormData:
 *        - `file`: el PDF subido a extract-csf.
 *        - `payload`: JSON con { extraccion, accepted_fields[] }.
 *
 * Comportamiento según `accepted_fields`:
 *   - **Vacío:** archiva PDF en erp.adjuntos como histórico, NO toca
 *     `core.empresas`. `csf_url` queda como estaba.
 *   - **No vacío:** archiva PDF nuevo, UPDATE selectivo sobre `core.empresas`,
 *     `csf_url` se apunta al nuevo PDF.
 *
 * Solo admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { CsfExtraccionSchema, CSF_UPDATABLE_FIELDS } from '@/lib/proveedores/extract-csf';
import { buildEmpresaUpdateFromAccepted, EMPRESA_EXTRA_FIELDS } from '@/lib/empresas/csf-mapping';
import { requireAdmin } from '@/lib/empresas/admin-guard';

export const runtime = 'nodejs';
export const maxDuration = 120;

const BUCKET = 'adjuntos';
const MAX_INCOMING_BYTES = 50 * 1024 * 1024;

const ACCEPTABLE_FIELDS = [...CSF_UPDATABLE_FIELDS, ...EMPRESA_EXTRA_FIELDS] as const;

const PayloadSchema = z.object({
  extraccion: CsfExtraccionSchema,
  accepted_fields: z.array(z.enum(ACCEPTABLE_FIELDS)),
});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id: empresaId } = await params;

  const userSupa = await createSupabaseServerClient();
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server config error (admin client)' }, { status: 500 });
  }

  const guard = await requireAdmin(userSupa, admin);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  // Verifica que la empresa existe.
  const { data: empresa, error: empresaErr } = await (admin.schema('core') as any)
    .from('empresas')
    .select('id, slug, rfc')
    .eq('id', empresaId)
    .maybeSingle();

  if (empresaErr) {
    return NextResponse.json({ error: `lookup empresa: ${empresaErr.message}` }, { status: 500 });
  }
  if (!empresa) {
    return NextResponse.json({ error: 'Empresa no encontrada.' }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `multipart inválido: ${msg}` }, { status: 400 });
  }

  const file = formData.get('file');
  const payloadRaw = formData.get('payload');

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
      { error: `Archivo muy grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo 50 MB.` },
      { status: 413 }
    );
  }
  if (typeof payloadRaw !== 'string' || !payloadRaw.length) {
    return NextResponse.json({ error: 'Falta el campo "payload".' }, { status: 400 });
  }

  let payload;
  try {
    payload = PayloadSchema.parse(JSON.parse(payloadRaw));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `payload inválido: ${msg}` }, { status: 400 });
  }

  const { extraccion, accepted_fields } = payload;

  // 1) Sube PDF a storage SIEMPRE — archiva como histórico aunque rechacen
  //    todos los cambios.
  const ts = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const path = `empresas/${empresaId}/csf-${ts}-${safeName}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (uploadErr) {
    return NextResponse.json({ error: `upload csf: ${uploadErr.message}` }, { status: 500 });
  }

  // 2) Crea row en erp.adjuntos para el PDF nuevo.
  const { data: newAdjunto, error: adjErr } = await (admin.schema('erp') as any)
    .from('adjuntos')
    .insert({
      empresa_id: empresaId,
      entidad_tipo: 'empresa',
      entidad_id: empresaId,
      rol: 'csf',
      nombre: file.name,
      url: path,
      tipo_mime: 'application/pdf',
      tamano_bytes: file.size,
      uploaded_by: guard.usuario.id,
    })
    .select('id')
    .single();
  if (adjErr) {
    return NextResponse.json({ error: `insert adjunto: ${adjErr.message}` }, { status: 500 });
  }
  const newAdjuntoId: string = newAdjunto.id;

  // 3) Si accepted_fields está vacío → terminamos.
  if (accepted_fields.length === 0) {
    return NextResponse.json({
      ok: true,
      new_adjunto_id: newAdjuntoId,
      fields_updated: 0,
      csf_pointer_updated: false,
    });
  }

  // 4) Construye UPDATE selectivo + apunta csf_url al nuevo PDF.
  const update = buildEmpresaUpdateFromAccepted({
    extraccion,
    accepted: accepted_fields,
  });
  const updatePayload = { ...update, csf_url: path };

  const { error: updErr } = await (admin.schema('core') as any)
    .from('empresas')
    .update(updatePayload)
    .eq('id', empresaId);

  if (updErr) {
    return NextResponse.json(
      {
        error: `update empresa: ${updErr.message}`,
        partial: { new_adjunto_id: newAdjuntoId },
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    new_adjunto_id: newAdjuntoId,
    fields_updated: Object.keys(update).length,
    csf_pointer_updated: true,
  });
}
