-- ╭─ 20260612024520_core_rol_plantillas ─╮
-- core.rol_plantillas + core.rol_plantilla_items — plantillas de permisos
-- para crear roles desde la pantalla de Accesos (accesos-intuitivos S3).
--
-- CONTEXTO:
--   Crear un rol bien configurado exige marcar el set correcto de permisos en
--   la matriz — conocimiento que hoy vive en la cabeza de quien lo armó la
--   última vez (caso Nelcy). Una plantilla captura ese set con nombre de
--   negocio ("Vendedor", "Mesa de control") y se aplica al crear un rol nuevo.
--
--   Modelo: header por empresa (los slugs de módulo llevan prefijo de empresa,
--   no hay plantillas cross-empresa) + items con FK a core.modulos. Si un
--   módulo se elimina, sus items caen solos (CASCADE); al aplicar la plantilla
--   la app expande los requisitos de navegación (lib/permissions-deps.ts) para
--   que el rol resultante sea coherente aunque la plantilla envejezca.
--
--   Las plantillas NO otorgan permisos por sí mismas: son catálogo. El grant
--   real ocurre cuando un admin crea un rol desde la pantalla de Accesos
--   (admin-only) y la action inserta en core.permisos_rol.
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión:
-- estrictamente mayor que toda migración local + de PRs abiertos).

BEGIN;

-- ── Tablas ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core.rol_plantillas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES core.empresas(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  descripcion text,
  created_by  uuid REFERENCES core.usuarios(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rol_plantillas_empresa_nombre_uq UNIQUE (empresa_id, nombre)
);

COMMENT ON TABLE core.rol_plantillas IS
  'Plantillas de permisos por empresa para crear roles desde la pantalla de Accesos (accesos-intuitivos S3). Catálogo: no otorga permisos por sí misma; la action de crear rol copia los items a core.permisos_rol expandiendo requisitos de navegación.';

CREATE TABLE IF NOT EXISTS core.rol_plantilla_items (
  plantilla_id     uuid NOT NULL REFERENCES core.rol_plantillas(id) ON DELETE CASCADE,
  modulo_id        uuid NOT NULL REFERENCES core.modulos(id) ON DELETE CASCADE,
  acceso_lectura   boolean NOT NULL DEFAULT false,
  acceso_escritura boolean NOT NULL DEFAULT false,
  PRIMARY KEY (plantilla_id, modulo_id)
);

COMMENT ON TABLE core.rol_plantilla_items IS
  'Permisos (lectura/escritura por módulo) de una plantilla de rol. Solo se guardan permisos encendidos: un item todo-false no aporta al aplicar sobre un rol nuevo.';

DROP TRIGGER IF EXISTS core_rol_plantillas_updated_at ON core.rol_plantillas;
CREATE TRIGGER core_rol_plantillas_updated_at
  BEFORE UPDATE ON core.rol_plantillas
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

-- ── RLS (patrón core.sidebar_oculto: lectura authenticated, escritura admin) ─

ALTER TABLE core.rol_plantillas ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.rol_plantilla_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rol_plantillas_select ON core.rol_plantillas;
CREATE POLICY rol_plantillas_select ON core.rol_plantillas
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS rol_plantillas_insert ON core.rol_plantillas;
CREATE POLICY rol_plantillas_insert ON core.rol_plantillas
  FOR INSERT TO authenticated
  WITH CHECK (core.fn_is_admin());

DROP POLICY IF EXISTS rol_plantillas_update ON core.rol_plantillas;
CREATE POLICY rol_plantillas_update ON core.rol_plantillas
  FOR UPDATE TO authenticated
  USING (core.fn_is_admin())
  WITH CHECK (core.fn_is_admin());

DROP POLICY IF EXISTS rol_plantillas_delete ON core.rol_plantillas;
CREATE POLICY rol_plantillas_delete ON core.rol_plantillas
  FOR DELETE TO authenticated
  USING (core.fn_is_admin());

DROP POLICY IF EXISTS rol_plantilla_items_select ON core.rol_plantilla_items;
CREATE POLICY rol_plantilla_items_select ON core.rol_plantilla_items
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS rol_plantilla_items_insert ON core.rol_plantilla_items;
CREATE POLICY rol_plantilla_items_insert ON core.rol_plantilla_items
  FOR INSERT TO authenticated
  WITH CHECK (core.fn_is_admin());

DROP POLICY IF EXISTS rol_plantilla_items_update ON core.rol_plantilla_items;
CREATE POLICY rol_plantilla_items_update ON core.rol_plantilla_items
  FOR UPDATE TO authenticated
  USING (core.fn_is_admin())
  WITH CHECK (core.fn_is_admin());

DROP POLICY IF EXISTS rol_plantilla_items_delete ON core.rol_plantilla_items;
CREATE POLICY rol_plantilla_items_delete ON core.rol_plantilla_items
  FOR DELETE TO authenticated
  USING (core.fn_is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON core.rol_plantillas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON core.rol_plantilla_items TO authenticated;

-- ── Seed: los 2 perfiles reales de Ventas DILESA (planning S3) ───────────────
--
-- Snapshot de los roles que ya operan en prod tras el saneo del caso Nelcy
-- (2026-06-11): "Vendedor" y "Nelcy" (mesa de control). Solo permisos
-- encendidos. Robusto a Preview sin datos: JOIN a empresas/modulos por slug +
-- ON CONFLICT — si no existen, inserta 0 filas sin fallar (ver
-- feedback_migraciones_datos_preview).

INSERT INTO core.rol_plantillas (empresa_id, nombre, descripcion)
SELECT e.id, v.nombre, v.descripcion
FROM core.empresas e
JOIN (VALUES
  ('Vendedor',
   'Captura solicitudes (Fase 1), gestiona clientes y consulta todo el pipeline de ventas en lectura.'),
  ('Mesa de control',
   'Asigna unidades (Fase 2: Autorizar), formaliza (Fase 3) y consulta lista, clientes y vendedores.')
) AS v(nombre, descripcion) ON true
WHERE e.slug = 'dilesa'
ON CONFLICT (empresa_id, nombre) DO NOTHING;

INSERT INTO core.rol_plantilla_items (plantilla_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT p.id, m.id, v.lectura, v.escritura
FROM (VALUES
  -- Vendedor — espejo del rol "Vendedor" DILESA en prod
  ('Vendedor', 'dilesa.ventas',                            true, true),
  ('Vendedor', 'dilesa.ventas.lista',                      true, false),
  ('Vendedor', 'dilesa.ventas.clientes',                   true, true),
  ('Vendedor', 'dilesa.ventas.fase01_solicitud',           true, true),
  ('Vendedor', 'dilesa.ventas.fases',                      true, false),
  ('Vendedor', 'dilesa.ventas.inventario',                 true, false),
  ('Vendedor', 'dilesa.ventas.fase02_asignada',            true, false),
  ('Vendedor', 'dilesa.ventas.fase03_formalizada',         true, false),
  ('Vendedor', 'dilesa.ventas.fase04_solicitud_avaluo',    true, false),
  ('Vendedor', 'dilesa.ventas.fase05_avaluo_cerrado',      true, false),
  ('Vendedor', 'dilesa.ventas.fase06_inscrita',            true, false),
  ('Vendedor', 'dilesa.ventas.fase07_solicitud_dictamen',  true, false),
  ('Vendedor', 'dilesa.ventas.fase08_dictaminada',         true, false),
  ('Vendedor', 'dilesa.ventas.fase09_validacion_patronal', true, false),
  ('Vendedor', 'dilesa.ventas.fase10_firmas_programadas',  true, false),
  ('Vendedor', 'dilesa.ventas.fase11_escriturada',         true, false),
  ('Vendedor', 'dilesa.ventas.fase12_detonada',            true, false),
  ('Vendedor', 'dilesa.ventas.fase13_facturada',           true, false),
  ('Vendedor', 'dilesa.ventas.fase14_preparada_entrega',   true, false),
  ('Vendedor', 'dilesa.ventas.fase15_entregada',           true, false),
  ('Vendedor', 'dilesa.ventas.fase16_conformidad',         true, false),
  ('Vendedor', 'dilesa.ventas.fase17_operacion_terminada', true, false),
  ('Vendedor', 'dilesa.manual',                            true, false),
  -- Mesa de control — espejo del rol "Nelcy" DILESA en prod (post-saneo)
  ('Mesa de control', 'dilesa.ventas',                      true, true),
  ('Mesa de control', 'dilesa.ventas.lista',                true, false),
  ('Mesa de control', 'dilesa.ventas.autorizar',            true, true),
  ('Mesa de control', 'dilesa.ventas.fase02_asignada',      true, true),
  ('Mesa de control', 'dilesa.ventas.fase03_formalizada',   true, true),
  ('Mesa de control', 'dilesa.ventas.clientes',             true, false),
  ('Mesa de control', 'dilesa.ventas.fases',                true, false),
  ('Mesa de control', 'dilesa.ventas.vendedores',           true, false)
) AS v(plantilla, slug, lectura, escritura)
JOIN core.empresas e ON e.slug = 'dilesa'
JOIN core.rol_plantillas p ON p.empresa_id = e.id AND p.nombre = v.plantilla
JOIN core.modulos m ON m.empresa_id = e.id AND m.slug = v.slug
ON CONFLICT (plantilla_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
