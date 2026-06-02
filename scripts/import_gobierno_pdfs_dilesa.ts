/**
 * Sprint 4b — sube a Storage (bucket `adjuntos`, convención `dilesa/gobierno/…`)
 * el Reglamento de Gobierno + los PDFs de actas de DILESA, crea las filas en
 * `erp.documentos` y las liga (`core.gobierno_actas.documento_id` /
 * `core.gobierno_config.reglamento_documento_id`).
 *
 * Idempotente: si el acta ya tiene `documento_id` (o el config ya tiene
 * reglamento), se salta. Upload con upsert:true. Liga por FOLIO parseado del
 * nombre del archivo; los 31/32/34 usan la versión protocolizada (alta-res).
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL (default al proyecto), SUPABASE_SERVICE_ROLE_KEY.
 * DRY_RUN=1 → solo lista lo que haría.
 *
 * Uso:
 *   SUPABASE_SERVICE_ROLE_KEY="$(op read 'op://Infrastructure/SUPABASE_SERVICE_ROLE_KEY/credential')" \
 *   npx tsx scripts/import_gobierno_pdfs_dilesa.ts
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://ybklderteyhuugzfmxbi.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY = process.env.DRY_RUN === '1';
const BUCKET = 'adjuntos';

const BASE =
  '/Users/Beto/Library/CloudStorage/GoogleDrive-beto@anorte.com/Shared drives/Dilesa Drive/Dirección Dilesa';
const ESCANEADAS = join(BASE, 'Actas de Asamblea Dilesa', 'Actas de Asamblea escaneadas '); // ojo: espacio final real
const PROTO = join(BASE, 'Actas de Asamblea Dilesa', 'Actas Protocolizadas');
const REGLAMENTO = join(BASE, 'Reglamento CA Dilesa FINAL FIRMADO agosto 2021.pdf');

if (!KEY) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

/* eslint-disable @typescript-eslint/no-explicit-any */

function folioFromName(name: string): string | null {
  const m1 = name.match(/D[Ii]lesa\s+(\d+)/);
  if (m1) return m1[1];
  const m2 = name.match(/Acta\s+(\d+)/);
  return m2 ? m2[1] : null;
}

/** Años detectables en el nombre del archivo (4 dígitos + 2 dígitos tras mes es). */
function yearsFromName(name: string): number[] {
  const ys = new Set<number>();
  for (const m of name.matchAll(/\b(?:19|20)\d{2}\b/g)) ys.add(Number(m[0]));
  for (const m of name.matchAll(
    /(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*[.\-\s]*(\d{2})\b/gi
  )) {
    ys.add(2000 + Number(m[1]));
  }
  return [...ys];
}

async function uploadAndLinkActa(
  empresaId: string,
  folio: string,
  filePath: string,
  fecha: string | null
): Promise<'linked' | 'skipped' | 'error'> {
  const { data: acta, error: aErr } = await (sb.schema('core') as any)
    .from('gobierno_actas')
    .select('id, documento_id')
    .eq('empresa_id', empresaId)
    .eq('folio', folio)
    .maybeSingle();
  if (aErr) {
    console.error(`  acta ${folio}: lookup error ${aErr.message}`);
    return 'error';
  }
  if (!acta) {
    console.warn(`  acta ${folio}: no existe header en gobierno_actas — skip`);
    return 'skipped';
  }
  if (acta.documento_id) {
    console.log(`  acta ${folio}: ya ligada — skip`);
    return 'skipped';
  }

  // Sanity por año: no ligar un PDF cuyo año contradice la fecha sembrada del
  // acta (el numerado del folder no siempre cuadra con el índice — ej. acta 1).
  const fileName = filePath.split('/').pop() ?? '';
  const ys = yearsFromName(fileName);
  if (fecha && ys.length && !ys.some((y) => Math.abs(y - Number(fecha.slice(0, 4))) <= 1)) {
    console.warn(
      `  acta ${folio}: ⚠ posible mismatch — archivo años [${ys.join(', ')}] vs acta ${fecha.slice(0, 4)}; NO ligo (revisar a mano)`
    );
    return 'skipped';
  }

  const storagePath = `dilesa/gobierno/actas/acta-${folio}.pdf`;
  if (DRY) {
    console.log(`  [dry] acta ${folio} ← ${filePath.split('/').pop()} → ${storagePath}`);
    return 'linked';
  }

  const bytes = readFileSync(filePath);
  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) {
    console.error(`  acta ${folio}: upload error ${upErr.message}`);
    return 'error';
  }

  const { data: doc, error: dErr } = await (sb.schema('erp') as any)
    .from('documentos')
    .insert({
      empresa_id: empresaId,
      titulo: `DILESA — Acta de asamblea ${folio}`,
      numero_documento: folio,
      tipo_operacion: 'acta_asamblea',
      fecha_emision: fecha,
      archivo_url: storagePath,
    })
    .select('id')
    .single();
  if (dErr) {
    console.error(`  acta ${folio}: insert documento error ${dErr.message}`);
    return 'error';
  }

  const { error: linkErr } = await (sb.schema('core') as any)
    .from('gobierno_actas')
    .update({ documento_id: doc.id, updated_at: new Date().toISOString() })
    .eq('id', acta.id);
  if (linkErr) {
    console.error(`  acta ${folio}: link error ${linkErr.message}`);
    return 'error';
  }
  console.log(`  acta ${folio}: ✓ subida + ligada (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`);
  return 'linked';
}

async function main() {
  const { data: emp, error: eErr } = await (sb.schema('core') as any)
    .from('empresas')
    .select('id')
    .eq('slug', 'dilesa')
    .single();
  if (eErr || !emp) {
    console.error('No se encontró DILESA.');
    process.exit(1);
  }
  const empresaId = emp.id as string;
  console.log(`DILESA = ${empresaId}${DRY ? ' (DRY RUN)' : ''}\n`);

  // Fechas de las actas (para fecha_emision del documento).
  const { data: actas } = await (sb.schema('core') as any)
    .from('gobierno_actas')
    .select('folio, fecha')
    .eq('empresa_id', empresaId);
  const fechaByFolio = new Map<string, string>(
    ((actas ?? []) as any[]).map((a) => [a.folio, a.fecha])
  );

  // 1) Reglamento.
  console.log('Reglamento:');
  const { data: cfg } = await (sb.schema('core') as any)
    .from('gobierno_config')
    .select('empresa_id, reglamento_documento_id')
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (cfg?.reglamento_documento_id) {
    console.log('  ya ligado — skip');
  } else if (!existsSync(REGLAMENTO)) {
    console.warn('  archivo del reglamento no encontrado — skip');
  } else if (DRY) {
    console.log('  [dry] subiría reglamento → dilesa/gobierno/reglamento-gobierno-2021.pdf');
  } else {
    const bytes = readFileSync(REGLAMENTO);
    const path = 'dilesa/gobierno/reglamento-gobierno-2021.pdf';
    const { error: upErr } = await sb.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
    if (upErr) console.error(`  upload error ${upErr.message}`);
    else {
      const { data: doc, error: dErr } = await (sb.schema('erp') as any)
        .from('documentos')
        .insert({
          empresa_id: empresaId,
          titulo: 'DILESA — Reglamento de Gobierno (ago-2021)',
          tipo_operacion: 'reglamento',
          fecha_emision: '2021-08-01',
          archivo_url: path,
        })
        .select('id')
        .single();
      if (dErr) console.error(`  insert documento error ${dErr.message}`);
      else {
        await (sb.schema('core') as any)
          .from('gobierno_config')
          .update({ reglamento_documento_id: doc.id, updated_at: new Date().toISOString() })
          .eq('empresa_id', empresaId);
        console.log(`  ✓ subido + ligado (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`);
      }
    }
  }

  // 2) Actas. Mapa folio → archivo (protocolizadas pisan a escaneadas).
  console.log('\nActas:');
  const fileByFolio = new Map<string, string>();
  for (const f of readdirSync(ESCANEADAS)) {
    if (!f.toLowerCase().endsWith('.pdf')) continue;
    const folio = folioFromName(f);
    if (folio) fileByFolio.set(folio, join(ESCANEADAS, f));
  }
  if (existsSync(PROTO)) {
    for (const f of readdirSync(PROTO)) {
      if (!f.toLowerCase().endsWith('.pdf')) continue;
      const folio = folioFromName(f);
      if (folio) fileByFolio.set(folio, join(PROTO, f)); // override con protocolizada
    }
  }

  const summary = { linked: 0, skipped: 0, error: 0 };
  for (const folio of [...fileByFolio.keys()].sort((a, b) => Number(a) - Number(b))) {
    const r = await uploadAndLinkActa(
      empresaId,
      folio,
      fileByFolio.get(folio)!,
      fechaByFolio.get(folio) ?? null
    );
    summary[r] += 1;
  }

  const sinPdf = [...fechaByFolio.keys()]
    .filter((f) => !fileByFolio.has(f))
    .sort((a, b) => Number(a) - Number(b));
  console.log(
    `\nResumen actas: ${summary.linked} ligadas, ${summary.skipped} skip, ${summary.error} error.`
  );
  if (sinPdf.length) console.log(`Actas sin PDF en el folder: ${sinPdf.join(', ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
