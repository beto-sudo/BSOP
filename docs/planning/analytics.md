# Iniciativa — Analytics (BI externo)

**Slug:** `analytics`
**Empresas:** todas (cross-empresa por diseño)
**Schemas afectados:** `analytics` (gold layer), lecturas desde `erp`, `dilesa`, `rdb`, `playtomic`, `core`
**Estado:** blocked
**Dueño:** Beto
**Creada:** 2026-04-25
**Última actualización:** 2026-04-26

## Problema

BSOP tiene 8 schemas con datos operativos y financieros vivos (cortes,
inventario, ventas, levantamientos, lotes DILESA, ocupación de canchas,
audit log, etc.). Hoy esos datos solo se ven desde la app o consultas
SQL ad-hoc. No hay:

- Dashboard cross-empresa de cortes diarios con alertas.
- Visión de cobranza/cartera con aging.
- Heatmap de ocupación de RDB / Playtomic.
- Detección de anomalías en `core.audit_log`.
- Suscripciones de email con KPIs diarios.

El costo de no hacerlo: Beto sigue ejecutando queries manuales y reaccionando
tarde a diferencias en cortes, problemas de cobranza o sub-utilización de
recursos.

## Outcome esperado

Una capa de BI externa (Metabase OSS) leyendo desde `analytics.*` (gold
layer) que entrega:

1. Dashboards visuales de cortes, DILESA pipeline y RDB ocupación.
2. Suscripciones diarias por email a `beto@anorte.com` con KPIs clave.
3. Alertas configurables (ej. corte con diferencia > $5k MXN).
4. Diccionario único de métricas en `analytics.metric_dictionary` para
   evitar que cada dashboard mida diferente.

## Alcance v1 (Sprint 0 — Bootstrap)

- [x] Schema `analytics` en Supabase con 3 vistas materializadas piloto
      (PR [#201](https://github.com/beto-sudo/BSOP/pull/201) mergeado 2026-04-25).
- [x] Rol read-only `analytics_reader` con password en 1Password
      (`Infrastructure/BSOP-Analytics-DB`).
- [x] Función `analytics.refresh_all()` y tabla `metric_dictionary`.
- [ ] Repo Cowork "Analytics" creado con scaffolding Sprint 0:
      Metabase OSS + Postgres interno + Caddy en Docker Compose. **BLOQUEADO**
      (ver § Bloqueos).
- [ ] Despliegue en VPS (Hetzner / DO / on-prem). Pendiente decisión de Beto.
- [ ] Dominio `bi.anorte.com` con TLS automático vía Caddy.

## Alcance v2 (futuro, post-Sprint 0)

- Dashboard "Cortes Diarios" cross-empresa con tarjetas KPI, tabla de
  diferencias, gráfica de líneas, heatmap día×hora, top cajeros.
- Alertas: diferencia > $5k MXN o gap_vouchers > $1k.
- Suscripción email diaria 7:30 AM CST.
- MVs adicionales: `mv_cobranza_aging`, `mv_inventario_diferencias`,
  `mv_audit_anomalias`, `mv_flotilla_tco`.

## Fuera de alcance v1

- Superset (alternativa más pesada — solo si Metabase se queda corto).
- DuckDB local con snapshots parquet (fase 2 si Beto lo siente útil para
  análisis ad-hoc desde laptop).
- Jobs ETL externos (Coda, bancos, Stellantis) con `dlt`/`prefect` —
  solo cuando se justifique.
- Dashboards de iniciativas que aún no tienen MV (cobranza, inventario
  diferencias, audit anomalías).

## Métricas de éxito

- v1 deployado y accesible en `bi.anorte.com` o equivalente.
- 3 MVs piloto refrescándose cada 30 min vía `pg_cron` o cron externo.
- Beto recibe el primer email de suscripción de cortes diarios.

## Riesgos / preguntas abiertas

- [ ] **Cowork no exporta el patch del Sprint 0 al filesystem.** Bloqueante.
      Ver § Bloqueos.
- [ ] **VPS no decidido.** Hetzner Cloud (~5€/mes), DO Droplet, o on-prem en
      Piedras Negras (servidor existente?). Decisión de Beto.
- [ ] **Backup del Postgres interno de Metabase.** Backblaze B2, S3, NAS local?
- [ ] **Multi-tenant futuro.** Hoy las MVs no respetan RLS porque solo Beto
      consume. Si en el futuro otros usuarios leen Metabase, hay que filtrar
      en la propia MV o por session var.
- [ ] **`pg_cron` vs cron externo.** Supabase soporta `pg_cron`; alternativa
      es un job en el VPS de Metabase. Decidir cuando se despliegue.

## Bloqueos

### Sprint 0 export desde Cowork (2026-04-25)

El agente Cowork del proyecto "Analytics" generó (o intentó generar) un
patch con 17 archivos nuevos + 2 modificados (`.gitignore`, `package.json`)
para el Sprint 0 (Metabase OSS + Postgres + Caddy en Docker). El patch
debía aterrizar en `.cowork-tmp-pr/analytics-bootstrap.patch` con
descripción en `.cowork-tmp-pr/pr-description.md`.

**El export nunca llegó al disco de BSOP.** En `.cowork-tmp-pr/` solo
existe `CC_PROMPT.md` (las instrucciones que Cowork dejó para Claude Code
ejecute), pero los artefactos referenciados no están.

Verificado en sesiones del 2026-04-25 y 2026-04-26:

- Filesystem: no existen los archivos referenciados en `/Users/Beto`,
  `/tmp`, `~/Library/Caches/claude-cli-nodejs`, ni en la partition de
  Cowork-artifact.
- Branch local `feat/analytics-bootstrap` apunta a `36a85ac` (squash
  merge del PR #201) — **0 commits adelante de origin/main**, 1 detrás.
  No tiene los 17 archivos del bootstrap aplicados.
- Worktree huérfano `/tmp/bsop-pr` registrado en git pero el directorio
  no existe en disco.

**Próxima acción para destrabar:** Beto vuelve a Cowork y le pide
explícitamente exportar el patch (`git format-patch origin/main..HEAD
--stdout > analytics-bootstrap.patch`) y `pr-description.md` al directorio
`.cowork-tmp-pr/`. Confirma con `ls -la` cuando termine. Luego me avisa y
yo lo aterrizo. Alternativa: que Cowork pushee directo a `origin` y abra
el PR él mismo si tiene credenciales.

## Sprints / hitos

### Sprint 0 — Bootstrap del repo Analytics (en bloqueado)

Owner: Cowork-Analytics + Claude Code (handoff)
Doc de specs: `docs/prompts/COWORK_BSOP_ANALYTICS.md` (en este repo)

Decisiones del bootstrap (registradas en ADR del repo Analytics, futuro):

- Metabase OSS sobre Superset (alertas built-in, suscripciones,
  configuración apuntar-y-clic).
- Supavisor session pooler (`:5432`) sobre transaction pooler (`:6543`)
  para conexiones de Metabase.
- Backups con `age` + Backblaze B2.
- TLS via Caddy automático.

### Sprint 1 — Primer dashboard (pendiente)

Owner: Claude Code
Pre-requisito: Sprint 0 desplegado y Metabase accesible.

- Conectar Metabase a Supabase (DB `analytics`).
- Construir dashboard "Cortes Diarios".
- Configurar suscripción email diaria.
- Configurar primera alerta.

## Decisiones registradas

- **2026-04-25 — Schema dedicado `analytics` en Supabase.** Aísla queries
  pesados de tablas vivas, permite GRANT limitado al rol read-only,
  diccionario de métricas en DB. (PR #201)
- **2026-04-25 — Rol `analytics_reader` con `CONNECTION LIMIT 5`.** Suficiente
  para Metabase + un par de conexiones ad-hoc; previene abuso.
- **2026-04-25 — MVs no respetan RLS.** Aceptable mientras solo Beto consuma.
  Para multi-tenant futuro: filtrar por `empresa_id` en la propia MV.
- **2026-04-25 — `analytics.metric_dictionary` como tabla en DB**, no como
  archivo markdown. Cualquier consumidor (Metabase, Superset, DuckDB) lee
  la misma definición.

## Bitácora

- **2026-04-25** — PR [#201](https://github.com/beto-sudo/BSOP/pull/201)
  mergeado. Schema `analytics`, 3 MVs piloto (`mv_corte_diario` 444 filas,
  `mv_dilesa_pipeline` 0 filas — esperado, `mv_playtomic_ocupacion` 1245
  filas), función `refresh_all()`, `metric_dictionary` con 4 KPIs seed.
  Rol `analytics_reader` creado y password en 1P.
- **2026-04-25** — Verificado: `analytics_reader` autentica vía Supavisor
  pooler `aws-1-us-east-1.pooler.supabase.com:5432` con user
  `analytics_reader.ybklderteyhuugzfmxbi`.
- **2026-04-25** — Cowork-Analytics generó (o intentó generar) Sprint 0;
  export al disco no llegó. Bloqueada hasta destrabar.
- **2026-04-26** — Diagnóstico confirmado en segunda sesión: archivos siguen
  sin existir. Documentado el bloqueo y próxima acción.
