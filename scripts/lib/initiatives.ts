/**
 * Auto-generación de la tabla `## Activas` de `docs/strategy/INITIATIVES.md`
 * desde los headers de `docs/planning/*.md` (iniciativa
 * `cross-session-coordination`, Pieza 2 / Diseño A).
 *
 * Motivación: `INITIATIVES.md` era un hotspot de conflictos entre sesiones
 * paralelas — toda promoción / cambio de estado editaba la misma tabla. Ahora
 * cada sesión solo toca el header de SU planning doc (un archivo por iniciativa
 * = nunca chocan) y esta lógica regenera la tabla determinísticamente.
 *
 * Lógica pura y testeable; el IO (leer los docs, escribir el MD, formatear con
 * prettier) vive en `scripts/gen-initiatives.ts`.
 */

/** Marcadores HTML que delimitan la región auto-generada en INITIATIVES.md. */
export const ACTIVAS_START = '<!-- initiatives:activas:start -->';
export const ACTIVAS_END = '<!-- initiatives:activas:end -->';

/** Aviso que el generador escribe dentro de los marcadores. */
export const ACTIVAS_WARNING =
  '<!-- AUTO-GENERADO por `npm run initiatives:gen` desde los headers de docs/planning/*.md. ' +
  'NO editar a mano: edita el header de tu planning doc (Estado / Próximo hito / Última ' +
  'actualización) y corre el generador (CI lo valida con `initiatives:check`). La sección ' +
  '`## Done` se mantiene a mano. -->';

/** Estados que cuentan como "activa" (aparecen en la tabla Activas). */
export const ACTIVE_STATES = ['proposed', 'planned', 'in_progress', 'blocked'] as const;
export type ActiveState = (typeof ACTIVE_STATES)[number];

/** Datos crudos parseados del header de un planning doc. */
export interface ParsedDoc {
  /** Slug canónico (derivado del nombre de archivo `<slug>.md`). */
  slug: string;
  /** Nombre legible: el H1 sin el prefijo "Iniciativa —". */
  nombre: string | null;
  empresas: string | null;
  /** Valor de `**Schemas afectados:**`. */
  schemas: string | null;
  /** Primer token de `**Estado:**`, en minúsculas. */
  estado: string | null;
  proximoHito: string | null;
  /** Fecha `YYYY-MM-DD` extraída de `**Última actualización:**`. */
  ultimaActualizacion: string | null;
}

/** Una iniciativa activa lista para renderizar (todos los campos presentes). */
export interface Initiative {
  slug: string;
  nombre: string;
  empresas: string;
  schemas: string;
  estado: string;
  proximoHito: string;
  ultimaActualizacion: string;
}

/** ¿El estado cuenta como activo? */
export function isActive(estado: string | null): estado is ActiveState {
  return estado !== null && (ACTIVE_STATES as readonly string[]).includes(estado);
}

/**
 * Extrae el valor de un campo `**Nombre:**` del header. Soporta valores que
 * se envuelven en varias líneas (prose-wrap de prettier): continúa hasta la
 * siguiente línea que es un campo nuevo (`**`), un heading (`#`), o está vacía.
 */
function extractField(headerLines: string[], name: string): string | null {
  const marker = `**${name}:**`;
  const startIdx = headerLines.findIndex((l) => l.startsWith(marker));
  if (startIdx === -1) return null;

  const parts: string[] = [headerLines[startIdx].slice(marker.length).trim()];
  for (let i = startIdx + 1; i < headerLines.length; i++) {
    const line = headerLines[i];
    if (line.trim() === '' || line.startsWith('**') || line.startsWith('#')) break;
    parts.push(line.trim());
  }
  return parts.join(' ').trim();
}

/**
 * Parsea el header de un planning doc. El `slug` viene del nombre de archivo
 * (fuente canónica); el `**Slug:**` del header, si existe, solo se usa para
 * un cross-check opcional en el caller.
 */
export function parsePlanningDoc(content: string, slug: string): ParsedDoc {
  // El header vive entre el H1 y el primer `## `. Tomamos ese bloque para no
  // capturar campos que aparezcan más abajo (p.ej. en la Bitácora).
  const headerBlock = content.split(/\n## /)[0] ?? '';
  const headerLines = headerBlock.split('\n');

  const titleMatch = content.match(/^#\s+(.+)$/m);
  const nombre = titleMatch ? titleMatch[1].replace(/^\s*Iniciativa\s*[—–-]\s*/i, '').trim() : null;

  const estadoRaw = extractField(headerLines, 'Estado');
  const estado = estadoRaw ? (estadoRaw.split(/\s+/)[0]?.toLowerCase() ?? null) : null;

  const ultimaRaw = extractField(headerLines, 'Última actualización');
  const ultimaActualizacion = ultimaRaw
    ? (ultimaRaw.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? ultimaRaw)
    : null;

  return {
    slug,
    nombre,
    empresas: extractField(headerLines, 'Empresas'),
    schemas: extractField(headerLines, 'Schemas afectados'),
    estado,
    proximoHito: extractField(headerLines, 'Próximo hito'),
    ultimaActualizacion,
  };
}

/**
 * Convierte un `ParsedDoc` activo en `Initiative`, validando que tenga todos
 * los campos requeridos. Tira un error claro (con el slug + campo faltante) si
 * falta algo — así `initiatives:check` falla en CI cuando alguien promueve una
 * iniciativa sin completar su header.
 */
export function toInitiative(doc: ParsedDoc): Initiative {
  const missing: string[] = [];
  if (!doc.nombre) missing.push('H1 (título de la iniciativa)');
  if (!doc.empresas) missing.push('**Empresas:**');
  if (!doc.schemas) missing.push('**Schemas afectados:**');
  if (!doc.proximoHito) missing.push('**Próximo hito:**');
  if (!doc.ultimaActualizacion) missing.push('**Última actualización:**');
  if (missing.length > 0) {
    throw new Error(
      `docs/planning/${doc.slug}.md (estado "${doc.estado}") no tiene: ${missing.join(', ')}. ` +
        'Toda iniciativa activa necesita esos campos en su header para aparecer en la tabla Activas.'
    );
  }
  return {
    slug: doc.slug,
    nombre: doc.nombre!,
    empresas: doc.empresas!,
    schemas: doc.schemas!,
    estado: doc.estado!,
    proximoHito: doc.proximoHito!,
    ultimaActualizacion: doc.ultimaActualizacion!,
  };
}

/** Sanea un texto para meterlo en una celda de tabla GFM (sin `|` ni saltos). */
function cell(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
}

/** Quita un sufijo `(ver [planning](...))` si la prosa ya lo trae (idempotencia). */
function stripPlanningLink(proximo: string): string {
  return proximo.replace(/\s*\(ver \[planning\]\([^)]*\)\)\s*$/, '').trim();
}

/**
 * Renderiza la tabla Activas en markdown (sin alinear — prettier se encarga de
 * eso al escribir). El orden es alfabético por slug: determinista y estable
 * (un cambio de estado mueve una celda, no una fila → diffs mínimos).
 */
export function renderActivasTable(initiatives: readonly Initiative[]): string {
  const cols = [
    'Iniciativa',
    'Slug',
    'Empresas',
    'Schemas',
    'Estado',
    'Próximo hito',
    'Última actualización',
  ];
  const sorted = [...initiatives].sort((a, b) => a.slug.localeCompare(b.slug));

  const header = `| ${cols.join(' | ')} |`;
  const sep = `| ${cols.map(() => '---').join(' | ')} |`;
  const rows = sorted.map((i) => {
    const proximo = `${cell(stripPlanningLink(i.proximoHito))} (ver [planning](../planning/${i.slug}.md))`;
    return `| ${cell(i.nombre)} | \`${i.slug}\` | ${cell(i.empresas)} | ${cell(i.schemas)} | ${cell(i.estado)} | ${proximo} | ${cell(i.ultimaActualizacion)} |`;
  });
  return [header, sep, ...rows].join('\n');
}

/**
 * Reemplaza el texto entre dos marcadores (los marcadores se conservan). Tira
 * un error si faltan o están invertidos — así el generador falla ruidoso si
 * alguien borra los marcadores de INITIATIVES.md.
 */
export function replaceBetweenMarkers(
  content: string,
  start: string,
  end: string,
  replacement: string
): string {
  const startIdx = content.indexOf(start);
  const endIdx = content.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(
      `Marcadores no encontrados o invertidos en INITIATIVES.md: ` +
        `"${start}" / "${end}". Restáuralos alrededor de la tabla Activas.`
    );
  }
  const before = content.slice(0, startIdx + start.length);
  const after = content.slice(endIdx);
  return `${before}\n${replacement}\n${after}`;
}

/**
 * Pipeline puro: dado el contenido actual de INITIATIVES.md y los docs
 * parseados, devuelve el nuevo contenido (sin formatear con prettier todavía)
 * junto con la lista de iniciativas activas renderizadas.
 */
export function regenerateInitiatives(
  initiativesMd: string,
  docs: readonly ParsedDoc[]
): { content: string; active: Initiative[] } {
  const active = docs.filter((d) => isActive(d.estado)).map(toInitiative);
  const table = renderActivasTable(active);
  const block = `${ACTIVAS_WARNING}\n\n${table}`;
  const content = replaceBetweenMarkers(initiativesMd, ACTIVAS_START, ACTIVAS_END, block);
  return { content, active };
}
