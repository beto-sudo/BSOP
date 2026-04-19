-- Datos necesarios para el contrato individual de trabajo que NO vienen
-- en la Constancia de Situación Fiscal (CSF) del SAT.
--
-- Se agregan a core.empresas para que el contrato (Art. 25 LFT) pueda
-- generarse automáticamente desde BSOP usando los datos registrados de
-- cada empresa (DILESA, Nigropetense, COAGAN, etc.).

ALTER TABLE core.empresas
  ADD COLUMN IF NOT EXISTS registro_patronal_imss text,
  ADD COLUMN IF NOT EXISTS representante_legal text,
  ADD COLUMN IF NOT EXISTS escritura_constitutiva jsonb,
  ADD COLUMN IF NOT EXISTS escritura_poder jsonb;

COMMENT ON COLUMN core.empresas.registro_patronal_imss IS 'Registro patronal ante IMSS (formato A0000000000). Requerido para contrato LFT.';
COMMENT ON COLUMN core.empresas.representante_legal IS 'Nombre del representante legal que firma contratos en nombre de la empresa.';
COMMENT ON COLUMN core.empresas.escritura_constitutiva IS 'JSON: { numero, fecha, fecha_texto, notario, notaria_numero, distrito } — escritura de constitución de la sociedad.';
COMMENT ON COLUMN core.empresas.escritura_poder IS 'JSON: { numero, fecha, fecha_texto, notario, notaria_numero, distrito } — escritura que otorga poder al representante legal.';
