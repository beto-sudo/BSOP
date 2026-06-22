-- ╭─ 20260622124726_sanren_recibo_extraccion_campos ─╮
-- SANREN → Servicios · Sprint 5 (extracción por IA). Campos que la IA extrae
-- del recibo y que hoy no guardábamos: vencimiento, desglose (subtotal/IVA),
-- tarifa, y un jsonb `extraccion` con TODO el detalle crudo (conceptos,
-- lecturas impresas, poder calorífico, historial, etc.) para no perder nada.
-- Iniciativa `sanren-servicios` (docs/planning/sanren-servicios.md).
--
-- Se recrea la vista `v_recibos` para exponer los campos nuevos (DROP+CREATE
-- en vez de OR REPLACE porque cambian el orden de columnas; se re-aplican los
-- grants). Timestamp generado con `npm run db:new`.

BEGIN;

ALTER TABLE sanren.recibos
  ADD COLUMN IF NOT EXISTS fecha_vencimiento date,
  ADD COLUMN IF NOT EXISTS subtotal numeric,
  ADD COLUMN IF NOT EXISTS iva numeric,
  ADD COLUMN IF NOT EXISTS tarifa text,
  ADD COLUMN IF NOT EXISTS extraccion jsonb,
  ADD COLUMN IF NOT EXISTS extraccion_at timestamptz;

COMMENT ON COLUMN sanren.recibos.tarifa IS 'Tarifa del servicio según el recibo (CFE: DAC/1C/GDMTH; agua: D-Doméstico; gas: volumétrica). La de CFE habilita el cálculo de ahorro solar exacto.';
COMMENT ON COLUMN sanren.recibos.extraccion IS 'JSON crudo de la extracción IA del recibo (conceptos del desglose, lecturas impresas, poder calorífico, historial, etc.). Iniciativa sanren-servicios S5.';
COMMENT ON COLUMN sanren.recibos.extraccion_at IS 'Cuándo se corrió la extracción IA (NULL = capturado a mano, sin IA).';

-- Recrear la vista para incluir los campos nuevos.
DROP VIEW IF EXISTS sanren.v_recibos;
CREATE VIEW sanren.v_recibos
WITH (security_invoker = on) AS
WITH base AS (
  SELECT
    r.id,
    r.servicio_id,
    r.periodo,
    r.fecha_recibo,
    r.fecha_vencimiento,
    r.monto,
    r.subtotal,
    r.iva,
    r.tarifa,
    r.moneda,
    r.folio,
    r.lectura_consumo,
    r.lectura_produccion,
    r.pagado,
    r.fecha_pago,
    r.metodo_pago,
    r.recibo_adjunto_id,
    r.comprobante_adjunto_id,
    r.notas,
    r.extraccion,
    r.extraccion_at,
    r.coda_row_id,
    s.propiedad_id,
    s.tipo AS servicio_tipo,
    s.proveedor,
    s.unidad_consumo,
    s.tiene_produccion,
    p.nombre AS propiedad_nombre,
    LAG(r.lectura_consumo) OVER w AS lectura_consumo_anterior,
    LAG(r.lectura_produccion) OVER w AS lectura_produccion_anterior,
    LAG(r.monto) OVER w AS monto_anterior
  FROM sanren.recibos r
  JOIN sanren.servicios s ON s.id = r.servicio_id
  JOIN sanren.propiedades p ON p.id = s.propiedad_id
  WINDOW w AS (PARTITION BY r.servicio_id ORDER BY r.periodo, r.fecha_recibo)
)
SELECT
  b.*,
  (b.lectura_consumo - b.lectura_consumo_anterior) AS consumo_periodo,
  (b.lectura_produccion - b.lectura_produccion_anterior) AS produccion_periodo,
  CASE
    WHEN (b.lectura_consumo - b.lectura_consumo_anterior) > 0
      THEN b.monto / (b.lectura_consumo - b.lectura_consumo_anterior)
  END AS costo_unitario,
  (
    (b.lectura_consumo - b.lectura_consumo_anterior)
    - COALESCE(b.lectura_produccion - b.lectura_produccion_anterior, 0)
  ) AS saldo_neto,
  (b.monto - b.monto_anterior) AS delta_monto_mom
FROM base b;
COMMENT ON VIEW sanren.v_recibos IS 'Recibos con derivaciones (consumo/producción del periodo, costo unitario, saldo neto solar, Δ MoM) + campos de extracción IA. Iniciativa sanren-servicios.';

REVOKE ALL ON sanren.v_recibos FROM PUBLIC, anon, authenticator, authenticated;
GRANT SELECT ON sanren.v_recibos TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
