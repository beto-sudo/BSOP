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

## Reglas DB

- Always refer to `supabase/SCHEMA_REF.md` for exact table and column names to prevent mapping errors. Date/timestamp columns are returned in UTC, so parse them with a proper timezone.
- **After applying ANY DB migration** (via Supabase MCP, `psql`, dashboard, or SQL file in `supabase/migrations/`), regenerate the schema reference before committing: `npm run schema:ref`. The pre-commit hook and CI both enforce this when `SUPABASE_DB_URL` is set. Drift between `SCHEMA_REF.md` and the live DB leads to confusion in future sessions that read the MD instead of the live schema.
