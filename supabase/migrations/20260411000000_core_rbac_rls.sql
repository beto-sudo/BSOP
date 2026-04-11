-- ─── Grant schema usage + table SELECT to authenticated users ─────────────────
GRANT USAGE ON SCHEMA core TO authenticated;

GRANT SELECT ON core.usuarios TO authenticated;
GRANT SELECT ON core.empresas TO authenticated;
GRANT SELECT ON core.modulos TO authenticated;
GRANT SELECT ON core.roles TO authenticated;
GRANT SELECT ON core.permisos_rol TO authenticated;
GRANT SELECT ON core.usuarios_empresas TO authenticated;
GRANT SELECT ON core.permisos_usuario_excepcion TO authenticated;

-- ─── Enable RLS on core tables ────────────────────────────────────────────────
ALTER TABLE core.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.modulos ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.permisos_rol ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.usuarios_empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.permisos_usuario_excepcion ENABLE ROW LEVEL SECURITY;

-- ─── RLS Policies ─────────────────────────────────────────────────────────────

-- usuarios: each user can only read their own row
DROP POLICY IF EXISTS "usuarios_select_own" ON core.usuarios;
CREATE POLICY "usuarios_select_own"
  ON core.usuarios FOR SELECT TO authenticated
  USING (lower(email) = lower(auth.email()));

-- empresas / modulos / roles / permisos_rol: config data, readable by all authenticated
DROP POLICY IF EXISTS "empresas_select_auth" ON core.empresas;
CREATE POLICY "empresas_select_auth"
  ON core.empresas FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "modulos_select_auth" ON core.modulos;
CREATE POLICY "modulos_select_auth"
  ON core.modulos FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "roles_select_auth" ON core.roles;
CREATE POLICY "roles_select_auth"
  ON core.roles FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "permisos_rol_select_auth" ON core.permisos_rol;
CREATE POLICY "permisos_rol_select_auth"
  ON core.permisos_rol FOR SELECT TO authenticated
  USING (true);

-- usuarios_empresas: user can only see their own empresa assignments
DROP POLICY IF EXISTS "usuarios_empresas_select_own" ON core.usuarios_empresas;
CREATE POLICY "usuarios_empresas_select_own"
  ON core.usuarios_empresas FOR SELECT TO authenticated
  USING (
    usuario_id = (
      SELECT id FROM core.usuarios
      WHERE lower(email) = lower(auth.email())
      LIMIT 1
    )
  );

-- permisos_usuario_excepcion: user can only see their own exceptions
DROP POLICY IF EXISTS "permisos_usuario_excepcion_select_own" ON core.permisos_usuario_excepcion;
CREATE POLICY "permisos_usuario_excepcion_select_own"
  ON core.permisos_usuario_excepcion FOR SELECT TO authenticated
  USING (
    usuario_id = (
      SELECT id FROM core.usuarios
      WHERE lower(email) = lower(auth.email())
      LIMIT 1
    )
  );

-- ─── Reload PostgREST ─────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
