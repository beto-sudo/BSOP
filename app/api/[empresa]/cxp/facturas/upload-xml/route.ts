/**
 * POST /api/<empresa>/cxp/facturas/upload-xml — ingesta de facturas de egreso
 * desde XML CFDI (CxP Sprint 2, iniciativa `cxp`).
 *
 * Acepta 1..N archivos XML (campo `file` del FormData → bulk). Por cada uno:
 *   1. Parsea el CFDI (determinista, lib/cxp/cfdi-parser — sin LLM).
 *   2. Valida que el receptor del CFDI sea esta empresa (por RFC).
 *   3. Dedup por folio fiscal (uuid_sat).
 *   4. Matchea el emisor con un proveedor (persona por RFC); si no existe, la
 *      factura se crea igual con proveedor nulo y se sugiere el alta del
 *      proveedor (carga inclusiva — "mejor capturar de más", planning cxp).
 *   5. Da de alta la factura vía `erp.cxp_factura_alta` (RPC, dedup defensivo).
 *   6. Sube el XML a storage (`adjuntos`) + registra `erp.adjuntos` + `xml_url`.
 *
 * Devuelve un resultado por archivo (éxito o error) para no abortar el lote
 * completo por un XML malo.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { buildAdjuntoPath, type EmpresaSlug } from '@/lib/storage/path';
import { parseCfdiXml, CfdiParseError } from '@/lib/cxp/cfdi-parser';

const EMPRESA_SLUGS: EmpresaSlug[] = ['dilesa', 'rdb', 'ansa', 'coagan'];

type Params = { params: Promise<{ empresa: string }> };

type FacturaResult = {
  filename: string;
  ok: boolean;
  facturaId?: string;
  uuid?: string | null;
  proveedorId?: string | null;
  /** Si el emisor no matcheó un proveedor existente, se sugiere darlo de alta. */
  proveedorSugerido?: { rfc: string; nombre: string | null } | null;
  error?: string;
};

export async function POST(req: NextRequest, { params }: Params) {
  const { empresa: empresaSlug } = await params;
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
    .select('id, rfc, slug')
    .eq('slug', empresaSlug)
    .maybeSingle();
  if (!emp) {
    return NextResponse.json({ ok: false, error: 'Empresa no encontrada.' }, { status: 404 });
  }

  // Acceso: miembro activo de la empresa o admin global.
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

  // Archivos (1..N).
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Cuerpo inválido (se esperaba multipart).' },
      {
        status: 400,
      }
    );
  }
  const files = form.getAll('file').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'No se adjuntaron archivos XML.' },
      {
        status: 400,
      }
    );
  }

  const empresaRfc = String(emp.rfc ?? '')
    .toUpperCase()
    .trim();
  const results: FacturaResult[] = [];

  for (const file of files) {
    const r: FacturaResult = { filename: file.name, ok: false };
    try {
      const cfdi = parseCfdiXml(await file.text());

      // El receptor del CFDI debe ser esta empresa.
      if (empresaRfc && cfdi.receptorRfc !== empresaRfc) {
        r.error = `El CFDI es para el RFC ${cfdi.receptorRfc}, no para ${empresaSlug} (${empresaRfc}).`;
        results.push(r);
        continue;
      }

      // Dedup por folio fiscal.
      if (cfdi.uuid) {
        const { data: dup } = await admin
          .schema('erp')
          .from('facturas')
          .select('id')
          .eq('uuid_sat', cfdi.uuid)
          .maybeSingle();
        if (dup) {
          r.uuid = cfdi.uuid;
          r.error = `Ya existe una factura con folio fiscal ${cfdi.uuid}.`;
          results.push(r);
          continue;
        }
      }

      // Emisor → proveedor (persona por RFC).
      const { data: prov } = await admin
        .schema('erp')
        .from('personas')
        .select('id')
        .eq('rfc', cfdi.emisorRfc)
        .maybeSingle();
      const proveedorId: string | null = prov?.id ?? null;

      // Alta de la factura (RPC SECURITY DEFINER).
      const { data: facturaId, error: rpcErr } = await admin.schema('erp').rpc('cxp_factura_alta', {
        // p_proveedor_id es posicionalmente requerido en el SQL pero la
        // columna acepta NULL: el cast permite pasar null cuando el emisor
        // no matchea un proveedor existente (carga inclusiva).
        p_empresa_id: emp.id,
        p_proveedor_id: proveedorId as string,
        p_total: cfdi.total,
        p_subtotal: cfdi.subtotal,
        p_iva: cfdi.ivaTrasladado,
        p_fecha_emision: cfdi.fecha || undefined,
        p_uuid_sat: cfdi.uuid ?? undefined,
        p_emisor_rfc: cfdi.emisorRfc,
        p_emisor_nombre: cfdi.emisorNombre ?? undefined,
        p_receptor_rfc: cfdi.receptorRfc,
        p_forma_pago_sat: cfdi.formaPago ?? undefined,
        p_metodo_pago_sat:
          cfdi.metodoPago === 'PUE' || cfdi.metodoPago === 'PPD' ? cfdi.metodoPago : undefined,
        p_uso_cfdi: cfdi.usoCfdi ?? undefined,
        p_tasa_iva: cfdi.tasaIva ?? undefined,
        p_retencion_iva: cfdi.retencionIva,
        p_retencion_isr: cfdi.retencionIsr,
      });
      if (rpcErr) {
        r.error = rpcErr.message;
        results.push(r);
        continue;
      }

      // Guardar el XML + registrar adjunto + xml_url (best-effort; la factura
      // ya quedó creada aunque el storage falle).
      const path = buildAdjuntoPath({
        empresa: empresaSlug as EmpresaSlug,
        entidad: 'facturas',
        entidadId: facturaId as string,
        filename: file.name,
      });
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error: upErr } = await admin.storage
        .from('adjuntos')
        .upload(path, bytes, { contentType: 'application/xml', upsert: false });
      if (!upErr) {
        await admin.schema('erp').from('adjuntos').insert({
          empresa_id: emp.id,
          entidad_tipo: 'cxp_factura',
          entidad_id: facturaId,
          rol: 'xml_cfdi',
          nombre: file.name,
          url: path,
          tipo_mime: 'application/xml',
        });
        await admin.schema('erp').from('facturas').update({ xml_url: path }).eq('id', facturaId);
      }

      r.ok = true;
      r.facturaId = facturaId as string;
      r.uuid = cfdi.uuid;
      r.proveedorId = proveedorId;
      r.proveedorSugerido = proveedorId ? null : { rfc: cfdi.emisorRfc, nombre: cfdi.emisorNombre };
    } catch (e) {
      r.error =
        e instanceof CfdiParseError ? e.message : `Error inesperado: ${(e as Error).message}`;
    }
    results.push(r);
  }

  const exitosos = results.filter((x) => x.ok).length;
  return NextResponse.json({
    ok: exitosos > 0,
    total: results.length,
    exitosos,
    results,
  });
}
