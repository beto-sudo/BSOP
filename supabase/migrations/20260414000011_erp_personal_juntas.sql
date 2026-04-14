-- ============================================================
-- ERP Personal & Juntas Extensions
-- Migration: 20260414000011_erp_personal_juntas.sql
-- Date: 2026-04-14
-- Description:
--   1. erp.juntas  – drop tipo CHECK constraint (open text),
--                    add fecha_terminada column
--   2. erp.empleados – add nss, fecha_nacimiento,
--                      telefono_empresa, extension
--   3. erp.puestos   – add objetivo, perfil, requisitos,
--                      esquema_pago, reporta_a
-- ============================================================

-- ─── 1. erp.juntas ───────────────────────────────────────────────────────────

-- Remove the hard-coded tipo check so any string value is accepted.
-- The auto-generated constraint name from the v3 migration is juntas_tipo_check.
DO $$ BEGIN
  ALTER TABLE erp.juntas DROP CONSTRAINT juntas_tipo_check;
EXCEPTION WHEN undefined_object THEN
  NULL; -- constraint doesn't exist (already removed or never created)
END $$;

-- Track when a junta was formally closed.
ALTER TABLE erp.juntas
  ADD COLUMN IF NOT EXISTS fecha_terminada TIMESTAMPTZ;

COMMENT ON COLUMN erp.juntas.tipo            IS 'Tipo libre: operativa, directiva, seguimiento, emergencia, Consejo, Comite Ejecutivo, Ventas, etc.';
COMMENT ON COLUMN erp.juntas.fecha_terminada IS 'Timestamp en que se marcó la junta como completada y se envió la minuta.';


-- ─── 2. erp.empleados ────────────────────────────────────────────────────────

ALTER TABLE erp.empleados
  ADD COLUMN IF NOT EXISTS nss               TEXT,
  ADD COLUMN IF NOT EXISTS fecha_nacimiento  DATE,
  ADD COLUMN IF NOT EXISTS telefono_empresa  TEXT,
  ADD COLUMN IF NOT EXISTS extension         TEXT;

COMMENT ON COLUMN erp.empleados.nss              IS 'Número de Seguridad Social (IMSS).';
COMMENT ON COLUMN erp.empleados.fecha_nacimiento IS 'Fecha de nacimiento del empleado.';
COMMENT ON COLUMN erp.empleados.telefono_empresa IS 'Teléfono corporativo asignado.';
COMMENT ON COLUMN erp.empleados.extension        IS 'Extensión telefónica interna.';


-- ─── 3. erp.puestos ──────────────────────────────────────────────────────────

ALTER TABLE erp.puestos
  ADD COLUMN IF NOT EXISTS objetivo     TEXT,
  ADD COLUMN IF NOT EXISTS perfil       TEXT,
  ADD COLUMN IF NOT EXISTS requisitos   TEXT,
  ADD COLUMN IF NOT EXISTS esquema_pago TEXT,
  ADD COLUMN IF NOT EXISTS reporta_a    UUID REFERENCES erp.puestos(id);

COMMENT ON COLUMN erp.puestos.objetivo     IS 'Objetivo principal del puesto.';
COMMENT ON COLUMN erp.puestos.perfil       IS 'Perfil requerido: competencias, habilidades, actitudes.';
COMMENT ON COLUMN erp.puestos.requisitos   IS 'Requisitos formales: escolaridad, experiencia, certificaciones.';
COMMENT ON COLUMN erp.puestos.esquema_pago IS 'Esquema de pago: mensual, quincenal, honorarios, etc.';
COMMENT ON COLUMN erp.puestos.reporta_a    IS 'Puesto al que reporta jerárquicamente.';

CREATE INDEX IF NOT EXISTS erp_puestos_reporta_a_idx ON erp.puestos (reporta_a) WHERE reporta_a IS NOT NULL;
