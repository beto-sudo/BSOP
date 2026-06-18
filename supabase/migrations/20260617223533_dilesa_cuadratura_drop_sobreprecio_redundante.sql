-- ╭─ 20260617223533_dilesa_cuadratura_drop_sobreprecio_redundante ─╮
-- Reconciliación (ADR-045, decisión Beto 2026-06-17): la columna
-- `sobreprecio_adicionales` que se agregó en 20260617215833 DUPLICA a
-- `dilesa.ventas.productos_adicionales`, que YA existía y está poblada en las
-- 1312 ventas (es el sobreprecio por productos adicionales). El motor usa
-- `productos_adicionales`; esta columna se elimina (estaba vacía, 0 ventas).
--
-- Se conservan precio_base, incremento_credito y promocion_gastos_monto: guardan
-- la cadena de precio EXACTA al asignar (base real, distinto del valor_comercial
-- genérico del prototipo) + la promoción del catálogo congelada.
-- Cadena: precio_base + incremento_credito + productos_adicionales = valor_escrituracion.
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión).

BEGIN;

ALTER TABLE dilesa.ventas DROP COLUMN IF EXISTS sobreprecio_adicionales;

COMMENT ON COLUMN dilesa.ventas.precio_base IS
  'Precio base de asignacion, congelado al asignar (el REAL al momento, no el valor_comercial generico vigente del prototipo). Cadena: precio_base + incremento_credito + productos_adicionales = valor_escrituracion. ADR-045.';
COMMENT ON COLUMN dilesa.ventas.incremento_credito IS
  'Incremento por tipo de credito (+6% FOVISSSTE/IMSS sobre el precio_base real), congelado al asignar. ADR-045.';

-- Recarga el cache de PostgREST (columna eliminada).
NOTIFY pgrst, 'reload schema';

COMMIT;
