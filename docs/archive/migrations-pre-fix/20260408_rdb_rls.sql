-- ============================================================
-- MIGRATION: Row Level Security for rdb schema
-- Project: BSOP Supabase
-- Date: 2026-04-08
-- Purpose: Enable RLS and define policies on all 11 rdb tables.
--          Policy: authenticated users can read all rows;
--                  write operations require authenticated session.
-- IDEMPOTENT: Safe to run multiple times.
-- ============================================================

-- ── 1. Enable RLS on all rdb tables ─────────────────────────

ALTER TABLE rdb.waitry_inbound              ENABLE ROW LEVEL SECURITY;
ALTER TABLE rdb.waitry_pedidos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE rdb.waitry_productos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE rdb.waitry_pagos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE rdb.waitry_duplicate_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE rdb.cajas                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE rdb.cortes                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE rdb.movimientos                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE rdb.inv_productos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE rdb.inv_entradas                ENABLE ROW LEVEL SECURITY;
ALTER TABLE rdb.inv_ajustes                 ENABLE ROW LEVEL SECURITY;

-- ── 2. Drop existing policies (idempotent) ───────────────────

DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'rdb'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON rdb.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ── 3. READ policies (SELECT) — all authenticated users ──────

CREATE POLICY "rdb_waitry_inbound_select"
  ON rdb.waitry_inbound FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "rdb_waitry_pedidos_select"
  ON rdb.waitry_pedidos FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "rdb_waitry_productos_select"
  ON rdb.waitry_productos FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "rdb_waitry_pagos_select"
  ON rdb.waitry_pagos FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "rdb_waitry_dup_candidates_select"
  ON rdb.waitry_duplicate_candidates FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "rdb_cajas_select"
  ON rdb.cajas FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "rdb_cortes_select"
  ON rdb.cortes FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "rdb_movimientos_select"
  ON rdb.movimientos FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "rdb_inv_productos_select"
  ON rdb.inv_productos FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "rdb_inv_entradas_select"
  ON rdb.inv_entradas FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "rdb_inv_ajustes_select"
  ON rdb.inv_ajustes FOR SELECT
  TO authenticated USING (true);

-- ── 4. WRITE policies — authenticated users only ─────────────

-- waitry_inbound: INSERT/UPDATE via service role only (webhook)
-- No PostgREST write policy needed — service role bypasses RLS.

-- cortes: authenticated users can INSERT and UPDATE
CREATE POLICY "rdb_cortes_insert"
  ON rdb.cortes FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "rdb_cortes_update"
  ON rdb.cortes FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- movimientos: authenticated users can INSERT
CREATE POLICY "rdb_movimientos_insert"
  ON rdb.movimientos FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "rdb_movimientos_update"
  ON rdb.movimientos FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- cajas: read-only from PostgREST; managed by service role
-- (no write policy needed for authenticated)

-- inv_* tables: authenticated users can INSERT/UPDATE
CREATE POLICY "rdb_inv_productos_insert"
  ON rdb.inv_productos FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "rdb_inv_productos_update"
  ON rdb.inv_productos FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "rdb_inv_entradas_insert"
  ON rdb.inv_entradas FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "rdb_inv_ajustes_insert"
  ON rdb.inv_ajustes FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "rdb_inv_ajustes_update"
  ON rdb.inv_ajustes FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
