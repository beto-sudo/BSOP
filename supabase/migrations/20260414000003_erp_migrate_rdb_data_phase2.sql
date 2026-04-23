-- ============================================================
-- Phase 2: Migrate cortes, movimientos, corte_conteo → erp
-- Then recreate all views to read from erp.* + rdb.waitry_*
-- ============================================================

-- RDB empresa_id
-- e52ac307-9373-4115-b65e-1178f0c4e1aa

-- ============================================================
-- 1. Create missing erp tables if not in v3 DDL
-- ============================================================

-- erp.corte_conteo_denominaciones (not in v3 schema, create it)
CREATE TABLE IF NOT EXISTS erp.corte_conteo_denominaciones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES core.empresas(id),
  corte_id     UUID NOT NULL REFERENCES erp.cortes_caja(id) ON DELETE CASCADE,
  denominacion NUMERIC(10,2) NOT NULL,
  tipo         TEXT NOT NULL CHECK (tipo IN ('billete','moneda')),
  cantidad     INTEGER NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  subtotal     NUMERIC(12,2) GENERATED ALWAYS AS (denominacion * cantidad) STORED,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (corte_id, denominacion)
);

CREATE INDEX IF NOT EXISTS erp_corte_conteo_corte_id_idx
  ON erp.corte_conteo_denominaciones (corte_id);

-- RLS for corte_conteo_denominaciones
ALTER TABLE erp.corte_conteo_denominaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY corte_conteo_denominaciones_access ON erp.corte_conteo_denominaciones
  FOR ALL USING (
    empresa_id IN (
      SELECT ue.empresa_id FROM core.usuarios_empresas ue
      JOIN core.usuarios u ON u.id = ue.usuario_id
      WHERE u.id = auth.uid()
    )
  );

-- Grant
GRANT SELECT, INSERT, UPDATE, DELETE ON erp.corte_conteo_denominaciones TO service_role, authenticated;

-- ============================================================
-- DATA MIGRATIONS — EDITED 2026-04-23 (drift-1.5)
-- All INSERT...SELECT FROM rdb.* sources are guarded so a fresh DB
-- (Preview Branch / dev local) without the legacy tables ends up with empty
-- erp.* tables, which is the correct state. Production already has data.
-- ============================================================

-- 2. Migrate rdb.cortes → erp.cortes_caja
DO $do$ BEGIN
  IF to_regclass('rdb.cortes') IS NOT NULL THEN
    INSERT INTO erp.cortes_caja (
      id, empresa_id, caja_nombre, corte_nombre, tipo, estado,
      efectivo_inicial, efectivo_contado, observaciones,
      fecha_operativa, abierto_at, cerrado_at, created_at, updated_at
    )
    SELECT
      c.id, 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid,
      c.caja_nombre,
      COALESCE(c.corte_nombre, 'Corte-' || left(c.id::text, 8)),
      COALESCE(
        CASE WHEN c.tipo = 'sin_corte' THEN 'normal' ELSE c.tipo END,
        'normal'
      ),
      CASE LOWER(c.estado)
        WHEN 'cerrado' THEN 'cerrado'
        WHEN 'abierto' THEN 'abierto'
        WHEN 'validado' THEN 'validado'
        WHEN 'cancelado' THEN 'cancelado'
        ELSE 'cerrado'
      END,
      COALESCE(c.efectivo_inicial, 0),
      c.efectivo_contado, c.observaciones, c.fecha_operativa,
      c.hora_inicio, c.hora_fin, c.hora_inicio, c.hora_fin
    FROM rdb.cortes c
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $do$;

-- 3. Migrate rdb.movimientos → erp.movimientos_caja
DO $do$ BEGIN
  IF to_regclass('rdb.movimientos') IS NOT NULL THEN
    INSERT INTO erp.movimientos_caja (
      id, empresa_id, corte_id, tipo, monto, concepto, referencia, created_at
    )
    SELECT
      m.id, 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid, m.corte_id,
      CASE LOWER(m.tipo)
        WHEN 'depósito' THEN 'entrada'
        WHEN 'deposito' THEN 'entrada'
        WHEN 'retiro' THEN 'salida'
        WHEN 'fondo' THEN 'fondo'
        WHEN 'devolucion' THEN 'devolucion'
        ELSE 'entrada'
      END,
      m.monto, m.nota,
      COALESCE(m.coda_id, m.registrado_por),
      COALESCE(m.fecha_hora, now())
    FROM rdb.movimientos m
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $do$;

-- 4. Migrate rdb.corte_conteo_denominaciones → erp.corte_conteo_denominaciones
DO $do$ BEGIN
  IF to_regclass('rdb.corte_conteo_denominaciones') IS NOT NULL THEN
    INSERT INTO erp.corte_conteo_denominaciones (
      id, empresa_id, corte_id, denominacion, tipo, cantidad, created_at
    )
    SELECT
      ccd.id, 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid,
      ccd.corte_id, ccd.denominacion, ccd.tipo, ccd.cantidad, ccd.created_at
    FROM rdb.corte_conteo_denominaciones ccd
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $do$;

-- ============================================================
-- 5. Recreate views: now reading from erp.* + rdb.waitry_*
-- EDITED 2026-04-23 (drift-1.5): views that read from rdb.waitry_* (ambient)
-- are skipped on a fresh DB. The compatibility views are only meaningful when
-- the upstream waitry data is present (production / RDB-restore).
-- ============================================================

-- Drop dependent views first
DROP VIEW IF EXISTS rdb.v_cortes_lista CASCADE;
DROP VIEW IF EXISTS rdb.v_cortes_totales CASCADE;
DROP VIEW IF EXISTS rdb.v_corte_conteo_totales CASCADE;
DROP VIEW IF EXISTS rdb.v_inventario_stock CASCADE;
DROP VIEW IF EXISTS rdb.v_productos_grupo CASCADE;

-- ============================================================
-- 5a. v_cortes_totales — reads from erp.cortes_caja + rdb.waitry_*
-- 5b. v_cortes_lista — compatibility view for frontend
-- Both depend on rdb.waitry_* (ambient). Skipped on fresh DB.
-- ============================================================
DO $do$ BEGIN
  IF to_regclass('rdb.waitry_pedidos') IS NULL OR to_regclass('rdb.waitry_pagos') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $sql$
    CREATE VIEW rdb.v_cortes_totales AS
    WITH pagos_por_corte AS (
        SELECT
            ped.corte_id,
            LOWER(p.payment_method) AS method,
            p.amount
        FROM rdb.waitry_pedidos ped
        JOIN rdb.waitry_pagos p ON p.order_id = ped.order_id
        WHERE ped.corte_id IS NOT NULL
          AND ped.status != 'order_cancelled'
    ),
    pedidos_por_corte AS (
        SELECT
            corte_id,
            COUNT(*) AS total_pedidos
        FROM rdb.waitry_pedidos
        WHERE corte_id IS NOT NULL
          AND status != 'order_cancelled'
        GROUP BY corte_id
    ),
    movimientos_por_corte AS (
        SELECT
            corte_id,
            SUM(CASE WHEN tipo = 'entrada' THEN monto ELSE 0 END) AS total_depositos,
            SUM(CASE WHEN tipo = 'salida' THEN monto ELSE 0 END) AS total_retiros
        FROM erp.movimientos_caja
        WHERE empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
        GROUP BY corte_id
    )
    SELECT
        c.id                                                           AS corte_id,
        c.empresa_id,
        c.caja_nombre,
        c.estado,
        c.abierto_at                                                    AS hora_inicio,
        c.cerrado_at                                                    AS hora_fin,
        c.efectivo_inicial,
        COALESCE(SUM(CASE WHEN pp.method = 'cash'             THEN pp.amount ELSE 0 END), 0) AS ingresos_efectivo,
        COALESCE(SUM(CASE WHEN pp.method LIKE 'credit_card%'
                            OR pp.method = 'pos'               THEN pp.amount ELSE 0 END), 0) AS ingresos_tarjeta,
        COALESCE(SUM(CASE WHEN pp.method = 'stripe'           THEN pp.amount ELSE 0 END), 0) AS ingresos_stripe,
        COALESCE(SUM(CASE WHEN pp.method = 'other'            THEN pp.amount ELSE 0 END), 0) AS ingresos_transferencias,
        COALESCE(SUM(pp.amount), 0)                                                           AS total_ingresos,
        COALESCE(m.total_depositos, 0)                                                        AS depositos,
        COALESCE(m.total_retiros,   0)                                                        AS retiros,
        (
            c.efectivo_inicial
            + COALESCE(SUM(CASE WHEN pp.method = 'cash' THEN pp.amount ELSE 0 END), 0)
            + COALESCE(m.total_depositos, 0)
            - COALESCE(m.total_retiros,   0)
        )                                                                                     AS efectivo_esperado,
        COALESCE(pc.total_pedidos, 0)                                                         AS pedidos_count
    FROM erp.cortes_caja c
    LEFT JOIN pagos_por_corte      pp ON pp.corte_id = c.id
    LEFT JOIN pedidos_por_corte    pc ON pc.corte_id = c.id
    LEFT JOIN movimientos_por_corte m ON m.corte_id  = c.id
    WHERE c.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
    GROUP BY c.id, c.empresa_id, c.caja_nombre, c.estado, c.abierto_at, c.cerrado_at,
             c.efectivo_inicial, m.total_depositos, m.total_retiros, pc.total_pedidos
  $sql$;

  GRANT SELECT ON rdb.v_cortes_totales TO anon, authenticated, service_role;

  EXECUTE $sql$
    CREATE VIEW rdb.v_cortes_lista AS
    SELECT
      c.id,
      COALESCE(c.corte_nombre, 'Corte-' || left(c.id::text, 8)) AS corte_nombre,
      NULL::text                                                 AS coda_id,
      NULL::uuid                                                 AS caja_id,
      c.caja_nombre,
      c.fecha_operativa,
      c.abierto_at                                               AS hora_inicio,
      c.cerrado_at                                               AS hora_fin,
      c.estado,
      NULL::text                                                 AS turno,
      c.tipo,
      c.observaciones,
      c.efectivo_inicial,
      c.efectivo_contado,
      NULL::text                                                 AS responsable_apertura,
      NULL::text                                                 AS responsable_cierre,
      COALESCE(vt.ingresos_efectivo,       0) AS ingresos_efectivo,
      COALESCE(vt.ingresos_tarjeta,        0) AS ingresos_tarjeta,
      COALESCE(vt.ingresos_stripe,         0) AS ingresos_stripe,
      COALESCE(vt.ingresos_transferencias, 0) AS ingresos_transferencias,
      COALESCE(vt.total_ingresos,          0) AS total_ingresos,
      COALESCE(vt.depositos,               0) AS depositos,
      COALESCE(vt.retiros,                 0) AS retiros,
      COALESCE(vt.efectivo_esperado,       0) AS efectivo_esperado,
      COALESCE(vt.pedidos_count,           0) AS pedidos_count
    FROM erp.cortes_caja c
    LEFT JOIN rdb.v_cortes_totales vt ON vt.corte_id = c.id
    WHERE c.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
  $sql$;

  GRANT SELECT ON rdb.v_cortes_lista TO anon, authenticated, service_role;
END $do$;

-- ============================================================
-- 5c. v_corte_conteo_totales — reads from erp
-- ============================================================
CREATE VIEW rdb.v_corte_conteo_totales AS
SELECT
  corte_id,
  SUM(subtotal) AS total_contado,
  jsonb_object_agg(
    denominacion::text,
    jsonb_build_object('cantidad', cantidad, 'subtotal', subtotal, 'tipo', tipo)
    ORDER BY denominacion DESC
  ) AS detalle
FROM erp.corte_conteo_denominaciones
WHERE empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
GROUP BY corte_id;

GRANT SELECT ON rdb.v_corte_conteo_totales TO anon, authenticated, service_role;

-- ============================================================
-- 5d. v_inventario_stock — reads from erp.* + rdb.waitry_* (ambient)
-- Skipped on fresh DB.
-- ============================================================
DO $do$ BEGIN
  IF to_regclass('rdb.waitry_productos') IS NULL OR to_regclass('rdb.waitry_pedidos') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $sql$
    CREATE VIEW rdb.v_inventario_stock AS
    WITH
    movimientos_agg AS (
      SELECT
        producto_id,
        SUM(CASE WHEN tipo_movimiento IN ('entrada','ajuste') THEN cantidad ELSE 0 END) AS total_entradas,
        SUM(CASE WHEN tipo_movimiento IN ('salida','devolucion') THEN cantidad ELSE 0 END) AS total_salidas_manuales
      FROM erp.movimientos_inventario
      WHERE empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
      GROUP BY producto_id
    ),
    ventas_agg AS (
      SELECT
        p.id AS padre_id,
        SUM(wp.quantity) AS total_consumido
      FROM rdb.waitry_productos wp
      JOIN rdb.waitry_pedidos ped ON ped.order_id = wp.order_id
      JOIN erp.productos p        ON p.codigo::text = wp.product_id
      WHERE ped.status != 'order_canceled'
        AND p.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
      GROUP BY p.id
    )
    SELECT
      p.id, p.nombre, p.tipo AS categoria, p.unidad, p.inventariable,
      COALESCE(pp.costo, 0)  AS costo_unitario,
      COALESCE(pp.costo, 0)  AS ultimo_costo,
      0   AS stock_minimo,
      1.0 AS factor_consumo,
      COALESCE(m.total_entradas, 0)                                 AS total_entradas,
      COALESCE(v.total_consumido, 0)                                AS total_vendido,
      COALESCE(m.total_salidas_manuales, 0)                         AS total_mermas,
      COALESCE(m.total_entradas, 0)
        - COALESCE(v.total_consumido, 0)
        - COALESCE(m.total_salidas_manuales, 0)                     AS stock_actual,
      ROUND(
        (COALESCE(m.total_entradas, 0)
         - COALESCE(v.total_consumido, 0)
         - COALESCE(m.total_salidas_manuales, 0))
        * COALESCE(pp.costo, 0), 2
      )                                                             AS valor_inventario,
      false                                                          AS bajo_minimo
    FROM erp.productos p
    LEFT JOIN movimientos_agg m ON m.producto_id = p.id
    LEFT JOIN ventas_agg      v ON v.padre_id    = p.id
    LEFT JOIN erp.productos_precios pp ON pp.producto_id = p.id AND pp.vigente = true
    WHERE p.inventariable = true
      AND p.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
      AND p.deleted_at IS NULL
  $sql$;

  GRANT SELECT ON rdb.v_inventario_stock TO anon, authenticated, service_role;
END $do$;

-- ============================================================
-- 5e. v_productos_grupo — reads from erp.productos
-- Note: erp doesn't have parent_id, so this view is simplified
-- ============================================================
CREATE VIEW rdb.v_productos_grupo AS
SELECT
  p.id             AS padre_id,
  p.nombre         AS padre_nombre,
  p.tipo           AS categoria,
  COALESCE(pp.costo, 0) AS costo_unitario,
  p.unidad,
  0                AS total_hijos,
  NULL::jsonb      AS hijos
FROM erp.productos p
LEFT JOIN erp.productos_precios pp ON pp.producto_id = p.id AND pp.vigente = true
WHERE p.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
  AND p.deleted_at IS NULL;

GRANT SELECT ON rdb.v_productos_grupo TO anon, authenticated, service_role;

-- ============================================================
-- 6. Update rdb.upsert_corte to write to erp.cortes_caja
-- ============================================================
DROP FUNCTION IF EXISTS rdb.upsert_corte CASCADE;

CREATE OR REPLACE FUNCTION rdb.upsert_corte(
  p_coda_id              TEXT    DEFAULT NULL,
  p_corte_nombre         TEXT    DEFAULT NULL,
  p_caja_nombre          TEXT    DEFAULT NULL,
  p_estado               TEXT    DEFAULT NULL,
  p_turno                TEXT    DEFAULT NULL,
  p_responsable_apertura TEXT    DEFAULT NULL,
  p_responsable_cierre   TEXT    DEFAULT NULL,
  p_observaciones        TEXT    DEFAULT NULL,
  p_efectivo_inicial     NUMERIC DEFAULT NULL,
  p_efectivo_contado     NUMERIC DEFAULT NULL,
  p_hora_inicio          TIMESTAMPTZ DEFAULT NULL,
  p_hora_fin             TIMESTAMPTZ DEFAULT NULL,
  p_fecha_operativa      DATE    DEFAULT NULL,
  p_tipo                 TEXT    DEFAULT 'normal'
)
RETURNS erp.cortes_caja
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, rdb, public
AS $$
DECLARE
  v_caja_id UUID;
  v_result  erp.cortes_caja;
  v_empresa_id UUID := 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid;
BEGIN
  -- Resolver caja_id desde nombre
  IF p_caja_nombre IS NOT NULL THEN
    SELECT id INTO v_caja_id
    FROM erp.cajas
    WHERE nombre = p_caja_nombre
      AND empresa_id = v_empresa_id
    LIMIT 1;

    IF v_caja_id IS NULL THEN
      INSERT INTO erp.cajas (nombre, empresa_id)
      VALUES (p_caja_nombre, v_empresa_id)
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_caja_id;

      IF v_caja_id IS NULL THEN
        SELECT id INTO v_caja_id FROM erp.cajas WHERE nombre = p_caja_nombre AND empresa_id = v_empresa_id LIMIT 1;
      END IF;
    END IF;
  END IF;

  -- Map estado to erp CHECK values
  p_estado := CASE LOWER(COALESCE(p_estado, ''))
    WHEN 'cerrado' THEN 'cerrado'
    WHEN 'abierto' THEN 'abierto'
    WHEN 'validado' THEN 'validado'
    WHEN 'cancelado' THEN 'cancelado'
    ELSE 'abierto'
  END;

  -- Upsert by coda_id (stored in observaciones as 'coda:<id>')
  IF p_coda_id IS NOT NULL THEN
    INSERT INTO erp.cortes_caja (
      empresa_id, caja_nombre, corte_nombre, tipo, estado,
      efectivo_inicial, efectivo_contado, observaciones,
      fecha_operativa, abierto_at, cerrado_at
    ) VALUES (
      v_empresa_id, p_caja_nombre,
      COALESCE(p_corte_nombre, 'Corte-' || p_caja_nombre),
      COALESCE(p_tipo, 'normal'),
      p_estado,
      COALESCE(p_efectivo_inicial, 0),
      p_efectivo_contado,
      CONCAT(COALESCE(p_observaciones, ''), ' | coda_id:', p_coda_id),
      p_fecha_operativa,
      p_hora_inicio,
      p_hora_fin
    )
    ON CONFLICT (id) DO UPDATE SET
      corte_nombre     = COALESCE(EXCLUDED.corte_nombre,     erp.cortes_caja.corte_nombre),
      caja_nombre      = COALESCE(EXCLUDED.caja_nombre,      erp.cortes_caja.caja_nombre),
      estado           = COALESCE(EXCLUDED.estado,           erp.cortes_caja.estado),
      efectivo_contado = COALESCE(EXCLUDED.efectivo_contado, erp.cortes_caja.efectivo_contado),
      cerrado_at       = COALESCE(EXCLUDED.cerrado_at,       erp.cortes_caja.cerrado_at)
    RETURNING * INTO v_result;
  ELSE
    INSERT INTO erp.cortes_caja (
      empresa_id, caja_nombre, corte_nombre, tipo, estado,
      efectivo_inicial, efectivo_contado, observaciones,
      fecha_operativa, abierto_at, cerrado_at
    ) VALUES (
      v_empresa_id, p_caja_nombre,
      COALESCE(p_corte_nombre, 'Corte-' || p_caja_nombre),
      COALESCE(p_tipo, 'normal'),
      p_estado,
      COALESCE(p_efectivo_inicial, 0),
      p_efectivo_contado,
      p_observaciones,
      p_fecha_operativa,
      p_hora_inicio,
      p_hora_fin
    )
    ON CONFLICT (id) DO UPDATE SET
      corte_nombre     = COALESCE(EXCLUDED.corte_nombre,     erp.cortes_caja.corte_nombre),
      estado           = COALESCE(EXCLUDED.estado,           erp.cortes_caja.estado),
      efectivo_contado = COALESCE(EXCLUDED.efectivo_contado, erp.cortes_caja.efectivo_contado),
      cerrado_at       = COALESCE(EXCLUDED.cerrado_at,       erp.cortes_caja.cerrado_at)
    RETURNING * INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

-- ============================================================
-- 7. Update waitry_pedidos.corte_id FK to point to erp.cortes_caja
--    (corte_id is set by the trigger / frontend, currently references rdb.cortes)
-- ============================================================
-- Note: waitry_pedidos.corte_id is just a UUID column, no FK constraint
-- It's populated by matching timestamp ranges. No FK change needed.

-- ============================================================
-- Reload PostgREST schema cache
-- ============================================================
NOTIFY pgrst, 'reload schema';
