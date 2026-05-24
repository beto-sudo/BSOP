/**
 * GET /api/dilesa/ventas/[id]/pdf/[tipo]
 *
 * Genera un PDF del expediente para una venta DILESA. Sprint 7b.
 *
 * Tipos soportados:
 *   - solicitud-asignacion
 *   - aviso-privacidad
 *   - ficu
 *
 * Auth: la sesión de Supabase. La RLS de `dilesa.ventas` decide si el
 * usuario puede leerla — vendedor solo sus propias ventas; otros roles
 * todas. Si la venta no se ve (RLS), devolvemos 404.
 *
 * Output: application/pdf con Content-Disposition `attachment` para que
 * el browser descargue (no inline) — el vendedor debe imprimir físico.
 */

import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { SolicitudAsignacionPDF, type SolicitudData } from '@/lib/dilesa/pdf/solicitud-asignacion';
import { AvisoPrivacidadPDF, type AvisoPrivacidadData } from '@/lib/dilesa/pdf/aviso-privacidad';
import { FicuPDF, type FicuData } from '@/lib/dilesa/pdf/ficu';
import { evaluarRiesgo } from '@/lib/dilesa/ficu/riesgo';

const TIPOS = ['solicitud-asignacion', 'aviso-privacidad', 'ficu'] as const;
type TipoPdf = (typeof TIPOS)[number];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; tipo: string }> }
) {
  const { id, tipo } = await params;

  if (!TIPOS.includes(tipo as TipoPdf)) {
    return NextResponse.json({ error: 'Tipo de PDF desconocido' }, { status: 400 });
  }

  const sb = await createSupabaseServerClient();

  // Venta + relaciones cross-schema. RLS filtra automáticamente.
  const { data: venta, error: vErr } = await sb
    .schema('dilesa')
    .from('ventas')
    .select(
      'id, persona_id, unidad_id, tipo_credito, vendedor, monto_credito_titular, monto_credito_cotitular, created_at, es_pep, ocupacion, ine_numero, forma_pago, uso_efectivo'
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (vErr || !venta) {
    return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 });
  }

  // Persona (cliente) cross-schema — FICU necesita todos los campos
  const { data: persona } = await sb
    .schema('erp')
    .from('personas')
    .select(
      'nombre, apellido_paterno, apellido_materno, fecha_nacimiento, curp, rfc, email, telefono, nacionalidad, tipo_persona, domicilio'
    )
    .eq('id', venta.persona_id)
    .maybeSingle();
  const clienteNombre =
    [persona?.nombre, persona?.apellido_paterno, persona?.apellido_materno]
      .filter(Boolean)
      .join(' ') || '(sin nombre)';

  // Unidad + proyecto + producto (todos en dilesa)
  let identificacionInventario = '';
  let pdfDataExtra: Partial<SolicitudData> = {};
  if (venta.unidad_id) {
    const { data: unidad } = await sb
      .schema('dilesa')
      .from('unidades')
      .select(
        'identificador, area_m2, es_esquina, tiene_frente_verde, manzana, numero_lote, calle, numero_oficial, m2_construccion, valor_venta_futuro_snapshot, proyecto_id, producto_id'
      )
      .eq('id', venta.unidad_id)
      .maybeSingle();
    if (unidad) {
      const [{ data: proyecto }, { data: producto }] = await Promise.all([
        sb
          .schema('dilesa')
          .from('proyectos')
          .select('nombre, precio_m2_excedente, tamano_lote_promedio')
          .eq('id', unidad.proyecto_id)
          .maybeSingle(),
        unidad.producto_id
          ? sb
              .schema('dilesa')
              .from('productos')
              .select('nombre')
              .eq('id', unidad.producto_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const protoSufijo = producto?.nombre ? producto.nombre.split('-').pop() : '';
      identificacionInventario = protoSufijo
        ? `${unidad.identificador}-${protoSufijo}`
        : unidad.identificador;

      pdfDataExtra = {
        fraccionamiento: (proyecto?.nombre ?? '').toUpperCase(),
        manzana: unidad.manzana ?? '',
        lote: unidad.numero_lote ?? '',
        prototipo: producto?.nombre ?? '',
        domicilioOficial: [unidad.calle, unidad.numero_oficial]
          .filter(Boolean)
          .join(' #')
          .toUpperCase(),
        identificacionInventario,
        terrenoExcedente: Math.max(
          0,
          (unidad.area_m2 ?? 0) - (proyecto?.tamano_lote_promedio ?? 0)
        ),
        frenteVerde: unidad.tiene_frente_verde ?? false,
        esquina: unidad.es_esquina ?? false,
        precioM2Excedente: Number(proyecto?.precio_m2_excedente ?? 0),
      };
    }
  }

  const fechaCreado = new Date(venta.created_at);
  const fechaTexto = fechaCreado.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  if (tipo === 'aviso-privacidad') {
    const data: AvisoPrivacidadData = {
      fechaTexto,
      clienteNombre,
      identificacionInventario,
    };
    const buf = await renderToBuffer(<AvisoPrivacidadPDF data={data} />);
    return pdfResponse(buf, `aviso-privacidad-${identificacionInventario || id}.pdf`);
  }

  if (tipo === 'ficu') {
    const riesgo = evaluarRiesgo({
      tipoPersona: persona?.tipo_persona,
      nacionalidad: persona?.nacionalidad,
      esPep: venta.es_pep,
      formaPago: venta.forma_pago,
      usoEfectivo: venta.uso_efectivo,
    });
    const fechaNac = persona?.fecha_nacimiento
      ? new Date(`${persona.fecha_nacimiento}T00:00:00`).toLocaleDateString('es-MX', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '—';
    const data: FicuData = {
      fechaTexto,
      nombres: (persona?.nombre ?? '').toUpperCase(),
      apellidoPaterno: (persona?.apellido_paterno ?? '').toUpperCase(),
      apellidoMaterno: (persona?.apellido_materno ?? '').toUpperCase(),
      fechaNacimientoTexto: fechaNac,
      curp: (persona?.curp ?? '').toUpperCase(),
      rfc: (persona?.rfc ?? '').toUpperCase(),
      identificacion: {
        tipo: 'INE / Credencial para Votar',
        numero: venta.ine_numero ?? '',
        autoridad: 'Instituto Nacional Electoral',
        vigencia: 'Vigente',
      },
      domicilio: { integrado: persona?.domicilio ?? null },
      telefono: persona?.telefono ?? '',
      correo: persona?.email ?? '',
      personalidad: (persona?.tipo_persona ?? 'persona física').toUpperCase(),
      nacionalidad: (persona?.nacionalidad ?? '').toUpperCase(),
      esPep: !!venta.es_pep,
      formaPago: (venta.forma_pago ?? '').toUpperCase(),
      usoEfectivo: (venta.uso_efectivo ?? '').toUpperCase(),
      ocupacion: (venta.ocupacion ?? '').toUpperCase(),
      criteriosRiesgo: riesgo.criterios,
      scoreTotal: riesgo.scoreTotal,
      clasificacionRiesgo: riesgo.clasificacion,
      clienteNombre,
      identificacionInventario,
    };
    const buf = await renderToBuffer(<FicuPDF data={data} />);
    return pdfResponse(buf, `ficu-${identificacionInventario || id}.pdf`);
  }

  // solicitud-asignacion
  // Calcular precios via RPC
  const { data: calc } = await sb.schema('dilesa').rpc('fn_calcular_precio_venta', {
    p_unidad_id: venta.unidad_id ?? '00000000-0000-0000-0000-000000000000',
    p_monto_credito_titular: Number(venta.monto_credito_titular ?? 0),
    p_monto_credito_cotitular: Number(venta.monto_credito_cotitular ?? 0),
  });
  const c = calc as Record<string, number> | null;

  // Folio Coda-style: iniciales cliente - identificación - fechaHora
  const iniciales = clienteNombre
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase())
    .filter(Boolean)
    .slice(0, 3)
    .join('');
  const folio = `${iniciales}-${identificacionInventario}-${fechaCreado.toLocaleString('es-MX')}`;

  const data: SolicitudData = {
    fechaTexto,
    asesorVentas: (venta.vendedor ?? '').toUpperCase(),
    valorComercial: Number(c?.valor_comercial ?? 0),
    valorExcedenteTerreno: Number(c?.valor_excedente_terreno ?? 0),
    valorFrenteVerde: Number(c?.valor_frente_verde ?? 0),
    valorEsquina: Number(c?.valor_esquina ?? 0),
    valorVentaFuturo: Number(c?.valor_venta_futuro ?? 0),
    costoCreditoAdicional: Number(c?.costo_credito_adicional ?? 0),
    precioVenta: Number(c?.precio_venta_total ?? 0),
    enganche1pct: Number(c?.enganche_1pct ?? 0),
    isai2pct: Number(c?.isai_2pct ?? 0),
    gastosNotariales6pct: Number(c?.gastos_notariales_6pct ?? 0),
    tipoCredito: venta.tipo_credito ?? '',
    pagoDirecto: Number(c?.pago_directo ?? 0) + Number(c?.apoyo_infonavit ?? 0),
    montoCreditoTitular: Number(venta.monto_credito_titular ?? 0),
    montoCreditoCotitular: Number(venta.monto_credito_cotitular ?? 0),
    totalPagosDisponibles: Number(c?.precio_venta_total ?? 0),
    clienteNombre: `${clienteNombre} (${identificacionInventario})`,
    folio,
    fraccionamiento: '',
    manzana: '',
    lote: '',
    prototipo: '',
    domicilioOficial: '',
    identificacionInventario: '',
    terrenoExcedente: 0,
    frenteVerde: false,
    esquina: false,
    precioM2Excedente: 0,
    ...pdfDataExtra,
  };

  const buf = await renderToBuffer(<SolicitudAsignacionPDF data={data} />);
  return pdfResponse(buf, `solicitud-asignacion-${identificacionInventario || id}.pdf`);
}

function pdfResponse(buf: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export const runtime = 'nodejs';
