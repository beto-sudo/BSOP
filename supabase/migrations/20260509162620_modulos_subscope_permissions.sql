-- Sub-slugs como módulos hijos para granularidad RBAC por sub-página.
--
-- Contexto: hoy core.modulos × core.permisos_rol controla acceso por slug
-- raíz (`rdb.inventario`). Las tabs/sub-páginas heredan implícitamente. No
-- hay forma de decir "este rol ve Stock pero no Movimientos".
--
-- Esta migración introduce 7 sub-slugs (3 para `rdb.inventario`, 4 para
-- `rdb.productos`) como filas independientes en core.modulos, reusando la
-- maquinaria existente — un sub-slug es idéntico a un slug, solo con punto
-- adicional. La aplicación los consume via canAccessModulo / RequireAccess
-- sin cambios.
--
-- Sprint 1 de la iniciativa `submodule-permissions`. Solo DDL/data — el
-- código (ROUTE_TO_MODULE, layouts, gates) se migra en Sprint 2 cuando
-- esta migración ya esté aplicada.
--
-- Decisiones (ver docs/planning/submodule-permissions.md):
-- - D1: padre + sub-slugs (compatibilidad). El padre se preserva como
--   umbrella para sidebar; el sub-slug gobierna acceso real al contenido.
-- - D2: UX = tab oculta + AccessDenied al URL directo (Sprint 2).
-- - D3: padre como umbrella; sub-slug gobierna contenido (Sprint 2).
-- - D4: piloto en los 2 módulos con tabs hoy (rdb.inventario, rdb.productos).
--
-- Backfill defensivo (paso 2): por cada rol con permiso al padre, clonar
-- (acceso_lectura, acceso_escritura) idéntico a cada hijo. Esto preserva
-- 100% del status quo — usuarios actuales NO pierden tabs que tenían.
-- Sin esto, agregar el sub-slug ESCONDERÍA la tab a no-admin users (porque
-- canAccessModulo retorna false cuando el slug no está en permissions.modulos).

BEGIN;

-- Paso 1a: Sub-slugs de rdb.inventario.
-- Hereda empresa_id y seccion del módulo padre vía CROSS JOIN.
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT s.slug, s.nombre, s.descripcion, parent.empresa_id, parent.seccion
FROM (
  VALUES
    ('rdb.inventario.stock',          'Inventario · Stock',          'Vista de stock por producto y almacén'),
    ('rdb.inventario.movimientos',    'Inventario · Movimientos',    'Bitácora de movimientos de inventario'),
    ('rdb.inventario.levantamientos', 'Inventario · Levantamientos', 'Levantamientos físicos de inventario')
) AS s(slug, nombre, descripcion)
CROSS JOIN core.modulos parent
WHERE parent.slug = 'rdb.inventario'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Paso 1b: Sub-slugs de rdb.productos.
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT s.slug, s.nombre, s.descripcion, parent.empresa_id, parent.seccion
FROM (
  VALUES
    ('rdb.productos.catalogo',  'Productos · Catálogo',  'Lista de productos con costo y precio'),
    ('rdb.productos.recetas',   'Productos · Recetas',   'Recetas e ingredientes por producto'),
    ('rdb.productos.auditoria', 'Productos · Auditoría', 'Alertas y auditoría sobre productos'),
    ('rdb.productos.analisis',  'Productos · Análisis',  'Análisis y reportes sobre productos')
) AS s(slug, nombre, descripcion)
CROSS JOIN core.modulos parent
WHERE parent.slug = 'rdb.productos'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Paso 2: Backfill defensivo de permisos_rol.
-- Por cada (rol_id, modulo_padre) con permiso, copiar la misma combinación
-- (acceso_lectura, acceso_escritura) a cada modulo_hijo correspondiente.
-- Idempotente vía ON CONFLICT (rol_id, modulo_id) DO NOTHING.
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, child.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos parent ON parent.id = pr.modulo_id
JOIN core.modulos child  ON child.empresa_id = parent.empresa_id
WHERE
  (parent.slug = 'rdb.inventario' AND child.slug IN (
    'rdb.inventario.stock',
    'rdb.inventario.movimientos',
    'rdb.inventario.levantamientos'
  ))
  OR
  (parent.slug = 'rdb.productos' AND child.slug IN (
    'rdb.productos.catalogo',
    'rdb.productos.recetas',
    'rdb.productos.auditoria',
    'rdb.productos.analisis'
  ))
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

-- Reload PostgREST schema cache (defensive — los tipos no cambiaron pero
-- las nuevas filas en core.modulos se exponen vía PostgREST).
NOTIFY pgrst, 'reload schema';

COMMIT;
