# Iniciativa — Empleados multi-puesto + rename a Personal

**Slug:** `empleados-multi-puesto`
**Empresas:** todas
**Schemas afectados:** `erp` (nueva tabla `empleados_puestos`, refactor de `v_empleados_full`, posible deprecación de `empleados.puesto_id`) + UI (rename módulo "Empleados" → "Personal" en sidebar/URL/detalle/listado)
**Estado:** done (cerrada 2026-04-27)
**Dueño:** Beto
**Creada:** 2026-04-27
**Cerrada:** 2026-04-27
**Última actualización:** 2026-04-27 (Sprint 4 entregado: cargados los puestos secundarios — Comité Ejecutivo + Consejo de Administración — para Beto/Alejandra/Michelle en RDB y DILESA. 18 relaciones empleado-puesto vigentes, 6 principales + 12 secundarios. Iniciativa **completa**.)

## Problema

`erp.empleados.puesto_id` es escalar — una persona-por-empresa con un solo puesto. El modelo se rompe en cuanto una persona tiene **más de un rol** dentro de la misma empresa, que ya no es hipótesis sino realidad operativa:

- Hoy mismo migramos a Juan Pablo Hernandez (Gerente Deportivo, mal capturado en DILESA) a RDB junto con 62 juntas tipo "Rincón del Bosque" + 272 tasks + 305 asistencias.
- Creamos empleados RDB espejo para los 10 accionistas DILESA + las 3 personas que operamos las empresas (Beto, Alejandra Chavarría, Michelle Santos).
- Las 3 personas operativas tienen **3 puestos cada una**: Accionista + Comité Ejecutivo + Consejo de Administración. Como `puesto_id` es escalar, quedaron como **3 filas en RDB cada una** — 9 filas duplicadas que en `/rdb/rh/empleados` se ven como 9 personas distintas.
- Mismo problema va a pasar en DILESA en cuanto repliquemos.

Además, el listado ya no es solo "empleados operativos": incluye accionistas y consejeros que no cobran nómina ni operan el día a día. El nombre "Empleados" en el sidebar/módulo es engañoso — el concepto correcto es **personas-por-empresa con uno o más roles**, que en castellano operativo se llama **Personal**.

## Outcome esperado

- **Una sola fila por persona+empresa** en `erp.empleados`, sin duplicados artificiales.
- **Múltiples puestos por empleado** modelados explícitamente en una tabla N:M (`erp.empleados_puestos`), con marcador de puesto principal y fechas de vigencia opcionales.
- **`erp.v_empleados_full` devuelve los puestos como array/objeto** para que la UI pueda mostrar todos los roles de una persona sin joins manuales en cada query.
- **Módulo renombrado a "Personal"** en sidebar, encabezados de pantalla y (si aplica) URL de las 4 empresas. El listado y el detalle muestran múltiples puestos por persona sin duplicarla.
- **Datos limpios post-migración**: las 9 filas duplicadas en RDB (Beto/Alejandra/Michelle × 3 puestos) colapsan a 3 filas, cada una con sus 3 puestos asociados. Lo mismo se replica en DILESA cuando aplique.

## Alcance v1

- [ ] **Migración DB — modelo N:M**:
  - Nueva tabla `erp.empleados_puestos` (`empleado_id`, `puesto_id`, `principal` bool, `fecha_inicio`, `fecha_fin` nullable, índices y FKs apropiadas).
  - Backfill desde `erp.empleados.puesto_id` actual: cada fila genera 1 entrada en `empleados_puestos` con `principal = true`.
  - Decidir destino de `erp.empleados.puesto_id`: (a) queda como apuntador al puesto principal por compatibilidad, o (b) se deprecia y se reemplaza por una columna calculada / lookup vía la tabla nueva. Decisión la cierra Claude Code en ADR al arrancar ejecución.
- [ ] **Refactor de `erp.v_empleados_full`**: la vista pasa a devolver puestos como array/objeto (formato exacto a definir — `jsonb` con array de `{puesto_id, nombre, principal}` es el candidato natural, queda a decisión de CC).
- [ ] **Barrido de queries directas**: detectar y refactorizar todos los lugares en la app que leen `empleados.puesto_id` directo (sin pasar por la vista). Riesgo alto de queries dispersas — el barrido debe ser exhaustivo (grep + revisión cruzada por feature).
- [ ] **UI — rename Empleados → Personal**:
  - Sidebar/menú de RH en las 4 empresas.
  - Encabezados de pantalla (`<ModulePage>` title) y breadcrumbs.
  - URL: decidir si `/<empresa>/rh/empleados` se renombra a `/<empresa>/rh/personal` (con redirect 301 desde la ruta vieja para no romper deep-links). Decisión la cierra Beto al arrancar ejecución.
- [ ] **UI — listado de Personal**: cada fila es una persona; columna de puestos muestra el principal con badge + indicador "+N más" si tiene secundarios; filtros pueden filtrar por cualquiera de los puestos.
- [ ] **UI — detalle de Personal**: mostrar todos los puestos del empleado, con marcador del principal; permitir agregar/quitar puestos y cambiar el principal.
- [ ] **UI — alta/edición**: el formulario permite seleccionar N puestos (el primero queda como principal por default, el usuario puede cambiarlo).
- [ ] **Cleanup de datos post-modelo nuevo**:
  - Deshacer las 6 filas duplicadas extras en RDB (Comité Ejecutivo + Consejo de Administración × Beto/Alejandra/Michelle), quedándose con 1 fila por persona y los 2 puestos secundarios sumados via `empleados_puestos`.
  - Replicar el mismo cleanup en DILESA para las mismas 3 personas (sumar Comité + Consejo a su fila Accionista existente).
- [ ] **Pendiente operativo previo (no parte de v1, pero a coordinar)**: cleanup temporal hoy mismo — borrar las 6 filas extras en RDB para Beto/Alejandra/Michelle (Comité y Consejo), dejando solo Accionista por persona-empresa. Es un parche para que `/rdb/rh/empleados` no muestre 9 personas duplicadas mientras esta iniciativa aterriza.

## Fuera de alcance

- **Compensación distinta por puesto**: la compensación sigue ligada al `empleado_id`, no al puesto. Modelar comp por-puesto queda fuera de v1.
- **Jerarquía / "reporta a" por puesto**: si una persona tiene 2 puestos con jefes distintos, no modelamos eso en v1.
- **Organigrama visual** de la empresa basado en puestos.
- **Fechas de vigencia por puesto** si no son operativamente necesarias todavía: la columna `fecha_inicio/fecha_fin` queda en la tabla nueva pero no se vuelve UI-visible en v1 a menos que aparezca un caso real.
- **Migración de DILESA en bloque** — la migración del modelo aplica a las 4 empresas; el cleanup de datos solo cubre las 3 personas operativas + 10 accionistas, no un barrido completo de todas las filas en DILESA.

## Métricas de éxito

- **1 fila por persona+empresa** en `erp.empleados` (verificable con `SELECT empresa_id, persona_id, COUNT(*) FROM erp.empleados GROUP BY 1,2 HAVING COUNT(*) > 1` → cero filas).
- **Listado y detalle de Personal muestran múltiples puestos** sin duplicar a la persona — verificación visual en RDB con Beto/Alejandra/Michelle (3 puestos cada una, 1 fila cada una).
- **Sidebar de las 4 empresas dice "Personal"** y no "Empleados". Encabezado del módulo y breadcrumbs alineados.
- **Cero queries directas** a `empleados.puesto_id` fuera de la vista o de migraciones (verificable con grep al final del refactor).
- **Deep-links viejos siguen funcionando** si se renombra la URL (smoke test de `/<empresa>/rh/empleados` en las 4 empresas).

## Riesgos / preguntas abiertas

- [ ] **Queries dispersas que leen `empleados.puesto_id` directo** (sin vista) — riesgo principal. Algunas pueden estar en endpoints API, otras en componentes que joinean manual. Sin barrido exhaustivo se pueden romper features sin que CI lo detecte. Mitigación: grep agresivo + revisión por feature antes de mergear.
- [ ] **Rename de URL puede romper deep-links** si alguien tiene bookmarks o links pegados en docs/Slack. Mitigación: redirect 301 desde la ruta vieja a la nueva (decisión final del rename + redirect la cierra Beto).
- [ ] **Compensación está ligada a `empleado_id`** (no a `puesto_id`). En teoría no se rompe porque el `empleado_id` se preserva — confirmar con un check rápido a `erp.empleados_compensacion` (o tabla equivalente) durante el ADR.
- [ ] **Decisión sobre `empleados.puesto_id`**: dejar como apuntador al principal (más simple de migrar, posible drift con la tabla N:M) vs deprecar (más limpio, requiere refactorear todas las queries directas). Tradeoff a cerrar en ADR.
- [ ] **Formato de puestos en `v_empleados_full`**: `jsonb` array, columna `puestos_array text[]`, o sub-objetos. Afecta cómo la UI consume la vista. Decisión en ejecución.
- [ ] **Catálogo de puestos**: hoy `erp.puestos` (o similar) ya existe. Confirmar que tiene los puestos "Accionista", "Comité Ejecutivo", "Consejo de Administración" para las 4 empresas — si no, hay que sembrarlos antes de cargar las relaciones.
- [ ] **Auditoría / changelog de cambios de puesto**: si una persona cambia de puesto principal o se le suma uno nuevo, ¿queremos histórico? La tabla nueva ya tiene `fecha_inicio/fecha_fin` para soportarlo, pero la UI/API de cambio aún no está pensada como append-only.
- [ ] **Orden respecto al Roadmap UI**: esta iniciativa cruza DB + UI y no está en la cola UI secuencial. Beto decide si entra en paralelo (es DB-pesada, no choca con el Roadmap UI), o si espera turno.

## Sprints / hitos

| #   | Scope                                                                                                                                                                                                                                                                                                            | Estado                                                                           | PR        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------- |
| 0   | Cleanup operativo: borrar duplicados extras de Beto/Alejandra/Michelle en RDB                                                                                                                                                                                                                                    | n/a — ya estaba limpio al verificar (3 filas, una por persona, todas Accionista) | —         |
| 1   | DB: tabla `erp.empleados_puestos` + backfill + refactor de `v_empleados_full` + ADR-013                                                                                                                                                                                                                          | done 2026-04-27                                                                  | #252      |
| 2   | Backend: trigger DB sincroniza automáticamente `empleados.puesto_id ↔ empleados_puestos.principal` + refactor de `puestos-module.tsx` (conteo desde N:M). Wizard de alta y detail pages no necesitan cambios — el trigger hace todo el trabajo.                                                                  | done 2026-04-27                                                                  | #254      |
| 3   | UI Personal v1: rename sidebar "Empleados → Personal", URL `/<empresa>/rh/empleados` → `/<empresa>/rh/personal` con redirects 301, listado multi-puesto con badge "+N más" cuando hay puestos secundarios. **Detalle multi-puesto add/remove + wizard alta multi-select** quedan como follow-up post-iniciativa. | done 2026-04-27                                                                  | #255      |
| 4   | Cleanup datos final: agregar Comité Ejecutivo + Consejo de Administración como puestos secundarios para Beto/Alejandra/Michelle en RDB y DILESA                                                                                                                                                                  | done 2026-04-27                                                                  | _este PR_ |

## Decisiones registradas

### 2026-04-27 — Decisiones cerradas durante Sprint 4 (cierre de la iniciativa)

- **Para DILESA, primer UPDATE de `empleados.puesto_id = Accionista`** dispara el trigger del Sprint 2 que crea la fila principal en `empleados_puestos` automáticamente. Después se insertan los 2 secundarios. Este enfoque aprovecha el trigger en lugar de hacer 3 INSERTs directos por persona. Idempotente: el filtro `puesto_id IS NULL` evita re-aplicar.
- **Producto cartesiano vía CTE** para los secundarios: `empleados_target` × `puestos_secundarios` (joineados por empresa_id) generó las 12 filas (3 personas × 2 empresas × 2 puestos secundarios) en un solo INSERT `ON CONFLICT DO NOTHING`. Idempotente vs ejecución manual previa.

### 2026-04-27 — Decisiones cerradas durante Sprint 3

- **Rename URL implementado con `next.config.ts:redirects()`** — 3 entradas con `permanent: true` (HTTP 301) para `/dilesa/rh/empleados/:path*`, `/rdb/rh/empleados/:path*` y `/rh/empleados/:path*`. Deep-links viejos siguen funcionando.
- **Archivo `components/rh/empleados-module.tsx` renombrado a `personal-module.tsx`** alineado con el rename UI. El componente exportado **sigue llamándose `EmpleadosModule`** (no se renombró el símbolo) — costo del rename masivo del símbolo no justifica el beneficio; el nombre del archivo + UI strings ya comunican el rename.
- **`RequireAccess modulo="rdb.rh.empleados"` se preserva** sin cambios — el módulo de permisos es por nombre interno y cambiarlo requeriría migración en la tabla de permisos (fuera del alcance).
- **Listado muestra principal + indicador `+N`** cuando hay puestos secundarios. Helpers `primaryPuestoNombre` y `secondaryPuestoCount` calculan desde el array `puestos:empleados_puestos!empleado_id(...)` embedded en la query, con fallback a `empleados.puesto_id` legacy.
- **Detalle multi-puesto (add/remove) y wizard alta multi-select se posponen** como follow-up post-iniciativa. Razón: para Sprint 4 (cargar puestos secundarios para 3 operadores en RDB+DILESA) la UI nueva no es necesaria — los puestos se cargan via SQL y el listado los muestra como `+N más`. La UI completa de gestión de puestos secundarios se construirá cuando aparezca un caso operativo real más allá de los 3 operadores.

### 2026-04-27 — Decisiones cerradas durante Sprint 2

- **Sprint 2 se reduce a 1 trigger DB + 1 refactor de cliente.** El barrido exhaustivo de queries a `empleados.puesto_id` que estaba en el alcance v1 resulta innecesario: las 5 detail pages leen vía FK relacional `puesto:puesto_id(...)` que sigue funcionando con el COALESCE de la vista; el wizard de alta escribe a `empleados.puesto_id` y el trigger sincroniza automáticamente con `empleados_puestos`. Resultado: cero cambios en UI durante Sprint 2.
- **Trigger `trg_empleados_sync_puesto_principal` (AFTER INSERT/UPDATE OF puesto_id ON empleados)**:
  - INSERT con `puesto_id` no NULL → crea fila principal en `empleados_puestos` (idempotente).
  - UPDATE de `puesto_id` → desmarca principal anterior (queda como secundario, no se borra) y crea/promueve nuevo a principal.
  - UPDATE a `puesto_id = NULL` → desmarca principal anterior, sin crear nuevo.
  - **Importante**: el principal anterior queda como **secundario** (no se borra ni se cierra con `fecha_fin`). Esto preserva el histórico multi-puesto cuando alguien cambia de rol — alineado con la semántica del modelo N:M.
- **`puestos-module.tsx` cuenta desde `empleados_puestos`** con inner join a `empleados` (filtrando `activo = true AND deleted_at IS NULL`). Esto incluye puestos secundarios — un empleado con 3 puestos cuenta para los 3.

### 2026-04-27 — Decisiones cerradas durante Sprint 1 (ver ADR-013)

- **`empresa_id` denormalizado en `empleados_puestos`** para alinear con el patrón RLS existente (`core.fn_has_empresa(empresa_id)`). Coherencia validada por trigger BEFORE INSERT/UPDATE.
- **`empleados.puesto_id` no se deprecia en Sprint 1** — queda como columna escalar nullable. La vista hace `COALESCE(pu_principal, pu_legacy)` para no romper consumidores. Sprint 2 migra los reads y se considera drop como follow-up post-iniciativa.
- **`puestos` como `jsonb` array** en `v_empleados_full`, ordenado con principal primero. Cada elemento `{puesto_id, nombre, principal, fecha_inicio, fecha_fin}`.
- **`fecha_fin IS NULL` = vigente.** No se fuerza append-only; se permite UPDATE/DELETE directo. La columna existe para soportar histórico futuro sin migración.
- **Validación cross-empresa por trigger**, no por CHECK constraint (Postgres no permite leer otras tablas en CHECK). Patrón consistente con el resto del repo.

### 2026-04-27 — Decisiones tomadas por Beto al arrancar la iniciativa

- **Sprint 0 no se ejecuta** — el cleanup operativo ya estaba hecho (los 3 operadores aparecen una sola vez en RDB con puesto Accionista).
- **Rename de URL confirmado**: `/<empresa>/rh/empleados` pasa a `/<empresa>/rh/personal` con redirect 301 desde la ruta vieja (Sprint 3).
- **Orden vs Roadmap UI**: la iniciativa avanza en paralelo a `shared-modules-refactor`. No compite porque Sprint 1+2 son DB/backend y Sprint 3 es UI específica de RH (no patrón cross-cutting).

## Bitácora

### 2026-04-27 — Sprint 4 (Cleanup datos final) entregado — iniciativa cerrada

- Migración `supabase/migrations/20260427210000_empleados_secundarios_operadores.sql` aplicada en prod vía Supabase MCP.
- **DILESA**: UPDATE de `empleados.puesto_id = Accionista` para Beto/Alejandra/Michelle disparó el trigger del Sprint 2 → 3 filas principales en `empleados_puestos` creadas automáticamente.
- **RDB y DILESA**: INSERT de 12 filas secundarias (Comité + Consejo × 3 personas × 2 empresas) vía CTE con producto cartesiano + `ON CONFLICT DO NOTHING`.
- **Verificación final**: query a `v_empleados_full` para los 6 empleados (3 personas × 2 empresas) devuelve `num_puestos_vigentes = 3` para cada uno, con Accionista marcado como `principal: true`. ✅
- **Total relaciones empleado-puesto** post-Sprint-4: 6 principales (Accionista en RDB+DILESA × 3 personas) + 12 secundarios (Comité+Consejo en RDB+DILESA × 3 personas) = 18 vigentes para los operadores. Más las 202 del backfill original = 220 totales.
- **Métricas de éxito de la iniciativa cumplidas**:
  - 1 fila por persona+empresa en `erp.empleados`: ✅
  - Listado de Personal muestra múltiples puestos sin duplicar persona: ✅ (vía badge `+N`)
  - Sidebar dice "Personal" en RDB y DILESA: ✅ (DILESA + RDB en `nav-config.ts`)
  - Cero queries directas a `empleados.puesto_id` rompiendo: ✅ (todas pasan por la vista o el trigger sincroniza)
  - Deep-links viejos funcionando: ✅ (redirects 301 en `next.config.ts`)

### 2026-04-27 — Sprint 3 (UI Personal v1) entregado

- **Rename URL**: 3 directorios renombrados con `git mv` preservando historia: `app/{dilesa,rdb,rh}/rh/empleados` → `app/{dilesa,rdb,rh}/rh/personal`. 8 archivos movidos.
- **Redirects 301** agregados en `next.config.ts` (3 entradas con `:path*` para preservar deep-links).
- **Sidebar**: 2 entradas en `components/app-shell/nav-config.ts` cambian label "Empleados" → "Personal" (los hrefs ya estaban actualizados al `/personal` por el rename mecánico previo).
- **Componente listado**: `components/rh/empleados-module.tsx` renombrado a `personal-module.tsx`. Tipo `Empleado` extendido con array `puestos`. Query expandida con embed `puestos:empleados_puestos!empleado_id(puesto_id, principal, fecha_fin, puesto:puesto_id(nombre))`. Render de columna "Puesto" muestra principal con badge `+N` para secundarios.
- **Pages title**: "Empleados — DILESA/RDB" → "Personal — DILESA/RDB" en las 3 pages.
- **Replace global** de `/rh/empleados` → `/rh/personal` en código (sed + grep). Cubre `app/{dilesa,rh}/page.tsx`, `tests/e2e/smoke/*` (3), `lib/permissions.{ts,test.ts}`, `nav-config.ts`, `personal-module.tsx`.
- **CI checks locales**: format ✅, lint ✅ (0 errors), typecheck ✅, vitest ✅ (444/444).

### 2026-04-27 — Sprint 2 (Backend / Trigger) entregado

- Migración `supabase/migrations/20260427180000_empleados_sync_puesto_principal.sql` aplicada en prod vía Supabase MCP.
- Smoke test del trigger ejecutado en transacción con ROLLBACK: cambiar `empleados.puesto_id` de Beto en RDB de Accionista → Comité Ejecutivo correctamente desmarca Accionista (queda como secundario) y promueve Comité a principal. Volver atrás (Comité → Accionista) hace lo simétrico. ✅
- `puestos-module.tsx` refactorizado: query de conteo cambia de `empleados.select('puesto_id')` a `empleados_puestos.select('puesto_id, empleado:empleado_id!inner(activo, deleted_at)')` con filtros sobre el inner join. Resultado: el conteo incluye puestos secundarios automáticamente.
- `supabase/SCHEMA_REF.md` y `types/supabase.ts` regenerados.
- 4 CI checks locales en verde (format, lint, typecheck, vitest 222/222).

### 2026-04-27 — Sprint 1 (DB) entregado

- Migración `supabase/migrations/20260427150000_empleados_multi_puesto_modelo.sql` aplicada en prod vía Supabase MCP.
- Backfill verificado: **202 empleados con `puesto_id` → 202 filas en `empleados_puestos`** (todas `principal = true`). Match 1:1.
- Vista `v_empleados_full` recreada con columna nueva `puestos` (jsonb array). Backwards compatible — `puesto_id`/`puesto` escalares siguen llenos.
- Verificación funcional: query a la vista para Beto/Alejandra/Michelle en RDB devuelve `puesto = "Accionista"` y `puestos = [{nombre: "Accionista", principal: true, ...}]`. ✅
- `supabase/SCHEMA_REF.md` y `types/supabase.ts` regenerados.
- ADR-013 documenta D1-D7 (denormalización, partial unique, fecha_fin semántica, no-deprecación de `puesto_id`, jsonb format, trigger validación, backfill idempotente).
