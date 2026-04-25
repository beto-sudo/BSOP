-- Distinguir personas morales de personas físicas en core.empresas.
-- Permite que el sistema de permisos (canAccessEmpresa) siga funcionando
-- sin cambios, mientras se habilita el nuevo nav "Personas Físicas"
-- acotado a contribuyentes personas físicas.

ALTER TABLE core.empresas
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'persona_moral';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'empresas_tipo_check'
  ) THEN
    ALTER TABLE core.empresas
      ADD CONSTRAINT empresas_tipo_check
      CHECK (tipo IN ('persona_moral', 'persona_fisica'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS empresas_tipo_idx ON core.empresas (tipo);

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
