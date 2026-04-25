-- Flip the `adjuntos` bucket to private so direct URLs no longer serve
-- files without a short-lived signed token.
--
-- This migration is PAIRED with the app refactor in PR
-- `refactor/private-adjuntos-signed-urls`:
--   * lib/adjuntos.ts centralizes `getAdjuntoSignedUrl` / HTML & JSON
--     rewrite helpers.
--   * Every consumer of adjuntos (3 document admin pages + the junta
--     TipTap editor) now generates signed URLs on render and normalizes
--     back to the bare object path on save.
--   * Legacy rows with full public URLs in `erp.adjuntos.url` keep
--     rendering because `getAdjuntoPath()` handles both formats.
--
-- Apply order: merge the app refactor first, wait for the prod deploy to
-- be live, THEN apply this migration. The reverse order (flip before
-- code is live) would 403 every page that embeds a stored public URL.
--
-- Rollback:
--   UPDATE storage.buckets SET public = true WHERE id = 'adjuntos';
-- Stored public URLs start working again immediately (the object data
-- never moved).

UPDATE storage.buckets
   SET public = false
 WHERE id = 'adjuntos';
