-- Sprint drift-1 · Mig 5 de 6
-- Mueve public.profile → core.profiles (renombrado a plural por consistencia
-- con el resto de core.*) y public.user_presence → core.user_presence.
-- Deja compat views en public para que los callers (hooks/use-presence.ts,
-- supabase-js client default schema) sigan funcionando.
--
-- Nota realtime: la publicación `supabase_realtime` mantiene la membresía
-- por OID; la tabla sigue publicada tras el SET SCHEMA. PERO el filtro
-- lado cliente (`schema: 'public'` en hooks/use-presence.ts) apunta al
-- schema viejo y deja de recibir eventos. El hook se actualiza a
-- `schema: 'core'` en el mismo PR. La vista compat en public.user_presence
-- NO se agrega al publication (Postgres sólo publica tablas base).

-- ── profile → core.profiles (rename plural) ─────────────────────────
ALTER TABLE public.profile SET SCHEMA core;
ALTER TABLE core.profile RENAME TO profiles;

-- ── user_presence → core.user_presence ──────────────────────────────
ALTER TABLE public.user_presence SET SCHEMA core;

-- ── Grants en las tablas movidas (limpiando anon que era drift) ─────
REVOKE ALL ON core.profiles       FROM anon;
REVOKE ALL ON core.user_presence  FROM anon;
GRANT  SELECT                         ON core.profiles, core.user_presence TO authenticator;
GRANT  SELECT, INSERT, UPDATE, DELETE ON core.profiles, core.user_presence TO authenticated, service_role;

-- ── Compat views en public (SHIMS — drop 2026-05-06) ────────────────
-- `public.profile` (singular) → `core.profiles` (plural) como shim para
-- cualquier caller que aún haga .from('profile'). Código app ya no tiene
-- llamadas `.from('profile')` en TypeScript; el shim cubre remanentes.

CREATE OR REPLACE VIEW public.profile
  WITH (security_invoker = on)
  AS SELECT * FROM core.profiles;
COMMENT ON VIEW public.profile IS
  'TEMPORAL SHIM - drop on 2026-05-06 after callers migrate to core.profiles.';

CREATE OR REPLACE VIEW public.user_presence
  WITH (security_invoker = on)
  AS SELECT * FROM core.user_presence;
COMMENT ON VIEW public.user_presence IS
  'TEMPORAL SHIM - drop on 2026-05-06 after callers migrate to core.user_presence.';

GRANT SELECT                         ON public.profile, public.user_presence TO authenticator;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile, public.user_presence TO authenticated, service_role;
