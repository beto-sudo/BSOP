# Supabase AS-IS Report (BSOP Project)

Project ref: `ybklderteyhuugzfmxbi`  
Region: `us-east-1`  
Captured: 2026-02-01

## High-level summary
- The DB currently contains a **multi-company platform core** (companies, members, roles/permissions, invitations) and a **document/cap table** module.
- There is **no RLS enabled** on the `public` tables at the moment (all `relrowsecurity = false`).
- There is an auth hook in place: trigger `auth.on_auth_user_created` executes `public.handle_new_user()` which upserts into `public.profile`.

## Schemas present (non pg_*)
- `auth`
- `extensions`
- `graphql`
- `graphql_public`
- `net`
- `public`
- `realtime`
- `storage`
- `supabase_functions`
- `vault`

## Public tables (18)
See `docs/supabase/public_schema.md` for full column-level detail.

Notable tables:
- `Company` (settings jsonb + branding indexes)
- `company_member`, `member_role`, `member_permission_override`
- `role`, `permission`, `role_permission`
- `invitation`
- `CompanyDocument` (metadata + storage_path)
- `CapTableEntry`
- `audit_log`

## RLS / Policies
- `pg_policies`: **0 rows**.
- `public` tables: `relrowsecurity=false` for all current tables.

## Functions
- `public.handle_new_user()` (SECURITY DEFINER) inserts/updates `public.profile` on new auth user creation.

## Triggers
- `auth.on_auth_user_created` (AFTER INSERT on `auth.users`) → `EXECUTE FUNCTION public.handle_new_user()`

## Notes / Risks
- With RLS off, any API key usage needs careful handling; current code uses `SUPABASE_SERVICE_ROLE_KEY` server-side (fine) but **client-side** access must be controlled.
- We should decide whether to keep the existing core tables as the **BSOP platform foundation** and build ERP schemas alongside (recommended), or reset later if they conflict.

## Next steps (proposed)
1) Create new schemas (no deletions):
   - `staging` for Coda sync raw ingestion
   - `erp` for normalized ERP spine
2) Add a repeatable **schema capture** script to regenerate these docs.
3) Implement Coda incremental sync → staging.
4) Implement transforms staging → erp.
