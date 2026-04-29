/**
 * Storage path builders for the `adjuntos` private bucket.
 *
 * Convention (ADR-022): `<empresa>/<entidad>/<entidadId>/<filename>`
 *
 * - `<empresa>` — slug of the empresa that owns the file (`dilesa`,
 *   `rdb`, `ansa`, `coagan`).
 * - `<entidad>` — table/feature name (`documentos`, `empleados`,
 *   `vouchers`, `levantamientos`, etc.).
 * - `<entidadId>` — UUID or human-id of the parent row.
 * - `<filename>` — sluggified filename, includes timestamp prefix to
 *   avoid collisions: `{Date.now()}-{slugified-name}.{ext}`.
 *
 * Examples:
 *   adjuntos/dilesa/documentos/12345.../1714426212-contrato.pdf
 *   adjuntos/rdb/empleados/abcdef.../1714426212-ine-frente.jpg
 *   adjuntos/rdb/vouchers/xyz123.../1714426212-voucher.png
 *
 * Use `buildAdjuntoPath()` to construct paths consistently across
 * uploaders. Use `lib/adjuntos.ts` for read flows (signed URLs, proxy).
 */

export type EmpresaSlug = 'dilesa' | 'rdb' | 'ansa' | 'coagan';

export type AdjuntoEntidad =
  | 'documentos'
  | 'empleados'
  | 'vouchers'
  | 'levantamientos'
  | 'movimientos'
  | 'personas'
  | 'proyectos'
  | 'prototipos'
  | 'terrenos'
  | 'anteproyectos'
  | 'empresa';

export type BuildAdjuntoPathOpts = {
  empresa: EmpresaSlug;
  entidad: AdjuntoEntidad;
  entidadId: string;
  filename: string;
  /** Optional millisecond timestamp prefix. Default `Date.now()`. */
  timestamp?: number;
};

/**
 * Sluggify a filename to be storage-safe: lowercase, ASCII-only,
 * spaces → dashes, special chars stripped except dot/dash/underscore.
 * Preserves the extension when present.
 */
export function slugifyFilename(name: string): string {
  const lastDot = name.lastIndexOf('.');
  const base = lastDot > 0 ? name.slice(0, lastDot) : name;
  const ext = lastDot > 0 ? name.slice(lastDot) : '';

  const slugBase = base
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return `${slugBase || 'file'}${ext.toLowerCase()}`;
}

/**
 * Builds the canonical object path for a new adjunto upload.
 *
 * Returns the path inside the `adjuntos` bucket — does NOT include the
 * bucket name. Pass straight to `supabase.storage.from('adjuntos').upload(path, file)`.
 */
export function buildAdjuntoPath({
  empresa,
  entidad,
  entidadId,
  filename,
  timestamp = Date.now(),
}: BuildAdjuntoPathOpts): string {
  const safeName = slugifyFilename(filename);
  return `${empresa}/${entidad}/${entidadId}/${timestamp}-${safeName}`;
}
