# Backfill manual Waitry 2026-04-08

- PDF fuente usado: /Users/Beto/.openclaw/media/inbound/correcto---cf0f0f32-0ca1-4b74-b041-7cf267c99f45.pdf
- Pedidos parseados del Excel: 36
- Pedidos extra recuperados solo desde PDF: 1 (16813185)
- Pedidos totales procesados: 37
- Pedidos ya existentes/skip en Supabase: 5 (16798456, 16812418, 16812976, 16813286, 16813291)
- Pedidos insertados en Supabase (rdb.waitry_pedidos): 1
- Productos insertados en Supabase (rdb.waitry_productos): 11
- Registros insertados en Supabase (rdb.waitry_inbound): 1
- Pagos insertados en Supabase (rdb.waitry_pagos): 0 (sin datos fuente utilizables)
- Filas upserted en Coda Pedidos: 37
- Filas upserted en Coda Productos: 64
- Pedidos con productos extraídos del PDF: 36
- Pedidos sin datos de productos en PDF: 1

## Pedidos con productos en PDF
- 16798456
- 16812372
- 16812418
- 16812746
- 16812861
- 16812956
- 16812961
- 16812976
- 16813042
- 16813062
- 16813080
- 16813171
- 16813185
- 16813215
- 16813258
- 16813260
- 16813264
- 16813270
- 16813272
- 16813273
- 16813275
- 16813281
- 16813285
- 16813286
- 16813289
- 16813290
- 16813291
- 16813292
- 16813298
- 16813300
- 16813301
- 16813303
- 16813306
- 16813307
- 16813308
- 16813311

## Pedidos sin productos en PDF
- 16812402

## Columnas detectadas por GET en Supabase
- rdb.waitry_pedidos: id, order_id, status, paid, timestamp, place_id, place_name, table_name, layout_name, total_amount, total_discount, service_charge, tax, external_delivery_id, notes, last_action_at, content_hash, created_at, updated_at
- rdb.waitry_productos: id, order_id, product_id, product_name, quantity, unit_price, total_price, modifiers, notes, created_at
- rdb.waitry_inbound: id, order_id, event, payload_json, payload_hash, received_at, processed, attempts, error, created_at
- rdb.waitry_pagos: id, order_id, payment_id, payment_method, amount, tip, currency, created_at

## Errores
- Ninguno
