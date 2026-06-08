# Iniciativa — Bitácora de protocolo (péptidos + suplementos)

**Slug:** `salud-protocolo`
**Empresas:** SANREN (salud personal — gateada `RequireAccess empresa="sanren"`)
**Schemas afectados:** `health` (3 tablas nuevas: `protocolo_compuestos`, `protocolo_tomas`, `protocolo_efectos`); lectura de `health.health_metrics` para el overlay
**Estado:** in_progress
**Próximo hito:** **Sprint 1 (schema) en prod** (3 tablas `health` + RLS deny-all). Próximo: Sprint 2 — lectura (`lib/protocolo` + `ProtocoloSection` en `/health`) + seed Retatrutide tras confirmar fecha
**Dueño:** Beto
**Creada:** 2026-06-02
**Última actualización:** 2026-06-02 (Sprint 2 **cerrado** — sección de protocolo en `/health` (lectura) + fix de exposición de `health` a PostgREST; mergeado en #648. Próximo: Sprint 3 — captura por drawer)

## Problema

Beto empezó un protocolo de péptidos inyectables auto-administrados (arranque
documentado: **Retatrutide 2.5 mg subcutáneo semanal**) y planea **agregar otros
compuestos para medir cómo reacciona su cuerpo**. Hoy no hay dónde registrarlo:

1. **Apple Health no lo sabe.** El módulo `/health` (SANREN → Salud) es un
   dashboard 100% read-only que consume el ingest automático de Apple Health
   (HAE). Una inyección auto-administrada no la reporta ningún wearable — es un
   dato que **solo Beto puede capturar a mano**. El módulo nunca ha tenido
   escritura manual.
2. **No hay bitácora ni catálogo.** Existe `health.health_medications` pero la
   llena el ingest y **no se renderiza en ningún lado**. No sirve para un
   protocolo con dosis que titran, sitios de inyección, procedencia del
   compuesto y efectos subjetivos.
3. **No se puede medir la interacción con el cuerpo.** Beto quiere ver, para
   cada compuesto, qué pasa con su **peso, frecuencia en reposo (RHR), HRV y
   presión** alrededor de los cambios de dosis. Esos biomarcadores ya viven en
   `health.health_metrics`, pero no hay forma de cruzarlos contra un evento de
   dosis.

Contexto que pesa en el diseño: Beto es **post triple-bypass (jul-2024)**. El
Retatrutide (triple agonista GLP-1/GIP/glucagón) mueve justo RHR, presión y
peso — los marcadores que su cardiólogo vigila. El tracker se diseña centrado en
esos marcadores y con **export para llevar a consulta**.

## Outcome esperado

Una **bitácora de protocolo** dentro de `/health` que permita:

- **Catalogar** cada compuesto que Beto se administra (péptido inyectable,
  suplemento, oral), con dosis objetivo vigente, vía, frecuencia, **procedencia**
  (farmacia de compounding / research-grade / marca — trazabilidad) y estado.
- **Registrar cada toma** en <15 s desde un drawer web: compuesto, fecha/hora,
  dosis real, sitio de inyección (rotación), nota.
- **Capturar cómo cae** con escalas rápidas 0–5 (apetito, náusea, energía,
  molestia GI) + nota libre, ligadas opcionalmente a la toma — el único formato
  que después permite **graficar y correlacionar**.
- **Ver la interacción con el cuerpo**: overlay de los eventos de dosis (inicio
  de compuesto, cambios de dosis) sobre las curvas de peso/RHR/HRV/BP que ya
  trae `health.health_metrics`, con el mismo patrón visual que el
  `PostBypassTimeline` (marcador vertical sobre la serie).
- **Exportar** un resumen (PDF/CSV) para el cardiólogo.

Lo que esta iniciativa **no** es: no es consejo médico, no valida dosis ni
recomienda compuestos. Registra y visualiza. La procedencia se captura para
trazabilidad, no como aval clínico.

## Decisiones de alcance (cerradas con Beto 2026-06-02)

1. **Alcance** → protocolo completo: **péptidos + suplementos/orales** (no solo
   inyectables). El catálogo lleva una columna `clase` para distinguirlos.
2. **Efectos** → **escalas rápidas 0–5 + nota libre** (apetito/náusea/energía/GI),
   para que sea correlacionable, no solo un diario.
3. **Captura** → **web BSOP, drawer rápido** en `/health` (no por mensajería en v1).
4. **Gobierno** → **promover a iniciativa** formal (este doc + fila en INITIATIVES).

## Modelo de datos (3 tablas nuevas en `health`)

Nombres en **español** (consistente con el dominio de negocio del repo —
core/erp/dilesa/rdb), sin el prefijo redundante `health_` (ya viven en el schema
`health`).

### `health.protocolo_compuestos` — catálogo de lo que Beto se administra

- `id` bigint PK
- `nombre` text NOT NULL — "Retatrutide", "BPC-157", "Vitamina D3"…
- `clase` text NOT NULL CHECK in (`peptido`, `suplemento`, `oral`, `otro`)
- `via` text CHECK in (`subcutanea`, `intramuscular`, `oral`, `topica`, `nasal`) — nullable
- `unidad_dosis` text — `mg` | `mcg` | `UI` | `ml` | `g`
- `dosis_objetivo` numeric — dosis vigente planeada (ej. 2.5)
- `frecuencia` text — `semanal` | `diaria` | `2x_semana` | texto libre
- `procedencia` text — farmacia compounding / research-grade / marca / proveedor
- `estado` text NOT NULL DEFAULT `activo` CHECK in (`activo`, `pausado`, `suspendido`, `completado`)
- `fecha_inicio` date · `fecha_fin` date (null = vigente)
- `color` text — opcional, para el overlay
- `notas` text
- `created_at` / `updated_at` timestamptz DEFAULT now()

### `health.protocolo_tomas` — la bitácora literal (cada administración)

- `id` bigint PK
- `compuesto_id` bigint NOT NULL FK → `protocolo_compuestos(id)` ON DELETE CASCADE
- `fecha` timestamptz NOT NULL — cuándo se la administró
- `dosis` numeric NOT NULL — dosis **real** aplicada (puede diferir del objetivo → histórico de titración)
- `unidad` text — denormalizada del compuesto al momento de la toma
- `sitio` text — sitio de inyección para rotación (`abdomen_izq`, `muslo_der`…); null para orales
- `nota` text
- `created_at` timestamptz DEFAULT now()
- Índice `(compuesto_id, fecha)`

### `health.protocolo_efectos` — cómo cae (escalas + nota, correlacionable)

- `id` bigint PK
- `fecha` timestamptz NOT NULL
- `toma_id` bigint NULL FK → `protocolo_tomas(id)` ON DELETE SET NULL — liga opcional a la inyección
- `apetito` smallint CHECK 0–5 · `nausea` smallint CHECK 0–5 · `energia` smallint CHECK 0–5 · `gi` smallint CHECK 0–5
- `nota` text
- `created_at` timestamptz DEFAULT now()
- Semántica de escalas: apetito/energía → 0 muy bajo … 5 muy alto; náusea/GI → 0 sin molestia … 5 severo. Documentar en la UI.

Los biomarcadores (peso, RHR, HRV, BP) **no se duplican**: viven en
`health.health_metrics` y se cruzan por fecha en el overlay.

## Alcance v1

### Sprint 1 — Schema + seed (DB-puro)

- [x] Migración `supabase/migrations/20260602145253_health_protocolo_peptidos.sql` — 3 tablas en `health` + CHECKs + FKs + índices.
- [x] **RLS privada** aplicada. Hallazgo: `health` no usaba RLS (grants a `authenticated`; `lib/health.ts` lee con `service_role`). Decisión: RLS **deny-all** + grant solo `service_role` — más estricto que `health_metrics`/etc. Verificado en prod: `rls_on=true`, cero grants a authenticated/anon/authenticator.
- [x] `NOTIFY pgrst, 'reload schema';` al final.
- [x] Aplicado a prod tras OK explícito de Beto. **No** vía `db push` (drift: 2 migraciones remotas de otras sesiones sin archivo local) → vía connector `apply_migration` (quirúrgico, solo mi DDL). Verificado con SELECT a `pg_class`/grants. `SCHEMA_REF.md` + `types/supabase.ts` regenerados.
- [x] **Seed aplicado a prod** (3 compuestos + 13 tomas): **Retatrutide** 2.5 mg semanal (11 tomas, 17-mar → 29-may; martes → viernes tras el viaje de moto SD–Seattle; plan: 3 mg el 5-jun), **KLOW** 0.2 ml diario (desde 1-jun; 80 mg/3 ml BAC) y **Semax** 500 mcg diario (desde 2-jun). Insertado vía connector `execute_sql` (data personal — fuera de migraciones versionadas, no corre en preview).

### Sprint 2 — Lectura (read-only)

- [x] `lib/protocolo.ts` — `getProtocoloData()`: compuestos + tomas con service role vía `.schema('health')`.
- [x] `components/health/protocolo-section.tsx` — tarjetas de compuestos activos (dosis vigente, última toma, total) + mini-timeline de tomas. Reusa `Surface`, `tones.ts`.
- [x] Insertar `<ProtocoloSection>` en `app/health/page.tsx` (fetch en paralelo con el dashboard).
- [x] **Fix PostgREST**: `health` no estaba en `pgrst.db_schemas` → la sección fallaba con "Invalid schema: health". Migración `20260602165059_health_expose_to_pgrst` (autorizada por Beto, patrón `*_expose_schema`) lo expone. Verificado HTTP 200. Mergeado en PR #648.

### Sprint 3 — Captura (la primera escritura del módulo health)

- [ ] `components/health/protocolo-drawer.tsx` — drawer (patrón `DetailDrawer`, ADR-018/026) para: registrar toma (compuesto, fecha, dosis, sitio, nota) + efectos (4 escalas 0–5 + nota); alta de compuesto nuevo ("agregar otro péptido").
- [ ] Mutación vía route handler `app/api/health/protocolo/route.ts` (o server action según patrón del repo) con `assertNotInPreview()` (ADR-027) — read-only de "viendo como" se respeta.
- [ ] Validación de inputs (Zod) + `getSupabaseErrorMessage` en catches (memoria `feedback_supabase_error_helper`).

### Sprint 4 — Overlay + export + cierre

- [ ] Overlay de eventos de dosis (inicio de compuesto, cambios de dosis) sobre las series de peso/RHR/HRV/BP, patrón `PostBypassTimeline` (`components/health/post-bypass-timeline.tsx`).
- [ ] Export PDF/CSV del protocolo + bitácora + efectos para consulta médica (patrón de impresión BSOP: vista de pantalla con `print:` modifiers — memoria `feedback_print_pattern_bsop`).
- [ ] Evaluar **ADR**: el patrón de escritura manual + RLS de datos clínicos en el módulo `health` cruza convención (hoy es read-only de ingest) → candidato a ADR si se reusa.
- [ ] Bitácora final + mover a `## Done` en INITIATIVES.md.

## Fuera de alcance (v1)

- **Captura por mensajería** (iMessage/WhatsApp → registro automático). Beto eligió drawer web; la captura por mensaje queda como posible v2.
- **Recordatorios/alertas** de próxima dosis (cron + push). v2.
- **Análisis estadístico de interacción** (correlación formal dosis↔biomarcador). v1 muestra el overlay temporal; la lectura la hace Beto (o yo, ad-hoc). Correlación ≠ causalidad — la UI lo encuadra así.
- **Interacciones fármaco-fármaco** entre péptidos (motor farmacológico). No aplica.
- **Multi-usuario** (Graciela, etc.). El módulo es de Beto.

## Métricas de éxito

- Beto registra una inyección + cómo cayó en **<15 s** desde `/health`.
- Para cualquier compuesto: ve su **serie de dosis + efectos + overlay** con peso/RHR/HRV/BP.
- Beto **agrega un péptido nuevo** y empieza a loguearlo sin tocar SQL.
- Hay un **export** listo para llevar al cardiólogo.
- CI verde en cada sprint.

## Riesgos / preguntas abiertas

- **Primera escritura manual en `health`.** El módulo era read-only de ingest. Sprint 3 define el patrón de mutación; debe respetar el read-only de preview (ADR-027) y la RLS privada.
- **RLS del schema `health` desconocida.** Verificar en Sprint 1 antes de exponer escritura — datos clínicos no deben filtrarse a otros usuarios de SANREN ni a previews.
- **Datos clínicos sensibles.** No exponer valores en logs ni en audit con payload crudo; export controlado.
- **No es consejo médico.** El tracker no valida dosis ni recomienda. Compuestos research-grade tienen perfil de seguridad incierto, sobre todo con historia cardiovascular; se registra **procedencia** para trazabilidad, no como aval. Encuadrar en la UI.
- **Seed pendiente de dato real.** Fecha de inicio del Retatrutide + tomas a la fecha — confirmar antes del seed (PERSONAL.md o Beto).
- **Unidades mixtas** (mg para péptidos, UI/mcg para suplementos). `unidad_dosis` por compuesto lo resuelve; el overlay agrupa por compuesto, no mezcla unidades.

## Bitácora

- **2026-06-02** — Promovida a `planned`. Beto pidió una bitácora de péptidos en SANREN → Salud (arranque: Retatrutide 2.5 mg SC semanal; planea agregar otros "para medir interacciones con su cuerpo"). Exploración: `/health` es dashboard read-only de Apple Health; `health.health_medications` existe pero no se renderiza; los biomarcadores viven en `health.health_metrics`. Alcance v1 cerrado con 4 decisiones (protocolo completo / escalas 0–5 + nota / drawer web / promover). Modelo de 3 tablas en `health` propuesto. Pendiente: OK verbal de Beto para aplicar el schema (Sprint 1).
- **2026-06-02** — Sprint 1 aplicado a prod (proyecto `ybklderteyhuugzfmxbi`, migración `20260602145253_health_protocolo_peptidos`). Tras OK explícito de Beto. `db push` descartado por drift (migraciones `20260602020000`/`20260602180000` de otras sesiones en remoto sin archivo local — no se tocaron); aplicado quirúrgicamente vía connector `apply_migration`. RLS deny-all verificada (cero grants a authenticated/anon). `SCHEMA_REF.md` + `types/supabase.ts` regenerados (diff limpio, solo las 3 tablas). **Pendiente para cerrar Sprint 1: seed del Retatrutide** — falta fecha de la 1ª inyección + historial de tomas (PERSONAL.md solo tiene compuesto + dosis 2.5 mg, no fechas).
- **2026-06-02** — **Sprint 1 cerrado.** Seed aplicado a prod vía `execute_sql`: 3 compuestos activos + 13 tomas. **Retatrutide** 2.5 mg semanal — 11 tomas (martes 17-mar → 5-may; lunes 11-may adelantada por viaje de moto SD–Seattle; viernes 22 y 29-may; ya en cadencia de viernes; plan subir a 3 mg el 5-jun). **KLOW** 0.2 ml/día (80 mg en 3 ml agua BAC) desde 1-jun. **Semax** 500 mcg/día desde 2-jun. Fechas validadas por día de semana antes de insertar. Seed fuera de migraciones versionadas (data personal, no debe correr en preview). Próximo: Sprint 2 (lectura/UI).
- **2026-06-02** — **Sprint 2 cerrado** (PR #648, mergeado por Beto). Sección **Protocolo** en `/health`: `lib/protocolo.ts` (lectura con service role vía `.schema('health')`) + `ProtocoloSection` (tarjetas de compuestos activos + mini-timeline de tomas), arriba del dashboard. Topamos con que el schema `health` **no estaba expuesto a PostgREST** (el dashboard funciona vía vistas shim en `public`); se expuso con `20260602165059_health_expose_to_pgrst` (autorizada por Beto, patrón `*_expose_schema`), verificado HTTP 200. El commit también sincronizó un drift de `SCHEMA_REF` (`obra_estimacion_id`, ADR-039) que `main` traía pendiente. Lección: no rebasar una branch ya pusheada con PR abierto (divergió el SHA del Sprint 2; se reconcilió con merge, no force-push). Próximo: Sprint 3 (captura por drawer).

## Decisiones registradas

- **2026-06-02** — Modelo de 3 tablas (`protocolo_compuestos` / `protocolo_tomas` / `protocolo_efectos`) en lugar de extender `health.health_medications`. _Razón:_ `health_medications` lo llena el ingest automático y su shape (name/dose/raw*json) no soporta dosis que titran, sitio de inyección, procedencia ni efectos correlacionables. Separar catálogo (identidad estable) de tomas (eventos reales, ground truth de la titración) de efectos (subjetivo, escalable) da audit trail nativo (regla dura de Beto). \_Aplica a:* todo el schema de la iniciativa.
- **2026-06-02** — Nombres en **español** dentro del schema `health` (que es inglés por mapear Apple Health). _Razón:_ estas tablas son dominio de negocio personal, no métricas de Apple Health; consistencia con core/erp/dilesa/rdb pesa más que con el prefijo legacy `health_`.
- **2026-06-02** — Los biomarcadores **no se duplican**; el overlay cruza `health.health_metrics` por fecha. _Razón:_ peso/RHR/HRV/BP ya se ingieren; duplicarlos crearía dos fuentes de verdad. El evento de dosis es lo único nuevo que se superpone.
- **2026-06-02** — Diseño centrado en **RHR/BP/peso + export** por el perfil post-bypass de Beto. _Razón:_ son los marcadores que el Retatrutide mueve y que su cardiólogo vigila; el valor del tracker es clínico-personal, no solo un diario.
- **2026-06-02** — RLS **deny-all** + grant solo `service_role` (más estricto que el resto de `health`). _Razón:_ `health_metrics`/etc. otorgan SELECT a `authenticated` (cualquier usuario logueado podría leerlas por la API REST). Para un protocolo médico eso no es aceptable. Como `lib/health.ts` ya lee con `service_role` (bypassa RLS), no hace falta política para `authenticated`: deny-all protege contra acceso directo por API, y el módulo lee/escribe server-side con service role. _Aplica a:_ las 3 tablas `protocolo_*` y cualquier tabla futura de datos clínicos en `health`.
- **2026-06-02** — Schema aplicado vía connector `apply_migration`, **no** `supabase db push`. _Razón:_ el dry-run reveló drift (migraciones remotas de CxP/CxC de otras sesiones sin archivo local); `db push` intentaría reconciliar todo el historial compartido — no es mi lugar arreglar el drift ajeno. `apply_migration` aplica solo mi DDL. Mi archivo local se renombró a la versión que registró el connector (`20260602145253`) para que coincida con el historial remoto. _Aplica a:_ flujo de migraciones cuando hay drift multi-sesión.
