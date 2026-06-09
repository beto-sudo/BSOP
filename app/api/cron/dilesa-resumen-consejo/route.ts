/**
 * Resumen Diario Operación DILESA — cron del correo al Consejo.
 *
 * Schedule: `0 1,2 * * *` (01:00 y 02:00 UTC). Ver vercel.json. Vercel corre los
 * crons en UTC y NO ajusta DST, pero Matamoros sí observa horario de verano
 * (CDT, UTC-5) e invierno (CST, UTC-6). Por eso disparamos en las dos horas UTC
 * candidatas y el guard de hora local (TZ real) deja pasar solo la que cae a las
 * 20:00 de Matamoros → el correo llega a las 8pm todo el año sin editar el cron.
 * Iniciativa dilesa-resumen-consejo.
 *
 * Reglas:
 *   - Envío a las 20:00 hora de Matamoros, de lunes a sábado.
 *   - **Domingo NO se envía** (guard sobre el día, TZ real).
 *   - Destino: RESUMEN_CONSEJO_TEST_TO si está definida (modo prueba, subject con
 *     [PRUEBA]); en su defecto, consejo@dilesa.mx (producción). Sin candado extra
 *     — igual que el cron de tareas, siempre envía (TEST_TO es la única palanca).
 *   - El bloque de Saldos Bancos solo aparece cuando hay saldos capturados
 *     (iniciativa tesoreria → erp.v_cuenta_saldo_actual).
 *
 * Security: requiere `Authorization: Bearer ${CRON_SECRET}` (lo manda Vercel Cron).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fetchResumenConsejoData,
  renderResumenConsejoHtml,
  fechaTituloCST,
  sendResumenEmail,
  relojMatamoros,
  HORA_ENVIO_LOCAL,
} from '@/lib/dilesa/resumen-consejo-email';

export const maxDuration = 120;

const DILESA_EMPRESA_ID = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479';
const CONSEJO_EMAIL = 'consejo@dilesa.mx';
const FROM = 'Desarrollo Inmobiliario los Encinos <noreply@bsop.io>';

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = req.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const { hora, esDomingo } = relojMatamoros(now);

  // El cron dispara a las 01:00 y 02:00 UTC; solo la corrida que cae a las 20:00
  // de Matamoros envía (la otra se salta). Auto-ajuste a DST sin doble envío.
  if (hora !== HORA_ENVIO_LOCAL) {
    const skip = { status: 'skipped', reason: `hora local ${hora}:00 != ${HORA_ENVIO_LOCAL}:00` };
    console.log('[dilesa-resumen-consejo]', JSON.stringify(skip));
    return NextResponse.json(skip);
  }
  // El resumen del domingo no se envía.
  if (esDomingo) {
    const skip = { status: 'skipped', reason: 'domingo' };
    console.log('[dilesa-resumen-consejo]', JSON.stringify(skip));
    return NextResponse.json(skip);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase env missing' }, { status: 500 });
  }
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY missing' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Branding (header del correo) desde core.empresas.
  const { data: empresa } = await supabase
    .schema('core')
    .from('empresas')
    .select('header_email_url')
    .eq('id', DILESA_EMPRESA_ID)
    .single();

  const data = await fetchResumenConsejoData(supabase, DILESA_EMPRESA_ID, now);
  const fechaTitulo = fechaTituloCST(now);
  const html = renderResumenConsejoHtml(data, {
    headerImageUrl: empresa?.header_email_url ?? null,
    fechaTitulo,
  });

  // Destino: RESUMEN_CONSEJO_TEST_TO definida → modo prueba (subject [PRUEBA], NO
  // toca al Consejo); en su defecto, el Consejo real. Sin candado extra — igual
  // que el cron de tareas, el correo siempre se envía.
  const testTo = process.env.RESUMEN_CONSEJO_TEST_TO?.trim();
  const recipients = testTo ? [testTo] : [CONSEJO_EMAIL];
  const subject = `Resumen Diario Operación Dilesa 🏘️ ${fechaTitulo}${testTo ? ' [PRUEBA]' : ''}`;

  const res = await sendResumenEmail(resendKey, {
    html,
    subject,
    from: FROM,
    recipients,
  });

  const summary = {
    status: res.ok ? 'sent' : 'error',
    recipients,
    secciones: {
      saldos: data.saldos.length,
      avances: data.avances.length,
      margen: data.margen.length,
      inventario: data.inventario.length,
      tuberia: data.tuberia.length,
      asignaciones: data.asignaciones.length,
      contratistas: data.contratistas.length,
    },
    error: res.ok ? undefined : res.error,
  };
  console.log('[dilesa-resumen-consejo]', JSON.stringify(summary));
  return NextResponse.json(summary);
}
