-- ╭─ 20260611220739_backfill_venta_vendedor_snapshot ─╮
-- Backfill: dilesa.ventas.vendedor (text) ← core.usuarios para ventas
-- BSOP-nativas que solo guardaron vendedor_usuario_id. La RLS de
-- core.usuarios es self-only (usuarios_select_own): el lookup del nombre
-- al render solo funcionaba cuando imprimía/veía el propio vendedor, y a
-- los demás (gerencia) el asesor les salía vacío en la solicitud de
-- asignación y en la pantalla del expediente. El form de venta nueva ya
-- persiste este snapshot al crear; esto cubre las ventas previas.
--
-- Idempotente (solo filas con vendedor NULL/''). En Supabase Preview
-- (sin datos de prod) actualiza 0 filas.
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión:
-- estrictamente mayor que toda migración local + de PRs abiertos).

BEGIN;

UPDATE dilesa.ventas v
SET
  vendedor = COALESCE(
    NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''),
    u.email
  ),
  updated_at = now()
FROM core.usuarios u
WHERE u.id = v.vendedor_usuario_id
  AND v.deleted_at IS NULL
  AND (v.vendedor IS NULL OR v.vendedor = '')
  AND COALESCE(
    NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''),
    u.email
  ) IS NOT NULL;

COMMIT;
