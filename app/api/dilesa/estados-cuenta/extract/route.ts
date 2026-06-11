/* eslint-disable @typescript-eslint/no-explicit-any --
 * supabase-js solo tipa el schema `public` por default; para leer `erp`
 * usamos `as any` (mismo patrón que app/api/documentos/[id]/extract).
 */

/**
 * POST /api/dilesa/estados-cuenta/extract
 *
 * Extrae la carátula de un estado de cuenta bancario ya subido al bucket
 * `adjuntos` y sugiere a qué cuenta DILESA pertenece (match por CLABE /
 * número de cuenta / contrato). Iniciativa `conciliacion-bancaria` v0.
 *
 * Body: { path: string } — path dentro del bucket, bajo dilesa/estados_cuenta/.
 * Respuesta: { extraccion, cuentaSugeridaId } — el drawer prellena el form y
 * el humano confirma antes de guardar (la IA propone, no decide).
 *
 * Auth: sesión requerida + acceso a cuentas DILESA vía RLS (si el user client
 * no puede leer las cuentas de DILESA, 403). El download usa admin client
 * (bucket privado), seguro porque el path está constrainted al prefijo.
 */

import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { ensurePdfFitsForClaude } from '@/lib/documentos/extraction-core';
import { extraerEstadoCuentaIA } from '@/lib/dilesa/estados-cuenta/extraer';
import { cuentaMatchExtraccion } from '@/components/dilesa/estados-cuenta-utils';

export const runtime = 'nodejs';
export const maxDuration = 300;

const BUCKET = 'adjuntos';
const PATH_PREFIX = 'dilesa/estados_cuenta/';

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Servidor sin ANTHROPIC_API_KEY configurada.' },
      { status: 500 }
    );
  }

  let body: { path?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido.' }, { status: 400 });
  }

  const path = body.path?.trim() ?? '';
  if (!path.startsWith(PATH_PREFIX) || path.includes('..')) {
    return NextResponse.json({ error: `El path debe vivir bajo ${PATH_PREFIX}.` }, { status: 400 });
  }

  // 1) Autenticación + autorización: el user debe poder leer cuentas DILESA
  //    (RLS por empresa). Las cuentas además alimentan el match.
  const userSupa = await createSupabaseServerClient();
  const {
    data: { user },
  } = await userSupa.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { data: cuentas, error: cuentasErr } = await (userSupa.schema('erp') as any)
    .from('cuentas_bancarias')
    .select('id, nombre, clabe, numero_cuenta, contrato')
    .eq('activo', true);
  if (cuentasErr) {
    return NextResponse.json({ error: `fetch cuentas: ${cuentasErr.message}` }, { status: 500 });
  }
  if (!cuentas || cuentas.length === 0) {
    return NextResponse.json({ error: 'Sin acceso a cuentas bancarias.' }, { status: 403 });
  }

  // 2) Download del PDF (admin client — bucket privado).
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server config error (admin client)' }, { status: 500 });
  }
  const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(path);
  if (dlErr || !blob) {
    return NextResponse.json(
      { error: `No se pudo descargar el PDF: ${dlErr?.message ?? 'desconocido'}` },
      { status: 500 }
    );
  }

  // 3) Extracción IA (PDF completo; comprime si excede el límite de Anthropic).
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const pdf = await ensurePdfFitsForClaude(bytes);
    const extraccion = await extraerEstadoCuentaIA(pdf);

    // 4) Match contra las cuentas visibles del user.
    const sugerida = (cuentas as Array<Record<string, string | null>>).find(
      (c) =>
        cuentaMatchExtraccion(
          {
            clabe: c.clabe ?? null,
            numeroCuenta: c.numero_cuenta ?? null,
            contrato: c.contrato ?? null,
          },
          extraccion
        ) === true
    );

    return NextResponse.json({
      extraccion,
      cuentaSugeridaId: sugerida?.id ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Extracción falló: ${msg}` }, { status: 500 });
  }
}
