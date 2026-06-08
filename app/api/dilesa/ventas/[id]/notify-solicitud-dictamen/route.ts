/**
 * POST /api/dilesa/ventas/[id]/notify-solicitud-dictamen
 *
 * Envía el email "Solicitud de dictaminación notarial" al notario
 * asignado cuando se cierra Fase 7 desde el form de captura.
 *
 * Patrón fire-and-forget: el form llama este endpoint después de
 * persistir `notario_id` + `fecha_solicitud_dictamen` y marcar la fase.
 * Si el email falla, el operador puede reintentar manualmente.
 *
 * Recipients: solo el notario. Cc al gerente de ventas.
 *
 * Security: requiere sesión Supabase válida. La RLS sobre dilesa.ventas
 * decide si el usuario tiene acceso a esta venta.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import {
  sendDictamenSolicitudEmail,
  type DictamenSolicitudContext,
} from '@/lib/dilesa/dictamen-emails';
import { loadEmpresaBranding } from '@/lib/dilesa/email-branding';
import { signDictamenToken } from '@/lib/dilesa/dictamen-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface VentaRow {
  id: string;
  empresa_id: string;
  unidad_id: string | null;
  persona_id: string;
  vendedor_usuario_id: string | null;
  vendedor: string | null;
  notario_id: string | null;
  notif_solicitud_dictamen_at: string | null;
  tipo_credito: string | null;
  precio_asignacion: number | null;
  monto_credito_titular: number | null;
  monto_credito_cotitular: number | null;
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const sb = await createSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { data: v, error: vErr } = await sb
    .schema('dilesa')
    .from('ventas')
    .select(
      'id, empresa_id, unidad_id, persona_id, vendedor_usuario_id, vendedor, notario_id, notif_solicitud_dictamen_at, tipo_credito, precio_asignacion, monto_credito_titular, monto_credito_cotitular'
    )
    .eq('id', id)
    .maybeSingle();
  if (vErr || !v) {
    return NextResponse.json({ ok: false, error: 'Venta no encontrada' }, { status: 404 });
  }
  const venta = v as unknown as VentaRow;

  if (!venta.notario_id) {
    return NextResponse.json(
      { ok: false, error: 'La venta no tiene notario asignado.' },
      { status: 400 }
    );
  }

  if (venta.notif_solicitud_dictamen_at) {
    return NextResponse.json({ ok: true, alreadySent: true });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Admin client no disponible' }, { status: 500 });
  }

  const [{ data: persona }, { data: usuario }, { data: unidad }, { data: notario }] =
    await Promise.all([
      admin
        .schema('erp')
        .from('personas')
        .select('nombre, apellido_paterno, apellido_materno, email, telefono, curp')
        .eq('id', venta.persona_id)
        .maybeSingle(),
      venta.vendedor_usuario_id
        ? admin
            .schema('core')
            .from('usuarios')
            .select('first_name, last_name, email')
            .eq('id', venta.vendedor_usuario_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      venta.unidad_id
        ? admin
            .schema('dilesa')
            .from('unidades')
            .select(
              'identificador, proyecto_id, manzana, numero_lote, calle, numero_oficial, producto_id, area_m2, m2_construccion'
            )
            .eq('id', venta.unidad_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      admin
        .schema('erp')
        .from('personas')
        .select('nombre, apellido_paterno, apellido_materno, email')
        .eq('id', venta.notario_id)
        .maybeSingle(),
    ]);

  if (!notario?.email) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Este notario no tiene email registrado. Tendrás que entregar la solicitud por otro medio (papel/teléfono) y capturar el dictamen manualmente cuando llegue.',
      },
      { status: 400 }
    );
  }

  let proyectoNombre = '';
  let prototipoSufijo: string | null = null;
  if (unidad?.proyecto_id) {
    const { data: proyecto } = await admin
      .schema('dilesa')
      .from('proyectos')
      .select('nombre')
      .eq('id', unidad.proyecto_id)
      .maybeSingle();
    proyectoNombre = proyecto?.nombre ?? '';
  }
  if (unidad?.producto_id) {
    const { data: producto } = await admin
      .schema('dilesa')
      .from('productos')
      .select('nombre')
      .eq('id', unidad.producto_id)
      .maybeSingle();
    prototipoSufijo = producto?.nombre ? (producto.nombre.split('-').pop() ?? null) : null;
  }

  const clienteNombre =
    [persona?.nombre, persona?.apellido_paterno, persona?.apellido_materno]
      .filter(Boolean)
      .join(' ') || '(sin nombre)';

  const notarioNombreCompleto =
    [notario.nombre, notario.apellido_paterno, notario.apellido_materno]
      .filter(Boolean)
      .join(' ')
      .trim() || '(notario sin nombre)';

  const vendedorNombre =
    [usuario?.first_name, usuario?.last_name].filter(Boolean).join(' ').trim() ||
    venta.vendedor ||
    null;

  const domicilioOficial =
    [unidad?.calle, unidad?.numero_oficial].filter(Boolean).join(' #').toUpperCase() || null;

  const branding = await loadEmpresaBranding(admin, venta.empresa_id);

  // Genera el magic link para que el notario suba la Carta de Instrucción.
  let uploadUrl = '';
  try {
    const token = await signDictamenToken({
      ventaId: venta.id,
      notarioId: venta.notario_id,
    });
    uploadUrl = `https://bsop.io/dilesa/notario/dictamen/${token}`;
  } catch (e) {
    console.warn('[notify-solicitud-dictamen] no se pudo firmar token:', (e as Error).message);
    return NextResponse.json(
      { ok: false, error: 'No se pudo generar el enlace de subida del dictamen.' },
      { status: 500 }
    );
  }

  const emailCtx: DictamenSolicitudContext = {
    branding,
    ventaId: venta.id,
    empresaId: venta.empresa_id,
    uploadUrl,
    notarioEmail: notario.email as string,
    notarioNombre: notarioNombreCompleto,
    clienteNombre,
    clienteCurp: persona?.curp ?? null,
    clienteTelefono: persona?.telefono ?? null,
    proyectoNombre,
    unidadIdentificador: unidad?.identificador ?? '(sin unidad)',
    manzana: unidad?.manzana ?? null,
    lote: unidad?.numero_lote ?? null,
    prototipo: prototipoSufijo,
    domicilioOficial,
    areaM2: unidad?.area_m2 != null ? Number(unidad.area_m2) : null,
    m2Construccion: unidad?.m2_construccion != null ? Number(unidad.m2_construccion) : null,
    tipoCredito: venta.tipo_credito,
    precioVenta: venta.precio_asignacion != null ? Number(venta.precio_asignacion) : null,
    montoCreditoTitular:
      venta.monto_credito_titular != null ? Number(venta.monto_credito_titular) : null,
    montoCreditoCotitular:
      venta.monto_credito_cotitular != null ? Number(venta.monto_credito_cotitular) : null,
    vendedorNombre,
    vendedorEmail: (usuario?.email as string | null) ?? null,
  };

  const res = await sendDictamenSolicitudEmail(emailCtx);
  if (!res.ok) {
    return NextResponse.json({
      ok: false,
      sentTo: [],
      error: res.error ?? 'send failed',
    });
  }

  await admin
    .schema('dilesa')
    .from('ventas')
    .update({ notif_solicitud_dictamen_at: new Date().toISOString() })
    .eq('id', venta.id);

  return NextResponse.json({ ok: true, sentTo: res.sentTo });
}
