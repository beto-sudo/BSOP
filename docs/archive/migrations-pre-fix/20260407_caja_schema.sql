-- ============================================================
-- Caja Schema — BSOP OS
-- Cortes de Caja con Cierre Ciego
-- Fecha: 2026-04-07
--
-- IMPORTANTE: Después de correr esta migración, exponer el
-- schema "caja" en Supabase Dashboard →
-- Settings → API → Exposed Schemas → agregar "caja"
-- ============================================================

CREATE SCHEMA IF NOT EXISTS caja;

-- ============================================================
-- 1. CORTES DE CAJA
-- ============================================================
CREATE TABLE IF NOT EXISTS caja.cortes (
  id               SERIAL PRIMARY KEY,
  folio            TEXT UNIQUE,                    -- 'Corte-{id}', generado por trigger
  numero_caja      TEXT NOT NULL DEFAULT '1',
  cajero           TEXT NOT NULL,
  estado           TEXT NOT NULL DEFAULT 'abierto'
                     CHECK (estado IN ('abierto', 'cerrado')),
  fondo_apertura   NUMERIC(10,2) NOT NULL DEFAULT 3000,
  fecha_apertura   TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_cierre     TIMESTAMPTZ,

  -- Cantidades declaradas por cajero (cierre ciego)
  denominaciones   JSONB,                          -- { "b1000": 3, "b500": 5, ... }
  efectivo_contado NUMERIC(10,2),                  -- suma de denominaciones
  tarjeta_contada  NUMERIC(10,2) DEFAULT 0,        -- total vouchers de terminal
  total_declarado  NUMERIC(10,2),                  -- efectivo_contado + tarjeta_contada

  -- Calculado por sistema después de sync con Waitry (oculto al cajero)
  ventas_efectivo  NUMERIC(10,2),
  ventas_tarjeta   NUMERIC(10,2),
  total_esperado   NUMERIC(10,2),
  diferencia       NUMERIC(10,2),                  -- total_declarado - total_esperado

  notas            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. TRIGGER: Auto-generar folio = 'Corte-{id}'
-- ============================================================
CREATE OR REPLACE FUNCTION caja.set_folio_corte()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE caja.cortes SET folio = 'Corte-' || NEW.id WHERE id = NEW.id;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER trg_folio_corte
AFTER INSERT ON caja.cortes
FOR EACH ROW
EXECUTE FUNCTION caja.set_folio_corte();

-- ============================================================
-- 3. TRIGGER: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION caja.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_updated_at_cortes
BEFORE UPDATE ON caja.cortes
FOR EACH ROW
EXECUTE FUNCTION caja.touch_updated_at();

-- ============================================================
-- 4. RLS + Permisos (acceso anon para uso interno sin auth)
-- ============================================================
ALTER TABLE caja.cortes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all" ON caja.cortes;
CREATE POLICY "anon_all" ON caja.cortes
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

-- Grants para PostgREST (schema exposition via dashboard)
GRANT USAGE ON SCHEMA caja TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA caja TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA caja TO anon, authenticated;

-- ============================================================
-- 5. ÍNDICES útiles
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_cortes_estado ON caja.cortes (estado);
CREATE INDEX IF NOT EXISTS idx_cortes_fecha ON caja.cortes (fecha_apertura DESC);
CREATE INDEX IF NOT EXISTS idx_cortes_caja ON caja.cortes (numero_caja, estado);
