/**
 * Seed baseline de `erp.estados_cuenta` — mayo 2026 (Afirme, BBVA MN, Monex).
 *
 * Iniciativa `conciliacion-bancaria` v0: carga los 3 primeros estados de
 * cuenta (totales de carátula verificados al centavo contra los PDFs) y sube
 * los PDFs al bucket `adjuntos` con la convención del módulo
 * (`dilesa/estados_cuenta/<cuentaId>/<ts>-<archivo>.pdf`).
 *
 * Idempotente: si la fila (cuenta, periodo) ya existe Y tiene archivo_path,
 * se salta (no re-sube el PDF). Si existe sin archivo, sube y completa.
 *
 * Uso (PDFs archivados en el staging local de Beto):
 *   npx tsx --env-file /Users/Beto/BSOP/.env.local scripts/seed_estados_cuenta_2026_05.ts
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const PDF_DIR = '/Users/Beto/Documents/DILESA/Finanzas/Estados de Cuenta/2026/2026-05';
const PERIODO = '2026-05-01';
const NOTAS_SEED =
  'Baseline — seed inicial de conciliacion-bancaria (estado de mayo 2026, totales verificados al centavo).';

type Seed = {
  cuentaNombre: string;
  pdf: string;
  fechaCorte: string;
  saldoInicial: number;
  depositos: number;
  retiros: number;
  saldoFinal: number;
  saldoInversiones: number;
  numAbonos: number | null;
  numCargos: number | null;
  comisiones: number | null;
  notas: string;
};

const SEEDS: Seed[] = [
  {
    cuentaNombre: 'Afirme',
    pdf: '2026-05_AFIRME_011391019454.pdf',
    fechaCorte: '2026-05-31',
    saldoInicial: 4535.6,
    depositos: 2632480.0,
    retiros: 2627480.0,
    saldoFinal: 9535.6,
    saldoInversiones: 0,
    numAbonos: null,
    numCargos: null,
    comisiones: 430.0,
    notas: NOTAS_SEED,
  },
  {
    cuentaNombre: 'BBVA Bancomer',
    pdf: '2026-05_BBVA-MN_0141502492.pdf',
    fechaCorte: '2026-05-31',
    saldoInicial: 1698583.82,
    depositos: 34446026.4,
    retiros: 34094806.99,
    saldoFinal: 2049803.23,
    saldoInversiones: 0,
    numAbonos: 90,
    numCargos: 305,
    comisiones: 2979.84,
    notas: NOTAS_SEED,
  },
  {
    cuentaNombre: 'Monex Grupo Financiero',
    pdf: '2026-05_MONEX_3731007.pdf',
    fechaCorte: '2026-05-31',
    saldoInicial: 97.44,
    depositos: 2271772211.19,
    retiros: 2270772250.97,
    saldoFinal: 1000057.66,
    saldoInversiones: 117013570.19,
    numAbonos: null,
    numCargos: null,
    comisiones: 0,
    notas: `${NOTAS_SEED} Inversiones = posición en reporto BANOB 21-4X al 29-may (venc. 01-jun).`,
  },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (usa --env-file).'
    );
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: empresa, error: empErr } = await sb
    .schema('core')
    .from('empresas')
    .select('id, nombre')
    .ilike('nombre', '%dilesa%')
    .single();
  if (empErr || !empresa) throw new Error(`empresa DILESA: ${empErr?.message}`);

  for (const seed of SEEDS) {
    const { data: cuenta, error: ctaErr } = await sb
      .schema('erp')
      .from('cuentas_bancarias')
      .select('id, nombre')
      .eq('empresa_id', empresa.id)
      .eq('nombre', seed.cuentaNombre)
      .single();
    if (ctaErr || !cuenta) {
      console.error(`✗ ${seed.cuentaNombre}: cuenta no encontrada (${ctaErr?.message})`);
      continue;
    }

    const { data: existente } = await sb
      .schema('erp')
      .from('estados_cuenta')
      .select('id, archivo_path')
      .eq('cuenta_id', cuenta.id)
      .eq('periodo', PERIODO)
      .maybeSingle();
    if (existente?.archivo_path) {
      console.log(`↷ ${seed.cuentaNombre}: ya tiene estado de mayo con PDF, skip.`);
      continue;
    }

    // Subir el PDF (path canónico del módulo: buildAdjuntoPath equivalente).
    const bytes = readFileSync(`${PDF_DIR}/${seed.pdf}`);
    const path = `dilesa/estados_cuenta/${cuenta.id}/${Date.now()}-${seed.pdf.toLowerCase()}`;
    const { error: upErr } = await sb.storage
      .from('adjuntos')
      .upload(path, bytes, { contentType: 'application/pdf', upsert: false });
    if (upErr) {
      console.error(`✗ ${seed.cuentaNombre}: upload falló (${upErr.message})`);
      continue;
    }

    const { error: insErr } = await sb.schema('erp').from('estados_cuenta').upsert(
      {
        empresa_id: empresa.id,
        cuenta_id: cuenta.id,
        periodo: PERIODO,
        fecha_corte: seed.fechaCorte,
        saldo_inicial: seed.saldoInicial,
        depositos: seed.depositos,
        retiros: seed.retiros,
        saldo_final: seed.saldoFinal,
        saldo_inversiones: seed.saldoInversiones,
        num_abonos: seed.numAbonos,
        num_cargos: seed.numCargos,
        comisiones: seed.comisiones,
        archivo_path: path,
        notas: seed.notas,
      },
      { onConflict: 'cuenta_id,periodo' }
    );
    if (insErr) {
      console.error(`✗ ${seed.cuentaNombre}: upsert falló (${insErr.message})`);
      continue;
    }
    console.log(`✓ ${seed.cuentaNombre}: estado de mayo 2026 cargado (${path})`);
  }

  // Verificación final: checksum de las filas cargadas.
  const { data: rows } = await sb
    .schema('erp')
    .from('estados_cuenta')
    .select('cuenta_id, saldo_inicial, depositos, retiros, saldo_final, saldo_inversiones')
    .eq('empresa_id', empresa.id)
    .eq('periodo', PERIODO);
  for (const r of rows ?? []) {
    const diff =
      Math.round((r.saldo_inicial + r.depositos - r.retiros - r.saldo_final) * 100) / 100;
    if (Math.abs(diff) > 0.01) {
      console.error(`✗ checksum NO cuadra para cuenta ${r.cuenta_id}: diff=${diff}`);
      process.exitCode = 1;
    }
  }
  console.log(`Listo: ${rows?.length ?? 0} estados de mayo 2026 en erp.estados_cuenta.`);
}

void main();
