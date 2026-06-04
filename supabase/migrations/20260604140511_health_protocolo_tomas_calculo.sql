-- Calculadora de reconstitución en la bitácora (iniciativa sanren-peptides, Sprint 6).
-- Columnas para capturar el cálculo junto con la toma (todas nullable: las tomas
-- existentes y el registro rápido no las traen). Autorizado por Beto 2026-06-04.
-- Aplicada a prod vía connector apply_migration (versión 20260604140511).
ALTER TABLE health.protocolo_tomas
  ADD COLUMN IF NOT EXISTS vial_mg       numeric,
  ADD COLUMN IF NOT EXISTS bac_ml        numeric,
  ADD COLUMN IF NOT EXISTS concentracion numeric,
  ADD COLUMN IF NOT EXISTS unidades      numeric;

COMMENT ON COLUMN health.protocolo_tomas.vial_mg IS 'mg totales del péptido en el vial (calculadora de reconstitución)';
COMMENT ON COLUMN health.protocolo_tomas.bac_ml IS 'mL de agua bacteriostática agregados al reconstituir';
COMMENT ON COLUMN health.protocolo_tomas.concentracion IS 'Concentración resultante en mg/mL (vial_mg / bac_ml)';
COMMENT ON COLUMN health.protocolo_tomas.unidades IS 'Unidades a jalar en jeringa de insulina 100u/mL para la dosis';

NOTIFY pgrst, 'reload schema';
