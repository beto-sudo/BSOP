-- ╭─ 20260627010829_reconciliacion_drop_core_empresas_tipo_fantasma ─╮
-- Sprint 0.5 de `derivados-sin-drift` (cat D). La migración 20260419223241 agregó
-- `core.empresas.tipo` (persona_moral/fisica) con `ADD COLUMN IF NOT EXISTS`, pero
-- el nombre canónico en prod es `tipo_contribuyente` (creado por el bootstrap). prod
-- nunca tuvo la columna `tipo`; en una DB fresca la migración la crea → columna
-- fantasma solo en shadow. La dropeamos para que shadow == prod (no-op en prod, donde
-- no existe). El código usa `tipo_contribuyente`, no `tipo`.

BEGIN;

ALTER TABLE core.empresas DROP COLUMN IF EXISTS tipo;

NOTIFY pgrst, 'reload schema';

COMMIT;
