-- ============================================================
-- RDB Schema V2 — BSOP OS
-- Nuevas tablas para módulos: Productos, Inventario,
-- Proveedores, Requisiciones, Órdenes de Compra
-- Aplica sobre Supabase (ybklderteyhuugzfmxbi)
-- Fecha: 2026-04-07
-- ============================================================

-- Aseguramos que el schema rdb existe (separado de waitry/caja)
CREATE SCHEMA IF NOT EXISTS rdb;

-- ============================================================
-- 1. PRODUCTOS (Catálogo master)
-- Sincronizado desde Waitry. Editable en BSOP.
-- ============================================================
CREATE TABLE IF NOT EXISTS rdb.productos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  waitry_item_id  BIGINT UNIQUE,           -- ID en Waitry para sync
  nombre          TEXT NOT NULL,
  descripcion     TEXT,                    -- talla/sabor/variante viene aquí
  precio          NUMERIC(10,2) NOT NULL DEFAULT 0,
  categoria       TEXT,
  activo          BOOLEAN NOT NULL DEFAULT true,
  unidad          TEXT DEFAULT 'pieza',    -- pieza, litro, kg, etc.
  stock_minimo    NUMERIC(10,2) DEFAULT 0, -- para alertas de inventario bajo
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. INVENTARIO — Movimientos
-- Cada entrada o salida de stock genera un registro aquí.
-- Stock actual = SUM(cantidad) agrupado por producto
-- ============================================================
CREATE TABLE IF NOT EXISTS rdb.inventario_movimientos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id     UUID NOT NULL REFERENCES rdb.productos(id),
  tipo            TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste')),
  cantidad        NUMERIC(10,2) NOT NULL,  -- positivo=entrada, negativo=salida
  costo_unitario  NUMERIC(10,2),           -- solo en entradas (OC)
  referencia_tipo TEXT CHECK (referencia_tipo IN ('orden_compra', 'venta', 'ajuste_manual')),
  referencia_id   UUID,                    -- FK a OC o al pedido de Waitry
  notas           TEXT,
  creado_por      UUID,                    -- FK a auth.users cuando tengamos login
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Vista de stock actual por producto
CREATE OR REPLACE VIEW rdb.v_stock_actual AS
SELECT
  p.id,
  p.waitry_item_id,
  p.nombre,
  p.categoria,
  p.unidad,
  p.stock_minimo,
  p.precio,
  COALESCE(SUM(m.cantidad), 0) AS stock_actual,
  CASE
    WHEN COALESCE(SUM(m.cantidad), 0) <= p.stock_minimo THEN true
    ELSE false
  END AS bajo_minimo
FROM rdb.productos p
LEFT JOIN rdb.inventario_movimientos m ON m.producto_id = p.id
GROUP BY p.id;

-- ============================================================
-- 3. PROVEEDORES
-- Migración desde tabla básica de Coda
-- ============================================================
CREATE TABLE IF NOT EXISTS rdb.proveedores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        TEXT NOT NULL,
  contacto      TEXT,
  telefono      TEXT,
  email         TEXT,
  rfc           TEXT,
  direccion     TEXT,
  notas         TEXT,
  activo        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 4. REQUISICIONES
-- Generadas por encargado o cajeras
-- ============================================================
CREATE TABLE IF NOT EXISTS rdb.requisiciones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio           TEXT UNIQUE NOT NULL,    -- REQ-2026-001 (autogenerado)
  estatus         TEXT NOT NULL DEFAULT 'borrador'
                    CHECK (estatus IN ('borrador', 'enviada', 'aprobada', 'rechazada', 'convertida')),
  solicitado_por  UUID,                    -- FK a auth.users
  aprobado_por    UUID,                    -- FK a auth.users
  fecha_solicitud TIMESTAMPTZ DEFAULT now(),
  fecha_necesidad DATE,                    -- cuándo se necesita
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rdb.requisiciones_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisicion_id  UUID NOT NULL REFERENCES rdb.requisiciones(id) ON DELETE CASCADE,
  producto_id     UUID REFERENCES rdb.productos(id),
  descripcion     TEXT NOT NULL,           -- si no existe en catálogo aún
  cantidad        NUMERIC(10,2) NOT NULL,
  unidad          TEXT DEFAULT 'pieza',
  notas           TEXT
);

-- ============================================================
-- 5. ÓRDENES DE COMPRA
-- Generadas a partir de una Requisición aprobada
-- ============================================================
CREATE TABLE IF NOT EXISTS rdb.ordenes_compra (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio           TEXT UNIQUE NOT NULL,    -- OC-2026-001 (autogenerado)
  requisicion_id  UUID REFERENCES rdb.requisiciones(id),
  proveedor_id    UUID REFERENCES rdb.proveedores(id),
  estatus         TEXT NOT NULL DEFAULT 'abierta'
                    CHECK (estatus IN ('abierta', 'parcial', 'recibida', 'cancelada')),
  total_estimado  NUMERIC(10,2),
  total_real      NUMERIC(10,2),
  fecha_emision   TIMESTAMPTZ DEFAULT now(),
  fecha_recepcion TIMESTAMPTZ,
  recibido_por    UUID,
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rdb.ordenes_compra_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id        UUID NOT NULL REFERENCES rdb.ordenes_compra(id) ON DELETE CASCADE,
  producto_id     UUID REFERENCES rdb.productos(id),
  descripcion     TEXT NOT NULL,
  cantidad        NUMERIC(10,2) NOT NULL,
  cantidad_recibida NUMERIC(10,2) DEFAULT 0,
  precio_unitario NUMERIC(10,2),
  subtotal        NUMERIC(10,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED
);

-- ============================================================
-- 6. TRIGGER: Auto-generar folios
-- ============================================================
CREATE OR REPLACE FUNCTION rdb.generar_folio_requisicion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  nuevo_folio TEXT;
  anio TEXT := TO_CHAR(NOW(), 'YYYY');
  consecutivo INT;
BEGIN
  SELECT COUNT(*) + 1 INTO consecutivo
  FROM rdb.requisiciones
  WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  nuevo_folio := 'REQ-' || anio || '-' || LPAD(consecutivo::TEXT, 3, '0');
  NEW.folio := nuevo_folio;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_folio_requisicion
BEFORE INSERT ON rdb.requisiciones
FOR EACH ROW WHEN (NEW.folio IS NULL OR NEW.folio = '')
EXECUTE FUNCTION rdb.generar_folio_requisicion();

CREATE OR REPLACE FUNCTION rdb.generar_folio_oc()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  nuevo_folio TEXT;
  anio TEXT := TO_CHAR(NOW(), 'YYYY');
  consecutivo INT;
BEGIN
  SELECT COUNT(*) + 1 INTO consecutivo
  FROM rdb.ordenes_compra
  WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  nuevo_folio := 'OC-' || anio || '-' || LPAD(consecutivo::TEXT, 3, '0');
  NEW.folio := nuevo_folio;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_folio_oc
BEFORE INSERT ON rdb.ordenes_compra
FOR EACH ROW WHEN (NEW.folio IS NULL OR NEW.folio = '')
EXECUTE FUNCTION rdb.generar_folio_oc();

-- ============================================================
-- 7. TRIGGER: Al recibir OC → crear movimiento de entrada
-- ============================================================
CREATE OR REPLACE FUNCTION rdb.registrar_entrada_inventario()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Solo actúa cuando la OC pasa a 'recibida'
  IF NEW.estatus = 'recibida' AND OLD.estatus != 'recibida' THEN
    INSERT INTO rdb.inventario_movimientos
      (producto_id, tipo, cantidad, costo_unitario, referencia_tipo, referencia_id)
    SELECT
      i.producto_id,
      'entrada',
      i.cantidad_recibida,
      i.precio_unitario,
      'orden_compra',
      NEW.id
    FROM rdb.ordenes_compra_items i
    WHERE i.orden_id = NEW.id
      AND i.producto_id IS NOT NULL
      AND i.cantidad_recibida > 0;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_entrada_por_oc
AFTER UPDATE ON rdb.ordenes_compra
FOR EACH ROW
EXECUTE FUNCTION rdb.registrar_entrada_inventario();

-- ============================================================
-- 8. NOTA: Salidas de inventario
-- Se registran vía Edge Function waitry-webhook al recibir
-- un pedido. Lógica a agregar en la EF existente.
-- ============================================================
