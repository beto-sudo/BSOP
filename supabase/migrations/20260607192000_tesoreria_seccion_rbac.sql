-- Iniciativa: tesoreria · Sprint 2 — sección Tesorería + reubicar CxC/CxP + módulo Saldos Bancos
-- Ver docs/planning/tesoreria.md. Sigue las 4 reglas de "Liberación de módulo nuevo".

-- 1. Agregar 'tesoreria' a las secciones válidas (ADR-014)
ALTER TABLE core.modulos DROP CONSTRAINT IF EXISTS modulos_seccion_check;
ALTER TABLE core.modulos ADD CONSTRAINT modulos_seccion_check
  CHECK (seccion = ANY (ARRAY[
    'operativa', 'administracion', 'rh', 'compras',
    'inventario', 'operaciones', 'sistema', 'tesoreria'
  ]));

-- 2. Reubicar CxC (cobranza*) y CxP (cxp*) de 'administracion' a 'tesoreria'.
--    Solo cambia el agrupamiento de sidebar/sección; las URLs y sub-slugs no cambian.
UPDATE core.modulos m
SET seccion = 'tesoreria'
FROM core.empresas e
WHERE m.empresa_id = e.id
  AND e.nombre ILIKE '%dilesa%'
  AND (m.slug LIKE 'dilesa.cobranza%' OR m.slug LIKE 'dilesa.cxp%');

-- 3. Módulo nuevo Saldos Bancos (plano, sin tabs)
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT 'dilesa.saldos-bancos', 'Saldos Bancos',
       'Captura de saldos bancarios con historial', e.id, 'tesoreria'
FROM core.empresas e
WHERE e.nombre ILIKE '%dilesa%'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- 4. Backfill defensivo de permisos: clona los permisos de CxP (módulo análogo de
--    tesorería) a Saldos Bancos, por rol. Sin esto, agregar el slug esconde el
--    módulo a los no-admin (canAccessModulo retorna false si el slug no está en
--    permissions.modulos).
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, nuevo.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos cxp   ON cxp.id = pr.modulo_id AND cxp.slug = 'dilesa.cxp'
JOIN core.modulos nuevo ON nuevo.slug = 'dilesa.saldos-bancos'
                       AND nuevo.empresa_id = cxp.empresa_id
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
