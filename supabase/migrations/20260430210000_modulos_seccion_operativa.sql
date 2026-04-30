-- Agrega 'operativa' como sección canónica de core.modulos.seccion
-- y mueve `rdb.home` ahí (antes vivía en 'sistema' como catch-all
-- desde la migración 20260428220000_modulos_add_seccion.sql).
--
-- Motivación: el sidebar de RDB ahora tiene una sección "Operativa"
-- como primer renglón con el item Home → /rdb/home (PR #370). Para que
-- el panel /settings/acceso (UI de roles) refleje esa misma sección,
-- el ENUM de secciones tiene que incluir 'operativa'.
--
-- ADR-014 (sidebar-taxonomia) extendido: 7 secciones en lugar de 6:
--   - 'operativa'       — Home / dashboard del giro (RDB Home, futuros)
--   - 'administracion'  — Tareas, Juntas, Documentos
--   - 'rh'              — Personal, Puestos, Departamentos
--   - 'compras'         — Proveedores, Requisiciones, OC, Recepciones
--   - 'inventario'      — Productos, Inventario
--   - 'operaciones'     — Core del giro (Ventas, Cortes, Playtomic, …)
--   - 'sistema'         — Transversal (Settings, módulos legacy)

BEGIN;

-- Paso 1: relax CHECK constraint para incluir 'operativa'.
-- DROP + ADD porque CHECK constraints no son ALTERables in-place.
ALTER TABLE core.modulos
  DROP CONSTRAINT IF EXISTS modulos_seccion_check;

ALTER TABLE core.modulos
  ADD CONSTRAINT modulos_seccion_check CHECK (seccion IN (
    'operativa',
    'administracion',
    'rh',
    'compras',
    'inventario',
    'operaciones',
    'sistema'
  ));

-- Paso 2: re-clasificar `rdb.home` de 'sistema' → 'operativa'.
-- Cualquier futuro `<empresa>.home` debería seguir el mismo patrón
-- (handled by future migrations or initial seed).
UPDATE core.modulos
SET seccion = 'operativa'
WHERE slug = 'rdb.home';

-- Paso 3: PostgREST schema reload para que /settings/acceso lea el
-- nuevo CHECK + el UPDATE sin ventana de inconsistencia.
NOTIFY pgrst, 'reload schema';

COMMIT;
