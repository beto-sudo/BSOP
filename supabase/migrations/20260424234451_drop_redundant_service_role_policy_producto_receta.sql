-- service_role bypassa RLS automáticamente; la policy explícita es redundante.
-- Drift-check (ALERT §2) la flagueó. Drop para alinear con el patrón del resto del schema.
DROP POLICY IF EXISTS erp_producto_receta_service_role ON erp.producto_receta;
