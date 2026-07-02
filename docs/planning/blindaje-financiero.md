# Iniciativa — Blindaje financiero (red de seguridad de las mutaciones de dinero)

**Slug:** `blindaje-financiero`
**Empresas:** todas (el modelo financiero vive en `erp.*` compartido)
**Schemas afectados:** `erp` (RPCs financieras, `audit_log`, grants), `dilesa` (gate de fase/PLD, `venta_fases`), `core` (identidad `usuarios`↔`auth.users`), Supabase Storage (bucket `adjuntos`)
**Estado:** in_progress
**Próximo hito:** mergear S1 (gen-functions-ref + drift-guard en schema-check.yml) → arrancar Sprint 2 (suite de integración SQL de las RPCs de dinero contra la shadow)
**Dueño:** Beto
**Creada:** 2026-06-12
**Última actualización:** 2026-07-02 (Beto aprobó alcance v1; arranca Sprint 1)

## Problema

La revisión general 2026-06-12 confirmó que **toda la lógica financiera del repo vive en ~119 funciones de Postgres sin red de seguridad**:

- **Sin fuente canónica de la versión viva.** Las funciones existen solo como deltas dispersos en 398 migraciones (`process_waitry_inbound` redefinida 6 veces, `cxc_pago_registrar` 4, `cxp_pago_aprobar` 3). Esto **ya causó un incidente real**: el FIFO de CxC estuvo roto ~11 días porque una migración partió de una versión vieja del RPC y reintrodujo un `AND` que dejó cargos pendientes para siempre. Nada lo previene hoy: `drift-check.sql` no compara cuerpos de funciones y `SCHEMA_REF.md` no las incluye.
- **Cero tests de comportamiento.** `rg` de `cxp_pago_aprobar|cxc_pago_aplicar|cxc_pago_registrar|fn_generar_plan_pagos` en `*.test.ts` = 0 archivos. No hay pgTAP ni suite de integración contra DB. El único test que toca una RPC verifica _existencia_, no lógica. El FIFO de CxC, los guards de presupuesto y los triggers de recalc corren sin red.
- **Gates de negocio solo en capa app.** `marcarFase` corre client-side; la policy `venta_fases_write` solo pide membresía de empresa. El gate server-side de Fase 13 (PLD) es esquivable con el mismo INSERT directo a `venta_fases` que las otras fases hacen vía PostgREST. Además `marcarFase` hace 4 escrituras secuenciales sin atomicidad desde el browser (su propio docstring admite los huérfanos).
- **Audit trail no uniforme.** Columnas `*_por` sin FK (`obra_estimaciones`, `presupuesto_partidas`, `estados_cuenta`); tablas financieras sin autor en la fila (`erp.facturas` sin `created_by`; `erp.movimientos_bancarios` — el espejo de tesorería — sin ninguna columna de autoría). Identidad de usuario partida en dos espacios de uuid (`core.usuarios.id` sin FK a `auth.users`).
- **Bucket `adjuntos` sin scoping de empresa.** La policy da SELECT a cualquier `authenticated`; el proxy lo documenta. Cualquier usuario de cualquier empresa puede leer INEs, expedientes PLD y estados de cuenta de las demás.

El Sprint 0 (ya aplicado a prod) cerró el perímetro `anon` (RPCs financieras + vista de presupuesto) y blindó el expediente PLD contra DELETE-cascade. Esta iniciativa construye la **red de seguridad permanente** para que el dinero no dependa de la memoria ni del ojo en el Preview.

## Outcome esperado

- **Ninguna función financiera se puede pisar sin que CI lo detecte**: snapshot versionado de los cuerpos + drift-guard que falla el PR si la definición viva difiere del snapshot.
- **Las RPCs de dinero tienen tests de comportamiento**: secuencias que afirman saldos (FIFO aplica → cancelar revierte; aprobar con/sin rol; baseline + cambio aditivo/deductivo con guard).
- **Los gates financieros viven en la DB, no solo en la app**: cierre de fase y mutaciones críticas pasan por RPC `SECURITY DEFINER` con gate de permiso + atomicidad transaccional.
- **Audit trail uniforme y completo**: todo `*_por` con FK a `core.usuarios`; `created_by` en facturas y movimientos bancarios; identidad de usuario unificada.
- **Aislamiento de adjuntos por empresa** en el proxy.
- **Defensa en profundidad sobre el perímetro del Sprint 0**: gate interno en las RPCs mutadoras + revoke amplio de `anon` en los schemas de negocio, validado por un test anon-negativo.

## Alcance v1 (sprints propuestos — pendientes de aprobación)

- [x] **Sprint 1 — Fuente canónica de funciones + drift-guard (ataca la clase FIFO).** Generador `gen-functions-ref` (hermano de `schema:ref`): dump versionado de `pg_get_functiondef` de todas las funciones de negocio (182) + triggers/CHECKs. Drift-guard en `schema-check.yml` (shadow) que falla el PR si la definición que producen las migraciones difiere del snapshot. Convención: toda redefinición parte de ese archivo, nunca de la migración anterior.
- [ ] **Sprint 2 — Suite de integración SQL.** `vitest.integration.config.ts` contra `supabase start` que ejercita las ~10 RPCs de dinero (cxc/cxp/presupuesto) assertando saldos + un **caso anon-negativo** (anon-key directo → 42501). Corre en CI en PRs que tocan `supabase/migrations/**` (trigger ya existe en `drift-check.yml`).
- [ ] **Sprint 3 — Cierre de fase como RPC transaccional.** `fn_cerrar_fase` (`SECURITY DEFINER`) que valida permiso de módulo + gate PLD en DB y commitea `adjuntos`+`ventas`+`venta_fases` juntos (absorbe `marcarFase`). Restringe INSERT directo a `venta_fases` / UPDATE de `fase_actual` a esa RPC.
- [ ] **Sprint 4 — Gate interno + revoke amplio de anon (defensa en profundidad).** `IF NOT fn_is_admin() AND NOT fn_has_empresa(...) THEN RAISE 42501` al inicio de cada RPC mutadora (partiendo de `pg_get_functiondef`, con el snapshot de S1 y el test de S2 como red). Revoke de `anon` de todas las funciones/tablas/defaults de negocio, no solo las 30 del Sprint 0.
- [ ] **Sprint 5 — Audit trail uniforme + identidad.** FK a `core.usuarios` en todos los `*_por`; `created_by`/`registrado_por` en `erp.facturas` y `erp.movimientos_bancarios` con backfill; FK `core.usuarios.id → auth.users(id)` (o `auth_user_id NOT NULL UNIQUE`). ADR corto del patrón único de autoría.
- [ ] **Sprint 6 — Scoping de adjuntos por empresa.** El proxy `/api/adjuntos/[...path]` resuelve el `erp.adjuntos` dueño del path y valida contra `core.usuarios_empresas`. Policy de Storage acorde.

## Riesgos

- **Tocar cuerpos de funciones financieras** (S3, S4) es justo la clase del incidente FIFO. Mitigación: el snapshot de S1 y los tests de S2 deben existir **antes** de S3/S4; toda redefinición parte de `pg_get_functiondef` vivo.
- **Revoke amplio de anon** podría romper un flujo legítimo (helpers de RLS usados en políticas `TO public`). Mitigación: el test anon-negativo de S2 + verificación de que `authenticated`/`service_role` conservan acceso, función por función (como en Sprint 0).
- **Migración de identidad de usuario** (S5) toca FKs de autoría existentes. Mitigación: validar datos primero (`core.usuarios.id ∈ auth.users.id`), backfill, luego FK.

## Métricas de éxito

- 0 funciones financieras sin snapshot en el drift-guard; CI falla si alguna se pisa.
- 100% de las RPCs de dinero (cxc/cxp/presupuesto/cierre de fase) con al menos un test de comportamiento.
- 0 mutadores de negocio ejecutables por `anon` (verificado por test, no por inspección).
- 0 columnas `*_por` sin FK; `facturas` y `movimientos_bancarios` con autor en la fila.
- Bucket `adjuntos` rechaza lectura cross-empresa.

## Decisiones registradas

- **2026-07-02 — S1 cubre TODAS las funciones de negocio, no solo las ~20 financieras.** El costo marginal de dumpear todo `pg_proc` propio (182 funciones, excluyendo miembros de extensiones vía `pg_depend`) es cero y la clase FIFO aplica a cualquier función redefinida desde una versión vieja. Se incluyen triggers y CHECK constraints por tabla (el reporte los pedía como "lista"). Alcance = mismos schemas que `SCHEMA_REF.md`.
- **2026-07-02 — El drift-guard vive en `schema-check.yml`, no en `drift-check.sql`.** El planning original (12-jun) proponía extender `drift-check.sql`; con el modelo `derivados-sin-drift` (S2, posterior) el lugar correcto es el workflow de shadow: `FUNCTIONS_REF.md` es un derivado más de las migraciones, regenerado por `db:regen` y comparado en CI. Gratis: el diff del PR muestra el cuerpo exacto que cambia en cada redefinición.

## Bitácora

- **2026-07-02** — Beto aprobó alcance v1 (`proposed → in_progress`). **Sprint 1 ejecutado**: `scripts/gen-functions-ref.ts` (hermano de `gen-schema-ref.ts`, formatter puro + tests de determinismo/orden/render) genera `supabase/FUNCTIONS_REF.md` (182 funciones + 166 triggers + 226 CHECKs de 11 schemas, desde la shadow); `npm run functions:ref`/`functions:check`; `db:regen` lo incluye; `schema-check.yml` lo valida (regen + artifact + diff). Convención documentada en `GOVERNANCE.md` §3 y `CLAUDE.md` (Reglas DB): toda redefinición parte de `FUNCTIONS_REF.md`. Helper `.env.local` extraído a `scripts/lib/env-local.ts` (compartido con `gen-schema-ref.ts`).
- **2026-06-12** — Promovida desde la revisión general 2026-06-12 (auditoría ultracode). El Sprint 0 de perímetro (REVOKE anon en 30 RPCs + `v_partida_control` con `security_invoker` + expediente PLD a RESTRICT) ya está aplicado y verificado en prod (PR [#877](https://github.com/beto-sudo/BSOP/pull/877)). Esta iniciativa recoge el resto de la dimensión db-seguridad + testing-calidad del reporte.
