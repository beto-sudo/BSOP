/**
 * sync-cortes
 * Pulls cortes and movimientos from Coda API and upserts into Supabase.
 * Designed to run every 5 minutes via pg_cron + http extension.
 *
 * Arquitectura:
 *   Coda (doc yvrM3UilPt, grids Fn_BELDxbK + 6gzoL-bk1R)
 *     ↓ fetch últimas 3 días
 *   PostgREST RPC con Accept-Profile: rdb
 *     ↓
 *   rdb.upsert_corte  → INSERT/UPDATE en erp.cortes_caja
 *   rdb.upsert_movimiento → INSERT/UPDATE en erp.movimientos_caja
 *
 * Shim: `rdb.upsert_*` son fachadas en schema rdb; internamente escriben a erp.
 * Cuando BSOP se use nativamente para cortes este cron y las RPCs se pueden retirar.
 */

const CODA_API_KEY = Deno.env.get('CODA_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const DOC_ID             = 'yvrM3UilPt';
const TABLE_CORTES_ID    = 'grid-Fn_BELDxbK';
const TABLE_MOVIMIENTOS_ID = 'grid-6gzoL-bk1R';

const RPC_CORTE_URL      = `${SUPABASE_URL}/rest/v1/rpc/upsert_corte`;
const RPC_MOVIMIENTO_URL = `${SUPABASE_URL}/rest/v1/rpc/upsert_movimiento`;

const SB_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'apikey': SERVICE_KEY,
  'Accept-Profile': 'rdb',
  'Content-Profile': 'rdb',
};

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n;
}

function parseTs(v: unknown): string | null {
  if (!v || String(v).trim() === '') return null;
  try {
    const d = new Date(String(v));
    if (isNaN(d.getTime())) return null;
    if (String(v).includes('1899')) return null;
    return d.toISOString();
  } catch { return null; }
}

function parseDate(v: unknown): string | null {
  if (!v || String(v).trim() === '') return null;
  try {
    return new Date(String(v)).toISOString().split('T')[0];
  } catch { return null; }
}

function mapEstado(e: string): string {
  const m: Record<string,string> = {
    'Abierto': 'abierto', 'Cerrado': 'cerrado',
    'Auto Cerrado': 'auto_cerrado', 'Validado': 'validado',
  };
  return m[e] ?? e.toLowerCase();
}

async function fetchCodaRows(tableId: string, cutoffDays: number, dateColName: string): Promise<any[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - cutoffDays);

  let rows: any[] = [];
  let pageToken: string | null = null;
  const urlBase = `https://coda.io/apis/v1/docs/${DOC_ID}/tables/${tableId}/rows`;

  do {
    const url = new URL(urlBase);
    url.searchParams.set('useColumnNames', 'true');
    url.searchParams.set('limit', '50');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const resp = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${CODA_API_KEY}` }
    });

    if (!resp.ok) throw new Error(`Coda API error for ${tableId}: ${resp.status}`);
    const data = await resp.json();

    for (const row of data.items) {
      const v = row.values;
      const dateVal = parseTs(v[dateColName]);
      if (dateVal && new Date(dateVal) >= cutoff) {
        rows.push({ rowId: row.id, values: v });
      }
    }

    pageToken = data.nextPageToken ?? null;
    if (data.items.length > 0) {
      const lastDate = parseTs(data.items[data.items.length - 1].values[dateColName]);
      if (lastDate && new Date(lastDate) < cutoff) pageToken = null;
    }
  } while (pageToken);

  return rows;
}

async function upsertCorte(rowId: string, v: Record<string,any>): Promise<any> {
  const payload = {
    p_coda_id:              rowId,
    p_corte_nombre:         v['ID Corte'] ?? null,
    p_caja_nombre:          typeof v['Caja'] === 'object' ? v['Caja']?.name ?? String(v['Caja']) : v['Caja'] ?? null,
    p_estado:               v['Estado'] ? mapEstado(v['Estado']) : null,
    p_turno:                v['Turno'] ?? null,
    p_responsable_apertura: v['Responsable Apertura'] ?? null,
    p_responsable_cierre:   v['Responsable Cierre'] ?? null,
    p_observaciones:        v['Observaciones'] ?? null,
    p_efectivo_inicial:     parseNum(v['Efectivo Inicial']),
    p_efectivo_contado:     parseNum(v['Efectivo Contado al Cierre']),
    p_hora_inicio:          parseTs(v['Apertura']),
    p_hora_fin:             parseTs(v['Cierre']),
    p_fecha_operativa:      parseDate(v['Fecha Operativa']),
    p_tipo:                 'normal',
  };

  const resp = await fetch(RPC_CORTE_URL, {
    method: 'POST',
    headers: SB_HEADERS,
    body: JSON.stringify(payload),
  });

  const result = await resp.json();
  if (!resp.ok) return { ok: false, error: JSON.stringify(result) };
  return { ok: true, action: result.action ?? 'upserted' };
}

async function upsertMovimiento(rowId: string, v: Record<string,any>): Promise<any> {
  const payload = {
    p_coda_id:        rowId,
    p_corte_nombre:   v['Corte'] ?? null,
    p_fecha_hora:     parseTs(v['Fecha/Hora']),
    p_tipo:           v['Tipo'] ?? null,
    p_monto:          parseNum(v['Monto']),
    p_nota:           v['Nota'] ?? null,
    p_registrado_por: typeof v['Registró'] === 'object' ? v['Registró']?.name ?? String(v['Registró']) : v['Registró'] ?? null,
  };

  const resp = await fetch(RPC_MOVIMIENTO_URL, {
    method: 'POST',
    headers: SB_HEADERS,
    body: JSON.stringify(payload),
  });

  const result = await resp.json();
  if (!resp.ok) return { ok: false, error: JSON.stringify(result) };
  return { ok: true, action: 'upserted' };
}

Deno.serve(async (_req) => {
  const log: string[] = [];
  try {
    // 1. Sync Cortes (last 3 days)
    log.push('Syncing Cortes...');
    const cortes = await fetchCodaRows(TABLE_CORTES_ID, 3, 'Apertura');
    let c_upd = 0, c_err = 0;
    for (const { rowId, values } of cortes) {
      const res = await upsertCorte(rowId, values);
      if (res.ok) c_upd++; else { c_err++; log.push(`  ❌ Corte ${values['ID Corte']}: ${res.error}`); }
      await new Promise(r => setTimeout(r, 50));
    }
    log.push(`Cortes: ${c_upd} upserted, ${c_err} errors`);

    // 2. Sync Movimientos (last 3 days)
    log.push('Syncing Movimientos...');
    const movs = await fetchCodaRows(TABLE_MOVIMIENTOS_ID, 3, 'Fecha/Hora');
    let m_upd = 0, m_err = 0;
    for (const { rowId, values } of movs) {
      const res = await upsertMovimiento(rowId, values);
      if (res.ok) m_upd++; else { m_err++; log.push(`  ❌ Movimiento ${rowId}: ${res.error}`); }
      await new Promise(r => setTimeout(r, 50));
    }
    log.push(`Movimientos: ${m_upd} upserted, ${m_err} errors`);

    return new Response(JSON.stringify({ ok: true, log }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message, log }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
});
