-- MIGRATION: core.sidebar_oculto — denylist de items top-level del sidebar
--            ocultos globalmente (admin-controlado)
--
-- CONTEXTO:
--   El sidebar (components/app-shell/sidebar.tsx) muestra items top-level
--   mapeados a un "nav slug" vía NAV_TO_EMPRESA (dilesa, rdb, sanren,
--   personas_fisicas, settings). Para no-admins el RBAC ya filtra por empresa;
--   pero un admin ve TODO (bypass explícito en el sidebar).
--
--   Esta tabla deja que un admin OCULTE globalmente (incluido el propio admin)
--   ciertos items del sidebar — p.ej. esconder SANREN y Personas Físicas
--   mientras se presenta el sistema a empleados de DILESA.
--
--   Es una DENYLIST: la presencia de una fila = item oculto. Borrar la fila lo
--   vuelve a mostrar. Es SOLO visibilidad del menú: NO bloquea el acceso a la
--   ruta — el RBAC sigue gobernando el acceso real al contenido.
--
--   `nav_slug` NO es FK a core.empresas a propósito: algunos items del sidebar
--   (p.ej. personas_fisicas) son placeholders virtuales sin fila en
--   core.empresas. La clave es el slug de navegación, no la empresa.

BEGIN;

CREATE TABLE IF NOT EXISTS core.sidebar_oculto (
  nav_slug   text PRIMARY KEY,
  oculto_por uuid REFERENCES core.usuarios(id) ON DELETE SET NULL,
  oculto_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE core.sidebar_oculto IS
  'Denylist de items top-level del sidebar ocultos globalmente (incluido admin). Presencia de fila = oculto. Solo visibilidad de menú; el acceso real lo gobierna el RBAC. nav_slug = clave de NAV_TO_EMPRESA (no FK: incluye items virtuales como personas_fisicas).';

ALTER TABLE core.sidebar_oculto ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado. No es secreto qué items están
-- ocultos; el sidebar lo necesita para filtrar su render en cada sesión.
DROP POLICY IF EXISTS sidebar_oculto_select ON core.sidebar_oculto;
CREATE POLICY sidebar_oculto_select ON core.sidebar_oculto
  FOR SELECT TO authenticated
  USING (true);

-- Escritura (ocultar / mostrar): solo admin (core.fn_is_admin()).
DROP POLICY IF EXISTS sidebar_oculto_insert ON core.sidebar_oculto;
CREATE POLICY sidebar_oculto_insert ON core.sidebar_oculto
  FOR INSERT TO authenticated
  WITH CHECK (core.fn_is_admin());

DROP POLICY IF EXISTS sidebar_oculto_delete ON core.sidebar_oculto;
CREATE POLICY sidebar_oculto_delete ON core.sidebar_oculto
  FOR DELETE TO authenticated
  USING (core.fn_is_admin());

GRANT SELECT, INSERT, DELETE ON core.sidebar_oculto TO authenticated;

-- Seed: ocultar SANREN y Personas Físicas de arranque (para la presentación a
-- empleados de DILESA). El admin los re-muestra con el toggle cuando quiera.
INSERT INTO core.sidebar_oculto (nav_slug) VALUES
  ('sanren'),
  ('personas_fisicas')
ON CONFLICT (nav_slug) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
