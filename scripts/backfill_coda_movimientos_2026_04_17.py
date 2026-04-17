#!/usr/bin/env python3
"""
Backfill one-shot (2026-04-17) de erp.movimientos_caja desde Coda.

Contexto:
  El edge function `sync-cortes` corre cada 5 min y llama a rdb.upsert_movimiento,
  pero sólo procesa los últimos 3 días. Rows más viejos que quedaron fuera de esa
  ventana no se sincronizan.

  Este script pagina TODOS los rows de Coda (grid-6gzoL-bk1R, doc yvrM3UilPt)
  y los manda uno por uno a rdb.upsert_movimiento vía PostgREST. Es idempotente:
  rows con `referencia = coda_id` ya presentes se UPDATEan; los faltantes se INSERTan.

Uso:
  export CODA_API_KEY=...
  export NEXT_PUBLIC_SUPABASE_URL=...
  export SUPABASE_SERVICE_ROLE_KEY=...
  python3 scripts/backfill_coda_movimientos_2026_04_17.py

Después de correr, ejecutar la migración 20260417181500_dedup_movimientos_caja_name_refs.sql
para eliminar rows viejos cuyo `referencia` es un nombre de cajera (no un coda_id).

Nota: este script queda archivado como one-shot. NO correrlo en producción a menos
que se audite primero el estado de la tabla.
"""

import urllib.request, json, os, time, re

CODA   = os.environ['CODA_API_KEY']
SB_URL = os.environ['NEXT_PUBLIC_SUPABASE_URL']
SR_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']

DOC_ID  = 'yvrM3UilPt'
TBL_MOV = 'grid-6gzoL-bk1R'


def parse_num(v):
    if v is None or v == '':
        return None
    s = re.sub(r'[^0-9.\-]', '', str(v))
    return float(s) if s else None


def parse_ts(v):
    if not v or str(v).strip() == '' or '1899' in str(v):
        return None
    return str(v)


def fetch_all_coda_rows():
    url = f'https://coda.io/apis/v1/docs/{DOC_ID}/tables/{TBL_MOV}/rows?useColumnNames=true&limit=200'
    rows = []
    while url:
        req = urllib.request.Request(url, headers={'Authorization': f'Bearer {CODA}'})
        data = json.loads(urllib.request.urlopen(req).read())
        rows.extend(data['items'])
        url = data.get('nextPageLink')
    return rows


def upsert_row(r):
    v = r['values']
    reg = v.get('Registró', None)
    if isinstance(reg, dict):
        reg = reg.get('name') or str(reg)
    payload = {
        'p_coda_id':        r['id'],
        'p_corte_nombre':   v.get('Corte'),
        'p_fecha_hora':     parse_ts(v.get('Fecha/Hora')),
        'p_tipo':           v.get('Tipo'),
        'p_monto':          parse_num(v.get('Monto')),
        'p_nota':           v.get('Nota'),
        'p_registrado_por': reg,
    }
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        f'{SB_URL}/rest/v1/rpc/upsert_movimiento',
        data=body, method='POST', headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {SR_KEY}',
            'apikey': SR_KEY,
            'Accept-Profile': 'rdb',
            'Content-Profile': 'rdb',
        })
    try:
        urllib.request.urlopen(req).read()
        return None
    except urllib.error.HTTPError as e:
        return f"{r['id']}: {e.code} {e.read()[:200].decode()}"


def main():
    rows = fetch_all_coda_rows()
    print(f"Coda rows fetched: {len(rows)}")

    ok, err = 0, 0
    errors = []
    for r in rows:
        error = upsert_row(r)
        if error:
            err += 1
            if len(errors) < 5:
                errors.append(error)
        else:
            ok += 1
        time.sleep(0.04)  # Rate limit (~25 req/s)

    print(f"Upserted: {ok} | Errors: {err}")
    for e in errors:
        print(f"  ERR: {e}")


if __name__ == '__main__':
    main()
