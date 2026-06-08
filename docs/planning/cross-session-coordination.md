# Iniciativa — Coordinación entre sesiones (autónomo paralelo)

**Slug:** `cross-session-coordination`
**Empresas:** todas (infraestructura del repo / proceso)
**Schemas afectados:** ninguno (tooling + convenciones + CI). Toca `package.json`, `scripts/`, `.github/workflows/`, `CLAUDE.md`, `docs/strategy/INITIATIVES.md`.
**Estado:** in_progress
**Próximo hito:** Sprint 2 (auto-gen de la tabla Activas desde headers) en este PR. Próximo: Sprint 3 — afinar convenciones de coordinación en `CLAUDE.md` (branch=slug, 1 iniciativa/sesión, `gh pr list` previo) y cerrar
**Dueño:** Beto
**Creada:** 2026-06-07
**Última actualización:** 2026-06-07 (Sprint 2 — auto-gen de la tabla Activas de INITIATIVES.md desde los headers de los planning docs + `initiatives:gen`/`initiatives:check` + step de CI + Regla 1 reescrita en CLAUDE.md)

## Problema

Beto corre **varias sesiones de Claude Code en paralelo en modo autónomo**.
Cada sesión es un proceso independiente sin memoria compartida en vivo; lo único
que comparten es el repo + GitHub. Chocan cuando dos sesiones mutan el mismo
**archivo-hotspot** sin coordinarse:

- **`supabase/migrations/`** — dos sesiones eligen el mismo `YYYYMMDDHHMMSS` →
  colisión de PK en `schema_migrations` que **rompe Supabase Preview** (y
  rompería prod). _Pasó el 2026-06-07: `20260607190000` usado por #721 y #725;
  tumbó el Preview de múltiples PRs (#720, #726…)._
- **`docs/strategy/INITIATIVES.md`** — toda promoción / cambio de estado edita la
  misma tabla → conflictos de merge recurrentes.
- **`package.json` / `types/supabase.ts` / `SCHEMA_REF.md`** — dos sesiones
  regeneran o agregan a la vez.

La raíz: **no hay asignación de namespace ni candado**, así que dos sesiones leen
"X está libre" al mismo tiempo y ambas lo toman (carrera TOCTOU).

## Outcome esperado

1. **Migraciones libres de colisión por construcción**: un generador
   (`npm run db:new`) que elige un timestamp estrictamente mayor que toda
   migración local **+ de PRs abiertos** (coordina vía `gh`). Nadie vuelve a
   copiar un timestamp a mano.
2. **`INITIATIVES.md` deja de ser hotspot**: se auto-genera desde los headers de
   cada `docs/planning/<slug>.md` (`npm run initiatives:gen`), validado en CI
   (`initiatives:check`). Las sesiones solo tocan su propio planning doc (un
   archivo por iniciativa = nunca chocan).
3. **Convenciones de coordinación en `CLAUDE.md`** (memoria compartida entre
   sesiones): branch = slug de iniciativa, una iniciativa = una sesión, revisar
   `gh pr list` antes de arrancar, rebase antes de push.

Meta realista: colisiones **raras y baratas**, no imposibles (cero requeriría
serializar, lo que mata el paralelismo).

## Decisiones registradas

> Cerradas con Beto el 2026-06-07 en la sesión de promoción.

- **D1 — Coordinación stateless vía repo/GitHub, no mensajería viva.** La
  coordinación se hace con convenciones en `CLAUDE.md` (que todas las sesiones
  leen) + tooling determinista, no con `send_message` entre sesiones (frágil:
  depende de que la otra sesión esté "escuchando").
- **D2 — Construir Piezas 1 y 2** (generador de migraciones + auto-gen de
  INITIATIVES.md). Descartado por ahora: registro de sesiones con archivo
  dedicado (la lista de PRs abiertos ya sirve de registro) y mensajería MCP.
- **D3 — El generador coordina vía PRs abiertos** (`gh pr list` + archivos de
  cada PR), no solo migraciones locales — así ve migraciones de otras sesiones
  aún no mergeadas. Residual: dos sesiones en el mismo segundo antes de abrir PR
  (mitigado por "abre tu PR pronto").
- **D4 — Diseño A: tabla Activas auto-generada, `## Done` a mano** (cerrada con
  Beto). Orden alfabético por slug (determinista y estable: un cambio de estado
  mueve una celda, no una fila → diffs mínimos). El nombre legible sale del H1
  (sin campo extra en el header). La columna "Próximo hito" agrega un link
  `(ver [planning](...))` derivado del slug. `## Done` queda hand-maintained
  (historia append-only, no derivable de headers). Toda iniciativa activa debe
  tener `**Próximo hito:**` o `initiatives:check` falla en CI.

## Riesgos

- **R1 — `gh` no disponible en algún runner/sesión.** El generador degrada a
  solo-local con warning (no rompe), aceptando el riesgo residual.
- **R2 — Carrera residual** (dos sesiones, mismo segundo, sin PR aún). Baja
  probabilidad; mitigada por abrir PR pronto. Si se vuelve frecuente, escalar a
  un sufijo derivado del branch.
- **R3 — Auto-gen de INITIATIVES.md rompe el formato actual.** Mitigación: el
  generador parsea los headers existentes; `initiatives:check` en CI detecta
  drift; migrar en un PR aislado (Pieza 2) con verificación del diff.

## Métricas de éxito

- Cero colisiones de timestamp de migración tras adoptar `db:new`.
- Cero conflictos de merge en `INITIATIVES.md` tras la auto-generación.
- Las sesiones nuevas leen y siguen las convenciones (verificable en PRs).

## Sprints / hitos

- **Sprint 1 — Generador de migraciones (Pieza 1).** `scripts/lib/migration-version.ts`
  (pura + tests), `scripts/new-migration.ts` (CLI gh-aware), `npm run db:new` y la
  Regla 0 en `CLAUDE.md`. **(#732, mergeado.)**
- **Sprint 2 — Auto-gen de INITIATIVES.md (Pieza 2).** `scripts/lib/initiatives.ts`
  (parser + render + tests) + `scripts/gen-initiatives.ts` (CLI) → regenera la tabla
  `## Activas` desde los headers + `initiatives:gen` / `initiatives:check` + step en
  CI + Regla 1 reescrita en `CLAUDE.md`. **(Este PR.)**
- **Sprint 3 — Convenciones + closeout.** Afinar la sección de coordinación en
  `CLAUDE.md` (branch=slug, 1 iniciativa/sesión, `gh pr list` previo) y cerrar.

## Bitácora

- **2026-06-07** — Iniciativa promovida a `planned` tras la colisión
  `20260607190000` (#721 ↔ #725) que rompió Supabase Preview de varios PRs.
  Sprint 1 (generador de migraciones) mergeado en #732.
- **2026-06-07** — **Sprint 2 (Pieza 2) construido** (este PR): auto-gen de la
  tabla `## Activas` de `INITIATIVES.md` desde los headers de los planning docs.
  `scripts/lib/initiatives.ts` (parser de headers + render + reemplazo entre
  marcadores `<!-- initiatives:activas:start/end -->`, 20 tests) +
  `scripts/gen-initiatives.ts` (CLI, formatea con prettier) + `initiatives:gen` /
  `initiatives:check` + step "Initiatives index — drift check" en CI + Regla 1
  reescrita en `CLAUDE.md`. Migración de datos: `**Próximo hito:**` agregado al
  header de las 22 iniciativas activas (prosa extraída de la tabla previa,
  refrescada donde el header era más nuevo) + 4 headers stale corregidos a `done`
  (`a11y-baseline`, `access-denied-ux`, `detail-page`, `module-page-submodules` —
  ya estaban en §Done/Roadmap). Tabla regenerada = 22 filas: las 19 previas +
  `cross-session-coordination` + `manual-usuario` (Sprint 0 #720) +
  `dilesa-prelaunch-audit`; salió `dilesa-proyectos-checklist-inline` (done) y se
  reparó la fila de `salud-protocolo` (venía embebida por la tabla malformada).
  Verificado por contenido: slugs de la tabla == headers activos (22, 1:1), cero
  `done` colados, todo fuera de los marcadores byte-idéntico, generador idempotente.
  Estado `planned → in_progress`. Pendiente: Beto decide si `dilesa-prelaunch-audit`
  (ventana pre-cutover ya pasó) se marca `done`.
