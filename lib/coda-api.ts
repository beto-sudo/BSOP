/**
 * Coda API client compartido.
 *
 * Extraído de los scripts `scripts/archive/migrate_dilesa_*.ts` para evitar
 * duplicar `codaGet`, `fetchAllRows` y `fetchColumns` en cada migración.
 *
 * Paginación: Coda devuelve 100 rows por default. `listRowsAll` sigue
 * `nextPageToken` (no `nextPageLink`) hasta agotar la tabla.
 *
 * Uso típico:
 *
 *   const coda = new CodaClient(process.env.CODA_API_KEY!);
 *   const cols = await coda.listColumns(docId, tableId);
 *   const rows = await coda.listRowsAll(docId, tableId);
 *
 *   for (const row of rows) {
 *     const nombre = pickByName(row.values, cols, 'Nombre');
 *     ...
 *   }
 */

export interface CodaRow<V = Record<string, unknown>> {
  id: string;
  name: string;
  values: V;
}

export interface CodaColumn {
  id: string;
  name: string;
  format?: { type?: string };
}

export interface ListRowsOpts {
  /** Tamaño de página (Coda máx 500; default 200 para reducir round-trips). */
  limit?: number;
  /**
   * Formato de valores devueltos por Coda.
   * - `simple`           → escalares y strings con comas para multi-valor
   * - `simpleWithArrays` → multi-valor como array real (útil para lookups)
   * - `rich`             → objetos con metadata (raro que se necesite)
   */
  valueFormat?: 'simple' | 'simpleWithArrays' | 'rich';
}

export class CodaClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('CodaClient: apiKey is required');
    this.apiKey = apiKey;
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`https://coda.io/apis/v1${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Coda API ${path} → ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  async listColumns(docId: string, tableId: string): Promise<CodaColumn[]> {
    const data = await this.get<{ items: CodaColumn[]; nextPageToken?: string }>(
      `/docs/${docId}/tables/${tableId}/columns`
    );
    // La tabla de columnas suele ser pequeña (< 100), pero pagina igual por si acaso.
    const items = [...data.items];
    let pageToken = data.nextPageToken;
    while (pageToken) {
      const page = await this.get<{ items: CodaColumn[]; nextPageToken?: string }>(
        `/docs/${docId}/tables/${tableId}/columns?pageToken=${encodeURIComponent(pageToken)}`
      );
      items.push(...page.items);
      pageToken = page.nextPageToken;
    }
    return items;
  }

  async listRowsAll<V = Record<string, unknown>>(
    docId: string,
    tableId: string,
    opts: ListRowsOpts = {}
  ): Promise<CodaRow<V>[]> {
    const limit = String(opts.limit ?? 200);
    const valueFormat = opts.valueFormat ?? 'simple';

    const rows: CodaRow<V>[] = [];
    let pageToken: string | undefined;

    do {
      const qs = new URLSearchParams({ limit, valueFormat });
      if (pageToken) qs.set('pageToken', pageToken);

      const data = await this.get<{
        items: CodaRow<V>[];
        nextPageToken?: string;
      }>(`/docs/${docId}/tables/${tableId}/rows?${qs}`);

      rows.push(...data.items);
      pageToken = data.nextPageToken;
    } while (pageToken);

    return rows;
  }
}

// ─── Helpers de extracción ───────────────────────────────────────────────────

/**
 * Construye un mapa bidireccional nombre ↔ id a partir de `listColumns`.
 * Las claves se normalizan a lowercase/trim.
 */
export function buildColumnMap(cols: CodaColumn[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const col of cols) {
    map.set(col.name.toLowerCase().trim(), col.id);
    map.set(col.id, col.name.toLowerCase().trim());
  }
  return map;
}

/**
 * Intenta recuperar el valor de una fila por una lista de nombres candidatos.
 * Útil cuando no sabes si Coda tiene "Nombre" vs "Name" vs "ID Tabla".
 */
export function pick(
  values: Record<string, unknown>,
  colMap: Map<string, string>,
  ...candidates: string[]
): unknown {
  for (const name of candidates) {
    const id = colMap.get(name.toLowerCase().trim());
    if (id && values[id] !== undefined) return values[id];
    if (values[name] !== undefined) return values[name];
  }
  return undefined;
}

/** Convierte un valor Coda a string limpio o `null` si es vacío. */
export function str(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  return String(v).trim() || null;
}

/** Convierte un valor Coda a número o `null`. Acepta "1,234.56" o currency con $. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Convierte un valor Coda a int (entero) o `null`. */
export function int(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
}

/** Convierte un valor Coda a `YYYY-MM-DD` (fecha) o `null`. */
export function dateStr(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

/** Convierte un valor Coda a ISO timestamp o `null`. */
export function tsStr(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Boolean flexible: true si el valor es truthy en los formatos comunes. */
export function bool(v: unknown): boolean {
  if (v === true) return true;
  if (v === false || v === null || v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'sí' || s === 'si' || s === 'yes';
}

/**
 * Parsea multi-valor Coda (formato `simple`): strings con separador `,` o
 * arrays reales (formato `simpleWithArrays`). Devuelve un array de strings
 * limpio.
 */
export function multi(v: unknown): string[] {
  if (v === null || v === undefined || v === '') return [];
  if (Array.isArray(v)) {
    return v.map((x) => String(x).trim()).filter(Boolean);
  }
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Extrae el primer URL encontrado en un valor (puede venir como string con
 * markdown `![](url)`, string puro, u objeto `{url: ...}`).
 */
export function firstUrl(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string') {
    // Coda suele devolver attachments como `![name](url)` en formato simple.
    const md = v.match(/!\[[^\]]*\]\(([^)]+)\)/);
    if (md?.[1]) return md[1].trim();
    // Plain URL
    const urlMatch = v.match(/https?:\/\/\S+/);
    if (urlMatch?.[0]) return urlMatch[0].trim();
    return null;
  }
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    if (typeof obj.url === 'string') return obj.url;
    if (Array.isArray(obj)) {
      for (const x of obj) {
        const u = firstUrl(x);
        if (u) return u;
      }
    }
  }
  return null;
}

/**
 * Parsea coordenadas "lat, lng" (formato libre Coda) a `{lat, lng}` o `null`.
 */
export function coords(v: unknown): { lat: number; lng: number } | null {
  const s = str(v);
  if (!s) return null;
  const parts = s.split(/[,;\s]+/).filter(Boolean);
  if (parts.length < 2) return null;
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}
