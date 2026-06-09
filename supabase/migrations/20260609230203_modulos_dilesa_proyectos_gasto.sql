-- ╭─ 20260609230203_modulos_dilesa_proyectos_gasto ─╮
-- Sub-slug `dilesa.proyectos.gasto` — tab "Gasto" del detalle de proyecto.
--
-- Iniciativa `dilesa-flujo-gasto` · Sprint 2 (el home del gasto). El control
-- presupuestal (Costeo, 3 capas de erp.v_partida_control) se MUDA de
-- Construcción › Costeo al detalle del proyecto (decisión D1 del planning:
-- una sola superficie, el costeo es del proyecto). La ruta vieja queda como
-- aviso de mudanza; el slug viejo `dilesa.construccion.costeo` se conserva
-- (gobierna ese aviso) y NO se borra en esta migración.
--
-- Backfill defensivo (ADR-030): los permisos del sub-slug nuevo se clonan de
-- `dilesa.construccion.costeo` — quien veía/editaba Costeo ve/edita Gasto.
-- Sin esto, el tab quedaría escondido para todo no-admin (canAccessModulo
-- devuelve false para slugs sin fila en permisos_rol).
--
-- Robusta a Preview: hereda empresa_id/seccion del módulo padre vía
-- CROSS JOIN (sin UUIDs hardcodeados) y los INSERT son no-op si los slugs
-- base no existen.
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión).

BEGIN;

-- Paso 1: el sub-slug, heredando empresa_id y seccion de dilesa.proyectos.
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT s.slug, s.nombre, s.descripcion, parent.empresa_id, parent.seccion
FROM (
  VALUES
    ('dilesa.proyectos.gasto', 'Proyectos · Gasto',
     'Control presupuestal del proyecto: presupuesto, comprometido, ejercido y pagado por partida')
) AS s(slug, nombre, descripcion)
CROSS JOIN core.modulos parent
WHERE parent.slug = 'dilesa.proyectos'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- Paso 2: backfill defensivo — clonar permisos de dilesa.construccion.costeo
-- (la superficie que se muda), no del padre: preserva exactamente quién podía
-- ver/editar el costeo.
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT pr.rol_id, hijo.id, pr.acceso_lectura, pr.acceso_escritura
FROM core.permisos_rol pr
JOIN core.modulos viejo ON viejo.id = pr.modulo_id AND viejo.slug = 'dilesa.construccion.costeo'
JOIN core.modulos hijo
  ON hijo.slug = 'dilesa.proyectos.gasto'
 AND hijo.empresa_id = viejo.empresa_id
WHERE NOT EXISTS (
  SELECT 1 FROM core.permisos_rol x
  WHERE x.rol_id = pr.rol_id AND x.modulo_id = hijo.id
);

NOTIFY pgrst, 'reload schema';

COMMIT;
