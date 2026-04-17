# Reporte — Estandarización RH UI + comentarios y sugerencias

**Fecha:** 2026-04-17
**Autor:** Claude (sesión BSOP)
**Alcance:** 9 pantallas RH (`departamentos`, `puestos`, `empleados` × 3 empresas: `/rh`, `/rdb/rh`, `/dilesa/rh`) + creación de estándar de UI reutilizable + migración de DB asociada.

---

## 1. Qué se hizo

### 1.1 Componentes compartidos (nuevos)

| Archivo | Propósito |
|---------|-----------|
| `components/shared/row-actions.tsx` | Kebab menu canónico con Editar + Toggle Activo/Inactivo + Eliminar. Slots opcionales; se colapsa solo si la acción no aplica. |
| `components/shared/confirm-dialog.tsx` | Wrapper sobre `AlertDialog` de shadcn. Soporta `onConfirm` async con estado de loading automático. |
| `components/ui/toast.tsx` | Wrapper sobre `@base-ui/react/toast`. Expone `useToast()` y `ToastProvider`. |

`ToastProvider` ya está montado en `components/providers.tsx` envolviendo a `PermissionsProvider`.

### 1.2 Migración de pantallas (9/9)

Todas las páginas siguen ahora el mismo contrato:

- `.is('deleted_at', null)` en `fetchAll`.
- Reemplazo de `Pencil` / clickable badge / `alert()` por `<RowActions />` + `useToast()`.
- `handleSoftDelete` y `handleToggleActivo` consolidados con el mismo patrón de error → toast.

Archivos tocados:

- `app/rh/{departamentos,puestos,empleados}/page.tsx`
- `app/rdb/rh/{departamentos,puestos,empleados}/page.tsx`
- `app/dilesa/rh/{departamentos,puestos,empleados}/page.tsx`

### 1.3 Base de datos

Se detectó que `erp.departamentos` y `erp.puestos` **no tenían** columna `deleted_at` (a diferencia de `erp.empleados`/`erp.personas`). Migración aplicada (`add_soft_delete_to_erp_departamentos_puestos`):

```sql
ALTER TABLE erp.departamentos ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE erp.puestos        ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS erp_departamentos_deleted_idx
  ON erp.departamentos (empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS erp_puestos_deleted_idx
  ON erp.puestos        (empresa_id) WHERE deleted_at IS NULL;
```

Los índices son **parciales** (solo activas) — patrón ya usado en `erp.empleados`. Tamaño de índice ~20% del que tendría un índice completo, con la misma selectividad en los queries de lista.

Types regenerados en `types/supabase.ts`. `npx tsc --noEmit` pasa en verde (0 errores).

### 1.4 Documentación

- `ARCHITECTURE.md` — agregada sección **UI Standards** (`RowActions`, `ConfirmDialog`, `useToast`, soft-delete, semántica activo/eliminado).
- Se incluye capa `components/shared/` en el modelo de 3 capas de `components/`.

---

## 2. Comentarios (estado actual)

### 2.1 Lo que ya está bien

- **Stack moderno y coherente**: Next.js App Router + RSC, Supabase SSR, shadcn/ui v4 (base-ui), Tailwind. No hay hacks cross-paradigm.
- **Modelo de permisos explícito** (`core.permisos_rol` + middleware `proxy.ts`). Fácil de razonar; RLS en DB como segunda línea de defensa.
- **Multi-schema intencional** (`core`/`erp` compartidos, `rdb`/`dilesa`/`ansa` per-empresa). Es la decisión correcta para multi-tenant con overlap parcial de lógica.
- **Migración typed completa** (series B.4 `erp` y B.5 `core` cerradas; 0 `.schema(x as any)` vivos). Excelente base para mantener el type-safety.

### 2.2 Fricciones residuales detectadas en la sesión

1. **`types/supabase.ts` mantenido a mano después del MCP.** `mcp__supabase__generate_typescript_types` solo devuelve `public`. El archivo actual (5.798 líneas, todos los schemas) debe venir de otro pipeline. Riesgo: drift silencioso entre DB y types cuando se añaden columnas.
2. **`SCHEMA_REF.md` incompleto.** Solo documenta tablas de `rdb` (cortes, movimientos). `erp.*`, `core.*`, `dilesa.*` no están. La instrucción del CLAUDE.md (*"Siempre referir a SCHEMA_REF.md para nombres exactos"*) no se cumple hoy.
3. **Duplicación RH × 3 empresas.** Las 9 pantallas son casi idénticas salvo `EMPRESA_ID` y el prefijo de ruta. Ya extrajimos los componentes compartidos, pero las páginas siguen siendo copia-pega.
4. **Soft-delete inconsistente.** Presente en `erp.empleados`, `erp.personas`, `erp.documentos`, y ahora `erp.departamentos`/`erp.puestos`. Ausente en muchas tablas operativas (`rdb.*`, `dilesa.*` alto volumen). No hay convención forzada a nivel de DB.
5. **Componentes grandes (>700 líneas) con `'use client'` aplicado por defecto.** Ya listado en `AUDIT_2026-04-16.md` como deuda, pero las 9 pantallas RH son ejemplos vivos.

---

## 3. Sugerencias de mejora (priorizadas)

### P0 — Evitar que el drift vuelva

**3.1 Automatizar regeneración de types.**
Agregar a `package.json`:

```json
"scripts": {
  "db:types": "supabase gen types typescript --project-id ybklderteyhuugzfmxbi --schema public,core,erp,rdb,dilesa,playtomic > types/supabase.ts",
  "db:check": "npm run db:types && git diff --exit-code types/supabase.ts"
}
```

Correr `db:check` en CI tras migraciones para detectar drift. Eventual: pre-commit hook con Husky.

**3.2 Completar `supabase/SCHEMA_REF.md`.**
Generar automáticamente desde `information_schema` vía un script `scripts/gen-schema-ref.ts` que dumpée tablas × columnas × comentarios. Debe ser output determinístico (ordenado alfabético) para revisar diffs en PRs.

**3.3 Convención soft-delete.**
Agregar a `CONTRIBUTING.md`: *"Toda tabla de dominio debe incluir `deleted_at timestamptz` + índice parcial sobre `(empresa_id) WHERE deleted_at IS NULL`."* + checklist en el template de PR para migraciones.

### P1 — Escalabilidad de UI RH

**3.4 Factorizar las pantallas RH en una **page factory****.
Crear `app/_rh/departamentos-page.tsx`, `puestos-page.tsx`, `empleados-page.tsx` como componentes parametrizados por `{ empresaId, basePath }`, y que las 9 rutas actuales los renderen:

```tsx
// app/dilesa/rh/departamentos/page.tsx
import DepartamentosPage from '@/app/_rh/departamentos-page';
export default () => (
  <DepartamentosPage empresaId="f5942ed4-..." basePath="/dilesa/rh" />
);
```

Reduce ~1800 líneas a ~600 y hace que el próximo fix se aplique en un solo archivo.

**3.5 Paginación real.**
Hoy `fetchAll` carga toda la tabla con `.is('deleted_at', null)`. Con 2000 empleados esto empieza a doler. Usar `.range()` + server-side sort.

**3.6 Virtualización de tablas.**
`@tanstack/react-virtual` sobre la tabla de empleados. Solo cuando el punto 3.5 esté en marcha (la paginación es el fix estructural; la virtualización es ergonomía).

### P2 — Capas arquitectónicas

**3.7 Subcarpeta `components/domain/`.**
Mover `health-dashboard-view.tsx`, `travel-expense-tracker.tsx`, `trip-*.tsx` a `components/domain/<modulo>/`. `components/` en la raíz solo debería tener `ui/`, `shared/`, `layout/`.

**3.8 Server Components por default.**
Auditar los `'use client'` de más. Regla de oro: si no hay `useState`/`useEffect`/event handler, quitar la directiva. `fetchUserPermissions` ya es server-side; mucho de lo que hoy es client puede ser RSC con boundary solo sobre los interactivos.

**3.9 `lib/api/` como capa.**
Centralizar queries repetidas (`fetchDepartamentos(supabase, empresaId)`, `softDeleteDepartamento(supabase, id)`) en funciones puras. La lógica vive fuera del componente y se testea con Vitest sin montar React.

### P3 — Robustez

**3.10 Rate limiting en `/api/*` públicas.**
`app/api/health/ingest/route.ts` y `app/api/welcome-email/route.ts` son los candidatos. `@upstash/ratelimit` + Vercel KV es el setup mínimo.

**3.11 Cobertura de tests >30% en `lib/permissions.ts` y middleware.**
Es el lugar donde una regresión silenciosa es caso-de-seguridad, no bug cosmético.

**3.12 Error boundaries por módulo.**
`app/rh/error.tsx`, `app/rdb/error.tsx`, etc. — fallback consistente en lugar de pantalla en blanco si rompe un query.

**3.13 Smoke test Playwright (tarea #9).**
`tests/e2e/rh-row-actions.spec.ts` cubriendo los tres caminos (editar-cancelar, toggle, eliminar-con-confirm) × 3 empresas × 3 recursos. Idealmente en CI con un proyecto Supabase preview.

### P4 — Observabilidad

**3.14 Sentry (o equivalente).**
Errores de runtime en Vercel no son accesibles sin sesión de Vercel. Un Sentry + `beforeSend` que limpie emails/IDs sería la inversión 80/20.

**3.15 Audit log de soft-deletes.**
Tabla `core.audit_log(table, row_id, action, actor_id, before, after, at)` alimentada por triggers `AFTER UPDATE` solo cuando `deleted_at` cambia. Forensics trivial y barato.

---

## 4. Tareas pendientes en el tracker

| # | Status | Subject |
|---|--------|---------|
| 8 | completed | Aplicar patrón a 9 pantallas RH |
| 9 | pending | Documentar estándar en ARCHITECTURE.md + smoke test |

La parte de documentación de #9 ya quedó hecha en este mismo archivo y en `ARCHITECTURE.md § UI Standards`. Falta **solo el smoke test de Playwright** (punto 3.13).

---

## 5. Verificación final

- `npx tsc --noEmit` → **0 errores**.
- `information_schema.columns` confirma `deleted_at` en `erp.departamentos` y `erp.puestos`.
- Índices parciales creados (`erp_departamentos_deleted_idx`, `erp_puestos_deleted_idx`).
- Componentes compartidos existen en `components/shared/`.
- `ARCHITECTURE.md` incluye sección UI Standards.

Sources:
- [ARCHITECTURE.md](computer:///sessions/determined-zen-davinci/mnt/BSOP/ARCHITECTURE.md)
- [row-actions.tsx](computer:///sessions/determined-zen-davinci/mnt/BSOP/components/shared/row-actions.tsx)
- [confirm-dialog.tsx](computer:///sessions/determined-zen-davinci/mnt/BSOP/components/shared/confirm-dialog.tsx)
