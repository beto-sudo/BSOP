# ADR-013 — Modelo N:M para puestos por empleado (Empleados multi-puesto, Sprint 1)

**Fecha:** 2026-04-27
**Estado:** aceptado
**Iniciativa:** [`empleados-multi-puesto`](../planning/empleados-multi-puesto.md) — Sprint 1 (DB)

## Contexto

`erp.empleados.puesto_id` es escalar — una persona-empresa con un único puesto. El modelo se rompe en cuanto una persona tiene **más de un rol** dentro de la misma empresa, lo que ya es realidad operativa: Beto, Alejandra Chavarría y Michelle Santos tienen 3 roles cada una en RDB (Accionista + Comité Ejecutivo + Consejo de Administración). Antes del cleanup operativo del 2026-04-27 se veían como 9 personas distintas en `/rdb/rh/empleados`.

Sprint 1 introduce el modelo N:M en DB sin tocar UI. Sprints 2-4 cubren el barrido de queries, el rename a "Personal" y el cleanup de datos.

## Decisiones

### D1: Tabla N:M con `empresa_id` denormalizado

**Decisión:** crear `erp.empleados_puestos (id, empresa_id, empleado_id, puesto_id, principal, fecha_inicio, fecha_fin, created_at, updated_at)`.

**Por qué incluir `empresa_id` denormalizado** si es derivable desde `empleados.empresa_id`:

- El patrón RLS del repo (ver `erp.empleados_compensacion`) usa `core.fn_has_empresa(empresa_id) OR core.fn_is_admin()` — requiere `empresa_id` directo en cada fila. Sin denormalizar habría que JOIN dentro del policy, peor performance y más complejo.
- Se valida con un trigger BEFORE INSERT/UPDATE que `empresa_id` coincide con `empleado.empresa_id` y con `puesto.empresa_id` — drift imposible si se respeta la API normal.

### D2: Solo un puesto principal vigente por empleado, vía partial unique index

**Decisión:** índice parcial `UNIQUE (empleado_id) WHERE principal = true AND fecha_fin IS NULL`.

**Por qué partial:** un empleado puede tener N puestos no-principales y M principales históricos (con `fecha_fin` no NULL). El constraint debe aplicar solo al principal vigente actual.

### D3: `fecha_fin IS NULL` = vigente (modelo append-friendly)

**Decisión:** las filas con `fecha_fin` no NULL se consideran históricas. La vista `v_empleados_full.puestos[]` filtra `fecha_fin IS NULL`. Cambiar de puesto principal puede hacerse con UPDATE directo (más simple) o con DELETE + INSERT (append-only, deja histórico).

**Por qué no forzar append-only:** la UI v1 no necesita histórico de cambios de puesto. La columna `fecha_fin` existe para soportarlo en el futuro (Sprint N) sin migración. Entre tanto se permite UPDATE/DELETE directo. Si más adelante hace falta auditoría real, se agrega `audit_log` o se usa `pg_audit`.

### D4: `empleados.puesto_id` queda como columna por compatibilidad durante Sprint 2

**Decisión:** NO se deprecia ni se remueve `empleados.puesto_id` en Sprint 1. Sigue como columna escalar nullable, con FK a `erp.puestos.id`.

**Trade-off:**

- **Mantener (elegida):** wizard de alta sigue funcionando sin cambios durante Sprint 1+2. La vista hace `COALESCE(pu_principal, pu_legacy)` — si por algún motivo el backfill no cubrió a alguien, la columna escalar funciona como fallback. Sprint 2 migra los reads a la vista; cuando todos los reads vayan vía vista, la columna queda obsoleta y se puede dropar en una iteración futura (fuera del alcance de esta iniciativa).
- **Deprecar ahora:** más limpio pero rompe el wizard de alta y las queries directas hasta que Sprint 2 las refactorice. Riesgo de ventana donde usuarios crean empleados sin puesto.

El COALESCE en la vista es el seguro. Cuando se cierre Sprint 2, se considera dropar la columna como follow-up.

### D5: `puestos` como `jsonb` array en la vista

**Decisión:** `v_empleados_full.puestos` es `jsonb` array de objetos `{puesto_id, nombre, principal, fecha_inicio, fecha_fin}`, ordenado con principal primero y luego alfabético.

**Por qué jsonb (no `text[]` ni columna por puesto):**

- Cada puesto necesita varios atributos (`nombre` para mostrar, `puesto_id` para editar, flag `principal`, fechas). `text[]` no alcanza.
- Columnas separadas (`puesto_principal_nombre`, `puestos_secundarios_nombres`) explotan el ancho de la vista y rompen escalabilidad si una persona tiene 4+ puestos.
- `jsonb` lo serializa supabase-js automáticamente como `Array<{...}>` en el cliente.

### D6: Validación cross-empresa por trigger, no por constraint

**Decisión:** trigger `trg_empleados_puestos_validate_empresa` valida en BEFORE INSERT/UPDATE OF (empresa_id, empleado_id, puesto_id) que `empresa_id` coincide con la del empleado y la del puesto.

**Por qué trigger:** un CHECK constraint en una columna no puede leer de otra tabla. Foreign keys parciales (FK con condición) no existen en Postgres estándar. El trigger es el patrón obligado para mantener integridad cross-tabla. Es el mismo patrón que usa el resto del repo.

### D7: Backfill 1:1 con `ON CONFLICT DO NOTHING`

**Decisión:** un INSERT que toma cada `erp.empleados.puesto_id IS NOT NULL AND deleted_at IS NULL` y crea su fila correspondiente en `empleados_puestos` con `principal = true`. Idempotente (re-correr no genera duplicados gracias al unique index parcial).

**Resultado verificado en prod (2026-04-27):** 202 empleados con `puesto_id` → 202 filas en `empleados_puestos`, todas `principal = true`. Match 1:1.

## Consecuencias

- **Pro**: el modelo soporta multi-puesto sin duplicar empleado. Sprint 4 va a poder agregar Comité Ejecutivo + Consejo de Administración como puestos secundarios para Beto/Alejandra/Michelle en RDB y DILESA.
- **Pro**: la vista mantiene backwards compatibility (`puesto_id`/`puesto` siguen llenos) — ningún consumidor existente se rompe en Sprint 1.
- **Pro**: RLS sigue patrón consolidado (`core.fn_has_empresa`).
- **Contra**: hay redundancia transitoria entre `empleados.puesto_id` y `empleados_puestos.principal=true`. Riesgo de drift si alguien escribe a uno sin tocar el otro. Mitigaciones: (a) Sprint 2 migra todos los writes al modelo nuevo, (b) la vista hace COALESCE así que el peor caso es "muestra el legacy", no "muestra null".
- **Neutral**: `fecha_inicio`/`fecha_fin` quedan en la tabla pero la UI no las usa en v1. No molestan; soportan histórico futuro sin migración.

## Follow-ups (post-iniciativa)

- Considerar drop de `empleados.puesto_id` cuando todos los consumidores lean vía vista (después de Sprint 2 + soak en producción).
- Si aparece necesidad de auditoría real de cambios de puesto, evaluar `pg_audit` o tabla `audit_log` dedicada.
