# Iniciativa — Visibilidad cross-empresa de personas (RLS)

**Slug:** `personas-cross-empresa-rls`
**Empresas:** todas
**Schemas afectados:** `core` (nueva función `fn_persona_visible`), `erp` (policy `erp_personas_select`)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-05-04
**Última actualización:** 2026-05-04 (promovida tras debug del bug de Pablo HM en `/inicio`; Sprint A en preparación)

## Problema

Un usuario no-admin con empleado en empresa A y persona en empresa B no puede ver su propia ficha desde el cliente browser. Síntoma observado: Pablo HM reportó que `/inicio` no muestra sus tareas pendientes aunque sí recibe el correo diario. Causa:

- `erp.personas.empresa_id` es **NOT NULL** y la RLS scoped por `fn_has_empresa(empresa_id) OR fn_is_admin()` no contempla "humano que opera en empresa donde su persona no vive".
- `erp.v_empleados_full` está marcada `security_invoker=on` ([20260417213252](../../supabase/migrations/20260417213252_views_security_invoker.sql)). El JOIN interno con `erp.personas` aplica RLS del invoker → la fila de Pablo (persona DILESA) queda fuera del JOIN.
- El cron diario funciona porque usa service-role y bypasea RLS — por eso Pablo recibe correos pero el widget está vacío.

Tú/Ale/Michelle (admin) no notan el bug porque `fn_is_admin()` les bypassea todo. Para no-admin migrados (legacy de la primera ola JP del 2026-04-27 + futuros) el bug se reproduce silenciosamente: la página se ve vacía, sin error, y solo aparece cuando el usuario reporta.

Memoria del repo dice "auditar resto de empleados Deportivo" — Pablo no es necesariamente el único caso pendiente.

## Outcome esperado

- **Pablo y casos similares legacy ven sus tareas en `/inicio` y módulo `tasks` sin necesidad de mover su persona** (aunque el fix #1 puntual ya se aplicó como cleanup de dato — Pablo movido de DILESA → RDB).
- **El modelo de RLS soporta de forma estructural el escenario "una persona, varios empleados cross-empresa".** No depende de que el usuario sea admin ni de que la persona esté en una empresa específica.
- **Sin cambios en código de aplicación.** Los 3 callsites con email-match (`mis-tareas-widget`, `tasks-module`, `convertir/route`) siguen funcionando como están — la RLS más permisiva los desbloquea.
- **Auditoría histórica disponible** como script SQL (no automatizada) para revisar caso por caso si reaparece.

## Alcance v1

- [x] **Doc de planning + ADR-029** ([docs/adr/029_personas_visibilidad_cross_empresa.md](../adr/029_personas_visibilidad_cross_empresa.md)).
- [ ] **Migración SQL** (`20260504XXXXXX_personas_visibilidad_cross_empresa.sql`):
  - Crear `core.fn_persona_visible(p_persona_id uuid) RETURNS boolean` siguiendo patrón STABLE + SECURITY DEFINER + search_path pinned. Cubre vínculo vía `erp.empleados` solamente (PV2). Comentario explica cómo extender a otras tablas si el caso surge.
  - DROP + CREATE policy `erp_personas_select` con el predicate nuevo: `fn_has_empresa(empresa_id) OR fn_persona_visible(id) OR fn_is_admin()`.
  - `NOTIFY pgrst, 'reload schema';` al final.
- [ ] **Auditoría SQL** en el comentario de la migración (no se ejecuta, solo documenta el query):
  ```sql
  SELECT e.id AS empleado_id, emp_e.nombre AS empleado_empresa,
         p.id AS persona_id, emp_p.nombre AS persona_empresa,
         (p.nombre || ' ' || COALESCE(p.apellido_paterno,'')) AS persona,
         e.email_empresa, p.email AS persona_email
  FROM erp.empleados e
  JOIN erp.personas p ON p.id = e.persona_id AND p.empresa_id <> e.empresa_id
  JOIN core.empresas emp_e ON emp_e.id = e.empresa_id
  JOIN core.empresas emp_p ON emp_p.id = p.empresa_id
  WHERE e.activo = true AND p.deleted_at IS NULL
  ORDER BY emp_e.nombre, p.nombre;
  ```
  Beto lo corre cuando quiera para tener inventario de casos legacy.
- [ ] **Regenerar `SCHEMA_REF.md`** post-migration (`npm run schema:ref`).
- [ ] **Smoke test manual en preview** — login como Pablo HM, abrir `/inicio`, verificar que las 8 tareas aparecen.

## Fuera de alcance (sprint B opcional, otra iniciativa)

- Reescribir los 3 callsites de email-match para usar `core.usuarios.persona_id` en vez de comparar emails. El email-match funciona bien cuando RLS lo permite; reescribirlo es mejora de calidad ortogonal, no necesaria para destrabar el bug.
- Extender `fn_persona_visible` a vínculos por accionistas, juntas_asistencia o tablas satélite. Solo si surge un caso real que lo justifique.
- Migración masiva de personas legacy (script de bulk-move). El comportamiento del modelo nuevo cubre los casos sin moverlos.

## Métricas de éxito

- Pablo HM ve sus tareas en `/inicio` después del merge.
- Auditoría arroja N casos legacy; los N quedan funcionando sin necesidad de cleanup manual.
- 0 cambios en código de aplicación.
- 0 regresiones en tests existentes.

## Riesgos

- **Privacy leak controlado.** `fn_persona_visible` expande la visibilidad de `erp.personas`. Una persona DILESA con empleado en RDB se vuelve visible para usuarios solo-RDB. Es el comportamiento deseado, pero hay que confirmar que no rompe asunciones en otros lados (ej. listado de personas DILESA mostrado a un user RDB con empleado mutuo). Mitigación: el predicate solo se cumple cuando hay JOIN real con `empleados` accesible — no permite enumeración arbitraria.
- **Costo marginal de evaluación.** 3 funciones STABLE en lugar de 2. Despreciable salvo en escaneos completos de `erp.personas` (raros y service-role).
- **Si en el futuro `core.fn_current_empresa_ids` cambia**, `fn_persona_visible` también cambia. Documentado en el ADR.

## Sprints

### Sprint A — Migración + auditoría (este PR)

1. Crear `core.fn_persona_visible`.
2. Reemplazar policy `erp_personas_select`.
3. Documentar query de auditoría en el header de la migración.
4. Regenerar `SCHEMA_REF.md`.
5. Smoke en preview con login de Pablo HM.

### Sprint B — opcional, no necesario para v1

- Reescribir email-match a `persona_id`. Solo si decidimos limpiarlo.

## Bitácora

- **2026-05-04** — Iniciativa promovida tras debug del bug de Pablo HM. Confirmado por SQL: empleado en RDB, persona en DILESA (legacy migración JP 2026-04-27), `usuarios_empresas` solo en RDB → JOIN de `v_empleados_full` filtra por RLS. Beto eligió Fix 1 opción B (mover persona a RDB, hotfix puntual) + Fix 3 estructural (esta iniciativa).

## Decisiones registradas

- **2026-05-04** — V1 cubre solo vínculo vía `erp.empleados`. Razón: es el único caso operativo identificado, mantiene la función simple. Si surge otro caso (accionista que debe ver su persona desde otra empresa), se extiende `fn_persona_visible` agregando un OR EXISTS — no requiere tocar la policy.
- **2026-05-04** — No se modifica `erp.personas.empresa_id` a NULLABLE. Razón: blast radius alto (denormalización en tablas satélite por PS4 de ADR-028 + muchas tablas asumen NOT NULL). La RLS más permisiva resuelve sin tocar schema.
- **2026-05-04** — No se reescribe email-match en aplicación. Razón: el problema raíz es la RLS, no el email-match. Reescribirlo a `persona_id` es ortogonal y queda como sprint B opcional.
