/* eslint-disable @typescript-eslint/no-explicit-any --
 * Los jsonb de `venta_fase_revisiones` (checks/extraccion) llevan shapes
 * con campos opcionales que el tipo `Json` generado no acepta; el cast es
 * deliberado (mismo patrón que otros endpoints erp/dilesa).
 */

/**
 * Revisión asistida del Aviso PLD de la Fase 13 (iniciativa
 * `dilesa-ventas-captura-colaborativa`, Sprint 3).
 *
 * POST — ejecuta la revisión sobre el Aviso PLD VIGENTE del expediente:
 *   1. Baja el PDF de storage y lo manda a Claude (visión) con el schema de
 *      extracción (`lib/dilesa/captura/pld-revision.ts`).
 *   2. Cruza DETERMINISTA los 10 checks contra el expediente (venta,
 *      cliente, unidad, escritura F11, avalúo F5, depósitos CxC).
 *   3. Persiste la corrida en `dilesa.venta_fase_revisiones` (append-only,
 *      ligada al adjunto exacto) + `core.audit_log`.
 *   Si la extracción IA falla, la corrida queda `estado='error'` — la
 *   operación no se atora: el cierre admite override de Dirección.
 *
 * GET — última revisión de la venta para la fase + si sigue vigente (el
 * adjunto revisado es el PLD vigente del expediente).
 *
 * Auth: miembro activo de DILESA o admin global.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { generateObject } from 'ai';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { anthropic, ensurePdfFitsForClaude, MODELO_CLAUDE } from '@/lib/documentos/extraction-core';
import { getNotaria } from '@/lib/dilesa/notarios';
import { getAdjuntoPath } from '@/lib/adjuntos';
import {
  cruzarPldConExpediente,
  ExtraccionPldSchema,
  PROMPT_EXTRACCION_PLD,
  veredictoDe,
  type ExpedientePld,
} from '@/lib/dilesa/captura/pld-revision';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Params = { params: Promise<{ ventaId: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FASE = 13;

type AuthResult =
  | { ok: true; userId: string; admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>> }
  | { ok: false; res: NextResponse };

async function autorizar(ventaId: string): Promise<AuthResult> {
  if (!UUID_RE.test(ventaId)) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: 'Venta inválida.' }, { status: 400 }),
    };
  }
  const userSupa = await createSupabaseServerClient();
  const {
    data: { user },
  } = await userSupa.auth.getUser();
  if (!user) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: 'No autenticado.' }, { status: 401 }),
    };
  }
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: 'Configuración de servidor incompleta.' },
        { status: 500 }
      ),
    };
  }
  const [{ data: u }, { data: mem }] = await Promise.all([
    admin.schema('core').from('usuarios').select('rol').eq('id', user.id).maybeSingle(),
    admin
      .schema('core')
      .from('usuarios_empresas')
      .select('usuario_id')
      .eq('usuario_id', user.id)
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .eq('activo', true)
      .maybeSingle(),
  ]);
  if (!mem && u?.rol !== 'admin') {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: 'Sin acceso a DILESA.' }, { status: 403 }),
    };
  }
  return { ok: true, userId: user.id, admin };
}

/** Adjunto vigente (más reciente) de un rol en el expediente de la venta. */
async function adjuntoVigente(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  ventaId: string,
  rol: string
): Promise<{ id: string; url: string; nombre: string } | null> {
  const { data } = await admin
    .schema('erp')
    .from('adjuntos')
    .select('id, url, nombre')
    .eq('empresa_id', DILESA_EMPRESA_ID)
    .eq('entidad_tipo', 'venta')
    .eq('entidad_id', ventaId)
    .eq('rol', rol)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string; url: string; nombre: string } | null) ?? null;
}

type RevisionRow = {
  id: string;
  adjunto_id: string | null;
  estado: string;
  veredicto: string;
  checks: unknown;
  extraccion: unknown;
  error_detalle: string | null;
  ejecutado_por: string | null;
  created_at: string;
};

async function ultimaRevision(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  ventaId: string
): Promise<RevisionRow | null> {
  const { data } = await (admin.schema('dilesa') as any)
    .from('venta_fase_revisiones')
    .select(
      'id, adjunto_id, estado, veredicto, checks, extraccion, error_detalle, ejecutado_por, created_at'
    )
    .eq('venta_id', ventaId)
    .eq('fase', FASE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as RevisionRow | null) ?? null;
}

async function nombreUsuario(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  userId: string | null
): Promise<string | null> {
  if (!userId) return null;
  const { data } = await admin
    .schema('core')
    .from('usuarios')
    .select('first_name, last_name, email')
    .eq('id', userId)
    .maybeSingle();
  if (!data) return null;
  const completo = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
  return completo || data.email || null;
}

function revisionDto(r: RevisionRow, ejecutadoPorNombre: string | null, vigente: boolean) {
  return {
    id: r.id,
    adjuntoId: r.adjunto_id,
    estado: r.estado,
    veredicto: r.veredicto,
    checks: r.checks,
    errorDetalle: r.error_detalle,
    ejecutadoPorNombre,
    createdAt: r.created_at,
    vigente,
  };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { ventaId } = await params;
  const auth = await autorizar(ventaId);
  if (!auth.ok) return auth.res;

  const [revision, pld] = await Promise.all([
    ultimaRevision(auth.admin, ventaId),
    adjuntoVigente(auth.admin, ventaId, 'aviso_pld'),
  ]);
  if (!revision) {
    return NextResponse.json({ ok: true, revision: null, tienePld: !!pld });
  }
  const nombre = await nombreUsuario(auth.admin, revision.ejecutado_por);
  const vigente = !!pld && revision.adjunto_id === pld.id;
  return NextResponse.json({
    ok: true,
    revision: revisionDto(revision, nombre, vigente),
    tienePld: !!pld,
  });
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { ventaId } = await params;
  const auth = await autorizar(ventaId);
  if (!auth.ok) return auth.res;
  const { admin, userId } = auth;

  // El PLD vigente del expediente (la revisión queda ligada a ESTA versión).
  const pld = await adjuntoVigente(admin, ventaId, 'aviso_pld');
  if (!pld) {
    return NextResponse.json(
      { ok: false, error: 'El expediente no tiene Aviso PLD — súbelo primero.' },
      { status: 400 }
    );
  }

  // ── Expediente para el cruce ─────────────────────────────────────
  const { data: ventaRow } = await admin
    .schema('dilesa')
    .from('ventas')
    .select(
      'id, empresa_id, persona_id, unidad_id, notario_id, valor_escrituracion, monto_avaluo, numero_escritura, fecha_escritura'
    )
    .eq('id', ventaId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!ventaRow) {
    return NextResponse.json({ ok: false, error: 'Venta no encontrada.' }, { status: 404 });
  }
  const venta = ventaRow as {
    id: string;
    empresa_id: string;
    persona_id: string;
    unidad_id: string | null;
    notario_id: string | null;
    valor_escrituracion: number | null;
    monto_avaluo: number | null;
    numero_escritura: string | null;
    fecha_escritura: string | null;
  };

  const [{ data: empresa }, { data: persona }, { data: unidad }, notaria, { data: abonos }] =
    await Promise.all([
      admin.schema('core').from('empresas').select('rfc').eq('id', DILESA_EMPRESA_ID).maybeSingle(),
      admin
        .schema('erp')
        .from('personas')
        .select('nombre, apellido_paterno, apellido_materno, rfc')
        .eq('id', venta.persona_id)
        .maybeSingle(),
      venta.unidad_id
        ? admin
            .schema('dilesa')
            .from('unidades')
            .select('calle, numero_oficial, area_m2, m2_construccion')
            .eq('id', venta.unidad_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      venta.notario_id ? getNotaria(admin, venta.notario_id) : Promise.resolve(null),
      admin
        .schema('erp')
        .from('cxc_pagos')
        .select('monto_total')
        .eq('origen_tipo', 'venta_dilesa')
        .eq('origen_id', ventaId)
        .is('deleted_at', null),
    ]);

  const expediente: ExpedientePld = {
    empresaRfc: String((empresa as { rfc: string | null } | null)?.rfc ?? ''),
    clienteNombre: (persona as { nombre: string | null } | null)?.nombre ?? null,
    clienteApellidoPaterno:
      (persona as { apellido_paterno: string | null } | null)?.apellido_paterno ?? null,
    clienteApellidoMaterno:
      (persona as { apellido_materno: string | null } | null)?.apellido_materno ?? null,
    clienteRfc: (persona as { rfc: string | null } | null)?.rfc ?? null,
    valorEscrituracion: venta.valor_escrituracion,
    montoAvaluo: venta.monto_avaluo,
    numeroEscritura: venta.numero_escritura,
    fechaEscritura: venta.fecha_escritura,
    numeroNotaria: notaria?.numeroNotaria ?? null,
    unidadCalle: (unidad as { calle: string | null } | null)?.calle ?? null,
    unidadNumeroOficial:
      (unidad as { numero_oficial: string | null } | null)?.numero_oficial ?? null,
    unidadM2Terreno: (unidad as { area_m2: number | null } | null)?.area_m2 ?? null,
    unidadM2Construccion:
      (unidad as { m2_construccion: number | null } | null)?.m2_construccion ?? null,
    depositos: ((abonos ?? []) as { monto_total: number | null }[]).map((a) =>
      Number(a.monto_total ?? 0)
    ),
  };

  // ── PDF → extracción IA → cruce ──────────────────────────────────
  const path = getAdjuntoPath(pld.url);
  const { data: blob, error: dlErr } = await admin.storage.from('adjuntos').download(path ?? '');
  if (dlErr || !blob) {
    return NextResponse.json(
      { ok: false, error: `No se pudo descargar el PLD del expediente: ${dlErr?.message ?? ''}` },
      { status: 500 }
    );
  }

  const insertarRevision = async (fila: Record<string, unknown>) => {
    const { data, error } = await (admin.schema('dilesa') as any)
      .from('venta_fase_revisiones')
      .insert({
        empresa_id: DILESA_EMPRESA_ID,
        venta_id: ventaId,
        fase: FASE,
        adjunto_id: pld.id,
        modelo: MODELO_CLAUDE,
        ejecutado_por: userId,
        ...fila,
      })
      .select(
        'id, adjunto_id, estado, veredicto, checks, extraccion, error_detalle, ejecutado_por, created_at'
      )
      .single();
    if (error) throw new Error(error.message);
    return data as RevisionRow;
  };

  try {
    const pdf = await ensurePdfFitsForClaude(new Uint8Array(await blob.arrayBuffer()));
    const { object: extraccion } = await generateObject({
      model: anthropic(MODELO_CLAUDE),
      schema: ExtraccionPldSchema,
      maxRetries: 2,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT_EXTRACCION_PLD },
            { type: 'file', data: pdf, mediaType: 'application/pdf' },
          ],
        },
      ],
    });

    const checks = cruzarPldConExpediente(extraccion, expediente);
    const veredicto = veredictoDe(checks);
    const revision = await insertarRevision({
      estado: 'completada',
      veredicto,
      checks,
      extraccion,
    });

    await admin
      .schema('core')
      .from('audit_log')
      .insert({
        empresa_id: DILESA_EMPRESA_ID,
        usuario_id: userId,
        accion: 'fase13_revision_pld',
        tabla: 'dilesa.venta_fase_revisiones',
        registro_id: revision.id,
        datos_nuevos: { venta_id: ventaId, veredicto, adjunto_id: pld.id },
      });

    const nombre = await nombreUsuario(admin, userId);
    return NextResponse.json({ ok: true, revision: revisionDto(revision, nombre, true) });
  } catch (e) {
    // La IA falló (timeout, modelo, PDF ilegible): registrar la corrida en
    // error — el cierre sigue posible vía override de Dirección.
    const detalle = (e as Error).message;
    try {
      const revision = await insertarRevision({
        estado: 'error',
        veredicto: 'rojo',
        checks: [],
        error_detalle: detalle,
      });
      const nombre = await nombreUsuario(admin, userId);
      return NextResponse.json(
        {
          ok: false,
          error: `La revisión no pudo completarse: ${detalle}`,
          revision: revisionDto(revision, nombre, true),
        },
        { status: 502 }
      );
    } catch {
      return NextResponse.json(
        { ok: false, error: `La revisión no pudo completarse: ${detalle}` },
        { status: 502 }
      );
    }
  }
}
