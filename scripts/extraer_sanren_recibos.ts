/**
 * extraer_sanren_recibos.ts
 *
 * Sprint 5 de `sanren-servicios`: corre la extracción IA (lib/sanren/
 * recibo-extraccion) sobre los recibos que ya tienen su PDF en el bucket y
 * completa los campos nuevos (vencimiento, subtotal, IVA, tarifa) + el jsonb
 * `extraccion`, sin pisar lo ya capturado (monto/lecturas de Coda).
 *
 * Uso:
 *   # dry-run: extrae 1 de cada servicio y muestra el JSON (valida la IA, NO escribe)
 *   ANTHROPIC_API_KEY=... npx tsx scripts/extraer_sanren_recibos.ts
 *   # aplica a todos los que aún no tienen extracción
 *   ... npx tsx scripts/extraer_sanren_recibos.ts --apply
 *   # re-procesa TODOS (incluso los ya extraídos)
 *   ... npx tsx scripts/extraer_sanren_recibos.ts --apply --force
 *
 * Env (lee /Users/Beto/BSOP/.env.local; inyecta las que falten):
 *   ANTHROPIC_API_KEY · NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';
import { extraerReciboIA, mapExtraccionToUpdate } from '@/lib/sanren/recibo-extraccion';

dotenv.config({ path: path.resolve('/Users/Beto/BSOP/.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

type Recibo = {
  id: string;
  servicio_id: string;
  monto: number | null;
  lectura_consumo: number | null;
  lectura_produccion: number | null;
  folio: string | null;
  extraccion_at: string | null;
};

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Falta ANTHROPIC_API_KEY.');
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase.');

  const admin = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sanren = admin.schema('sanren' as never) as unknown as {
    from: (t: string) => {
      select: (c: string) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      update: (v: Record<string, unknown>) => {
        eq: (c: string, val: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };

  // recibos + tipo de servicio
  const { data: recibosRaw, error: rErr } = await sanren.from('recibos').select('*');
  if (rErr) throw new Error(`recibos: ${rErr.message}`);
  const recibos = (recibosRaw ?? []) as Recibo[];

  const { data: svcRaw } = await sanren.from('servicios').select('id, tipo');
  const tipoBySvc = new Map(
    ((svcRaw ?? []) as { id: string; tipo: string }[]).map((s) => [s.id, s.tipo])
  );

  // adjuntos rol='recibo': entidad_id → {url, mime}
  const { data: adjRaw, error: aErr } = await admin
    .schema('erp')
    .from('adjuntos')
    .select('entidad_id, url, tipo_mime, created_at')
    .eq('entidad_tipo', 'recibo')
    .eq('rol', 'recibo');
  if (aErr) throw new Error(`adjuntos: ${aErr.message}`);
  const adjByRecibo = new Map<string, { url: string; mime: string }>();
  for (const a of (adjRaw ?? []) as {
    entidad_id: string;
    url: string;
    tipo_mime: string | null;
  }[]) {
    if (!adjByRecibo.has(a.entidad_id)) {
      adjByRecibo.set(a.entidad_id, { url: a.url, mime: a.tipo_mime ?? 'application/pdf' });
    }
  }

  let candidatos = recibos.filter((r) => adjByRecibo.has(r.id));
  if (APPLY && !FORCE) candidatos = candidatos.filter((r) => !r.extraccion_at);

  console.log(
    `\n=== EXTRACCIÓN IA · recibos SANREN (${APPLY ? 'APPLY' : 'DRY-RUN'}${FORCE ? ' FORCE' : ''}) ===`
  );
  console.log(
    `Recibos con PDF: ${recibos.filter((r) => adjByRecibo.has(r.id)).length} · a procesar: ${candidatos.length}`
  );

  // En dry-run, 1 de cada servicio (para validar los 3 formatos sin gastar de más).
  if (!APPLY) {
    const porTipo = new Map<string, Recibo>();
    for (const r of candidatos) {
      const t = tipoBySvc.get(r.servicio_id) ?? '?';
      if (!porTipo.has(t)) porTipo.set(t, r);
    }
    candidatos = [...porTipo.values()];
    console.log(`Dry-run: ${candidatos.length} muestra(s) (1 por servicio).\n`);
  }

  let ok = 0;
  let fail = 0;
  for (const r of candidatos) {
    const tipo = tipoBySvc.get(r.servicio_id) ?? '?';
    const adj = adjByRecibo.get(r.id)!;
    try {
      const { data: blob, error: dlErr } = await admin.storage.from('adjuntos').download(adj.url);
      if (dlErr || !blob) {
        console.log(`  ✗ ${tipo} ${r.id}: download — ${dlErr?.message}`);
        fail++;
        continue;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const data = await extraerReciboIA(bytes, adj.mime);

      if (!APPLY) {
        console.log(`── ${tipo} · recibo ${r.id} ─────────────────────────────`);
        console.log(JSON.stringify(data, null, 2));
        console.log('');
        ok++;
        continue;
      }

      const patch = mapExtraccionToUpdate(
        data,
        {
          monto: r.monto,
          lectura_consumo: r.lectura_consumo,
          lectura_produccion: r.lectura_produccion,
          folio: r.folio,
        },
        new Date().toISOString()
      );
      const { error: upErr } = await sanren.from('recibos').update(patch).eq('id', r.id);
      if (upErr) {
        console.log(`  ✗ ${tipo} ${r.id}: update — ${upErr.message}`);
        fail++;
        continue;
      }
      console.log(
        `  ✓ ${tipo} ${r.id}: vto=${data.fecha_vencimiento || '—'} tarifa=${data.tarifa || '—'} total=${data.total}`
      );
      ok++;
    } catch (e) {
      console.log(`  ✗ ${tipo} ${r.id}: ${e instanceof Error ? e.message : e}`);
      fail++;
    }
  }

  console.log(`\nResumen: ok=${ok} · fail=${fail}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
