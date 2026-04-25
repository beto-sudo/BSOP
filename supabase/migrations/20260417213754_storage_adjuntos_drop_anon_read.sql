-- Sprint 2 (Sec DB) — drop the anonymous-access policy on storage.adjuntos.
--
-- Context
-- -------
-- The Supabase advisor flagged `storage.objects` as having a policy that
-- lets the `anon` role list every file in the `adjuntos` bucket
-- (`adjuntos_read` with `USING (bucket_id = 'adjuntos')`). Nothing in
-- BSOP's UX ever lists attachments to unauthenticated users, so the
-- policy is a gratuitous enumeration vector: anon can walk the bucket
-- and learn filenames (empresa slugs, document types, internal codes).
--
-- The bucket itself is still `public: true` — individual files are
-- reachable if someone already knows the URL. That's a separate
-- decision documented in the audit (it lets the app embed logos and
-- CSF previews without signed URLs). This migration only removes the
-- anonymous *listing* capability.
--
-- What it does NOT fix
-- --------------------
--   * The `authenticated` policies are still permissive ("any logged-in
--     user can read/update/delete any file in the bucket regardless of
--     empresa"). That requires cross-referencing `core.usuarios_empresas`
--     and is a larger change — scheduled for Sprint 3 (RLS sweep).
--   * `public: true` on the bucket is still on. A follow-up can flip
--     that to false + switch callers to signed URLs where applicable.
--
-- Safety / rollback
-- -----------------
-- Dropping the anon SELECT policy does NOT affect:
--   - Direct URL access (bucket is public — URLs still resolve)
--   - Signed URLs (they bypass RLS)
--   - Authenticated listing (separate policy, still in place)
-- If something actually broke (unlikely), recreate with:
--   CREATE POLICY adjuntos_read ON storage.objects FOR SELECT
--     TO anon USING (bucket_id = 'adjuntos');

DROP POLICY IF EXISTS adjuntos_read ON storage.objects;

-- Recreate for authenticated only (was two policies with the same name,
-- one per role — they show as a single `adjuntos_read` entry but are
-- distinct rows in pg_policy).
CREATE POLICY adjuntos_read ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'adjuntos');
