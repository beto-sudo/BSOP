/**
 * migrate_dilesa_anteproyectos_link_proyecto.ts
 *
 * Post-pass del sprint dilesa-1b: para cada proyecto en BSOP con
 * `anteproyecto_id` seteado, actualiza el anteproyecto:
 *   - `proyecto_id` = el id del proyecto
 *   - `estado` = 'convertido_a_proyecto' (solo si el Coda original decía así)
 *   - `convertido_a_proyecto_en` = ahora (timestamp de la migración, aproximado)
 *
 * Se ejecuta DESPUÉS de proyectos.ts porque antes el CHECK constraint
 * `anteproyectos_convertido_requiere_proyecto` impide marcar el estado sin
 * un `proyecto_id` apuntando a un proyecto real.
 *
 * Para saber cuáles anteproyectos originalmente estaban `convertido_a_proyecto`,
 * consultamos de nuevo Coda por fiabilidad (idempotente).
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/migrate_dilesa_anteproyectos_link_proyecto.ts
 *   npx tsx scripts/migrate_dilesa_anteproyectos_link_proyecto.ts
 */

import { CodaClient, buildColumnMap, pick, str } from '../lib/coda-api';
import {
  CODA_DOC_ID,
  emptyReport,
  loadEnv,
  printReport,
  supaAdmin,
  type TableReport,
} from './lib/dilesa-migrate-shared';

const CODA_TABLE_ID_ANTEPROY = 'grid-918aH4OlMi';

export async function linkAnteproyectoProyecto(): Promise<TableReport> {
  const env = loadEnv();
  const supabase = supaAdmin(env);
  const coda = new CodaClient(env.codaApiKey);
  const report = emptyReport('dilesa.anteproyectos ↔ proyectos (link + estado)');

  console.log(`\n🚀 Link anteproyecto ↔ proyecto (post-pass)`);
  if (env.dryRun) console.log('📋 DRY RUN — no writes\n');

  // 1. Qué anteproyectos estaban 'Convertido a Proyecto' en Coda
  const cols = await coda.listColumns(CODA_DOC_ID, CODA_TABLE_ID_ANTEPROY);
  const colMap = buildColumnMap(cols);
  const codaRows = await coda.listRowsAll(CODA_DOC_ID, CODA_TABLE_ID_ANTEPROY);
  const convertidosSet = new Set<string>();
  for (const row of codaRows) {
    const estadoRaw = str(pick(row.values, colMap, 'estado del anteproyecto', 'estado'));
    if (estadoRaw && /convertid/i.test(estadoRaw)) convertidosSet.add(row.id);
  }
  console.log(`  Coda: ${convertidosSet.size} anteproyectos marcados "convertido"`);

  // 2. Proyectos en BSOP con anteproyecto_id seteado
  const { data: proyRows, error: proyErr } = await supabase
    .schema('dilesa' as any)
    .from('proyectos')
    .select('id, nombre, anteproyecto_id')
    .eq('empresa_id', env.empresaId)
    .is('deleted_at', null)
    .not('anteproyecto_id', 'is', null);
  if (proyErr) throw new Error(`proyectos select: ${proyErr.message}`);

  report.fetched = proyRows?.length ?? 0;
  console.log(`  BSOP proyectos con anteproyecto: ${report.fetched}`);

  // 3. Anteproyectos en BSOP (id + coda_row_id) para saber cuál había sido convertido
  const { data: apRows } = await supabase
    .schema('dilesa' as any)
    .from('anteproyectos')
    .select('id, coda_row_id, estado')
    .eq('empresa_id', env.empresaId)
    .is('deleted_at', null);
  const apById = new Map<string, { coda_row_id: string | null; estado: string }>();
  for (const ap of apRows ?? []) {
    apById.set(ap.id, { coda_row_id: ap.coda_row_id ?? null, estado: ap.estado });
  }

  for (const p of proyRows ?? []) {
    if (!p.anteproyecto_id) continue;
    const ap = apById.get(p.anteproyecto_id);
    if (!ap) {
      report.warnings.push(`proyecto "${p.nombre}": anteproyecto_id ${p.anteproyecto_id.slice(0, 8)} no encontrado (inesperado)`);
      continue;
    }

    const shouldBeConvertido = ap.coda_row_id ? convertidosSet.has(ap.coda_row_id) : false;
    const newEstado = shouldBeConvertido ? 'convertido_a_proyecto' : ap.estado;

    const updatePayload: Record<string, unknown> = {
      proyecto_id: p.id,
    };
    if (shouldBeConvertido && ap.estado !== 'convertido_a_proyecto') {
      updatePayload.estado = 'convertido_a_proyecto';
      updatePayload.convertido_a_proyecto_en = new Date().toISOString();
    }

    if (env.dryRun) {
      console.log(`  [DRY] ap=${p.anteproyecto_id.slice(0, 8)} ← proy=${p.id.slice(0, 8)} estado=${newEstado}`);
      report.updated++;
      continue;
    }

    const { error } = await supabase
      .schema('dilesa' as any)
      .from('anteproyectos')
      .update(updatePayload)
      .eq('id', p.anteproyecto_id);
    if (error) {
      report.errors.push(`ap ${p.nombre}: ${error.message}`);
      if (!env.continueOnError) throw new Error(error.message);
    } else {
      report.updated++;
      console.log(`  ✓ linked: ${p.nombre} → ap=${p.anteproyecto_id.slice(0, 8)} (estado=${newEstado})`);
    }
  }

  printReport(report);
  return report;
}

if (require.main === module) {
  linkAnteproyectoProyecto().catch((err) => {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  });
}
