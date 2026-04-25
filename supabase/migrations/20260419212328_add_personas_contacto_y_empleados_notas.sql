-- Campos de contacto adicionales de persona
ALTER TABLE erp.personas
  ADD COLUMN IF NOT EXISTS telefono_casa text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_nombre text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_telefono text,
  ADD COLUMN IF NOT EXISTS contacto_emergencia_parentesco text;

COMMENT ON COLUMN erp.personas.telefono_casa IS 'Teléfono de casa / fijo del empleado';
COMMENT ON COLUMN erp.personas.contacto_emergencia_nombre IS 'Nombre completo del contacto de emergencia';
COMMENT ON COLUMN erp.personas.contacto_emergencia_telefono IS 'Teléfono del contacto de emergencia';
COMMENT ON COLUMN erp.personas.contacto_emergencia_parentesco IS 'Relación del contacto con el empleado (esposa, padre, hermano, etc.)';

-- Notas libres sobre el empleado (texto plano/HTML; Coda las tiene como canvas)
ALTER TABLE erp.empleados
  ADD COLUMN IF NOT EXISTS notas text;

COMMENT ON COLUMN erp.empleados.notas IS 'Notas/anotaciones libres de HR sobre el empleado (HTML permitido).';;
