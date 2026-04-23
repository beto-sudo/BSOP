-- ════════════════════════════════════════════════════════════════════════════
-- Drop redundant DB objects (drift-2, 2026-04-23)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 1) Policies service_role USING(true): redundantes porque service_role
--    bypassa RLS automáticamente. Se reemplazan por COMMENT ON TABLE para
--    auto-documentar quién alimenta cada tabla.
-- 2) Index duplicado erp_pagos_prov_anio_mes_idx: la UNIQUE constraint
--    sobre los mismos columns ya provee el btree backing index.
--
-- Idempotente: DROP POLICY/INDEX IF EXISTS es no-op en DB fresca y dropea
-- efectivamente en prod.

-- ───────────── §1 service_role policies redundantes ─────────────
-- playtomic.* (alimentado por edge function playtomic-sync)
DROP POLICY IF EXISTS playtomic_booking_participants_service_role_all ON playtomic.booking_participants;
DROP POLICY IF EXISTS playtomic_bookings_service_role_all              ON playtomic.bookings;
DROP POLICY IF EXISTS playtomic_players_service_role_all               ON playtomic.players;
DROP POLICY IF EXISTS playtomic_resources_service_role_all             ON playtomic.resources;
DROP POLICY IF EXISTS playtomic_sync_log_service_role_all              ON playtomic.sync_log;

-- rdb.waitry_* (alimentado por edge function waitry-webhook + triggers)
DROP POLICY IF EXISTS service_role_all_waitry_inbound   ON rdb.waitry_inbound;
DROP POLICY IF EXISTS service_role_all_waitry_pagos     ON rdb.waitry_pagos;
DROP POLICY IF EXISTS service_role_all_waitry_pedidos   ON rdb.waitry_pedidos;
DROP POLICY IF EXISTS service_role_all_waitry_productos ON rdb.waitry_productos;

-- ───────────── §2 Index duplicado en erp.pagos_provisionales ─────────────
-- erp_schema_v3 declara `UNIQUE (empresa_id, anio_fiscal, mes)` y luego
-- también `CREATE INDEX erp_pagos_prov_anio_mes_idx` sobre las mismas
-- columnas. El UNIQUE backing index ya cubre lookups e índice; el btree
-- adicional es muerto.
DROP INDEX IF EXISTS erp.erp_pagos_prov_anio_mes_idx;

-- ───────────── §3 Auto-documentación de alimentadores ─────────────
DO $$
BEGIN
  IF to_regclass('playtomic.bookings') IS NOT NULL THEN
    EXECUTE $c$COMMENT ON TABLE playtomic.bookings IS 'Populated by edge function playtomic-sync using service_role (bypasses RLS).'$c$;
  END IF;
  IF to_regclass('playtomic.booking_participants') IS NOT NULL THEN
    EXECUTE $c$COMMENT ON TABLE playtomic.booking_participants IS 'Populated by edge function playtomic-sync using service_role (bypasses RLS).'$c$;
  END IF;
  IF to_regclass('playtomic.players') IS NOT NULL THEN
    EXECUTE $c$COMMENT ON TABLE playtomic.players IS 'Populated by edge function playtomic-sync using service_role (bypasses RLS).'$c$;
  END IF;
  IF to_regclass('playtomic.resources') IS NOT NULL THEN
    EXECUTE $c$COMMENT ON TABLE playtomic.resources IS 'Populated by edge function playtomic-sync using service_role (bypasses RLS).'$c$;
  END IF;
  IF to_regclass('playtomic.sync_log') IS NOT NULL THEN
    EXECUTE $c$COMMENT ON TABLE playtomic.sync_log IS 'Written by edge function playtomic-sync using service_role (bypasses RLS).'$c$;
  END IF;

  IF to_regclass('rdb.waitry_inbound') IS NOT NULL THEN
    EXECUTE $c$COMMENT ON TABLE rdb.waitry_inbound IS 'Populated by waitry-webhook edge function using service_role (bypasses RLS).'$c$;
  END IF;
  IF to_regclass('rdb.waitry_pedidos') IS NOT NULL THEN
    EXECUTE $c$COMMENT ON TABLE rdb.waitry_pedidos IS 'Derived from waitry_inbound trigger; service_role writes (bypasses RLS).'$c$;
  END IF;
  IF to_regclass('rdb.waitry_pagos') IS NOT NULL THEN
    EXECUTE $c$COMMENT ON TABLE rdb.waitry_pagos IS 'Derived from waitry_inbound trigger; service_role writes (bypasses RLS).'$c$;
  END IF;
  IF to_regclass('rdb.waitry_productos') IS NOT NULL THEN
    EXECUTE $c$COMMENT ON TABLE rdb.waitry_productos IS 'Derived from waitry_inbound trigger; service_role writes (bypasses RLS).'$c$;
  END IF;
END $$;
