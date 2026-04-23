-- Sprint drift-1 · Mig 5 de 6
-- Mueve public.profile → core.profiles (renombrado a plural por consistencia
-- con el resto de core.*) y public.user_presence → core.user_presence.
-- Deja compat views en public para que los callers (hooks/use-presence.ts,
-- supabase-js client default schema) sigan funcionando.
--
-- EDITED 2026-04-23 (drift-1.5): hardened para que sea idempotente y safe
-- contra Preview Branches donde el bootstrap pre-migration creó BOTH
-- public.profile (table original) AND core.profiles (state actual de prod).
-- Detecta el estado real antes de hacer el move/rename y compensa.

DO $do$
BEGIN
  -- ── profile → core.profiles ─────────────────────────────────────────
  -- Caso A (prod first apply): core.profiles no existe, public.profile sí (TABLE).
  -- Caso B (Preview Branch): ambos existen como TABLE; preferimos core.profiles
  --        (es la canónica) y dropeamos la duplicada en public.
  IF to_regclass('core.profiles') IS NULL
     AND to_regclass('public.profile') IS NOT NULL THEN
    ALTER TABLE public.profile SET SCHEMA core;
    ALTER TABLE core.profile RENAME TO profiles;
  ELSIF to_regclass('core.profiles') IS NOT NULL
        AND EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name = 'profile'
                      AND table_type = 'BASE TABLE') THEN
    -- Both existen como TABLE → la de public está duplicada, dropear.
    DROP TABLE public.profile;
  END IF;

  -- ── user_presence → core.user_presence ──────────────────────────────
  IF to_regclass('core.user_presence') IS NULL
     AND to_regclass('public.user_presence') IS NOT NULL THEN
    ALTER TABLE public.user_presence SET SCHEMA core;
  ELSIF to_regclass('core.user_presence') IS NOT NULL
        AND EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name = 'user_presence'
                      AND table_type = 'BASE TABLE') THEN
    DROP TABLE public.user_presence;
  END IF;
END $do$;

-- ── Grants en las tablas movidas (limpiando anon que era drift) ─────
DO $do$
BEGIN
  IF to_regclass('core.profiles') IS NOT NULL
     AND to_regclass('core.user_presence') IS NOT NULL THEN
    REVOKE ALL ON core.profiles       FROM anon;
    REVOKE ALL ON core.user_presence  FROM anon;
    GRANT  SELECT                         ON core.profiles, core.user_presence TO authenticator;
    GRANT  SELECT, INSERT, UPDATE, DELETE ON core.profiles, core.user_presence TO authenticated, service_role;
  END IF;
END $do$;

-- ── Compat views en public (SHIMS — drop 2026-05-06) ────────────────
-- `public.profile` (singular) → `core.profiles` (plural) como shim para
-- cualquier caller que aún haga .from('profile').
DO $do$
BEGIN
  IF to_regclass('core.profiles') IS NOT NULL
     AND to_regclass('core.user_presence') IS NOT NULL THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.profile
               WITH (security_invoker = on)
               AS SELECT * FROM core.profiles';
    EXECUTE 'COMMENT ON VIEW public.profile IS ''TEMPORAL SHIM - drop on 2026-05-06 after callers migrate to core.profiles.''';

    EXECUTE 'CREATE OR REPLACE VIEW public.user_presence
               WITH (security_invoker = on)
               AS SELECT * FROM core.user_presence';
    EXECUTE 'COMMENT ON VIEW public.user_presence IS ''TEMPORAL SHIM - drop on 2026-05-06 after callers migrate to core.user_presence.''';

    GRANT SELECT                         ON public.profile, public.user_presence TO authenticator;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile, public.user_presence TO authenticated, service_role;
  END IF;
END $do$;
