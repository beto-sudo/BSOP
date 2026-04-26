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
   pregúntale si es una iniciativa nueva (entonces se crea un doc de
   planning vía Cowork) o un task suelto (no requiere doc nuevo).

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

### División de roles (Cowork vs Claude Code)

- **Cowork escribe el QUÉ y el POR QUÉ**: Problema, Outcome esperado,
  Alcance v1, Fuera de alcance, Métricas de éxito, Riesgos. Edita header
  y secciones de planning.
- **Claude Code (yo) escribe el CÓMO y el CUÁNDO**: Bitácora, Decisiones
  registradas, Sprints/hitos al ejecutar, ADRs durante ejecución, código.
- **Beto decide y mergea**: aprueba transiciones de estado (proposed →
  planned → in_progress → done), mergea PRs.

Si en una sesión el usuario me pide redefinir alcance o crear una
iniciativa nueva, propóngale que lo haga vía Cowork para mantener la
división. Excepción: si Cowork no está disponible y el cambio es chico,
puedo hacerlo yo y dejar registro claro en la bitácora.

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

Mecanismo común de drift: alguien (Cowork u otro agente) crea un
archivo formateado correctamente en su sub-set, su PR pasa porque no
corrió `prettier --check .` global, y el archivo se mergea malformatado.
La regla de "todo el repo, no solo lo tocado" detecta eso.

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

---

## Reglas DB

- Always refer to `supabase/SCHEMA_REF.md` for exact table and column names to prevent mapping errors. Date/timestamp columns are returned in UTC, so parse them with a proper timezone.
- **After applying ANY DB migration** (via Supabase MCP, `psql`, dashboard, or SQL file in `supabase/migrations/`), regenerate the schema reference before committing: `npm run schema:ref`. The pre-commit hook and CI both enforce this when `SUPABASE_DB_URL` is set. Drift between `SCHEMA_REF.md` and the live DB leads to confusion in future sessions that read the MD instead of the live schema.
