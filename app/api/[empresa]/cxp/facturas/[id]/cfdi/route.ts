/**
 * GET /api/<empresa>/cxp/facturas/<id>/cfdi — desglose del CFDI on-read.
 *
 * El alta de CxP (upload-xml) persiste solo la cabecera fiscal y los totales en
 * `erp.facturas`; los conceptos (líneas) y la metadata fiscal extra del CFDI
 * NO se desnormalizan. Este endpoint baja el XML guardado en storage y lo
 * parsea al vuelo (sin LLM — `lib/cxp/cfdi-parser`) para que el drawer muestre
 * qué se compró sin tener que abrir el XML a mano. Funciona retroactivo para
 * toda factura que tenga su XML adjunto.
 *
 * Devuelve únicamente lo que la fila de `erp.facturas` no tiene: conceptos,
 * serie/folio, régimen del emisor, lugar de expedición, fecha de timbrado,
 * moneda/tipo de cambio, descuento global, tipo de comprobante y relacionados.
 *
 * Auth: sesión válida + miembro activo de la empresa (o admin global). El acceso
 * a la factura se acota por `empresa_id`; el XML solo se sirve si pertenece a
 * esa empresa (el proxy genérico /api/adjuntos NO scopea por empresa).
 */

import { NextResponse, type NextRequest } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { parseCfdiXml, CfdiParseError } from '@/lib/cxp/cfdi-parser';
import type { EmpresaSlug } from '@/lib/storage/path';

const EMPRESA_SLUGS: EmpresaSlug[] = ['dilesa', 'rdb', 'ansa', 'coagan'];

type Params = { params: Promise<{ empresa: string; id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { empresa: empresaSlug, id } = await params;
  if (!EMPRESA_SLUGS.includes(empresaSlug as EmpresaSlug)) {
    return NextResponse.json({ ok: false, error: 'Empresa inválida.' }, { status: 400 });
  }

  // Auth.
  const userSupa = await createSupabaseServerClient();
  const {
    data: { user },
  } = await userSupa.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'No autenticado.' }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: 'Configuración de servidor incompleta.' },
      { status: 500 }
    );
  }

  // Resolver empresa por slug.
  const { data: emp } = await admin
    .schema('core')
    .from('empresas')
    .select('id, slug')
    .eq('slug', empresaSlug)
    .maybeSingle();
  if (!emp) {
    return NextResponse.json({ ok: false, error: 'Empresa no encontrada.' }, { status: 404 });
  }

  // Acceso: miembro activo de la empresa o admin global (espejo de upload-xml).
  const [{ data: u }, { data: mem }] = await Promise.all([
    admin.schema('core').from('usuarios').select('rol').eq('id', user.id).maybeSingle(),
    admin
      .schema('core')
      .from('usuarios_empresas')
      .select('usuario_id')
      .eq('usuario_id', user.id)
      .eq('empresa_id', emp.id)
      .eq('activo', true)
      .maybeSingle(),
  ]);
  if (!mem && u?.rol !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Sin acceso a esta empresa.' }, { status: 403 });
  }

  // La factura debe existir y pertenecer a esta empresa.
  const { data: factura } = await admin
    .schema('erp')
    .from('facturas')
    .select('id, xml_url')
    .eq('id', id)
    .eq('empresa_id', emp.id)
    .maybeSingle();
  if (!factura) {
    return NextResponse.json({ ok: false, error: 'Factura no encontrada.' }, { status: 404 });
  }

  // Path del XML: la columna desnormalizada, o el adjunto con rol xml_cfdi.
  let xmlPath = factura.xml_url ?? null;
  if (!xmlPath) {
    const { data: adj } = await admin
      .schema('erp')
      .from('adjuntos')
      .select('url')
      .eq('entidad_tipo', 'cxp_factura')
      .eq('entidad_id', id)
      .eq('rol', 'xml_cfdi')
      .limit(1)
      .maybeSingle();
    xmlPath = adj?.url ?? null;
  }
  if (!xmlPath) {
    return NextResponse.json(
      { ok: false, error: 'La factura no tiene XML CFDI asociado.', code: 'sin_xml' },
      { status: 404 }
    );
  }

  // Bajar y parsear.
  const { data: blob, error: dlErr } = await admin.storage.from('adjuntos').download(xmlPath);
  if (dlErr || !blob) {
    return NextResponse.json(
      { ok: false, error: 'No se pudo leer el XML del CFDI.', code: 'sin_xml' },
      { status: 404 }
    );
  }

  let cfdi;
  try {
    cfdi = parseCfdiXml(await blob.text());
  } catch (e) {
    const msg = e instanceof CfdiParseError ? e.message : 'No se pudo interpretar el XML del CFDI.';
    return NextResponse.json({ ok: false, error: msg }, { status: 422 });
  }

  // Solo el delta sobre lo que la fila de erp.facturas ya expone.
  return NextResponse.json({
    ok: true,
    cfdi: {
      serie: cfdi.serie,
      folio: cfdi.folio,
      fechaTimbrado: cfdi.fechaTimbrado,
      regimenFiscalEmisor: cfdi.regimenFiscalEmisor,
      lugarExpedicion: cfdi.lugarExpedicion,
      tipoComprobante: cfdi.tipoComprobante,
      moneda: cfdi.moneda,
      tipoCambio: cfdi.tipoCambio,
      descuento: cfdi.descuento,
      conceptos: cfdi.conceptos,
      relacionados: cfdi.relacionados,
    },
  });
}
