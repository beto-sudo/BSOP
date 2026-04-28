-- Añade columna `seccion` a core.modulos para agrupar módulos en la UI de
-- Settings → Roles según la taxonomía del ADR-014 (sidebar-taxonomia).
--
-- Estrategia en 3 pasos:
--   1. ADD COLUMN nullable
--   2. Backfill explícito por patrón de slug
--   3. ALTER SET NOT NULL + CHECK constraint con las 6 secciones permitidas
--
-- Las 6 secciones (consistentes con ADR-014):
--   - 'administracion'  — Tareas, Juntas, Documentos
--   - 'rh'              — Personal, Puestos, Departamentos
--   - 'compras'         — Proveedores, Requisiciones, Órdenes de Compra
--   - 'inventario'      — Productos, Inventario
--   - 'operaciones'     — Core del giro (Ventas, Cortes, Playtomic, Inmobiliario, …)
--   - 'sistema'         — Transversal (Home, Settings, módulos legacy)
--
-- Esta migración solo agrega la columna y la rellena. No inserta módulos
-- nuevos — ese paso vive en la migración del Sprint 2 de la iniciativa
-- `modulos-catalog`.

BEGIN;

-- Paso 1: Add column nullable
ALTER TABLE core.modulos
  ADD COLUMN seccion text;

-- Paso 2: Backfill por patrón de slug. Orden importa — los patrones
-- más específicos primero. El catch-all `ELSE 'sistema'` cubre cualquier
-- slug no contemplado (ej. legacy `rdb.tasks`).
UPDATE core.modulos
SET seccion = CASE
  -- Administración (gobierno corporativo)
  WHEN slug LIKE '%.admin.tasks' THEN 'administracion'
  WHEN slug LIKE '%.admin.juntas' THEN 'administracion'
  WHEN slug LIKE '%.admin.documentos' THEN 'administracion'

  -- Recursos Humanos
  WHEN slug LIKE '%.rh.%' THEN 'rh'

  -- Compras (procurement / P2P)
  WHEN slug LIKE '%.proveedores' THEN 'compras'
  WHEN slug LIKE '%.requisiciones' THEN 'compras'
  WHEN slug LIKE '%.ordenes_compra' THEN 'compras'

  -- Inventario (catálogo + stock)
  WHEN slug LIKE '%.productos' THEN 'inventario'
  WHEN slug LIKE '%.inventario' THEN 'inventario'

  -- Operaciones (core del giro de cada empresa)
  WHEN slug LIKE '%.ventas' THEN 'operaciones'
  WHEN slug LIKE '%.cortes' THEN 'operaciones'
  WHEN slug LIKE '%.playtomic' THEN 'operaciones'
  WHEN slug LIKE '%.terrenos' THEN 'operaciones'
  WHEN slug LIKE '%.prototipos' THEN 'operaciones'
  WHEN slug LIKE '%.anteproyectos' THEN 'operaciones'
  WHEN slug LIKE '%.proyectos' THEN 'operaciones'

  -- Sistema (transversal: home, settings, legacy)
  WHEN slug LIKE '%.home' THEN 'sistema'
  WHEN slug LIKE 'settings.%' THEN 'sistema'

  -- Catch-all defensivo para cualquier slug no contemplado.
  ELSE 'sistema'
END;

-- Paso 3: NOT NULL + CHECK constraint sobre las 6 secciones permitidas
ALTER TABLE core.modulos
  ALTER COLUMN seccion SET NOT NULL,
  ADD CONSTRAINT modulos_seccion_check CHECK (seccion IN (
    'administracion',
    'rh',
    'compras',
    'inventario',
    'operaciones',
    'sistema'
  ));

-- Reload PostgREST schema cache para que /settings/acceso lea la columna nueva.
NOTIFY pgrst, 'reload schema';

COMMIT;
