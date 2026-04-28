/* eslint-disable @typescript-eslint/no-explicit-any --
 * supabase-js solo tipa `public`; para `core` y `erp` usamos `as any`.
 */

/**
 * GET /api/empresas/[id]/documentos
 * POST /api/empresas/[id]/documentos
 *
 * Sprint 3 — iniciativa `empresa-documentos-legales`.
 *
 * GET lista las asignaciones de la empresa agrupadas por rol con metadata
 * mínima del documento (titulo, numero_documento, fecha_emision, archivo_url,
 * subtipo_meta) y los flags de la asignación (es_default, asignado_at).
 *
 * POST asigna un documento existente con un rol. Si `es_default=true`, baja
 * el flag de los demás docs con el mismo rol antes de hacer el INSERT (uso
 * el partial unique index requiere atomicidad). Verifica que el documento
 * pertenece a la empresa — no se permite asignar docs de otra empresa.
 *
 * Side-effect: el sync_trigger en DB se encarga de proyectar el subtipo_meta
 * al jsonb caché en `core.empresas.escritura_*` para los roles que aplican
 * (`acta_constitutiva`, `poder_general_administracion`).
 *
 * Solo admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/empresas/admin-guard';
import { EMPRESA_DOCUMENTOS_ROLES } from '@/lib/empresa-documentos/cache-mapping';

export const runtime = 'nodejs';

const PostBodySchema = z
  .object({
    documento_id: z.string().uuid('documento_id debe ser UUID'),
    rol: z.enum(EMPRESA_DOCUMENTOS_ROLES),
    es_default: z.boolean().optional().default(false),
    notas: z.union([z.string(), z.null()]).optional(),
  })
  .strict();

type Params = { params: Promise<{ id: string }> };

// ─── GET ───────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
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

  // Verifica que la empresa existe (defensivo; admin podría llamar con id
  // inválido).
  const { data: empresa, error: empresaErr } = await (admin.schema('core') as any)
    .from('empresas')
    .select('id, slug')
    .eq('id', empresaId)
    .maybeSingle();
  if (empresaErr) {
    return NextResponse.json({ error: `lookup empresa: ${empresaErr.message}` }, { status: 500 });
  }
  if (!empresa) {
    return NextResponse.json({ error: 'Empresa no encontrada.' }, { status: 404 });
  }

  // Trae todas las asignaciones de la empresa.
  const { data: rows, error: rowsErr } = await (admin.schema('core') as any)
    .from('empresa_documentos')
    .select('id, documento_id, rol, es_default, asignado_por, asignado_at, notas, created_at')
    .eq('empresa_id', empresaId)
    .order('rol')
    .order('es_default', { ascending: false })
    .order('asignado_at', { ascending: false });

  if (rowsErr) {
    return NextResponse.json({ error: `fetch asignaciones: ${rowsErr.message}` }, { status: 500 });
  }

  type AsignacionRow = {
    id: string;
    documento_id: string;
    rol: string;
    es_default: boolean;
    asignado_por: string | null;
    asignado_at: string;
    notas: string | null;
    created_at: string;
  };

  const asignaciones = (rows ?? []) as AsignacionRow[];

  // Si no hay asignaciones, devolvemos estructura vacía (UI lo maneja).
  if (asignaciones.length === 0) {
    return NextResponse.json({ ok: true, empresa_id: empresaId, asignaciones: [] });
  }

  // Hidrata la metadata de los documentos asignados (cross-schema → no
  // podemos hacer JOIN de Supabase; segunda query con `.in()`).
  const documentoIds = Array.from(new Set(asignaciones.map((a) => a.documento_id)));

  type DocumentoRow = {
    id: string;
    titulo: string | null;
    numero_documento: string | null;
    fecha_emision: string | null;
    archivo_url: string | null;
    subtipo_meta: Record<string, unknown> | null;
    tipo: string | null;
    tipo_operacion: string | null;
    extraccion_status: string | null;
  };

  const { data: docsData, error: docsErr } = await (admin.schema('erp') as any)
    .from('documentos')
    .select(
      'id, titulo, numero_documento, fecha_emision, archivo_url, subtipo_meta, tipo, tipo_operacion, extraccion_status'
    )
    .in('id', documentoIds);

  if (docsErr) {
    return NextResponse.json({ error: `fetch documentos: ${docsErr.message}` }, { status: 500 });
  }

  const docsById = new Map<string, DocumentoRow>(
    ((docsData ?? []) as DocumentoRow[]).map((d) => [d.id, d])
  );

  return NextResponse.json({
    ok: true,
    empresa_id: empresaId,
    asignaciones: asignaciones.map((a) => ({
      ...a,
      documento: docsById.get(a.documento_id) ?? null,
    })),
  });
}

// ─── POST ──────────────────────────────────────────────────────────────────

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

  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `body JSON inválido: ${msg}` }, { status: 400 });
  }

  let payload;
  try {
    payload = PostBodySchema.parse(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `payload inválido: ${msg}` }, { status: 400 });
  }

  // Verifica empresa.
  const { data: empresa, error: empresaErr } = await (admin.schema('core') as any)
    .from('empresas')
    .select('id, slug')
    .eq('id', empresaId)
    .maybeSingle();
  if (empresaErr) {
    return NextResponse.json({ error: `lookup empresa: ${empresaErr.message}` }, { status: 500 });
  }
  if (!empresa) {
    return NextResponse.json({ error: 'Empresa no encontrada.' }, { status: 404 });
  }

  // Verifica que el documento pertenece a esta empresa (no se permite
  // asignar docs de otra empresa).
  const { data: documento, error: docErr } = await (admin.schema('erp') as any)
    .from('documentos')
    .select('id, empresa_id')
    .eq('id', payload.documento_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (docErr) {
    return NextResponse.json({ error: `lookup documento: ${docErr.message}` }, { status: 500 });
  }
  if (!documento) {
    return NextResponse.json({ error: 'Documento no encontrado.' }, { status: 404 });
  }
  if (documento.empresa_id !== empresaId) {
    return NextResponse.json({ error: 'El documento pertenece a otra empresa.' }, { status: 403 });
  }

  // Si la asignación pide es_default=true, baja el flag de los demás docs
  // del mismo rol primero (el partial UNIQUE index requiere unicidad).
  if (payload.es_default) {
    const { error: clearErr } = await (admin.schema('core') as any)
      .from('empresa_documentos')
      .update({ es_default: false, updated_at: new Date().toISOString() })
      .eq('empresa_id', empresaId)
      .eq('rol', payload.rol)
      .eq('es_default', true);
    if (clearErr) {
      return NextResponse.json(
        { error: `clear default previo: ${clearErr.message}` },
        { status: 500 }
      );
    }
  }

  // INSERT.
  const { data: inserted, error: insErr } = await (admin.schema('core') as any)
    .from('empresa_documentos')
    .insert({
      empresa_id: empresaId,
      documento_id: payload.documento_id,
      rol: payload.rol,
      es_default: payload.es_default ?? false,
      asignado_por: guard.usuario.id,
      notas: payload.notas ?? null,
    })
    .select('id, empresa_id, documento_id, rol, es_default, asignado_por, asignado_at, notas')
    .single();

  if (insErr) {
    // Conflicto típico: UNIQUE (empresa_id, documento_id, rol) — el doc ya
    // tiene ese rol asignado.
    const isConflict = /duplicate key|unique/i.test(insErr.message);
    return NextResponse.json(
      { error: `insert asignacion: ${insErr.message}` },
      { status: isConflict ? 409 : 500 }
    );
  }

  return NextResponse.json({ ok: true, asignacion: inserted });
}
