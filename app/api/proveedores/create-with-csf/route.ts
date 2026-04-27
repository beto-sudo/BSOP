/* eslint-disable @typescript-eslint/no-explicit-any --
 * supabase-js solo tipa el schema `public` por default; para leer/escribir
 * en `erp` usamos `as any`. Es el mismo patrón que el resto del proyecto
 * (ver app/api/documentos/[id]/extract/route.ts).
 */

/**
 * POST /api/proveedores/create-with-csf
 *
 * Crea un proveedor nuevo a partir de los datos extraídos de su CSF (Sprint 1.B)
 * más el PDF original. El cliente arma el flujo así:
 *
 *   1. Sube CSF a `/api/proveedores/extract-csf` → recibe los campos extraídos.
 *   2. UI muestra los campos pre-llenados; el usuario revisa/corrige.
 *   3. Al guardar, llama a este endpoint con FormData:
 *        - `file`: el mismo PDF que se subió a extract-csf.
 *        - `payload`: JSON con { empresa_id, extraccion, proveedor_extras? }.
 *
 * Persistencia (sin transacción explícita — orden recuperable):
 *   1. Dedup por (empresa_id, rfc, activo=true) en `erp.personas`. Si ya
 *      existe → 409 con `existing_persona_id` y `existing_proveedor_id`.
 *   2. INSERT erp.personas (con tipo_persona, nombre/razón social, apellidos,
 *      rfc, curp, tipo='proveedor').
 *   3. INSERT erp.proveedores (link + extras opcionales).
 *   4. Upload PDF a bucket `adjuntos` en `proveedores/{empresa_id}/{persona_id}/csf-{ts}.pdf`.
 *   5. INSERT erp.adjuntos (entidad_tipo='persona', rol='csf').
 *   6. INSERT erp.personas_datos_fiscales (con csf_adjunto_id apuntando al row creado).
 *
 * Si falla después del paso 2, devuelve 500 indicando qué quedó persistido
 * para que el cliente pueda recuperar via flujos de update existentes.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { CreateProveedorPayloadSchema } from '@/lib/proveedores/extract-csf';

export const runtime = 'nodejs';
export const maxDuration = 120;

const BUCKET = 'adjuntos';
const MAX_INCOMING_BYTES = 50 * 1024 * 1024; // 50 MB

export async function POST(req: NextRequest) {
  // 1) Auth
  const userSupa = await createSupabaseServerClient();
  const {
    data: { user },
  } = await userSupa.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  // 2) Parse multipart
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
    return NextResponse.json(
      { error: 'Falta el campo "payload" (JSON con empresa_id, extraccion, proveedor_extras?).' },
      { status: 400 }
    );
  }

  // 3) Validate payload
  let payload;
  try {
    payload = CreateProveedorPayloadSchema.parse(JSON.parse(payloadRaw));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `payload inválido: ${msg}` }, { status: 400 });
  }

  const { empresa_id, extraccion, proveedor_extras } = payload;
  const rfcNormalized = extraccion.rfc.trim().toUpperCase();

  // 4) Dedup por RFC en esta empresa. Usamos admin para que sea independiente
  //    de RLS — la verificación de empresa_id se hace en el INSERT (RLS de
  //    erp.personas requiere fn_has_empresa o fn_is_admin).
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server config error (admin client)' }, { status: 500 });
  }

  const { data: existingPersona, error: dedupErr } = await (admin.schema('erp') as any)
    .from('personas')
    .select('id')
    .eq('empresa_id', empresa_id)
    .eq('rfc', rfcNormalized)
    .eq('activo', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (dedupErr) {
    return NextResponse.json({ error: `dedup query: ${dedupErr.message}` }, { status: 500 });
  }

  if (existingPersona) {
    const { data: existingProv } = await (admin.schema('erp') as any)
      .from('proveedores')
      .select('id')
      .eq('empresa_id', empresa_id)
      .eq('persona_id', existingPersona.id)
      .is('deleted_at', null)
      .maybeSingle();

    return NextResponse.json(
      {
        error: 'rfc_duplicado',
        existing_persona_id: existingPersona.id,
        existing_proveedor_id: existingProv?.id ?? null,
      },
      { status: 409 }
    );
  }

  // 5) INSERT erp.personas — usamos user client para que RLS valide acceso a
  //    la empresa. Si el user no pertenece a empresa_id, RLS bloquea aquí.
  const isMoral = extraccion.tipo_persona === 'moral';
  const personaInsert = {
    empresa_id,
    tipo_persona: extraccion.tipo_persona,
    tipo: 'proveedor',
    // Convención del repo: para morales, `nombre` = razón social (lo que la
    // UI muestra como nombre principal). Razón social oficial también vive
    // en personas_datos_fiscales para preservar la versión literal del SAT.
    nombre: isMoral
      ? (extraccion.razon_social ?? 'SIN NOMBRE')
      : (extraccion.nombre ?? 'SIN NOMBRE'),
    apellido_paterno: isMoral ? null : extraccion.apellido_paterno,
    apellido_materno: isMoral ? null : extraccion.apellido_materno,
    rfc: rfcNormalized,
    curp: extraccion.curp,
  };

  const { data: persona, error: personaErr } = await (userSupa.schema('erp') as any)
    .from('personas')
    .insert(personaInsert)
    .select('id')
    .single();

  if (personaErr) {
    const isRlsErr = /row-level security|permission denied/i.test(personaErr.message);
    return NextResponse.json(
      { error: `insert persona: ${personaErr.message}` },
      { status: isRlsErr ? 403 : 500 }
    );
  }

  const personaId: string = persona.id;
  const created: {
    persona_id: string;
    proveedor_id?: string;
    adjunto_id?: string;
    datos_fiscales_id?: string;
  } = {
    persona_id: personaId,
  };

  // 6) INSERT erp.proveedores
  const proveedorInsert = {
    empresa_id,
    persona_id: personaId,
    activo: true,
    codigo: proveedor_extras?.codigo ?? null,
    condiciones_pago: proveedor_extras?.condiciones_pago ?? null,
    limite_credito: proveedor_extras?.limite_credito ?? null,
    categoria: proveedor_extras?.categoria ?? null,
  };

  const { data: proveedor, error: proveedorErr } = await (userSupa.schema('erp') as any)
    .from('proveedores')
    .insert(proveedorInsert)
    .select('id')
    .single();

  if (proveedorErr) {
    return NextResponse.json(
      { error: `insert proveedor: ${proveedorErr.message}`, partial: created },
      { status: 500 }
    );
  }
  created.proveedor_id = proveedor.id;

  // 7) Upload PDF al bucket
  const ts = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const path = `proveedores/${empresa_id}/${personaId}/csf-${ts}-${safeName}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: 'application/pdf',
    upsert: false,
  });

  if (uploadErr) {
    return NextResponse.json(
      { error: `upload csf: ${uploadErr.message}`, partial: created },
      { status: 500 }
    );
  }

  // 8) INSERT erp.adjuntos
  const adjuntoInsert = {
    empresa_id,
    entidad_tipo: 'persona',
    entidad_id: personaId,
    rol: 'csf',
    nombre: file.name,
    url: path,
    tipo_mime: 'application/pdf',
    tamano_bytes: file.size,
    uploaded_by: user.id,
  };

  const { data: adjunto, error: adjuntoErr } = await (userSupa.schema('erp') as any)
    .from('adjuntos')
    .insert(adjuntoInsert)
    .select('id')
    .single();

  if (adjuntoErr) {
    return NextResponse.json(
      { error: `insert adjunto: ${adjuntoErr.message}`, partial: created },
      { status: 500 }
    );
  }
  created.adjunto_id = adjunto.id;

  // 9) INSERT erp.personas_datos_fiscales
  const datosFiscalesInsert = {
    empresa_id,
    persona_id: personaId,
    razon_social: extraccion.razon_social,
    nombre_comercial: extraccion.nombre_comercial,
    regimen_fiscal_codigo: extraccion.regimen_fiscal_codigo,
    regimen_fiscal_nombre: extraccion.regimen_fiscal_nombre,
    regimenes_adicionales: extraccion.regimenes_adicionales,
    domicilio_calle: extraccion.domicilio_calle,
    domicilio_num_ext: extraccion.domicilio_num_ext,
    domicilio_num_int: extraccion.domicilio_num_int,
    domicilio_colonia: extraccion.domicilio_colonia,
    domicilio_cp: extraccion.domicilio_cp,
    domicilio_municipio: extraccion.domicilio_municipio,
    domicilio_estado: extraccion.domicilio_estado,
    obligaciones: extraccion.obligaciones,
    csf_adjunto_id: adjunto.id,
    csf_fecha_emision: extraccion.fecha_emision,
    fecha_inicio_operaciones: extraccion.fecha_inicio_operaciones,
  };

  const { data: datosFiscales, error: datosErr } = await (userSupa.schema('erp') as any)
    .from('personas_datos_fiscales')
    .insert(datosFiscalesInsert)
    .select('id')
    .single();

  if (datosErr) {
    return NextResponse.json(
      { error: `insert personas_datos_fiscales: ${datosErr.message}`, partial: created },
      { status: 500 }
    );
  }
  created.datos_fiscales_id = datosFiscales.id;

  return NextResponse.json({ ok: true, ...created });
}
