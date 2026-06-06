-- Iniciativa dilesa-contratos-obra · Sprint Contratos→partidas+PDF · Fase 1 (campos del modelo)
-- Agrega a dilesa.contratos_construccion los datos que el contrato real (formato legal de
-- servicios a precios unitarios) requiere y que el modelo no capturaba, para habilitar el
-- PDF de obra + la captura completa del contrato:
--   objeto                          — descripción del trabajo (ej. "225 m de muro de contención")
--   fecha_inicio                    — inicio del plazo de ejecución
--   fecha_fin                       — fin del plazo de ejecución
--   fianza_pct                      — fianza de cumplimiento (% del monto, ej. 10)
--   periodicidad_estimaciones_dias  — cada cuántos días se estima/paga avance (ej. 14)
-- Todas nullable → aditivo puro, no afecta los 303 contratos existentes.

ALTER TABLE dilesa.contratos_construccion
  ADD COLUMN IF NOT EXISTS objeto text,
  ADD COLUMN IF NOT EXISTS fecha_inicio date,
  ADD COLUMN IF NOT EXISTS fecha_fin date,
  ADD COLUMN IF NOT EXISTS fianza_pct numeric,
  ADD COLUMN IF NOT EXISTS periodicidad_estimaciones_dias integer;

NOTIFY pgrst, 'reload schema';
