-- MIGRATION: soporte de blends multi-péptido en el protocolo — schema `health`
-- Iniciativa `sanren-peptides` (calculadora · blends).
--
-- Caso KLOW: un solo vial liofilizado que combina varios péptidos
--   (TB-500 10mg + BPC-157 10mg + KPV 10mg + GHK-Cu 50mg = 80mg/vial).
-- Se dosifica POR VOLUMEN (mL/u) y la calculadora deriva los mg entregados de
-- cada componente para el volumen jalado:
--   mg_componente = componente.mg × (mL_jalado / agua_bac_mL)
--
-- Modelo: una columna `componentes jsonb` en el catálogo. Cuando es NULL el
-- compuesto es simple (comportamiento actual intacto); cuando trae el arreglo
-- [{ "nombre": "...", "mg": <num> }, ...] el compuesto es un blend y la suma de
-- los mg = total del vial.
--
-- DDL puro (additive, nullable): NO seedea KLOW aquí. El catálogo personal de
-- Beto se siembra por separado (scripts/seed_protocolo_klow.ts), igual que el
-- Retatrutide — los datos clínicos personales NO deben correr en preview/CI.

ALTER TABLE health.protocolo_compuestos
  ADD COLUMN IF NOT EXISTS componentes jsonb;

COMMENT ON COLUMN health.protocolo_compuestos.componentes IS
  'Blend multi-péptido: arreglo [{nombre, mg}] cuyos mg suman el total del vial. NULL = compuesto simple. Se dosifica por volumen y la calculadora deriva los mg por componente.';

NOTIFY pgrst, 'reload schema';
