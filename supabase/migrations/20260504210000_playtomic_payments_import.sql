-- Iniciativa rdb-pagos-cancha-conciliacion — Sprint 2 (CSV import)
--
-- Tabla para almacenar el reporte de pagos que el gerente del club
-- descarga desde Playtomic Manager web (no expuesto en third-party API).
-- Fuente: report → CSV download → upload manual a BSOP. Se importa como
-- UPSERT por payment_id para que re-uploads del mismo periodo sean
-- idempotentes.
--
-- El reporte incluye TODOS los pagos que pasan por Playtomic
-- (online + manager: cash, card, transferencia, etc.) — cubre los
-- "pendientes falsos" que el third-party API no actualiza correctamente
-- (~73% del CSV son origin=Playtomic Manager).

BEGIN;

CREATE TABLE IF NOT EXISTS playtomic.payments_import (
  -- IDs y referencias
  payment_id              text PRIMARY KEY,
  club_payment_id         text,
  refund_id               text,
  corporate_name          text,
  user_id                 text,
  user_name               text,
  payout_code             text,
  sport                   text,
  product_sku             text,
  origin                  text,
  service_date            timestamptz,
  payment_date            timestamptz,
  payment_method          text,
  payment_type            text,
  payment_status          text,
  currency                text,
  -- Importes
  total                   numeric,
  subtotal                numeric,
  taxes                   numeric,
  tax_rate                numeric,
  net_amount_transferred  numeric,
  b2b_fee_rate            numeric,
  b2b_fee_total           numeric,
  b2b_fee_subtotal        numeric,
  b2b_fee_taxes           numeric,
  b2b_fee_tax_rate        numeric,
  non_applicable_total    numeric,
  non_applicable_subtotal numeric,
  non_applicable_taxes    numeric,
  -- Facturación
  invoice_id              text,
  invoice_number          text,
  invoice_date            timestamptz,
  invoice_payer           text,
  -- Tienda / campaña
  store_product_name      text,
  store_product_quantity  numeric,
  campaign_id             text,
  campaign_name           text,
  -- Metadata del upload
  uploaded_by             uuid REFERENCES auth.users(id),
  uploaded_at             timestamptz NOT NULL DEFAULT now(),
  source_filename         text
);

COMMENT ON TABLE playtomic.payments_import IS
  'Pagos importados desde el reporte CSV de Playtomic Manager web. PRIMARY KEY payment_id permite UPSERT idempotente al re-subir el mismo periodo. Iniciativa rdb-pagos-cancha-conciliacion.';

CREATE INDEX IF NOT EXISTS idx_payments_import_user_id
  ON playtomic.payments_import(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_import_service_date
  ON playtomic.payments_import(service_date);
CREATE INDEX IF NOT EXISTS idx_payments_import_payment_date
  ON playtomic.payments_import(payment_date);

ALTER TABLE playtomic.payments_import ENABLE ROW LEVEL SECURITY;

CREATE POLICY payments_import_select
  ON playtomic.payments_import
  FOR SELECT TO authenticated
  USING (core.fn_is_admin() OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid));

CREATE POLICY payments_import_write
  ON playtomic.payments_import
  FOR ALL TO authenticated
  USING      (core.fn_is_admin() OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid))
  WITH CHECK (core.fn_is_admin() OR core.fn_has_empresa('e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid));

CREATE POLICY payments_import_service_role
  ON playtomic.payments_import
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

COMMIT;
