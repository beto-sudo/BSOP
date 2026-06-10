/**
 * POST /api/dilesa/ventas/[id]/analizar-notarial
 *
 * Análisis IA automático de los documentos del notario (Fase 8 — Dictaminada):
 * Carta de Instrucción Notarial y Condiciones Financieras (Anexo B). Se invoca
 * al seleccionar el archivo en la captura — extrae los montos/datos que le
 * interesan a DILESA y devuelve verificaciones cruzadas contra la venta
 * (lógica pura en `lib/dilesa/notarial-ai/verificar.ts`).
 *
 * NO escribe nada: la página precarga el formulario con lo extraído y el
 * operador decide al guardar la fase.
 *
 * Body: multipart/form-data con `file` (PDF, máx 10 MB).
 * Respuesta: { extraccion, verificaciones }.
 */
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { extraerDocNotarial, type NotarialExtraccion } from '@/lib/dilesa/notarial-ai/extraer';
import { verificarNotarial } from '@/lib/dilesa/notarial-ai/verificar';

export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

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

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Falta el archivo (campo `file`)' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Archivo mayor a 10 MB' }, { status: 413 });
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
    extraccion = await extraerDocNotarial(new Uint8Array(await file.arrayBuffer()));
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

  return NextResponse.json({ extraccion, verificaciones });
}
