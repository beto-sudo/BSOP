-- Sub-slug `dilesa.construccion.costeo` — tab "Costeo" del hub Construcción.
--
-- Sprint 3 de la iniciativa `dilesa-contratos-obra`
-- (ver docs/planning/dilesa-contratos-obra.md):
--
--   /dilesa/construccion/costeo → tab "Costeo" → sub-slug `dilesa.construccion.costeo`
--
-- Vista de CapEx del desarrollo: presupuesto vs gasto real por concepto/etapa
-- (`dilesa.obra_presupuesto`, Capa A) + contratado/saldo de los contratos de
-- obra (`dilesa.contratos_construccion` + `dilesa.obra_estimaciones`, Capa B).
-- Ver ADR-038 (modelo) y ADR-030 (submodule permissions).
--
-- El padre `dilesa.construccion` se preserva como umbrella de sidebar; el
-- sub-slug gobierna el acceso real al tab (ADR-030 SS2/SS5).
--
-- Backfill defensivo (paso 2): por cada rol con permiso al padre, clona
-- (acceso_lectura, acceso_escritura) idéntico al hijo. Sin esto, agregar el
-- sub-slug ESCONDERÍA la tab a usuarios no-admin (canAccessModulo retorna
-- false cuando el slug no está en permissions.modulos).

BEGIN;

-- Paso 1: INSERT del sub-slug en core.modulos. Hereda empresa_id y seccion
-- del módulo padre `dilesa.construccion` vía CROSS JOIN. Idempotente.
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT s.slug, s.nombre, s.descripcion, parent.empresa_id, parent.seccion
FROM (
  VALUES
    (
      'dilesa.construccion.costeo',
      'Construcción · Costeo',
      'CapEx del desarrollo: presupuesto vs gasto real por concepto/etapa + saldo de contratos de obra (Sprint 3 dilesa-contratos-obra)'
    )
) AS s(slug, nombre, descripcion)
CROSS JOIN core.modulos parent
WHERE parent.slug = 'dilesa.construccion'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Paso 2: Backfill defensivo de permisos_rol. Por cada (rol_id, padre) con
-- permiso, copia (acceso_lectura, acceso_escritura) al hijo. Idempotente.
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, child.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos parent ON parent.id = pr.modulo_id
JOIN core.modulos child ON child.empresa_id = parent.empresa_id
WHERE
  parent.slug = 'dilesa.construccion'
  AND child.slug = 'dilesa.construccion.costeo'
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

-- Reload PostgREST schema cache (defensivo — los tipos no cambiaron pero las
-- nuevas filas en core.modulos se exponen vía PostgREST).
NOTIFY pgrst, 'reload schema';

COMMIT;
