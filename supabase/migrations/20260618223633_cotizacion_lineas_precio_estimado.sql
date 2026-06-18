-- ╭─ 20260618223633_cotizacion_lineas_precio_estimado ─╮
-- Hereda el precio estimado de la requisición hacia la cotización (RFQ) como
-- REFERENCIA INTERNA. Al pedir una RFQ desde una requisición, cada línea copia
-- el `precio_estimado` capturado en la requisición; la captura de la RFQ lo
-- muestra en una columna de referencia (con su total) para comparar contra lo
-- cotizado. NO pre-llena el precio de ningún proveedor ni se incluye en la
-- Solicitud de Cotización que se envía: cada proveedor cotiza a ciegas para que
-- mande su mejor oferta. Columna aditiva, nullable, sin default destructivo:
-- las líneas existentes y las RFQ creadas desde cero (sin requisición) → NULL.
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión:
-- estrictamente mayor que toda migración local + de PRs abiertos).

BEGIN;

ALTER TABLE erp.cotizacion_lineas
  ADD COLUMN IF NOT EXISTS precio_estimado numeric;

COMMENT ON COLUMN erp.cotizacion_lineas.precio_estimado IS
  'Precio unitario estimado heredado de la requisición origen (erp.requisiciones_detalle.precio_estimado). Referencia interna mostrada en la captura de la RFQ; NO pre-llena el precio del proveedor ni se envía en la Solicitud de Cotización (cada proveedor cotiza a ciegas). NULL si la RFQ no nació de una requisición.';

-- `cotizacion_lineas` se lee por embed desde `cotizaciones` → recargar el cache.
NOTIFY pgrst, 'reload schema';

COMMIT;
