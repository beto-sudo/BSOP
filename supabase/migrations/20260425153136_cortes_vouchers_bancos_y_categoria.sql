-- ──────────────────────────────────────────────────────────────────────────
-- Migración: catálogo de bancos + clasificación y OCR en cortes_vouchers
--
-- Soporta el rediseño del panel de detalle de cortes (conciliación tarjeta vs
-- vouchers, OCR de banco/monto/afiliación, separación entre vouchers y
-- comprobantes de movimiento). Plan completo en docs/plans/cortes-detail-
-- conciliacion.md — sección §3.2.
-- ──────────────────────────────────────────────────────────────────────────

-- 1) Catálogo seed de bancos (cross-empresa, vive en core)
CREATE TABLE core.bancos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo      text NOT NULL UNIQUE,
  nombre      text NOT NULL,
  patron_ocr  text,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE core.bancos IS
  'Catálogo seed de bancos/terminales para conciliación de vouchers de tarjeta. Cross-empresa.';
COMMENT ON COLUMN core.bancos.patron_ocr IS
  'Regex JS-compatible (sin flags) para detectar el banco en texto extraído por OCR. Aplicar con flag /i en cliente.';

INSERT INTO core.bancos (codigo, nombre, patron_ocr) VALUES
  ('BBVA',         'BBVA México',          '\bBBVA\b|BANCOMER'),
  ('BANORTE',      'Banorte',              '\bBANORTE\b'),
  ('BANAMEX',      'Citibanamex',          '\bBANAMEX\b|CITIBANAMEX'),
  ('SANTANDER',    'Santander México',     '\bSANTANDER\b'),
  ('HSBC',         'HSBC México',          '\bHSBC\b'),
  ('SCOTIABANK',   'Scotiabank',           '\bSCOTIA(BANK)?\b'),
  ('AZTECA',       'Banco Azteca',         '\bAZTECA\b'),
  ('INBURSA',      'Inbursa',              '\bINBURSA\b'),
  ('AFIRME',       'Afirme',               '\bAFIRME\b'),
  ('CLIP',         'Clip',                 '\bCLIP\b'),
  ('MERCADO_PAGO', 'Mercado Pago Point',   '\bMERCADO\s*PAGO\b|\bPOINT\b'),
  ('OTRO',         'Otro / no detectado',  NULL);

-- RLS: lectura pública para usuarios autenticados (es catálogo, no datos sensibles)
ALTER TABLE core.bancos ENABLE ROW LEVEL SECURITY;
CREATE POLICY bancos_read_authenticated ON core.bancos
  FOR SELECT TO authenticated USING (true);
-- Sin INSERT/UPDATE/DELETE policy → solo service_role o admin DB modifican.

GRANT SELECT ON core.bancos TO authenticated;

-- 2) Nuevas columnas en erp.cortes_vouchers
ALTER TABLE erp.cortes_vouchers
  ADD COLUMN categoria text NOT NULL DEFAULT 'voucher_tarjeta'
    CHECK (categoria IN ('voucher_tarjeta', 'comprobante_movimiento', 'otro'));

ALTER TABLE erp.cortes_vouchers
  ADD COLUMN banco_id uuid REFERENCES core.bancos(id);

ALTER TABLE erp.cortes_vouchers
  ADD COLUMN movimiento_caja_id uuid
    REFERENCES erp.movimientos_caja(id) ON DELETE SET NULL;

ALTER TABLE erp.cortes_vouchers
  ADD COLUMN ocr_texto_crudo        text;
ALTER TABLE erp.cortes_vouchers
  ADD COLUMN ocr_monto_sugerido     numeric;
ALTER TABLE erp.cortes_vouchers
  ADD COLUMN ocr_banco_sugerido_id  uuid REFERENCES core.bancos(id);
ALTER TABLE erp.cortes_vouchers
  ADD COLUMN ocr_confianza          numeric
    CHECK (ocr_confianza IS NULL OR (ocr_confianza >= 0 AND ocr_confianza <= 1));

COMMENT ON COLUMN erp.cortes_vouchers.categoria IS
  'voucher_tarjeta: cierre de lote de terminal. comprobante_movimiento: foto ligada a movimiento_caja. otro: sin clasificar.';
COMMENT ON COLUMN erp.cortes_vouchers.banco_id IS
  'Banco confirmado por el cajero (FK a core.bancos). Se llena al confirmar el voucher.';
COMMENT ON COLUMN erp.cortes_vouchers.afiliacion IS
  'Número de afiliación específico de la terminal (ej. 7235801). Texto libre. NO confundir con banco — el banco vive en banco_id.';
COMMENT ON COLUMN erp.cortes_vouchers.monto_reportado IS
  'Monto total impreso en el voucher, confirmado por el cajero. Se compara contra ingresos_tarjeta para conciliar.';
COMMENT ON COLUMN erp.cortes_vouchers.movimiento_caja_id IS
  'Si categoria=comprobante_movimiento, FK al movimiento de caja al que respalda.';

CREATE INDEX cortes_vouchers_categoria_idx
  ON erp.cortes_vouchers (corte_id, categoria);

CREATE INDEX cortes_vouchers_movimiento_idx
  ON erp.cortes_vouchers (movimiento_caja_id)
  WHERE movimiento_caja_id IS NOT NULL;

CREATE INDEX cortes_vouchers_banco_idx
  ON erp.cortes_vouchers (banco_id)
  WHERE banco_id IS NOT NULL;
