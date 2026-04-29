## Memoria de proyecto — protocolo

> Este repo guarda su propia memoria estratégica para que no necesite vivir
> en mi cabeza. Cualquier sesión nueva empieza leyendo estos docs.

### Al inicio de toda sesión

1. Lee `docs/strategy/INITIATIVES.md` para ver qué iniciativas están activas,
   en qué estado, y cuál es el próximo hito de cada una.
2. Si la sesión va a tocar una iniciativa específica, lee
   `docs/planning/<slug>.md` antes de empezar a actuar — ahí vive el
   contexto, alcance, decisiones y bitácora.
3. Si lo que el usuario pide no encaja con ninguna iniciativa existente,
   estresá la idea con preguntas (¿qué problema resuelve?, ¿qué
   pantallas/schemas toca?, ¿métrica de éxito?, ¿riesgos?, ¿hay ADR
   pendiente?) y proponé promoverla a iniciativa. Solo creá el doc de
   planning + la fila en `INITIATIVES.md` cuando Beto diga
   explícitamente _"sí, promovela"_. Si es un task suelto, no requiere
   doc nuevo.

### Al cerrar trabajo en una iniciativa

Antes de la respuesta final que entrega el cambio, **actualiza el doc
de planning correspondiente**:

- **`## Bitácora`** (append-only): qué se hizo en esta sesión, links a
  PR/commit, fecha.
- **`## Decisiones registradas`** (append-only): cualquier decisión
  táctica nueva, con fecha y razón.
- **Header**: `Estado` y `Última actualización`.

Reflejá el cambio de estado en `docs/strategy/INITIATIVES.md` también
(columna `Estado`, `Próximo hito`, `Última actualización`). Si la
iniciativa quedó completa, movela a la sección `## Done` con fecha de
cierre y outcome — no borres su doc de planning, queda como referencia.

**Barrido de Reminders al cerrar (`* → done`):** antes de cerrar la
iniciativa, listá los pendientes vivos en la lista `Claude: BSOP` con
`remindctl list "Claude: BSOP" --json` y completá los que sean
sub-tareas de la iniciativa que cierra (referencias a sus PRs, su
slug, sub-PRs, sprints, smoke tests, closeouts). Las sub-tareas
históricas mueren con la iniciativa — no quedan vivas para confundir
sesiones futuras. Ver regla global "Pendientes y calendario" en
`~/.claude/CLAUDE.md` para el filtro de qué SÍ va a Reminders desde el
inicio.

### Roles

- **Claude Code (yo)** soy dueño de planeación + ejecución end-to-end:
  Problema, Outcome, Alcance, Riesgos, Métricas, Bitácora, Decisiones
  registradas, Sprints/hitos, ADRs, código, PRs.
- **Beto decide y mergea**: aprueba promoción de ideas a iniciativas,
  transiciones de estado (`proposed → planned → in_progress → done`),
  mergea PRs.

Cuando Beto suelta una idea cruda, mi trabajo es estresarla con
preguntas (¿qué problema resuelve?, ¿qué pantallas/schemas toca?,
¿métrica de éxito?, ¿riesgos?, ¿hay ADR pendiente?) antes de
proponerle promoverla a iniciativa. Solo creo el doc de planning +
agrego la fila a `INITIATIVES.md` cuando Beto diga explícitamente
_"sí, promovela"_. Ver ADR-012 para el contexto histórico de esta
decisión (deprecación del split Cowork/CC).

### Cuándo crear un ADR

Crea `docs/adr/NNNN_<titulo>.md` (o `supabase/adr/NNNN_<titulo>.md` si
es DB-puro) cuando la decisión:

- Cruza más de una iniciativa o vive más allá de ella (ej. convención de
  layout, política de RLS, formato de migración).
- Tiene tradeoffs no obvios que un futuro lector se va a preguntar
  _"¿por qué?"_.

Si la decisión es 100% interna a una sola iniciativa, vive en
`## Decisiones registradas` del doc de planning.

### Reglas de oro

- **No improvisar plan**: si vas a actuar sobre una iniciativa y el doc
  de planning está stale o vacío, primero alineáte con el usuario.
- **No multiplicar docs**: una iniciativa = un doc en `docs/planning/`.
  No fragmentes salvo que el doc supere ~500 líneas.
- **No crear iniciativas por mí mismo**: solo el usuario decide qué se
  promueve a iniciativa. Yo puedo proponer, no decidir.
- **Convención de slug**: `kebab-case`. Single-empresa lleva prefijo
  (`dilesa-`, `rdb-`, `ansa-`, `coagan-`). Cross-empresa o convención
  general: sin prefijo.

---

## CI / PRs — protocolo de validación

> Un PR no está "listo" hasta que CI pase verde. Reportar el PR como
> entregado **antes** de que pase CI ha causado pérdida de tiempo
> (ejemplo: PR #206, fail por `prettier --check` heredado de un archivo
> que el PR no tocaba). Esta regla cierra ese hueco.

### Antes de `git push` (validación local que coincide con CI)

Correr **los 4 checks que corre CI**, en este orden, **sobre todo el repo
no solo los archivos tocados**:

```bash
npm run typecheck       # tsc --noEmit
npm run test:run        # vitest run
npm run lint            # eslint .
npm run format:check    # prettier --check . (¡todo el repo!)
```

Si `format:check` reporta archivos que no toqué, igual los formateo en
este PR — su mal estado bloquea CI tanto si lo causé yo como si lo
heredé. Mejor un commit chico de "chore(format)" que un CI rojo.

Mecanismo común de drift: una herramienta externa (formateador de IDE,
otro agente, generador de código) escribe un archivo formateado
correctamente en su sub-set, el PR pasa porque no corrió
`prettier --check .` global, y el archivo se mergea malformatado. La
regla de "todo el repo, no solo lo tocado" detecta eso.

### Después de `git push` (vigilancia obligatoria)

**Inmediatamente** después del push del PR, correr:

```bash
gh pr checks <PR-number> --watch --interval 15
```

Bloquea hasta que termine. Si hay fallo:

1. Leer el log del job que falló: `gh run view --log-failed <run-id>`.
2. Identificar el step exacto y el error real (no solo el último log).
3. Arreglar localmente. Si el fix es trivial (formato, lint warning),
   commit chico en el mismo PR. Si es estructural, considerar si
   amerita revisar el alcance con el usuario.
4. Re-push y volver a vigilar.
5. **NO reportar el PR al usuario hasta que esté verde** — o, si el
   fallo no es trivial, reportar explícitamente con el error y proponer
   plan antes de continuar.

### Excepciones aceptables

- **CI flaky** (timeouts esporádicos en runners, deps externas lentas):
  re-trigger con `gh run rerun <run-id>` y vigilar de nuevo. Documentar
  el flake si se repite (issue para investigar).
- **PR de docs puros** que no afectan al app (`docs/**` exclusivamente):
  los 4 checks igual deben pasar — no hay shortcut. Pero si tienes 100%
  certeza de que un check no aplica (ej. un PR que solo agrega un
  archivo `.gitignore`), confirmá con el usuario antes de skipear.

### Si CI no llega (tarda más de lo razonable)

CI normal tarda ~1-2 min en este repo. Si después de 5 min sigue
`pending`:

1. Verificar que el push llegó: `git log origin/<branch>..HEAD` debe
   estar vacío.
2. Verificar que el workflow se disparó: `gh run list --branch <branch>
--limit 3`.
3. Si el workflow falló al setup, leerlo. Si nunca arrancó, alertar al
   usuario antes de seguir esperando.

### Trabajando con múltiples PRs en paralelo

Cuando hay 2+ PRs abiertos al mismo tiempo, los archivos compartidos
(`docs/strategy/INITIATIVES.md`, y `docs/strategy/ROADMAP.md` cuando
exista) son hotspots de conflicto: ambos PRs editan la misma tabla, el
primero que mergea le gana la línea al segundo, y el segundo termina
con `This branch has conflicts that must be resolved`.

Dos reglas para mantener la fricción baja sin infraestructura nueva:

#### Regla 1: minimizar ediciones a `INITIATIVES.md`

Toco `docs/strategy/INITIATIVES.md` solo en **transiciones de estado
mayores** de la iniciativa:

- `proposed → planned` (alcance v1 cerrado).
- `planned → in_progress` (primer PR de ejecución abierto).
- `in_progress → done` (última fase mergeada — la fila se mueve a la
  sección `## Done`).
- `* → blocked` o `blocked → *`.

**NO toco `INITIATIVES.md` en cada commit/PR intermedio del mismo
estado.** Si una iniciativa está `in_progress` y cierro un hito menor,
solo actualizo `docs/planning/<slug>.md` (que casi nunca conflicta —
un archivo por iniciativa). El próximo hito y la última actividad se
infieren del header del planning doc.

Resultado: ~70% menos ediciones al archivo hotspot. Toco
`INITIATIVES.md` solo cuando promuevo una iniciativa nueva o cuando
cruza una transición mayor de estado. Los hitos intermedios viven solo
en el planning doc.

#### Regla 2: rebase preventivo sobre `origin/main`

**Antes de cada `git push`** que toca `docs/strategy/*` o cualquier
archivo que sé que es hotspot, correr:

```bash
git fetch origin
git rebase origin/main
```

Si hay conflicto, resolverlo en local antes de pushear:

- **Para `INITIATIVES.md`** (datos de estado): tomar la versión de
  `origin/main` (`git checkout --theirs docs/strategy/INITIATIVES.md`)
  como verdad por orden de merge, luego reaplicar mi edición encima
  si todavía aplica. Si mi edición ya quedó obsoleta (ej. otro PR ya
  movió la fila a `done`), la descarto.
- **Para cualquier otro archivo**: resolver manualmente y verificar
  con `npm run format:check` + `npm run typecheck` antes de seguir.

Si el PR ya tiene revisores con comentarios, usar `git merge
origin/main` (más feo pero no rompe referencias) en lugar de rebase.

Si el conflicto aparece en GitHub porque no rebaseé antes, el flujo
es el mismo:

```bash
git fetch origin
git checkout <my-branch>
git merge origin/main                  # o rebase si seguro
# resolver conflictos
git checkout --theirs <hotspot-file>   # o resolución manual
npm run format:check && npm run typecheck && npm run test:run && npm run lint
git add . && git -c core.editor=true merge --continue
git push
gh pr checks <PR> --watch --interval 15
```

#### Cuándo escalar a auto-generación

Si después de ~2 semanas con Reglas 1+2 seguimos teniendo conflicts en
`INITIATIVES.md` con frecuencia, escalar a una alternativa:

1. Cada `docs/planning/<slug>.md` ya tiene un header parseable.
2. Crear `npm run initiatives:gen` que lea todos los headers y
   regenere `INITIATIVES.md` automáticamente.
3. CI valida con `npm run initiatives:check` que el archivo está en
   sync.
4. Resultado: cero edits manuales a `INITIATIVES.md`. Conflicts solo
   posibles si dos PRs tocan el mismo planning doc — extremadamente
   raro.

Hasta entonces, Reglas 1+2 deberían ser suficientes.

---

## Reglas DB

- Always refer to `supabase/SCHEMA_REF.md` for exact table and column names to prevent mapping errors. Date/timestamp columns are returned in UTC, so parse them with a proper timezone.
- **After applying ANY DB migration** (via Supabase MCP, `psql`, dashboard, or SQL file in `supabase/migrations/`), regenerate the schema reference before committing: `npm run schema:ref`. The pre-commit hook and CI both enforce this when `SUPABASE_DB_URL` is set. Drift between `SCHEMA_REF.md` and the live DB leads to confusion in future sessions that read the MD instead of the live schema.

### Liberación de módulo nuevo (RBAC sync)

Cuando se libera un módulo nuevo (sea un page nuevo bajo `app/<empresa>/`
con su URL en el sidebar, o se habilita un módulo existente para una
empresa más), hay 4 lugares que deben actualizarse en el mismo PR:

1. **Sidebar** — agregar la entrada en `NAV_ITEMS`
   ([components/app-shell/nav-config.ts](components/app-shell/nav-config.ts))
   bajo la sección que corresponda según ADR-014.
2. **`ROUTE_TO_MODULE`** — agregar la URL → slug en
   [lib/permissions.ts](lib/permissions.ts).
3. **`EXPECTED_DB_MODULE_SLUGS`** en
   [lib/permissions.test.ts](lib/permissions.test.ts) — agregar el slug
   a la lista canónica. El test de sync falla si lo olvidas.
4. **Migración SQL** en `supabase/migrations/` con:
   - `INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)`
     usando `ON CONFLICT (empresa_id, slug) DO NOTHING` para idempotencia.
   - **Backfill defensivo de permisos**: por cada rol existente en la
     empresa × cada módulo nuevo, `INSERT INTO core.permisos_rol
(rol_id, modulo_id, acceso_lectura, acceso_escritura)` con valores que
     preserven el comportamiento esperado para usuarios actuales.
     Sin esto, agregar el slug **esconde** el módulo a no-admin users
     (porque `canAccessModulo` retorna `false` cuando el slug no está en
     `permissions.modulos`). Plantilla en
     [supabase/migrations/20260428230000_modulos_dilesa_inmobiliario.sql](supabase/migrations/20260428230000_modulos_dilesa_inmobiliario.sql).
   - `NOTIFY pgrst, 'reload schema';` al final.

Tras aplicar la migración con psql, regenerar
`supabase/SCHEMA_REF.md` y `types/supabase.ts`.

Ver iniciativa `modulos-catalog` (cerrada 2026-04-28) para el contexto
y ADR-014 para la taxonomía de secciones.
