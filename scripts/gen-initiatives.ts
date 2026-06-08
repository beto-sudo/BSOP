#!/usr/bin/env npx tsx
/**
 * BSOP — Generador de la tabla `## Activas` de docs/strategy/INITIATIVES.md.
 *
 * Escanea `docs/planning/*.md`, parsea los headers de cada iniciativa y
 * regenera SOLO la tabla Activas (estados proposed / planned / in_progress /
 * blocked) entre los marcadores `<!-- initiatives:activas:start/end -->`. Todo
 * lo demás del archivo (header note, Convenciones, Roadmap UI, Done) se
 * preserva intacto. La sección `## Done` se mantiene a mano (historia
 * append-only, no derivable de los headers).
 *
 * Motivación: INITIATIVES.md era un hotspot de conflictos entre sesiones
 * paralelas. Ahora cada sesión solo edita el header de SU planning doc.
 * Iniciativa `cross-session-coordination` (Pieza 2 / Diseño A).
 *
 * Uso:
 *   npm run initiatives:gen      # regenera y escribe INITIATIVES.md
 *   npm run initiatives:check    # regenera + `git diff --exit-code` (CI)
 *
 * Flags:
 *   --dry-run    Escribe el resultado a stdout en lugar del archivo.
 */

import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as prettier from 'prettier';
import { parsePlanningDoc, regenerateInitiatives, type ParsedDoc } from './lib/initiatives';

const ROOT = process.cwd();
const PLANNING_DIR = path.join(ROOT, 'docs', 'planning');
const INITIATIVES_PATH = path.join(ROOT, 'docs', 'strategy', 'INITIATIVES.md');
const DRY_RUN = process.argv.includes('--dry-run');

/** Parsea todos los planning docs, cruzando el `**Slug:**` con el nombre de archivo. */
function readPlanningDocs(): ParsedDoc[] {
  const files = readdirSync(PLANNING_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();

  return files.map((file) => {
    const slug = file.replace(/\.md$/, '');
    const content = readFileSync(path.join(PLANNING_DIR, file), 'utf8');
    const doc = parsePlanningDoc(content, slug);

    // Cross-check: el `**Slug:**` del header debería coincidir con el archivo.
    const declared = content.match(/^\*\*Slug:\*\*\s*`?([a-z0-9-]+)`?/m)?.[1];
    if (declared && declared !== slug) {
      console.warn(
        `⚠️  ${file}: el **Slug:** del header ("${declared}") no coincide con el ` +
          `nombre de archivo ("${slug}"). Uso el nombre de archivo como canónico.`
      );
    }
    return doc;
  });
}

async function main(): Promise<void> {
  const docs = readPlanningDocs();
  const current = readFileSync(INITIATIVES_PATH, 'utf8');

  const { content, active } = regenerateInitiatives(current, docs);

  // Formatea con la config de prettier del repo para que `format:check` pase
  // (INITIATIVES.md NO está en .prettierignore, a diferencia de SCHEMA_REF.md).
  const cfg = (await prettier.resolveConfig(INITIATIVES_PATH)) ?? {};
  const formatted = await prettier.format(content, { ...cfg, parser: 'markdown' });

  const byState = active.reduce<Record<string, number>>((acc, i) => {
    acc[i.estado] = (acc[i.estado] ?? 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(byState)
    .sort()
    .map(([k, v]) => `${k}=${v}`)
    .join(' · ');

  if (DRY_RUN) {
    process.stdout.write(formatted);
    return;
  }

  writeFileSync(INITIATIVES_PATH, formatted, 'utf8');
  console.log(
    `✓ Regenerada la tabla Activas de ${path.relative(ROOT, INITIATIVES_PATH)} ` +
      `(${active.length} iniciativas: ${summary})`
  );

  // Si quedó drift respecto a git, lo decimos (informativo, no falla aquí —
  // `initiatives:check` es quien bita con `git diff --exit-code`).
  try {
    execSync(`git diff --quiet -- ${INITIATIVES_PATH}`, { stdio: 'ignore' });
  } catch {
    console.log('  (INITIATIVES.md cambió — recuerda commitearlo)');
  }
}

main().catch((err) => {
  console.error('✖ Error al regenerar la tabla Activas:', err instanceof Error ? err.message : err);
  process.exit(1);
});
