-- ============================================================
-- HANDOFF a proyecto Supabase (versión revisada 2026-04-25)
-- Tomar este archivo, renombrarlo como
--   supabase/migrations/<TIMESTAMP>_erp_inventario_levantamientos.sql
-- aplicarlo en main, regenerar SCHEMA_REF.md y types/supabase.ts.
--
-- Ver diseño completo en docs/inventario-levantamiento-plan.md
--
-- DECISIONES claves implementadas en este SQL:
--   D1 — "Captura a ciegas" garantizada DB: RLS niega SELECT directo a la tabla
--        de líneas para todos excepto admin. UI consume vía RPCs.
--   D2 — Race contra Waitry resuelta: al cerrar captura se calcula
--        salidas_durante_captura y stock_efectivo. Diferencia se computa
--        contra stock_efectivo, no contra snapshot inicial.
--   D3 — Solo 4 estados visibles: borrador → capturando → capturado → aplicado.
--        Las firmas son filas; trigger AFTER INSERT en firmas auto-aplica el
--        levantamiento cuando llega la última firma requerida.
--   D4 — Stock mínimo: usa la columna existente erp.inventario.cantidad_minima.
--        Esta migración NO cambia rdb.v_inventario_stock — eso es trabajo aparte
--        del consumidor (sub-PR independiente).
--   D5 — Folio LEV-{año}-{NNNN} por trigger atómico con advisory lock.
--   D6 — Costo congelado en línea desde erp.productos_precios (vigente=true)
--        al iniciar captura.
--   D7 — Categoría desde erp.categorias_producto vía LEFT JOIN
--        (FK productos.categoria_id → categorias_producto.id, aplicada en PR-3a).
--   D8 — firmante_nombre = COALESCE(first_name, email). core.usuarios no tiene
--        last_name.
--
-- VERIFICADO contra SCHEMA_REF.md columna por columna:
--   core.empresas, core.usuarios (sin last_name),
--   erp.almacenes, erp.productos (categoria_id sin tabla destino, usar tipo),
--   erp.productos_precios (costo, vigente), erp.inventario (cantidad_minima),
--   erp.movimientos_inventario, core.fn_has_empresa, core.fn_is_admin.
-- ============================================================


-- ============================================================
-- 1) Configuración por empresa (jsonb extensible)
-- ============================================================
ALTER TABLE core.empresas
  ADD COLUMN IF NOT EXISTS config_inventario jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN core.empresas.config_inventario IS
  'Configuración de inventario por empresa. Keys esperadas:
   tolerancia_pct (numeric, default 5.0)
   tolerancia_monto (numeric, default 500)
   firmas_requeridas (int 1|2|3, default 3)
   rol_default_revisor_id (uuid, opcional)
   rol_default_autorizador_id (uuid, opcional)';

CREATE OR REPLACE FUNCTION erp.fn_get_empresa_tolerancia(p_empresa_id uuid)
RETURNS TABLE(tolerancia_pct numeric, tolerancia_monto numeric, firmas_requeridas int)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = core, pg_catalog AS $$
  SELECT
    COALESCE((config_inventario->>'tolerancia_pct')::numeric, 5.0),
    COALESCE((config_inventario->>'tolerancia_monto')::numeric, 500.0),
    COALESCE((config_inventario->>'firmas_requeridas')::int, 3)
  FROM core.empresas
  WHERE id = p_empresa_id;
$$;


-- ============================================================
-- 2) Tabla header — erp.inventario_levantamientos
-- ============================================================
CREATE TABLE IF NOT EXISTS erp.inventario_levantamientos (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id               uuid NOT NULL REFERENCES core.empresas(id),
  almacen_id               uuid NOT NULL REFERENCES erp.almacenes(id),
  folio                    text,                                   -- llenado por trigger
  tipo                     text NOT NULL DEFAULT 'total'
                             CHECK (tipo IN ('total','parcial','spot')),
  estado                   text NOT NULL DEFAULT 'borrador'
                             CHECK (estado IN ('borrador','capturando','capturado','aplicado','cancelado')),
  fecha_programada         date NOT NULL DEFAULT CURRENT_DATE,
  fecha_inicio             timestamptz,
  fecha_cierre             timestamptz,
  fecha_aplicado           timestamptz,
  fecha_cancelado          timestamptz,
  contador_id              uuid REFERENCES core.usuarios(id),
  tolerancia_pct_override  numeric(5,2),
  tolerancia_monto_override numeric(12,2),
  notas                    text,
  motivo_cancelacion       text,
  created_by               uuid REFERENCES core.usuarios(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  deleted_at               timestamptz,
  UNIQUE (empresa_id, folio)
);

CREATE INDEX IF NOT EXISTS idx_inv_lev_empresa_almacen
  ON erp.inventario_levantamientos (empresa_id, almacen_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inv_lev_estado
  ON erp.inventario_levantamientos (empresa_id, estado) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inv_lev_fecha
  ON erp.inventario_levantamientos (empresa_id, fecha_programada DESC);

-- Solo un levantamiento abierto por almacén
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_lev_almacen_abierto
  ON erp.inventario_levantamientos (almacen_id)
  WHERE estado IN ('borrador','capturando','capturado')
    AND deleted_at IS NULL;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION erp.fn_set_updated_at_inventario_levantamientos()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_inventario_levantamientos_updated_at ON erp.inventario_levantamientos;
CREATE TRIGGER trg_inventario_levantamientos_updated_at
BEFORE UPDATE ON erp.inventario_levantamientos
FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at_inventario_levantamientos();

-- Trigger de folio automático: LEV-{año}-{NNNN} por (empresa, año)
CREATE OR REPLACE FUNCTION erp.fn_assign_folio_inventario_levantamientos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = erp, pg_catalog AS $$
DECLARE
  v_year int;
  v_next int;
  v_lock_key bigint;
BEGIN
  IF NEW.folio IS NOT NULL AND NEW.folio <> '' THEN
    RETURN NEW;
  END IF;

  v_year := EXTRACT(YEAR FROM NEW.fecha_programada);
  -- Advisory lock por (empresa, año) para evitar race en el consecutivo
  v_lock_key := ('x' || substr(md5(NEW.empresa_id::text || '-' || v_year::text), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(
           CAST(NULLIF(regexp_replace(folio, '^LEV-' || v_year || '-', ''), '') AS int)
         ), 0) + 1
    INTO v_next
  FROM erp.inventario_levantamientos
  WHERE empresa_id = NEW.empresa_id
    AND folio LIKE 'LEV-' || v_year || '-%';

  NEW.folio := 'LEV-' || v_year || '-' || lpad(v_next::text, 4, '0');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_inv_lev_folio ON erp.inventario_levantamientos;
CREATE TRIGGER trg_inv_lev_folio
BEFORE INSERT ON erp.inventario_levantamientos
FOR EACH ROW EXECUTE FUNCTION erp.fn_assign_folio_inventario_levantamientos();


-- ============================================================
-- 3) Tabla detalle — erp.inventario_levantamiento_lineas
-- ============================================================
CREATE TABLE IF NOT EXISTS erp.inventario_levantamiento_lineas (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                uuid NOT NULL REFERENCES core.empresas(id),
  levantamiento_id          uuid NOT NULL REFERENCES erp.inventario_levantamientos(id) ON DELETE CASCADE,
  producto_id               uuid NOT NULL REFERENCES erp.productos(id),
  -- Snapshot al INICIAR captura (congelado):
  stock_inicial             numeric(14,4) NOT NULL,
  costo_unitario            numeric(14,4),                          -- de productos_precios.costo vigente
  -- Recalculados al CERRAR captura:
  salidas_durante_captura   numeric(14,4) NOT NULL DEFAULT 0,
  stock_efectivo            numeric(14,4),                          -- = stock_inicial - salidas_durante_captura
  -- Captura del contador:
  cantidad_contada          numeric(14,4),                          -- NULL = sin contar
  contado_por               uuid REFERENCES core.usuarios(id),
  contado_at                timestamptz,
  recontada                 boolean NOT NULL DEFAULT false,
  -- Diferencia (calculada al cerrar, NO generated — depende de stock_efectivo que se calcula al cerrar):
  diferencia                numeric(14,4),
  diferencia_valor          numeric(14,2),
  fuera_de_tolerancia       boolean NOT NULL DEFAULT false,
  notas_diferencia          text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (levantamiento_id, producto_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_lev_lin_lev
  ON erp.inventario_levantamiento_lineas (levantamiento_id);
CREATE INDEX IF NOT EXISTS idx_inv_lev_lin_pendientes
  ON erp.inventario_levantamiento_lineas (levantamiento_id)
  WHERE cantidad_contada IS NULL;
CREATE INDEX IF NOT EXISTS idx_inv_lev_lin_fuera_tol
  ON erp.inventario_levantamiento_lineas (levantamiento_id)
  WHERE fuera_de_tolerancia = true;

CREATE OR REPLACE FUNCTION erp.fn_set_updated_at_inv_lev_lineas()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_inv_lev_lineas_updated_at ON erp.inventario_levantamiento_lineas;
CREATE TRIGGER trg_inv_lev_lineas_updated_at
BEFORE UPDATE ON erp.inventario_levantamiento_lineas
FOR EACH ROW EXECUTE FUNCTION erp.fn_set_updated_at_inv_lev_lineas();


-- ============================================================
-- 4) Tabla firmas — erp.inventario_levantamiento_firmas
-- ============================================================
CREATE TABLE IF NOT EXISTS erp.inventario_levantamiento_firmas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL REFERENCES core.empresas(id),
  levantamiento_id    uuid NOT NULL REFERENCES erp.inventario_levantamientos(id) ON DELETE CASCADE,
  paso                int  NOT NULL CHECK (paso BETWEEN 1 AND 3),
  rol                 text NOT NULL CHECK (rol IN ('contador','revisor','autorizador')),
  firmante_id         uuid NOT NULL REFERENCES core.usuarios(id),
  firmante_nombre     text NOT NULL,                                -- snapshot: first_name o email
  firmado_at          timestamptz NOT NULL DEFAULT now(),
  comentario          text,
  -- Snapshot inmutable al firmar (auditoría):
  total_lineas        int NOT NULL,
  total_diferencia    numeric(14,2),
  total_lineas_fuera  int NOT NULL,
  ip                  inet,
  user_agent          text,
  UNIQUE (levantamiento_id, paso)
);

CREATE INDEX IF NOT EXISTS idx_inv_lev_firmas_lev
  ON erp.inventario_levantamiento_firmas (levantamiento_id);


-- ============================================================
-- 5) Funciones de transición (todas SECURITY DEFINER para que las
--    RLS no bloqueen acceso a la tabla de líneas)
-- ============================================================

-- 5.1 Iniciar captura: borrador → capturando, siembra líneas con snapshot
CREATE OR REPLACE FUNCTION erp.fn_iniciar_captura_levantamiento(p_levantamiento_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, core, pg_catalog AS $$
DECLARE
  v_estado     text;
  v_empresa_id uuid;
  v_almacen_id uuid;
  v_count      int;
BEGIN
  SELECT estado, empresa_id, almacen_id
    INTO v_estado, v_empresa_id, v_almacen_id
  FROM erp.inventario_levantamientos
  WHERE id = p_levantamiento_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Levantamiento % no existe', p_levantamiento_id;
  END IF;
  IF v_estado <> 'borrador' THEN
    RAISE EXCEPTION 'Levantamiento % no puede iniciarse desde estado %', p_levantamiento_id, v_estado;
  END IF;
  IF NOT (core.fn_has_empresa(v_empresa_id) OR core.fn_is_admin()) THEN
    RAISE EXCEPTION 'Sin permiso para empresa %', v_empresa_id;
  END IF;

  -- Auto-asignar contador al usuario actual si no estaba seteado.
  UPDATE erp.inventario_levantamientos
     SET contador_id = COALESCE(contador_id, auth.uid()),
         estado = 'capturando',
         fecha_inicio = now()
   WHERE id = p_levantamiento_id;

  -- Sembrar líneas desde erp.inventario para productos inventariables/activos del almacén.
  -- Costo: productos_precios.costo con vigente=true (fuente canónica, igual que rdb.v_inventario_stock).
  INSERT INTO erp.inventario_levantamiento_lineas
    (empresa_id, levantamiento_id, producto_id, stock_inicial, costo_unitario)
  SELECT
    v_empresa_id,
    p_levantamiento_id,
    inv.producto_id,
    inv.cantidad,
    pp.costo
  FROM erp.inventario inv
  JOIN erp.productos p
    ON p.id = inv.producto_id AND p.empresa_id = v_empresa_id
  LEFT JOIN erp.productos_precios pp
    ON pp.producto_id = p.id AND pp.vigente = true
  WHERE inv.empresa_id = v_empresa_id
    AND inv.almacen_id = v_almacen_id
    AND COALESCE(p.inventariable, true) = true
    AND COALESCE(p.activo, true) = true
    AND p.deleted_at IS NULL
    AND p.parent_id IS NULL;       -- solo padres, no SKUs hijos (consistente con rdb.v_inventario_stock)

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;


-- 5.2 Cerrar captura: capturando → capturado
--   - Calcula salidas_durante_captura y stock_efectivo por línea
--   - Marca diferencia y fuera_de_tolerancia
CREATE OR REPLACE FUNCTION erp.fn_cerrar_captura_levantamiento(p_levantamiento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, core, pg_catalog AS $$
DECLARE
  v_estado       text;
  v_empresa_id   uuid;
  v_almacen_id   uuid;
  v_inicio       timestamptz;
  v_pct          numeric;
  v_monto        numeric;
  v_pct_override numeric;
  v_monto_override numeric;
BEGIN
  SELECT estado, empresa_id, almacen_id, fecha_inicio,
         tolerancia_pct_override, tolerancia_monto_override
    INTO v_estado, v_empresa_id, v_almacen_id, v_inicio,
         v_pct_override, v_monto_override
  FROM erp.inventario_levantamientos
  WHERE id = p_levantamiento_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Levantamiento % no existe', p_levantamiento_id;
  END IF;
  IF v_estado <> 'capturando' THEN
    RAISE EXCEPTION 'Levantamiento % no puede cerrarse desde estado %', p_levantamiento_id, v_estado;
  END IF;
  IF NOT (core.fn_has_empresa(v_empresa_id) OR core.fn_is_admin()) THEN
    RAISE EXCEPTION 'Sin permiso para empresa %', v_empresa_id;
  END IF;

  -- Resolver tolerancias efectivas (override de levantamiento → config empresa → defaults)
  SELECT
    COALESCE(v_pct_override,   t.tolerancia_pct),
    COALESCE(v_monto_override, t.tolerancia_monto)
    INTO v_pct, v_monto
  FROM erp.fn_get_empresa_tolerancia(v_empresa_id) t;

  -- Calcular salidas_durante_captura por línea
  WITH salidas AS (
    SELECT
      m.producto_id,
      SUM(
        CASE
          -- 'salida' cubre ventas Waitry, mermas y consumo interno
          -- (verificado: el trigger fn_trg_waitry_to_movimientos inserta tipo='salida'
          --  con referencia_tipo='venta_waitry'). 'devolucion' aumenta stock — no incluir.
          WHEN m.tipo_movimiento = 'salida'
            OR (m.tipo_movimiento = 'ajuste' AND m.cantidad < 0)
          THEN ABS(m.cantidad)
          ELSE 0
        END
      ) AS total
    FROM erp.movimientos_inventario m
    WHERE m.empresa_id = v_empresa_id
      AND m.almacen_id = v_almacen_id
      AND m.created_at >= v_inicio
      AND m.created_at <= now()
      AND m.referencia_tipo IS DISTINCT FROM 'levantamiento_fisico'  -- ignorar nuestros propios ajustes si los hubiera
    GROUP BY m.producto_id
  )
  UPDATE erp.inventario_levantamiento_lineas l
     SET salidas_durante_captura = COALESCE(s.total, 0),
         stock_efectivo          = l.stock_inicial - COALESCE(s.total, 0),
         diferencia              = CASE
           WHEN l.cantidad_contada IS NULL THEN NULL
           ELSE l.cantidad_contada - (l.stock_inicial - COALESCE(s.total, 0))
         END,
         diferencia_valor        = CASE
           WHEN l.cantidad_contada IS NULL OR l.costo_unitario IS NULL THEN NULL
           ELSE (l.cantidad_contada - (l.stock_inicial - COALESCE(s.total, 0))) * l.costo_unitario
         END,
         fuera_de_tolerancia     = (
           l.cantidad_contada IS NOT NULL
           AND ABS(l.cantidad_contada - (l.stock_inicial - COALESCE(s.total, 0))) > 0
           AND (
             ABS(l.cantidad_contada - (l.stock_inicial - COALESCE(s.total, 0)))
               / GREATEST(l.stock_inicial - COALESCE(s.total, 0), 1) > v_pct/100.0
             OR (
               l.costo_unitario IS NOT NULL
               AND ABS((l.cantidad_contada - (l.stock_inicial - COALESCE(s.total, 0))) * l.costo_unitario) > v_monto
             )
           )
         )
   FROM (SELECT producto_id, total FROM salidas) s
   WHERE l.levantamiento_id = p_levantamiento_id
     AND s.producto_id = l.producto_id;

  -- Líneas que NO tuvieron salidas durante captura: stock_efectivo = stock_inicial
  UPDATE erp.inventario_levantamiento_lineas l
     SET stock_efectivo = l.stock_inicial,
         salidas_durante_captura = 0,
         diferencia = CASE
           WHEN l.cantidad_contada IS NULL THEN NULL
           ELSE l.cantidad_contada - l.stock_inicial
         END,
         diferencia_valor = CASE
           WHEN l.cantidad_contada IS NULL OR l.costo_unitario IS NULL THEN NULL
           ELSE (l.cantidad_contada - l.stock_inicial) * l.costo_unitario
         END,
         fuera_de_tolerancia = (
           l.cantidad_contada IS NOT NULL
           AND ABS(l.cantidad_contada - l.stock_inicial) > 0
           AND (
             ABS(l.cantidad_contada - l.stock_inicial) / GREATEST(l.stock_inicial, 1) > v_pct/100.0
             OR (l.costo_unitario IS NOT NULL
                 AND ABS((l.cantidad_contada - l.stock_inicial) * l.costo_unitario) > v_monto)
           )
         )
   WHERE l.levantamiento_id = p_levantamiento_id
     AND l.stock_efectivo IS NULL;

  UPDATE erp.inventario_levantamientos
     SET estado = 'capturado',
         fecha_cierre = now()
   WHERE id = p_levantamiento_id;
END $$;


-- 5.3 Aplicar levantamiento: capturado → aplicado, genera movimientos_inventario
--   Se llama indirectamente desde el trigger AFTER INSERT en firmas cuando llega
--   la última firma requerida. También exposed para admin override.
CREATE OR REPLACE FUNCTION erp.fn_aplicar_levantamiento(p_levantamiento_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, core, pg_catalog AS $$
DECLARE
  v_estado     text;
  v_empresa_id uuid;
  v_almacen_id uuid;
  v_folio      text;
  v_count      int;
BEGIN
  SELECT estado, empresa_id, almacen_id, folio
    INTO v_estado, v_empresa_id, v_almacen_id, v_folio
  FROM erp.inventario_levantamientos
  WHERE id = p_levantamiento_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Levantamiento % no existe', p_levantamiento_id;
  END IF;
  IF v_estado <> 'capturado' THEN
    RAISE EXCEPTION 'Levantamiento % no puede aplicarse desde estado %', p_levantamiento_id, v_estado;
  END IF;

  -- Generar movimientos por cada línea con diferencia <> 0
  INSERT INTO erp.movimientos_inventario
    (empresa_id, producto_id, almacen_id, tipo_movimiento, cantidad,
     costo_unitario, referencia_tipo, referencia_id, notas, created_by)
  SELECT
    v_empresa_id,
    l.producto_id,
    v_almacen_id,
    'ajuste',
    l.diferencia,                       -- signed
    l.costo_unitario,
    'levantamiento_fisico',
    p_levantamiento_id,
    'Levantamiento ' || v_folio || COALESCE(' · ' || l.notas_diferencia, ''),
    NULL
  FROM erp.inventario_levantamiento_lineas l
  WHERE l.levantamiento_id = p_levantamiento_id
    AND l.cantidad_contada IS NOT NULL
    AND l.diferencia IS NOT NULL
    AND l.diferencia <> 0;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE erp.inventario_levantamientos
     SET estado = 'aplicado',
         fecha_aplicado = now()
   WHERE id = p_levantamiento_id;

  RETURN v_count;
END $$;


-- 5.4 Cancelar
CREATE OR REPLACE FUNCTION erp.fn_cancelar_levantamiento(p_levantamiento_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, core, pg_catalog AS $$
DECLARE
  v_estado     text;
  v_empresa_id uuid;
BEGIN
  SELECT estado, empresa_id INTO v_estado, v_empresa_id
  FROM erp.inventario_levantamientos
  WHERE id = p_levantamiento_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Levantamiento % no existe', p_levantamiento_id;
  END IF;
  IF v_estado IN ('aplicado','cancelado') THEN
    RAISE EXCEPTION 'Levantamiento % no puede cancelarse desde estado %', p_levantamiento_id, v_estado;
  END IF;
  IF NOT (core.fn_has_empresa(v_empresa_id) OR core.fn_is_admin()) THEN
    RAISE EXCEPTION 'Sin permiso para empresa %', v_empresa_id;
  END IF;
  IF p_motivo IS NULL OR length(trim(p_motivo)) = 0 THEN
    RAISE EXCEPTION 'Motivo de cancelación obligatorio';
  END IF;

  UPDATE erp.inventario_levantamientos
     SET estado = 'cancelado',
         fecha_cancelado = now(),
         motivo_cancelacion = p_motivo
   WHERE id = p_levantamiento_id;
END $$;


-- ============================================================
-- 6) RPCs para la UI (sustituyen SELECT directo a las tablas de líneas)
-- ============================================================

-- 6.1 Captura a ciegas: solo info esencial, sin stock_inicial ni diferencia
CREATE OR REPLACE FUNCTION erp.fn_get_lineas_para_capturar(p_levantamiento_id uuid)
RETURNS TABLE(
  linea_id          uuid,
  producto_id       uuid,
  producto_nombre   text,
  producto_codigo   text,
  categoria         text,
  unidad            text,
  cantidad_contada  numeric,
  contado_at        timestamptz,
  recontada         boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, core, pg_catalog AS $$
DECLARE
  v_estado     text;
  v_empresa_id uuid;
  v_contador_id uuid;
BEGIN
  SELECT estado, empresa_id, contador_id INTO v_estado, v_empresa_id, v_contador_id
  FROM erp.inventario_levantamientos
  WHERE id = p_levantamiento_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Levantamiento no existe';
  END IF;
  IF NOT (core.fn_has_empresa(v_empresa_id) OR core.fn_is_admin()) THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;
  IF v_estado <> 'capturando' THEN
    RAISE EXCEPTION 'Captura solo permitida con estado=capturando (actual: %)', v_estado;
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.producto_id,
    p.nombre,
    p.codigo,
    c.nombre AS categoria,               -- de erp.categorias_producto vía FK productos.categoria_id
    p.unidad,
    l.cantidad_contada,
    l.contado_at,
    l.recontada
  FROM erp.inventario_levantamiento_lineas l
  JOIN erp.productos p ON p.id = l.producto_id
  LEFT JOIN erp.categorias_producto c ON c.id = p.categoria_id
  WHERE l.levantamiento_id = p_levantamiento_id;
END $$;


-- 6.2 Vista de revisión: incluye stock_inicial, salidas, stock_efectivo, diferencia
--   Solo accesible cuando estado >= 'capturado'
CREATE OR REPLACE FUNCTION erp.fn_get_lineas_para_revisar(p_levantamiento_id uuid)
RETURNS TABLE(
  linea_id                 uuid,
  producto_id              uuid,
  producto_nombre          text,
  producto_codigo          text,
  categoria                text,
  unidad                   text,
  stock_inicial            numeric,
  salidas_durante_captura  numeric,
  stock_efectivo           numeric,
  cantidad_contada         numeric,
  diferencia               numeric,
  diferencia_valor         numeric,
  costo_unitario           numeric,
  fuera_de_tolerancia      boolean,
  notas_diferencia         text,
  contado_at               timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, core, pg_catalog AS $$
DECLARE
  v_estado     text;
  v_empresa_id uuid;
BEGIN
  SELECT estado, empresa_id INTO v_estado, v_empresa_id
  FROM erp.inventario_levantamientos
  WHERE id = p_levantamiento_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Levantamiento no existe';
  END IF;
  IF NOT (core.fn_has_empresa(v_empresa_id) OR core.fn_is_admin()) THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;
  IF v_estado NOT IN ('capturado','aplicado','cancelado') THEN
    RAISE EXCEPTION 'Vista de revisión solo disponible con captura cerrada';
  END IF;

  RETURN QUERY
  SELECT
    l.id, l.producto_id, p.nombre, p.codigo, c.nombre AS categoria, p.unidad,
    l.stock_inicial, l.salidas_durante_captura, l.stock_efectivo,
    l.cantidad_contada, l.diferencia, l.diferencia_valor, l.costo_unitario,
    l.fuera_de_tolerancia, l.notas_diferencia, l.contado_at
  FROM erp.inventario_levantamiento_lineas l
  JOIN erp.productos p ON p.id = l.producto_id
  LEFT JOIN erp.categorias_producto c ON c.id = p.categoria_id
  WHERE l.levantamiento_id = p_levantamiento_id;
END $$;


-- 6.3 Guardar conteo (upsert por línea)
CREATE OR REPLACE FUNCTION erp.fn_guardar_conteo(
  p_levantamiento_id uuid,
  p_producto_id      uuid,
  p_cantidad         numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, core, pg_catalog AS $$
DECLARE
  v_estado      text;
  v_empresa_id  uuid;
  v_contador_id uuid;
  v_already     boolean;
BEGIN
  SELECT estado, empresa_id, contador_id INTO v_estado, v_empresa_id, v_contador_id
  FROM erp.inventario_levantamientos
  WHERE id = p_levantamiento_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Levantamiento no existe';
  END IF;
  IF v_estado <> 'capturando' THEN
    RAISE EXCEPTION 'Solo se puede capturar con estado=capturando';
  END IF;
  IF NOT (core.fn_has_empresa(v_empresa_id) OR core.fn_is_admin()) THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;
  IF p_cantidad < 0 THEN
    RAISE EXCEPTION 'Cantidad no puede ser negativa';
  END IF;

  SELECT cantidad_contada IS NOT NULL INTO v_already
  FROM erp.inventario_levantamiento_lineas
  WHERE levantamiento_id = p_levantamiento_id AND producto_id = p_producto_id;

  UPDATE erp.inventario_levantamiento_lineas
     SET cantidad_contada = p_cantidad,
         contado_por = auth.uid(),
         contado_at = now(),
         recontada = COALESCE(v_already, false)
   WHERE levantamiento_id = p_levantamiento_id
     AND producto_id = p_producto_id;
END $$;


-- 6.4 Firmar paso. Inserta en firmas y, si llega la última firma requerida,
--    auto-aplica el levantamiento.
CREATE OR REPLACE FUNCTION erp.fn_firmar_levantamiento(
  p_levantamiento_id uuid,
  p_paso             int,
  p_rol              text,
  p_comentario       text DEFAULT NULL,
  p_ip               inet DEFAULT NULL,
  p_user_agent       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = erp, core, pg_catalog AS $$
DECLARE
  v_estado            text;
  v_empresa_id        uuid;
  v_user_id           uuid := auth.uid();
  v_firmante_nombre   text;
  v_total_lineas      int;
  v_total_diferencia  numeric;
  v_total_fuera       int;
  v_firmas_actuales   int;
  v_firmas_requeridas int;
  v_movimientos       int := 0;
  v_aplicado          boolean := false;
BEGIN
  SELECT estado, empresa_id INTO v_estado, v_empresa_id
  FROM erp.inventario_levantamientos
  WHERE id = p_levantamiento_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Levantamiento % no existe', p_levantamiento_id;
  END IF;
  IF v_estado <> 'capturado' THEN
    RAISE EXCEPTION 'Solo se puede firmar con estado=capturado (actual: %)', v_estado;
  END IF;
  IF NOT (core.fn_has_empresa(v_empresa_id) OR core.fn_is_admin()) THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;

  -- Snapshot del firmante (first_name o email)
  SELECT COALESCE(NULLIF(first_name, ''), email) INTO v_firmante_nombre
  FROM core.usuarios WHERE id = v_user_id;

  -- Snapshot de cifras al momento de la firma
  SELECT COUNT(*),
         COALESCE(SUM(diferencia_valor), 0),
         COUNT(*) FILTER (WHERE fuera_de_tolerancia = true)
    INTO v_total_lineas, v_total_diferencia, v_total_fuera
  FROM erp.inventario_levantamiento_lineas
  WHERE levantamiento_id = p_levantamiento_id;

  INSERT INTO erp.inventario_levantamiento_firmas
    (empresa_id, levantamiento_id, paso, rol, firmante_id, firmante_nombre,
     comentario, total_lineas, total_diferencia, total_lineas_fuera, ip, user_agent)
  VALUES
    (v_empresa_id, p_levantamiento_id, p_paso, p_rol, v_user_id, v_firmante_nombre,
     p_comentario, v_total_lineas, v_total_diferencia, v_total_fuera, p_ip, p_user_agent);

  -- ¿Llegó la última firma requerida? Auto-aplicar.
  SELECT firmas_requeridas INTO v_firmas_requeridas
  FROM erp.fn_get_empresa_tolerancia(v_empresa_id);

  SELECT COUNT(*) INTO v_firmas_actuales
  FROM erp.inventario_levantamiento_firmas
  WHERE levantamiento_id = p_levantamiento_id;

  IF v_firmas_actuales >= v_firmas_requeridas THEN
    v_movimientos := erp.fn_aplicar_levantamiento(p_levantamiento_id);
    v_aplicado := true;
  END IF;

  RETURN jsonb_build_object(
    'firmas_actuales', v_firmas_actuales,
    'firmas_requeridas', v_firmas_requeridas,
    'aplicado', v_aplicado,
    'movimientos_generados', v_movimientos
  );
END $$;


-- ============================================================
-- 7) RLS — captura a ciegas garantizada
-- ============================================================

-- 7.1 inventario_levantamientos: visible para empresa o admin
ALTER TABLE erp.inventario_levantamientos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_inv_lev_select ON erp.inventario_levantamientos;
CREATE POLICY erp_inv_lev_select ON erp.inventario_levantamientos FOR SELECT TO authenticated
USING ((core.fn_has_empresa(empresa_id) OR core.fn_is_admin()) AND deleted_at IS NULL);

DROP POLICY IF EXISTS erp_inv_lev_insert ON erp.inventario_levantamientos;
CREATE POLICY erp_inv_lev_insert ON erp.inventario_levantamientos FOR INSERT TO authenticated
WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP POLICY IF EXISTS erp_inv_lev_update ON erp.inventario_levantamientos;
CREATE POLICY erp_inv_lev_update ON erp.inventario_levantamientos FOR UPDATE TO authenticated
USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP POLICY IF EXISTS erp_inv_lev_delete ON erp.inventario_levantamientos;
CREATE POLICY erp_inv_lev_delete ON erp.inventario_levantamientos FOR DELETE TO authenticated
USING (core.fn_is_admin());

-- 7.2 inventario_levantamiento_lineas: SELECT directo SOLO para admin
--    Esto garantiza que un contador no pueda ver stock_inicial con SELECT *.
--    La UI consume vía RPCs (fn_get_lineas_para_capturar / fn_get_lineas_para_revisar).
ALTER TABLE erp.inventario_levantamiento_lineas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_inv_lev_lin_select ON erp.inventario_levantamiento_lineas;
CREATE POLICY erp_inv_lev_lin_select ON erp.inventario_levantamiento_lineas FOR SELECT TO authenticated
USING (core.fn_is_admin());

DROP POLICY IF EXISTS erp_inv_lev_lin_insert ON erp.inventario_levantamiento_lineas;
CREATE POLICY erp_inv_lev_lin_insert ON erp.inventario_levantamiento_lineas FOR INSERT TO authenticated
WITH CHECK (core.fn_is_admin());

DROP POLICY IF EXISTS erp_inv_lev_lin_update ON erp.inventario_levantamiento_lineas;
CREATE POLICY erp_inv_lev_lin_update ON erp.inventario_levantamiento_lineas FOR UPDATE TO authenticated
USING (core.fn_is_admin());

DROP POLICY IF EXISTS erp_inv_lev_lin_delete ON erp.inventario_levantamiento_lineas;
CREATE POLICY erp_inv_lev_lin_delete ON erp.inventario_levantamiento_lineas FOR DELETE TO authenticated
USING (core.fn_is_admin());

-- 7.3 inventario_levantamiento_firmas: SELECT por empresa, INSERT por empresa,
--    no UPDATE ni DELETE para no-admin (firmas son inmutables).
ALTER TABLE erp.inventario_levantamiento_firmas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_inv_lev_firmas_select ON erp.inventario_levantamiento_firmas;
CREATE POLICY erp_inv_lev_firmas_select ON erp.inventario_levantamiento_firmas FOR SELECT TO authenticated
USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

DROP POLICY IF EXISTS erp_inv_lev_firmas_insert ON erp.inventario_levantamiento_firmas;
CREATE POLICY erp_inv_lev_firmas_insert ON erp.inventario_levantamiento_firmas FOR INSERT TO authenticated
WITH CHECK (core.fn_is_admin());        -- inserts solo via fn_firmar_levantamiento (DEFINER)

DROP POLICY IF EXISTS erp_inv_lev_firmas_update ON erp.inventario_levantamiento_firmas;
CREATE POLICY erp_inv_lev_firmas_update ON erp.inventario_levantamiento_firmas FOR UPDATE TO authenticated
USING (core.fn_is_admin());

DROP POLICY IF EXISTS erp_inv_lev_firmas_delete ON erp.inventario_levantamiento_firmas;
CREATE POLICY erp_inv_lev_firmas_delete ON erp.inventario_levantamiento_firmas FOR DELETE TO authenticated
USING (core.fn_is_admin());


-- ============================================================
-- 8) GRANTs
-- ============================================================
GRANT ALL ON erp.inventario_levantamientos          TO authenticated, service_role;
GRANT ALL ON erp.inventario_levantamiento_lineas    TO authenticated, service_role;
GRANT ALL ON erp.inventario_levantamiento_firmas    TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION erp.fn_get_empresa_tolerancia(uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION erp.fn_iniciar_captura_levantamiento(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION erp.fn_cerrar_captura_levantamiento(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION erp.fn_aplicar_levantamiento(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION erp.fn_cancelar_levantamiento(uuid, text)         TO authenticated;
GRANT EXECUTE ON FUNCTION erp.fn_get_lineas_para_capturar(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION erp.fn_get_lineas_para_revisar(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION erp.fn_guardar_conteo(uuid, uuid, numeric)        TO authenticated;
GRANT EXECUTE ON FUNCTION erp.fn_firmar_levantamiento(uuid, int, text, text, inet, text) TO authenticated;


-- ============================================================
-- 9) Smoke test inline (descomentar local para validar flujo end-to-end)
-- ============================================================
-- DO $$
-- DECLARE
--   v_lev_id uuid;
--   v_count  int;
--   v_resp   jsonb;
--   v_empresa_id uuid := 'e52ac307-9373-4115-b65e-1178f0c4e1aa';  -- RDB
--   v_almacen_id uuid;
--   v_user_id uuid;
-- BEGIN
--   SELECT id INTO v_almacen_id FROM erp.almacenes WHERE empresa_id = v_empresa_id LIMIT 1;
--   SELECT id INTO v_user_id    FROM core.usuarios LIMIT 1;
--
--   -- 1) Empresa con firmas_requeridas=1 para acelerar el smoke
--   UPDATE core.empresas
--      SET config_inventario = config_inventario || '{"firmas_requeridas": 1}'::jsonb
--    WHERE id = v_empresa_id;
--
--   -- 2) Crear borrador (folio se asigna por trigger)
--   INSERT INTO erp.inventario_levantamientos (empresa_id, almacen_id, fecha_programada, created_by)
--   VALUES (v_empresa_id, v_almacen_id, CURRENT_DATE, v_user_id)
--   RETURNING id INTO v_lev_id;
--
--   RAISE NOTICE 'Folio asignado: %', (SELECT folio FROM erp.inventario_levantamientos WHERE id = v_lev_id);
--
--   -- 3) Iniciar captura → siembra (asume al menos 1 producto inventariable en el almacén)
--   v_count := erp.fn_iniciar_captura_levantamiento(v_lev_id);
--   RAISE NOTICE 'Sembradas % líneas', v_count;
--
--   -- 4) Capturar todas con stock_inicial (cero diferencia esperada)
--   --   NOTA: con RLS bloqueante, este UPDATE directo solo funciona como service_role o admin.
--   --   En el flujo real la UI llama fn_guardar_conteo por cada producto.
--   UPDATE erp.inventario_levantamiento_lineas
--      SET cantidad_contada = stock_inicial, contado_at = now(), contado_por = v_user_id
--    WHERE levantamiento_id = v_lev_id;
--
--   -- 5) Cerrar captura (recalcula stock_efectivo y diferencia)
--   PERFORM erp.fn_cerrar_captura_levantamiento(v_lev_id);
--   RAISE NOTICE 'Captura cerrada';
--
--   -- 6) Firmar 1 vez (con firmas_requeridas=1, debería auto-aplicar)
--   v_resp := erp.fn_firmar_levantamiento(v_lev_id, 1, 'contador', 'smoke test');
--   RAISE NOTICE 'Resultado firma: %', v_resp;
--
--   -- 7) Validar que estado=aplicado y movimientos generados=0 (cero diferencia)
--   ASSERT (SELECT estado FROM erp.inventario_levantamientos WHERE id = v_lev_id) = 'aplicado',
--          'Debió quedar aplicado';
--   ASSERT (SELECT COUNT(*) FROM erp.movimientos_inventario
--           WHERE referencia_tipo = 'levantamiento_fisico' AND referencia_id = v_lev_id) = 0,
--          'No debió generar movimientos (cero diferencia)';
--
--   RAISE NOTICE 'SMOKE TEST OK';
--   ROLLBACK;
-- END $$;


-- ============================================================
-- Recordatorios para el ejecutor en proyecto Supabase
-- ============================================================
-- 1. Renombrar archivo con timestamp YYYYMMDDhhmmss_*.sql posterior al último.
-- 2. Aplicar en main vía Supabase MCP apply_migration o psql.
-- 3. Regenerar SCHEMA_REF.md: npm run schema:ref
-- 4. Regenerar tipos del repo (revisar package.json para el comando exacto).
-- 5. Commit con: migration .sql + SCHEMA_REF.md + types/supabase.ts.
-- 6. CI valida que SCHEMA_REF está fresh.
