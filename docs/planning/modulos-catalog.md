# Iniciativa — Catálogo de módulos con sección + sync por migración

**Slug:** `modulos-catalog`
**Empresas:** todas (catálogo es cross-empresa por construcción)
**Schemas afectados:** core (`core.modulos`)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-04-28
**Última actualización:** 2026-04-28

> Continuación natural de `sidebar-taxonomia` (cerrada hoy con
> ADR-014). Mientras esa iniciativa resolvió la **agrupación visual**
> del sidebar, esta resuelve el **catálogo de módulos en DB** que
> alimenta la UI de Roles y Permisos en Settings → Acceso.

## Problema

Hay 3 fuentes de verdad mantenidas a mano que tienen que estar
sincronizadas para que un módulo nuevo funcione end-to-end:

1. **`NAV_ITEMS`** en `components/app-shell/nav-config.ts` — qué se
   ve en el sidebar.
2. **`ROUTE_TO_MODULE`** en `lib/permissions.ts` — mapea URL del
   sidebar al slug del módulo para `canAccessModulo`.
3. **`core.modulos`** en DB — rows por empresa que la UI de Roles
   en Settings → Acceso consume.

Cuando se libera un módulo nuevo, hay que tocar las 3. Drift
observado al cierre de `sidebar-taxonomia`:

- **DILESA tiene 7 slugs en `ROUTE_TO_MODULE`** (Admin × 3, RH × 3,
  Proveedores) pero el sidebar tiene 4 más (Terrenos, Prototipos,
  Anteproyectos, Proyectos) que NUNCA se registraron como módulos.
  Resultado: nadie puede controlar acceso granular a esos pages, no
  aparecen en Settings → Roles, y el filtrado por permisos los
  considera "siempre visibles" porque no hay slug en
  `ROUTE_TO_MODULE`.
- **`core.modulos` no tiene campo `seccion`.** La UI de Settings →
  Roles los lista alfabéticamente sin agrupar (Cortes, Departamentos,
  Documentos, Empleados, Home, Inventario, Juntas, OCs, …). El
  modelo mental que ADR-014 estableció en el sidebar (5 secciones:
  Administración / RRHH / Compras / Inventario / Operaciones) no se
  refleja aquí.

Resultado operativo: cuando Beto (o quien quiera) configure un rol
nuevo, la lista alfabética mezcla módulos de distinta naturaleza y
es difícil identificar visualmente "todos los de Compras" o "todos
los de RRHH".

Cuando entren ANSA, COAGAN y Nigropetense, este drift escalará: cada
empresa nueva = 15-20 rows que insertar a mano en `core.modulos` con
fácil olvido.

## Outcome esperado

1. **`core.modulos` tiene columna `seccion`** con las 5 secciones
   canon del ADR-014 (más una sección catch-all "Sistema" para
   módulos transversales tipo Home/Settings).
2. **La UI de Settings → Roles agrupa por sección** con los mismos
   labels que el sidebar (Administración / Recursos Humanos /
   Compras / Inventario / Operaciones / Sistema).
3. **Migración con módulos faltantes en DILESA** (Inmobiliario × 4)
   más cualquier otro hueco detectado durante la auditoría.
4. **`ROUTE_TO_MODULE` actualizado** en sync con DB.
5. **Regla operativa documentada en `BSOP/CLAUDE.md`** —
   _"Cada módulo nuevo que se libere requiere migración SQL en
   `core.modulos`"_.
6. **Test de sync en CI** — falla si hay slugs en `ROUTE_TO_MODULE`
   sin row correspondiente en `core.modulos` (o viceversa).

## Alcance v1

### Sprint 1 — Schema + UI agrupada

- [ ] Migración `core.modulos`: `ALTER TABLE … ADD COLUMN seccion text`
      con CHECK constraint sobre el set de secciones permitidas.
- [ ] Backfill de `seccion` para los rows existentes derivando del
      `slug` (ej. `*.admin.*` → 'administracion', `*.rh.*` → 'rh',
      `*.proveedores`/`requisiciones`/`ordenes_compra` → 'compras',
      `*.productos`/`inventario` → 'inventario', resto → mapeo
      explícito caso por caso).
- [ ] Tras backfill, hacer la columna `NOT NULL`.
- [ ] Regenerar `supabase/SCHEMA_REF.md`.
- [ ] Update query en `app/settings/acceso/page.tsx` para incluir
      `seccion`.
- [ ] Update render en `app/settings/acceso/acceso-client.tsx` para
      agrupar la tabla de módulos por sección con header tipo
      sidebar (mismo styling de `<NavSubItems>` o equivalente).

### Sprint 2 — Cerrar gap de DILESA + regla operativa

- [ ] Migración con INSERT de los 4 módulos faltantes en DILESA
      (Inmobiliario): `dilesa.terrenos`, `dilesa.prototipos`,
      `dilesa.anteproyectos`, `dilesa.proyectos`.
- [ ] **Backfill defensivo de permisos**: para cada rol existente en
      DILESA, insertar `core.permisos_rol` con
      `acceso_lectura=true, acceso_escritura=true` para los 4
      módulos nuevos. Razón: hoy esos pages son "siempre visibles"
      porque no hay slug — agregar el slug y dejar permisos vacíos
      _ocultaría_ los pages a usuarios actuales. La migración debe
      preservar el status quo.
- [ ] Update `ROUTE_TO_MODULE` con los 4 slugs nuevos.
- [ ] Audit final: comparar `ROUTE_TO_MODULE` vs `core.modulos` y
      confirmar 1:1 (modulo cualquier `*.home` o transversal que se
      decida incluir/excluir).
- [ ] Test en `lib/permissions.test.ts` (o nuevo
      `lib/modulos-sync.test.ts`) que falla si hay drift entre
      `ROUTE_TO_MODULE` y un snapshot estático de `core.modulos`
      slugs esperados.
- [ ] Documentar la regla en `BSOP/CLAUDE.md` (sección "Reglas DB")
      con un mini-runbook: _"Para liberar un módulo nuevo: (1)
      agregar URL al sidebar, (2) agregar entry en `ROUTE_TO_MODULE`,
      (3) crear migración con INSERT en `core.modulos` y backfill de
      permisos por defecto."_

## Fuera de alcance (Pieza 2 diferida)

- **Consolidar `nav-config.ts` + `ROUTE_TO_MODULE` + módulo en una
  única estructura TypeScript.** Opción atractiva (pieza 2 de la
  conversación inicial) pero complica el shape de `nav-config.ts`
  con `slug`/`seccion` por child y eleva el riesgo de churn cuando
  vengan otras iniciativas UI. Beto pidió no incluirla en v1.
  Decisión: revisitar cuando ANSA/COAGAN/Nigropetense empiecen a
  entrar y se vea si la fricción aumenta.

- **UI para crear módulos desde Settings → Acceso.** Hoy se hace por
  migración SQL. Una UI tipo "Nuevo módulo" sería conveniente pero
  rompe la regla de "migración para cambios de catálogo" (DB sería
  modificada desde la app sin trazabilidad git). Si se necesita,
  saldría como sub-iniciativa.

- **Reorganizar slugs existentes.** Slugs como `rdb.tasks` (legacy)
  vs `rdb.admin.tasks` (canon) podrían unificarse. No urgente —
  preserve compat por ahora.

## Métricas de éxito

- 100% de los pages bajo `app/<empresa>/` (que aplican RequireAccess
  o equivalente) tienen entry en `ROUTE_TO_MODULE` y row en
  `core.modulos`.
- 0 slugs en `ROUTE_TO_MODULE` sin row correspondiente en
  `core.modulos` (test en CI).
- UI de Settings → Roles muestra módulos agrupados por sección
  idéntico al sidebar (mismo orden, mismos labels).
- Cuando Beto vaya a configurar el rol de Dirección en DILESA, ve
  Inmobiliario (Terrenos / Prototipos / Anteproyectos / Proyectos)
  agrupados.
- `BSOP/CLAUDE.md` tiene la regla "módulo nuevo = migración"
  documentada en sección "Reglas DB".

## Riesgos / preguntas abiertas

- [ ] **Cambio de comportamiento al agregar slugs nuevos.** Hoy
      `/dilesa/terrenos` no tiene slug en `ROUTE_TO_MODULE` →
      `canAccessModulo` retorna `true` por default (línea 109-110 de
      `sidebar.tsx`: _"If no modulo mapping, show if empresa is
      accessible"_). Al agregar el slug, cambiamos a "depende de
      `canAccessModulo`". Mitigación: backfill defensivo de
      `core.permisos_rol` (Sprint 2 item 2) preservando status quo.
      Riesgo residual: usuarios con excepción granular podrían ver
      cambios sutiles. Validar con impersonate.
- [ ] **Set de secciones.** Las 5 del ADR-014 (Administración / RRHH
      / Compras / Inventario / Operaciones) cubren empresas
      operativas. Pero hay módulos transversales (`rdb.home`,
      `settings.acceso`) que no encajan. Decisión al implementar:
      sección 'sistema' o 'transversal'. Sugerencia: 'sistema' —
      cubre Home, Settings/Acceso, Settings/Empresas, etc.
- [ ] **CHECK constraint o ENUM.** El set de secciones permitidas
      puede ser un CHECK constraint sobre la columna text, o un tipo
      ENUM en Postgres. Sugerencia: CHECK constraint —
      añadir/cambiar secciones futuras es más simple.
- [ ] **Test de sync.** Implementar como vitest con un snapshot
      estático de slugs esperados, o como script SQL que CI corre
      contra el preview branch de Supabase. Sugerencia: vitest con
      snapshot en TS (más simple, no requiere conexión DB en CI).
      Limita a validar `ROUTE_TO_MODULE.values() ⊆ EXPECTED_SLUGS`.

## Sprints / hitos

Ver bloque "Alcance v1" arriba — 2 sprints definidos.

## Decisiones registradas

_(append-only, fechadas — escrito por Claude Code al ejecutar)_

- **2026-04-28 — Pieza 2 (consolidar nav-config) diferida.** Beto
  pidió arrancar con piezas 1 + 3 únicamente. Razón: la pieza 2
  embebería slug y seccion en `nav-config.ts`, complicando el shape
  recién estabilizado por `sidebar-taxonomia`. Se revisita cuando
  haya más empresas y la fricción de mantener 3 fuentes lo
  justifique.
- **2026-04-28 — Sync por migración, no script manual.** Beto
  prefirió que cada módulo nuevo se introduzca vía migración SQL
  versionada en `supabase/migrations/` (no via script ejecutable
  manual). Razón: trazabilidad nativa via git + CI; consistencia
  entre todos los entornos; reusa el flujo ya conocido del repo.
- **2026-04-28 — Columna `seccion` en `core.modulos` (no derivado
  del slug).** Aprobado. Razón: tener la sección como dato explícito
  permite excepciones (módulo cuyo slug no encaja con la
  convención), facilita queries directas, y cuando se reorganice la
  IA del sidebar no requiere re-deducir secciones de slugs.

## Bitácora

_(append-only, escrita por Claude Code al ejecutar)_

- **2026-04-28** — Iniciativa promovida directo a `planned` con
  alcance v1 cerrado en conversación con Beto tras cierre de
  `sidebar-taxonomia`. Doc creado + fila en `INITIATIVES.md`. PR
  #281 mergeado.
- **2026-04-28 — Sprint 1 completo.** Migración
  `20260428220000_modulos_add_seccion.sql` aplicada en producción
  (22 rows backfilled — todos cayeron en una de las 6 secciones
  canónicas). Columna `core.modulos.seccion text NOT NULL` con CHECK
  constraint. Type `Modulo` extendido con `ModuloSeccion`. UI de
  Settings → Roles agrupada por secciones (mismo orden + labels que
  sidebar). PR #282 mergeado, SCHEMA_REF regenerado.
- **2026-04-28 — Sprint 2 PR abierto.** Migración
  `20260428230000_modulos_dilesa_inmobiliario.sql` con INSERT de
  los 4 módulos faltantes (`dilesa.terrenos`, `dilesa.prototipos`,
  `dilesa.anteproyectos`, `dilesa.proyectos`) en sección
  `operaciones` + backfill defensivo de `core.permisos_rol` con
  read+write para cada rol existente en DILESA. `ROUTE_TO_MODULE`
  actualizado con los 4 slugs. Test `ROUTE_TO_MODULE ↔ core.modulos
sync` agregado en `lib/permissions.test.ts` con
  `EXPECTED_DB_MODULE_SLUGS` como lista canónica. Regla "Liberación
  de módulo nuevo (RBAC sync)" documentada en `BSOP/CLAUDE.md`
  sección "Reglas DB" listando los 4 lugares a tocar y la plantilla
  de la migración.
