/**
 * import_dilesa_expediente.ts
 *
 * Iniciativa dilesa-portafolio-activos · Sprint 3 — Fase 4.5: migración del
 * expediente digital (PDFs) de Coda a Supabase Storage + erp.adjuntos.
 *
 * Para cada venta importada en Fase 4:
 *   · 18 columnas de adjuntos en Clientes (Factura, Avalúo, Contrato,
 *     Solicitud, Recibos, Aviso PLD, Carta Notarial, Checklists, Pagaré,
 *     Constancia de Crédito, Aviso de Privacidad, FICU, Validación
 *     Patronal, Nota de Crédito, Expediente Digital, Imagen de Detonación)
 *     → erp.adjuntos con entidad_tipo='venta'.
 *
 * Para cada depósito (venta_pago) importado en Fase 4:
 *   · PDF Recibo de Caja + Comprobante Deposito → erp.adjuntos con
 *     entidad_tipo='venta_pago'.
 *
 * Cada PDF se descarga del URL `codahosted.io` (público, tokenizado), se
 * sube al bucket privado `adjuntos` (path `dilesa/ventas/<id>/<rol>__<name>`
 * o `dilesa/venta_pagos/<id>/...`), y se crea la fila de erp.adjuntos con
 * el path como `url` y `metadata` apuntando al URL fuente de Coda.
 *
 * Idempotente: el `metadata->>'coda_source_url'` es la clave de dedup —
 * re-correr salta cualquier adjunto que ya fue migrado.
 *
 * Filtrable por proyecto via env PROYECTO (ej. "Paseo del Valle"). Sin
 * filtro corre para todas las ventas DILESA.
 *
 * Concurrencia 5 (gentil con Coda y Supabase). Errores se loggean; el
 * job sigue. Resumen al final.
 *
 * Prerequisites (env): CODA_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY.
 *
 * Uso:
 *   DRY_RUN=1 PROYECTO="Paseo del Valle" npx tsx scripts/import_dilesa_expediente.ts
 *   PROYECTO="Paseo del Valle" npx tsx scripts/import_dilesa_expediente.ts
 *   npx tsx scripts/import_dilesa_expediente.ts            # todo
 */

import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CodaClient, dateStr } from '../lib/coda-api';

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const PROYECTO_FILTRO = process.env.PROYECTO ?? null;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? '3');
const MAX_RETRIES = 5;
const DRY_RUN = process.env.DRY_RUN === '1';

const CODA_DOC = 'ZNxWl_DI2D';
const CODA_CLIENTES = 'grid-mMIXWCSfyr';
const CODA_DEPOSITOS = 'grid-Foeo80pE3s';
const BUCKET = 'adjuntos';
const SOURCE_TAG = 'fase_4_5_coda_import';

if (!CODA_API_KEY) throw new Error('Falta CODA_API_KEY');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');

/** 19 columnas de adjuntos en Clientes → rol en erp.adjuntos. */
const VENTA_ATTACHMENT_COLS: Array<{ col: string; rol: string }> = [
  { col: 'PDF Factura', rol: 'factura' },
  { col: 'PDF Aprobación de Crédito', rol: 'aprobacion_credito' },
  { col: 'PDF Constancia de Credito Titular', rol: 'constancia_credito_titular' },
  { col: 'PDF Constancia de Credito Co-Titular', rol: 'constancia_credito_cotitular' },
  { col: 'PDF Aviso PLD', rol: 'aviso_pld' },
  { col: 'PDF Avaluo Comercial', rol: 'avaluo_comercial' },
  { col: 'PDF Contrato Promesa de Compraventa', rol: 'contrato_promesa' },
  { col: 'PDF Solicitud de Asignación', rol: 'solicitud_asignacion' },
  { col: 'PDF Recibos de Caja', rol: 'recibos_caja' },
  { col: 'PDF Expediente Digital Cliente', rol: 'expediente_digital' },
  { col: 'PDF Ficu', rol: 'ficu' },
  { col: 'PDF Aviso de Privacidad', rol: 'aviso_privacidad' },
  { col: 'PDF Carta Instrucción Notarial', rol: 'carta_instruccion_notarial' },
  { col: 'PDF Checklist Entrega a Cliente', rol: 'checklist_entrega' },
  { col: 'PDF Checklist Revision Pre-Entrega', rol: 'checklist_pre_entrega' },
  { col: 'PDF Validacion Patronal', rol: 'validacion_patronal' },
  { col: 'PDF Nota de Credito', rol: 'nota_credito' },
  { col: 'PDF Pagaré', rol: 'pagare' },
  { col: 'Imagen de Detonación', rol: 'imagen_detonacion' },
];

const PAGO_ATTACHMENT_COLS: Array<{ col: string; rol: string }> = [
  { col: 'PDF Recibo de Caja', rol: 'recibo_caja' },
  { col: 'Comprobante Deposito', rol: 'comprobante_deposito' },
];

type Attachment = { name: string; url: string; status?: string };

function normalizeAttachments(v: unknown): Attachment[] {
  const arr = Array.isArray(v) ? v : v ? [v] : [];
  return arr.filter(
    (a): a is Attachment =>
      !!a && typeof a === 'object' && typeof (a as Attachment).url === 'string'
  );
}

/** Nombre de archivo seguro para el path del bucket. */
function safeFilename(name: string): string {
  return (
    name
      .replace(/[^\w.\-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 120) || 'file'
  );
}

function getColId(cm: Map<string, string>, name: string): string | undefined {
  return cm.get(name.toLowerCase().trim());
}

type Target = {
  entidad_tipo: 'venta' | 'venta_pago';
  entidad_id: string;
  rol: string;
  attachment: Attachment;
};

type Result = { ok: boolean; reason?: string };

/**
 * Descarga con retry exponencial + respeto a `Retry-After` ante 429/5xx —
 * Coda regula `codahosted.io` y devuelve 429 con bursts altos.
 */
async function downloadWithRetry(
  url: string
): Promise<
  { ok: true; bytes: ArrayBuffer; contentType: string | null } | { ok: false; reason: string }
> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        const ra = res.headers.get('retry-after');
        const wait = ra ? Number(ra) * 1000 : 2000 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) return { ok: false, reason: `download ${res.status}` };
      return {
        ok: true,
        bytes: await res.arrayBuffer(),
        contentType: res.headers.get('content-type'),
      };
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt)));
        continue;
      }
      return { ok: false, reason: `fetch error: ${(e as Error).message}` };
    }
  }
  return { ok: false, reason: 'retries agotados' };
}

async function processTarget(sb: SupabaseClient, empresaId: string, t: Target): Promise<Result> {
  // 1) Download (con retry ante rate-limit)
  const dl = await downloadWithRetry(t.attachment.url);
  if (!dl.ok) return dl;
  const { bytes, contentType } = dl;

  // 2) Upload — hash corto del URL fuente evita colisión cuando dos
  // adjuntos del mismo (entidad, rol) llegan con el mismo filename.
  const filename = safeFilename(t.attachment.name);
  const folder = t.entidad_tipo === 'venta' ? 'ventas' : 'venta_pagos';
  const urlHash = createHash('md5').update(t.attachment.url).digest('hex').slice(0, 8);
  const path = `dilesa/${folder}/${t.entidad_id}/${t.rol}__${urlHash}__${filename}`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, bytes, {
    contentType: contentType ?? 'application/octet-stream',
    upsert: true,
  });
  if (upErr) return { ok: false, reason: `upload: ${upErr.message}` };

  // 3) Insert erp.adjuntos row
  const { error: insErr } = await sb
    .schema('erp')
    .from('adjuntos')
    .insert({
      empresa_id: empresaId,
      entidad_tipo: t.entidad_tipo,
      entidad_id: t.entidad_id,
      rol: t.rol,
      nombre: t.attachment.name,
      url: path,
      tipo_mime: contentType ?? null,
      tamano_bytes: bytes.byteLength,
      metadata: { coda_source_url: t.attachment.url, source: SOURCE_TAG },
    });
  if (insErr) return { ok: false, reason: `insert adjunto: ${insErr.message}` };

  return { ok: true };
}

async function runConcurrent(
  targets: Target[],
  worker: (t: Target) => Promise<Result>
): Promise<{ ok: number; fail: number; reasons: Record<string, number> }> {
  const stats = { ok: 0, fail: 0, reasons: {} as Record<string, number> };
  let cursor = 0;
  let logged = 0;
  async function pump() {
    while (cursor < targets.length) {
      const idx = cursor++;
      const r = await worker(targets[idx]);
      if (r.ok) stats.ok++;
      else {
        stats.fail++;
        const key = r.reason ?? 'unknown';
        stats.reasons[key] = (stats.reasons[key] ?? 0) + 1;
      }
      if (++logged % 50 === 0) {
        console.log(`  ${logged}/${targets.length} (${stats.ok} ok, ${stats.fail} fail)`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, pump));
  return stats;
}

async function main() {
  const coda = new CodaClient(CODA_API_KEY);
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // ── Empresa + filtro de proyecto ────────────────────────────────────────────
  const { data: emp } = await sb
    .schema('core')
    .from('empresas')
    .select('id')
    .eq('slug', 'dilesa')
    .single();
  if (!emp) throw new Error('Empresa DILESA no encontrada');
  const empresaId = emp.id as string;

  let proyectoId: string | null = null;
  if (PROYECTO_FILTRO) {
    const { data: prj } = await sb
      .schema('dilesa')
      .from('proyectos')
      .select('id, nombre')
      .eq('empresa_id', empresaId)
      .eq('nombre', PROYECTO_FILTRO)
      .single();
    if (!prj) throw new Error(`Proyecto no encontrado: ${PROYECTO_FILTRO}`);
    proyectoId = prj.id as string;
    console.log(`Filtro de proyecto: "${PROYECTO_FILTRO}" (id=${proyectoId})`);
  } else {
    console.log('Sin filtro — todas las ventas DILESA');
  }

  // ── Lookups: ventas → match por coda_row_id (llave estable) ─────────────────
  // Antes: matching por (CURP|identificador_unidad) — colapsaba 1-a-N cuando
  // múltiples ventas tenían CURP basura o cuando un cliente tenía varias
  // re-asignaciones a la misma unidad. Ahora se usa coda_row_id directo.
  const { data: ventas } = await sb
    .schema('dilesa')
    .from('ventas')
    .select('id, unidad_id, coda_row_id')
    .eq('empresa_id', empresaId)
    .not('coda_row_id', 'is', null);
  let ventasAll = (ventas ?? []) as Array<{
    id: string;
    unidad_id: string | null;
    coda_row_id: string;
  }>;

  if (proyectoId) {
    // Filtrar a ventas cuya unidad pertenece al proyecto.
    const { data: us } = await sb
      .schema('dilesa')
      .from('unidades')
      .select('id')
      .eq('proyecto_id', proyectoId);
    const unidadesProyecto = new Set((us ?? []).map((u) => u.id as string));
    ventasAll = ventasAll.filter((v) => v.unidad_id && unidadesProyecto.has(v.unidad_id));
  }
  console.log(`Ventas en alcance: ${ventasAll.length}`);

  // Map directo coda_row_id → venta_id. Único 1:1 por unique index parcial
  // sobre (empresa_id, coda_row_id) WHERE coda_row_id IS NOT NULL.
  const ventaByCodaId = new Map<string, string>();
  for (const v of ventasAll) ventaByCodaId.set(v.coda_row_id, v.id);

  // venta_pagos en alcance — `.eq(empresa_id)` + filtro JS por ventaSet
  // para evitar `.in(venta_id, 1425 uuids[])` que rebasa el límite de
  // URL de Cloudflare (HTTP 400). Ver memoria `feedback_supabase_in_url_limit`.
  const ventaIds = ventasAll.map((v) => v.id);
  const ventaSet = new Set(ventaIds);
  const { data: pagos } = await sb
    .schema('dilesa')
    .from('venta_pagos')
    .select('id, venta_id, fecha, monto, tipo')
    .eq('empresa_id', empresaId)
    .is('deleted_at', null);
  const pagosArr = (
    (pagos ?? []) as Array<{
      id: string;
      venta_id: string;
      fecha: string | null;
      monto: number;
      tipo: string | null;
    }>
  ).filter((p) => ventaSet.has(p.venta_id));
  const pagoByKey = new Map<string, string>();
  for (const p of pagosArr) {
    const key = `${p.venta_id}|${p.fecha ?? ''}|${p.monto}`;
    pagoByKey.set(key, p.id);
  }
  console.log(`Pagos en alcance: ${pagosArr.length}`);

  // Adjuntos ya migrados (idempotencia).
  const pagoSet = new Set(pagosArr.map((p) => p.id));
  const { data: existing } = await sb
    .schema('erp')
    .from('adjuntos')
    .select('entidad_tipo, entidad_id, rol, metadata')
    .eq('empresa_id', empresaId)
    .in('entidad_tipo', ['venta', 'venta_pago']);
  const existingKey = new Set<string>();
  for (const a of existing ?? []) {
    const meta = a.metadata as { coda_source_url?: string } | null;
    const src = meta?.coda_source_url;
    if (!src) continue;
    const inScope =
      (a.entidad_tipo === 'venta' && ventaSet.has(a.entidad_id as string)) ||
      (a.entidad_tipo === 'venta_pago' && pagoSet.has(a.entidad_id as string));
    if (!inScope) continue;
    existingKey.add(`${a.entidad_tipo}|${a.entidad_id}|${a.rol}|${src}`);
  }
  console.log(`Adjuntos ya migrados en alcance: ${existingKey.size}`);

  // ── Coda Clientes (rich) ─────────────────────────────────────────────────────
  const cCols = await coda.listColumns(CODA_DOC, CODA_CLIENTES);
  const cm = new Map(cCols.map((c) => [c.name.toLowerCase().trim(), c.id]));
  const cRows = await coda.listRowsAll<Record<string, unknown>>(CODA_DOC, CODA_CLIENTES, {
    valueFormat: 'rich',
  });
  const nameByVenta = new Map<string, string>(); // venta_id → cliente row name (para matchear pagos)

  const targets: Target[] = [];

  for (const row of cRows) {
    // Match 1:1 por coda_row_id (no por CURP|inv — eso colapsaba duplicados).
    const ventaId = ventaByCodaId.get(row.id);
    if (!ventaId) continue;
    nameByVenta.set(ventaId, row.name);

    for (const { col, rol } of VENTA_ATTACHMENT_COLS) {
      const cid = getColId(cm, col);
      if (!cid) continue;
      const atts = normalizeAttachments(row.values[cid]);
      for (const a of atts) {
        const k = `venta|${ventaId}|${rol}|${a.url}`;
        if (existingKey.has(k)) continue;
        targets.push({ entidad_tipo: 'venta', entidad_id: ventaId, rol, attachment: a });
      }
    }
  }

  // ── Coda Depositos (rich) ────────────────────────────────────────────────────
  const dCols = await coda.listColumns(CODA_DOC, CODA_DEPOSITOS);
  const dm = new Map(dCols.map((c) => [c.name.toLowerCase().trim(), c.id]));
  const dRows = await coda.listRowsAll<Record<string, unknown>>(CODA_DOC, CODA_DEPOSITOS, {
    valueFormat: 'rich',
  });
  const dClienteCol = getColId(dm, 'Cliente');
  const dFechaCol = getColId(dm, 'Fecha Deposito');
  const dMontoCol = getColId(dm, 'Monto Deposito');

  // venta_id → cliente Coda row name (para revertir la búsqueda).
  const ventaByClienteName = new Map<string, string>();
  for (const [vId, name] of nameByVenta) ventaByClienteName.set(name, vId);

  for (const row of dRows) {
    const clienteRaw = row.values[dClienteCol ?? ''];
    const clienteName =
      typeof clienteRaw === 'string'
        ? clienteRaw
        : Array.isArray(clienteRaw) && clienteRaw[0] && typeof clienteRaw[0] === 'object'
          ? ((clienteRaw[0] as { name?: string }).name ?? '')
          : clienteRaw && typeof clienteRaw === 'object'
            ? ((clienteRaw as { name?: string }).name ?? '')
            : '';
    if (!clienteName) continue;
    const ventaId = ventaByClienteName.get(clienteName);
    if (!ventaId) continue;

    const fecha = dateStr(row.values[dFechaCol ?? '']);
    // Monto en rich format viene como { @type: MonetaryAmount, amount, currency }.
    const montoRaw = row.values[dMontoCol ?? ''];
    const monto =
      typeof montoRaw === 'number'
        ? montoRaw
        : montoRaw && typeof montoRaw === 'object' && 'amount' in montoRaw
          ? Number((montoRaw as { amount: number | string }).amount)
          : parseFloat(String(montoRaw).replace(/[^0-9.\-]/g, ''));
    const pagoKey = `${ventaId}|${fecha ?? ''}|${monto}`;
    const pagoId = pagoByKey.get(pagoKey);
    if (!pagoId) continue;

    for (const { col, rol } of PAGO_ATTACHMENT_COLS) {
      const cid = getColId(dm, col);
      if (!cid) continue;
      const atts = normalizeAttachments(row.values[cid]);
      for (const a of atts) {
        const k = `venta_pago|${pagoId}|${rol}|${a.url}`;
        if (existingKey.has(k)) continue;
        targets.push({ entidad_tipo: 'venta_pago', entidad_id: pagoId, rol, attachment: a });
      }
    }
  }

  const ventaTargets = targets.filter((t) => t.entidad_tipo === 'venta').length;
  const pagoTargets = targets.length - ventaTargets;
  console.log(
    `\nAdjuntos por migrar: ${targets.length} (${ventaTargets} venta, ${pagoTargets} venta_pago)`
  );

  if (targets.length === 0) {
    console.log('Nada que hacer.');
    return;
  }

  if (DRY_RUN) {
    console.log('\n=== DRY RUN — no se escribe nada ===\n');
    const porRol = new Map<string, number>();
    for (const t of targets) porRol.set(t.rol, (porRol.get(t.rol) ?? 0) + 1);
    for (const [r, n] of [...porRol.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n.toString().padStart(5)}  ${r}`);
    }
    return;
  }

  console.log(`\nMigrando con concurrencia ${CONCURRENCY}…`);
  const t0 = Date.now();
  const stats = await runConcurrent(targets, (t) => processTarget(sb, empresaId, t));
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\n✔ Migrados ${stats.ok}/${targets.length} adjuntos en ${dt}s.`);
  if (stats.fail) {
    console.log(`\n✗ ${stats.fail} fallos:`);
    for (const [reason, n] of Object.entries(stats.reasons).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n.toString().padStart(5)}  ${reason}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
