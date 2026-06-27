-- ╭─ 20260627005803_reconciliacion_fk_usuario_id_core ─╮
-- Sprint 0.5 de `derivados-sin-drift` (cat B — toca prod). Las tablas
-- core.usuarios_empresas y core.permisos_usuario_excepcion nacieron en prod ANTES
-- del migration tracking, SIN la FK usuario_id → core.usuarios que el bootstrap
-- (20260101000001) sí define. Resultado: shadow tiene la FK, prod no. La agregamos
-- a prod (idempotente: no-op en shadow, donde el bootstrap ya la creó).
--
-- Pre-requisito: limpiar filas huérfanas (usuario_id sin match en core.usuarios)
-- que impedirían agregar la FK. Verificado en prod: 1 fila en usuarios_empresas
-- (empresa DILESA, usuario ya borrado), 0 en permisos_usuario_excepcion.

BEGIN;

-- Limpiar huérfanos (membresías/excepciones de usuarios que ya no existen).
DELETE FROM core.usuarios_empresas ue
WHERE ue.usuario_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM core.usuarios u WHERE u.id = ue.usuario_id);

DELETE FROM core.permisos_usuario_excepcion p
WHERE p.usuario_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM core.usuarios u WHERE u.id = p.usuario_id);

-- Agregar las FK (idempotente por relación; ON DELETE como en el bootstrap = NO ACTION).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'core.usuarios_empresas'::regclass
      AND contype = 'f' AND confrelid = 'core.usuarios'::regclass
  ) THEN
    ALTER TABLE core.usuarios_empresas
      ADD CONSTRAINT usuarios_empresas_usuario_id_fkey
      FOREIGN KEY (usuario_id) REFERENCES core.usuarios(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'core.permisos_usuario_excepcion'::regclass
      AND contype = 'f' AND confrelid = 'core.usuarios'::regclass
  ) THEN
    ALTER TABLE core.permisos_usuario_excepcion
      ADD CONSTRAINT permisos_usuario_excepcion_usuario_id_fkey
      FOREIGN KEY (usuario_id) REFERENCES core.usuarios(id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
