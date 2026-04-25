-- Migración combinada para soporte completo del contrato de trabajo según
-- LFT Art. 25 + campos de contacto que Beto pidió agregar al expediente
-- del empleado.
--
-- Aplicada vía Supabase MCP en 2026-04-19. Este archivo queda en repo para
-- reproducibilidad (entornos staging / recuperación).

-- ── Contacto extendido + notas ──────────────────────────────────────────────

ALTER TABLE erp.personas
  ADD COLUMN IF NOT EXISTS telefono_casa text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_nombre text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_telefono text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_parentesco text;

COMMENT ON COLUMN erp.personas.telefono_casa IS 'Teléfono de casa / fijo del empleado';
COMMENT ON COLUMN erp.personas.contacto_emergencia_nombre IS 'Nombre completo del contacto de emergencia';
COMMENT ON COLUMN erp.personas.contacto_emergencia_telefono IS 'Teléfono del contacto de emergencia';
COMMENT ON COLUMN erp.personas.contacto_emergencia_parentesco IS 'Relación del contacto (esposa, padre, hermano, etc.)';

ALTER TABLE erp.empleados
  ADD COLUMN IF NOT EXISTS notas text;

COMMENT ON COLUMN erp.empleados.notas IS 'Notas/anotaciones libres de HR sobre el empleado (HTML permitido).';

-- ── Datos personales LFT (Art. 25-I) ────────────────────────────────────────

ALTER TABLE erp.personas
  ADD COLUMN IF NOT EXISTS domicilio text,
  ADD COLUMN IF NOT EXISTS nacionalidad text,
  ADD COLUMN IF NOT EXISTS estado_civil text,
  ADD COLUMN IF NOT EXISTS sexo text,
  ADD COLUMN IF NOT EXISTS lugar_nacimiento text;

ALTER TABLE erp.personas
  ALTER COLUMN nacionalidad SET DEFAULT 'Mexicana';

COMMENT ON COLUMN erp.personas.domicilio IS 'Domicilio del empleado (Art. 25-I LFT)';
COMMENT ON COLUMN erp.personas.nacionalidad IS 'Art. 25-I LFT';
COMMENT ON COLUMN erp.personas.estado_civil IS 'Art. 25-I LFT — soltero, casado, unión libre, etc.';
COMMENT ON COLUMN erp.personas.sexo IS 'Art. 25-I LFT — M/F/X';
COMMENT ON COLUMN erp.personas.lugar_nacimiento IS 'Ciudad, Estado (útil para contrato)';

-- ── Condiciones laborales (Art. 25-II al VII LFT) ───────────────────────────

ALTER TABLE erp.empleados
  ADD COLUMN IF NOT EXISTS tipo_contrato text,
  ADD COLUMN IF NOT EXISTS periodo_prueba_dias integer,
  ADD COLUMN IF NOT EXISTS periodo_prueba_numero integer,
  ADD COLUMN IF NOT EXISTS horario text,
  ADD COLUMN IF NOT EXISTS lugar_trabajo text,
  ADD COLUMN IF NOT EXISTS dia_pago text,
  ADD COLUMN IF NOT EXISTS funciones text;

COMMENT ON COLUMN erp.empleados.tipo_contrato IS 'indefinido | determinado | obra | temporada | capacitacion_inicial | prueba (Art. 35, 39-A, 39-B LFT)';
COMMENT ON COLUMN erp.empleados.periodo_prueba_dias IS 'Duración del periodo de prueba en días (Art. 39-A, máx 30 general / 180 directivo)';
COMMENT ON COLUMN erp.empleados.periodo_prueba_numero IS 'Número de prueba actual (DILESA usa hasta 3 períodos de 30 días antes de planta)';
COMMENT ON COLUMN erp.empleados.horario IS 'Descripción del horario y jornada';
COMMENT ON COLUMN erp.empleados.lugar_trabajo IS 'Lugar(es) donde se presta el servicio (Art. 25-IV LFT)';
COMMENT ON COLUMN erp.empleados.dia_pago IS 'Día y lugar de pago del salario (Art. 25-VI LFT)';
COMMENT ON COLUMN erp.empleados.funciones IS 'Descripción precisa de funciones (Art. 25-III LFT)';

-- ── Beneficiarios (Art. 501 LFT) ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS erp.empleado_beneficiarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas(id),
  empleado_id uuid NOT NULL REFERENCES erp.empleados(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  parentesco text,
  porcentaje numeric(5, 2) CHECK (porcentaje IS NULL OR (porcentaje > 0 AND porcentaje <= 100)),
  orden integer NOT NULL DEFAULT 1,
  telefono text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_empleado_beneficiarios_empleado ON erp.empleado_beneficiarios (empleado_id);
CREATE INDEX IF NOT EXISTS idx_empleado_beneficiarios_empresa ON erp.empleado_beneficiarios (empresa_id);

COMMENT ON TABLE erp.empleado_beneficiarios IS 'Beneficiarios designados por el empleado (Art. 501 LFT).';
