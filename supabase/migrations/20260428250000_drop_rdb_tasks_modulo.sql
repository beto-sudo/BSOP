-- Borra el módulo legacy `rdb.tasks` de core.modulos.
--
-- Contexto: la URL `/rdb/tasks` se mapeaba a este slug en
-- `lib/permissions.ts`, pero la página vivía huérfana en
-- `app/rdb/tasks/page.tsx` (implementación custom de 646 líneas) y
-- `app/rdb/tasks/[id]/page.tsx` (745 líneas). El sidebar siempre apuntó
-- a `/rdb/admin/tasks` (slug `rdb.admin.tasks`), que es la versión
-- canónica que usa el componente compartido `<TasksModule>` desde el
-- PR #298 (variant=rich, igual que DILESA).
--
-- Esta migración cierra la brecha entre código y DB:
--   1. Borra los permisos_rol vinculados al slug en RDB.
--   2. Borra la fila `rdb.tasks` de core.modulos para RDB.
--   3. Recarga el schema de PostgREST.
--
-- El PR de cleanup también borra:
--   - app/rdb/tasks/ (page.tsx + [id]/page.tsx)
--   - `'/rdb/tasks': 'rdb.tasks'` de ROUTE_TO_MODULE en lib/permissions.ts
--   - `'rdb.tasks'` de EXPECTED_DB_MODULE_SLUGS en lib/permissions.test.ts

BEGIN;

-- Paso 1: Borrar permisos_rol asociados al módulo legacy en RDB.
DELETE FROM core.permisos_rol
WHERE modulo_id IN (
  SELECT m.id
  FROM core.modulos m
  JOIN core.empresas e ON e.id = m.empresa_id
  WHERE m.slug = 'rdb.tasks'
    AND e.slug = 'rdb'
);

-- Paso 2: Borrar la fila del módulo en core.modulos.
DELETE FROM core.modulos
WHERE slug = 'rdb.tasks'
  AND empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb');

-- Paso 3: Recargar schema de PostgREST.
NOTIFY pgrst, 'reload schema';

COMMIT;
