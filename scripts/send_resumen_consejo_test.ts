/**
 * Envía una prueba del "Resumen Diario Operación Dilesa" (correo al Consejo).
 * Iniciativa dilesa-resumen-consejo. Destino: RESUMEN_CONSEJO_TEST_TO o el default
 * de prueba. NO manda al Consejo real.
 *
 *   npx tsx --env-file=/Users/Beto/BSOP/.env.local scripts/send_resumen_consejo_test.ts
 */

import { createClient } from '@supabase/supabase-js';
import {
  fetchResumenConsejoData,
  renderResumenConsejoHtml,
  fechaTituloCST,
  sendResumenEmail,
  armarAsunto,
  fechaCortaDe,
  type Cabecera,
} from '../lib/dilesa/resumen-consejo-email';
import {
  computeKpisDelDia,
  fetchSnapshotPrevio,
  calcularDeltas,
  fechaLocalMatamoros,
} from '../lib/dilesa/resumen-consejo-kpis';

const DILESA_ID = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479';
const HEADER =
  'https://ybklderteyhuugzfmxbi.supabase.co/storage/v1/object/public/branding/dilesa/brand/header-email.png?v=1776736258319';
const TEST_TO = process.env.RESUMEN_CONSEJO_TEST_TO || 'beto@anorte.com';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!url || !key || !resendKey) {
    throw new Error(
      'Faltan env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY'
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date();
  const data = await fetchResumenConsejoData(supabase, DILESA_ID, now);
  const fechaLocal = fechaLocalMatamoros(now);
  const inicioMesISO = `${fechaLocal.slice(0, 7)}-01`;
  const erp = supabase.schema('erp');
  const [kpis, previo, cobradoMesRes, cxpRes] = await Promise.all([
    computeKpisDelDia(supabase, DILESA_ID, fechaLocal),
    fetchSnapshotPrevio(supabase, DILESA_ID, fechaLocal),
    erp
      .from('cxc_pagos')
      .select('monto_total')
      .eq('empresa_id', DILESA_ID)
      .is('deleted_at', null)
      .gte('fecha', inicioMesISO),
    erp
      .from('cxp_pagos')
      .select('monto_total')
      .eq('empresa_id', DILESA_ID)
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
    headerImageUrl: HEADER,
    fechaTitulo,
    fechaLocal,
    cabecera,
  });
  const asunto = armarAsunto(cabecera, fechaCortaDe(fechaLocal), data, fechaLocal);

  console.log('Conteo por sección:', {
    saldos: data.saldos.length,
    tuberiaViva: data.tuberiaViva.length,
    asignaciones: data.asignaciones.length,
    avances: data.avances.length,
    prototipos: data.prototipos.length,
    casasEnObra: data.construccion.casas_en_obra,
  });

  if (process.env.DRY) {
    const fs = await import('node:fs');
    const out = '/tmp/resumen-consejo-preview.html';
    fs.writeFileSync(out, html);
    console.log('DRY — HTML escrito en', out, '(', html.length, 'bytes )');
    return;
  }

  console.log('Asunto:', `${asunto} [PRUEBA]`);
  const res = await sendResumenEmail(resendKey, {
    html,
    subject: `${asunto} [PRUEBA]`,
    from: 'Desarrollo Inmobiliario los Encinos <noreply@bsop.io>',
    recipients: [TEST_TO],
  });

  console.log('Resultado envío:', JSON.stringify(res));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
