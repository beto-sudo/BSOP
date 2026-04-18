-- ============================================================
-- MIGRATION: Fase 2 — Copia de datos a schema rdb
-- Project: BSOP Supabase
-- Date: 2026-04-08
-- Purpose: Migrar datos de schemas originales (waitry, caja,
--          inventario) a las tablas rdb.*
--
-- ⚠️  EJECUTAR SOLO EN VENTANA DE MANTENIMIENTO
--     Requiere que el código ya apunte a rdb (Fase 2 deploy).
--     Orden respeta dependencias de foreign keys.
-- ============================================================

-- ── 1. waitry_inbound ─────────────────────────────────────────
INSERT INTO rdb.waitry_inbound (
  id, order_id, event, payload_json, payload_hash,
  received_at, processed, attempts, error, created_at
)
SELECT
  id, order_id, event, payload_json, payload_hash,
  received_at, processed, attempts, error, created_at
FROM waitry.inbound
ON CONFLICT (order_id) DO NOTHING;

-- ── 2. waitry_pedidos ─────────────────────────────────────────
INSERT INTO rdb.waitry_pedidos (
  id, order_id, status, paid, "timestamp", place_id, place_name,
  table_name, layout_name, total_amount, total_discount,
  service_charge, tax, external_delivery_id, notes,
  last_action_at, content_hash, created_at, updated_at
)
SELECT
  id, order_id, status, paid, "timestamp", place_id, place_name,
  table_name, layout_name, total_amount, total_discount,
  service_charge, tax, external_delivery_id, notes,
  last_action_at, content_hash, created_at, updated_at
FROM waitry.pedidos
ON CONFLICT (order_id) DO NOTHING;

-- ── 3. waitry_productos ───────────────────────────────────────
INSERT INTO rdb.waitry_productos (
  id, order_id, product_id, product_name,
  quantity, unit_price, total_price, modifiers, notes, created_at
)
SELECT
  id, order_id, product_id, product_name,
  quantity, unit_price, total_price, modifiers, notes, created_at
FROM waitry.productos
ON CONFLICT (order_id, product_id, product_name) DO NOTHING;

-- ── 4. waitry_pagos ───────────────────────────────────────────
INSERT INTO rdb.waitry_pagos (
  id, order_id, payment_id, payment_method,
  amount, tip, currency, created_at
)
SELECT
  id, order_id, payment_id, payment_method,
  amount, tip, currency, created_at
FROM waitry.pagos
ON CONFLICT (order_id, payment_id) DO NOTHING;

-- ── 5. waitry_duplicate_candidates ───────────────────────────
INSERT INTO rdb.waitry_duplicate_candidates (
  id, order_id_a, order_id_b, similarity_score,
  match_reason, content_hash, detected_at, resolved, resolution
)
SELECT
  id, order_id_a, order_id_b, similarity_score,
  match_reason, content_hash, detected_at, resolved, resolution
FROM waitry.duplicate_candidates
ON CONFLICT DO NOTHING;

-- ── 6. cajas (sin dependencias) ───────────────────────────────
INSERT INTO rdb.cajas (id, nombre)
SELECT id, nombre
FROM caja.cajas
ON CONFLICT (nombre) DO NOTHING;

-- ── 7. cortes (depende de cajas) ─────────────────────────────
INSERT INTO rdb.cortes (
  id, fecha_operativa, caja_nombre, caja_id, hora_inicio, hora_fin,
  responsable_apertura, responsable_cierre,
  efectivo_inicial, efectivo_contado, estado
)
SELECT
  id, fecha_operativa, caja_nombre, caja_id, hora_inicio, hora_fin,
  responsable_apertura, responsable_cierre,
  efectivo_inicial, efectivo_contado, estado
FROM caja.cortes
ON CONFLICT (id) DO NOTHING;

-- ── 8. movimientos (depende de cortes) ───────────────────────
INSERT INTO rdb.movimientos (
  id, corte_id, fecha_hora, tipo, monto, nota, registrado_por
)
SELECT
  id, corte_id, fecha_hora, tipo, monto, nota, registrado_por
FROM caja.movimientos
ON CONFLICT (id) DO NOTHING;

-- ── 9. inv_productos ──────────────────────────────────────────
INSERT INTO rdb.inv_productos (id, nombre, categoria, stock_inicial)
SELECT id, nombre, categoria, stock_inicial
FROM inventario.productos
ON CONFLICT (id) DO NOTHING;

-- ── 10. inv_entradas (depende de inv_productos) ───────────────
INSERT INTO rdb.inv_entradas (
  id, producto_id, fecha_entrada, cantidad, costo_unitario, proveedor
)
SELECT
  id, producto_id, fecha_entrada, cantidad, costo_unitario, proveedor
FROM inventario.entradas
ON CONFLICT (id) DO NOTHING;

-- ── 11. inv_ajustes (depende de inv_productos) ────────────────
INSERT INTO rdb.inv_ajustes (
  id, producto_id, fecha_ajuste, cantidad, motivo, estado
)
SELECT
  id, producto_id, fecha_ajuste, cantidad, motivo, estado
FROM inventario.ajustes
ON CONFLICT (id) DO NOTHING;

-- ── Validación rápida post-migración ─────────────────────────
SELECT 'waitry_inbound'          AS tabla, COUNT(*) AS filas FROM rdb.waitry_inbound
UNION ALL
SELECT 'waitry_pedidos',                    COUNT(*) FROM rdb.waitry_pedidos
UNION ALL
SELECT 'waitry_productos',                  COUNT(*) FROM rdb.waitry_productos
UNION ALL
SELECT 'waitry_pagos',                      COUNT(*) FROM rdb.waitry_pagos
UNION ALL
SELECT 'waitry_duplicate_candidates',       COUNT(*) FROM rdb.waitry_duplicate_candidates
UNION ALL
SELECT 'cajas',                             COUNT(*) FROM rdb.cajas
UNION ALL
SELECT 'cortes',                            COUNT(*) FROM rdb.cortes
UNION ALL
SELECT 'movimientos',                       COUNT(*) FROM rdb.movimientos
UNION ALL
SELECT 'inv_productos',                     COUNT(*) FROM rdb.inv_productos
UNION ALL
SELECT 'inv_entradas',                      COUNT(*) FROM rdb.inv_entradas
UNION ALL
SELECT 'inv_ajustes',                       COUNT(*) FROM rdb.inv_ajustes
ORDER BY tabla;
