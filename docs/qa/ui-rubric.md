# BSOP — UI Consistency Rubric

> Human-assisted audit checklist for each module. Run after `npm run audit:ui` to complement the static analysis.  
> Complete one section per module. Mark ✅ pass · ❌ fail · ⚠ needs attention · — not applicable.

---

## How to use

1. Run `npm run audit:ui` to get the automated report first.
2. Open the module in your browser with the dev server running.
3. Walk through each section below and note findings.
4. File issues for each ❌ or ⚠ found.

---

## Module template

Copy this block for each module you audit.

```
### [module path] — [Module Display Name]
Auditor:     [name]
Date:        [YYYY-MM-DD]
Role tested: [admin / user / no-access]
```

---

## Section 1 — Page Load & Structure

| Check                                                                         | Result | Notes |
| ----------------------------------------------------------------------------- | ------ | ----- |
| Page loads without console errors                                             |        |       |
| No blank/white flash before content                                           |        |       |
| First-load skeleton uses `<TableSkeleton>` (not ad-hoc Array.map of Skeleton) |        |       |
| Refetch with data already loaded does NOT replace table with skeleton (S4)    |        |       |
| Fetch error renders `<ErrorBanner>` between filters and content (ADR-004 R10) |        |       |
| `<ErrorBanner>` has Reintentar button when fetch is idempotent (S5)           |        |       |
| Page title / heading matches sidebar label                                    |        |       |
| Correct empresa icon / context shown                                          |        |       |
| "Acceso restringido" shows for unauthorized users                             |        |       |
| Breadcrumb or back navigation present (if nested)                             |        |       |

---

## Section 2 — Table / List View

| Check                                                                                   | Result | Notes |
| --------------------------------------------------------------------------------------- | ------ | ----- |
| Table renders with column headers                                                       |        |       |
| Column headers are labeled and readable                                                 |        |       |
| Data rows render correctly                                                              |        |       |
| Row hover state is visible                                                              |        |       |
| Rows are clickable (cursor changes)                                                     |        |       |
| Clicking a row opens the expected Sheet or navigates                                    |        |       |
| Empty state uses `<EmptyState>` (not ad-hoc `<TableCell colSpan>` text)                 |        |       |
| Empty state distinguishes "módulo virgen" vs "filtros activos" with different copy (S3) |        |       |
| Loading uses `<TableSkeleton>` with column count matching the real table shape (S2)     |        |       |
| Badge statuses (activo/inactivo etc.) render with color                                 |        |       |
| Currency / date formats are correct (es-MX locale)                                      |        |       |
| Long text truncates (no layout breakage)                                                |        |       |

---

## Section 3 — Search & Filters

| Check                                                                         | Result | Notes |
| ----------------------------------------------------------------------------- | ------ | ----- |
| Search input visible and labeled                                              |        |       |
| Typing filters results in real time (or on submit)                            |        |       |
| Clearing search restores full list                                            |        |       |
| Searching for nonsense shows empty state                                      |        |       |
| Dropdown filters (Select) work and reset                                      |        |       |
| Date range picker works and applies correctly                                 |        |       |
| Active filters are visually indicated                                         |        |       |
| Filter state does NOT persist across page reloads (or it does, intentionally) |        |       |

---

## Section 4 — Refresh

| Check                                                      | Result | Notes |
| ---------------------------------------------------------- | ------ | ----- |
| Refresh button (↺) is present and labeled (or has tooltip) |        |       |
| Clicking refresh re-fetches data                           |        |       |
| Loading indicator shown during refresh                     |        |       |
| Refresh works correctly after filtering                    |        |       |

---

## Section 5 — Sheet / Side Panel

| Check                                                     | Result | Notes |
| --------------------------------------------------------- | ------ | ----- |
| Sheet opens smoothly without layout jump                  |        |       |
| Sheet has a visible title                                 |        |       |
| Sheet has a visible description or subtitle               |        |       |
| Sheet width is consistent with other modules (~400–480px) |        |       |
| Sheet has a close button (×)                              |        |       |
| Pressing Escape closes the sheet                          |        |       |
| Clicking the overlay / backdrop closes the sheet          |        |       |
| Sheet is scrollable when content overflows                |        |       |
| Sheet content renders correctly on mobile (≤768px)        |        |       |
| Multiple sheets don't stack / overlap unexpectedly        |        |       |

---

## Section 6 — Dialog / Modal

| Check                                                             | Result | Notes |
| ----------------------------------------------------------------- | ------ | ----- |
| Dialog opens with smooth animation                                |        |       |
| Dialog has a visible title                                        |        |       |
| Dialog has a description / context text                           |        |       |
| Dialog has action buttons in the footer                           |        |       |
| Primary action button is visually prominent                       |        |       |
| Cancel / close button is present and works                        |        |       |
| Pressing Escape closes the dialog                                 |        |       |
| Clicking backdrop closes the dialog (or is intentionally blocked) |        |       |
| Destructive actions use red/destructive button variant            |        |       |
| Dialog width is appropriate for its content (~480–640px)          |        |       |

---

## Section 7 — Forms (inside Sheet or Dialog)

| Check                                                            | Result | Notes |
| ---------------------------------------------------------------- | ------ | ----- |
| All fields have visible labels                                   |        |       |
| Required fields are marked                                       |        |       |
| Validation errors appear inline and are readable                 |        |       |
| Submit button shows loading state during save                    |        |       |
| Form resets after successful save                                |        |       |
| Form retains values when save fails (no data loss)               |        |       |
| Select / dropdown options load correctly                         |        |       |
| Date inputs work and display correct locale                      |        |       |
| Long forms are scrollable without the dialog header disappearing |        |       |

---

## Section 8 — Create / Add Flow

| Check                                                            | Result | Notes |
| ---------------------------------------------------------------- | ------ | ----- |
| "+" / "Nuevo" button is present and visible                      |        |       |
| Button is disabled or hidden for read-only users                 |        |       |
| Clicking it opens a correctly-sized Dialog or Sheet              |        |       |
| All required fields are present                                  |        |       |
| Saving creates the record and updates the list                   |        |       |
| Success feedback shown (toast, record appears, or dialog closes) |        |       |

---

## Section 9 — Edit Flow

| Check                                                         | Result | Notes |
| ------------------------------------------------------------- | ------ | ----- |
| Edit action is accessible (row click, ✏ button, context menu) |        |       |
| Edit form pre-fills with current values                       |        |       |
| Saving updates the record in the list                         |        |       |
| Partial edits don't corrupt other fields                      |        |       |

---

## Section 10 — Delete / Deactivate Flow

| Check                                                                              | Result | Notes |
| ---------------------------------------------------------------------------------- | ------ | ----- |
| Delete / deactivate action is discoverable                                         |        |       |
| Confirmation uses `<ConfirmDialog>` (NOT `window.confirm`) — ADR-008 T2            |        |       |
| Title is a question ("¿Eliminar X?"); description explains effect — T3             |        |       |
| Soft-delete uses `feedback.undoable({undo})` instead of confirm-then-toast — T4    |        |       |
| After deletion, item is removed from list (or marked inactive)                     |        |       |
| Mutation error uses `feedback.error(err)` toast (NOT `alert()` or `<ErrorBanner>`) |        |       |
| Mutation success uses `feedback.success(...)` toast                                |        |       |

---

## Section 11 — Print / Export

| Check                                       | Result | Notes |
| ------------------------------------------- | ------ | ----- |
| Print button present (if applicable)        |        |       |
| Print preview renders correctly             |        |       |
| Printed layout excludes navigation / chrome |        |       |
| Export / download produces correct file     |        |       |

---

## Section 12 — Permissions

| Check                                                      | Result | Notes |
| ---------------------------------------------------------- | ------ | ----- |
| Admin sees all actions                                     |        |       |
| Read-only user sees data but no edit/create/delete buttons |        |       |
| No-access user sees "Acceso restringido"                   |        |       |
| Impersonation works and shows correct restricted view      |        |       |

---

## Section 13 — Visual Consistency

| Check                                                           | Result | Notes |
| --------------------------------------------------------------- | ------ | ----- |
| Font sizes match other modules (no runaway large text)          |        |       |
| Button sizes consistent (default for primary, icon for toolbar) |        |       |
| Color use consistent (accent for primary, muted for secondary)  |        |       |
| Badge colors consistent with meaning across modules             |        |       |
| Spacing / padding feel consistent with other modules            |        |       |
| Dark mode renders correctly (no invisible text / icons)         |        |       |
| No hardcoded light-only colors                                  |        |       |

---

## Section 14 — Mobile / Responsive (optional but recommended)

| Check                                          | Result | Notes |
| ---------------------------------------------- | ------ | ----- |
| Page is usable at 375px width                  |        |       |
| Sidebar collapses on mobile                    |        |       |
| Sheets/Dialogs don't overflow screen on mobile |        |       |
| Table horizontal scroll works                  |        |       |
| All touch targets ≥ 44×44px                    |        |       |

---

## Module audit log

Track which modules have been audited:

| Module                    | Audited? | Date | Auditor | Critical issues | Notes |
| ------------------------- | -------- | ---- | ------- | --------------- | ----- |
| rdb/ventas                | ⬜       |      |         |                 |       |
| rdb/cortes                | ⬜       |      |         |                 |       |
| rdb/productos             | ⬜       |      |         |                 |       |
| rdb/inventario            | ⬜       |      |         |                 |       |
| rdb/proveedores           | ⬜       |      |         |                 |       |
| rdb/requisiciones         | ⬜       |      |         |                 |       |
| rdb/ordenes-compra        | ⬜       |      |         |                 |       |
| rdb/playtomic             | ⬜       |      |         |                 |       |
| rh/empleados              | ⬜       |      |         |                 |       |
| rh/empleados/[id]         | ⬜       |      |         |                 |       |
| rh/departamentos          | ⬜       |      |         |                 |       |
| rh/puestos                | ⬜       |      |         |                 |       |
| inicio/tasks              | ⬜       |      |         |                 |       |
| inicio/juntas             | ⬜       |      |         |                 |       |
| inicio/juntas/[id]        | ⬜       |      |         |                 |       |
| administracion/documentos | ⬜       |      |         |                 |       |
| settings/acceso           | ⬜       |      |         |                 |       |
| settings/empresas         | ⬜       |      |         |                 |       |
| coda                      | ⬜       |      |         |                 |       |
| travel                    | ⬜       |      |         |                 |       |
| health                    | ⬜       |      |         |                 |       |

---

## Quick severity guide

| Severity     | Definition                                                     | Action               |
| ------------ | -------------------------------------------------------------- | -------------------- |
| **Critical** | Blocks a core workflow or is a security/a11y issue             | Fix immediately      |
| **High**     | Degrades experience significantly; user confusion or data risk | Fix in current cycle |
| **Medium**   | Inconsistency or missing feature; workaround exists            | Fix in next cycle    |
| **Low**      | Polish issue, cosmetic inconsistency                           | Backlog              |
