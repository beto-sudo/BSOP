/**
 * run-dilesa-sync.ts
 *
 * Wrapper del cron de refresh nocturno: orquesta los 5 scripts de import
 * de Coda → BSOP en serie, captura stats pre/post (counts por tabla),
 * y manda email con resumen via Resend (siempre — éxito o fallo).
 *
 * Diseñado para correr en GitHub Actions diario a las 3am CST. Ver
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
 * Exit code: 0 si todos los pasos OK, 1 si algún paso falló (CI marca
 * el job como rojo y aparte ya mandó email).
 */

import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
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
 * Sync orquestador — 3 modos según volumen y costo:
 *
 * DAILY (default, todos los días):
 *   - Ventas, Expediente, y los 5 scripts de Construcción + Estimaciones
 *     incrementales. Todos usan UPSERT por coda_row_id (idempotentes).
 *   - Sprint 6 (cutover): se promovieron a daily porque del 2026-05-26
 *     al sábado 2026-05-31 el equipo sigue capturando en Coda — sin esto,
 *     las nuevas tareas/contratos/contratistas no llegarían a BSOP.
 *   - Orden importa por FK: contratistas → catálogos → contratos →
 *     construcción → tareas_terminadas → estimaciones (backfill incr).
 *
 * FULL (FULL=1, manual):
 *   - DAILY + terrenos + proyectos + inventario. Los 3 últimos cambian
 *     mensual y sus scripts antes truenaban (resuelto en F2 con UPSERT
 *     puro, ver iniciativa dilesa-portafolio).
 */
const FULL = process.env.FULL === '1';

const CONSTRUCCION_SCRIPTS: Array<{ name: string; path: string }> = [
  { name: 'Contratistas', path: 'scripts/import_dilesa_contratistas.ts' },
  { name: 'Construcción catálogos', path: 'scripts/import_dilesa_construccion_catalogos.ts' },
  { name: 'Contratos construcción', path: 'scripts/import_dilesa_contratos_construccion.ts' },
  { name: 'Construcción (obras)', path: 'scripts/import_dilesa_construccion.ts' },
  { name: 'Tareas terminadas', path: 'scripts/import_dilesa_tareas_terminadas.ts' },
  { name: 'Estimaciones (incr)', path: 'scripts/import_dilesa_estimaciones_incremental.ts' },
];

const DAILY_SCRIPTS: Array<{ name: string; path: string }> = [
  ...CONSTRUCCION_SCRIPTS,
  { name: 'Ventas', path: 'scripts/import_dilesa_ventas.ts' },
  { name: 'Expediente', path: 'scripts/import_dilesa_expediente.ts' },
];
const FULL_SCRIPTS: Array<{ name: string; path: string }> = [
  { name: 'Terrenos', path: 'scripts/import_dilesa_terrenos.ts' },
  { name: 'Proyectos', path: 'scripts/import_dilesa_proyectos.ts' },
  { name: 'Inventario', path: 'scripts/import_dilesa_inventario.ts' },
  ...DAILY_SCRIPTS,
];
const SCRIPTS = FULL ? FULL_SCRIPTS : DAILY_SCRIPTS;

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

function fmtDiff(pre: number, post: number): string {
  const d = post - pre;
  if (d === 0) return `${post.toLocaleString('es-MX')}`;
  const sign = d > 0 ? '+' : '';
  return `${post.toLocaleString('es-MX')} (${sign}${d.toLocaleString('es-MX')})`;
}

function buildHtml(opts: {
  status: 'ok' | 'fail';
  pre: Counts;
  post: Counts;
  steps: StepResult[];
  totalMs: number;
}): { subject: string; html: string } {
  const { status, pre, post, steps, totalMs } = opts;
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
      ['Terrenos', pre.terrenos, post.terrenos],
      ['Proyectos', pre.proyectos, post.proyectos],
      ['Unidades', pre.unidades, post.unidades],
      ['Ventas', pre.ventas, post.ventas],
      ['Personas (clientes)', pre.personas_cliente, post.personas_cliente],
      ['Pagos', pre.pagos, post.pagos],
      ['Fases del pipeline', pre.fases, post.fases],
      ['Adjuntos venta', pre.adjuntos_venta, post.adjuntos_venta],
      ['Adjuntos venta_pago', pre.adjuntos_pago, post.adjuntos_pago],
      ['Contratistas', pre.personas_contratista, post.personas_contratista],
      ['Contratos construcción', pre.contratos_construccion, post.contratos_construccion],
      ['Construcciones (obras)', pre.construcciones, post.construcciones],
      ['Tareas terminadas', pre.tareas_terminadas, post.tareas_terminadas],
      ['Estimaciones', pre.estimaciones, post.estimaciones],
      ['Estimación-tareas (vínculos)', pre.estimacion_tareas, post.estimacion_tareas],
    ] as [string, number, number][]
  )
    .map(
      ([label, p, q]) =>
        `<tr><td style="padding:4px 12px 4px 0">${label}</td><td style="padding:4px 0;font-family:monospace;text-align:right">${fmtDiff(p, q)}</td></tr>`
    )
    .join('');

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

  <h3 style="margin:16px 0 4px">Conteos (antes → después)</h3>
  <table style="border-collapse:collapse">${rows}</table>

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

async function sendEmail(subject: string, html: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [NOTIFY_EMAIL],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`✗ Resend error ${res.status}: ${text}`);
    return;
  }
  console.log(`✔ Email enviado a ${NOTIFY_EMAIL}`);
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

  const totalMs = Date.now() - t0;
  console.log(`\n=== Total: ${fmtDuration(totalMs)} ===`);

  const { subject, html } = buildHtml({
    status: anyFail ? 'fail' : 'ok',
    pre,
    post,
    steps,
    totalMs,
  });
  await sendEmail(subject, html);

  if (anyFail) process.exit(1);
}

void main().catch((e) => {
  console.error('Error fatal:', e);
  // Best-effort email del fatal antes de salir
  void sendEmail(
    `✗✗ Sync DILESA Coda→BSOP — error FATAL`,
    `<pre>${escapeHtml((e as Error).stack ?? String(e))}</pre>`
  ).finally(() => process.exit(1));
});
