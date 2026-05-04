# ADR-029 — Visibilidad cross-empresa de `erp.personas`

**Estado:** Accepted
**Fecha:** 2026-05-04
**Iniciativa:** [`personas-cross-empresa-rls`](../planning/personas-cross-empresa-rls.md)
**Relacionados:** ADR-028 (`personas_satellites`), [`empleados-multi-puesto`](../planning/empleados-multi-puesto.md)

## Contexto

Hoy la RLS en `erp.personas` (y en `erp.empleados`) está scoped por empresa con el patrón canónico de Sprint 3 PR C+D ([20260418014140_rls_erp_empresa_scoped.sql](../../supabase/migrations/20260418014140_rls_erp_empresa_scoped.sql)):

```sql
USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
```

`erp.personas.empresa_id` es **NOT NULL**: cada persona "vive" en exactamente una empresa. `erp.empleados`, en cambio, permite **N filas por persona** (una por empresa donde la persona trabaja). El modelo soporta naturalmente "humano que opera en varias empresas" — pero solo si el usuario que lo consulta es admin (porque `fn_is_admin()` bypassea la RLS).

Para usuarios no-admin la combinación rompe en escenarios reales:

- Pablo HM (`pablo.hm@dilesa.mx`) — empleado en RDB, persona en DILESA (legacy de la migración JP del 2026-04-27).
- Pablo solo tiene `usuarios_empresas` activa en RDB.
- Widget `/inicio` y módulo `tasks` consultan `erp.v_empleados_full` (con `security_invoker=on` desde 2026-04-17). El JOIN interno con `erp.personas` aplica RLS de Pablo → `fn_has_empresa('DILESA')` falsa → la fila desaparece → widget muestra 0 tareas aunque tiene 8.
- El cron diario sí le manda correos porque usa service-role y bypasea RLS.

La memoria del repo indica que hay más casos pendientes ("auditar resto de empleados Deportivo"). Cualquier humano no-admin con empleado en empresa A y persona en empresa B reproduce el síntoma. La fragilidad es estructural, no un bug puntual.

## Decisión

Relajar la policy SELECT de `erp.personas` para permitir lectura cuando el usuario tenga vínculo (vía `erp.empleados`) en cualquier empresa donde la persona esté representada — sin tocar el schema (`empresa_id` se queda NOT NULL como "empresa primaria") ni la lógica de write.

```sql
-- core.fn_persona_visible(p_persona_id uuid) RETURNS boolean
-- True si el usuario actual tiene un empleado vinculado a esa persona
-- en cualquier empresa donde tenga membership activa.

CREATE POLICY erp_personas_select ON erp.personas FOR SELECT TO authenticated
  USING (
    core.fn_has_empresa(empresa_id)
    OR core.fn_persona_visible(id)
    OR core.fn_is_admin()
  );
```

`fn_persona_visible` queda STABLE + SECURITY DEFINER + search_path pinned, mismo patrón que `fn_has_empresa` / `fn_is_admin`. Postgres cachea su resultado por statement, así que un SELECT sobre N personas no hace N evaluaciones.

## Reglas (PV1-PV5)

- **PV1: Solo afecta `erp.personas` SELECT.** No tocamos `erp.empleados` (su RLS por `empresa_id` ya es correcta — un humano puede tener empleados en múltiples empresas, cada empleado vive en su empresa). No tocamos INSERT/UPDATE/DELETE de `personas` — el dueño semántico sigue siendo `empresa_id`. El cambio es estrictamente de visibilidad de lectura.

- **PV2: V1 cubre solo vínculo vía `erp.empleados`.** Es el único caso operativo identificado y el que rompe el flujo de Pablo. Si surge necesidad de extender (ej. accionistas que deben ver su persona aunque vivan en otra empresa), se actualiza `fn_persona_visible` agregando otro `OR EXISTS (...)`. La función vive aislada — extenderla no requiere tocar la policy.

- **PV3: La función usa `core.fn_current_empresa_ids()`, no consulta `auth.jwt()` directamente.** Mantiene composición con el resto del set de helpers. Si en el futuro `fn_current_empresa_ids` cambia (ej. agrega filtro por rol), `fn_persona_visible` se beneficia automáticamente.

- **PV4: No relajamos la RLS de tablas satélite (`personas_contactos`, `personas_cuentas_bancarias`, `personas_direcciones`, `personas_datos_fiscales`).** Esas tablas tienen `empresa_id` propio (denormalizado por PS4 de ADR-028) y siguen scoped por su empresa. La motivación es que los datos satélite son específicos al rol comercial dentro de una empresa (un proveedor con cuenta bancaria distinta por empresa, por ejemplo). Si un caso real requiere visibilidad cross-empresa de un satélite, se evalúa en su momento.

- **PV5: La auditoría histórica se documenta pero no se ejecuta automáticamente.** Esta iniciativa entrega un script SQL que lista empleados con `empleado.empresa_id ≠ persona.empresa_id` para que Beto/ops revise caso por caso. No movemos personas en bulk — cada caso podría tener motivación distinta (migración legacy vs. dato malo vs. operación legítima).

## Alternativas consideradas

- **Hacer a Pablo admin temporalmente** — descartado, no es la fix correcta y deja a Pablo con permisos elevados.

- **Mover la persona de Pablo a RDB (Fix 1, opción B)** — sí se aplica como hotfix puntual hoy, pero NO resuelve el problema estructural. Cualquier nuevo humano no-admin operando cross-empresa rompería igual. Se queda como cleanup de dato legacy, no como solución de modelo.

- **Modelo "personas espejo" (una persona por humano por empresa)** — descartado por DRY: duplica datos de identidad (nombre, RFC, fecha de nacimiento) y obliga a sincronización manual entre empresas. Más complejo de mantener que la RLS relajada.

- **Modificar `erp.personas.empresa_id` a NULLABLE** — descartado por blast radius alto: la denormalización de `empresa_id` en tablas satélite (PS4 ADR-028) y en muchas otras tablas asume que `personas.empresa_id` existe. Cambiarlo a NULL forzaría un sweep completo del modelo.

- **Agregar `core.usuarios.persona_id`** y reescribir el callsite del widget — descartado para v1 porque el problema raíz es la RLS, no el email-match. El email-match funciona correctamente cuando RLS lo deja pasar. Cambiar a `persona_id` es mejora de calidad ortogonal y queda como sprint B opcional, no necesario para destrabar el bug.

## Consecuencias

- **Pablo HM (y casos similares legacy de migración JP) ven sus tareas en `/inicio` y `tasks` aunque su persona viva en otra empresa.**

- **Las queries cross-empresa de `personas` ya no necesitan `service-role`.** El cron diario sigue usando service-role por simplicidad operativa, pero los widgets cliente ya no dependen de un workaround silencioso de RLS-bypass.

- **No se requiere cambio de código de aplicación.** Los 3 callsites (mis-tareas-widget, tasks-module, convertir/route) siguen iguales — la RLS más permisiva los desbloquea sin tocar SQL ni TypeScript.

- **Costo de evaluación de RLS aumenta marginalmente.** Cada SELECT a `erp.personas` ahora evalúa hasta 3 funciones (`fn_has_empresa`, `fn_persona_visible`, `fn_is_admin`) contra las 2 de antes. Las 3 son STABLE y cacheadas por statement; el costo extra es despreciable salvo en queries que escaneen toda `erp.personas` (que son raras y deberían usar service-role de todos modos).

- **Riesgo de leak controlado:** el cambio expande la visibilidad — un usuario solo-RDB ahora puede ver personas que viven en DILESA si esas personas tienen empleado en RDB. Eso es exactamente el comportamiento deseado para el caso Pablo y para cualquier humano cross-empresa. NO permite leer personas DILESA arbitrarias (sin vínculo en RDB) — `fn_persona_visible` solo se cumple cuando hay JOIN con un empleado de empresa accesible.

- **Rollback es simple:** un `DROP POLICY` + recreate con el predicate viejo. La función `fn_persona_visible` puede dejarse sin uso (no causa daño).
