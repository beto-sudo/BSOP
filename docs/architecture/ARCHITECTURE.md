# BSOP OS Architecture

## Vision
BSOP OS is a modular, multi-tenant ERP built to serve as the operational backend for the entire holding of businesses (RDB, DILESA, ANSA, COAGAN). It replaces fragmented Coda frontends with a unified Next.js web application connected directly to a Supabase PostgreSQL backend.

## 1. Database Layer (Supabase)
The database strictly uses PostgreSQL **Schemas** to isolate business units, preventing "spaghetti" data models.

### Shared / Core Schemas
- `auth` (Supabase native): Identity and login credentials.
- `core`: Shared business entities (e.g., User profiles, RBAC roles, audit logs, shared company directory).

### Tenant / Business-Specific Schemas
- `rdb`: Point of sale, Waitry webhooks, daily cuts (cortes de caja), padel rentals, and RDB inventory.
- `dilesa`: Land lots (terrenos), customer dossiers, installment contracts, CRM functions.
- `coagan`: Agricultural operations, pecan harvest yields, livestock tracking.
- `ansa`: Dealer-level operations (if applicable, separate from Stellantis core systems).

### Security (RLS)
All tables will implement Row Level Security (RLS). A user session will only be able to query data if their `core.role` permits access to that specific business unit and schema.

## 2. Application Layer (Next.js / Vercel)
A single Next.js App Router project hosted on Vercel.

### Directory Structure Strategy
We enforce strict modularity in the codebase:
```
/src
  /app
    /(auth)          # Login, password reset
    /dashboard       # Beto's global multi-biz view
    /rdb             # RDB specific routes (e.g., /rdb/corte, /rdb/pos)
    /dilesa          # DILESA specific routes
  /components
    /ui              # Shared buttons, tables, generic layout
    /rdb             # RDB specific UI components (e.g., PadelCourtMap)
  /lib
    /supabase        # Global db client
    /core            # Shared utility functions
```

## 3. UI and Component Strategy
- We will use **shadcn/ui** and **Tailwind CSS** for a clean, consistent, and fast frontend.
- Components are built once and shared across business units.

## 4. Execution Plan (April 2026 Focus)
1. **Foundation:** Scaffold the Next.js app in the existing BSOP repo. Setup Supabase Auth + core RBAC tables.
2. **First Module (RDB):** Build the "Cortes de Caja" and "Inventarios" interfaces connecting directly to the existing `waitry` and `caja` schemas in Supabase.
3. **Coda Downgrade:** Revert Coda back to being a read-only reporting tool for RDB, pulling summarized data nightly or on-demand without managing write-back logic.
