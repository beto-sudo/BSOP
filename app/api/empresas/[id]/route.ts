/* eslint-disable @typescript-eslint/no-explicit-any --
 * supabase-js solo tipa el schema `public`; para `core` usamos `as any`.
 */

/**
 * PATCH /api/empresas/[id]
 *
 * Actualiza campos sueltos de `core.empresas`. Cubre dos casos:
 *
 *   1. **Captura manual**: campos que no vienen del CSF y se editan a mano,
 *      como `registro_patronal_imss` (formato `A0000000000` para LFT).
 *   2. **Override manual de campos del CSF**: el operador puede corregir RFC,
 *      razón social, domicilio, fechas, etc. sin re-subir el PDF — útil para
 *      typos del SAT o ajustes operativos. El flujo "Actualizar CSF" sigue
 *      siendo la fuente preferida cuando hay PDF disponible.
 *
 * Para branding (colores/logos): hay otro flujo en `EmpresaBranding`.
 * Para `actividades_economicas` / `obligaciones_fiscales` (jsonb), hoy se
 * sobrescriben sólo vía CSF — la edición manual de esos arrays queda fuera
 * de este endpoint v1.
 *
 * Solo admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/empresas/admin-guard';

export const runtime = 'nodejs';

// `registro_patronal_imss` formato SAT/IMSS: 1 letra + 10 dígitos.
// Permitimos null/cadena vacía para limpiar el campo.
const RegistroPatronalSchema = z
  .union([
    z
      .string()
      .regex(/^[A-Z]\d{10}$/, 'registro_patronal_imss inválido (formato esperado: A0000000000)'),
    z.literal(''),
    z.null(),
  ])
  .transform((v) => (v === '' ? null : v));

// Campo de texto editable: acepta string, '' o null. Cadena vacía → null.
const editableText = z
  .union([z.string(), z.null()])
  .transform((v) => (v === '' || v == null ? null : v));

// Escritura (constitutiva o poder): jsonb con 5 campos básicos requeridos por
// `lib/rh/datos-fiscales-empresa.ts` para alta de empleados y contratos LFT.
// Acepta objeto literal o `null` para limpiar la escritura completa.
const escrituraJsonbSchema = z
  .union([
    z
      .object({
        numero: z.union([z.string(), z.null()]).optional(),
        fecha: z.union([z.string(), z.null()]).optional(),
        fecha_texto: z.union([z.string(), z.null()]).optional(),
        notario: z.union([z.string(), z.null()]).optional(),
        notaria_numero: z.union([z.string(), z.null()]).optional(),
        distrito: z.union([z.string(), z.null()]).optional(),
      })
      .strict(),
    z.null(),
  ])
  .transform((obj) => {
    if (obj == null) return null;
    // Normaliza '' → null en cada campo y descarta la escritura completa si
    // todos los campos quedaron vacíos (mejor null que jsonb con todo blank).
    const norm: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(obj)) {
      norm[k] = v == null || v === '' ? null : v;
    }
    const allBlank = Object.values(norm).every((v) => v == null);
    return allBlank ? null : norm;
  });

const PayloadSchema = z
  .object({
    registro_patronal_imss: RegistroPatronalSchema.optional(),
    // Identidad fiscal (override manual si el CSF está mal o sin PDF).
    rfc: editableText.optional(),
    curp: editableText.optional(),
    razon_social: editableText.optional(),
    regimen_capital: editableText.optional(),
    nombre_comercial: editableText.optional(),
    fecha_inicio_operaciones: editableText.optional(),
    estatus_sat: editableText.optional(),
    id_cif: editableText.optional(),
    regimen_fiscal: editableText.optional(),
    csf_fecha_emision: editableText.optional(),
    // Domicilio fiscal.
    domicilio_calle: editableText.optional(),
    domicilio_numero_ext: editableText.optional(),
    domicilio_numero_int: editableText.optional(),
    domicilio_colonia: editableText.optional(),
    domicilio_localidad: editableText.optional(),
    domicilio_municipio: editableText.optional(),
    domicilio_estado: editableText.optional(),
    domicilio_cp: editableText.optional(),
    // Datos legales para alta de empleados (validados por
    // `lib/rh/datos-fiscales-empresa.ts`).
    representante_legal: editableText.optional(),
    escritura_constitutiva: escrituraJsonbSchema.optional(),
    escritura_poder: escrituraJsonbSchema.optional(),
  })
  .strict();

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `body JSON inválido: ${msg}` }, { status: 400 });
  }

  let payload;
  try {
    payload = PayloadSchema.parse(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `payload inválido: ${msg}` }, { status: 400 });
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: 'No hay campos para actualizar.' }, { status: 400 });
  }

  // Verifica que la empresa existe.
  const { data: empresa, error: lookupErr } = await (admin.schema('core') as any)
    .from('empresas')
    .select('id, slug')
    .eq('id', empresaId)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json({ error: `lookup empresa: ${lookupErr.message}` }, { status: 500 });
  }
  if (!empresa) {
    return NextResponse.json({ error: 'Empresa no encontrada.' }, { status: 404 });
  }

  const { error: updErr } = await (admin.schema('core') as any)
    .from('empresas')
    .update(payload)
    .eq('id', empresaId);

  if (updErr) {
    return NextResponse.json({ error: `update empresa: ${updErr.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    empresa_id: empresaId,
    fields_updated: Object.keys(payload),
  });
}
