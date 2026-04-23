-- Workflow de cierre con aprobación para erp.tasks.
--
-- Contexto: tareas asignadas por dirección no pueden ser cerradas
-- directamente por el asignatario. El usuario solicita el cierre,
-- dirección (core.roles.puede_aprobar_cierres=true) aprueba o rechaza.
--
-- Consistencia de las columnas nuevas se valida en aplicación, no en DB
-- (las columnas quedan nullable para no romper registros existentes).
-- RLS de erp.tasks hoy es permisiva a nivel de empresa (fn_has_empresa
-- OR fn_is_admin) en SELECT/INSERT/UPDATE/DELETE, sin granularidad por
-- asignatario ni restricción column-level, así que este workflow no
-- requiere cambios en policies: la enforcement de "solo asignatario
-- solicita" y "solo dirección aprueba" se hace en la app.

BEGIN;

-- 1. Nuevo estado cierre_solicitado
ALTER TABLE erp.tasks DROP CONSTRAINT IF EXISTS tasks_estado_check;
ALTER TABLE erp.tasks ADD CONSTRAINT tasks_estado_check
  CHECK (estado IN ('pendiente', 'en_progreso', 'bloqueado',
                    'completado', 'cancelado', 'cierre_solicitado'));

-- 2. Columnas de tracking del workflow
-- EDITED 2026-04-23 (drift-1.5): ADD COLUMN IF NOT EXISTS para idempotencia
-- (en Preview Branches el bootstrap ya tiene las columnas con el state actual de prod).
ALTER TABLE erp.tasks
  ADD COLUMN IF NOT EXISTS cierre_solicitado_en     timestamptz,
  ADD COLUMN IF NOT EXISTS cierre_solicitado_por    uuid REFERENCES erp.empleados(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cierre_aprobado_en       timestamptz,
  ADD COLUMN IF NOT EXISTS cierre_aprobado_por      uuid REFERENCES erp.empleados(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cierre_rechazado_en      timestamptz,
  ADD COLUMN IF NOT EXISTS cierre_rechazado_por     uuid REFERENCES erp.empleados(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cierre_rechazado_motivo  text;

-- 3. Flag "dirección" en roles
ALTER TABLE core.roles
  ADD COLUMN IF NOT EXISTS puede_aprobar_cierres boolean NOT NULL DEFAULT false;

-- 4. Índice parcial para la vista de aprobación (PR 3)
CREATE INDEX IF NOT EXISTS idx_tasks_cierre_solicitado
  ON erp.tasks(empresa_id, cierre_solicitado_en)
  WHERE estado = 'cierre_solicitado';

-- TODO post-deploy: marcar roles de dirección manualmente. Ejemplo:
--   UPDATE core.roles SET puede_aprobar_cierres = true
--   WHERE nombre ILIKE 'direccion%';
-- No se hace aquí para no asumir convención de nombrado — que lo
-- valide el admin humano en cada empresa después de revisar
-- `SELECT id, empresa_id, nombre FROM core.roles ORDER BY empresa_id, nombre;`

COMMIT;
