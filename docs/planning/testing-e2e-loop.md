# Iniciativa — Testing E2E en el loop (Playwright)

**Slug:** `testing-e2e-loop`
**Empresas:** todas (cross-empresa; el harness es transversal, arranca con la cobertura existente de DILESA/RDB/RH y se extiende módulo-por-módulo)
**Schemas afectados:** principalmente `tests/e2e/**` + `tests/e2e/global-setup.ts`; identidad en `core.usuarios`/`core.roles`/`core.permisos_rol`/`core.usuarios_empresas` (el usuario de prueba `e2e-bot`, solo lectura). Sin schema de producto nuevo — los specs **leen** de todos los schemas contra prod.
**Estado:** in_progress
**Próximo hito:** S1 entregado parcial (test de mutación skipeado + ruta muerta a11y quitada + `beforeEach` de RDB robustecido). **Pendiente vivo de S1:** los 5 smoke de RDB ventas/auditoría siguen rojos — sus selectores asumen elementos/comportamientos no validados de cada pantalla (refresh, detail-panel, tabs "Por categoría"); se verificó que NO es timing, requieren pulido fino pantalla-por-pantalla. **S2:** las 4 violaciones WCAG reales (`/inicio`, `/rdb/inventario`, `/dilesa/admin/tasks`, `/settings/empresas`).
**Dueño:** Beto
**Creada:** 2026-06-26
**Última actualización:** 2026-06-26 (promoción + Sprint 1 en curso)

> Detonante (2026-06-26): a raíz de un hilo de Reddit sobre cómo un no-dev mete a Claude a _construir y probar_ su app con Playwright/Maestro, Beto quiso meter testing visual al loop de BSOP. El primer arranque (smoke de ventas DILESA) destapó que el harness E2E estaba **instalado pero dormido** (auth por localStorage, no por cookies SSR) y, de paso, un bug de infra que rompía `next dev` (colisión de slugs `[id]`/`[ventaId]`, #1055). Arreglado el harness (#1059), los 8 specs de RDB/RH despertaron — y revelaron 11 fallos reales que esta iniciativa ordena y resuelve.

## Problema

BSOP tiene infraestructura Playwright (`tests/e2e/`, `playwright.config.ts`, smoke + a11y) pero **nunca había corrido con autenticación**: el `global-setup` sembraba el token en localStorage y el SSR de BSOP valida por cookies, así que todo se auto-saltaba. Resultado: cero verificación visual real; los cambios se validaban con typecheck + unit tests, nunca ejecutando la app como la ve un usuario.

Además, al despertar el harness, los specs escritos "a ciegas" (que nunca corrieron) traen **selectores y timing frágiles**, un spec que **mutaría prod**, una **ruta muerta**, y **deuda de a11y real** que nadie veía.

## Outcome esperado

Testing E2E **vivo y en el loop**: cuando una sesión toca una superficie, corre su smoke antes de reportar "listo" (verificación real, no inferida). Cobertura read-only confiable y verde sobre las superficies críticas, deuda de a11y trackeada y atacada, y una política clara sobre mutaciones (no contra prod). El harness queda documentado (memoria `reference_e2e_harness_bsop`) para que cualquier sesión lo corra.

## Decisiones registradas

- **2026-06-26 — Auth por cookies SSR, no localStorage.** El `global-setup` acuña las cookies con la misma `@supabase/ssr` de la app (`createServerClient` + `setSession`) + self-check `getUser`. (#1059)
- **2026-06-26 — Usuario de prueba `e2e-bot`, solo lectura.** Creado por SQL en prod: `core.usuarios` (viewer) + rol "E2E (lectura)" por empresa con módulos + 111 permisos `acceso_lectura=true, acceso_escritura=false`. Menor privilegio; el E2E **no muta prod**.
- **2026-06-26 — El E2E corre local/on-demand, NO en CI** (de momento). Evita sumar tiempo/flakiness al pipeline; se reevalúa si demuestra valor sostenido.
- **2026-06-26 — Tests de mutación no corren contra prod.** El bot es read-only a propósito; los specs que escriben (p.ej. `inventario-levantamiento`) se skipean hasta tener un entorno desechable, en vez de mutar datos reales.

## Sprints

- **S1 — Pulido de smoke (en curso).** Robustecer los 5 selectores/timing frágiles de RDB ventas (refresh, panel, "Por categoría", drill-down) + auditoría (summary cards); skipear `inventario-levantamiento` (mutación). Patrón: auto-wait en vez de `waitForTimeout`, tolerancia a sin-datos/sin-permiso, timeouts acordes a Waitry (pesado).
- **S2 — a11y.** Quitar la ruta muerta `/dilesa/terrenos` del a11y spec; diagnosticar y atacar las 4 violaciones WCAG críticas/serias reales (`/inicio`, `/rdb/inventario`, `/dilesa/admin/tasks`, `/settings/empresas`).
- **S3 — Extender cobertura.** Smokes read-only de las superficies críticas que faltan (resto de DILESA: compras, construcción, cobranza; otras empresas).
- **S4 — Política / CI (a decidir).** ¿Meter un smoke mínimo a CI con el `e2e-bot` como secret? ¿Entorno desechable para tests de mutación?

## Riesgos

- **Auth contra prod.** El E2E lee datos reales con el `e2e-bot`. Mitigado: solo lectura (0 permisos de escritura), credenciales en 1Password/`.env.test.local` gitignored.
- **Flakiness.** Datos de prod variables + dev server (Turbopack) con cold-compile. Mitigado: auto-wait, retries acotados, tolerancia a sin-datos.
- **Mantenimiento.** Los specs envejecen con la UI. Mitigado: patrón defensivo (no asume datos), correrlos en el loop al tocar cada superficie.

## Métricas

- Smokes verdes / superficies críticas cubiertas.
- Violaciones a11y críticas/serias abiertas → 0.
- Bugs reales destapados por el E2E (ya: colisión de slugs #1055; deuda a11y; spec de mutación).

## Bitácora

- **2026-06-26** — Promoción. Harness arreglado y smoke de ventas DILESA (14 checks) en main: #1055 (fix colisión slug que rompía `next dev`) + #1059 (auth cookies SSR + spec DILESA). `e2e-bot` provisto en prod (solo lectura, 111 módulos). Corrida full: **56/67** verde; 11 fallos triados (4 a11y reales, 1 ruta muerta, 1 mutación, 5 selectores frágiles). Arranca S1.
- **2026-06-26** — S1 (parcial). Skipeado el test de mutación `inventario-levantamiento` (read-only no escribe en prod); quitada la ruta muerta `/dilesa/terrenos` del a11y spec; robustecidos los `beforeEach` de RDB ventas/auditoría (networkidle + espera de heading). **Verificado que el fix de timing NO resuelve los 5 smoke de RDB** → el problema son selectores que asumen elementos no validados de cada pantalla (refresh, detail-panel, "Por categoría"); queda como pendiente vivo de S1, pulido pantalla-por-pantalla. Las 4 violaciones WCAG reales → S2.
