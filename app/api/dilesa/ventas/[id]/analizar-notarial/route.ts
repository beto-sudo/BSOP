/**
 * POST /api/dilesa/ventas/[id]/analizar-notarial
 *
 * Análisis IA automático de los documentos del notario (Fase 8 — Dictaminada):
 * Carta de Instrucción Notarial y Condiciones Financieras (Anexo B). Extrae
 * los montos/datos que le interesan a DILESA y devuelve verificaciones
 * cruzadas contra la venta (lógica pura en `lib/dilesa/notarial-ai/verificar.ts`).
 *
 * Dos modos:
 *   1. multipart/form-data con `file` — archivo recién seleccionado en la
 *      captura (aún no es adjunto). No persiste nada: la página precarga el
 *      form y el operador decide al guardar.
 *   2. JSON { adjunto_id } — documento YA cargado (típico: el notario lo
 *      subió por su magic link). Se baja de Storage, se analiza UNA vez y el
 *      resultado se PERSISTE en `erp.adjuntos.metadata.analisis_notarial`
 *      para que la página lo muestre al instante en visitas futuras.
 *
 * Respuesta (ambos modos): { extraccion, verificaciones }.
 */
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { extraerDocNotarial, type NotarialExtraccion } from '@/lib/dilesa/notarial-ai/extraer';
import { verificarNotarial } from '@/lib/dilesa/notarial-ai/verificar';

export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;
const ROLES_ANALIZABLES = ['carta_instruccion_notarial', 'condiciones_financieras'];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createSupabaseServerClient();

  // Venta + contexto (RLS filtra el acceso).
  const { data: venta, error: vErr } = await sb
    .schema('dilesa')
    .from('ventas')
    .select('id, empresa_id, persona_id, unidad_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (vErr || !venta) {
    return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
  }

  // ── Resolver los bytes del PDF según el modo ─────────────────────────
  let pdfBytes: Uint8Array | null = null;
  let adjuntoId: string | null = null;

  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = (await req.json().catch(() => null)) as { adjunto_id?: string } | null;
    adjuntoId = body?.adjunto_id ?? null;
    if (!adjuntoId) {
      return NextResponse.json({ error: 'Falta adjunto_id' }, { status: 400 });
    }
    const { data: adj } = await sb
      .schema('erp')
      .from('adjuntos')
      .select('id, url, rol, entidad_tipo, entidad_id')
      .eq('id', adjuntoId)
      .maybeSingle();
    if (
      !adj ||
      adj.entidad_tipo !== 'venta' ||
      adj.entidad_id !== id ||
      !ROLES_ANALIZABLES.includes(adj.rol as string)
    ) {
      return NextResponse.json({ error: 'Adjunto no válido para esta venta' }, { status: 404 });
    }
    const { data: blob, error: dlErr } = await sb.storage
      .from('adjuntos')
      .download(adj.url as string);
    if (dlErr || !blob) {
      return NextResponse.json({ error: 'No se pudo leer el documento' }, { status: 502 });
    }
    pdfBytes = new Uint8Array(await blob.arrayBuffer());
  } else {
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Falta el archivo (campo `file`)' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Archivo mayor a 10 MB' }, { status: 413 });
    }
    pdfBytes = new Uint8Array(await file.arrayBuffer());
  }

  const [{ data: persona }, { data: unidad }, { data: empresa }, { data: cuentas }] =
    await Promise.all([
      sb
        .schema('erp')
        .from('personas')
        .select('nombre, apellido_paterno, apellido_materno, nss')
        .eq('id', venta.persona_id)
        .maybeSingle(),
      venta.unidad_id
        ? sb
            .schema('dilesa')
            .from('unidades')
            .select('manzana, numero_lote')
            .eq('id', venta.unidad_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      sb
        .schema('core')
        .from('empresas')
        .select('nombre, razon_social')
        .eq('id', venta.empresa_id)
        .maybeSingle(),
      sb
        .schema('erp')
        .from('cuentas_bancarias')
        .select('clabe')
        .eq('empresa_id', venta.empresa_id)
        .eq('activo', true),
    ]);

  let extraccion: NotarialExtraccion;
  try {
    extraccion = await extraerDocNotarial(pdfBytes);
  } catch (e) {
    return NextResponse.json(
      { error: `No se pudo analizar el documento: ${e instanceof Error ? e.message : 'error'}` },
      { status: 502 }
    );
  }

  const verificaciones = verificarNotarial(extraccion, {
    clienteNombre: [persona?.nombre, persona?.apellido_paterno, persona?.apellido_materno]
      .filter(Boolean)
      .join(' '),
    clienteNss: (persona?.nss as string | null) ?? null,
    unidadManzana: (unidad?.manzana as string | null) ?? null,
    unidadLote: (unidad?.numero_lote as string | null) ?? null,
    clabesEmpresa: ((cuentas ?? []) as { clabe: string | null }[])
      .map((c) => c.clabe ?? '')
      .filter(Boolean),
    razonesEmpresa: [empresa?.razon_social, empresa?.nombre].filter(Boolean) as string[],
  });

  // Modo adjunto: persistir el análisis en metadata para no re-analizar
  // (el write usa admin — RLS de adjuntos no contempla UPDATE de usuarios).
  if (adjuntoId) {
    const admin = getSupabaseAdminClient();
    if (admin) {
      const { data: adjMeta } = await admin
        .schema('erp')
        .from('adjuntos')
        .select('metadata')
        .eq('id', adjuntoId)
        .maybeSingle();
      const metadataActual = (adjMeta?.metadata as Record<string, unknown> | null) ?? {};
      await admin
        .schema('erp')
        .from('adjuntos')
        .update({
          metadata: {
            ...metadataActual,
            analisis_notarial: {
              extraccion,
              verificaciones,
              analizado_en: new Date().toISOString(),
            },
          },
        })
        .eq('id', adjuntoId);
    }
  }

  return NextResponse.json({ extraccion, verificaciones });
}
