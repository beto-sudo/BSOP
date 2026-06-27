# Iniciativa — Derivados sin drift entre sesiones (migraciones = fuente de verdad)

**Slug:** `derivados-sin-drift`
**Empresas:** todas (infraestructura del repo / proceso de DB)
**Schemas afectados:** ninguno de aplicación. Toca el **proceso** de migraciones y el tooling/CI: `package.json`, `scripts/gen-schema-ref.ts`, `scripts/gen-initiatives.ts`, `.github/workflows/{ci,db-types,drift-check}.yml` (+ workflows nuevos), `supabase/GOVERNANCE.md`, `CLAUDE.md`, `docs/strategy/INITIATIVES.md`, `supabase/SCHEMA_REF.md`, `types/supabase.ts`.
**Estado:** in_progress
**Próximo hito:** S0/S0.5/S1/S2 en main (#1093, #1095, #1096). **Beto revisa y mergea el Sprint 3 ([#1097](https://github.com/beto-sudo/BSOP/pull/1097), sin auto-merge)**: el clasificador financiero + el cambio de hábito (migraciones se aplican al merge). Tras mergear, config de Beto (admin): crear label `finanzas-ok` + agregar `Gate de migraciones financieras` a required en branch protection (como se hizo con `schema-check` del S1). Con eso → iniciativa **done**.
**Dueño:** Beto
**Creada:** 2026-06-26
**Última actualización:** 2026-06-27 (S1 + S2 mergeados a main; S3 en PR #1097 para revisión de Beto; OrbStack local reparado)

## Problema

Con varias sesiones de Claude en paralelo, dos archivos **derivados** que se
commitean en cada rama chocan a diario y nos cuestan horas:

1. **`supabase/SCHEMA_REF.md`** — su check (`schema:check`) regenera el MD
   **contra PROD** y compara. Como prod es estado compartido y móvil, en cuanto
   una sesión aplica su migración a prod **antes de mergear** (norma actual), prod
   queda adelantado a `main` y **cualquier PR falla, aunque no toque la DB**. Se
   suma el flake de conectividad `:5432` y el `schema:ref` que se cuelga durante
   rebuilds del Preview Branch.
2. **`docs/strategy/INITIATIVES.md`** (tabla `## Activas`) — se auto-genera de los
   headers de los planning docs (eso ya no choca), pero el **output** sigue
   commiteándose en cada rama. Dos sesiones regeneran la tabla completa → conflicto
   de merge en celdas-párrafo de 500+ caracteres, doloroso de resolver.

La iniciativa `cross-session-coordination` (jun-7) resolvió el _input_ (1 planning
doc por iniciativa; `db:new` para timestamps). Pero dejó los _outputs_ derivados
dentro del control de cada PR — y un derivado versionado **siempre** choca entre
ramas paralelas.

**La raíz, más profunda que el síntoma:** el `SCHEMA_REF` rojo es síntoma de que
**prod se adelanta a `main`**, porque las migraciones se aplican a prod antes de
mergear, **a veces vía MCP `apply_migration`/`psql`** — lo que registra la entry en
`supabase_migrations.schema_migrations` con el timestamp de aplicación (≠ el del
filename), desincroniza el ledger y **rompe `supabase db push` para todas las
sesiones** ("Remote migration versions not found"). `GOVERNANCE.md` §4 ya prescribe
"db push, no MCP", pero la práctica real lo contradice y la memoria
`reference_bsop_merge_flow_multisesion` es la crónica de curas repetidas a mano.

## Outcome esperado

1. **El schema lo dictan las migraciones, no prod.** `SCHEMA_REF.md` y
   `types/supabase.ts` se generan aplicando `supabase/migrations/*` a una DB
   efímera (shadow DB stack-Supabase). El check pasa a validar "tus migraciones
   producen este derivado" — **determinista por rama, sin prod, sin secret, sin
   flake**. Que prod esté adelantado deja de importar para el check.
2. **Prod nunca se adelanta a `main`.** Las migraciones se aplican a prod **solo
   post-merge** vía GH Action `supabase db push` (nunca MCP) → el ledger no deriva,
   `db push` no se rompe, y se retira el baile de `migration repair` manual.
3. **Los derivados dejan de mantenerse en las ramas.** La tabla `## Activas` se
   regenera en `main` post-merge (PR automático, patrón `db-types.yml`); el check de
   PR valida solo los _headers_. Cero conflictos de merge en `INITIATIVES.md`.

Meta realista: los choques de `SCHEMA_REF`/`INITIATIVES` pasan de **diarios** a
**inexistentes**; el drift del ledger, de **recurrente** a **estructuralmente
imposible** mientras se respete el apply-post-merge.

## Decisiones registradas

> D1–D4, D6 cerradas con Beto en la sesión de promoción (2026-06-26). D5 abierta.

- **D1 — `SCHEMA_REF` (y `types`) se derivan de las migraciones de la rama, no de
  prod.** Una shadow DB construida desde `supabase/migrations/*` es la fuente. El
  Preview Branch ya prueba que las 474 migraciones reconstruyen el schema desde cero
  (`GOVERNANCE.md` §1/§3 lo mantienen como invariante).
- **D2 — La shadow DB es stack Supabase** (`supabase db start` + `db reset
--no-seed` en CI), **no Postgres vanilla**: 189 archivos referencian roles de
  plataforma (`anon`/`authenticated`/`authenticator`/`service_role`) y 45 tocan
  `auth.*`, y ningún archivo los crea. `GOVERNANCE.md` §3 ya recomienda `db reset`
  local para validar.
- **D3 — `SCHEMA_REF.md` y `types/supabase.ts` migran juntos en v1.** La misma
  shadow DB genera ambos (`gen types --local`); coherencia total de fuente.
- **D4 — INITIATIVES sale del camino del PR.** `initiatives:check` valida _headers_
  (slugs únicos, estado válido, "Próximo hito" presente), no el diff de la tabla.
  La tabla se regenera en `main` post-merge vía PR automático con auto-merge
  (precedente: `db-types.yml`). Las ramas dejan de tocar la tabla.
- **D5 — Raíz de proceso: aplicar a prod solo post-merge vía `db push`
  (nunca MCP); el merge ES el gate.** Las migraciones se aplican **únicamente al
  mergear** (GH Action `push:main` → `supabase db push`). Diferenciado por tipo, sin
  click extra por migración: **no-financieras → auto-merge** (como hoy) → se aplican
  solas, cero intervención de Beto; **financieras → sin auto-merge**, Beto las mergea
  a mano (el mismo gesto que ya hace con los PRs de UI) y ese merge es la confirmación
  explícita + auditable. Un **guard de CI** clasifica la migración (GRANT/REVOKE,
  tablas financieras de `erp`, RPCs SECURITY DEFINER de dinero, gates de fase/PLD) y
  **bloquea el auto-merge** si toca superficie financiera — así no depende solo del
  criterio de CC. Reemplaza la propuesta previa del GitHub Environment (añadía un
  click por merge, justo lo que Beto quiere evitar). Encaja con la regla "finanzas no
  van autónomas" ([[feedback_autonomous_prod_migrations]]) sin reintroducir fricción.
  **Cerrada con Beto (2026-06-26).**
- **D6 — El nuevo `schema-check` corre con paths-filter `supabase/migrations/**`**
(gratis para PRs de UI), como `drift-check.yml`. No carga el job `quality` de cada
  PR con el boot de Docker.

## Riesgos

- **R1 — `supabase db reset` no reproduce prod por drift de _contenido_** (no solo
  de version): algo aplicado a prod que ningún archivo produce. Síntoma: diff entre
  el `SCHEMA_REF` shadow y el de prod. Mitigación: **Sprint 0 lo verifica y
  reconcilia antes de automatizar nada**. El Preview Branch ya prueba que aplican
  _sin error_; falta probar _igualdad de schema_ contra prod.
- **R2 — `db push` post-merge falla** (out-of-order, error que el preview no
  atrapó) → PR mergeado pero prod sin la migración (`main` adelantado a prod, el
  problema inverso). Mitigación: el Environment-gated apply alerta y permite re-run;
  el Preview Branch validó el SQL antes del merge; serializar migraciones sigue
  siendo la red.
- **R3 — Costo de CI**: boot de Docker + aplicar 474 migraciones en cada PR de DB.
  Mitigación: paths-filter (solo PRs de DB), cache de imagen, medir. Si crece,
  baseline-squash periódico de migraciones viejas (proyecto aparte).
- **R4 — El gate por Environment añade un click manual de Beto por merge de DB.**
  Aceptado como costo del control financiero.
- **R5 — Outliers de naming/legacy** (`20260325_waitry_inbound_processing` + 14
  no-op stubs whitelisted) podrían confundir a `db reset`/los generadores. Verificar
  en S0; ya son stubs idempotentes.

## Métricas de éxito

- Cero `schema:check` rojo en PRs que no tocan `supabase/migrations/**`.
- Cero conflictos de merge en `INITIATIVES.md` y `SCHEMA_REF.md`.
- Cero "Remote migration versions not found" / `migration repair` manual tras
  adoptar apply-post-merge.
- **Gate de S0:** `supabase db reset --no-seed` + `schema:ref` contra la shadow DB
  reproduce el `SCHEMA_REF.md` de prod byte-a-byte (ignorando la línea
  `Last regenerated`).

## Sprints / hitos

- **Sprint 0 — De-risking (bloquea todo lo demás).** Reconciliar el ledger actual a
  1:1 (curar huérfanas MCP vigentes). Correr `supabase db reset --no-seed` local/CI,
  generar `SCHEMA_REF` desde la shadow DB y diff contra el de prod; resolver
  cualquier drift de contenido (R1). **Entregable: prueba de que migraciones == prod.**
- **Sprint 1 — `SCHEMA_REF` + `types` desde la shadow DB.** `gen-schema-ref` y
  `db:types` apuntan a la shadow DB; nuevo job CI `schema-check` (`supabase db start`
  - paths-filter D6); retirar `schema:check` del job `quality`. `npm run schema:ref`
    local levanta la shadow DB (documentar en `GOVERNANCE.md` §3).
- **Sprint 2 — INITIATIVES fuera del PR.** `initiatives:check` valida headers;
  workflow `push:main` regenera la tabla y abre PR auto-merge; reescribir Regla 1 de
  `CLAUDE.md`.
- **Sprint 3 — db push al merge (raíz de proceso, D5).** GH Action post-merge corre
  `supabase db push` gated por Environment (reviewer=Beto). Reescribir `GOVERNANCE.md`
  §4 (de "db push local antes de mergear" a "db push automático al merge, nunca MCP")
  - `CLAUDE.md` + memorias; retirar el flujo MCP+repair de la doc operativa.
- **Sprint 4 — Closeout.** ADR ("Migraciones = fuente de verdad; derivados y prod se
  sincronizan desde ahí, no al revés") — cruza varias iniciativas y cambia política
  de proceso de DB, amerita ADR. Barrido de Reminders + cierre.

## Bitácora

- **2026-06-26** — Iniciativa promovida a `proposed`. Diagnóstico: ambos archivos
  son derivados commiteados que chocan entre ramas; el `SCHEMA_REF` rojo es síntoma
  de que prod se adelanta a `main` (apply pre-merge, a veces por MCP → ledger
  divergente). Investigación confirmó: las 474 migraciones reconstruyen desde cero
  (Preview Branch + `GOVERNANCE.md` §1/§3); la shadow DB debe ser stack Supabase
  (189 archivos asumen roles de plataforma); `db-types.yml` ya es precedente del
  patrón "regen fuera del PR". Alcance v1 cerrado con Beto: **check + raíz de
  proceso**, **SCHEMA_REF + types juntos**. Pendiente para pasar a `planned`: OK de
  Beto al gate financiero D5 + Sprint 0 de de-risking.
- **2026-06-26** — **D5 cerrada** (Beto OK a merge-as-gate). **Sprint 0 arrancado.**
  Diagnóstico del ledger de prod (MCP, read-only): `disk_only = 0` (las 473
  migraciones de 14-díg de disco están todas registradas en prod) y `db_only = 2`,
  ninguna problema — `20260325 waitry_inbound_processing` (falso positivo: stub
  legacy alineado, GOVERNANCE §5) y `20260626222108 dilesa_obra_estimacion_cxp_espera`
  (migración foránea de la sesión hermana `dilesa-obra-estimaciones-cxp`, aplicada a
  prod sin mergear — no se toca). **El ledger ya está 1:1**; la mitad de
  reconciliación del S0 es no-op (las curas anti-drift previas lo dejaron sano).
  Resta el gate real: montado `schema-shadow-derisk.yml` (workflow throwaway) que
  levanta una shadow DB con `supabase start`, genera el SCHEMA_REF desde migraciones
  y desde prod, y los diffea — confirma R1 (que las migraciones reproducen prod).
- **2026-06-27** — **Sprint 0 + 0.5 CERRADOS** (#1093). El de-risk confirmó que las
  migraciones reconstruyen el schema sin error, pero destapó drift de contenido
  preexistente prod↔migraciones. Sprint 0.5 lo reconcilió con 4 migraciones
  (aplicadas a prod + ledger 1:1 + backup en `_predrop_backup`): FK `junta_activa`
  reproducible, +2 FKs `usuario_id→core.usuarios`, −9 objetos legacy rdb de abril,
  −columna `core.empresas.tipo` fantasma. Raíz hallada: anti-patrón `ADD COLUMN IF
NOT EXISTS ... REFERENCES/DEFAULT` (no reproducible). `SCHEMA_REF`/`types`
  regenerados (diff exacto). Se serializaron las 3 sesiones paralelas (Beto cortó el
  paralelismo): mi reconciliación aterrizó primero (#1093) y desbloqueó a #1091/#1092,
  que siguieron una por una.
- **2026-06-27** — **Sprint 1 construido** (este PR): modelo nuevo. `schema-check.yml`
  valida `SCHEMA_REF` contra una shadow DB (`supabase start` + regen + diff), solo en
  PRs que tocan DB (required-safe: skip rápido si no). Retirado el `schema:check`
  viejo (contra prod) del job `quality` de `ci.yml`. `db:types` + `db-types.yml`
  pasan a `--local` (shadow). Nuevos scripts `db:shadow`/`db:regen`. Docs:
  `GOVERNANCE.md` §3 + `CLAUDE.md` Reglas DB reescritos al flujo shadow. El
  `schema-check` de este PR verifica de paso shadow == prod tras la serialización de
  las 3. Pendiente para cerrar la iniciativa: Sprint 2 (INITIATIVES fuera del PR),
  Sprint 3 (db push al merge con gate D5), y agregar `schema-check` a required en
  branch protection.
- **2026-06-27** — **S1 mergeado** (#1095) + `schema-check` agregado a required en
  branch protection (vía API, OK de Beto). El `schema-check` shadow del PR confirmó
  shadow == prod (solo difería en comentarios; el `SCHEMA_REF`/`types` commiteado se
  regeneró desde la shadow para reflejar las migraciones, no prod).
- **2026-06-27** — **S2 mergeado** (#1096): `initiatives:validate` (valida headers)
  reemplaza a `initiatives:check` en el job `quality`; la tabla `## Activas` se
  regenera en `main` post-merge (`initiatives-regen.yml`); las ramas dejan de
  tocarla → fin de los conflictos de merge en INITIATIVES. `CLAUDE.md` Regla 1
  reescrita. (initiatives-regen requiere que Beto agregue `github-actions[bot]` a la
  bypass list de branch protection para el commit directo; mientras, deja warning.)
- **2026-06-27** — **S3 construido, en PR #1097 (SIN auto-merge — espera revisión de
  Beto, toca aplicación a prod + control financiero).** `db-push-on-merge.yml` aplica
  las migraciones a prod **al mergear** (`supabase db push`, nunca antes/MCP) → prod
  no se adelanta a `main`, ledger no deriva. Gate D5: `financial-migration-guard` +
  `classify-financial-migration.ts` bloquean el auto-merge de migraciones financieras
  (clasificador heurístico amplio, probado) → las mergea Dirección con label
  `finanzas-ok`. `GOVERNANCE.md` §4 + `CLAUDE.md` reescritos. Trabajo autónomo nocturno
  (Beto durmiendo): S2 auto-mergeado por bajo riesgo; S3 dejado en PR por tocar
  finanzas/prod.
- **2026-06-27** — **OrbStack reparado** (fuera de la iniciativa, pero lo destapó el
  S1): el `supabase start` del S1 dejó el overlayfs de containerd corrupto (snapshot
  240 huérfano) tras un timeout de VM. `docker system prune -af` (solo borró imágenes
  de Supabase re-descargables; 0 datos) lo limpió. `supabase start` + `npm run db:regen`
  verificados local: reproducen el `SCHEMA_REF`/`types` exactos (242 tablas). Flujo
  local del modelo nuevo funcionando en la máquina de Beto.
