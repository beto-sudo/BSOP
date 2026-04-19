/**
 * Helpers para importar el HTML que Coda coloca en el portapapeles (Cmd+A +
 * Cmd+C desde el canvas de una junta) y reescribirlo para que todas las
 * imágenes queden bajo `/api/adjuntos/...` del bucket privado de BSOP.
 *
 * El flujo es el mismo que usa el editor TipTap del detalle de junta (ver
 * `app/dilesa/admin/juntas/[id]/page.tsx`); se vive aquí para poder
 * reutilizarlo desde otras partes de la UI (por ejemplo, la columna de
 * "pegar de Coda" en la tabla principal de juntas).
 */

/** Patrón de hosts de Coda cuyas imágenes sí se importan. */
const CODA_HOST_PATTERN = /(codahosted\.io|codaio\.imgix\.net|images-codaio\.imgix\.net)/;

/** Detecta rápido si un blob de HTML trae imágenes que vale la pena importar. */
export function htmlHasCodaImages(html: string | null | undefined): boolean {
  if (!html) return false;
  return CODA_HOST_PATTERN.test(html);
}

/** Extrae los `src` únicos de todos los `<img>` que apuntan a Coda. */
export function extractCodaImageSrcs(html: string): string[] {
  const imgRe = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
  const srcs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const src = m[1] ?? m[2] ?? '';
    if (src && CODA_HOST_PATTERN.test(src)) srcs.push(src);
  }
  return Array.from(new Set(srcs));
}

export type CodaImportResult = {
  /** HTML reescrito con `<img src>` ya apuntando a `/api/adjuntos/...`. */
  html: string;
  /** Imágenes que se descargaron y guardaron con éxito. */
  imported: number;
  /** Imágenes que fallaron (timeout, 4xx/5xx del upstream, etc.). */
  failed: number;
};

/**
 * Dada una cadena de HTML (típicamente salida del portapapeles tras copiar
 * de Coda) y un `juntaId`, descarga cada imagen de Coda vía el endpoint
 * server-side `/api/adjuntos/import-url` — que a su vez las sube al bucket
 * privado — y devuelve el HTML con los `src` reescritos.
 *
 * El HTML se devuelve aunque fallen algunas imágenes: las que sobrevivieron
 * quedan apuntando a BSOP; las que fallaron conservan su `src` original
 * (puede romperse después, pero al menos el texto no se pierde).
 */
export async function importCodaImagesInHtml(
  html: string,
  juntaId: string
): Promise<CodaImportResult> {
  const uniqueSrcs = extractCodaImageSrcs(html);
  const replacements = new Map<string, string>();
  let imported = 0;
  let failed = 0;

  for (const src of uniqueSrcs) {
    try {
      const res = await fetch('/api/adjuntos/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: src, juntaId }),
      });
      if (!res.ok) {
        failed += 1;

        console.warn('[coda-paste-import] import-url failed for', src.slice(0, 80), res.status);
        continue;
      }
      const data = (await res.json()) as { ok?: boolean; url?: string };
      if (data.ok && data.url) {
        replacements.set(src, data.url);
        imported += 1;
      } else {
        failed += 1;
      }
    } catch (err) {
      failed += 1;

      console.warn('[coda-paste-import] error', (err as Error).message);
    }
  }

  let rewritten = html;
  for (const [from, to] of replacements) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rewritten = rewritten.replace(new RegExp(escaped, 'g'), to);
  }
  return { html: rewritten, imported, failed };
}
