/**
 * POST /api/dilesa/ventas/[id]/notify-solicitud-avaluo
 *
 * Envía el email "Solicitud de avalúo — <unidad>" al valuador asignado
 * cuando se cierra Fase 4 desde el form de captura.
 *
 * Patrón fire-and-forget: el form llama este endpoint después de
 * persistir `valuador_id` + `fecha_solicitud_avaluo` y marcar la fase.
 * Si el email falla, el operador puede reintentar manualmente desde el
 * mismo botón (idempotencia con `notif_solicitud_avaluo_at`).
 *
 * Recipients: solo el valuador (no se copia al cliente). Cc al gerente
 * de ventas para trazabilidad.
 *
 * Security: requiere sesión Supabase válida + permiso de escritura en
 * `dilesa.ventas.fase04_solicitud_avaluo` — pero como la RLS sobre
 * `dilesa.ventas` ya filtra, basta con que el usuario pueda leer la
 * venta para que el endpoint mande email a su nombre.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { sendAvaluoSolicitudEmail, type AvaluoSolicitudContext } from '@/lib/dilesa/avaluo-emails';
import { loadEmpresaBranding } from '@/lib/dilesa/email-branding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface VentaRow {
  id: string;
  empresa_id: string;
  unidad_id: string | null;
  persona_id: string;
  vendedor_usuario_id: string | null;
  vendedor: string | null;
  valuador_id: string | null;
  notif_solicitud_avaluo_at: string | null;
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // Auth: sesión válida.
  const sb = await createSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Lectura de la venta con la sesión del usuario — la RLS decide
  // si tiene acceso. Si no, no debería poder mandar emails a su nombre.
  const { data: v, error: vErr } = await sb
    .schema('dilesa')
    .from('ventas')
    .select(
      'id, empresa_id, unidad_id, persona_id, vendedor_usuario_id, vendedor, valuador_id, notif_solicitud_avaluo_at'
    )
    .eq('id', id)
    .maybeSingle();
  if (vErr || !v) {
    return NextResponse.json({ ok: false, error: 'Venta no encontrada' }, { status: 404 });
  }
  const venta = v as unknown as VentaRow;

  if (!venta.valuador_id) {
    return NextResponse.json(
      { ok: false, error: 'La venta no tiene valuador asignado.' },
      { status: 400 }
    );
  }

  // Idempotencia.
  if (venta.notif_solicitud_avaluo_at) {
    return NextResponse.json({ ok: true, alreadySent: true });
  }

  // Para lookups cross-schema usamos admin (mismo razonamiento que
  // notify-hold-creado). Solo lectura para componer el email.
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Admin client no disponible' }, { status: 500 });
  }

  const [{ data: persona }, { data: usuario }, { data: unidad }, { data: valuador }] =
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
              'identificador, proyecto_id, manzana, numero_lote, calle, numero_oficial, producto_id, area_m2, m2_construccion, es_esquina, tiene_frente_verde'
            )
            .eq('id', venta.unidad_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      admin
        .schema('erp')
        .from('personas')
        .select('nombre, apellido_paterno, apellido_materno, email')
        .eq('id', venta.valuador_id)
        .maybeSingle(),
    ]);

  if (!valuador?.email) {
    return NextResponse.json(
      { ok: false, error: 'El valuador no tiene email registrado.' },
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

  // El valuador puede ser persona moral (la casa) o física. Si la fila
  // tiene apellidos, los junta como "Nombre Apellidos"; si no, usa
  // solo `nombre` (que para personas morales contiene la razón social).
  const valuadorNombreCompleto =
    [valuador.nombre, valuador.apellido_paterno, valuador.apellido_materno]
      .filter(Boolean)
      .join(' ')
      .trim() || '(valuador sin nombre)';
  const valuadorContacto =
    [valuador.apellido_paterno, valuador.apellido_materno].filter(Boolean).length > 0
      ? null // si tiene apellidos es persona física, sin "contacto" separado
      : ((valuador.nombre as string | undefined) ?? null);

  const vendedorNombre =
    [usuario?.first_name, usuario?.last_name].filter(Boolean).join(' ').trim() ||
    venta.vendedor ||
    null;

  const domicilioOficial =
    [unidad?.calle, unidad?.numero_oficial].filter(Boolean).join(' #').toUpperCase() || null;

  const branding = await loadEmpresaBranding(admin, venta.empresa_id);

  const emailCtx: AvaluoSolicitudContext = {
    branding,
    ventaId: venta.id,
    empresaId: venta.empresa_id,
    valuadorEmail: valuador.email as string,
    valuadorNombre: valuadorNombreCompleto,
    valuadorContacto,
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
    esquina: unidad?.es_esquina ?? null,
    tieneFrenteVerde: unidad?.tiene_frente_verde ?? null,
    vendedorNombre,
    vendedorEmail: (usuario?.email as string | null) ?? null,
    // `core.usuarios` no tiene columna teléfono — si lo necesitamos en
    // el futuro habrá que agregarlo al perfil o leer de erp.personas.
    vendedorTelefono: null,
  };

  const res = await sendAvaluoSolicitudEmail(emailCtx);
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
    .update({ notif_solicitud_avaluo_at: new Date().toISOString() })
    .eq('id', venta.id);

  return NextResponse.json({ ok: true, sentTo: res.sentTo });
}
