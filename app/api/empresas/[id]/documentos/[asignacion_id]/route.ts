/* eslint-disable @typescript-eslint/no-explicit-any --
 * supabase-js solo tipa `public`; para `core` usamos `as any`.
 */

/**
 * PATCH /api/empresas/[id]/documentos/[asignacion_id]
 * DELETE /api/empresas/[id]/documentos/[asignacion_id]
 *
 * Sprint 3 — iniciativa `empresa-documentos-legales`.
 *
 * PATCH actualiza es_default y/o notas de una asignación existente. Si pasa
 * es_default=true, baja el flag de los demás docs del mismo rol antes del
 * UPDATE (atomicidad por partial UNIQUE index).
 *
 * DELETE desasigna (hard delete del row). Importante: solo borra la
 * asignación — el documento original en `erp.documentos` queda intacto.
 *
 * El sync_trigger en DB se encarga de actualizar el caché jsonb en
 * `core.empresas.escritura_*` cuando cambia el es_default de los roles
 * `acta_constitutiva` o `poder_general_administracion`.
 *
 * Solo admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/empresas/admin-guard';

export const runtime = 'nodejs';

const PatchBodySchema = z
  .object({
    es_default: z.boolean().optional(),
    notas: z.union([z.string(), z.null()]).optional(),
  })
  .strict();

type Params = { params: Promise<{ id: string; asignacion_id: string }> };

// ─── PATCH ─────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: empresaId, asignacion_id: asignacionId } = await params;

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
    payload = PatchBodySchema.parse(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `payload inválido: ${msg}` }, { status: 400 });
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: 'No hay campos para actualizar.' }, { status: 400 });
  }

  // Verifica que la asignación existe y pertenece a la empresa.
  const { data: asignacion, error: lookupErr } = await (admin.schema('core') as any)
    .from('empresa_documentos')
    .select('id, empresa_id, rol, es_default')
    .eq('id', asignacionId)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json({ error: `lookup asignacion: ${lookupErr.message}` }, { status: 500 });
  }
  if (!asignacion) {
    return NextResponse.json({ error: 'Asignación no encontrada.' }, { status: 404 });
  }
  if (asignacion.empresa_id !== empresaId) {
    return NextResponse.json({ error: 'La asignación pertenece a otra empresa.' }, { status: 403 });
  }

  // Si va a setear es_default=true y aún no lo está, primero baja el flag
  // del actual default para evitar choque con el partial UNIQUE.
  if (payload.es_default === true && !asignacion.es_default) {
    const { error: clearErr } = await (admin.schema('core') as any)
      .from('empresa_documentos')
      .update({ es_default: false, updated_at: new Date().toISOString() })
      .eq('empresa_id', empresaId)
      .eq('rol', asignacion.rol)
      .eq('es_default', true);
    if (clearErr) {
      return NextResponse.json(
        { error: `clear default previo: ${clearErr.message}` },
        { status: 500 }
      );
    }
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if ('es_default' in payload) updates.es_default = payload.es_default;
  if ('notas' in payload) updates.notas = payload.notas;

  const { error: updErr } = await (admin.schema('core') as any)
    .from('empresa_documentos')
    .update(updates)
    .eq('id', asignacionId);

  if (updErr) {
    return NextResponse.json({ error: `update: ${updErr.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    asignacion_id: asignacionId,
    fields_updated: Object.keys(updates).filter((k) => k !== 'updated_at'),
  });
}

// ─── DELETE ────────────────────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id: empresaId, asignacion_id: asignacionId } = await params;

  const userSupa = await createSupabaseServerClient();
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server config error (admin client)' }, { status: 500 });
  }

  const guard = await requireAdmin(userSupa, admin);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { data: asignacion, error: lookupErr } = await (admin.schema('core') as any)
    .from('empresa_documentos')
    .select('id, empresa_id')
    .eq('id', asignacionId)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json({ error: `lookup asignacion: ${lookupErr.message}` }, { status: 500 });
  }
  if (!asignacion) {
    return NextResponse.json({ error: 'Asignación no encontrada.' }, { status: 404 });
  }
  if (asignacion.empresa_id !== empresaId) {
    return NextResponse.json({ error: 'La asignación pertenece a otra empresa.' }, { status: 403 });
  }

  const { error: delErr } = await (admin.schema('core') as any)
    .from('empresa_documentos')
    .delete()
    .eq('id', asignacionId);

  if (delErr) {
    return NextResponse.json({ error: `delete: ${delErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, asignacion_id: asignacionId, deleted: true });
}
