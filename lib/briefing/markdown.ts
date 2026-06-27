/**
 * Convertidor markdown→HTML minimalista para el correo del briefing
 * (iniciativa `daily-briefing-automation`).
 *
 * No metemos una dependencia (marked/markdown-it) por un correo: el briefing
 * usa un subconjunto acotado de markdown (headings, bold, listas, tablas GFM,
 * párrafos). Esta función cubre exactamente eso y está testeada. Si el briefing
 * empieza a necesitar más sintaxis, evaluar `marked` antes de inflar esto.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Inline: **bold**, *italic*, `code`. Se aplica sobre texto ya escapado. */
function inline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes('-');
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());
}

/** Convierte el markdown del briefing a un fragmento HTML (sin <html>/<body>). */
export function mdToHtmlFragment(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  // Estado de lista/párrafo en curso.
  let listType: 'ul' | 'ol' | null = null;
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Línea en blanco: cierra lista.
    if (trimmed === '') {
      closeList();
      i += 1;
      continue;
    }

    // Headings.
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      closeList();
      const level = h[1].length;
      out.push(`<h${level}>${inline(escapeHtml(h[2]))}</h${level}>`);
      i += 1;
      continue;
    }

    // Tabla GFM: línea con | seguida de un separador ---.
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      closeList();
      const header = splitRow(trimmed);
      const rows: string[][] = [];
      i += 2; // header + separador
      while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim() !== '') {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      const thead = `<thead><tr>${header
        .map((c) => `<th align="left">${inline(escapeHtml(c))}</th>`)
        .join('')}</tr></thead>`;
      const tbody = `<tbody>${rows
        .map((r) => `<tr>${r.map((c) => `<td>${inline(escapeHtml(c))}</td>`).join('')}</tr>`)
        .join('')}</tbody>`;
      out.push(
        `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;border-color:#ddd;">${thead}${tbody}</table>`
      );
      continue;
    }

    // Lista no ordenada.
    const ul = /^[-*]\s+(.*)$/.exec(trimmed);
    if (ul) {
      if (listType !== 'ul') {
        closeList();
        out.push('<ul>');
        listType = 'ul';
      }
      out.push(`<li>${inline(escapeHtml(ul[1]))}</li>`);
      i += 1;
      continue;
    }

    // Lista ordenada.
    const ol = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (ol) {
      if (listType !== 'ol') {
        closeList();
        out.push('<ol>');
        listType = 'ol';
      }
      out.push(`<li>${inline(escapeHtml(ol[1]))}</li>`);
      i += 1;
      continue;
    }

    // Párrafo.
    closeList();
    out.push(`<p>${inline(escapeHtml(trimmed))}</p>`);
    i += 1;
  }
  closeList();
  return out.join('\n');
}

/** Envuelve el fragmento en un documento HTML con estilo legible para correo. */
export function mdToEmailHtml(md: string): string {
  const body = mdToHtmlFragment(md);
  return (
    `<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; ` +
    `font-size: 15px; line-height: 1.55; color: #1a1a1a; max-width: 720px; margin: 0 auto; padding: 16px;">` +
    `${body}</body></html>`
  );
}
