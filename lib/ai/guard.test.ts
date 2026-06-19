/**
 * Drift-guard de la capa de IA (iniciativa `registro-ia`, ADR-046).
 *
 * Invariante: SOLO `lib/ai/` puede importar los SDK de IA (`@ai-sdk/*`, `'ai'`).
 * Cualquier otro archivo debe pasar por `runGenerateObject`/`runEmbed`. Esto es
 * lo que evita que el inventario de IA envejezca: un uso nuevo no puede esconderse
 * llamando al SDK directo — CI lo caza aquí (mismo principio que el catálogo de
 * notificaciones y el snapshot+guard de blindaje-financiero).
 *
 * Si este test falla: reemplazá el `import ... from '@ai-sdk/...'` / `from 'ai'`
 * por `import { runGenerateObject, runEmbed } from '@/lib/ai'` y registrá el uso
 * en `lib/ai/registry.ts`.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'lib', 'components', 'scripts'];
const ALLOWED_PREFIX = `lib${sep}ai${sep}`;

// Importa de '@ai-sdk/<algo>' o exactamente de 'ai' (el SDK de Vercel). No
// matchea '@/lib/ai' (el grupo no queda flush entre las comillas).
const SDK_IMPORT = /from\s+['"](@ai-sdk\/[^'"]+|ai)['"]/;

function walk(dir: string, acc: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // dir inexistente en este checkout
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
}

describe('lib/ai drift-guard', () => {
  it('ningún archivo fuera de lib/ai/ importa @ai-sdk/* o "ai"', () => {
    const offenders: string[] = [];
    for (const dir of SCAN_DIRS) {
      const files: string[] = [];
      walk(join(ROOT, dir), files);
      for (const file of files) {
        const rel = relative(ROOT, file);
        if (rel.startsWith(ALLOWED_PREFIX)) continue; // lib/ai/ es el dueño
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (/^\s*import\b/.test(line) && SDK_IMPORT.test(line)) {
              offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
            }
          });
      }
    }
    expect(
      offenders,
      `Solo lib/ai/ puede importar los SDK de IA. Usá runGenerateObject/runEmbed de '@/lib/ai'.\n` +
        offenders.join('\n')
    ).toEqual([]);
  });
});
