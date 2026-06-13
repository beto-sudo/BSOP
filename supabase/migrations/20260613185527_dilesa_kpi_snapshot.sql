-- ╭─ 20260613185527_dilesa_kpi_snapshot ─╮
-- Cierre diario de KPIs del correo al Consejo DILESA
-- (iniciativa dilesa-resumen-consejo-rediseno, Sprint 1).
--
-- Una fila por (empresa, día): los flujos del día (ventas/escrituras/cobranza)
-- y los stocks de cierre (liquidez, CxC, casas en obra). El cron escribe la
-- fila del día al enviar el correo (upsert idempotente por empresa+fecha).
-- Es la base de los DELTAS ▲▼: el correo compara el snapshot de hoy contra el
-- más reciente previo. Sin historial propio en los stocks (CxC, casas en obra)
-- no habría delta — esta tabla lo provee. La fecha es la LOCAL de Matamoros
-- al momento del envío (20:00), no la UTC del cron.
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión:
-- estrictamente mayor que toda migración local + de PRs abiertos).

BEGIN;

CREATE TABLE IF NOT EXISTS dilesa.kpi_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  -- Fecha LOCAL de Matamoros del cierre (no la UTC del cron).
  fecha date NOT NULL,
  -- Flujos del día.
  ventas_hoy_n integer NOT NULL DEFAULT 0,
  ventas_hoy_monto numeric NOT NULL DEFAULT 0,
  escrituras_hoy_n integer NOT NULL DEFAULT 0,
  escrituras_hoy_monto numeric NOT NULL DEFAULT 0,
  cobrado_hoy numeric NOT NULL DEFAULT 0,
  -- Stocks de cierre.
  liquidez_total numeric NOT NULL DEFAULT 0,
  cxc_abierto numeric NOT NULL DEFAULT 0,
  cxc_vencido numeric NOT NULL DEFAULT 0,
  casas_en_obra integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Un snapshot por empresa por día (el cron hace upsert al reintentar).
  CONSTRAINT kpi_snapshot_empresa_fecha_key UNIQUE (empresa_id, fecha)
);

COMMENT ON TABLE dilesa.kpi_snapshot IS
  'Cierre diario de KPIs del correo al Consejo (dilesa-resumen-consejo-rediseno S1). Una fila por empresa+día; el cron la upserta al enviar. Base de los deltas ▲▼ del resumen ejecutivo. fecha = local de Matamoros, no UTC.';

CREATE INDEX IF NOT EXISTS kpi_snapshot_empresa_fecha_idx
  ON dilesa.kpi_snapshot (empresa_id, fecha DESC);

-- RLS canónica (aislamiento por empresa, espejo de dilesa.venta_fase_revisiones).
-- Escritura: solo service role (el cron) — sin políticas de INSERT/UPDATE para
-- usuarios autenticados; el snapshot no se captura a mano.
ALTER TABLE dilesa.kpi_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kpi_snapshot_select ON dilesa.kpi_snapshot;
CREATE POLICY kpi_snapshot_select ON dilesa.kpi_snapshot
  FOR SELECT USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

NOTIFY pgrst, 'reload schema';

COMMIT;
