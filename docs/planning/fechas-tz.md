# Iniciativa — Fechas y timezone: erradicar el "hoy UTC" del repo

**Slug:** `fechas-tz`
**Empresas:** Todas (DILESA, ANSA, COAGAN, RDB, SANREN)
**Schemas afectados:** Sin migración de schema en S0-S2. El barrido S1 tocó código TS en `app/**`, `lib/**` y `components/**` (61 ocurrencias en 39 archivos con `new Date().toISOString().slice(0, 10)`); S3 audita datos en `dilesa.venta_fases.fecha`, `dilesa.ruv (fecha_carga)`, `dilesa.anteproyectos (fecha_completada)` y defaults `CURRENT_DATE` en funciones de `erp` (CxP `p_fecha_emision`, `inventario_levantamientos.fecha_programada`).
**Estado:** in_progress
**Próximo hito:** OK de Beto para (a) UPDATE de las 11 fechas +1 en `venta_fases` y (b) migración S4b de defaults `CURRENT_DATE` (gate finanzas-ok)
**Dueño:** Beto
**Creada:** 2026-07-01
**Última actualización:** 2026-07-01

> Detonante: el 30-jun-2026 a las 20:00 (CDT) el resumen diario al consejo de
> DILESA llegó con las ventas acumuladas del mes en **cero**. A esa hora el
> reloj UTC ya estaba en 1-jul 01:00: el corte de mes se calculaba con
> `Date.UTC(getUTCFullYear(), getUTCMonth(), 1)` → `2026-07-01` → el filtro del
> mes no encontró nada. Beto pidió un análisis profundo de fechas en todo el
> repo; el barrido encontró que es un patrón sistémico, no un caso aislado.

## Problema

La operación vive en `America/Matamoros` (frontera, DST real: CST UTC-6
invierno / CDT UTC-5 verano), pero Vercel y Postgres corren en UTC. Entre las
18:00-19:00 locales y la medianoche, **el día/mes UTC ya es el siguiente**.
Todo código que derive "hoy" o "el mes actual" de UTC se desfasa un día en esa
ventana — que es exactamente cuando más se captura (tarde-noche) y cuando
salen los reportes (8PM).

Los helpers correctos **ya existen** (`lib/fecha-mx.ts`: `fechaISOMatamoros`,
`inicioMesMatamoros`; `lib/timezone.ts`; `lib/briefing/fecha.ts`), pero la
adopción es de 3 archivos contra 61 con el antipatrón
`new Date().toISOString().slice(0, 10)` — que devuelve el día UTC **también en
el navegador** (`toISOString` siempre es UTC).

## Outcome

Ningún cálculo de "hoy/este mes" en código de negocio deriva de UTC. Un lint
guard impide que el antipatrón regrese. Los datos históricos con fecha +1 están
detectados y corregidos (o descartados como irrelevantes).

## Alcance

1. **S0 — Hotfix resumen consejo (este PR).** `inicioMes`/`inicio3m`/
   `fechaTituloCST` en `lib/dilesa/resumen-consejo-email.ts` → helpers de
   `fecha-mx.ts`. Tests de regresión con el instante exacto del incidente.
2. **S1 — Server actions y formularios de captura.** Los ~61 archivos, en dos
   olas por riesgo: (a) server actions que escriben directo sin ojo humano
   (`app/dilesa/ruv/actions.ts` `fecha_carga`,
   `app/dilesa/proyectos/anteproyectos/actions.ts` `fecha_completada`); (b)
   defaults de formularios de captura de fases
   (`app/dilesa/ventas/[id]/capturar/*`, `ventas/nueva`, forms de
   notario/valuador por token) donde el operador puede aceptar un default +1
   por la noche.
3. **S2 — Lint guard.** Regla ESLint (`no-restricted-syntax`) que prohíba
   `new Date().toISOString().slice(0, 10)` / `.slice(0, 7)` y
   `toLocaleDateString` sin `timeZone` en `app/**` y `lib/**`, apuntando a
   `fecha-mx.ts`.
4. **S3 — Auditoría de datos históricos.** Detectar fechas +1 ya grabadas:
   filas cuya columna `date` = día UTC de un `created_at` entre 00:00-06:00 UTC
   (ventana donde local ≠ UTC). Tablas: `dilesa.venta_fases`,
   `ruv.fecha_carga`, `anteproyectos.fecha_completada`. Corrección con OK de
   Beto (toca datos de fases → deriva KPIs/reportes).
5. **S4 — Convención DST-real vs offset-fijo.** Decidir y documentar (ADR
   corto o sección en CLAUDE.md): `America/Matamoros` (DST real) como default;
   `Etc/GMT+6` fijo solo donde esté razonado (hold-cola lo documenta;
   Playtomic/RDB es correcto por operación del club). Migrar el cron
   `dilesa-encuestas` a la convención que se decida. Revisar `CURRENT_DATE`
   como default en funciones SQL de CxP.

**Fuera de alcance:** display cosmético (`toLocaleDateString` sin `timeZone`
en componentes client) se arregla oportunista al tocar cada archivo, no como
barrido dedicado. `calendario-habil.ts` (naive-local, hoy solo client) se
documenta en S4, no se reescribe.

## Riesgos

- **S3 toca datos financieros/operativos** (`venta_fases` alimenta KPIs,
  comisiones, reportes al consejo) → cada UPDATE con evidencia y OK explícito.
- Falsos positivos en S3: una captura legítima de madrugada local (00:00-01:00
  CST) también cae en la ventana UTC 06:00-07:00 — el detector usa la ventana
  00:00-06:00 UTC que en local es 18:00-24:00, pero el operador pudo
  genuinamente querer la fecha siguiente en casos de corrección manual.
  Revisión caso por caso, no UPDATE masivo.
- El lint guard (S2) puede tener excepciones legítimas (timestamps UTC
  intencionales, p.ej. `notif_*_at`) → la regla apunta solo al slice de
  fecha-calendario, no a `toISOString()` completo.

## Métricas de éxito

- 0 ocurrencias de `new Date().toISOString().slice(0, 10)` en `app/**`/`lib/**`
  (hoy: 61 archivos).
- Resumen al consejo del último día de mes con acumulado correcto (verificable
  el 31-jul-2026).
- Lint guard activo en CI.

## Decisiones registradas

- **2026-07-01 — El hotfix S0 viaja con la promoción de la iniciativa** en el
  mismo PR: el fix es chico, urgente (el correo de hoy 8PM ya debe salir bien)
  y es el caso testigo del problema que la iniciativa ataca.
- **2026-07-01 — `fechaTituloCST` pasa de offset fijo -6 a TZ real** vía
  `Intl` con `es-MX` (mismo output, DST correcto). Se conserva el nombre
  exportado para no tocar el cron en el hotfix.

## Bitácora

- **2026-07-01 — S3 (auditoría read-only, prod).** Detector: `fecha = día UTC
del created_at` donde `día UTC ≠ día local de Matamoros`. Resultados:
  - `dilesa.venta_fases`: **1,104 filas**, de las cuales **1,093 son el sellado
    masivo del cutover Coda** (11-jun, fase 17, un minuto, `registrado_por`
    null — fecha sintética de sellado grabada 06-12 en vez de 06-11; NO
    contaminan el resumen al consejo, que filtra `posicion in (2, 11)`) y
    **11 son capturas reales nocturnas** con fecha +1 (fases 1/5/9/10/16,
    19-jun a 30-jun), incluida una fase 5 del 30-jun grabada **2026-07-01**
    (cruza el corte de mes). IDs y detalle en la sesión; corrección propuesta:
    `UPDATE ... SET fecha = (created_at AT TIME ZONE 'America/Matamoros')::date`
    sobre los IDs listados — **pendiente OK de Beto**.
  - `dilesa.ruv_frente_documentos` y `dilesa.proyecto_tareas`: 0 filas.
  - `dilesa.venta_encuestas`: 8 filas con `programada_para` +1 (11-jun, mismo
    bulk); ciclo ya consumido → sin acción.
- **2026-07-01 — S4a.** ADR-054 (convención: fecha de negocio =
  `America/Matamoros`; instantes = timestamptz UTC; `Etc/GMT+6` solo
  Playtomic/hold-cola documentados; crons = dos-horas-UTC + guard). Cron
  `dilesa-encuestas` migrado de `Etc/GMT+6` a `hoyISOMatamoros()` (corre
  ~10:00 locales — cero cambio de comportamiento, consistencia). Índice en
  ARCHITECTURE.md §5. S4b (defaults `CURRENT_DATE` → fecha local en ~13
  columnas `date` de `erp`/`dilesa.construccion`) queda propuesto —
  migración toca tablas financieras, gate finanzas-ok, **pendiente OK de
  Beto**.

- **2026-07-01 — Análisis de impacto en flujos externos (pedido de Beto antes
  de S1): Waitry/Playtomic NO se tocan.** (a) El webhook de Waitry
  (`supabase/functions/waitry-webhook`) y el trigger
  `rdb.process_waitry_inbound` convierten los timestamps del payload (vienen
  con `{date, timezone: America/Argentina/Buenos_Aires}`) a `timestamptz` UTC
  correctamente — fix de abril 2026 (`20260410000000_rdb_fix_timestamp_timezone`).
  Almacenan instantes, no fechas calendario. (b) Los pedidos se asignan al
  **corte abierto** (`corte_id` por estado, no por fecha) y `fecha_operativa`
  viene del corte — el día operativo de RDB no depende de matemática de fechas.
  (c) Playtomic: el CSV se interpreta deliberadamente en UTC-6 fijo
  (`parsePlaytomicDate`, así exporta Playtomic Manager) y el edge function
  `playtomic-sync` compensa el DST del API — ambos documentados y correctos.
  (d) Las 31 conversiones `AT TIME ZONE` en vistas SQL usan
  `America/Matamoros`. Residual para S4: tensión teórica de 1 hora (23:00-24:00
  locales en verano) entre cortes Matamoros-DST y datos Playtomic UTC-6 fijo —
  documentar, no corregir. Ninguna de las 61 ocurrencias de S1 está en rutas de
  ingesta externa.
- **2026-07-01 — S1+S2.** Las 61 ocurrencias de
  `new Date().toISOString().slice(0, 10)` (39 archivos) migradas a
  `hoyISOMatamoros()` (helper nuevo en `lib/fecha-mx.ts`). Incluye los
  server-side críticos: `lib/dilesa/captura/marcar-fase.ts` (escribe
  `venta_fases.fecha`), `ruv/actions.ts` (`fecha_carga`),
  `anteproyectos/actions.ts` (`fecha_completada`), `cerrar-fase13`, encuestas
  (`programada_para`). Los timestamps UTC legítimos (`updated_at`,
  `synced_at`, ventanas de sync) quedaron intactos. Guard de lint
  `no-restricted-syntax` en `eslint.config.mjs` contra
  `new Date().toISOString().slice(...)/.split('T')` en `app/**`, `lib/**`,
  `components/**` (tests excluidos); smoke-test verificado.
- **2026-07-01 — Análisis profundo + S0.** Barrido exhaustivo del repo
  (helpers, 61 archivos con "hoy UTC", crons, SQL, inconsistencia
  DST-real/offset-fijo). Causa raíz del acumulado en cero confirmada en
  `resumen-consejo-email.ts:901` (mes UTC). Hotfix aplicado: `inicioMes` →
  `inicioMesMatamoros()`, `inicio3m` sobre fecha local, `fechaTituloCST` con
  TZ real. Tests de regresión con el instante del incidente
  (2026-07-01T01:00:00Z). PR [#1165](https://github.com/beto-sudo/BSOP/pull/1165), mergeado 2026-07-01.
