/**
 * Genera una migración nueva con un timestamp libre de colisiones entre
 * sesiones (iniciativa `cross-session-coordination`).
 *
 * Uso:  npm run db:new "<slug_snake_case>"
 *   ej: npm run db:new "modulo_dilesa_manual"
 *
 * El timestamp resultante es estrictamente mayor que CUALQUIER migración que
 * ya exista — localmente Y en los PRs abiertos de otras sesiones (vía `gh`).
 * Así dos sesiones corriendo en paralelo no eligen el mismo `YYYYMMDDHHMMSS`
 * (la colisión que rompe Supabase Preview / `schema_migrations`).
 *
 * NUNCA copiar un timestamp a mano de otra migración — siempre usar este
 * generador. Ver CLAUDE.md → "Coordinación entre sesiones".
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { extractVersion, nextMigrationVersion } from './lib/migration-version';

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

function localVersions(): string[] {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR)
    .map(extractVersion)
    .filter((v): v is string => v !== null);
}

/**
 * Versiones de migración en PRs abiertos (aún no en main). Este es el paso
 * de coordinación cross-sesión: aunque la migración de otra sesión todavía
 * no haya mergeado, vive en su PR abierto y la vemos aquí.
 */
function openPrVersions(): string[] {
  try {
    const prsJson = execSync('gh pr list --state open --limit 60 --json number', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const prs = JSON.parse(prsJson) as Array<{ number: number }>;
    const versions: string[] = [];
    for (const pr of prs) {
      try {
        const out = execSync(`gh pr view ${pr.number} --json files --jq '.files[].path'`, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        for (const line of out.split('\n')) {
          const m = line.match(/supabase\/migrations\/(\d{14})/);
          if (m) versions.push(m[1]);
        }
      } catch {
        // PR sin archivos accesibles — saltar sin romper.
      }
    }
    return versions;
  } catch {
    console.warn(
      '⚠️  `gh` no disponible: usando solo migraciones locales.\n' +
        '   Riesgo residual de colisión si otra sesión crea una migración en\n' +
        '   este mismo segundo antes de abrir su PR. Abre tu PR pronto.'
    );
    return [];
  }
}

function main(): void {
  const slug = process.argv[2];
  if (!slug || !/^[a-z0-9_]+$/.test(slug)) {
    console.error('Uso: npm run db:new "<slug_snake_case>"');
    console.error('  ej: npm run db:new "modulo_dilesa_manual"');
    console.error('  (solo minúsculas, dígitos y guion bajo)');
    process.exit(1);
  }

  const existing = [...localVersions(), ...openPrVersions()];
  const version = nextMigrationVersion(existing, new Date());
  const file = path.join(MIGRATIONS_DIR, `${version}_${slug}.sql`);

  if (existsSync(file)) {
    console.error(`✗ Ya existe ${path.relative(process.cwd(), file)} — abortando.`);
    process.exit(1);
  }

  const template = `-- ╭─ ${version}_${slug} ─╮
-- TODO: describe qué hace esta migración y por qué (1-3 líneas).
--
-- Timestamp generado con \`npm run db:new\` (anti-colisión multi-sesión:
-- estrictamente mayor que toda migración local + de PRs abiertos).

BEGIN;

-- ... DDL / DML aquí ...

-- Recarga el cache de PostgREST si tocaste tablas/columnas/embeds:
NOTIFY pgrst, 'reload schema';

COMMIT;
`;

  writeFileSync(file, template);
  console.log(`✓ Creada ${path.relative(process.cwd(), file)}`);
  console.log(`  versión ${version} (estrictamente > ${existing.length} migraciones vistas)`);
  console.log('  Tip: abre tu PR pronto para que otras sesiones vean esta migración.');
}

main();
