/**
 * Cálculo del timestamp de una migración nueva, libre de colisiones entre
 * sesiones (iniciativa `cross-session-coordination`).
 *
 * Lógica pura y testeable; el IO (leer migraciones locales + de PRs abiertos
 * vía `gh`) vive en `scripts/new-migration.ts`.
 */

/** Formatea una fecha a versión de migración Supabase `YYYYMMDDHHMMSS` (UTC). */
export function formatVersion(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    String(d.getUTCFullYear()) +
    p(d.getUTCMonth() + 1) +
    p(d.getUTCDate()) +
    p(d.getUTCHours()) +
    p(d.getUTCMinutes()) +
    p(d.getUTCSeconds())
  );
}

/**
 * Incrementa una versión de 14 dígitos en 1 (como entero). El resultado
 * sigue siendo único y ordenable lexicográficamente aunque deje de ser una
 * fecha "real" (p.ej. segundos = 60) — Supabase solo exige unicidad + orden.
 */
export function incrementVersion(version: string): string {
  return (BigInt(version) + 1n).toString().padStart(14, '0');
}

/** Extrae el prefijo de 14 dígitos de un nombre de archivo de migración. */
export function extractVersion(filename: string): string | null {
  return filename.match(/^(\d{14})/)?.[1] ?? null;
}

/**
 * Próxima versión de migración: estrictamente mayor que CUALQUIER versión ya
 * existente (local + PRs abiertos de otras sesiones) y, en el caso normal,
 * igual a "ahora".
 *
 * - Si no hay nada >= ahora → usa el timestamp de ahora.
 * - Si ya existe una versión >= ahora (otra sesión la creó en este segundo, o
 *   hay una migración con timestamp futuro) → usa `max(existentes) + 1` para
 *   garantizar unicidad y que ordene después de todo lo visto.
 *
 * @param existing versiones de 14 dígitos ya en uso (local + open PRs)
 * @param now fecha de referencia (inyectable para tests deterministas)
 */
export function nextMigrationVersion(existing: readonly string[], now: Date): string {
  const nowVersion = formatVersion(now);
  const maxExisting = existing
    .map((v) => v.match(/^\d{14}/)?.[0])
    .filter((v): v is string => v !== undefined)
    .reduce((max, v) => (v > max ? v : max), '');

  // String compare es equivalente a numérico para cadenas de 14 dígitos.
  if (maxExisting === '' || nowVersion > maxExisting) return nowVersion;
  return incrementVersion(maxExisting);
}
