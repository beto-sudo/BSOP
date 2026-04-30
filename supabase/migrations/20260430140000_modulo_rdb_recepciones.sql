-- Crea el módulo `rdb.recepciones` en core.modulos + backfill defensivo de
-- permisos clonando los permisos actuales de `rdb.ordenes_compra` para
-- preservar el status quo entre el `apply` de esta migración y el ajuste
-- fino que Beto hace manualmente por rol.
--
-- Contexto: iniciativa `oc-recepciones-modulo` (ver
-- docs/planning/oc-recepciones-modulo.md). Hoy todo el ciclo OC vive en un
-- solo módulo RBAC (`rdb.ordenes_compra`) — quien tiene escritura accede
-- a TODO (crear, enviar, imprimir, cerrar, cancelar, override de precio, Y
-- recibir mercancía). Esta migración agrega el slug nuevo `rdb.recepciones`
-- al catálogo, dejando la división fina de permisos por rol en manos de
-- Beto post-aplicación.
--
-- Pasos:
--   1. INSERT del slug `rdb.recepciones` en core.modulos (sección 'compras').
--   2. Backfill defensivo: por cada `(rol_id, modulo_id)` existente en
--      core.permisos_rol para `rdb.ordenes_compra` en RDB, clonar
--      acceso_lectura y acceso_escritura al `rdb.recepciones` recién creado.
--      Sin esto, el módulo nuevo quedaría INVISIBLE a no-admin users (regla
--      de "Liberación de módulo nuevo (RBAC sync)" en BSOP/CLAUDE.md).
--      Beto luego rebaja Gerente en módulo OC y/o ajusta otros roles según
--      el modelo operativo final.
--   3. NOTIFY pgrst para refrescar el cache de schema.

BEGIN;

-- Paso 1: Insertar el módulo en core.modulos.
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT 'rdb.recepciones',
       'Recepciones',
       'Captura de recepciones de productos contra OCs enviadas + cancelación de pendiente por línea',
       e.empresa_id,
       'compras'
FROM (SELECT id AS empresa_id FROM core.empresas WHERE slug = 'rdb') AS e
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Paso 2: Backfill defensivo — clonar permisos de `rdb.ordenes_compra` →
-- `rdb.recepciones` para cada rol existente en RDB. Idempotente vía
-- ON CONFLICT.
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id,
       m_new.id,
       pr.acceso_lectura,
       pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos m_oc
  ON m_oc.id = pr.modulo_id
JOIN core.empresas e
  ON e.id = m_oc.empresa_id
JOIN core.modulos m_new
  ON m_new.empresa_id = e.id
 AND m_new.slug = 'rdb.recepciones'
WHERE e.slug = 'rdb'
  AND m_oc.slug = 'rdb.ordenes_compra'
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

-- Reload PostgREST schema cache.
NOTIFY pgrst, 'reload schema';

COMMIT;
