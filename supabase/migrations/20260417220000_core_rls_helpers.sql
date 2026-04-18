-- Sprint 3 PR A — core helper functions used by the RLS sweep.
--
-- Everything here is SECURITY DEFINER + STABLE + search_path pinned so
-- it's safe to call from RLS policies. The policies themselves stay
-- SECURITY INVOKER (the default); they just call these helpers to
-- resolve the querying user.
--
-- Pattern used by policies after this lands:
--
--   -- Operational table scoped by empresa_id
--   CREATE POLICY t_select ON erp.foo FOR SELECT TO authenticated
--     USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
--
--   CREATE POLICY t_write ON erp.foo FOR INSERT TO authenticated
--     WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
--
-- STABLE lets Postgres cache the result across rows in one query so a
-- SELECT over 10 K rows doesn't call auth.jwt() ten thousand times.

-- ───────────────────────────────────────────────────────────────────────
-- core.fn_current_user_id()
-- Returns the core.usuarios.id matching the current JWT email, or NULL
-- for anon / service-role / missing claim. Active filter is not applied
-- here on purpose — callers that care should combine with fn_is_admin /
-- fn_has_empresa which DO filter on `activo`.
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION core.fn_current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT id
    FROM core.usuarios
   WHERE email = lower(coalesce(auth.jwt() ->> 'email', ''))
   LIMIT 1;
$$;

COMMENT ON FUNCTION core.fn_current_user_id() IS
  'Resolve the current JWT email → core.usuarios.id. STABLE so RLS can cache it per query. Returns NULL for anon / missing email claim.';


-- ───────────────────────────────────────────────────────────────────────
-- core.fn_current_empresa_ids()
-- Empresas the querying user belongs to (only active memberships on an
-- active account). Returns an empty set for anon.
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION core.fn_current_empresa_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT ue.empresa_id
    FROM core.usuarios u
    JOIN core.usuarios_empresas ue ON ue.usuario_id = u.id
   WHERE u.email = lower(coalesce(auth.jwt() ->> 'email', ''))
     AND u.activo = true
     AND ue.activo = true;
$$;

COMMENT ON FUNCTION core.fn_current_empresa_ids() IS
  'Empresa IDs the current JWT user has an active membership in. Empty set for anon / inactive users.';


-- ───────────────────────────────────────────────────────────────────────
-- core.fn_has_empresa(empresa_id)
-- Convenience wrapper: true iff the given empresa_id is in the caller's
-- empresa set. Use in RLS predicates.
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION core.fn_has_empresa(p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM core.usuarios u
      JOIN core.usuarios_empresas ue ON ue.usuario_id = u.id
     WHERE u.email = lower(coalesce(auth.jwt() ->> 'email', ''))
       AND u.activo = true
       AND ue.activo = true
       AND ue.empresa_id = p_empresa_id
  );
$$;

COMMENT ON FUNCTION core.fn_has_empresa(uuid) IS
  'True iff the current JWT user has an active membership in the given empresa_id.';


-- ───────────────────────────────────────────────────────────────────────
-- core.fn_is_admin()
-- True iff the current JWT user has rol = ''admin'' on an active account.
-- Admins bypass empresa scoping in write policies.
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION core.fn_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM core.usuarios
     WHERE email = lower(coalesce(auth.jwt() ->> 'email', ''))
       AND activo = true
       AND rol = 'admin'
  );
$$;

COMMENT ON FUNCTION core.fn_is_admin() IS
  'True iff the current JWT user has core.usuarios.rol = ''admin'' and activo = true.';


-- ───────────────────────────────────────────────────────────────────────
-- Grants — these fns live in `core`, which isn''t in the default exposed
-- schemas for PostgREST clients, but policies invoking them still work
-- because RLS runs inside the planner with no API gating. We grant
-- EXECUTE to authenticated + anon to be safe (the fns themselves return
-- empty / false for anon, so no info leak).
-- ───────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION core.fn_current_user_id()     TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION core.fn_current_empresa_ids() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION core.fn_has_empresa(uuid)     TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION core.fn_is_admin()            TO authenticated, anon, service_role;
