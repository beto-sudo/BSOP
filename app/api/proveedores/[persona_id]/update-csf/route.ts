/* eslint-disable @typescript-eslint/no-explicit-any --
 * supabase-js solo tipa el schema `public` por default; para leer/escribir
 * en `erp` usamos `as any`. Es el mismo patrón que el resto del proyecto.
 */

/**
 * POST /api/proveedores/[persona_id]/update-csf
 *
 * Actualiza la CSF de un proveedor existente, con aplicación selectiva de
 * cambios campo-por-campo. El cliente:
 *
 *   1. Sube el PDF a `/api/proveedores/extract-csf` → recibe los campos.
 *   2. UI muestra modal de diff: estado actual vs valor nuevo, checkbox por
 *      campo.
 *   3. Al aplicar, llama a este endpoint con FormData:
 *        - `file`: el PDF subido a extract-csf.
 *        - `payload`: JSON con { empresa_id, extraccion, accepted_fields[] }.
 *
 * Comportamiento según accepted_fields:
 *   - **Vacío**: archiva PDF en erp.adjuntos como histórico, NO toca personas
 *     ni personas_datos_fiscales. csf_adjunto_id se queda como estaba.
 *   - **No vacío**: archiva PDF nuevo + UPDATEs selectivos sobre las dos
 *     tablas + csf_adjunto_id se actualiza al nuevo adjunto.
 *
 * Caso edge: si la persona no tiene fila en personas_datos_fiscales (legacy
 * pre-Sprint-1), el primer "update" es realmente un INSERT con los campos
 * aceptados.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import {
  UpdateCsfPayloadSchema,
  type CsfExtraccion,
  type CsfUpdatableField,
} from '@/lib/proveedores/extract-csf';

export const runtime = 'nodejs';
export const maxDuration = 120;

const BUCKET = 'adjuntos';
const MAX_INCOMING_BYTES = 50 * 1024 * 1024;

// Mapeo de cada campo del CsfExtraccionSchema a (tabla destino, columna).
// Algunos campos viven en personas (identidad), otros en personas_datos_fiscales.
type FieldTarget = {
  table: 'personas' | 'personas_datos_fiscales';
  column: string;
};

const FIELD_MAP: Record<CsfUpdatableField, FieldTarget> = {
  tipo_persona: { table: 'personas', column: 'tipo_persona' },
  rfc: { table: 'personas', column: 'rfc' },
  curp: { table: 'personas', column: 'curp' },
  nombre: { table: 'personas', column: 'nombre' },
  apellido_paterno: { table: 'personas', column: 'apellido_paterno' },
  apellido_materno: { table: 'personas', column: 'apellido_materno' },
  razon_social: { table: 'personas_datos_fiscales', column: 'razon_social' },
  nombre_comercial: { table: 'personas_datos_fiscales', column: 'nombre_comercial' },
  regimen_fiscal_codigo: { table: 'personas_datos_fiscales', column: 'regimen_fiscal_codigo' },
  regimen_fiscal_nombre: { table: 'personas_datos_fiscales', column: 'regimen_fiscal_nombre' },
  regimenes_adicionales: { table: 'personas_datos_fiscales', column: 'regimenes_adicionales' },
  domicilio_calle: { table: 'personas_datos_fiscales', column: 'domicilio_calle' },
  domicilio_num_ext: { table: 'personas_datos_fiscales', column: 'domicilio_num_ext' },
  domicilio_num_int: { table: 'personas_datos_fiscales', column: 'domicilio_num_int' },
  domicilio_colonia: { table: 'personas_datos_fiscales', column: 'domicilio_colonia' },
  domicilio_cp: { table: 'personas_datos_fiscales', column: 'domicilio_cp' },
  domicilio_municipio: { table: 'personas_datos_fiscales', column: 'domicilio_municipio' },
  domicilio_estado: { table: 'personas_datos_fiscales', column: 'domicilio_estado' },
  obligaciones: { table: 'personas_datos_fiscales', column: 'obligaciones' },
  fecha_inicio_operaciones: {
    table: 'personas_datos_fiscales',
    column: 'fecha_inicio_operaciones',
  },
  fecha_emision: { table: 'personas_datos_fiscales', column: 'csf_fecha_emision' },
};

type Params = { params: Promise<{ persona_id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { persona_id } = await params;

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
    return NextResponse.json({ error: 'Falta el campo "payload".' }, { status: 400 });
  }

  // 3) Validate payload
  let payload;
  try {
    payload = UpdateCsfPayloadSchema.parse(JSON.parse(payloadRaw));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `payload inválido: ${msg}` }, { status: 400 });
  }

  const { empresa_id, extraccion, accepted_fields } = payload;

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server config error (admin client)' }, { status: 500 });
  }

  // 4) Verifica que la persona existe en esta empresa.
  const { data: existingPersona, error: personaErr } = await (admin.schema('erp') as any)
    .from('personas')
    .select('id, tipo_persona')
    .eq('id', persona_id)
    .eq('empresa_id', empresa_id)
    .is('deleted_at', null)
    .maybeSingle();

  if (personaErr) {
    return NextResponse.json({ error: `fetch persona: ${personaErr.message}` }, { status: 500 });
  }
  if (!existingPersona) {
    return NextResponse.json({ error: 'Persona no encontrada en esta empresa.' }, { status: 404 });
  }

  // 5) Sube PDF a storage SIEMPRE (archiva como histórico aunque rechacen
  //    todos los cambios — el alcance del Sprint 3 lo pide explícitamente).
  const ts = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const path = `proveedores/${empresa_id}/${persona_id}/csf-${ts}-${safeName}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (uploadErr) {
    return NextResponse.json({ error: `upload csf: ${uploadErr.message}` }, { status: 500 });
  }

  // 6) Crea row en erp.adjuntos para el PDF nuevo.
  const { data: newAdjunto, error: adjErr } = await (userSupa.schema('erp') as any)
    .from('adjuntos')
    .insert({
      empresa_id,
      entidad_tipo: 'persona',
      entidad_id: persona_id,
      rol: 'csf',
      nombre: file.name,
      url: path,
      tipo_mime: 'application/pdf',
      tamano_bytes: file.size,
      uploaded_by: user.id,
    })
    .select('id')
    .single();
  if (adjErr) {
    return NextResponse.json({ error: `insert adjunto: ${adjErr.message}` }, { status: 500 });
  }
  const newAdjuntoId: string = newAdjunto.id;

  // 7) Si accepted_fields está vacío → terminamos. PDF queda archivado, no
  //    se aplican cambios, csf_adjunto_id no se actualiza.
  if (accepted_fields.length === 0) {
    return NextResponse.json({
      ok: true,
      new_adjunto_id: newAdjuntoId,
      fields_updated: 0,
      csf_pointer_updated: false,
    });
  }

  // 8) Calcula updates por tabla a partir de los campos aceptados.
  const personasUpdates: Record<string, unknown> = {};
  const datosFiscalesUpdates: Record<string, unknown> = {};

  for (const field of accepted_fields) {
    const target = FIELD_MAP[field];
    const value = (extraccion as Partial<Record<CsfUpdatableField, unknown>>)[field];
    if (target.table === 'personas') {
      personasUpdates[target.column] = value;
    } else {
      datosFiscalesUpdates[target.column] = value;
    }
  }

  // Convención del repo: si la persona es moral y se aceptó razon_social,
  // también propagar a personas.nombre.
  const tipoFinal =
    'tipo_persona' in personasUpdates
      ? (personasUpdates.tipo_persona as 'fisica' | 'moral')
      : (existingPersona.tipo_persona as 'fisica' | 'moral');

  if (tipoFinal === 'moral' && accepted_fields.includes('razon_social')) {
    personasUpdates.nombre = (extraccion as CsfExtraccion).razon_social ?? personasUpdates.nombre;
  }

  // 9) UPDATE personas (si hay campos para esa tabla).
  if (Object.keys(personasUpdates).length > 0) {
    personasUpdates.updated_at = new Date().toISOString();
    const { error: updPersErr } = await (userSupa.schema('erp') as any)
      .from('personas')
      .update(personasUpdates)
      .eq('id', persona_id)
      .eq('empresa_id', empresa_id);
    if (updPersErr) {
      const isRlsErr = /row-level security|permission denied/i.test(updPersErr.message);
      return NextResponse.json(
        {
          error: `update persona: ${updPersErr.message}`,
          partial: { new_adjunto_id: newAdjuntoId },
        },
        { status: isRlsErr ? 403 : 500 }
      );
    }
  }

  // 10) UPDATE / INSERT personas_datos_fiscales. Verifica si existe primero.
  //     Siempre incluye csf_adjunto_id (apuntando al nuevo PDF) cuando hay
  //     al menos un cambio aplicado.
  const { data: existingDatosFiscales } = await (admin.schema('erp') as any)
    .from('personas_datos_fiscales')
    .select('id')
    .eq('persona_id', persona_id)
    .maybeSingle();

  const datosFiscalesPayload = {
    ...datosFiscalesUpdates,
    csf_adjunto_id: newAdjuntoId,
  };

  if (existingDatosFiscales) {
    // Siempre actualizamos al menos csf_adjunto_id cuando hay cambios aceptados.
    const { error: updDfErr } = await (userSupa.schema('erp') as any)
      .from('personas_datos_fiscales')
      .update(datosFiscalesPayload)
      .eq('id', existingDatosFiscales.id);
    if (updDfErr) {
      return NextResponse.json(
        {
          error: `update personas_datos_fiscales: ${updDfErr.message}`,
          partial: { new_adjunto_id: newAdjuntoId },
        },
        { status: 500 }
      );
    }
  } else {
    // No existe — primer update sobre persona legacy. INSERT con los campos
    // aceptados + csf_adjunto_id.
    const { error: insDfErr } = await (userSupa.schema('erp') as any)
      .from('personas_datos_fiscales')
      .insert({
        empresa_id,
        persona_id,
        ...datosFiscalesUpdates,
        csf_adjunto_id: newAdjuntoId,
      });
    if (insDfErr) {
      return NextResponse.json(
        {
          error: `insert personas_datos_fiscales: ${insDfErr.message}`,
          partial: { new_adjunto_id: newAdjuntoId },
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    new_adjunto_id: newAdjuntoId,
    fields_updated: accepted_fields.length,
    csf_pointer_updated: true,
  });
}
