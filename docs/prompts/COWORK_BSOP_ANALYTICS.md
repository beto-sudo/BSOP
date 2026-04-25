# Prompt de bootstrap — Proyecto Cowork **BSOP-Analytics**

> Pegar este texto íntegro como primer mensaje del proyecto Cowork
> nuevo. Está autocontenido — el agente no tiene contexto previo de
> BSOP. Ajustar las rutas/credenciales marcadas con `<…>` antes de pegar
> si ya las tienes a mano; si no, el agente preguntará.

---

## Quién soy y qué quiero construir

Soy **Adalberto "Beto" Santos**, operador de varias empresas (ANSA, DILESA, COAGAN, RDB). Tengo un repo principal llamado **BSOP** (Next.js 16 + Tailwind v4 + Supabase) que es el hub operativo. Dentro de Supabase ya hay 8 schemas con datos vivos (`core`, `erp`, `dilesa`, `rdb`, `playtomic`, `health`, `maquinaria`, `public`) y acabo de crear un schema dedicado `analytics` con un rol read-only `analytics_reader` y 3 vistas materializadas piloto (`mv_corte_diario`, `mv_dilesa_pipeline`, `mv_playtomic_ocupacion`).

**Este repo nuevo es el hogar de toda la stack analítica externa al BSOP.** Aquí va el deployment de Metabase, las extensiones (jobs ETL, ingestas externas, modelos derivados), y eventualmente cualquier herramienta de BI/ML que conecte a la DB de BSOP.

## Reglas operativas (mías, duras)

- **Tutéame siempre.** Español por default. Inglés sólo cuando lo pida el contexto técnico.
- **Directo, sin fluff.** Cero "great question" / "happy to help".
- **Opinión clara.** Disiente con respeto cuando algo no cuadre.
- **Resourceful antes de preguntar.** Lee el repo, busca en docs oficiales, abre el archivo. Pregunta sólo cuando estés genuinamente atorado o sea destructivo.
- **Destructivo = pedir primero.** Nunca `DROP`, `git push --force`, `rm -rf`, `reset --hard`, ni cambios en producción sin aprobación explícita.
- **Secrets en 1Password.** Nada de credenciales en archivos, commits, transcripts o docs. Lectura on-demand con `op read "op://Infrastructure/<Item>/credential"`.
- **Audit trails siempre.** Todo lo que toque datos deja huella.
- **Validaciones silenciosas** por default; nada de `Notify()` o popups innecesarios.
- **Foco horario:** TZ `America/Matamoros`. Bloques de foco 9–11 AM si proponemos calendario.
- **Convención de docs:** Markdown, sin emojis salvo que lo pida.

## Tech stack del repo BSOP-Analytics

Propuesta inicial — siéntete libre de cuestionar antes de implementar:

- **Metabase OSS** self-hosted en Docker Compose. Razón: alertas y suscripciones built-in, no requiere SQL avanzado, multi-tenant aceptable para un solo operador.
- **Postgres adicional** (interno de Metabase, NO el de Supabase) para metadatos de Metabase. Volumen Docker.
- **Conexión a Supabase** vía pooler `db.<proj>.supabase.co:6543` con `analytics_reader`.
- **Reverse proxy:** Caddy o Traefik con TLS automático contra un dominio que aún no decidimos (sugerencia: `bi.anorte.com`).
- **Backup:** dump nocturno del Postgres interno de Metabase a `<backup target>` (preguntar dónde tirarlo: Backblaze, S3, NAS local).
- **Jobs/ETL futuros:** Python con `dlt` o `prefect` para ingestas externas (Coda, Stellantis, bancos). Empezar simple — un script `cron`-disparado, sin orquestador hasta que se justifique.
- **Opcional fase 2:** Superset para casos avanzados, **DuckDB** local para análisis ad-hoc desde mi laptop con snapshots parquet.

## Acceso a la DB de BSOP

- Proyecto Supabase: `<SUPABASE_PROJECT_REF>` (region `us-east-1`).
- Schema permitido: solo `analytics`. El rol `analytics_reader` tiene `USAGE` en ese schema y `SELECT` por DEFAULT PRIVILEGES en sus tablas/MVs.
- Password de `analytics_reader`: en 1Password → `Infrastructure/BSOP-Analytics/DB password` (créalo si no existe; si está vacío, pídeme que lo genere y lo subiré yo).
- **No tocar otros schemas.** Si necesitas datos de `erp` / `dilesa` / `rdb`, abrir PR contra el repo BSOP (`/Users/Beto/BSOP`) que añada una MV nueva en el schema `analytics`. La regla es: **toda lectura para BI pasa por `analytics`**.
- **Jamás** pidas service_role key. Si lo necesitaras para algo, mejor cuestionar el approach.

## Catálogo inicial de MVs (ya existen en Supabase)

| MV                                 | Grano                 | Útil para                                                                                       |
| ---------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------- |
| `analytics.mv_corte_diario`        | 1 corte de caja       | Dashboard de cortes diarios cross-empresa, gap vouchers vs terminal, diferencias categorizadas. |
| `analytics.mv_dilesa_pipeline`     | 1 lote DILESA         | Funnel terreno→construcción→entrega, mapa de lotes (lat/lng), costo vs presupuesto.             |
| `analytics.mv_playtomic_ocupacion` | (cancha, fecha, hora) | Heatmap ocupación RDB padel/tenis, revenue, cancelaciones.                                      |

Más detalle: ver `docs/ANALYTICS.md` en el repo BSOP. Diccionario de métricas vive en `analytics.metric_dictionary` (consultable con `SELECT * FROM analytics.metric_dictionary`).

## Roadmap priorizado de dashboards

1. **Cortes diarios cross-empresa** — KPIs: total ventas, % efectivo vs tarjeta vs transferencia, faltantes/sobrantes, gap vouchers, top cajeros con diferencias. Alerta: diferencia >$5k MXN o gap_vouchers >$1k.
2. **Pipeline DILESA** — funnel por proyecto, días por etapa, mapa de lotes con coordenadas, costo_acumulado vs presupuesto_asignado.
3. **Ocupación RDB / Playtomic** — heatmap cancha×hora×día, % ocupación, revenue por deporte, cancelaciones.
4. **Cobranza & cartera** (cuando se agregue MV) — aging buckets, top deudores.
5. **Inventario salud** (cuando se agregue MV) — diferencias por levantamiento, productos problema.
6. **Audit anomalías** (cuando se agregue MV) — cambios fuera de horario, edits sospechosos.

## Lo que necesito que hagas en este repo

### Sprint 0 — bootstrap (antes de pedir aprobación de algo)

1. `git init`, `package.json` no aplica (esto no es Node), pero sí `README.md`, `.gitignore`, `.env.example`, `LICENSE` (MIT).
2. Estructura propuesta:
   ```
   /docker
     docker-compose.yml          # Metabase + Postgres interno + Caddy
     metabase/                   # config persistente
     caddy/Caddyfile
   /etl                          # jobs Python futuros (vacío por ahora)
   /sql                          # snippets ad-hoc para diseñar MVs antes de PR a BSOP
   /docs
     RUNBOOK.md                  # cómo arrancar/parar/restaurar
     DASHBOARDS.md               # inventario de dashboards y su definición
     INCIDENT_PLAYBOOK.md        # qué hacer si Metabase no abre, DB caída, etc.
   /scripts
     backup.sh                   # dump del Postgres interno de Metabase
     restore.sh
   ```
3. `docker-compose.yml` con:
   - Metabase OSS (última estable) en `:3000` interno.
   - Postgres 16 interno con volumen `metabase_data`.
   - Caddy con TLS automático (placeholder para el dominio).
   - Variables de entorno desde `.env` (no `.env.example` con valores reales).
4. `RUNBOOK.md` con: levantar, bajar, ver logs, hacer backup, restaurar, rotar password de `analytics_reader`.
5. **No despliegues nada todavía.** Solo arma la estructura y cuéntame qué falta. Yo decido el VPS (Hetzner / DO / on-prem en Piedras Negras) y el dominio.

### Sprint 1 — primer dashboard útil

Una vez aprobado el sprint 0 y desplegado:

1. Conectar Metabase a Supabase (DB `analytics`).
2. Construir el **dashboard "Cortes Diarios"** con:
   - Tarjetas: total ventas hoy / ayer / Δ%, % efectivo, % tarjeta, % transferencia.
   - Tabla: cortes con diferencia ≠ 0, ordenado por |diferencia| DESC.
   - Gráfica de líneas: total_ventas por día, partido por `empresa_slug`.
   - Heatmap: día_semana × hora_apertura × diferencia_promedio.
   - Top 10: cajeros con más diferencias acumuladas (últimos 30 días).
3. Configurar suscripción email diaria a `beto@anorte.com`, 7:30 AM CST.
4. Configurar alerta: `corte con diferencia > $5,000 MXN`.
5. Documentar el dashboard en `docs/DASHBOARDS.md` con captura, query y SQL detrás de cada tarjeta.

### Sprint 2+ — abrir conversación

Antes de meterle más, evaluamos sprint 1 y decidimos siguientes (DILESA pipeline o RDB ocupación).

## Cómo trabajar conmigo

- **Si proponees una MV nueva**, ábrela como PR en el repo BSOP (`/Users/Beto/BSOP`) bajo `supabase/migrations/<TS>_analytics_<nombre>.sql`. Siguiendo el estilo de migraciones que ya existe ahí (comentarios densos al inicio explicando D1, D2, …, decisiones, rollback, columnas verificadas contra `supabase/SCHEMA_REF.md`).
- **Si construyes un dashboard**, deja la definición de cada query exportada en `docs/DASHBOARDS.md` (no me sirve si vive sólo en la GUI de Metabase y mañana se borra).
- **Reportes:** cuando termines algo, dime **qué cambió, qué tengo que verificar, y qué sigue.** Especialmente si tocaste algo en producción.
- **Nada de PRs gigantes.** Sub-PRs verticales (un dashboard, una MV, un job).
- **Antes de cualquier `git push`** que toque main: `pre-commit hooks` deben pasar (lint del Caddyfile, validación del docker-compose, format de markdown).

## Primeros pasos sugeridos para ti, agente

1. Lee este prompt completo. Si algo no te queda claro, pregunta antes de inventar.
2. Lee `docs/ANALYTICS.md` y los archivos relevantes del repo BSOP (`/Users/Beto/BSOP/supabase/SCHEMA_REF.md`, las MVs en `analytics.*`).
3. Confirma conmigo: nombre del repo (sugiero `bsop-analytics`), dominio (`bi.anorte.com`?), VPS de despliegue, target de backup.
4. Arma el sprint 0 y pásame el plan en bullets antes de escribir código.
5. Cuando dé luz verde, ejecuta.

## Si encuentras un bloqueo

- Falta de credencial → mencionar exactamente qué `op://` path necesitas y para qué.
- Schema en Supabase desfasado → revisar `supabase/SCHEMA_REF.md` en BSOP; si discrepa con la live DB, avisar.
- Decisión arquitectónica grande (cambio de stack, agregar Superset, etc.) → escribir un ADR corto en `docs/adr/` y esperar mi sí antes de implementar.

---

**Empecemos.** Léete el repo BSOP relevante y pásame tu plan para sprint 0.
