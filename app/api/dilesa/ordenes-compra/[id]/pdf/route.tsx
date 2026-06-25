/**
 * GET /api/dilesa/ordenes-compra/[id]/pdf
 *   → descarga el PDF de la Orden de Compra (el documento que va al proveedor).
 *
 * Iniciativa `dilesa-compras-operacion` · Sprint 2b. Auth: sesión Supabase; la RLS
 * de `erp.ordenes_compra` decide si el usuario puede leer la fila. El envío por
 * email al proveedor (POST) llega en Sprint 3.
 */

import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { OrdenCompraPDF, type OrdenCompraPdfData } from '@/lib/dilesa/pdf/orden-compra';
import { formatCurrency } from '@/lib/format';

const MESES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

function fmtFecha(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(`${s.slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return s;
  return `${d.getDate()} de ${MESES_ES[d.getMonth()]} de ${d.getFullYear()}`;
}

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  parcial: 'Parcial',
  cerrada: 'Cerrada',
  cancelada: 'Cancelada',
};

type Sb = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function buildPdfData(
  sb: Sb,
  ocId: string
): Promise<{ data?: OrdenCompraPdfData; error?: string }> {
  const { data: oc, error } = await sb
    .schema('erp')
    .from('ordenes_compra')
    .select(
      'id, codigo, estado, condiciones_pago, fecha_entrega, direccion_entrega, proveedor_id, created_at'
    )
    .eq('id', ocId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !oc) return { error: 'Orden de compra no encontrada' };

  // Detalle en query aparte (sin embed) para evitar los tipos de error de embed
  // de supabase-js — mismo patrón que el endpoint de Solicitud de Cotización.
  type DetalleRaw = {
    partida_id: string | null;
    descripcion: string | null;
    unidad: string | null;
    cantidad: number | null;
    precio_unitario: number | null;
    precio_real: number | null;
  };
  const { data: detalleRaw } = await sb
    .schema('erp')
    .from('ordenes_compra_detalle')
    .select('partida_id, descripcion, unidad, cantidad, precio_unitario, precio_real')
    .eq('orden_compra_id', ocId);
  const detalle = (detalleRaw ?? []) as unknown as DetalleRaw[];

  // Proveedor: nombre + RFC (erp.personas) + domicilio (erp.personas_datos_fiscales).
  let proveedorNombre = '(proveedor por definir)';
  let proveedorRfc: string | null = null;
  let proveedorDomicilio: string | null = null;
  if (oc.proveedor_id) {
    const { data: prov } = await sb
      .schema('erp')
      .from('proveedores')
      .select('persona_id')
      .eq('id', oc.proveedor_id as string)
      .maybeSingle();
    if (prov?.persona_id) {
      const personaId = prov.persona_id as string;
      const [{ data: per }, { data: fisc }] = await Promise.all([
        sb
          .schema('erp')
          .from('personas')
          .select('nombre, apellido_paterno, apellido_materno, rfc')
          .eq('id', personaId)
          .maybeSingle(),
        sb
          .schema('erp')
          .from('personas_datos_fiscales')
          .select(
            'razon_social, domicilio_calle, domicilio_num_ext, domicilio_colonia, domicilio_cp, domicilio_municipio, domicilio_estado'
          )
          .eq('persona_id', personaId)
          .maybeSingle(),
      ]);
      proveedorNombre =
        (fisc?.razon_social as string | null)?.trim() ||
        [per?.nombre, per?.apellido_paterno, per?.apellido_materno]
          .filter(Boolean)
          .join(' ')
          .trim() ||
        '(sin nombre)';
      proveedorRfc = (per?.rfc as string | null) ?? null;
      const dom = [
        [fisc?.domicilio_calle, fisc?.domicilio_num_ext].filter(Boolean).join(' '),
        fisc?.domicilio_colonia,
        [fisc?.domicilio_cp, fisc?.domicilio_municipio].filter(Boolean).join(' '),
        fisc?.domicilio_estado,
      ]
        .filter((p) => p && String(p).trim())
        .join(', ');
      proveedorDomicilio = dom || null;
    }
  }

  // Partidas → concepto + proyecto.
  const partidaIds = [...new Set(detalle.map((d) => d.partida_id).filter(Boolean) as string[])];
  const { data: partidasRaw } = partidaIds.length
    ? await sb
        .schema('erp')
        .from('presupuesto_partidas')
        .select('id, concepto_texto, proyecto_id')
        .in('id', partidaIds)
    : { data: [] };
  const partidaMap = new Map<string, { concepto: string; proyectoId: string | null }>();
  for (const p of partidasRaw ?? []) {
    partidaMap.set(p.id as string, {
      concepto: (p.concepto_texto as string | null) ?? '—',
      proyectoId: (p.proyecto_id as string | null) ?? null,
    });
  }
  const proyectoId = [...partidaMap.values()].map((p) => p.proyectoId).filter(Boolean)[0] ?? null;
  const { data: proyecto } = proyectoId
    ? await sb
        .schema('dilesa')
        .from('proyectos')
        .select('nombre')
        .eq('id', proyectoId)
        .maybeSingle()
    : { data: null };

  let total = 0;
  const lineas = detalle.map((d) => {
    const precio = Number(d.precio_real ?? d.precio_unitario ?? 0);
    const cantidad = Number(d.cantidad ?? 0);
    const importe = cantidad * precio;
    total += importe;
    return {
      concepto: d.partida_id
        ? (partidaMap.get(d.partida_id)?.concepto ?? '—')
        : (d.descripcion ?? 'Concepto libre'),
      descripcion: d.descripcion ?? '',
      cantidad: String(cantidad),
      unidad: d.unidad ?? '',
      precioUnitario: formatCurrency(precio),
      importe: formatCurrency(importe),
    };
  });

  const data: OrdenCompraPdfData = {
    folio: (oc.codigo as string | null) ?? '—',
    fechaTexto: fmtFecha((oc.created_at as string | null)?.slice(0, 10)),
    estadoLabel: ESTADO_LABEL[oc.estado as string] ?? (oc.estado as string),
    proyecto: (proyecto?.nombre as string | null) ?? '—',
    proveedorNombre,
    proveedorRfc,
    proveedorDomicilio,
    condicionesPago: (oc.condiciones_pago as string | null) ?? null,
    fechaEntregaTexto: oc.fecha_entrega ? fmtFecha(oc.fecha_entrega as string) : null,
    direccionEntrega: (oc.direccion_entrega as string | null) ?? null,
    lineas,
    totalTexto: formatCurrency(total),
  };
  return { data };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createSupabaseServerClient();
  const result = await buildPdfData(sb, id);
  if (result.error || !result.data) {
    return NextResponse.json({ error: result.error ?? 'Error' }, { status: 404 });
  }
  const buf = await renderToBuffer(<OrdenCompraPDF data={result.data} />);
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="orden-compra-${result.data.folio}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}

export const runtime = 'nodejs';
