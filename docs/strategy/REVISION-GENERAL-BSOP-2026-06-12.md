# Revisión General BSOP — 2026-06-12

> Auditoría multi-agente (ultracode): 122 agentes en 4 fases — mapa de 7 subsistemas,
> revisión en 9 dimensiones, **verificación adversarial de cada hallazgo** (lentes
> evidencia + impacto, varios validados contra prod), y crítico de completitud.
> Resultado: 86 hallazgos → **68 confirmados**, 5 refutados (excluidos de este
> reporte), 13 bajas sin verificar. Las 4 brechas del crítico se cerraron con
> verificación manual ligera. Los advisors de Supabase prod y `pg_stat_statements`
> se usaron como datos duros.

---

## 1. Veredicto ejecutivo

**La arquitectura es sana y la dirección es correcta.** El patrón que domina el
repo es: _cada generación es mejor que la anterior_. El esqueleto financiero
nuevo (subledger gemelo CxC/CxP, RPCs con gate en DB y audit_log, baseline de
presupuesto con triggers guard) es de calidad alta y debe ser el canon. El
mecanismo de estandarización (ADR-011 módulos compartidos, checklist RBAC
testeado en CI, golden→rollout documentado en INITIATIVES.md) **existe y
funciona** — CxP lo prueba end-to-end con 5 tabs compartidos entre RDB y DILESA.

Los desvíos que intuyes son reales pero son **de disciplina, no de diseño** —
y tres son estructurales:

1. **El perímetro de la DB tiene un hoyo crítico**: un GRANT de abril dejó las
   RPCs financieras ejecutables por `anon` (la anon key viaja en el bundle
   público de Vercel) y una vista de presupuesto fuga datos multi-empresa sin
   login. _Esto se arregla con una migración de un día._
2. **Todo el dinero vive en ~119 funciones de Postgres sin red de seguridad**:
   sin fuente canónica de la versión viva (ya costó el incidente FIFO de 11
   días) y sin un solo test de comportamiento.
3. **Los módulos golden están hardcodeados a DILESA justo antes del rollout**:
   compras gen-2, CxC, branding, emails de consejo. Replicarlos hoy a
   COAGAN/ANSA produciría el tercer fork.

Y un dato incómodo pero accionable: **el drift de UI está ocurriendo en el
código MÁS NUEVO** (las pills hand-rolled del Sprint 4c de PLD, las 22 páginas
sin perfil responsive son todas recientes). El design system ganó donde hay
enforcement automático (DataTable, DetailDrawer, RequireAccess) y se erosiona
donde el guard es solo convención. La lección transversal de toda la auditoría:
**los guards que existen pero no bloquean, no protegen.**

---

## 2. Qué está bien — patrones a canonizar

Confirmado por los revisores como lo mejor del repo (consérvalo y replícalo):

| Patrón                                      | Evidencia                                                                                                                     | Úsalo como plantilla para                          |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Subledger CxC/CxP (ADR-037)**             | `20260601152629_erp_cxc_subledger.sql`: 3 capas, saldo GENERATED, mutación solo vía RPC + audit_log, UPDATE/DELETE admin-only | Todo módulo financiero nuevo                       |
| **Módulo compartido ADR-011**               | `components/cxp/*`: 5 tabs, un solo código, shells de ~20 líneas por empresa                                                  | CxC, P2P, todo el rollout                          |
| **Tests-candado de convención**             | `permissions.test.ts` (912 líneas), `permissions-deps.test.ts` (greppea los page.tsx reales), invariantes DD7-DD11 del drawer | Más convenciones (crons↔vercel.json, h1 canónico…) |
| **Tooling multi-sesión**                    | `db:new` anti-colisión vía gh, INITIATIVES auto-generado validado en CI, GOVERNANCE.md como memoria institucional             | Cualquier recurso con naming global                |
| **Bundle hygiene**                          | tesseract/heic2any/pdfjs solo vía `await import()`; react-pdf solo server-side                                                | Regla explícita de PR                              |
| **Tests financieros con fixtures reales**   | cfdi-parser con XML SAT reales, IVA frontera 8%, caso real "Morado" con cifras exactas                                        | Estándar de test financiero                        |
| **proxy.ts deny-by-default + Viendo-como**  | Sin fila activa → signOut; preview bloquea mutaciones con 403 server-side                                                     | —                                                  |
| **Captura a ciegas de levantamientos**      | Mobile-first real: NumPad, cola offline IndexedDB, scanner USB-HID                                                            | Captura de piso futura (COAGAN)                    |
| **core.empresas como tabla de config rica** | CSF + 15 columnas de branding + config jsonb + UI de captura                                                                  | La fuente única que el código aún no consume (§5)  |
| **Best-in-class UI**                        | `cxp-facturas-module.tsx` (DataTable + useUrlFilters + ErrorBanner + DetailDrawer + useActionFeedback + CancelarConMotivo)    | Anatomía canónica de list-module                   |

---

## 3. Hallazgos críticos y urgentes

### 🔴 C1. RPCs financieras SECURITY DEFINER ejecutables por `anon` — CRÍTICA

`20260415230000_fix_grants_and_role_config.sql:30-33` dejó `GRANT EXECUTE ON ALL
FUNCTIONS IN SCHEMA erp/core/rdb/public TO anon` + default privileges que lo
perpetúan para funciones futuras. `cxc_pago_registrar`, `cxc_pago_aplicar`,
`cxc_pago_cancelar`, `cxc_cargo_ajustar`, `cxp_pago_programar`,
`cxp_factura_alta`, `fn_aplicar_levantamiento` **no tienen gate interno** (solo
usan `auth.uid()` para el audit_log). El verificador lo probó en prod: **un
cliente con la anon key (pública, viaja en el JS de Vercel) insertó un
cxc_pago y su movimiento bancario sin autenticación**, esquivando proxy.ts y
preview-guard. Contraste: `cxp_pago_aprobar` SÍ gatea (fn_is_admin OR rol
Dirección) — el patrón correcto ya existe.
**Fix:** REVOKE EXECUTE de anon en schemas de negocio + revocar el default
GRANT + gate interno (`IF NOT fn_is_admin() AND NOT fn_has_empresa(...) THEN
RAISE 42501`) en cada RPC mutadora + test que afirme el 42501.

### 🔴 C2. `erp.v_partida_control` sin `security_invoker`: fuga anon de presupuesto — ALTA

La migración `20260612001114` (de ayer) recreó la vista sin `WITH
(security_invoker = on)` que sí llevan sus hermanas. Probada en prod: **anon
leyó 558 filas de partidas con montos comprometido/ejercido/pagado de TODAS las
empresas**. Mismo hotfix que C1.

### ⏰ C3. Node 20 EOL: GitHub fuerza Node 24 el **16-jun-2026 (en 4 días)**

Los 4 workflows usan `node-version: 20` (EOL) + actions @v4. El warning oficial
ya aparece en los logs de CI de hoy. **Fix:** bump a checkout@v5/setup-node@v5,
node 22, `engines` en package.json. PR de 10 minutos, pero con fecha límite.

### 🔴 C4. Un DELETE puede destruir el expediente PLD completo de una venta — ALTA

`ventas_write` es `FOR ALL` (incluye DELETE) para cualquier miembro de DILESA, y
`venta_fases`, `venta_pagos` y `venta_fase_revisiones` (el log PLD "append-only"
con el acuse SPPLD) cuelgan con `ON DELETE CASCADE`. Un DELETE vía PostgREST
borra sin rastro registros con peso de cumplimiento legal. La convención del
repo es soft-delete; el patrón cxc (DELETE admin-only) ya existe.
**Fix:** policy DELETE solo admin en ventas y sus hijas + CASCADE→RESTRICT en
el expediente. Migración chica.

### 🔴 C5. 119 funciones SQL financieras: sin fuente canónica NI tests — ALTA ×2

(a) Las funciones viven solo como deltas en migraciones
(`process_waitry_inbound` redefinida 6 veces, `cxc_pago_registrar` 4). El
incidente FIFO (regresión de 11 días con efecto financiero real porque una
migración partió de la versión vieja del RPC) **es exactamente esta clase** y
nada lo previene hoy: drift-check no compara cuerpos de funciones y
SCHEMA*REF.md no las incluye.
(b) Cero tests de comportamiento: el único test que toca RPCs verifica
\_existencia*, no lógica. El FIFO de CxC, `cxp_pago_aprobar` y los guards de
presupuesto corren sin red.
**Fix:** (a) `gen-functions-ref` hermano de schema:ref (dump versionado de
`pg_get_functiondef` + check de drift en CI; toda redefinición parte de ahí);
(b) suite de integración contra `supabase start` para las ~10 RPCs de dinero,
corriendo en PRs que tocan migraciones.

### 🔴 C6. CI nunca compila Next: un PR que rompe el build puede auto-mergear — ALTA

ci.yml no corre `next build`; branch protection solo exige el job de
lint/typecheck/tests (strict=false) y el deploy de Vercel NO es required check.
Con auto-merge como norma, la clase de error que tsc no atrapa (import de client
a route handler — ya mordió, está en memorias) llega a main.
**Fix:** marcar el check de Vercel como required (barato) o job `build` en CI.

### 🔴 C7. Dato financiero incorrecto HOY: conteo de tareas en estimaciones — ALTA

`estimaciones-module.tsx:137` baja las **129,587 filas** de
`dilesa.estimacion_tareas` al browser para contar en JS; PostgREST capa en
50,000 **sin error** → la columna "Tareas" está sistemáticamente subcontada, y
el query promedia 2.9s (top-12 de prod). **Fix:** agregación server-side
(GROUP BY). Es el fix de mejor ROI de toda la dimensión performance.

---

## 4. Hallazgos confirmados por tema (severidad media salvo nota)

### Seguridad / integridad

- **Bucket `adjuntos` sin scoping de empresa** _(brecha verificada a mano)_: la
  policy da SELECT a cualquier `authenticated`; el proxy
  (`app/api/adjuntos/[...path]/route.ts:22`) lo documenta. Cualquier usuario de
  cualquier empresa puede leer INEs, expedientes PLD, estados de cuenta de las
  demás. Mitigado hoy por paths no enumerables y equipo chico; insostenible con
  los 5 vendedores + rollout.
- **Gates de fase/PLD solo en capa app**: `marcarFase` corre client-side; la
  policy de `venta_fases` solo pide membresía. El gate server-side de Fase 13
  (cerrar-fase13, correcto) es esquivable con el mismo INSERT que las otras
  fases hacen vía PostgREST. → Mover cierre de fase a RPC con gate.
- **`marcarFase` sin atomicidad**: 4 escrituras secuenciales desde el browser
  (storage → adjuntos → ventas → venta_fases); el docstring admite los huérfanos.
  `venta_fases` ni siquiera tiene UNIQUE(venta_id, fase). → misma RPC.
- **Magic links dependen del punto en el token**: encuesta/notario/avalúo
  funcionan sin login solo porque el matcher del proxy excluye paths con punto;
  `isPublicPath` no los lista (y lista `/compartir/` que no existe). → allowlist
  explícita + test del contrato.
- **Identidad en dos espacios de uuid**: `core.usuarios.id` (gen_random_uuid,
  sin FK a auth.users, vínculo por email) vs columnas de autoría partidas entre
  ambos espacios; `audit_log.usuario_id` recibe `auth.uid()` siendo FK a
  core.usuarios. La atribución del audit trail no está garantizada por schema.
- **Rate limiting solo en 3 rutas** _(brecha)_: impersonate, welcome-email,
  health/ingest. Los endpoints token-públicos (encuesta/dictamen/avalúo) no
  tienen — el token HMAC mitiga, pero conviene cubrirlos.
- **Superficie IA sin revisión dedicada** _(brecha)_: 7 superficies llaman a
  Anthropic (CSF ×2, estados de cuenta, documentos, revisión PLD, notarial,
  planos). El veredicto PLD sí se persiste (venta_fase_revisiones), pero no hay
  visión de costos/validación/fallbacks como capa. Vale una pasada propia.

### Datos / modelo

- **Audit trail no uniforme** (regla dura tuya): columnas `*_por` sin FK
  (obra_estimaciones, presupuesto_partidas, estados_cuenta) y tablas financieras
  sin autor en la fila (`erp.facturas` sin created_by; `erp.movimientos_bancarios`
  — el espejo de tesorería — sin ninguna columna de autoría).
- **KYC/PLD duplicado** entre `erp.personas` y `dilesa.ventas` con la regla de
  precedencia viviendo SOLO en TypeScript (`kycEfectivo()`); cualquier consumidor
  SQL (reportes, export PLD) ve datos divergentes de la UI. → vista
  `v_venta_kyc_efectivo` en DB.
- **Gen-1 inmobiliario muerto en erp sin marca**: `erp.lotes/proyectos/
ventas_inmobiliarias/cobranza/pagos/contratos` — 0 consumidores, nombres que
  colisionan con el flujo vivo (`erp.pagos` vs `erp.cxc_pagos`). Trampa directa
  para agentes que escriben SQL. → `*_deprecated` como obra_presupuesto.
- **Shims `public.*` vencidos hace 5 semanas pero load-bearing**: lib/health.ts
  sigue dependiendo de ellos; si alguien ejecuta el drop prometido en el
  COMMENT, rompe la ingesta de salud. → migrar consumidor + drop en un PR.
- **Columnas uuid huérfanas** de catálogos extintos junto al campo vivo
  (ordenes_compra.estado_id muerto + estado vivo; facturas, gastos,
  movimientos_bancarios) + `empresa_socios.socio_persona_id` sin FK.
- **Fase 2 de ventas lee la tabla muerta** `dilesa.venta_pagos` para mostrar
  el enganche (es banner, no gate — severidad calibrada): una venta nueva con
  abono por CxC muestra $0 pagado al autorizador.
- **`dilesa.ventas` tabla-dios (85 columnas)**: regla de crecimiento hacia
  delante (timestamps de notificación → notification*log; bloque cd*\* → satélite).

### Estandarización / rollout (pre-ANSA/COAGAN)

- **P2P en dos generaciones, ninguna replicable**: RDB gen-1 = fat pages de
  1,439/1,778/1,119 líneas; DILESA gen-2 = módulos compartidos pero con 27
  referencias 'dilesa' hardcodeadas (slugs RBAC, `.schema('dilesa')`, rutas,
  HiloGastoStepper). → des-dilesaizar gen-2 al patrón CxP ANTES de la primera
  página de COAGAN/ANSA; convergencia RDB como fase 2.
- **CxC nació dilesa-namespaced** pese a ser iniciativa "todas": el aging está
  copiado de CxP casi línea por línea (~135 líneas verbatim) y vive en
  `app/dilesa/cobranza` + `components/dilesa/`. → extraer `components/cxc/` con
  la originación como adaptador por vertical (clave para ANSA/DMS).
- **Centro de costos acoplado a `dilesa.proyectos` a nivel DB**:
  `erp.presupuesto_partidas.proyecto_id` FK cross-schema; los selectores de UI
  asumen proyectos DILESA. COAGAN (ranchos/huertas) y ANSA (departamentos DMS)
  no encajan. → **decisión arquitectónica que merece ADR antes del rollout**.
- **Crear OC implementado 4 veces** (3 client-side, doble INSERT sin
  transacción, folios `OC-${Date.now()}` divergentes en 9 sitios, sin guard de
  duplicado en 2). → RPC `erp.oc_crear` transaccional con folio en DB.
- **Alta de empresa = ~9 touchpoints sin runbook**: NAV_ITEMS, NAV_TO_EMPRESA,
  LOGO_BY_KEY, empresa-constants, EmpresaSlug union, ROUTE_TO_MODULE, EXPECTED,
  migración módulos+permisos, assets. → runbook + derivar de core.empresas.
- **Branding triple-source**: core.empresas (completo, con UI) vs
  BRANDING_BY_SLUG vs LOGO_BY_KEY estáticos limitados a dilesa|rdb. **Las
  minutas de junta de cualquier empresa caen a `consejo@dilesa.mx`** por
  fallback hardcodeado (RDB ya opera juntas). → consolidar a core.empresas;
  si falta config, bloquear con CTA, nunca caer a otra empresa (SM6).
- **UUID de RDB redeclarado en 22 archivos** pese a lib/empresa-constants
  (que se documenta como fuente única). → barrido + regla ESLint.
- **44 formatters locales** de moneda/fecha pese a lib/format canónico (varios
  re-resuelven a mano el bug de TZ que lib/format ya resuelve testeado).
- **Secuencia de rollout regada en 3 docs** (empleados_puestos sin cargar
  bloquea aprobación de pagos en COAGAN/ANSA; 0 almacenes; manual solo DILESA;
  contrato con Business Pro sin modelar). → iniciativa paraguas.

### Performance (sin incendios; la DB es chica — 630MB)

- **Conciliación Playtomic 4.2s/llamada** (~20 min de espera acumulada): el
  non-equi join de la vista no se beneficia del filtro. → materializar el match
  al importar el CSV.
- **`v_inventario_stock` re-agrega TODO movimientos_inventario** (2.4s, 407M
  tuplas leídas acumuladas) cuando erp.inventario ya mantiene el stock por
  trigger. → columnas derivadas o MV post-corte.
- **proxy.ts paga 2 roundtrips por CADA request** (Auth + service-role), incluidos
  prefetches, con el Auth server capado a 10 conexiones. → cache corto del check
  'activo' + validación local del JWT.
- **Waterfalls**: ventas-module hace 6 awaits en serie donde 5 son
  independientes (~0.6-1.2s de latencia pura); cxp similar. → `Promise.all`
  mecánico (estimaciones-module ya muestra el patrón correcto).
- **RLS initplan en dilesa.ventas**: 3 funciones EXISTS re-evaluadas POR FILA
  (~4,300 sub-queries por carga del módulo más usado). → wrap `(select fn())`,
  migración de una línea por policy.
- **schema:check es el consumidor #1 de tiempo de DB en prod** (3.2h acumuladas,
  5.4s/corrida): las queries de information_schema de gen-schema-ref. →
  reescribir contra pg_catalog (10-100×).
- **Sin paginación sistémica**: un solo `.range()` en el repo; DataTable
  renderiza todo el dataset; @tanstack/react-virtual instalado con 0 imports.
  → paginación client-side de TanStack (barato) + umbral para server-side.
- Los 207 unused_index y 102 FKs sin índice del advisor son mayormente ruido de
  DB joven/legacy gen-1; solo ~4 importan (venta_fase_revisiones,
  inventario_levantamiento_lineas). No perseguirlos: retirar el legacy.

### UI/UX

- **Sin búsqueda global ni Cmd+K**: cmdk ya está instalado y wrappeado; el RBAC
  para filtrar rutas ya existe. Es ensamblar, no construir — **el quick-win de
  UX de mayor apalancamiento** para operar 5 empresas desde un hub.
- **Forms/Wizard sub-adoptados justo en captura crítica**: ventas/nueva (1,516
  líneas) y las 16 fases usan useState crudo sin zod ni validación inline,
  escritas DESPUÉS del ADR-016. → regla hacia delante, no reescritura.
- **El drift vive en lo nuevo**: Sprint 4c rendea pills a mano cuando `<Badge
tone>` existe; 21 archivos definen mapas estado→tone inline pese a
  status-tokens. → pasada mecánica + check en audit-ui.ts **y correr audit-ui
  en CI** (existe y no corre).
- **Feedback bifurcado**: 48 `alert()` nativos vs toast canónico; `undoable()`
  con CERO callers; catches 'non-fatal' sin telemetría; 4 window.confirm en
  acciones destructivas. → barrido + regla ESLint no-restricted-globals.
- **useUrlFilters solo en 10 de ~40 list-modules**: los filtros mueren al
  refresh/compartir en la mayoría (en cxp sí funcionan). → migrar los 5-6 de
  más tráfico; declarar el hook requerido en ADR-007.
- **Tablas raw interactivas** en cobranza CxC (financiero, de uso diario),
  settings/empresas, prototipos. → migrar cobranza primero.
- **a11y: el enforcement prometido nunca llegó**: axe fuera de CI, specs que se
  auto-skipean y auditan una ruta muerta (/dilesa/terrenos). → nightly + rutas
  actualizadas.
- 22 páginas sin perfil @responsive (todas recientes; incluye las 3
  token-públicas que externos abren en celular); links muertos en sidebar
  (Integraciones/Preferencias → 404 para todos).

### Testing

- **E2E/integración fuera de CI y auto-neutralizados**: self-skip silencioso
  por auth stale, 8 asserts con `.catch(() => {})`, comentario de "211
  migrations" cuando hay 398. → job nightly donde skip=FAIL.
- **RLS no se testea en ninguna capa** (el smoke usa service role). → caso
  negativo con anon key; la iniciativa RLS test-first.
- **10 de 17 server actions sin test**, incluidas settings/acceso (RBAC),
  ventas/[id] (PLD) y conciliación Playtomic. El patrón de mock+gates ya existe
  en 3 estilos — replicar es mecánico (ideal para sesiones IA).
- **E2E cubre solo RDB; DILESA (lo financiero profundo) tiene cero specs.** →
  replicar la plantilla de levantamientos al ciclo PLD fase 13 + abono CxC.
- Mocks de Supabase duplicados a mano en 27 archivos → factory compartida.
- Coverage: trinquete honesto pero global y parcial (components/ ni se mide) →
  thresholds per-file en lib financiero + ratchet.

### Tooling / docs

- **Validación de migraciones es informativa, no bloqueante** (drift-check
  comenta, no falla; Supabase Preview no es required y es flaky). → job
  bloqueante con `supabase db reset` efímero en PRs que tocan migraciones.
- **schema:check acoplado a PROD**: drift ajeno y ETIMEDOUT bloquean PRs no
  relacionados (pasó el mismo día de la auditoría). → retry + árbol de decisión
  en el mensaje de error.
- **ARCHITECTURE.md §6 contradice el protocolo vigente** (5 checks con test:run
  vs 6 reales; "mocks prohibidos" cuando 27 archivos los usan) y **§8 tiene un
  deadlock**: analytics lleva 7 semanas blocked esperando un export desde
  Cowork… que ADR-012 deprecó. → reescribir §6 como pointer a CLAUDE.md;
  replantear analytics; **decidir db-backup-strategy** (6 semanas en proposed
  con CxC/CxP/PLD en prod es el topic más serio de la lista).
- **398 migraciones sin estrategia de baseline** (~250/mes de ritmo; cada
  Preview re-ejecuta todo incluido un backfill de 4.86MB). → ADR de
  consolidación (decisión tuya).
- **scripts/ con ~45 one-offs ejecutados** mezclados con tooling vivo + un .pyc
  trackeado + `docs/email_miguel.txt` (correo real con PII de terceros, contra
  tu regla) + 5 reportes de abril sueltos en docs/ raíz. → barrido a archive.
- **Edge function `sync-cortes` con dependencia viva a Coda** _(brecha)_:
  snapshot en supabase/functions/ que jala cortes de Coda post-cutover —
  verificar si sigue desplegada/agendada y retirarla.
- Las 3 MVs de analytics congeladas desde abril (el cron quedó en un comentario);
  fricción de env en worktrees (schema:check se salta justo donde más trabajas);
  deps muertas (shadcn, path-data-parser); maquinaria expuesto a PostgREST con
  0 tablas; /family placeholder; ADMIN_BYPASS_EMAIL "temporal" sigue vivo.

---

## 5. Rumbo propuesto

Mi lectura: **no necesitas re-arquitecturar nada**. Necesitas (a) cerrar el
perímetro, (b) ponerle red de seguridad al dinero, (c) des-DILESAizar lo golden
antes de replicarlo, y (d) convertir las convenciones en guards que bloquean.
En ese orden.

### Sprint 0 — Hotfix de perímetro (1 día; requiere tu OK para migración a prod)

1. REVOKE EXECUTE de anon + revocar default grants + gate interno en RPCs
   mutadoras (C1) + test 42501.
2. `v_partida_control` con security_invoker (C2).
3. DELETE admin-only + CASCADE→RESTRICT en expediente PLD (C4).
4. Allowlist explícita de magic links en proxy (quitar /compartir/).
5. Índices a venta_fase_revisiones e inventario_levantamiento_lineas.
6. PR aparte el mismo día: bump Node/actions en workflows (C3 — **antes del 16-jun**)
   - Vercel como required check (C6).

### Iniciativa A — `blindaje-financiero` (~1-2 semanas)

La red de seguridad del dinero: `gen-functions-ref` (snapshot versionado de
pg_get_functiondef + drift guard en CI), suite de integración SQL para las ~10
RPCs de dinero contra supabase local (corre en PRs que tocan migraciones),
fn_cerrar_fase como RPC transaccional con gate (absorbe marcarFase), caso
negativo anon en integración, wraps initplan en policies, fix del conteo de
estimaciones (C7), tests de las 4 actions de mayor riesgo, audit-trail
normalizado (FKs a \*\_por + autoría en facturas/movimientos_bancarios), scoping
de empresa en bucket adjuntos.

### Iniciativa B — `rollout-multiempresa` (paraguas, ANTES de la primera página ANSA/COAGAN)

Runbook "alta de empresa" + reducir los 9 touchpoints derivando de
core.empresas; des-dilesaizar components/compras (patrón CxP); extraer
components/cxc; **ADR de centro de costos** (partidas sin proyecto v1 vs
catálogo genérico); RPC oc_crear transaccional; branding/consejo-email desde
core.empresas con fallback que bloquea (SM6); barrido UUIDs + pack de reglas
ESLint (UUIDs literales, Intl.NumberFormat fuera de lib/format, alert/confirm);
secuencia documentada por empresa (para ANSA: decidir primero el contrato con
Business Pro). Convergencia RDB gen-1 → módulos compartidos como fase 2.

### Iniciativa C — `ux-consolidacion` (~1 semana, mayormente mecánico + 1 joya)

**Cmd+K global** (rutas filtradas por RBAC + entidades frecuentes); useUrlFilters
en los 5-6 módulos de más tráfico; cobranza a DataTable; barridos alert()→toast,
pills→Badge, window.confirm→ConfirmDialog; @responsive en las 22; audit-ui.ts
corriendo en CI; a11y nightly con rutas reales; links muertos fuera del sidebar.

### Limpieza (PRs sueltos baratos, sin iniciativa)

Gen-1 erp a `*_deprecated`; shims public+health cerrados; columnas uuid
huérfanas; scripts/ a archive + .pyc; email_miguel.txt fuera; ARCHITECTURE.md
§6/§8; decisión MVs analytics; deps muertas; SCHEMA.md stub; sync-cortes
retirada si está muerta; ADMIN_BYPASS_EMAIL retirado si ya se puede.

### Decisiones que son tuyas (no avanzo sin tu OK)

1. **Aprobar el Sprint 0** (migración de seguridad a prod).
2. **db-backup-strategy**: cerrar alcance v1 — 6 semanas en proposed con
   subledgers financieros y PLD en prod; hoy la única red es el backup Pro de 7 días.
3. **Replantear analytics** (el bloqueo por Cowork ya no puede resolverse).
4. Cuáles de las iniciativas A/B/C promover y en qué orden.
5. ADR de baseline de migraciones (cuándo, no si).

### Qué NO haría ahora

Reescribir god-pages que funcionan; migrar los 57 toasts directos; paginación
big-bang; perseguir los 207 unused indexes; RLS por empresa en Storage con
URL-rewriting (el proxy actual + check de empresa basta). Y no tocaría el patrón
client-side fetching + RPC con gate: para un ERP interno de equipo chico es el
tradeoff correcto — solo hay que terminar de cerrar los gates en DB.

---

_Generado por auditoría ultracode 2026-06-12 (122 agentes, ~11.1M tokens,
54 min). Hallazgos refutados por los verificadores (no incluidos): adopción
"cero" de ModuleHeader (real: 4 usuarios en módulos nuevos), 3 agujeros RBAC
(2 ya cubiertos por permissions-deps.test.ts), CHUNK=500 de Waitry (IDs de 8
chars, no UUIDs — no rompe), asimetría config.toml/db:types (consecuencias no
reproducibles), feature-flags por slug (SM3 los permite y eran type-narrowing)._
