## Memoria de proyecto — protocolo

> Este repo guarda su propia memoria estratégica para que no necesite vivir
> en mi cabeza. Cualquier sesión nueva empieza leyendo estos docs.

### Al inicio de toda sesión

1. Lee `docs/strategy/INITIATIVES.md` para ver qué iniciativas están activas,
   en qué estado, y cuál es el próximo hito de cada una.
2. Si la sesión va a tocar una iniciativa específica, lee
   `docs/planning/<slug>.md` antes de actuar — ahí vive el contexto, alcance,
   decisiones y bitácora.
3. Si lo que el usuario pide no encaja con ninguna iniciativa, **estresá la
   idea con preguntas** (¿qué problema resuelve?, ¿qué pantallas/schemas toca?,
   ¿métrica de éxito?, ¿riesgos?, ¿hay ADR pendiente?) y proponé promoverla.
   Solo creá el doc de planning + corré el generador cuando Beto diga
   explícitamente _"sí, promovela"_. Si es un task suelto, no requiere doc.

### Al cerrar trabajo en una iniciativa

Antes de la respuesta final que entrega el cambio, **actualizá el planning doc**:

- **`## Bitácora`** (append-only): qué se hizo, links a PR/commit, fecha.
- **`## Decisiones registradas`** (append-only): decisión táctica nueva, con
  fecha y razón.
- **Header**: `Estado` y `Última actualización`.

Si la iniciativa quedó completa: poné `Estado: done` en el header (sale de
`## Activas` sola al regenerar) y agregá **a mano** su entrada a `## Done` con
fecha + outcome de 1 línea. No borres el planning doc — queda como referencia.

**Barrido obligatorio de Reminders al cerrar (`* → done`):** antes de poner
`Estado: done` o de reportar el cierre en chat, correr:

```bash
remindctl show all --list "Claude 🧭" --json
```

Completar lo que matchee el slug/PRs/sprints/closeouts de la iniciativa. Las
sub-tareas históricas mueren con la iniciativa. Si encuentro algo cross-sesión
que requiere acción operativa de Beto (ej. backfill manual post-merge), no lo
borro — lo dejo y lo menciono en el reporte de cierre. (La lista de pendientes
es `Claude 🧭`; `Claude: BSOP` quedó deprecada el 2026-05-02.)

### Roles

- **Claude Code (yo)** soy dueño de planeación + ejecución end-to-end: Problema,
  Outcome, Alcance, Riesgos, Métricas, Bitácora, Decisiones, Sprints/hitos,
  ADRs, código, PRs. **Puedo proponer, no decidir** qué se promueve.
- **Beto decide y mergea**: aprueba la promoción de ideas a iniciativas, las
  transiciones de estado (`proposed → planned → in_progress → done`), y mergea
  los PRs. (Ver ADR-012 para el contexto de la deprecación del split Cowork/CC.)

### Cuándo crear un ADR

Crea `docs/adr/NNNN_<titulo>.md` (o `supabase/adr/NNNN_…` si es DB-puro) cuando
la decisión: (a) cruza más de una iniciativa o vive más allá de ella (convención
de layout, política de RLS, formato de migración), o (b) tiene tradeoffs no
obvios que un futuro lector se preguntará _"¿por qué?"_. Si es 100% interna a
una iniciativa, vive en su `## Decisiones registradas`.

### Reglas de oro

- **No improvisar plan**: si el planning doc está stale o vacío, alineáte con
  el usuario antes de actuar.
- **No multiplicar docs**: una iniciativa = un doc en `docs/planning/`. No
  fragmentes salvo que supere ~500 líneas.
- **No crear iniciativas por mí mismo**: solo el usuario decide. Yo propongo.
- **Slug `kebab-case`**: single-empresa lleva prefijo (`dilesa-`, `rdb-`,
  `ansa-`, `coagan-`); cross-empresa o general, sin prefijo.

---

## CI / PRs — protocolo de validación

> Un PR no está "listo" hasta que CI pase verde. No reportar entregado antes.

### Antes de `git push` — correr los 6 checks de CI

**Sobre todo el repo, no solo los archivos tocados**, en este orden (espejo de
`.github/workflows/ci.yml`; si CI cambia, actualizar esta lista):

```bash
npm run typecheck         # tsc --noEmit
npm run test:coverage     # vitest + coverage thresholds — `test:run` NO basta:
                          # puede pasar local y CI fallar por coverage
npm run lint              # eslint .
npm run format:check      # prettier --check . (¡todo el repo!)
npm run initiatives:check # tabla Activas de INITIATIVES.md en sync con docs/planning/
npm run schema:check      # SCHEMA_REF.md vs DB prod — requiere SUPABASE_DB_URL
                          # (op read "op://Infrastructure/SUPABASE_DB_URL/credential");
                          # si no tocaste DB puede saltarse: CI lo corre igual
```

Si `format:check` reporta archivos que no toqué, **igual los formateo en este
PR** — su mal estado bloquea CI lo causara yo o lo heredara. (Drift típico: una
herramienta externa formatea un sub-set, el PR pasa sin correr `prettier
--check .` global, y se mergea malformatado. La regla "todo el repo" lo detecta.)

### Después de `git push` — auto-merge por default (norma 2026-05-29)

Pasados los checks y creado el PR, habilitar auto-merge:

```bash
gh pr merge <PR> --squash --auto --delete-branch
```

No hace falta `--watch` bloqueante. Pero el cuidado de CI sigue vigente:

1. Si CI **falla**, el auto-merge NO procede y el PR queda **abierto** (no
   entregado). Confirmar el desenlace después con `gh pr view <PR> --json
state,mergedAt` o `gh pr checks <PR>` puntual (NO `--watch`). **No reportar
   entregado sin confirmar que mergeó o va verde en camino.**
2. Si falló: `gh run view --log-failed <run-id>`, identificar el step y el error,
   arreglar (commit chico si es trivial), re-push. El auto-merge mergea al verde.

**Excepción — UI/diseño visible (SIN `--auto`):** para cambios visuales donde
conviene ver el Vercel Preview, dejar el PR abierto y avisar a Beto con el link
para que revise y mergee. CC infiere este caso en trabajo de UI/pulido; backend,
migraciones, datos y docs van **siempre con auto-merge**. Beto puede override
cualquiera. En modo sin `--auto`: `gh pr checks <PR> --watch --interval 15` hasta
verde y avisar; no reportar entregado hasta verde.

### Excepciones aceptables

- **CI flaky** (timeouts de runners, deps lentas): `gh run rerun <run-id>` y
  vigilar. Documentar el flake si se repite.
- **PR de docs puros** (`docs/**`): los 4 checks igual deben pasar. Si tenés
  100% certeza de que un check no aplica, confirmá con el usuario antes de skipear.

### Si CI no llega (>5 min en `pending`; lo normal es ~1-2 min)

1. Verificar que el push llegó: `git log origin/<branch>..HEAD` vacío.
2. Verificar que el workflow se disparó: `gh run list --branch <branch> --limit 3`.
3. Si falló al setup, leerlo. Si nunca arrancó, alertar al usuario.

### Trabajando con múltiples PRs en paralelo

Dos archivos eran hotspots de conflicto entre sesiones; ambos ya están
**resueltos por tooling** (iniciativa `cross-session-coordination`). Quedan
estas convenciones de sesión — dependen de que toda sesión lea este `CLAUDE.md`
al arrancar (no hay candado global):

- **Regla 0 — `npm run db:new "<slug_snake_case>"`** para crear migraciones.
  **Nunca** copies/inventes un `YYYYMMDDHHMMSS` a mano: el generador elige un
  timestamp mayor que toda migración existente, local **y en los PRs abiertos de
  otras sesiones** (las ve vía `gh`). Residual: dos sesiones en el mismo segundo
  antes de abrir su PR → **abre tu PR pronto**.
- **Regla 1 — la tabla `## Activas` se regenera en `main`, NO en tu rama**
  (modelo `derivados-sin-drift` S2). Editá **solo el header** de tu planning doc
  (`Estado`/`Próximo hito`/`Última actualización`). **No corras `initiatives:gen`
  ni commitees la tabla de `INITIATIVES.md` en tu rama** — la regenera el workflow
  `initiatives-regen.yml` post-merge. El check de PR es **`initiatives:validate`**:
  valida los headers (slug == archivo; toda activa con `**Próximo hito:**` /
  `**Empresas:**` / `**Schemas afectados:**` / `**Última actualización:**`) **sin
  comparar la tabla** — por eso `INITIATIVES.md` ya no choca entre sesiones.
  Promover = crear el planning doc con header completo (la fila aparece al
  regenerar en main). **`## Done`** sí se edita a mano en tu PR al cerrar una
  iniciativa (es append-only, sección distinta de la tabla; rara vez choca). Si
  querés ver la tabla al día localmente, `npm run initiatives:gen` (no la
  commitees).
- **Regla 2 — rebase preventivo** antes de cada `git push` que toca
  `docs/strategy/*` o migraciones: `git fetch origin && git rebase origin/main`.
  Si conflictúa la tabla `## Activas` (auto-generada), **no la resuelvas a mano**:
  `git checkout --theirs docs/strategy/INITIATIVES.md` y volvé a correr
  `npm run initiatives:gen` (regenera desde todos los headers, incluido el tuyo).
  Para `## Done` o cualquier otro archivo, resolución manual + verificar con
  `format:check` + `typecheck`. Si el PR ya tiene revisores, usar `git merge
origin/main` en vez de rebase.
- **Convenciones**: branch = `claude/<slug>-…` (así `gh pr list` revela quién
  hace qué); **una iniciativa = una sesión** (corré `gh pr list` antes de
  arrancar); editá solo tu planning doc; **abre tu PR pronto** (es lo que hace
  visible tu trabajo a las otras sesiones y a `db:new`).

(Tooling en `scripts/lib/{migration-version,initiatives}.ts` + sus CLIs; CI valida
con `initiatives:check` en `.github/workflows/ci.yml`.)

---

## Reglas UI

### Drawers — scroll y anatomía (ADR-018, ADR-026)

`<DetailDrawer>` ([components/detail-page/detail-drawer.tsx](components/detail-page/detail-drawer.tsx))
es el wrapper canónico. 2 patrones válidos por separado (mezclarlos rompe el
scroll):

- **Idiomático (default)**: `<DetailDrawerContent>` como hijo directo — ya hace
  `<ScrollArea h-full>` internamente.
- **Custom**: `<ScrollArea className="flex-1 min-h-0">` raw (sin
  `<DetailDrawerContent>`) cuando necesitás padding/print stylesheet distinto.

Lo que **NO** funciona: un `<div>` con contenido directo sin scroll wrapper — el
body del drawer es `flex-1 min-h-0` con altura constreñida y el contenido se
corta. Si el contenido puede crecer, envolvé en uno de los dos patrones.

Test de regresión en `components/detail-page/detail-drawer.test.ts` (invariantes
DD7-DD11). Si CI rompe ahí, alguien quitó `flex flex-col` del body o `pr-14` del
header — restaurar antes de mergear.

---

## Reglas DB

- Consultar `supabase/SCHEMA_REF.md` para nombres exactos de tablas/columnas.
  Las columnas date/timestamp vienen en UTC → parsear con timezone.
- **Tras tocar `supabase/migrations/`**, regenerar los derivados **desde la
  shadow DB** (no contra prod) antes de commitear: `supabase start && npm run
db:regen` (regenera `SCHEMA_REF.md` + `types/supabase.ts` desde las migraciones;
  requiere Docker). CI lo valida con el workflow `schema-check.yml` (levanta la
  shadow, regenera y compara) — determinista por rama, sin depender de prod ni
  del secret `SUPABASE_DB_URL`, y que prod esté adelantado deja de romper PRs
  ajenos. Ver `supabase/GOVERNANCE.md` §3. (Modelo `derivados-sin-drift`: las
  migraciones son la fuente de verdad del schema; el `schema:check` viejo contra
  prod se retiró del job `quality`.)

### Aplicar migración por MCP → registrar de una vez (anti-drift del ledger)

> Norma 2026-06-17 (Beto): cortar de raíz el drift del historial de migraciones.

> **⚠️ MODELO CAMBIADO (`derivados-sin-drift` S3).** El flujo normal ya **no** es
> aplicar-por-MCP-y-reconciliar. Las migraciones se aplican a prod **al mergear**,
> automáticamente, vía `db-push-on-merge.yml` (`supabase db push`) — **nunca por
> MCP ni antes de mergear** (ver `supabase/GOVERNANCE.md` §4 + gate financiero D5:
> en financieras CC avisa a Beto en el chat con resumen+riesgos y, tras su **"dale"**,
> CC pone el label `finanzas-ok` y mergea — nunca sin ese OK). En operación
> normal **no toques el ledger**: `db push` lo registra con el timestamp del
> archivo. Lo de abajo aplica SOLO al **hotfix de emergencia por `psql` directo**
> (raro) — ahí sí reconciliá el ledger en la misma sesión.

`apply_migration` (MCP) / `execute_sql` / `psql` registran la migración en
`supabase_migrations.schema_migrations` con el **timestamp de aplicación**, NO
con el timestamp del nombre del archivo (`db:new`). El `name` sí se conserva.
Cada aplicación así deja un par divergente: el archivo queda **local-only** (sin
registrar) y la versión aplicada queda como **huérfano remoto**. Acumulado entre
sesiones, esto **rompe `supabase db push`** ("Remote migration versions not found"
/ re-aplica archivos) y puede tumbar el **Supabase Preview branch** de todos los
PRs.

**Regla:** cuando apliques a prod por fuera de `supabase db push`, **reconciliá
el ledger en la misma sesión**, apenas apliques:

1. Lee el timestamp huérfano que generó el MCP (matchea por `name`):
   `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;`
2. Reconciliá (solo toca la tabla de tracking, no el schema ni datos):
   ```bash
   supabase migration repair --db-url "$SUPABASE_DB_URL" --status applied <ts-archivo>
   supabase migration repair --db-url "$SUPABASE_DB_URL" --status reverted <ts-huérfano-MCP>
   ```
3. Verificá 1:1: `supabase migration list --db-url "$SUPABASE_DB_URL"` sin
   local-only ni remote-only.

**Diagnóstico de drift acumulado:** `migration list` muestra los pares (file-ts
en una columna, huérfano-ts en la otra); emparejá por **`name`** (el timestamp
difiere, el name no). **Antes** de registrar un `--status applied`, verificá que
el efecto del archivo YA esté en prod (tabla/columna/función/trigger/índice/dato
existe — SELECT de introspección). **Límite del CLI:** `migration repair` se
atraganta con muchas versiones en un solo comando → **lotes de ≤5**. Es cambio en
prod (tracking compartido) → **OK verbal de Beto**. Detalle operativo y casos
borde en la memoria `reference_bsop_merge_flow_multisesion`.

### Liberación de módulo nuevo (RBAC sync) — ADR-014

Al liberar un módulo (page nuevo bajo `app/<empresa>/` con URL en sidebar, o
habilitar un módulo existente para otra empresa), **5 lugares en el mismo PR**:

1. **`NAV_ITEMS`** ([components/app-shell/nav-config.ts](components/app-shell/nav-config.ts)) — entrada en la sección de ADR-014.
2. **`ROUTE_TO_MODULE`** ([lib/permissions.ts](lib/permissions.ts)) — URL → slug.
3. **`EXPECTED_DB_MODULE_SLUGS`** ([lib/permissions.test.ts](lib/permissions.test.ts)) — el slug (el test de sync falla si lo olvidás).
4. **`MODULE_DEPS`** ([lib/permissions-deps.ts](lib/permissions-deps.ts)) — el slug de toda página con `RequireAccess`, **aunque sea `[]`** (sin dependencias de navegación). El test `permissions-deps.test.ts` lo exige; **solo aparece al correr la suite completa** (`test:run`), no en `permissions.test.ts` — fácil de olvidar y romper CI (caso `arrendamiento` S1d, 2026-06-27).
5. **Migración SQL**: `INSERT INTO core.modulos (...)` con `ON CONFLICT
(empresa_id, slug) DO NOTHING` + **backfill defensivo de permisos** (por cada
   rol × módulo nuevo, `INSERT INTO core.permisos_rol …`) + `NOTIFY pgrst,
'reload schema'`. Sin el backfill, agregar el slug **esconde** el módulo a
   no-admins (`canAccessModulo` → false). Plantilla:
   `supabase/migrations/20260428230000_modulos_dilesa_inmobiliario.sql`. Tras
   aplicar, regenerar `SCHEMA_REF.md` + `types/supabase.ts`.

### Sub-slugs cuando el módulo tiene tabs — ADR-030

Módulo con sub-páginas (routed tabs ADR-005) → 1 sub-slug por tab desde el
inicio, naming `<padre>.<sub>` (ej. `rdb.inventario.stock`). El padre es umbrella
(visibilidad en sidebar); los sub-slugs gobiernan acceso al contenido. Delta vs
la regla anterior:

- **`NAV_ITEMS`**: solo entry del padre. **`ROUTE_TO_MODULE`**: entry por cada
  sub-page (la URL default `/<modulo>` → sub-slug del primer tab).
  **`HUB_PARENT_BY_ROUTE`** (`lib/permissions.ts`): entry URL-landing → slug del
  padre — la visibilidad en sidebar/paneles la decide `canSeeNavRoute` (padre O
  cualquier sub-slug accesible), no el sub-slug del primer tab (SS8; test de
  sync la valida). **`EXPECTED_DB_MODULE_SLUGS`**: padre + cada sub-slug.
  **Migración**: INSERT de cada sub-slug (heredando `seccion`/`empresa_id` del
  padre) + backfill clonando permisos del padre. Plantilla:
  `…20260509162620_modulos_subscope_permissions.sql`.
- **Código**: TABS del layout con campo `module: '<sub-slug>'` (`<RoutedModuleTabs>`
  filtra sin permiso) + `<HubAccessRedirect tabs={TABS}/>` en el mismo layout
  (si el landing no es accesible, aterriza en el primer tab que sí — SS8); cada
  sub-page con `<RequireAccess modulo="<sub-slug>">`;
  si usa `useSearchParams`/`useUrlFilters`, separar el cuerpo a `<XBody/>`
  wrappeado por `<RequireAccess>` (evita el error Next.js 16
  `missing-suspense-with-csr-bailout`). Plantillas: `app/rdb/productos/recetas/page.tsx`,
  `app/rdb/inventario/page.tsx`. Reglas SS1-SS8 en ADR-030.

---

## Mantenimiento del doc master de arquitectura

`docs/architecture/ARCHITECTURE.md` es el mapa-índice del stack (apunta a los
ADRs autoritativos por tema, no duplica su contenido). Regla blanda para que no
envejezca — estos micro-updates viajan piggyback en el PR que introduce el
cambio, sin PR dedicado:

- **ADR nuevo** → 1 línea al índice de §5 (sección Layout/Forms/Feedback/Cross-cutting/Data-DB).
- **Cambio de stack** (major de Next/React/Supabase, runtime/capa nueva) → refresh §1 (mapa mermaid) + §3.
- **Schema nuevo en Postgres** → agregar a §2 + su diagrama mermaid.
- **Iniciativa promovida que era topic open** → quitar de §8.
- **Anti-patrón nuevo o patrón renombrado** → actualizar §6 y/o §5.

Si en 2-3 meses se desincroniza pese a esto, escalar a un ADR "Architecture-as-Index".
