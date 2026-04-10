-- ============================================================
-- MIGRATION: 20260410100000_playtomic_schema
-- Playtomic schema, tables, indexes, views, grants, and RLS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS playtomic;

CREATE OR REPLACE FUNCTION playtomic.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS playtomic.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id TEXT NOT NULL UNIQUE,
  object_id TEXT,
  resource_id TEXT,
  resource_name TEXT,
  sport_id TEXT,
  booking_start TIMESTAMPTZ,
  booking_end TIMESTAMPTZ,
  duration_min INTEGER,
  origin TEXT,
  price_amount NUMERIC(10,2),
  price_currency TEXT,
  booking_type TEXT,
  payment_status TEXT,
  status TEXT,
  is_canceled BOOLEAN NOT NULL DEFAULT false,
  owner_id TEXT,
  coach_ids TEXT[],
  course_id TEXT,
  course_name TEXT,
  activity_id TEXT,
  activity_name TEXT,
  raw_json JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS playtomic.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playtomic_id TEXT NOT NULL UNIQUE,
  name TEXT,
  email TEXT,
  player_type TEXT,
  accepts_commercial BOOLEAN,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  total_bookings INTEGER NOT NULL DEFAULT 0,
  total_spend NUMERIC(10,2) NOT NULL DEFAULT 0,
  favorite_sport TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS playtomic.booking_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id TEXT NOT NULL REFERENCES playtomic.bookings(booking_id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES playtomic.players(playtomic_id) ON DELETE CASCADE,
  is_owner BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT booking_participants_booking_player_key UNIQUE (booking_id, player_id)
);

CREATE TABLE IF NOT EXISTS playtomic.resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id TEXT NOT NULL UNIQUE,
  resource_name TEXT,
  sport_id TEXT,
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS playtomic.sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  bookings_fetched INTEGER,
  bookings_upserted INTEGER,
  players_upserted INTEGER,
  error_message TEXT,
  date_range_start TIMESTAMPTZ,
  date_range_end TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS playtomic_bookings_booking_start_idx
  ON playtomic.bookings (booking_start DESC);

CREATE INDEX IF NOT EXISTS playtomic_bookings_resource_name_booking_start_idx
  ON playtomic.bookings (resource_name, booking_start DESC);

CREATE INDEX IF NOT EXISTS playtomic_bookings_sport_id_booking_start_idx
  ON playtomic.bookings (sport_id, booking_start DESC);

CREATE INDEX IF NOT EXISTS playtomic_bookings_status_idx
  ON playtomic.bookings (status);

CREATE INDEX IF NOT EXISTS playtomic_bookings_owner_id_idx
  ON playtomic.bookings (owner_id);

CREATE INDEX IF NOT EXISTS playtomic_players_email_idx
  ON playtomic.players (email);

CREATE INDEX IF NOT EXISTS playtomic_players_last_seen_at_idx
  ON playtomic.players (last_seen_at DESC);

CREATE INDEX IF NOT EXISTS playtomic_booking_participants_booking_id_idx
  ON playtomic.booking_participants (booking_id);

CREATE INDEX IF NOT EXISTS playtomic_booking_participants_player_id_idx
  ON playtomic.booking_participants (player_id);

CREATE INDEX IF NOT EXISTS playtomic_resources_sport_id_idx
  ON playtomic.resources (sport_id);

CREATE INDEX IF NOT EXISTS playtomic_sync_log_started_at_idx
  ON playtomic.sync_log (started_at DESC);

DROP TRIGGER IF EXISTS trg_playtomic_bookings_updated_at ON playtomic.bookings;
CREATE TRIGGER trg_playtomic_bookings_updated_at
BEFORE UPDATE ON playtomic.bookings
FOR EACH ROW EXECUTE FUNCTION playtomic.set_updated_at();

DROP TRIGGER IF EXISTS trg_playtomic_players_updated_at ON playtomic.players;
CREATE TRIGGER trg_playtomic_players_updated_at
BEFORE UPDATE ON playtomic.players
FOR EACH ROW EXECUTE FUNCTION playtomic.set_updated_at();

CREATE OR REPLACE VIEW playtomic.v_ocupacion_diaria AS
SELECT
  b.resource_name,
  (b.booking_start AT TIME ZONE 'America/Matamoros')::date AS fecha,
  EXTRACT(HOUR FROM (b.booking_start AT TIME ZONE 'America/Matamoros'))::int AS hora,
  COUNT(*) AS reservas,
  COALESCE(SUM(b.price_amount), 0)::numeric(12,2) AS revenue
FROM playtomic.bookings b
WHERE NOT b.is_canceled
GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW playtomic.v_revenue_diario AS
SELECT
  (b.booking_start AT TIME ZONE 'America/Matamoros')::date AS fecha,
  b.sport_id,
  COUNT(*) FILTER (WHERE NOT b.is_canceled) AS reservas,
  COALESCE(SUM(b.price_amount) FILTER (WHERE NOT b.is_canceled), 0)::numeric(12,2) AS revenue,
  COUNT(*) FILTER (WHERE b.is_canceled) AS cancelaciones
FROM playtomic.bookings b
GROUP BY 1, 2;

CREATE OR REPLACE VIEW playtomic.v_top_players AS
WITH booking_counts AS (
  SELECT
    bp.player_id,
    b.booking_id,
    b.price_amount,
    COUNT(*) OVER (PARTITION BY b.booking_id) AS participant_count
  FROM playtomic.booking_participants bp
  JOIN playtomic.bookings b
    ON b.booking_id = bp.booking_id
  WHERE NOT b.is_canceled
),
player_stats AS (
  SELECT
    player_id,
    COUNT(DISTINCT booking_id) AS reservas_periodo,
    COALESCE(SUM(price_amount / NULLIF(participant_count, 0)), 0)::numeric(12,2) AS gasto_estimado
  FROM booking_counts
  GROUP BY player_id
)
SELECT
  p.id,
  p.playtomic_id,
  p.name,
  p.email,
  p.player_type,
  p.accepts_commercial,
  p.first_seen_at,
  p.last_seen_at,
  p.total_bookings,
  p.total_spend,
  p.favorite_sport,
  p.created_at,
  p.updated_at,
  COALESCE(ps.reservas_periodo, 0) AS reservas_periodo,
  COALESCE(ps.gasto_estimado, 0)::numeric(12,2) AS gasto_estimado
FROM playtomic.players p
LEFT JOIN player_stats ps
  ON ps.player_id = p.playtomic_id
ORDER BY reservas_periodo DESC, gasto_estimado DESC, p.name ASC;

GRANT USAGE ON SCHEMA playtomic TO anon, authenticated, service_role;

GRANT SELECT ON ALL TABLES IN SCHEMA playtomic TO authenticated;
GRANT SELECT ON playtomic.v_ocupacion_diaria TO authenticated;
GRANT SELECT ON playtomic.v_revenue_diario TO authenticated;
GRANT SELECT ON playtomic.v_top_players TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA playtomic TO service_role;
GRANT SELECT ON playtomic.v_ocupacion_diaria TO service_role;
GRANT SELECT ON playtomic.v_revenue_diario TO service_role;
GRANT SELECT ON playtomic.v_top_players TO service_role;

ALTER TABLE playtomic.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE playtomic.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE playtomic.booking_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE playtomic.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE playtomic.sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS playtomic_bookings_authenticated_select ON playtomic.bookings;
CREATE POLICY playtomic_bookings_authenticated_select
ON playtomic.bookings
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS playtomic_players_authenticated_select ON playtomic.players;
CREATE POLICY playtomic_players_authenticated_select
ON playtomic.players
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS playtomic_booking_participants_authenticated_select ON playtomic.booking_participants;
CREATE POLICY playtomic_booking_participants_authenticated_select
ON playtomic.booking_participants
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS playtomic_resources_authenticated_select ON playtomic.resources;
CREATE POLICY playtomic_resources_authenticated_select
ON playtomic.resources
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS playtomic_sync_log_authenticated_select ON playtomic.sync_log;
CREATE POLICY playtomic_sync_log_authenticated_select
ON playtomic.sync_log
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS playtomic_bookings_service_role_all ON playtomic.bookings;
CREATE POLICY playtomic_bookings_service_role_all
ON playtomic.bookings
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS playtomic_players_service_role_all ON playtomic.players;
CREATE POLICY playtomic_players_service_role_all
ON playtomic.players
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS playtomic_booking_participants_service_role_all ON playtomic.booking_participants;
CREATE POLICY playtomic_booking_participants_service_role_all
ON playtomic.booking_participants
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS playtomic_resources_service_role_all ON playtomic.resources;
CREATE POLICY playtomic_resources_service_role_all
ON playtomic.resources
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS playtomic_sync_log_service_role_all ON playtomic.sync_log;
CREATE POLICY playtomic_sync_log_service_role_all
ON playtomic.sync_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
