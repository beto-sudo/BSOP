/**
 * POST /api/dilesa/ventas/[id]/analizar-notarial
 *
 * Análisis IA automático de los documentos del notario (Fase 8 — Dictaminada):
 * Carta de Instrucción Notarial y Condiciones Financieras (Anexo B). Se invoca
 * al seleccionar el archivo en la captura — extrae los montos/datos que le
 * interesan a DILESA y devuelve verificaciones cruzadas contra la venta.
 *
 * NO escribe nada: la página precarga el formulario con lo extraído y el
 * operador decide al guardar la fase.
 *
 * Body: multipart/form-data con `file` (PDF, máx 10 MB).
 * Respuesta: { extraccion, verificaciones }.
 *
 * Verificaciones (true=coincide, false=NO coincide, null=sin datos para comparar):
 *   - nss_coincide        vs erp.personas.nss del comprador
 *   - nombre_coincide     vs nombre completo del comprador
 *   - domicilio_coincide  vs manzana/lote de la unidad asignada
 *   - clabe_es_dilesa     vs CLABEs de erp.cuentas_bancarias de DILESA (anti-fraude:
 *                         el depósito de la detonación debe caer en cuenta propia)
 *   - vendedor_es_dilesa  vs razón social de la empresa
 */
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { extraerDocNotarial, type NotarialExtraccion } from '@/lib/dilesa/notarial-ai/extraer';

export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

const soloDigitos = (s: string): string => s.replace(/\D/g, '');

export type VerificacionesNotarial = {
  nss_coincide: boolean | null;
  nombre_coincide: boolean | null;
  domicilio_coincide: boolean | null;
  clabe_es_dilesa: boolean | null;
  vendedor_es_dilesa: boolean | null;
};

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
            .select('manzana, numero_lote, calle, numero_oficial')
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

  // ── Verificaciones cruzadas ─────────────────────────────────────────
  const nombreCliente = norm(
    [persona?.nombre, persona?.apellido_paterno, persona?.apellido_materno]
      .filter(Boolean)
      .join(' ')
  );
  const nombreExtraido = norm(extraccion.nombre_titular);
  // El orden varía (APELLIDOS NOMBRE vs NOMBRE APELLIDOS) → comparamos tokens.
  const nombre_coincide =
    nombreExtraido && nombreCliente
      ? nombreCliente
          .split(' ')
          .filter((t) => t.length > 2)
          .every((t) => nombreExtraido.includes(t))
      : null;

  const nssExtraido = soloDigitos(extraccion.nss);
  const nssCliente = soloDigitos(persona?.nss ?? '');
  const nss_coincide = nssExtraido && nssCliente ? nssExtraido === nssCliente : null;

  const domicilioExtraido = norm(extraccion.domicilio_inmueble);
  const mz = (unidad?.manzana ?? '').toString().replace(/^0+/, '');
  const lt = (unidad?.numero_lote ?? '').toString().replace(/^0+/, '');
  const domicilio_coincide =
    domicilioExtraido && mz && lt
      ? new RegExp(`\\bMZ\\.? ?0*${mz}\\b`).test(domicilioExtraido) &&
        new RegExp(`\\bLT\\.? ?0*${lt}\\b`).test(domicilioExtraido)
      : null;

  const clabeExtraida = soloDigitos(extraccion.clabe_beneficiario);
  const clabesDilesa = new Set(
    ((cuentas ?? []) as { clabe: string | null }[])
      .map((c) => soloDigitos(c.clabe ?? ''))
      .filter((c) => c.length === 18)
  );
  const clabe_es_dilesa =
    clabeExtraida.length === 18 && clabesDilesa.size > 0 ? clabesDilesa.has(clabeExtraida) : null;

  const vendedorExtraido = norm(extraccion.vendedor);
  const razones = [empresa?.razon_social, empresa?.nombre]
    .filter(Boolean)
    .map((r) => norm(r as string));
  const vendedor_es_dilesa = vendedorExtraido
    ? razones.some(
        (r) =>
          r.includes(vendedorExtraido.slice(0, 25)) || vendedorExtraido.includes(r.slice(0, 25))
      )
    : null;

  const verificaciones: VerificacionesNotarial = {
    nss_coincide,
    nombre_coincide,
    domicilio_coincide,
    clabe_es_dilesa,
    vendedor_es_dilesa,
  };

  return NextResponse.json({ extraccion, verificaciones });
}
