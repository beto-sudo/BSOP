# Iniciativa — Resumen Diario al Consejo (DILESA)

**Slug:** `dilesa-resumen-consejo`
**Empresas:** DILESA
**Schemas afectados:** `dilesa` (vistas nuevas `v_margen_prototipo`, `v_inventario_prototipo`; lectura de `v_proyecto_avances`, `ventas`, `venta_fase_catalogo`, `v_estimaciones_resumen`, `unidades`, `productos`, `proyectos`), `erp` (`cuentas_bancarias` — captura manual de saldos), `core` (`notification_log` + registry)
**Estado:** in_progress
**Próximo hito:** **CUTOVER hecho** — Sprints 0-2 en prod, `RESUMEN_CONSEJO_LIVE=1` activado, cron enviando a `consejo@dilesa.mx` (L–S 20:00 CST); Coda apagado. Próximo: Beto captura los saldos bancarios reales en la UI de `tesoreria` (los cargados son demo del 3-jun); Fase 2 (CxC/CxP, resumen ejecutivo, alertas) en backlog
**Dueño:** Beto
**Creada:** 2026-06-07
**Última actualización:** 2026-06-07 (**CUTOVER** — Sprints 0-2 en prod: vistas margen/inventario + fix RUV/Seguro (#725), plantilla del correo (#733), cron+envío con fail-safe (#734), rediseño de Contratistas a obra-en-construcción con vista `v_contratista_obra` (#736), layout al original full-width (#738), y UI de captura de saldos `tesoreria` S3 (#739). Correo validado end-to-end con Beto: 7/7 secciones (incl. Bancos con saldos demo de Coda). `RESUMEN_CONSEJO_LIVE=1` activado en Vercel prod → el cron empieza a enviar a `consejo@dilesa.mx` (L–S 20:00 CST, domingo no); Coda apagado por Beto. Pendiente: Beto captura los saldos reales en la UI (los cargados son demo del 3-jun). Mejoras Fase 2 (CxC/CxP, resumen ejecutivo, alertas) en backlog. | promovida a `planned`; mismo día se refinó: RUV/Seguro resuelto (Coda correcto, BSOP tiene el % ÷10 → fix en Sprint 0) y el bloque de bancos pasa a depender del módulo Saldos Bancos de la nueva iniciativa hermana `tesoreria` — el correo espera ese módulo para lanzar los 7 bloques. Paridad 1:1 primero + mejoras en Fase 2; envío a `consejo@dilesa.mx` ~20:00 CST L–S, domingo no.)

## Problema

El cutover de Coda → BSOP para DILESA apaga el doc Coda `dZNxWl_DI2D`,
y con él muere el **automation que manda el correo diario "Resumen Diario
Operación Dilesa 🏘️"** al Consejo (`consejo@dilesa.mx`, remitente
`admin@dilesa.mx`, ~20:10 CST todos los días). Ese correo es la ventana
operativa diaria del Consejo y no puede desaparecer en el cutover.

El correo Coda de referencia (3-jun-2026) tiene **7 bloques**:

1. **Resumen Saldos Bancos** — BBVA Bancomer, BBVA Dólares, Casa de
   Bolsa Finamex, Monex Grupo Financiero — saldo + última actualización.
2. **Resumen Avances Proyectos** — por desarrollo: avance urb/const/vts %,
   lotes/casas por estado, precio m² excedente, ticket promedio,
   inventario en sus distintos estados.
3. **Análisis de Margen** — por prototipo (LDV-RMA … LDLE-ISC): valor
   comercial, costo terreno/urbanización/materiales/MO, registro RUV,
   seguro de calidad, costo total, utilidad, margen %.
4. **Resumen de Inventario por Prototipo** — en construcción / terminado /
   en inventario / asignado / disponible.
5. **Tubería** — funnel de las 17 fases del pipeline: clientes en fase +
   valor de escrituración.
6. **Resumen de Asignaciones y Ventas** — del mes, por prototipo:
   asignaciones + monto, escrituras + monto.
7. **Resumen Operación Contratistas** — casas en construcción (IS / RM),
   tareas terminadas hoy, MO por ejecutar, efectividad histórica, casas
   terminadas últimos 30 días, personal necesario.

## Diagnóstico — disponibilidad en BSOP (verificado contra prod 2026-06-07)

| #   | Bloque Coda                 | Fuente en BSOP                                                                                                                                                                 | Estado                                                                                       |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 2   | Avances Proyectos           | `dilesa.v_proyecto_avances` (27 cols, iniciativa `dilesa-proyectos-paridad-coda`)                                                                                              | ✅ Ya existe                                                                                 |
| 5   | Tubería (pipeline)          | `dilesa.ventas.fase_actual`/`fase_posicion` × `dilesa.venta_fase_catalogo` (las **17 fases son idénticas** a Coda) + `valor_escrituracion`                                     | ✅ Derivable directo (`GROUP BY fase`)                                                       |
| 6   | Asignaciones/Ventas del Mes | `dilesa.ventas` (`fecha_escritura`, `precio_asignacion`, `valor_escrituracion`)                                                                                                | ✅ Derivable (verificado: 1 escritura este mes, coincide con Coda)                           |
| 3   | Análisis de Margen          | `dilesa.productos.*_referencia` (`valor_comercial`, `costo_materiales`, `costo_mo`, `costo_urbanizacion`, `registro_ruv`, `seguro_calidad`) + `dilesa.proyectos.costo_terreno` | 🟡 Data poblada (11/14 prototipos) — falta **ensamblar la vista**                            |
| 4   | Inventario por Prototipo    | `dilesa.unidades` agrupado por `producto_id` (prototipo) × `estado`                                                                                                            | 🟡 Derivable — falta vista de agregación                                                     |
| 7   | Operación Contratistas      | `dilesa.v_estimaciones_resumen` + `contratos_construccion` + `estimacion_tareas`                                                                                               | 🟡 Parcial — montos sí; efectividad/personal/MO-por-ejecutar son fórmulas Coda a reconstruir |
| 1   | Saldos Bancos               | `erp.cuentas_bancarias.saldo_actual`                                                                                                                                           | ❌ **Gap duro** — la tabla está **vacía** (cero cuentas en todo BSOP); sin sync bancario     |

**Hallazgo a reconciliar:** en `dilesa.productos`, `registro_ruv_referencia`
y `seguro_calidad_referencia` están **exactamente 10× por debajo** de Coda
(LDLE-ISC: BSOP $276 / $598 vs Coda $2,760 / $5,980; LDS-RMA: $611.40 /
$1,324.70 vs $6,114 / $13,247). Materiales y MO **sí cuadran**. Impacto en
el margen % es marginal (~$6k sobre casas de $1–3M) pero el número debe
cuadrar con Coda antes de publicar. Reconciliar en Sprint 0.

## Outcome esperado

1. **El correo diario sigue llegando al Consejo** desde BSOP, de lunes a
   sábado ~20:00 CST, con paridad de contenido frente al correo Coda
   (salvo RUV/Seguro reconciliado).
2. **Coda apagado** — el automation del doc Coda se desactiva sin pérdida
   de servicio para el Consejo.
3. **Trazabilidad nativa** — cada envío queda en `core.notification_log`
   con kill-switch runtime (iniciativa `notificaciones-catalogo`), algo
   que Coda nunca dio.

## Decisiones registradas (cierre de alcance v1 con Beto, 2026-06-07)

- **D1 — Bancos vía el módulo Saldos Bancos (iniciativa `tesoreria`).**
  El bloque #1 ya **no** se resuelve con captura mínima interna: lo provee
  el módulo Saldos Bancos de la iniciativa hermana `tesoreria` (captura
  manual con historial, puente hasta `conciliacion-bancaria`). El correo
  lee `erp.v_cuenta_saldo_actual`. Por eso el lanzamiento del correo
  **depende** de `tesoreria` (ver D5).
- **D2 — Paridad primero, mejoras después.** v1 replica 1:1 el correo
  Coda para poder apagar Coda rápido. Las mejoras (resumen ejecutivo,
  CxC/CxP, deep links, split pipeline vivo/histórico, alertas) van a una
  **Fase 2** post-paridad.
- **D3 — Destinatario y horario.** `consejo@dilesa.mx`, ~20:00 CST,
  **lunes a sábado**. **Domingo NO se envía.** Remitente con branding
  DILESA (reusa `lib/juntas/email.ts`).
- **D4 — RUV/Seguro: el bueno es Coda; BSOP tiene el % ÷10.** Confirmado
  con Beto. `registro_ruv = 0.3%` y `seguro_calidad = 0.65%` del valor
  comercial; en `dilesa.productos` quedaron capturados como 0.03% y
  0.065% (punto decimal corrido), de ahí el factor 10 exacto verificado
  en 4 prototipos. Fix en Sprint 0: recalcular ambos con el % correcto
  vía migración, aplicada con OK explícito de Beto (dato de referencia
  que afecta el margen reportado).
- **D5 — El correo espera al módulo Saldos Bancos (paridad total).** Beto
  cambió el D1 original ("lanzar sin bancos"): el correo no se lanza ni se
  apaga Coda hasta tener los 7 bloques, incluyendo bancos vía `tesoreria`.
  Los Sprints 0–1 (vistas margen/inventario + fix RUV/Seguro + plantilla
  de las 6 secciones derivables) avanzan en paralelo; el lanzamiento
  (Sprint 3) espera al módulo.

## Modelo conceptual

### Infraestructura reutilizada (cero invención)

- **Envío:** Resend (`https://api.resend.com/emails`, `RESEND_API_KEY`),
  patrón `sendMinutaEmail` en `lib/juntas/email.ts`.
- **Destinatario + branding:** `CONSEJO_EMAIL_BY_EMPRESA` (ya resuelve
  `consejo@dilesa.mx`) + header/from por `empresa_id`.
- **Cron:** Vercel Cron con `Authorization: Bearer ${CRON_SECRET}`,
  patrón de `app/api/cron/daily-task-summary/route.ts`.
- **Trazabilidad:** `core.notification_log` vía `lib/notifications`
  (registry + kill-switch).

### Vistas nuevas (Sprint 0, DB-puro)

```sql
-- Margen por prototipo (bloque 3)
CREATE VIEW dilesa.v_margen_prototipo WITH (security_invoker = on) AS
SELECT
  pr.id AS prototipo_id,
  pr.empresa_id,
  pr.proyecto_id,
  pr.nombre,
  pr.valor_comercial_referencia                                   AS valor_comercial,
  pj.costo_terreno,
  COALESCE(pr.costo_urbanizacion_referencia, pj.costo_urbanizacion) AS costo_urbanizacion,
  pr.costo_materiales_referencia                                  AS costo_materiales,
  pr.costo_mo_referencia                                          AS costo_mo,
  pr.registro_ruv_referencia                                      AS registro_ruv,
  pr.seguro_calidad_referencia                                    AS seguro_calidad,
  -- costo total = terreno + urb + materiales + mo + ruv + seguro
  (...)                                                           AS costo_total,
  (pr.valor_comercial_referencia - costo_total)                  AS utilidad,
  ROUND(100.0 * utilidad / NULLIF(pr.valor_comercial_referencia,0), 2) AS margen_pct
FROM dilesa.productos pr
JOIN dilesa.proyectos pj ON pj.id = pr.proyecto_id
WHERE pr.deleted_at IS NULL AND pr.valor_comercial_referencia IS NOT NULL;

-- Inventario por prototipo (bloque 4): unidades por prototipo × estado
CREATE VIEW dilesa.v_inventario_prototipo WITH (security_invoker = on) AS
SELECT
  u.producto_id AS prototipo_id,
  u.empresa_id,
  COUNT(*) FILTER (WHERE u.estado = 'en_construccion')                       AS en_construccion,
  COUNT(*) FILTER (WHERE u.estado = 'terminada')                             AS terminado,
  COUNT(*) FILTER (WHERE u.estado IN ('terminada','asignada'))               AS en_inventario,
  COUNT(*) FILTER (WHERE u.estado = 'asignada')                              AS asignado,
  COUNT(*) FILTER (WHERE u.estado = 'terminada' AND NOT u.es_muestra)        AS disponible
FROM dilesa.unidades u
WHERE u.deleted_at IS NULL AND u.producto_id IS NOT NULL
GROUP BY u.producto_id, u.empresa_id;
```

> Las definiciones exactas de `costo_total`/`en_inventario`/`disponible`
> se afinan en Sprint 0 contra los números del correo Coda de referencia
> (los `(...)` arriba son placeholders del planning, no SQL final).

### Las otras 5 secciones — queries directas

- **Avances (2):** `SELECT * FROM dilesa.v_proyecto_avances` join a
  `dilesa.proyectos` por nombre.
- **Tubería (5):** `SELECT fc.nombre, COUNT(v.*), SUM(v.valor_escrituracion)
FROM venta_fase_catalogo fc LEFT JOIN ventas v ON v.fase_posicion = fc.posicion
GROUP BY fc.posicion, fc.nombre ORDER BY fc.posicion`.
- **Asignaciones/Ventas del mes (6):** agregados sobre `dilesa.ventas`
  filtrando por mes (asignación) y `fecha_escritura` (escrituras).
- **Contratistas (7):** `dilesa.v_estimaciones_resumen` + conteos de
  `unidades.estado='en_construccion'` por contratista (binding a confirmar).

### Guard de domingo (robusto a DST)

El cron corre diario en UTC (`0 2 * * *` ≈ 20:00 CST). El handler calcula
el día de la semana en **`America/Matamoros`** (TZ real con DST) al momento
del disparo; si es **domingo**, hace skip + log `skipped:domingo` y no
envía. Calcular el weekday con el TZ real (no hardcodear día UTC) evita el
bug de desfase de día por el offset de 6h. El drift de ±1h por DST en la
hora de envío se acepta en v1.

## Sprints

### Sprint 0 — Vistas de datos + reconciliación (DB-puro)

1. `dilesa.v_margen_prototipo` + `dilesa.v_inventario_prototipo`
   (`security_invoker=on`), afinadas contra los números del correo Coda.
2. Fix RUV/Seguro (D4 cerrada): el bueno es Coda. `registro_ruv = 0.3%`
   y `seguro_calidad = 0.65%` del valor comercial; en `dilesa.productos`
   quedaron a 0.03%/0.065% (÷10). `UPDATE dilesa.productos` recalculando
   ambos con el % correcto, aplicado con OK explícito de Beto.
3. Aplicar vía `supabase db push` tras OK de Beto; regenerar
   `SCHEMA_REF.md` + `types/supabase.ts`.

### Sprint 1 — Plantilla HTML + armado de las 6 secciones derivables

1. `lib/dilesa/resumen-consejo-email.ts` — render HTML (patrón de tablas
   de minutas/estimaciones) + branding DILESA, secciones 2/3/4/5/6/7.
2. Funciones de query por sección + tests unitarios de los agregados
   (tubería, asignaciones del mes, margen, inventario).
3. Modo `TEST_TO` para iterar plantilla sin mandar al Consejo.

### Sprint 2 — Cron + envío + log + bloque de bancos

1. Ruta cron `/api/cron/dilesa-resumen-consejo` (auth Bearer, guard de
   domingo en `America/Matamoros`, `maxDuration`).
2. Bloque #1 (Saldos Bancos) lee `erp.v_cuenta_saldo_actual` del módulo
   Saldos Bancos (iniciativa `tesoreria`), mostrando la antigüedad del
   último snapshot para hacer visible un saldo stale. **Depende de que
   `tesoreria` Sprints 1–3 estén listos** (ver D5).
3. Envío Resend a `consejo@dilesa.mx` + `core.notification_log` +
   registrar slug en el registry de notificaciones.
4. Alta del cron en `vercel.json`.

### Sprint 3 — Cutover + closeout

1. Smoke E2E: enviar a `TEST_TO` y comparar lado a lado con el correo
   Coda del mismo día (los 7 bloques cuadran).
2. Apagar el automation de Coda (`dZNxWl_DI2D`) — **acción de Beto**.
3. Doc breve para operadores (captura diaria de saldos).
4. Closeout + barrido de Reminders.

## Fase 2 (mejoras post-paridad — fuera de v1)

- **Resumen ejecutivo arriba** con deltas del día (ventas/holds nuevos,
  escrituras del día + $, casas terminadas, cobranza del día).
- **Cobranza (CxC) + CxP** — "cobrado hoy / saldo CxC / por pagar CxP"
  desde el subledger ya existente.
- **Split pipeline vivo vs histórico** — hoy "Entregada 1,080 /
  $1,052 M" aplasta el resto.
- **Deep links** a cada módulo BSOP para drill-down.
- **Alertas:** holds por expirar, fases estancadas N días, objetivo
  trimestral vs avance.

## Riesgos

1. **RUV/Seguro 10×** — si no se reconcilia, el margen no cuadra con Coda
   (impacto % marginal pero visible). Mitiga Sprint 0.
2. **Saldos manuales stale** — como Finamex en Coda (sin actualizar desde
   noviembre). Mitiga mostrar "última actualización" en el correo.
3. **Pipeline histórico aplastante** — para paridad v1 se deja igual que
   Coda; el split va a Fase 2.
4. **Contratistas — fórmulas Coda** (efectividad histórica, personal
   necesario) pueden no ser reconstruibles 1:1; v1 entrega los montos y
   conteos derivables, lo demás se evalúa en Sprint 1.
5. **Binding prototipo↔unidad** — `unidades.producto_id` debe resolver al
   prototipo correcto para los bloques 3/4; verificar el join (en el
   sample inicial devolvió `productos` de `erp` nulos, el prototipo vive
   en `dilesa.productos`).
6. **3/14 prototipos sin costo** (Ampliación/Delicias al 0%) — el margen
   muestra "—" para esos; OK.

## Métricas de éxito

- Correo verde 6 días/semana (L–S), 0 domingos, contenido cuadra con Coda.
- Coda automation apagado sin queja del Consejo.
- 100% de envíos trazables en `core.notification_log`.

## Bitácora

- **2026-06-07 (promoción)** — Beto pidió recrear el correo diario del
  Consejo desde BSOP de cara al cutover de Coda-DILESA. Diagnóstico
  contra prod: 5 de 7 bloques reconstruibles hoy (avances ya en
  `v_proyecto_avances`; tubería/asignaciones derivables directo; margen e
  inventario por prototipo con data poblada pero sin vista), 1 parcial
  (contratistas), 1 gap duro (bancos: `erp.cuentas_bancarias` vacía).
  Hallazgo: RUV/Seguro 10× bajo en `dilesa.productos`. Alcance v1 cerrado
  (D1–D3). Iniciativa promovida a `planned`.

## Decisiones registradas

- **2026-06-07 — D1 Bancos manual / D2 Paridad-primero / D3
  consejo@dilesa.mx ~20:00 CST L–S (domingo no).** Ver "Decisiones
  registradas (cierre de alcance v1)" arriba.
