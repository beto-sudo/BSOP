import type { ManualDoc } from './load';
import { manualGroupKey, manualGroupLabel } from './groups';

/**
 * Búsqueda full-text del manual (Sprint 2 de `manual-usuario`). Pura y
 * server-safe: el route handler `/api/manual/search` la cablea sobre
 * `listManualDocs`. Match por substring, insensible a mayúsculas y acentos
 * ("avaluo" encuentra "avalúo"); con varias palabras, todas deben aparecer
 * (AND) en título + contenido.
 */

export type ManualSearchSnippet = { before: string; match: string; after: string };

export type ManualSearchResult = {
  /** Slug unido por `/` (e.g. `dilesa/ventas/lista`) — listo para `<HelpDrawer>`. */
  slug: string;
  titulo: string;
  version: string;
  grupo: string;
  grupoLabel: string;
  /** Contexto del primer match en el contenido; `null` si solo matcheó el título. */
  snippet: ManualSearchSnippet | null;
};

/** Minúsculas + sin diacríticos (NFD). Mantiene 1:1 los índices para el
 * contenido español del manual (precomposed → base char). */
export function normalizeSearchText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Markdown → texto plano legible (para buscar y armar snippets). */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*\|?[-:| ]+\|?\s*$/gm, ' ')
    .replace(/\|/g, ' ')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/^-{3,}\s*$/gm, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

const SNIPPET_CONTEXT = 80;

function buildSnippet(plain: string, index: number, length: number): ManualSearchSnippet {
  const start = Math.max(0, index - SNIPPET_CONTEXT);
  const end = Math.min(plain.length, index + length + SNIPPET_CONTEXT);
  return {
    before: (start > 0 ? '…' : '') + plain.slice(start, index),
    match: plain.slice(index, index + length),
    after: plain.slice(index + length, end) + (end < plain.length ? '…' : ''),
  };
}

const MAX_RESULTS = 20;

/**
 * Busca `query` sobre los docs dados. Ranking: matches en el título pesan más
 * que en el contenido; a igualdad, ocurrencias totales. Devuelve hasta
 * `MAX_RESULTS` resultados con snippet del primer match en contenido.
 */
export function searchManualDocs(docs: ManualDoc[], query: string): ManualSearchResult[] {
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const scored: { result: ManualSearchResult; score: number }[] = [];

  for (const doc of docs) {
    const plain = stripMarkdown(doc.body);
    const nTitle = normalizeSearchText(doc.frontmatter.titulo);
    const nPlain = normalizeSearchText(plain);

    let score = 0;
    let firstBodyIndex = -1;
    let firstBodyLength = 0;
    let allMatch = true;

    for (const token of tokens) {
      const inTitle = nTitle.includes(token);
      const bodyIndex = nPlain.indexOf(token);
      if (!inTitle && bodyIndex === -1) {
        allMatch = false;
        break;
      }
      if (inTitle) score += 10;
      if (bodyIndex !== -1) {
        // Ocurrencias del token en el cuerpo (cap para no premiar docs largos).
        let count = 0;
        for (let i = bodyIndex; i !== -1 && count < 10; i = nPlain.indexOf(token, i + 1)) count++;
        score += count;
        if (firstBodyIndex === -1 || bodyIndex < firstBodyIndex) {
          firstBodyIndex = bodyIndex;
          firstBodyLength = token.length;
        }
      }
    }
    if (!allMatch) continue;

    const grupo = manualGroupKey(doc.slug);
    scored.push({
      score,
      result: {
        slug: doc.slug.join('/'),
        titulo: doc.frontmatter.titulo,
        version: doc.frontmatter.version,
        grupo,
        grupoLabel: manualGroupLabel(grupo),
        snippet:
          firstBodyIndex === -1 ? null : buildSnippet(plain, firstBodyIndex, firstBodyLength),
      },
    });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.result.titulo.localeCompare(b.result.titulo))
    .slice(0, MAX_RESULTS)
    .map((s) => s.result);
}
