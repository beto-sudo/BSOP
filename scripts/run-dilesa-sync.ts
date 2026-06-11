/**
 * run-dilesa-sync.ts
 *
 * Wrapper del sync Coda → BSOP: orquesta los scripts de import en serie,
 * captura stats pre/post (counts por tabla), y manda email con resumen
 * via Resend (siempre — éxito o fallo).
 *
 * Corrió como cron nocturno (3am CST) hasta el cutover: construcción se
 * cortó el 2026-06-09 y ventas/expediente el 2026-06-11 (S6 de
 * dilesa-ventas-expediente — BSOP master, Coda read-only). Hoy solo se
 * ejecuta manual vía workflow_dispatch para rezagos puntuales. Ver
 * `.github/workflows/dilesa-coda-sync.yml` y `docs/runbooks/dilesa-coda-sync.md`.
 *
 * Idempotencia:
 *   - terrenos/proyectos/inventario: UPSERT. Re-corrida segura.
 *   - ventas: DELETE+INSERT pero **solo borra rows con coda_row_id NOT NULL**.
 *     Las ventas creadas nativas en BSOP se preservan.
 *   - expediente: INSERT-only, dedup por metadata->>'coda_source_url'.
 *     Solo descarga/sube archivos nuevos.
 *
 * Env requeridos:
 *   CODA_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   RESEND_API_KEY, NOTIFY_EMAIL
 *
 * CODA_API_KEY también se usa al final para snapshot de paridad (rowCount
 * por tabla con mapping 1:1) — se muestra como columna "Coda" en el email
 * con flag de drift. Si falla, se omite la columna sin romper el sync.
 *
 * Exit code: 0 si todos los pasos OK, 1 si algún paso falló (CI marca
 * el job como rojo y aparte ya mandó email).
 */

import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { CodaClient } from '../lib/coda-api';
import {
  getDefinitionBySlug,
  renderSubject,
  splitRecipientsExtra,
  writeNotificationLog,
} from '../lib/notifications';

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
// Para usar un dominio propio (más pro), verifícalo en Resend → Domains y
// override con el secret SYNC_FROM_EMAIL. **Usamos `||` no `??`**: GH
// Actions setea SYNC_FROM_EMAIL como env var vacía cuando el secret no
// existe, lo cual `??` no detecta — y mandar `from: ""` a Resend retorna
// 422 "domain is invalid" (causa raíz de todos los fails de email).
const FROM_EMAIL = process.env.SYNC_FROM_EMAIL || 'BSOP Sync <noreply@bsop.io>';

if (!RESEND_API_KEY) throw new Error('Falta RESEND_API_KEY');
if (!NOTIFY_EMAIL) throw new Error('Falta NOTIFY_EMAIL');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');

const DILESA_EMPRESA_ID = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479';

/**
 * IDs de Coda para reconciliación post-sync. Doc DILESA `ZNxWl_DI2D`.
 * Solo tablas con mapping 1:1 limpio — derivadas (estimaciones) y agregados
 * (catálogos N:1) NO se incluyen porque su comparación requiere lógica que
 * no aporta tanto en el email.
 */
const CODA_DOC = 'ZNxWl_DI2D';
const CODA_TABLES = {
  contratistas: 'grid-b-HTXuSZp4',
  contratos_construccion: 'grid-OWReJ19erT',
  construcciones: 'grid-CkajhVirlg',
  tareas_terminadas: 'grid-fJSixLw1DF',
  ventas: 'grid-mMIXWCSfyr', // tabla "Clientes" en Coda — 1 cliente = 1 venta
  pagos: 'grid-Foeo80pE3s', // tabla "Depósitos" en Coda
} as const;

type CodaCounts = Partial<Record<keyof typeof CODA_TABLES, number>>;

/**
 * Sync orquestador — 3 modos según volumen y costo:
 *
 * DAILY (default, todos los días):
 *   - Solo Ventas + Expediente. Construcción se cortó del daily el
 *     2026-06-09 (cutover de obra a BSOP): los supervisores ya no tienen
 *     acceso a palomear tareas en Coda, así que seguir sincronizando solo
 *     re-traería captura vieja o colisionaría con la captura nativa.
 *     Ventas/Expediente siguen hasta su propio cutoff.
 *
 * CONSTRUCCION (CONSTRUCCION=1, manual):
 *   - Los 6 scripts de construcción + ventas/expediente. Para traer un
 *     rezago puntual de Coda post-cutover. Orden importa por FK:
 *     contratistas → catálogos → contratos → construcción →
 *     tareas_terminadas → estimaciones (backfill incr). Todos idempotentes
 *     por coda_row_id.
 *
 * FULL (FULL=1, manual):
 *   - Todo: terrenos + proyectos + inventario + construcción + ventas +
 *     expediente. Los 3 de portafolio cambian mensual y sus scripts antes
 *     truenaban (resuelto en F2 con UPSERT puro, ver dilesa-portafolio).
 */
const FULL = process.env.FULL === '1';
const CONSTRUCCION = process.env.CONSTRUCCION === '1';

const CONSTRUCCION_SCRIPTS: Array<{ name: string; path: string }> = [
  { name: 'Contratistas', path: 'scripts/import_dilesa_contratistas.ts' },
  { name: 'Construcción catálogos', path: 'scripts/import_dilesa_construccion_catalogos.ts' },
  { name: 'Contratos construcción', path: 'scripts/import_dilesa_contratos_construccion.ts' },
  { name: 'Construcción (obras)', path: 'scripts/import_dilesa_construccion.ts' },
  { name: 'Tareas terminadas', path: 'scripts/import_dilesa_tareas_terminadas.ts' },
  { name: 'Estimaciones (incr)', path: 'scripts/import_dilesa_estimaciones_incremental.ts' },
];

const DAILY_SCRIPTS: Array<{ name: string; path: string }> = [
  { name: 'Ventas', path: 'scripts/import_dilesa_ventas.ts' },
  { name: 'Expediente', path: 'scripts/import_dilesa_expediente.ts' },
  // Puente venta_pagos → CxC (la UI de cuadratura/estado de cuenta lee
  // erp.cxc_pagos). Va después de Expediente: recablea adjuntos recién
  // importados. Muere con el daily al cutoff de ventas.
  { name: 'CxC puente (incr)', path: 'scripts/sync_dilesa_cxc_incremental.ts' },
];
const FULL_SCRIPTS: Array<{ name: string; path: string }> = [
  { name: 'Terrenos', path: 'scripts/import_dilesa_terrenos.ts' },
  { name: 'Proyectos', path: 'scripts/import_dilesa_proyectos.ts' },
  { name: 'Inventario', path: 'scripts/import_dilesa_inventario.ts' },
  ...CONSTRUCCION_SCRIPTS,
  ...DAILY_SCRIPTS,
];
const SCRIPTS = FULL
  ? FULL_SCRIPTS
  : CONSTRUCCION
    ? [...CONSTRUCCION_SCRIPTS, ...DAILY_SCRIPTS]
    : DAILY_SCRIPTS;

type StepResult = {
  name: string;
  ok: boolean;
  durationMs: number;
  output: string;
  error?: string;
};

/** Snapshot de counts por tabla — para el reporte de diff antes/después. */
type Counts = {
  terrenos: number;
  proyectos: number;
  unidades: number;
  ventas: number;
  pagos: number;
  fases: number;
  adjuntos_venta: number;
  adjuntos_pago: number;
  personas_cliente: number;
  // Sprint 6 cutover — tablas de construcción + estimaciones.
  personas_contratista: number;
  contratos_construccion: number;
  construcciones: number;
  tareas_terminadas: number;
  estimaciones: number;
  estimacion_tareas: number;
};

/**
 * Cuenta rows reportadas por Coda para las tablas con mapping 1:1.
 * 1 HTTP request por tabla (endpoint `/tables/{id}` devuelve `rowCount`).
 * Si CODA_API_KEY no está set o algo falla, devuelve null y el email
 * omite la columna — no bloquea el sync.
 */
async function takeCodaSnapshot(): Promise<CodaCounts | null> {
  if (!CODA_API_KEY) return null;
  try {
    const coda = new CodaClient(CODA_API_KEY);
    const out: CodaCounts = {};
    for (const [key, tableId] of Object.entries(CODA_TABLES) as Array<
      [keyof typeof CODA_TABLES, string]
    >) {
      out[key] = await coda.getTableRowCount(CODA_DOC, tableId);
    }
    return out;
  } catch (e) {
    console.error(`✗ Coda snapshot falló (no fatal): ${(e as Error).message}`);
    return null;
  }
}

async function takeSnapshot(): Promise<Counts> {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const c = async (schema: string, table: string, extra?: Record<string, unknown>) => {
    let q = sb
      .schema(schema as 'dilesa' | 'erp')
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', DILESA_EMPRESA_ID);
    for (const [k, v] of Object.entries(extra ?? {})) q = q.eq(k, v);
    const { count } = await q;
    return count ?? 0;
  };
  const cAdj = async (entTipo: string) => {
    const { count } = await sb
      .schema('erp')
      .from('adjuntos')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .eq('entidad_tipo', entTipo);
    return count ?? 0;
  };
  return {
    terrenos: await c('dilesa', 'activos', { tipo: 'terreno' }),
    proyectos: await c('dilesa', 'proyectos'),
    unidades: await c('dilesa', 'unidades'),
    ventas: await c('dilesa', 'ventas'),
    pagos: await c('dilesa', 'venta_pagos'),
    fases: await c('dilesa', 'venta_fases'),
    adjuntos_venta: await cAdj('venta'),
    adjuntos_pago: await cAdj('venta_pago'),
    personas_cliente: await c('erp', 'personas', { tipo: 'cliente' }),
    personas_contratista: await c('erp', 'personas', { tipo: 'contratista' }),
    contratos_construccion: await c('dilesa', 'contratos_construccion'),
    construcciones: await c('dilesa', 'construccion'),
    tareas_terminadas: await c('dilesa', 'construccion_tareas_terminadas'),
    estimaciones: await c('dilesa', 'estimaciones'),
    estimacion_tareas: await c('dilesa', 'estimacion_tareas'),
  };
}

async function runScript(script: { name: string; path: string }): Promise<StepResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const out: string[] = [];
    const prefix = `  [${script.name}] `;
    const child = spawn('npx', ['tsx', script.path], { env: process.env });
    // Forward stdout/stderr a parent en vivo (no esperar al final) — sin
    // esto, GH Actions log no muestra progreso del child y cualquier
    // timeout/cancelación deja al usuario sin info de qué estaba haciendo.
    child.stdout.on('data', (b: Buffer) => {
      const s = b.toString();
      out.push(s);
      for (const line of s.split('\n')) if (line) console.log(prefix + line);
    });
    child.stderr.on('data', (b: Buffer) => {
      const s = b.toString();
      out.push(s);
      for (const line of s.split('\n')) if (line) console.error(prefix + line);
    });
    child.on('close', (code) => {
      const durationMs = Date.now() - start;
      const output = out.join('');
      resolve({
        name: script.name,
        ok: code === 0,
        durationMs,
        output: output.slice(-4000), // últimas líneas (cap para email)
        error: code === 0 ? undefined : `exit code ${code}`,
      });
    });
  });
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}

/** Devuelve los 3 strings que van a las 3 columnas del email: Antes, Después,
 *  Δ con color (verde si suma, rojo si resta, gris si igual). */
function fmtRowCells(pre: number, post: number): { antes: string; despues: string; delta: string } {
  const d = post - pre;
  const fmt = (n: number) => n.toLocaleString('es-MX');
  const antes = fmt(pre);
  const despues = fmt(post);
  if (d === 0) {
    return {
      antes,
      despues,
      delta: `<span style="color:#999">—</span>`,
    };
  }
  const color = d > 0 ? '#0a8a3a' : '#c0392b';
  const sign = d > 0 ? '+' : '−';
  return {
    antes,
    despues,
    delta: `<span style="color:${color};font-weight:600">${sign}${fmt(Math.abs(d))}</span>`,
  };
}

/**
 * Celda "Coda" del email — paridad vs BSOP post-sync.
 *  - undefined (sin pareo en Coda) → dash gris claro.
 *  - Coda === post                 → verde (paridad).
 *  - Coda  >  post                 → rojo bold (faltan rows en BSOP, drift real).
 *  - Coda  <  post                 → naranja (BSOP > Coda, normalmente nativos BSOP).
 */
function fmtCodaCell(post: number, coda?: number): string {
  if (coda === undefined) return `<span style="color:#ccc">—</span>`;
  const fmt = (n: number) => n.toLocaleString('es-MX');
  const c = fmt(coda);
  if (coda === post) {
    return `<span style="color:#0a8a3a">${c}</span>`;
  }
  if (coda > post) {
    const missing = fmt(coda - post);
    return `<span style="color:#c0392b;font-weight:600" title="Coda tiene ${missing} rows que no están en BSOP">${c} <small>(faltan ${missing})</small></span>`;
  }
  const extra = fmt(post - coda);
  return `<span style="color:#e67e22" title="BSOP tiene ${extra} rows que no vienen de Coda (nativos)">${c} <small>(+${extra} nat.)</small></span>`;
}

function buildHtml(opts: {
  status: 'ok' | 'fail';
  pre: Counts;
  post: Counts;
  coda: CodaCounts | null;
  steps: StepResult[];
  totalMs: number;
}): { subject: string; html: string } {
  const { status, pre, post, coda, steps, totalMs } = opts;
  const includeCoda = coda !== null;
  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const subject =
    status === 'ok'
      ? `✓ Sync DILESA Coda→BSOP — ${today}`
      : `✗ Sync DILESA Coda→BSOP FALLÓ — ${today}`;

  const rows = (
    [
      ['Terrenos', pre.terrenos, post.terrenos, undefined],
      ['Proyectos', pre.proyectos, post.proyectos, undefined],
      ['Unidades', pre.unidades, post.unidades, undefined],
      ['Ventas', pre.ventas, post.ventas, coda?.ventas],
      ['Personas (clientes)', pre.personas_cliente, post.personas_cliente, undefined],
      ['Pagos', pre.pagos, post.pagos, coda?.pagos],
      ['Fases del pipeline', pre.fases, post.fases, undefined],
      ['Adjuntos venta', pre.adjuntos_venta, post.adjuntos_venta, undefined],
      ['Adjuntos venta_pago', pre.adjuntos_pago, post.adjuntos_pago, undefined],
      ['Contratistas', pre.personas_contratista, post.personas_contratista, coda?.contratistas],
      [
        'Contratos construcción',
        pre.contratos_construccion,
        post.contratos_construccion,
        coda?.contratos_construccion,
      ],
      ['Construcciones (obras)', pre.construcciones, post.construcciones, coda?.construcciones],
      ['Tareas terminadas', pre.tareas_terminadas, post.tareas_terminadas, coda?.tareas_terminadas],
      ['Estimaciones', pre.estimaciones, post.estimaciones, undefined],
      ['Estimación-tareas (vínculos)', pre.estimacion_tareas, post.estimacion_tareas, undefined],
    ] as [string, number, number, number | undefined][]
  )
    .map(([label, p, q, codaCount]) => {
      const cells = fmtRowCells(p, q);
      const codaTd = includeCoda
        ? `<td style="padding:4px 0 4px 12px;font-family:monospace;text-align:right">${fmtCodaCell(q, codaCount)}</td>`
        : '';
      return `<tr>
  <td style="padding:4px 12px 4px 0">${label}</td>
  <td style="padding:4px 12px 4px 0;font-family:monospace;text-align:right;color:#888">${cells.antes}</td>
  <td style="padding:4px 12px 4px 0;font-family:monospace;text-align:right">${cells.despues}</td>
  <td style="padding:4px 12px 4px 0;font-family:monospace;text-align:right">${cells.delta}</td>${codaTd}
</tr>`;
    })
    .join('');

  const codaTh = includeCoda
    ? `<th style="padding:4px 0 6px 12px;text-align:right;font-size:11px;color:#666;font-weight:600;text-transform:uppercase">Coda</th>`
    : '';
  const tableHeader = `<thead>
  <tr style="border-bottom:1px solid #ddd">
    <th style="padding:4px 12px 6px 0;text-align:left;font-size:11px;color:#666;font-weight:600;text-transform:uppercase">Tabla</th>
    <th style="padding:4px 12px 6px 0;text-align:right;font-size:11px;color:#666;font-weight:600;text-transform:uppercase">Antes</th>
    <th style="padding:4px 12px 6px 0;text-align:right;font-size:11px;color:#666;font-weight:600;text-transform:uppercase">Después</th>
    <th style="padding:4px 12px 6px 0;text-align:right;font-size:11px;color:#666;font-weight:600;text-transform:uppercase">Δ</th>${codaTh}
  </tr>
</thead>`;

  const stepRows = steps
    .map(
      (s) =>
        `<tr><td style="padding:3px 12px 3px 0">${s.ok ? '✓' : '✗'} ${s.name}</td><td style="padding:3px 0;font-family:monospace;color:#666">${fmtDuration(s.durationMs)}</td>${s.error ? `<td style="padding:3px 0 3px 12px;color:#c00">${s.error}</td>` : '<td></td>'}</tr>`
    )
    .join('');

  const failedSteps = steps.filter((s) => !s.ok);
  const errorsBlock =
    failedSteps.length > 0
      ? `<h3 style="margin-top:24px">Output de pasos fallidos</h3>${failedSteps
          .map(
            (s) =>
              `<details><summary><b>${s.name}</b> — ${s.error}</summary><pre style="background:#f5f5f5;padding:12px;overflow:auto;font-size:11px;white-space:pre-wrap">${escapeHtml(s.output)}</pre></details>`
          )
          .join('')}`
      : '';

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:640px;color:#111">
  <h2 style="margin:0 0 8px">${subject}</h2>
  <p style="color:#666;margin:0 0 16px">
    Total: <b>${fmtDuration(totalMs)}</b>
    ${steps.length === SCRIPTS.length ? `· ${steps.filter((s) => s.ok).length}/${steps.length} pasos OK` : ''}
  </p>

  <h3 style="margin:16px 0 4px">Conteos (antes → después${includeCoda ? ' · paridad con Coda' : ''})</h3>
  <table style="border-collapse:collapse">${tableHeader}<tbody>${rows}</tbody></table>
  ${
    includeCoda
      ? `<p style="color:#888;font-size:11px;margin:6px 0 0">Coda en <span style="color:#0a8a3a">verde</span> = paridad. <span style="color:#c0392b">Rojo</span> = Coda tiene más rows que BSOP (algo no se importó). <span style="color:#e67e22">Naranja</span> = BSOP &gt; Coda (rows nativos BSOP, normal en ventas/pagos).</p>`
      : ''
  }

  <h3 style="margin:24px 0 4px">Pasos</h3>
  <table style="border-collapse:collapse">${stepRows}</table>

  ${errorsBlock}

  <p style="color:#888;font-size:11px;margin-top:32px">
    Cron diario configurado en .github/workflows/dilesa-coda-sync.yml.
    Runbook: docs/runbooks/dilesa-coda-sync.md.
  </p>
</div>`;

  return { subject, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Envía el reporte de sync vía Resend, leyendo overrides runtime del catálogo
 * `core.notification_definitions` (slug `dilesa_sync_report`) y escribiendo
 * fila en `core.notification_log`. Iniciativa notificaciones-catalogo · S2.
 *
 * Fail-open: si la definición no se puede leer o `activo=false`, NO bloquea
 * el envío con la config hardcoded — el sync nocturno debe seguir llegando
 * incluso si la DB tiene problemas. El kill switch real es desactivar el
 * GitHub Actions workflow.
 */
async function sendEmail(subject: string, html: string, fecha: string): Promise<void> {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const def = await getDefinitionBySlug(sb, 'dilesa_sync_report');

  // Defaults hardcoded (estado pre-iniciativa) — usados si def es null.
  let fromAddress = FROM_EMAIL;
  let replyTo: string | null = null;
  let finalSubject = subject;
  let toList = [NOTIFY_EMAIL];
  let ccList: string[] = [];
  let bccList: string[] = [];

  if (def) {
    if (!def.activo) {
      console.log('⚠ dilesa_sync_report.activo=false — skip envío');
      await writeNotificationLog(sb, {
        definitionId: def.id,
        status: 'skipped',
        recipients: { to: toList },
        subject: finalSubject,
      });
      return;
    }
    const fromName = def.from_name ? `${def.from_name} <${def.from_email}>` : def.from_email;
    fromAddress = fromName;
    replyTo = def.reply_to;
    finalSubject = renderSubject(def.subject_template, { fecha });
    // Manda con el subject del helper si trae '✓ ' / '✗ ' del status, sino
    // usa el template editable de la definition.
    if (subject.startsWith('✗')) finalSubject = subject; // preserva el fail marker
    const extras = splitRecipientsExtra(def.recipients_extra);
    toList = [NOTIFY_EMAIL, ...extras.to];
    ccList = extras.cc;
    bccList = extras.bcc;
  }

  const body: Record<string, unknown> = {
    from: fromAddress,
    to: toList,
    subject: finalSubject,
    html,
  };
  if (replyTo) body.reply_to = replyTo;
  if (ccList.length) body.cc = ccList;
  if (bccList.length) body.bcc = bccList;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`✗ Resend error ${res.status}: ${text}`);
    await writeNotificationLog(sb, {
      definitionId: def?.id ?? null,
      status: 'failed',
      recipients: { to: toList, cc: ccList, bcc: bccList },
      subject: finalSubject,
      errorMessage: `Resend ${res.status}: ${text}`.slice(0, 1000),
    });
    return;
  }
  const json = (await res.json().catch(() => null)) as { id?: string } | null;
  console.log(`✔ Email enviado a ${NOTIFY_EMAIL}`);
  await writeNotificationLog(sb, {
    definitionId: def?.id ?? null,
    status: 'sent',
    recipients: { to: toList, cc: ccList, bcc: bccList },
    subject: finalSubject,
    resendId: json?.id ?? null,
  });
}

async function main(): Promise<void> {
  const t0 = Date.now();
  console.log(`=== Sync DILESA Coda→BSOP arrancando ${new Date().toISOString()} ===\n`);

  console.log('Snapshot pre-sync...');
  const pre = await takeSnapshot();
  console.log(`  ventas: ${pre.ventas}, adjuntos: ${pre.adjuntos_venta + pre.adjuntos_pago}\n`);

  const steps: StepResult[] = [];
  let anyFail = false;
  for (const script of SCRIPTS) {
    console.log(`▶ ${script.name}...`);
    const r = await runScript(script);
    steps.push(r);
    console.log(
      `  ${r.ok ? '✔' : '✗'} ${script.name} (${fmtDuration(r.durationMs)})${r.error ? ` — ${r.error}` : ''}`
    );
    if (!r.ok) {
      anyFail = true;
      // Continúa con los demás pasos — el email reporta el conjunto.
    }
  }

  console.log('\nSnapshot post-sync...');
  const post = await takeSnapshot();
  console.log(`  ventas: ${post.ventas}, adjuntos: ${post.adjuntos_venta + post.adjuntos_pago}`);

  console.log('\nSnapshot Coda (paridad)...');
  const coda = await takeCodaSnapshot();
  if (coda) {
    console.log(`  contratistas: ${coda.contratistas}, tareas: ${coda.tareas_terminadas}`);
  } else {
    console.log('  (omitido — sin CODA_API_KEY o error de red)');
  }

  const totalMs = Date.now() - t0;
  console.log(`\n=== Total: ${fmtDuration(totalMs)} ===`);

  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const { subject, html } = buildHtml({
    status: anyFail ? 'fail' : 'ok',
    pre,
    post,
    coda,
    steps,
    totalMs,
  });
  await sendEmail(subject, html, today);

  if (anyFail) process.exit(1);
}

void main().catch((e) => {
  console.error('Error fatal:', e);
  // Best-effort email del fatal antes de salir
  const today = new Date().toLocaleDateString('es-MX', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  void sendEmail(
    `✗✗ Sync DILESA Coda→BSOP — error FATAL`,
    `<pre>${escapeHtml((e as Error).stack ?? String(e))}</pre>`,
    today
  ).finally(() => process.exit(1));
});
