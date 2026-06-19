-- Hub-índice de Reportes + tab Reportes del hub Ventas (DILESA).
--
-- Iniciativa `dilesa-reportes` (Sprint 1, ADR-047 «reporte = preset + vista + PDF»).
-- Libera dos módulos RBAC:
--
--   /dilesa/reportes         → dilesa.reportes          (hub-índice, catálogo)
--   /dilesa/ventas/reportes  → dilesa.ventas.reportes   (tab del hub Ventas)
--
-- Arquitectura híbrida (ADR-047): los reportes viven en su módulo (el tab de
-- Ventas); el hub-índice solo los descubre y enlaza. Ambos se otorgan a quien ya
-- ve la lista de ventas (`dilesa.ventas.lista`) — backfill defensivo; sin él, el
-- módulo nuevo quedaría escondido para no-admins (canAccessModulo → false). El
-- control fino de permisos lo afina Dirección en la matriz de roles después.
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión).

BEGIN;

-- Paso 1: Crear los dos módulos. Heredan empresa_id y seccion ('Inmobiliario')
-- del hub Ventas (`dilesa.ventas.lista`) vía CROSS JOIN — misma empresa, misma
-- sección del sidebar.
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT s.slug, s.nombre, s.descripcion, parent.empresa_id, parent.seccion
FROM (
  VALUES
    ('dilesa.reportes', 'Reportes', 'Hub-índice de reportes operativos de DILESA (catálogo + buscador)'),
    ('dilesa.ventas.reportes', 'Ventas · Reportes', 'Reportes operativos del proceso de comercialización (pantalla + PDF)')
) AS s(slug, nombre, descripcion)
CROSS JOIN core.modulos parent
WHERE parent.slug = 'dilesa.ventas.lista'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Paso 2: Backfill defensivo de permisos_rol. Por cada (rol, dilesa.ventas.lista)
-- con permiso, clonar (acceso_lectura, acceso_escritura) idéntico a cada módulo
-- nuevo. Idempotente vía ON CONFLICT (rol_id, modulo_id) DO NOTHING.
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, child.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos parent ON parent.id = pr.modulo_id
JOIN core.modulos child ON child.empresa_id = parent.empresa_id
WHERE parent.slug = 'dilesa.ventas.lista'
  AND child.slug IN ('dilesa.reportes', 'dilesa.ventas.reportes')
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

-- Reload PostgREST schema cache (las nuevas filas en core.modulos se exponen
-- vía PostgREST; los tipos no cambiaron).
NOTIFY pgrst, 'reload schema';

COMMIT;
