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
} from '../lib/dilesa/resumen-consejo-email';

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
  const fechaTitulo = fechaTituloCST(now);
  const html = renderResumenConsejoHtml(data, { headerImageUrl: HEADER, fechaTitulo });

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

  const res = await sendResumenEmail(resendKey, {
    html,
    subject: `Resumen Diario Operación Dilesa 🏘️ ${fechaTitulo} [PRUEBA]`,
    from: 'Desarrollo Inmobiliario los Encinos <noreply@bsop.io>',
    recipients: [TEST_TO],
  });

  console.log('Resultado envío:', JSON.stringify(res));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
