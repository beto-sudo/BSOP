/* eslint-disable @typescript-eslint/no-explicit-any --
 * supabase-js solo tipa el schema `public` por default; para escribir en
 * `core` y `erp` usamos `as any` (mismo patrón que proveedores).
 */

/**
 * POST /api/empresas/create-with-csf
 *
 * Alta de empresa nueva a partir del PDF de su CSF + campos extraídos. Flujo:
 *
 *   1. UI sube el PDF a `/api/empresas/extract-csf` → recibe los campos.
 *   2. UI completa `slug` (default = slugify del nombre) y `nombre` (default =
 *      `razon_social`).
 *   3. Al guardar, llama a este endpoint con FormData:
 *        - `file`: el PDF subido a extract-csf.
 *        - `payload`: JSON con { extraccion, slug, nombre, tipo_contribuyente? }.
 *
 * Persistencia (orden recuperable, sin transacción explícita):
 *   1. Dedup por RFC (UNIQUE en core.empresas.rfc).
 *   2. INSERT core.empresas con campos derivados de la CSF.
 *   3. Upload PDF a bucket `adjuntos` en `empresas/{empresa_id}/csf-{ts}.pdf`.
 *   4. INSERT erp.adjuntos (entidad_tipo='empresa', rol='csf').
 *   5. UPDATE core.empresas.csf_url al path del nuevo adjunto.
 *
 * Si falla después del paso 2, devuelve 500 indicando qué quedó persistido —
 * el operador puede recuperar via UI de update.
 *
 * Solo admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { CsfExtraccionSchema } from '@/lib/proveedores/extract-csf';
import { buildEmpresaInsertFromExtraccion } from '@/lib/empresas/csf-mapping';
import { requireAdmin } from '@/lib/empresas/admin-guard';

export const runtime = 'nodejs';
export const maxDuration = 120;

const BUCKET = 'adjuntos';
const MAX_INCOMING_BYTES = 50 * 1024 * 1024;

const PayloadSchema = z.object({
  extraccion: CsfExtraccionSchema,
  slug: z
    .string()
    .min(2, 'slug muy corto')
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug debe ser kebab-case (solo a-z, 0-9 y guiones)'),
  nombre: z.string().min(1, 'nombre requerido').max(120),
  tipo_contribuyente: z.enum(['persona_moral', 'persona_fisica']).optional(),
});

export async function POST(req: NextRequest) {
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
    return NextResponse.json({ error: 'Falta el campo "payload" (JSON).' }, { status: 400 });
  }

  let payload;
  try {
    payload = PayloadSchema.parse(JSON.parse(payloadRaw));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `payload inválido: ${msg}` }, { status: 400 });
  }

  const { extraccion, slug, nombre, tipo_contribuyente } = payload;
  const rfcNormalized = extraccion.rfc.trim().toUpperCase();

  // 1) Dedup por RFC y por slug.
  const [{ data: dupRfc }, { data: dupSlug }] = await Promise.all([
    (admin.schema('core') as any)
      .from('empresas')
      .select('id, slug')
      .eq('rfc', rfcNormalized)
      .maybeSingle(),
    (admin.schema('core') as any).from('empresas').select('id').eq('slug', slug).maybeSingle(),
  ]);

  if (dupRfc) {
    return NextResponse.json(
      { error: 'rfc_duplicado', existing_empresa_id: dupRfc.id, existing_slug: dupRfc.slug },
      { status: 409 }
    );
  }
  if (dupSlug) {
    return NextResponse.json(
      { error: 'slug_duplicado', existing_empresa_id: dupSlug.id },
      { status: 409 }
    );
  }

  // 2) INSERT core.empresas.
  const insertRow = buildEmpresaInsertFromExtraccion({
    extraccion,
    slug,
    nombre,
    tipo_contribuyente,
  });

  const { data: empresa, error: empresaErr } = await (admin.schema('core') as any)
    .from('empresas')
    .insert({ ...insertRow, activa: true })
    .select('id, slug')
    .single();

  if (empresaErr) {
    return NextResponse.json({ error: `insert empresa: ${empresaErr.message}` }, { status: 500 });
  }
  const empresaId: string = empresa.id;

  // 3) Upload PDF a storage.
  const ts = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const path = `empresas/${empresaId}/csf-${ts}-${safeName}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: 'application/pdf',
    upsert: false,
  });

  if (uploadErr) {
    return NextResponse.json(
      {
        error: `upload csf: ${uploadErr.message}`,
        partial: { empresa_id: empresaId, slug: empresa.slug },
      },
      { status: 500 }
    );
  }

  // 4) INSERT erp.adjuntos.
  const { data: adjunto, error: adjuntoErr } = await (admin.schema('erp') as any)
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

  if (adjuntoErr) {
    return NextResponse.json(
      {
        error: `insert adjunto: ${adjuntoErr.message}`,
        partial: { empresa_id: empresaId, slug: empresa.slug },
      },
      { status: 500 }
    );
  }

  // 5) UPDATE empresa.csf_url al path del adjunto recién creado.
  const { error: csfUrlErr } = await (admin.schema('core') as any)
    .from('empresas')
    .update({ csf_url: path })
    .eq('id', empresaId);

  if (csfUrlErr) {
    return NextResponse.json(
      {
        error: `update csf_url: ${csfUrlErr.message}`,
        partial: { empresa_id: empresaId, slug: empresa.slug, adjunto_id: adjunto.id },
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    empresa_id: empresaId,
    slug: empresa.slug,
    adjunto_id: adjunto.id,
  });
}
