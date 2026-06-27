-- ╭─ 20260627222645_modulos_dilesa_arrendamiento ─╮
-- Iniciativa `arrendamiento` · Sprint 1d — RBAC del módulo (ADR-014).
--
-- Registra el módulo UI `dilesa.arrendamiento` en core.modulos + backfill
-- defensivo de core.permisos_rol (por cada rol de DILESA × el módulo,
-- lectura+escritura) para que el page no se esconda a los no-admin
-- (canAccessModulo → false sin el backfill). Módulo simple (sin sub-slugs):
-- migrará a hub con tabs cuando se sumen Ocupación/Cobranza/Rentabilidad.
--
-- Aditiva. Patrón de 20260521225606_modulos_dilesa_portafolio.

BEGIN;

INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT 'dilesa.arrendamiento', 'Arrendamiento',
  'Contratos de arrendamiento de activos del portafolio (renta, cobranza, ocupación)',
  e.id, 'operaciones'
FROM core.empresas e
WHERE e.slug = 'dilesa'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Backfill defensivo de permisos (idempotente).
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT r.id, m.id, true, true
FROM core.roles r
JOIN core.empresas e ON e.id = r.empresa_id
JOIN core.modulos m ON m.empresa_id = r.empresa_id
WHERE e.slug = 'dilesa'
  AND m.slug = 'dilesa.arrendamiento'
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
