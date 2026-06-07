/**
 * Resumen Diario Operación DILESA — cron del correo al Consejo.
 *
 * Schedule: `0 2 * * *` (02:00 UTC ≈ 20:00 CST). Ver vercel.json.
 * Iniciativa dilesa-resumen-consejo.
 *
 * Reglas:
 *   - Lunes a sábado. **Domingo NO se envía** (guard sobre el día en CST).
 *   - Destino: RESUMEN_CONSEJO_TEST_TO si está definida (modo prueba, subject con
 *     [PRUEBA]); en su defecto, consejo@dilesa.mx (producción).
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
} from '@/lib/dilesa/resumen-consejo-email';

export const maxDuration = 120;

const DILESA_EMPRESA_ID = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479';
const CONSEJO_EMAIL = 'consejo@dilesa.mx';
const FROM = 'Desarrollo Inmobiliario los Encinos <noreply@bsop.io>';

/** Día de la semana en CST (UTC-6 fijo, México sin DST). 0 = domingo. */
function diaSemanaCst(now: Date): number {
  const cst = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  return cst.getUTCDay();
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = req.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  // Guard de domingo — el resumen del domingo no se envía.
  if (diaSemanaCst(now) === 0) {
    return NextResponse.json({ status: 'skipped', reason: 'domingo' });
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

  // Destino con FAIL-SAFE: hasta el cutover NO se manda al Consejo.
  //   - RESUMEN_CONSEJO_TEST_TO definida → manda ahí, subject con [PRUEBA].
  //   - RESUMEN_CONSEJO_LIVE='1' (y sin TEST_TO) → manda al Consejo real.
  //   - ninguna de las dos → skip sin enviar. Evita un envío accidental al
  //     Consejo cuando el cron entra a prod antes de que Beto valide el correo.
  const testTo = process.env.RESUMEN_CONSEJO_TEST_TO?.trim();
  const live = process.env.RESUMEN_CONSEJO_LIVE === '1';
  if (!testTo && !live) {
    return NextResponse.json({
      status: 'skipped',
      reason:
        'sin destino: configura RESUMEN_CONSEJO_TEST_TO (prueba) o RESUMEN_CONSEJO_LIVE=1 (Consejo)',
    });
  }
  const recipients = testTo ? [testTo] : [CONSEJO_EMAIL];
  const subject = `Resumen Diario Operación Dilesa 🏘️ ${fechaTitulo}${testTo ? ' [PRUEBA]' : ''}`;

  const res = await sendResumenEmail(resendKey, {
    html,
    subject,
    from: FROM,
    recipients,
  });

  return NextResponse.json({
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
  });
}
