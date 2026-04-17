# scripts/archive

One-shot migration scripts that have already run in production and are kept
here for historical reference only. They are **excluded from `tsconfig.json`**
so they do not drag `any`-casts or old API shapes into the active type-check.

## Contents

| script                         | purpose                                                        | ran on       |
| ------------------------------ | -------------------------------------------------------------- | ------------ |
| `migrate_dilesa_hr.ts`         | Imported DILESA HR (personas + empleados + puestos) from Coda  | one-shot     |
| `migrate_dilesa_tasks.ts`      | Imported DILESA tasks from Coda into `erp.tasks`               | one-shot     |
| `migrate_dilesa_juntas.ts`     | Imported DILESA juntas (meetings + attendance) from Coda       | one-shot     |
| `migrate_dilesa_escrituras.ts` | Imported DILESA escrituras (notarial acts) from Coda           | one-shot     |
| `migrate_dilesa_notarias.ts`   | Imported DILESA notarías catalog from Coda                     | one-shot     |
| `rescue_junta_images.ts`       | Re-uploaded image attachments for juntas lost during migration | one-shot     |

## Why archived

These scripts predate the `Database`-typed Supabase client (B.3) and the
`.schema('erp')` typed migration (B.4). They use `.schema('erp' as any)` as an
escape hatch, which is no longer an accepted pattern in live code.

Rather than retrofit them (they won't run again), we archive them. The data
they imported is now authoritative in `erp.*` tables.

## If you need to re-run one

1. Copy it out of `archive/`, rename it (e.g. `backfill_*.ts`), and bring it
   back under `scripts/`.
2. Add the `Database` generic to `createClient<Database>(...)` and remove the
   `as any` casts.
3. Re-align any column references against the current `supabase/SCHEMA_REF.md`.
