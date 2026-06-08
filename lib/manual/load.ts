/**
 * Loader del contenido del Manual de usuario.
 *
 * El contenido vive como markdown versionado en el repo bajo
 * `content/manual/<empresa>/<...>.md` (decisión D2 de la iniciativa
 * `manual-usuario`). Cada archivo lleva frontmatter con `titulo`, `version` y
 * `actualizado`; el cuerpo es markdown GFM.
 *
 * Server-only: usa `node:fs`. Lo consumen el route handler
 * `/api/manual/[...slug]` (ayuda contextual) y la portada server-component
 * `/dilesa/manual`. NO importar desde un client component — el bundler
 * arrastraría `fs`.
 *
 * Los `.md` viajan con el deploy de Vercel vía `outputFileTracingIncludes`
 * en `next.config.ts` (mismo mecanismo que ghostscript-wasm).
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

/** Raíz del contenido del manual, relativa al cwd del proyecto. */
const MANUAL_ROOT = path.join(process.cwd(), 'content', 'manual');

/**
 * Cada segmento de slug debe ser kebab/snake simple. Bloquea path traversal
 * (`..`, `/`, `\`, bytes raros) antes de tocar el filesystem.
 */
const SEGMENT_RE = /^[a-z0-9_-]+$/;

export type ManualFrontmatter = {
  /** Título humano de la pantalla/módulo (se muestra en el header del drawer). */
  titulo: string;
  /** Slug del módulo RBAC al que corresponde (informativo). */
  modulo?: string;
  /** Versión semántica del doc (D7). */
  version: string;
  /** Fecha ISO `YYYY-MM-DD` de la última actualización (D7). */
  actualizado: string;
};

export type ManualDoc = {
  /** Segmentos del slug, e.g. `['dilesa','ventas','lista']`. */
  slug: string[];
  frontmatter: ManualFrontmatter;
  /** Cuerpo markdown sin el frontmatter. */
  body: string;
};

function safeSegments(segments: string[]): string[] | null {
  if (!Array.isArray(segments) || segments.length === 0) return null;
  for (const s of segments) {
    if (typeof s !== 'string' || !SEGMENT_RE.test(s)) return null;
  }
  return segments;
}

/**
 * Normaliza un valor de frontmatter a string. YAML parsea sin comillas:
 * `version: 1.0` como número y `actualizado: 2026-06-07` como `Date` — por eso
 * NO basta con exigir `typeof === 'string'` (era el bug que dejaba todo el
 * manual "vacío"). Devuelve `null` si no se puede normalizar.
 */
function coerceStr(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10); // YYYY-MM-DD
  }
  return null;
}

/**
 * Lee y parsea un doc del manual por sus segmentos de slug. Devuelve `null`
 * si el slug es inválido, el archivo no existe o le falta frontmatter
 * requerido (un doc sin versión no se sirve — D7).
 */
export async function loadManualDoc(segments: string[]): Promise<ManualDoc | null> {
  const safe = safeSegments(segments);
  if (!safe) return null;

  const filePath = `${path.join(MANUAL_ROOT, ...safe)}.md`;

  // Defensa extra: el path resuelto debe quedar dentro de MANUAL_ROOT.
  const resolvedRoot = path.resolve(MANUAL_ROOT);
  if (!path.resolve(filePath).startsWith(resolvedRoot + path.sep)) return null;

  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    return null;
  }

  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;

  const titulo = coerceStr(data.titulo);
  const version = coerceStr(data.version);
  const actualizado = coerceStr(data.actualizado);
  // Un doc sin título/versión/fecha no se sirve (D7).
  if (!titulo || !version || !actualizado) return null;

  return {
    slug: safe,
    frontmatter: {
      titulo,
      modulo: typeof data.modulo === 'string' ? data.modulo : undefined,
      version,
      actualizado,
    },
    body: parsed.content.trim(),
  };
}

async function walk(dir: string, baseSegments: string[]): Promise<ManualDoc[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const out: ManualDoc[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SEGMENT_RE.test(entry.name)) continue;
      out.push(...(await walk(path.join(dir, entry.name), [...baseSegments, entry.name])));
    } else if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('_')) {
      const name = entry.name.replace(/\.md$/, '');
      if (!SEGMENT_RE.test(name)) continue;
      const doc = await loadManualDoc([...baseSegments, name]);
      if (doc) out.push(doc);
    }
  }
  return out;
}

/**
 * Lista todos los docs del manual de una empresa (para la portada). Camina
 * recursivamente `content/manual/<empresa>/`. Archivos que empiezan con `_`
 * (e.g. `_index.md`) se ignoran.
 */
export async function listManualDocs(empresa: string): Promise<ManualDoc[]> {
  if (!SEGMENT_RE.test(empresa)) return [];
  const docs = await walk(path.join(MANUAL_ROOT, empresa), [empresa]);
  return docs.sort((a, b) => a.slug.join('/').localeCompare(b.slug.join('/')));
}
