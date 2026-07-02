/**
 * Cron diario — ciclo de envío de la Encuesta de Conformidad (Fase 16).
 *
 * Corre una vez al día (vercel.json `0 16 * * *` ≈ 10am Piedras Negras) y
 * procesa cada encuesta con `accionParaEncuesta` (lib/dilesa/encuesta-ciclo):
 *
 *   programada + fecha cumplida → envío inicial (D+2 de la entrega)
 *   enviada (1 intento, +1 día)  → recordatorio
 *   enviada (2 intentos, +1 día) → último aviso
 *   enviada (3 intentos, +1 día) → pasa a Atención a Clientes (aviso interno
 *                                   al gerente de ventas, captura telefónica)
 *
 * Cliente sin email → directo a Atención a Clientes. Responder la encuesta
 * (token de 90 días) corta el ciclo en cualquier punto.
 *
 * Security: `Authorization: Bearer ${CRON_SECRET}` (mismo patrón que
 * dilesa-ventas-expirar).
 */
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { accionParaEncuesta, type EncuestaCicloRow } from '@/lib/dilesa/encuesta-ciclo';
import { signEncuestaToken } from '@/lib/dilesa/encuesta-token';
import {
  sendEncuestaEmail,
  sendAvisoAtencionClientes,
  type EncuestaEmailVariante,
} from '@/lib/dilesa/encuesta-emails';
import { loadEmpresaBranding } from '@/lib/dilesa/email-branding';
import { loadGerenteVentas } from '@/lib/dilesa/gerente-ventas';
import { hoyISOMatamoros } from '@/lib/fecha-mx';

export const maxDuration = 120;

type EncuestaRow = EncuestaCicloRow & {
  id: string;
  empresa_id: string;
  venta_id: string;
};

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = req.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'admin client no disponible' }, { status: 500 });
  }

  // Hoy en hora local (America/Matamoros, DST real — ADR-054). El cron corre a
  // las 16:00 UTC (~10:00 locales), lejos de medianoche, así que el cambio de
  // Etc/GMT+6 fijo a TZ real no altera ningún ciclo; es consistencia de convención.
  const hoy = hoyISOMatamoros();

  const { data: pendientes, error: qErr } = await admin
    .schema('dilesa')
    .from('venta_encuestas')
    .select('id, empresa_id, venta_id, estado, programada_para, intentos, ultimo_envio_at')
    .in('estado', ['programada', 'enviada'])
    .limit(200);
  if (qErr) {
    return NextResponse.json({ error: qErr.message }, { status: 500 });
  }

  // Mismo patrón que los magic links de dictamen/avalúo: dominio prod fijo.
  const baseUrl = 'https://bsop.io';
  let enviadas = 0;
  let recordatorios = 0;
  let aAtencion = 0;
  let sinEmail = 0;
  const errores: string[] = [];

  for (const enc of (pendientes ?? []) as EncuestaRow[]) {
    const accion = accionParaEncuesta(enc, hoy);
    if (!accion) continue;

    try {
      // Contexto de la venta (cliente + proyecto) para el correo.
      const { data: venta } = await admin
        .schema('dilesa')
        .from('ventas')
        .select('id, persona_id, unidad_id, estado')
        .eq('id', enc.venta_id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!venta || (venta.estado !== 'activa' && venta.estado !== 'terminada')) {
        // Venta desasignada/borrada después de la entrega: ciclo muerto.
        // 'terminada' sí encuesta: el ciclo post-entrega (6/12 meses) sigue
        // vivo mucho después del cierre administrativo de la fase 17.
        await admin
          .schema('dilesa')
          .from('venta_encuestas')
          .update({ estado: 'sin_respuesta' })
          .eq('id', enc.id);
        continue;
      }

      const { data: persona } = await admin
        .schema('erp')
        .from('personas')
        .select('nombre, apellido_paterno, apellido_materno, email, telefono')
        .eq('id', venta.persona_id)
        .maybeSingle();
      const clienteNombre =
        [persona?.nombre, persona?.apellido_paterno, persona?.apellido_materno]
          .filter(Boolean)
          .join(' ') || 'Cliente';

      let proyectoNombre: string | null = null;
      let unidadIdentificador: string | null = null;
      if (venta.unidad_id) {
        const { data: unidad } = await admin
          .schema('dilesa')
          .from('unidades')
          .select('identificador, proyecto_id')
          .eq('id', venta.unidad_id)
          .maybeSingle();
        unidadIdentificador = (unidad?.identificador as string | null) ?? null;
        if (unidad?.proyecto_id) {
          const { data: proyecto } = await admin
            .schema('dilesa')
            .from('proyectos')
            .select('nombre')
            .eq('id', unidad.proyecto_id)
            .maybeSingle();
          proyectoNombre = (proyecto?.nombre as string | null) ?? null;
        }
      }

      const branding = await loadEmpresaBranding(admin, enc.empresa_id);

      if (accion === 'pasar_a_atencion' || (!persona?.email && accion === 'enviar_inicial')) {
        // Aviso interno + estado atencion_clientes.
        const gerente = await loadGerenteVentas(admin, enc.empresa_id);
        const destinatarios = [gerente?.email].filter(Boolean) as string[];
        await sendAvisoAtencionClientes({
          destinatarios,
          clienteNombre,
          clienteTelefono: (persona?.telefono as string | null) ?? null,
          proyectoNombre,
          unidadIdentificador,
          capturaUrl: `${baseUrl}/dilesa/ventas/${enc.venta_id}/capturar/16-conformidad`,
          branding,
        });
        await admin
          .schema('dilesa')
          .from('venta_encuestas')
          .update({ estado: 'atencion_clientes' })
          .eq('id', enc.id);
        if (!persona?.email) sinEmail += 1;
        else aAtencion += 1;
        continue;
      }

      // Envío al cliente (inicial / recordatorio / último).
      const token = await signEncuestaToken({ ventaId: enc.venta_id });
      const variante: EncuestaEmailVariante =
        accion === 'enviar_inicial'
          ? 'inicial'
          : accion === 'recordatorio'
            ? 'recordatorio'
            : 'ultimo';
      const result = await sendEncuestaEmail(
        {
          clienteEmail: persona?.email as string,
          clienteNombre,
          proyectoNombre,
          encuestaUrl: `${baseUrl}/dilesa/encuesta/${token}`,
          branding,
        },
        variante
      );
      if (!result.ok) {
        errores.push(`${enc.venta_id}: ${result.error}`);
        continue;
      }
      await admin
        .schema('dilesa')
        .from('venta_encuestas')
        .update({
          estado: 'enviada',
          canal: 'email',
          intentos: enc.intentos + 1,
          ultimo_envio_at: new Date().toISOString(),
        })
        .eq('id', enc.id);
      if (variante === 'inicial') enviadas += 1;
      else recordatorios += 1;
    } catch (e) {
      errores.push(`${enc.venta_id}: ${e instanceof Error ? e.message : 'error'}`);
    }
  }

  return NextResponse.json({
    ok: true,
    hoy,
    evaluadas: (pendientes ?? []).length,
    enviadas,
    recordatorios,
    a_atencion: aAtencion,
    sin_email: sinEmail,
    errores,
  });
}
