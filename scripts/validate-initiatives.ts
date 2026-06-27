#!/usr/bin/env npx tsx
/**
 * Valida los HEADERS de `docs/planning/*.md` sin regenerar ni comparar la tabla
 * `## Activas` de INITIATIVES.md (iniciativa `derivados-sin-drift`, Sprint 2).
 *
 * Reemplaza a `initiatives:check` en el job `quality` de CI. Motivación: el
 * `initiatives:check` viejo exigía que la tabla regenerada estuviera commiteada
 * en la rama (`initiatives:gen && git diff --exit-code`), lo que volvía a
 * `INITIATIVES.md` un hotspot de conflictos de merge entre sesiones (cada una
 * regeneraba la tabla completa). Ahora la tabla se regenera en `main` post-merge
 * (`.github/workflows/initiatives-regen.yml`) y las ramas ya NO la tocan — solo
 * editan el header de su propio planning doc. Este validador asegura que esos
 * headers estén bien formados, sin tocar la tabla.
 *
 * Falla (exit 1) si:
 *   - una iniciativa activa (proposed/planned/in_progress/blocked) no tiene los
 *     campos requeridos en su header (nombre, Empresas, Schemas afectados,
 *     Próximo hito, Última actualización), o
 *   - el `**Slug:**` del header no coincide con el nombre de archivo.
 *
 * Uso:  npm run initiatives:validate
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isActive, parsePlanningDoc, toInitiative } from './lib/initiatives';

const PLANNING_DIR = path.join(process.cwd(), 'docs', 'planning');

function main(): void {
  const files = readdirSync(PLANNING_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();

  const errors: string[] = [];
  let activos = 0;

  for (const file of files) {
    const slug = file.replace(/\.md$/, '');
    const content = readFileSync(path.join(PLANNING_DIR, file), 'utf8');
    const doc = parsePlanningDoc(content, slug);

    // Cross-check: el `**Slug:**` del header debe coincidir con el archivo.
    const declared = content.match(/^\*\*Slug:\*\*\s*`?([a-z0-9-]+)`?/m)?.[1];
    if (declared && declared !== slug) {
      errors.push(
        `${file}: el **Slug:** del header ("${declared}") no coincide con el nombre de archivo ("${slug}").`
      );
    }

    // Solo las iniciativas ACTIVAS necesitan header completo (aparecen en la
    // tabla). Las `done` y demás pueden tener headers más ligeros.
    if (isActive(doc.estado)) {
      activos++;
      try {
        toInitiative(doc); // tira un error claro con el campo faltante
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
  }

  if (errors.length > 0) {
    console.error('✖ Validación de headers de planning docs falló:\n');
    for (const e of errors) console.error(`  - ${e}`);
    console.error(
      '\nCorregí los headers de tus docs/planning/*.md. La tabla `## Activas` de ' +
        'INITIATIVES.md se regenera en `main` (workflow initiatives-regen.yml), NO en tu rama.'
    );
    process.exit(1);
  }

  console.log(
    `✓ Headers de planning docs OK (${activos} iniciativas activas). ` +
      'La tabla Activas se regenera en main post-merge — no la edites a mano en tu rama.'
  );
}

main();
