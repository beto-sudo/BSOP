-- Añade empresa_id a core.modulos con FK explícita.
--
-- Estrategia en 3 pasos para evitar downtime:
--   1. ADD COLUMN nullable
--   2. Backfill desde split_part(slug, '.', 1) → empresas.slug
--   3. ALTER SET NOT NULL después de verificar 0 filas NULL
--
-- Este refactor NO cambia los IDs de los módulos existentes, por lo que
-- permisos_rol, permisos_usuario_excepcion, usuarios_empresas siguen
-- apuntando a los mismos registros. Cero impacto en permisos de usuarios.

BEGIN;

-- Paso 1: Add column nullable con FK
ALTER TABLE core.modulos
  ADD COLUMN empresa_id uuid REFERENCES core.empresas(id);

-- Paso 2: Backfill desde convención de slug
UPDATE core.modulos m
SET empresa_id = (
  SELECT id FROM core.empresas
  WHERE slug = split_part(m.slug, '.', 1)
)
WHERE empresa_id IS NULL;

-- Paso 3: Forzar NOT NULL (falla si quedó algún NULL — si falla, revisar)
ALTER TABLE core.modulos
  ALTER COLUMN empresa_id SET NOT NULL;

-- Paso 4: Unique constraint por (empresa_id, slug) — confirmado 0 duplicados
-- en inventario pre-migración, safe to add.
ALTER TABLE core.modulos
  ADD CONSTRAINT modulos_empresa_slug_unique UNIQUE (empresa_id, slug);

COMMIT;
