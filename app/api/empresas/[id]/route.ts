/* eslint-disable @typescript-eslint/no-explicit-any --
 * supabase-js solo tipa el schema `public`; para `core` usamos `as any`.
 */

/**
 * PATCH /api/empresas/[id]
 *
 * Actualiza campos sueltos de `core.empresas` que NO vienen del CSF y NO son
 * branding. Hoy v1 cubre `registro_patronal_imss` (capturado a mano para
 * contratos LFT) — el endpoint queda extensible para otros campos futuros
 * con el mismo patrón.
 *
 * Para refrescar campos del CSF: usar `[id]/update-csf` con PDF.
 * Para branding (colores/logos): hay otro flujo en `EmpresaBranding`.
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

const PayloadSchema = z
  .object({
    registro_patronal_imss: RegistroPatronalSchema.optional(),
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
