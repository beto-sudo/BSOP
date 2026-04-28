# Iniciativa — Empleados multi-puesto + rename a Personal

**Slug:** `empleados-multi-puesto`
**Empresas:** todas
**Schemas afectados:** `erp` (nueva tabla `empleados_puestos`, refactor de `v_empleados_full`, posible deprecación de `empleados.puesto_id`) + UI (rename módulo "Empleados" → "Personal" en sidebar/URL/detalle/listado)
**Estado:** proposed
**Dueño:** Beto
**Creada:** 2026-04-27
**Última actualización:** 2026-04-27

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

_(se llena cuando arranque ejecución, vía Claude Code)_

## Decisiones registradas

_(append-only, fechadas — escrito por Claude Code)_

## Bitácora

_(append-only, escrita por Claude Code al ejecutar)_
