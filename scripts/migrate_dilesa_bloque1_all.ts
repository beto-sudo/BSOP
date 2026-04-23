/**
 * migrate_dilesa_bloque1_all.ts
 *
 * Orquestador del sprint dilesa-1b. Corre las 7 migraciones en orden de
 * dependencias:
 *
 *   1. catálogos (clasificacion_inmobiliaria + tipo_proyecto)
 *   2. terrenos
 *   3. prototipos
 *   4. anteproyectos          (depende de terrenos + tipo_proyecto)
 *   5. proyectos              (depende de terrenos + anteproyectos + tipo_proyecto)
 *   6. fraccionamiento_prototipo (depende de proyectos + prototipos)
 *   7. anteproyectos_prototipos_referencia (depende de anteproyectos + prototipos)
 *
 * Variables de entorno soportadas:
 *   DRY_RUN=1             → solo imprime el plan, no escribe nada
 *   CONTINUE_ON_ERROR=1   → no aborta en el primer error; sigue al siguiente paso
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/migrate_dilesa_bloque1_all.ts
 *   CONTINUE_ON_ERROR=1 npx tsx scripts/migrate_dilesa_bloque1_all.ts
 *   npx tsx scripts/migrate_dilesa_bloque1_all.ts
 */

import { migrateCatalogosBloque1 } from './migrate_dilesa_catalogos_bloque1';
import { migrateTerrenos } from './migrate_dilesa_terrenos';
import { migratePrototipos } from './migrate_dilesa_prototipos';
import { migrateAnteproyectos } from './migrate_dilesa_anteproyectos';
import { linkAnteproyectoProyecto } from './migrate_dilesa_anteproyectos_link_proyecto';
import { migrateProyectos } from './migrate_dilesa_proyectos';
import { migrateFraccionamientoPrototipo } from './migrate_dilesa_fraccionamiento_prototipo';
import { migrateAnteproyectosPrototiposRef } from './migrate_dilesa_anteproyectos_prototipos_ref';
import { type TableReport, loadEnv } from './lib/dilesa-migrate-shared';

interface StepResult {
  name: string;
  reports: TableReport[];
  failed: boolean;
  error?: string;
}

async function runStep(
  name: string,
  fn: () => Promise<TableReport | TableReport[]>,
  continueOnError: boolean
): Promise<StepResult> {
  try {
    const r = await fn();
    const reports = Array.isArray(r) ? r : [r];
    return { name, reports, failed: false };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!continueOnError) throw err;
    return { name, reports: [], failed: true, error: msg };
  }
}

async function main() {
  const env = loadEnv();

  console.log('═'.repeat(70));
  console.log(' Sprint dilesa-1b — Coda → BSOP (backbone bloque 1)');
  console.log('═'.repeat(70));
  console.log(` empresa_id: ${env.empresaId}`);
  console.log(` DRY_RUN=${env.dryRun ? '1' : '0'}  CONTINUE_ON_ERROR=${env.continueOnError ? '1' : '0'}`);

  const steps: StepResult[] = [];

  steps.push(await runStep('1. catálogos', migrateCatalogosBloque1, env.continueOnError));
  steps.push(await runStep('2. terrenos', migrateTerrenos, env.continueOnError));
  steps.push(await runStep('3. prototipos', migratePrototipos, env.continueOnError));
  steps.push(await runStep('4. anteproyectos', migrateAnteproyectos, env.continueOnError));
  steps.push(await runStep('5. proyectos', migrateProyectos, env.continueOnError));
  steps.push(
    await runStep(
      '5b. link anteproyecto↔proyecto (post-pass)',
      linkAnteproyectoProyecto,
      env.continueOnError
    )
  );
  steps.push(
    await runStep('6. fraccionamiento_prototipo', migrateFraccionamientoPrototipo, env.continueOnError)
  );
  steps.push(
    await runStep(
      '7. anteproyectos_prototipos_referencia',
      migrateAnteproyectosPrototiposRef,
      env.continueOnError
    )
  );

  // ── Resumen final ─────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log(' Resumen final');
  console.log('═'.repeat(70));

  let totalWarnings = 0;
  let totalErrors = 0;

  for (const step of steps) {
    if (step.failed) {
      console.log(`\n❌ ${step.name}`);
      console.log(`   error: ${step.error}`);
      totalErrors++;
      continue;
    }
    for (const r of step.reports) {
      const mark = r.errors.length > 0 ? '⚠️ ' : '✅';
      console.log(
        `\n${mark} ${r.table}: fetched=${r.fetched} created=${r.created} updated=${r.updated} skipped=${r.skipped} warnings=${r.warnings.length} errors=${r.errors.length}`
      );
      totalWarnings += r.warnings.length;
      totalErrors += r.errors.length;
    }
  }

  console.log('\n' + '─'.repeat(70));
  console.log(` Total warnings: ${totalWarnings}`);
  console.log(` Total errors:   ${totalErrors}`);
  console.log('─'.repeat(70));

  if (totalErrors > 0 && !env.continueOnError) {
    process.exit(1);
  }
  if (totalErrors > 0) {
    console.log('\n⚠️  Se registraron errores — revisar detalle arriba (CONTINUE_ON_ERROR=1 activo).');
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\n❌ Orchestrator failed:', err);
    process.exit(1);
  });
}
