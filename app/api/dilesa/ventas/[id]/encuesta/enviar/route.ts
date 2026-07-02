/**
 * POST /api/dilesa/ventas/[id]/encuesta/enviar
 *
 * Envío manual de la Encuesta de Conformidad (Fase 16) desde la captura
 * interna — sin esperar al cron. Con `?solo_liga=1` NO manda correo: firma
 * el token y devuelve la URL (para copiar y mandar por WhatsApp).
 *
 * Auth: sesión de usuario; el SELECT de la venta vía RLS valida el acceso.
 * El update del ciclo usa admin (mismo criterio que el cron).
 */
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { signEncuestaToken } from '@/lib/dilesa/encuesta-token';
import { sendEncuestaEmail } from '@/lib/dilesa/encuesta-emails';
import { loadEmpresaBranding } from '@/lib/dilesa/email-branding';
import { hoyISOMatamoros } from '@/lib/fecha-mx';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createSupabaseServerClient();

  const { data: venta } = await sb
    .schema('dilesa')
    .from('ventas')
    .select('id, empresa_id, persona_id, unidad_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!venta) {
    return NextResponse.json({ ok: false, error: 'Venta no encontrada' }, { status: 404 });
  }

  const token = await signEncuestaToken({ ventaId: id });
  const url = `https://bsop.io/dilesa/encuesta/${token}`;

  const soloLiga = new URL(req.url).searchParams.get('solo_liga') === '1';
  if (soloLiga) {
    return NextResponse.json({ ok: true, url });
  }

  const { data: persona } = await sb
    .schema('erp')
    .from('personas')
    .select('nombre, apellido_paterno, apellido_materno, email')
    .eq('id', venta.persona_id)
    .maybeSingle();
  if (!persona?.email) {
    return NextResponse.json(
      { ok: false, error: 'El cliente no tiene email registrado — usa "Copiar liga".' },
      { status: 400 }
    );
  }

  let proyectoNombre: string | null = null;
  if (venta.unidad_id) {
    const { data: unidad } = await sb
      .schema('dilesa')
      .from('unidades')
      .select('proyecto_id')
      .eq('id', venta.unidad_id)
      .maybeSingle();
    if (unidad?.proyecto_id) {
      const { data: proyecto } = await sb
        .schema('dilesa')
        .from('proyectos')
        .select('nombre')
        .eq('id', unidad.proyecto_id)
        .maybeSingle();
      proyectoNombre = (proyecto?.nombre as string | null) ?? null;
    }
  }

  const branding = await loadEmpresaBranding(sb, venta.empresa_id);
  const result = await sendEncuestaEmail(
    {
      clienteEmail: persona.email as string,
      clienteNombre:
        [persona.nombre, persona.apellido_paterno, persona.apellido_materno]
          .filter(Boolean)
          .join(' ') || 'Cliente',
      proyectoNombre,
      encuestaUrl: url,
      branding,
    },
    'inicial'
  );
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  // Actualizar el ciclo (admin — RLS de UPDATE puede no aplicar al rol).
  const admin = getSupabaseAdminClient();
  if (admin) {
    const { data: enc } = await admin
      .schema('dilesa')
      .from('venta_encuestas')
      .select('id, intentos')
      .eq('venta_id', id)
      .maybeSingle();
    if (enc) {
      await admin
        .schema('dilesa')
        .from('venta_encuestas')
        .update({
          estado: 'enviada',
          canal: 'email',
          intentos: ((enc.intentos as number) ?? 0) + 1,
          ultimo_envio_at: new Date().toISOString(),
        })
        .eq('id', enc.id);
    } else {
      await admin.schema('dilesa').from('venta_encuestas').insert({
        empresa_id: venta.empresa_id,
        venta_id: id,
        programada_para: hoyISOMatamoros(),
        estado: 'enviada',
        canal: 'email',
        intentos: 1,
        ultimo_envio_at: new Date().toISOString(),
      });
    }
  }

  return NextResponse.json({ ok: true });
}
