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
 *     [PRUEBA]); en su defecto, los destinatarios del catálogo
 *     `core.notification_definitions` slug `dilesa_resumen_consejo` (ahí vive
 *     consejo@dilesa.mx como `always`, editable runtime + kill switch `activo`).
 *     FAIL-OPEN: sin definición usa los fallbacks hardcodeados.
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
  armarAsunto,
  fechaCortaDe,
  type Cabecera,
} from '@/lib/dilesa/resumen-consejo-email';
import {
  getDefinitionBySlug,
  splitRecipientsExtra,
  writeNotificationLog,
} from '@/lib/notifications';
import {
  computeKpisDelDia,
  upsertKpiSnapshot,
  fetchSnapshotPrevio,
  calcularDeltas,
  fechaLocalMatamoros,
} from '@/lib/dilesa/resumen-consejo-kpis';

export const maxDuration = 120;

const DILESA_EMPRESA_ID = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479';
const RESUMEN_SLUG = 'dilesa_resumen_consejo';

/** Fallbacks si el catálogo no responde (FAIL-OPEN, patrón escrituración). */
const CONSEJO_EMAIL_FALLBACK = 'consejo@dilesa.mx';
const FROM_FALLBACK = 'Desarrollo Inmobiliario los Encinos <noreply@bsop.io>';

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

  // Catálogo de notificaciones (fail-open: sin definición usa fallbacks).
  const def = await getDefinitionBySlug(supabase, RESUMEN_SLUG, DILESA_EMPRESA_ID);
  if (def && !def.activo) {
    await writeNotificationLog(supabase, {
      definitionId: def.id,
      empresaId: DILESA_EMPRESA_ID,
      status: 'skipped',
      recipients: { to: [] },
      subject: `${RESUMEN_SLUG} — kill switch`,
    });
    const skip = { status: 'skipped', reason: 'kill_switch' };
    console.log('[dilesa-resumen-consejo]', JSON.stringify(skip));
    return NextResponse.json(skip);
  }

  // Branding (header del correo) desde core.empresas.
  const { data: empresa } = await supabase
    .schema('core')
    .from('empresas')
    .select('header_email_url')
    .eq('id', DILESA_EMPRESA_ID)
    .single();

  const data = await fetchResumenConsejoData(supabase, DILESA_EMPRESA_ID, now);

  // Cabecera ejecutiva (Sprint 3): KPIs del día + deltas vs el snapshot previo +
  // contexto de mes (cobrado/escrituras) + CxP por pagar.
  const fechaLocal = fechaLocalMatamoros(now);
  const inicioMesISO = `${fechaLocal.slice(0, 7)}-01`;
  const erp = supabase.schema('erp');
  const [kpis, previo, cobradoMesRes, cxpRes] = await Promise.all([
    computeKpisDelDia(supabase, DILESA_EMPRESA_ID, fechaLocal),
    fetchSnapshotPrevio(supabase, DILESA_EMPRESA_ID, fechaLocal),
    erp
      .from('cxc_pagos')
      .select('monto_total')
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null)
      .gte('fecha', inicioMesISO),
    erp
      .from('cxp_pagos')
      .select('monto_total')
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .is('deleted_at', null)
      .is('fecha_pago', null),
  ]);
  const cabecera: Cabecera = {
    kpis,
    deltas: calcularDeltas(kpis, previo),
    cobrado_mes: (cobradoMesRes.data ?? []).reduce(
      (s: number, p: { monto_total: number | null }) => s + Number(p.monto_total ?? 0),
      0
    ),
    escrituras_mes_n: data.asignaciones.reduce((s, a) => s + a.escrituras_mes, 0),
    escrituras_mes_monto: data.asignaciones.reduce((s, a) => s + a.monto_escrituras, 0),
    cxp_por_pagar: (cxpRes.data ?? []).reduce(
      (s: number, p: { monto_total: number | null }) => s + Number(p.monto_total ?? 0),
      0
    ),
  };

  const fechaTitulo = fechaTituloCST(now);
  const html = renderResumenConsejoHtml(data, {
    headerImageUrl: empresa?.header_email_url ?? null,
    fechaTitulo,
    fechaLocal,
    cabecera,
  });

  // Destino: RESUMEN_CONSEJO_TEST_TO definida → modo prueba (subject [PRUEBA], NO
  // toca al Consejo, sin cc/bcc); en su defecto, los destinatarios del catálogo
  // (o el fallback). Sin candado extra — el correo siempre se envía.
  const testTo = process.env.RESUMEN_CONSEJO_TEST_TO?.trim();
  const extras = def
    ? splitRecipientsExtra(def.recipients_extra)
    : { to: [CONSEJO_EMAIL_FALLBACK], cc: [], bcc: [] };
  // Una definición sin `always` dejaría el correo sin destino — fallback.
  const baseTo = extras.to.length > 0 ? extras.to : [CONSEJO_EMAIL_FALLBACK];
  const recipients = testTo ? [testTo] : baseTo;
  const cc = testTo ? [] : extras.cc;
  const bcc = testTo ? [] : extras.bcc;

  const fromAddress = def
    ? def.from_name
      ? `${def.from_name} <${def.from_email}>`
      : def.from_email
    : FROM_FALLBACK;
  // Asunto dinámico: el titular del día (Sprint 3). Reemplaza el template estático
  // del catálogo — el valor del correo está en que el asunto cuente qué pasó hoy.
  const subject = `${armarAsunto(cabecera, fechaCortaDe(fechaLocal), data, fechaLocal)}${testTo ? ' [PRUEBA]' : ''}`;

  const res = await sendResumenEmail(resendKey, {
    html,
    subject,
    from: fromAddress,
    recipients,
    cc,
    bcc,
  });

  await writeNotificationLog(supabase, {
    definitionId: def?.id ?? null,
    empresaId: DILESA_EMPRESA_ID,
    status: res.ok ? 'sent' : 'failed',
    recipients: { to: recipients, cc, bcc },
    subject,
    resendId: res.id ?? null,
    errorMessage: res.ok ? null : String(res.error ?? 'unknown'),
  });

  // Snapshot de cierre del día (base de los deltas, Sprint 1). No-fatal: el correo
  // ya se envió. `kpis`/`fechaLocal` se computaron arriba para la cabecera.
  try {
    const up = await upsertKpiSnapshot(supabase, DILESA_EMPRESA_ID, fechaLocal, kpis);
    console.log(
      '[dilesa-resumen-consejo] snapshot',
      JSON.stringify({ fecha: fechaLocal, ok: up.ok })
    );
  } catch (e) {
    console.error('[dilesa-resumen-consejo] snapshot error', e);
  }

  const summary = {
    status: res.ok ? 'sent' : 'error',
    recipients,
    secciones: {
      saldos: data.saldos.length,
      tuberiaViva: data.tuberiaViva.length,
      asignaciones: data.asignaciones.length,
      avances: data.avances.length,
      prototipos: data.prototipos.length,
      casasEnObra: data.construccion.casas_en_obra,
    },
    error: res.ok ? undefined : res.error,
  };
  console.log('[dilesa-resumen-consejo]', JSON.stringify(summary));
  return NextResponse.json(summary);
}
