-- ╭─ 20260626033843_dilesa_modulo_contabilidad ─╮
-- Iniciativa dilesa-catalogo-contable · Sprint 2 · módulo Contabilidad (RBAC).
-- Registra el módulo nuevo `dilesa.contabilidad` (página: Catálogo de cuentas)
-- en el sidebar de DILESA. Módulo plano por ahora (una sola página); cuando
-- lleguen Balance/Movimientos se vuelve hub con sub-slugs (ADR-030).
--
-- 4 lugares de ADR-014 (este es el 4º): NAV_ITEMS + ROUTE_TO_MODULE +
-- EXPECTED_DB_MODULE_SLUGS van en el mismo PR.
--
-- Backfill defensivo: clona los permisos de `dilesa.cxp` al módulo nuevo, por
-- cada rol — así quien ya opera CxP ve Contabilidad y nadie pierde acceso; el
-- ajuste fino por rol lo hace Beto en la matriz. Sin el backfill, agregar el
-- slug ESCONDE el módulo a no-admins (canAccessModulo → false).

BEGIN;

-- 1. Módulo nuevo. `seccion='tesoreria'` (agrupa con CxC/CxP/Bancos en la UI
--    de Roles por sección).
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT 'dilesa.contabilidad', 'Contabilidad',
       'Catálogo de cuentas contables (estructura CONTPAQi / agrupador SAT)',
       d.id, 'tesoreria'
FROM (SELECT id FROM core.empresas WHERE slug = 'dilesa') d
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- 2. Backfill defensivo de permisos (clona de `dilesa.cxp`, módulo adyacente).
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, nuevo.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos src ON src.id = pr.modulo_id AND src.slug = 'dilesa.cxp'
JOIN core.modulos nuevo ON nuevo.empresa_id = src.empresa_id
  AND nuevo.slug = 'dilesa.contabilidad'
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
