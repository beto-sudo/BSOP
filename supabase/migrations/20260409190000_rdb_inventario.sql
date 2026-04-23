-- EDITED 2026-04-23 (drift-1.5): rdb.productos / inventario_movimientos /
-- ordenes_compra / cortes / waitry_* are ambient pre-migration objects.
-- ============================================================
-- Módulo de Inventario RDB
-- ============================================================

DO $do$
BEGIN
  IF to_regclass('rdb.productos') IS NULL
     OR to_regclass('rdb.inventario_movimientos') IS NULL
     OR to_regclass('rdb.ordenes_compra') IS NULL
     OR to_regclass('rdb.cortes') IS NULL THEN
    RETURN;
  END IF;

  -- 1. Agregar columnas a productos
  ALTER TABLE rdb.productos
    ADD COLUMN IF NOT EXISTS factor_consumo NUMERIC(8,4) NOT NULL DEFAULT 1.0,
    ADD COLUMN IF NOT EXISTS costo_unitario NUMERIC(12,2) DEFAULT NULL;

  UPDATE rdb.productos
  SET costo_unitario = ultimo_costo
  WHERE costo_unitario IS NULL AND ultimo_costo IS NOT NULL;

  COMMENT ON COLUMN rdb.productos.factor_consumo IS
    'Fracción del padre que consume este producto al venderse. Ej: copa = 0.10, media botella = 0.5, pieza = 1.0';

  -- 2. Extender inventario_movimientos
  ALTER TABLE rdb.inventario_movimientos
    ADD COLUMN IF NOT EXISTS fecha         TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS oc_id         UUID REFERENCES rdb.ordenes_compra(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS corte_id      UUID REFERENCES rdb.cortes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS registrado_por TEXT;

  UPDATE rdb.inventario_movimientos SET fecha = created_at WHERE fecha IS NULL;

  ALTER TABLE rdb.inventario_movimientos
    DROP CONSTRAINT IF EXISTS inventario_movimientos_tipo_check;

  ALTER TABLE rdb.inventario_movimientos
    ADD CONSTRAINT inventario_movimientos_tipo_check
    CHECK (tipo IN ('entrada','ajuste_positivo','ajuste_negativo','ajuste','merma','inventario_inicial','salida'));

  CREATE INDEX IF NOT EXISTS rdb_inv_mov_fecha_idx    ON rdb.inventario_movimientos (fecha DESC);
  CREATE INDEX IF NOT EXISTS rdb_inv_mov_producto_idx ON rdb.inventario_movimientos (producto_id);

  GRANT SELECT, INSERT, UPDATE ON rdb.inventario_movimientos TO service_role, authenticated;

  -- 3. Vista de stock calculado
  IF to_regclass('rdb.waitry_pedidos') IS NOT NULL
     AND to_regclass('rdb.waitry_productos') IS NOT NULL THEN
    DROP VIEW IF EXISTS rdb.v_inventario_stock;

    EXECUTE $sql$
      CREATE VIEW rdb.v_inventario_stock AS
      WITH
      movimientos_agg AS (
        SELECT
          producto_id,
          SUM(CASE WHEN tipo IN ('entrada','inventario_inicial','ajuste_positivo') THEN cantidad ELSE 0 END) AS total_entradas,
          SUM(CASE WHEN tipo IN ('merma','ajuste_negativo','salida')               THEN cantidad ELSE 0 END) AS total_salidas_manuales,
          SUM(CASE WHEN tipo = 'ajuste'                                            THEN 0 ELSE 0 END)         AS _ajuste_legacy
        FROM rdb.inventario_movimientos
        GROUP BY producto_id
      ),
      ventas_agg AS (
        SELECT
          COALESCE(p.parent_id, p.id) AS padre_id,
          SUM(wp.quantity * p.factor_consumo) AS total_consumido
        FROM rdb.waitry_productos wp
        JOIN rdb.waitry_pedidos ped ON ped.order_id = wp.order_id
        JOIN rdb.productos p        ON p.waitry_item_id::text = wp.product_id
        WHERE ped.status != 'order_canceled'
        GROUP BY COALESCE(p.parent_id, p.id)
      )
      SELECT
        p.id,
        p.nombre,
        p.categoria,
        p.unidad,
        p.inventariable,
        p.costo_unitario,
        p.ultimo_costo,
        p.stock_minimo,
        p.factor_consumo,
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
          * COALESCE(p.costo_unitario, p.ultimo_costo, 0), 2
        )                                                             AS valor_inventario,
        CASE
          WHEN p.stock_minimo IS NOT NULL AND p.stock_minimo > 0
           AND (COALESCE(m.total_entradas, 0)
                - COALESCE(v.total_consumido, 0)
                - COALESCE(m.total_salidas_manuales, 0)) <= p.stock_minimo
          THEN true ELSE false
        END                                                           AS bajo_minimo
      FROM rdb.productos p
      LEFT JOIN movimientos_agg m ON m.producto_id = p.id
      LEFT JOIN ventas_agg      v ON v.padre_id    = p.id
      WHERE p.inventariable = true
        AND p.parent_id IS NULL
        AND p.activo = true
    $sql$;

    GRANT SELECT ON rdb.v_inventario_stock TO anon, authenticated, service_role;
  END IF;

  -- 4. Vista de grupos de productos
  DROP VIEW IF EXISTS rdb.v_productos_grupo;

  EXECUTE $sql$
    CREATE VIEW rdb.v_productos_grupo AS
    SELECT
      p.id             AS padre_id,
      p.nombre         AS padre_nombre,
      p.categoria,
      p.costo_unitario,
      p.unidad,
      COUNT(h.id)      AS total_hijos,
      jsonb_agg(
        jsonb_build_object(
          'id', h.id,
          'nombre', h.nombre,
          'factor_consumo', h.factor_consumo,
          'precio', h.precio
        ) ORDER BY h.nombre
      ) FILTER (WHERE h.id IS NOT NULL) AS hijos
    FROM rdb.productos p
    LEFT JOIN rdb.productos h ON h.parent_id = p.id
    WHERE p.parent_id IS NULL AND p.activo = true
    GROUP BY p.id, p.nombre, p.categoria, p.costo_unitario, p.unidad
  $sql$;

  GRANT SELECT ON rdb.v_productos_grupo TO anon, authenticated, service_role;
END $do$;
