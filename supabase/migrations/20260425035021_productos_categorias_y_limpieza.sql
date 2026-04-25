-- ============================================================
-- PR 3a: Catálogo de categorías + normalización tipo/inventariable
-- + vistas enriquecidas para tabla y "última venta por producto".
--
-- Problema reportado por ops:
--   - /rdb/productos mostraba "Tipo" cuando en realidad pintaba el
--     toggle de inventariable, y "Categoría" cuando en realidad pintaba
--     el campo libre `tipo` (producto/servicio/insumo). Mapeo cruzado.
--   - 29 productos con desalineación inventariable↔tipo
--     (12 inventariables marcados como 'servicio',
--      17 no-inventariables marcados como 'producto').
--   - 310/310 productos sin categoría real: la columna categoria_id
--     existía pero sin FK ni catálogo poblado.
--
-- Este migration:
--   1) Crea erp.categorias_producto + RLS + grants + trigger updated_at.
--   2) Agrega FK erp.productos.categoria_id → erp.categorias_producto(id).
--   3) Siembra 12 categorías iniciales para RDB con orden y color.
--   4) Asigna categoría heurísticamente por nombre (best-effort).
--   5) Normaliza tipo↔inventariable (29 filas).
--   6) Crea rdb.v_producto_ultima_venta para resumen de ventas históricas.
--   7) Crea rdb.v_productos_tabla para alimentar la UI con
--      costo, precio, margen, stock y última venta sin N+1 queries.
-- ============================================================

-- 1) Tabla erp.categorias_producto ----------------------------
CREATE TABLE IF NOT EXISTS erp.categorias_producto (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES core.empresas(id),
  nombre      text NOT NULL,
  color       text,                       -- hex (#22c55e, etc.) opcional para badges
  orden       integer NOT NULL DEFAULT 0,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_categorias_producto_empresa
  ON erp.categorias_producto (empresa_id);

-- Trigger updated_at (consistente con erp.producto_receta)
CREATE OR REPLACE FUNCTION erp.fn_set_updated_at_categorias_producto()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_categorias_producto_updated_at ON erp.categorias_producto;
CREATE TRIGGER trg_categorias_producto_updated_at
BEFORE UPDATE ON erp.categorias_producto
FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at_categorias_producto();

-- RLS: empresa-scoped (patrón consistente con erp.producto_receta)
ALTER TABLE erp.categorias_producto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_categorias_producto_select ON erp.categorias_producto;
CREATE POLICY erp_categorias_producto_select ON erp.categorias_producto FOR SELECT TO authenticated
USING ((SELECT core.fn_is_admin()) OR core.fn_has_empresa(empresa_id));

DROP POLICY IF EXISTS erp_categorias_producto_insert ON erp.categorias_producto;
CREATE POLICY erp_categorias_producto_insert ON erp.categorias_producto FOR INSERT TO authenticated
WITH CHECK ((SELECT core.fn_is_admin()) OR core.fn_has_empresa(empresa_id));

DROP POLICY IF EXISTS erp_categorias_producto_update ON erp.categorias_producto;
CREATE POLICY erp_categorias_producto_update ON erp.categorias_producto FOR UPDATE TO authenticated
USING ((SELECT core.fn_is_admin()) OR core.fn_has_empresa(empresa_id));

DROP POLICY IF EXISTS erp_categorias_producto_delete ON erp.categorias_producto;
CREATE POLICY erp_categorias_producto_delete ON erp.categorias_producto FOR DELETE TO authenticated
USING ((SELECT core.fn_is_admin()) OR core.fn_has_empresa(empresa_id));

GRANT ALL ON erp.categorias_producto TO authenticated;
GRANT ALL ON erp.categorias_producto TO service_role;

-- 2) FK desde erp.productos a la nueva tabla -----------------
DO $do$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='erp'
      AND table_name='productos'
      AND constraint_name='productos_categoria_id_fkey'
  ) THEN
    ALTER TABLE erp.productos
      ADD CONSTRAINT productos_categoria_id_fkey
      FOREIGN KEY (categoria_id) REFERENCES erp.categorias_producto(id) ON DELETE SET NULL;
  END IF;
END $do$;

-- 3) Categorías iniciales para RDB ----------------------------
-- Guarded against branch DBs (Supabase preview branches) that don't
-- seed core.empresas. WHERE EXISTS makes the seed a no-op when the
-- RDB empresa row is absent, instead of raising the FK violation that
-- aborts the whole migration. Production has the row, so the seed
-- runs as before.
INSERT INTO erp.categorias_producto (empresa_id, nombre, color, orden)
SELECT v.empresa_id, v.nombre, v.color, v.orden
FROM (
  VALUES
    ('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid,'Cervezas',     '#f59e0b', 10),
    ('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid,'Licores',      '#7c3aed', 20),
    ('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid,'Refrescos',    '#ef4444', 30),
    ('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid,'Aguas',        '#3b82f6', 40),
    ('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid,'Bebidas Prep.','#06b6d4', 50),
    ('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid,'Comida',       '#84cc16', 60),
    ('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid,'Snacks',       '#eab308', 70),
    ('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid,'Cigarros',     '#64748b', 80),
    ('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid,'Servicios',    '#0ea5e9', 90),
    ('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid,'Merchandise',  '#d946ef',100),
    ('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid,'Insumos',      '#94a3b8',110),
    ('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid,'Otros',        '#475569',999)
) AS v(empresa_id, nombre, color, orden)
WHERE EXISTS (SELECT 1 FROM core.empresas e WHERE e.id = v.empresa_id)
ON CONFLICT (empresa_id, nombre) DO NOTHING;

-- 4) Asignación heurística (best-effort) ----------------------
-- Paréntesis explícitos para mantener claras las precedencias AND/OR.
-- La UI permitirá recategorizar en bulk en una iteración futura;
-- "Otros" recoge todo lo no clasificado (revisable por ops).
DO $cat$
DECLARE
  v_emp UUID := 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid;
  v_cervezas      UUID;
  v_licores       UUID;
  v_refrescos     UUID;
  v_aguas         UUID;
  v_bebidas_prep  UUID;
  v_comida        UUID;
  v_snacks        UUID;
  v_cigarros      UUID;
  v_servicios     UUID;
  v_merch         UUID;
  v_insumos       UUID;
  v_otros         UUID;
BEGIN
  SELECT id INTO v_cervezas     FROM erp.categorias_producto WHERE empresa_id=v_emp AND nombre='Cervezas';
  SELECT id INTO v_licores      FROM erp.categorias_producto WHERE empresa_id=v_emp AND nombre='Licores';
  SELECT id INTO v_refrescos    FROM erp.categorias_producto WHERE empresa_id=v_emp AND nombre='Refrescos';
  SELECT id INTO v_aguas        FROM erp.categorias_producto WHERE empresa_id=v_emp AND nombre='Aguas';
  SELECT id INTO v_bebidas_prep FROM erp.categorias_producto WHERE empresa_id=v_emp AND nombre='Bebidas Prep.';
  SELECT id INTO v_comida       FROM erp.categorias_producto WHERE empresa_id=v_emp AND nombre='Comida';
  SELECT id INTO v_snacks       FROM erp.categorias_producto WHERE empresa_id=v_emp AND nombre='Snacks';
  SELECT id INTO v_cigarros     FROM erp.categorias_producto WHERE empresa_id=v_emp AND nombre='Cigarros';
  SELECT id INTO v_servicios    FROM erp.categorias_producto WHERE empresa_id=v_emp AND nombre='Servicios';
  SELECT id INTO v_merch        FROM erp.categorias_producto WHERE empresa_id=v_emp AND nombre='Merchandise';
  SELECT id INTO v_insumos      FROM erp.categorias_producto WHERE empresa_id=v_emp AND nombre='Insumos';
  SELECT id INTO v_otros        FROM erp.categorias_producto WHERE empresa_id=v_emp AND nombre='Otros';

  -- Cervezas
  UPDATE erp.productos SET categoria_id = v_cervezas
  WHERE empresa_id=v_emp AND categoria_id IS NULL AND deleted_at IS NULL
    AND (
         nombre ILIKE '%cerveza%'        OR nombre ILIKE '%caguamita%'
      OR nombre ILIKE '%amstel%'         OR nombre ILIKE '%bohemia%'
      OR nombre ILIKE '%xx lager%'       OR nombre ILIKE '%tecate%'
      OR nombre ILIKE '%carta blanca%'   OR nombre ILIKE '%modelo%'
      OR nombre ILIKE '%heineken%'       OR nombre ILIKE '%corona%'
      OR nombre ILIKE '%indio%'          OR nombre ILIKE '%victoria%'
    );

  -- Licores
  UPDATE erp.productos SET categoria_id = v_licores
  WHERE empresa_id=v_emp AND categoria_id IS NULL AND deleted_at IS NULL
    AND (
         nombre ILIKE '%bacardi%'         OR nombre ILIKE '%don julio%'
      OR nombre ILIKE '%maestro dobel%'   OR nombre ILIKE '%tequila%'
      OR nombre ILIKE '%whiskey%'         OR nombre ILIKE '%capit_n morgan%'
      OR nombre ILIKE '%vodka%'           OR nombre ILIKE '%absolut%'
      OR nombre ILIKE '%traditional%'     OR nombre ILIKE '%etiqueta negra%'
      OR nombre ILIKE '%etiqueta roja%'   OR nombre ILIKE '%1800%'
      OR nombre ILIKE '%campechano%'      OR nombre ILIKE '%divorciado%'
      OR nombre ILIKE '%pintado%'
      OR (nombre ILIKE '%preparado%' AND nombre NOT ILIKE '%agua%')
    );

  -- Refrescos
  UPDATE erp.productos SET categoria_id = v_refrescos
  WHERE empresa_id=v_emp AND categoria_id IS NULL AND deleted_at IS NULL
    AND (
         nombre ILIKE '%coca cola%'  OR nombre ILIKE '%manzanita%'
      OR nombre ILIKE '%fanta%'      OR nombre ILIKE '%mundet%'
      OR nombre ILIKE '%refresco%'   OR nombre ILIKE '%sprite%'
      OR nombre ILIKE '%fresca%'     OR nombre ILIKE '%pepsi%'
    );

  -- Aguas (mineral, embotellada)
  UPDATE erp.productos SET categoria_id = v_aguas
  WHERE empresa_id=v_emp AND categoria_id IS NULL AND deleted_at IS NULL
    AND (
         nombre ILIKE '%agua%'        OR nombre ILIKE '%topo chico%'
      OR nombre ILIKE '%topochico%'   OR nombre ILIKE '%peñafiel%'
      OR nombre ILIKE '%tehuacan%'
    );

  -- Bebidas preparadas / hidratantes / café
  UPDATE erp.productos SET categoria_id = v_bebidas_prep
  WHERE empresa_id=v_emp AND categoria_id IS NULL AND deleted_at IS NULL
    AND (
         nombre ILIKE '%electrolit%'    OR nombre ILIKE '%electrolife%'
      OR nombre ILIKE '%powerade%'      OR nombre ILIKE '%gatorade%'
      OR nombre ILIKE '%flashlyte%'     OR nombre ILIKE '%celsius%'
      OR nombre ILIKE '%michelada%'     OR nombre ILIKE '%chelada%'
      OR nombre ILIKE '%clamato%'       OR nombre ILIKE '%cafe%'
      OR nombre ILIKE '%capuchino%'     OR nombre ILIKE '%carajillo%'
      OR nombre ILIKE '%pink chai%'
    );

  -- Cigarros
  UPDATE erp.productos SET categoria_id = v_cigarros
  WHERE empresa_id=v_emp AND categoria_id IS NULL AND deleted_at IS NULL
    AND (
         nombre ILIKE '%malboro%' OR nombre ILIKE '%marlboro%'
      OR nombre ILIKE '%cigarro%'
    );

  -- Comida (productos preparados, platos)
  UPDATE erp.productos SET categoria_id = v_comida
  WHERE empresa_id=v_emp AND categoria_id IS NULL AND deleted_at IS NULL
    AND (
         nombre ILIKE '%hot dog%'       OR nombre ILIKE '%gringa%'
      OR nombre ILIKE '%papas%'         OR nombre ILIKE '%papirringas%'
      OR nombre ILIKE '%burrito%'       OR nombre ILIKE '%hamburguesa%'
      OR nombre ILIKE '%torta%'         OR nombre ILIKE '%pizza%'
      OR nombre ILIKE '%nachos%'        OR nombre ILIKE '%jicama%'
    );

  -- Snacks (frituras, dulces, galletas, carnes secas)
  UPDATE erp.productos SET categoria_id = v_snacks
  WHERE empresa_id=v_emp AND categoria_id IS NULL AND deleted_at IS NULL
    AND (
         nombre ILIKE '%sabritas%'      OR nombre ILIKE '%tostitos%'
      OR nombre ILIKE '%cacahuate%'     OR nombre ILIKE '%galleta%'
      OR nombre ILIKE '%chokis%'        OR nombre ILIKE '%bubulubu%'
      OR nombre ILIKE '%barrita%'       OR nombre ILIKE '%carne seca%'
      OR nombre ILIKE '%banderilla%'    OR nombre ILIKE '%palomit%'
      OR nombre ILIKE '%dulce%'         OR nombre ILIKE '%chocolate%'
    );

  -- Servicios (rentas, clases, propinas, academias, torneos)
  UPDATE erp.productos SET categoria_id = v_servicios
  WHERE empresa_id=v_emp AND categoria_id IS NULL AND deleted_at IS NULL
    AND (
         nombre ILIKE '%renta%'       OR nombre ILIKE '%clase%'
      OR nombre ILIKE '%academia%'    OR nombre ILIKE '%propina%'
      OR nombre ILIKE '%torneo%'      OR nombre ILIKE '%uso cancha%'
      OR nombre ILIKE '%coach%'
    );

  -- Merchandise (cachuchas, palas, accesorios)
  UPDATE erp.productos SET categoria_id = v_merch
  WHERE empresa_id=v_emp AND categoria_id IS NULL AND deleted_at IS NULL
    AND (
         nombre ILIKE '%cachucha%'    OR nombre ILIKE '%toalla%'
      OR nombre ILIKE '%pelota%'      OR nombre ILIKE '%pala%'
      OR nombre ILIKE '%palbea%'      OR nombre ILIKE '%overgrip%'
      OR nombre ILIKE '%orejera%'     OR nombre ILIKE '%faja%'
    );

  -- Insumos (bolsas, hielo, materiales operativos)
  UPDATE erp.productos SET categoria_id = v_insumos
  WHERE empresa_id=v_emp AND categoria_id IS NULL AND deleted_at IS NULL
    AND (
         nombre ILIKE '%bolsa%'       OR nombre ILIKE '%hielo%'
      OR nombre ILIKE '%air wick%'
      OR (nombre ILIKE '%vaso%' AND nombre NOT ILIKE '%vaso con hielo%')
    );

  -- Resto → Otros
  UPDATE erp.productos SET categoria_id = v_otros
  WHERE empresa_id=v_emp AND categoria_id IS NULL AND deleted_at IS NULL;
END $cat$;

-- 5) Normalización tipo↔inventariable ------------------------
-- Si inventariable=true y tipo='servicio' → tipo='producto'.
UPDATE erp.productos SET tipo = 'producto', updated_at = now()
WHERE empresa_id='e52ac307-9373-4115-b65e-1178f0c4e1aa'
  AND inventariable = true AND tipo = 'servicio' AND deleted_at IS NULL;

-- Si inventariable=false y tipo='producto' → tipo='servicio'.
UPDATE erp.productos SET tipo = 'servicio', updated_at = now()
WHERE empresa_id='e52ac307-9373-4115-b65e-1178f0c4e1aa'
  AND inventariable = false AND tipo = 'producto' AND deleted_at IS NULL;

-- 6) Vista "última venta por producto" -----------------------
-- Match por código (waitry_productos.product_id es text, igual que productos.codigo).
CREATE OR REPLACE VIEW rdb.v_producto_ultima_venta AS
SELECT
  p.id AS producto_id,
  MAX(wp.created_at) AS ultima_venta_at,
  COUNT(wp.id)::bigint AS total_ventas,
  COALESCE(SUM(wp.quantity), 0)::numeric AS total_unidades_vendidas,
  COALESCE(SUM(wp.total_price), 0)::numeric AS total_importe_vendido
FROM erp.productos p
LEFT JOIN rdb.waitry_productos wp ON wp.product_id = p.codigo
WHERE p.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'
  AND p.deleted_at IS NULL
GROUP BY p.id;

GRANT SELECT ON rdb.v_producto_ultima_venta TO authenticated;
GRANT SELECT ON rdb.v_producto_ultima_venta TO service_role;

-- 7) Vista enriquecida para tabla UI -------------------------
-- SUM en stock por seguridad (hoy hay 1 almacén, future-proof).
CREATE OR REPLACE VIEW rdb.v_productos_tabla AS
SELECT
  p.id,
  p.codigo,
  p.nombre,
  p.descripcion,
  p.tipo,
  p.unidad,
  p.activo,
  p.inventariable,
  p.created_at,
  p.updated_at,
  c.id      AS categoria_id,
  c.nombre  AS categoria_nombre,
  c.color   AS categoria_color,
  pp.costo        AS ultimo_costo,
  pp.precio_venta AS ultimo_precio_venta,
  CASE
    WHEN pp.precio_venta IS NULL OR pp.precio_venta = 0 THEN NULL
    ELSE ROUND(((pp.precio_venta - COALESCE(pp.costo, 0)) / pp.precio_venta * 100)::numeric, 1)
  END AS margen_pct,
  COALESCE(stk.cantidad_total, 0) AS stock_actual,
  uv.ultima_venta_at,
  COALESCE(uv.total_unidades_vendidas, 0) AS total_unidades_vendidas
FROM erp.productos p
LEFT JOIN erp.categorias_producto c ON c.id = p.categoria_id
LEFT JOIN erp.productos_precios pp  ON pp.producto_id = p.id AND pp.vigente = true
LEFT JOIN (
  SELECT producto_id, SUM(cantidad)::numeric AS cantidad_total
  FROM erp.inventario
  GROUP BY producto_id
) stk ON stk.producto_id = p.id
LEFT JOIN rdb.v_producto_ultima_venta uv ON uv.producto_id = p.id
WHERE p.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'
  AND p.deleted_at IS NULL;

GRANT SELECT ON rdb.v_productos_tabla TO authenticated;
GRANT SELECT ON rdb.v_productos_tabla TO service_role;
