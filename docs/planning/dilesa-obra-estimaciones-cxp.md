# Iniciativa — Estimaciones de obra → CxP + control de anticipo/retención (DILESA)

**Slug:** `dilesa-obra-estimaciones-cxp`
**Empresas:** DILESA
**Schemas afectados:** `dilesa` (`obra_estimaciones`, `contratos_construccion`: amortización de anticipo, retención acumulada, topes), `erp` (`facturas`/`cxp_pagos` ligas a obra; nuevo/ajuste de RPC de emisión en espera-del-XML), UI en `app/dilesa/construccion/contratos/**` y `components/cxp/**`
**Estado:** in_progress
**Próximo hito:** Sprint 3 **construido** (PR abierto, sin auto-merge por ser migración financiera) — falta aplicar la migración `20260627010241` a prod con OK de Beto + regenerar SCHEMA_REF/types; luego arranca el Sprint 4 (retención acumulada + liberación en finiquito).
**Dueño:** Beto
**Creada:** 2026-06-26
**Última actualización:** 2026-06-26

> **Antecedentes (ambas cerradas):** [`dilesa-contratos-estimaciones`](dilesa-contratos-estimaciones.md) dejó el modelo de contratos de obra + ciclo de estimaciones (borrador→autorizada→pagada) + liga básica a CxP + `v_partida_control`. [`dilesa-estimaciones-cxp`](dilesa-estimaciones-cxp.md) llevó los **destajos de vivienda** a CxP con el patrón "factura en espera del XML → subir XML del contratista → por pagar". Esta iniciativa **unifica el flujo de obra con ese patrón** y cierra los controles de pago que hoy son manuales.

## Problema

El control presupuestal de los contratos de obra ya existe (compromiso por partida, devengo por estimación autorizada, control por partida al pagar). Pero quedan dos brechas que hoy dependen de la memoria del capturista, no del sistema:

1. **El paso estimación de obra → CxP es manual e inconsistente con vivienda.** Hoy una estimación autorizada se manda a CxP con "Emitir a CxP" (`erp.cxp_factura_desde_estimacion`), que crea la factura directamente en `por_pagar` sin el folio fiscal real. Los **destajos de vivienda** sí usan el patrón fluido: autorizar crea una factura **en espera del XML** que aparece en la bandeja de CxP, y al subir el XML del contratista pasa a `por_pagar`. Dos modelos mentales distintos para lo mismo.

2. **Tres controles de pago son informativos, no garantizados:**
   - **Tope vs contrato:** se pueden autorizar estimaciones cuyo acumulado **exceda el valor del contrato**; el sistema lo muestra pero no lo impide.
   - **Anticipo sin amortizar:** el anticipo se paga como una estimación, pero **no se descuenta automáticamente** de los avances siguientes. Si se olvida, se paga anticipo + 100% de avances = más que el contrato.
   - **Retención sin acumular/liberar:** se retiene por estimación (queda como saldo de la factura), pero no hay un **contador del fondo de garantía** ni un paso guiado para liberarlo en el finiquito.

## Outcome esperado

- **Un solo patrón de CxP para obra y vivienda.** Una estimación de obra autorizada llega a CxP **en espera del XML**: aparece en la bandeja "Facturas en espera del XML", administración sube el XML del contratista (reusando `cxp_factura_recibir_cfdi`), y pasa a `por_pagar` para programarse/pagarse con el pipeline de 3 etapas ya en prod.
- **El sistema garantiza el control de pago de obra** (server-side, con override de Dirección + audit donde aplique):
  - No se rebasa el valor del contrato sin autorización explícita.
  - El anticipo se amortiza automáticamente conforme se paga el avance.
  - La retención se acumula y se libera de forma guiada en el finiquito.

## Alcance / Sprints

| #   | Scope                                                                                                                                                                                                                                                                                                                                                                        | Estado          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1   | **Estimación de obra → CxP "en espera del XML".** Al pasar a CxP, crear la factura en espera (borrador + `obra_estimacion_id`) por el neto, que aparezca en la bandeja de Facturas y se reciba con `cxp_factura_recibir_cfdi` (XML del contratista) igual que los destajos de vivienda. Unificar el auto-match de la bandeja para reconocer ambos orígenes (destajo y obra). | ✅ prod (#1083) |
| 2   | **Tope duro vs valor del contrato.** Bloquear autorizar/emitir estimaciones cuyo acumulado supere el `valor_total` del contrato; override explícito de Dirección para obra extra, con motivo + audit.                                                                                                                                                                        | ✅ prod (#1087) |
| 3   | **Amortización automática del anticipo.** Modelar el anticipo como saldo a recuperar; descontar la proporción (`anticipo_pct`) en cada estimación de avance al emitir a CxP; mostrar "anticipo por amortizar" en el estado de cuenta del contrato.                                                                                                                           | build ✓ (PR)    |
| 4   | **Retención acumulada + liberación en finiquito.** Contador del fondo de garantía retenido por contrato; paso guiado de liberación en la estimación de finiquito, con su control y audit.                                                                                                                                                                                    | pending         |

> S1 es independiente y de valor inmediato (unifica el flujo). S2-S4 son el endurecimiento del control y comparten las decisiones abiertas de abajo.

## Riesgos / preguntas abiertas

- **Decisión D-a (amortización):** ¿el anticipo se amortiza **lineal** (mismo `anticipo_pct` en cada estimación) o **contra avance** (proporción del avance facturado)? Define la fórmula del Sprint 3.
- **Decisión D-b (dónde bloquea el tope):** ¿el tope vs contrato bloquea al **autorizar** la estimación (devengo) o al **emitir a CxP** (pago)? Recomendación: al autorizar, que es donde nace el compromiso de pago.
- **Decisión D-c (alcance vivienda):** ¿estos controles aplican solo a contratos de obra (urbanización/cabecera/tarea) o también a los de vivienda (`contrato_lotes`)? Hoy vivienda usa destajos por tarea terminada, no estimaciones de avance.
- **Coexistencia de modos de factura:** la iniciativa anterior dejó dos caminos (factura por estimación vs factura **total** del contrato con pagos parciales, D5). El patrón "en espera del XML" debe encajar con ambos o decidir cuál es el canónico para obra.
- **Datos históricos:** 32 contratos + 275 estimaciones migradas (muchas ya autorizadas/pagadas). Los controles nuevos aplican **go-forward**; no deben romper ni re-procesar lo histórico.
- **Migración financiera en prod:** los cambios de RPC tocan autorización/pago de obra. Se construyen como archivo y se aplican con OK explícito de Beto (norma de migraciones financieras).

## Métricas de éxito

- Flujo obra→CxP **idéntico** al de vivienda (un solo patrón, bandeja compartida).
- 0 estimaciones autorizadas que excedan el contrato **sin** override registrado.
- Anticipo **amortizado al 100%** al cerrar el contrato (finiquito) — cuadra contra `anticipo_pct × valor_total`.
- Retención **liberada = retención acumulada** al finiquito (sin sobrantes ni faltantes).

## Decisiones registradas

### 2026-06-26 — Decisiones de Beto (cierran D-a/D-b/D-c) + plan técnico del Sprint 1

**Decisiones:** (a) anticipo se amortiza **lineal** (mismo `anticipo_pct` en cada estimación); (b) el tope vs contrato bloquea **al autorizar** (donde nace el compromiso); (c) **solo obra** por ahora (vivienda sigue con su flujo de destajos).

**Plan técnico del S1 — espejo verificado del flujo de vivienda** (defs leídas en prod 2026-06-26):

1. **Nueva `erp.cxp_factura_desde_estimacion_obra_espera(p_estimacion_id)`** — espejo de `cxp_factura_desde_estimacion_destajo`. Crea la factura **en espera** (`INSERT erp.facturas … estado_cxp='borrador'`, `obra_estimacion_id`, `contrato_id`, `partida_id`, `proveedor_id=contratista`, `total = monto_total − retencion`, sin `uuid_sat`) + audit. Precondición: estimación `autorizada`, neto > 0, sin factura activa, contrato non-vivienda, sin factura TOTAL activa (bloqueo D5).
2. **`dilesa.obra_estimacion_autorizar`** — al autorizar, llamar la función anterior para que la factura en espera **nazca en el mismo acto** (igual que `estimacion_destajo_autorizar` llama a la de destajo). El paso manual "Emitir a CxP" (`cxp_factura_desde_estimacion`, que crea `por_pagar`) se retira del modo por-estimación; queda solo el modo **factura TOTAL** (`cxp_factura_total_contrato`) para contratos que se facturan de una.
3. **`erp.cxp_factura_recibir_cfdi`** — ampliar el guard `IF v_fac.estimacion_id IS NULL THEN RAISE 'no proviene de un destajo'` a aceptar también `obra_estimacion_id` (mensaje genérico "no proviene de un destajo/estimación de obra").
4. **`app/api/[empresa]/cxp/facturas/upload-xml/route.ts`** — `fetchDestajoPlaceholders` debe traer también las facturas en espera de obra (`estado_cxp='borrador'` con `obra_estimacion_id`), resolviendo código vía `dilesa.obra_estimaciones`→`contratos_construccion`. El auto-match por contratista (RFC/nombre, ya robusto a personas duplicadas, #1062) aplica igual.
5. **`components/cxp/cxp-facturas-module.tsx`** — la bandeja "Facturas en espera del XML" (hoy filtra `estado_cxp='borrador' && estimacion_id`) debe incluir también las de obra (`obra_estimacion_id`); el código del destajo se lee del contrato/estimación de obra.

Migración financiera → archivo `db:new`, aplicar con OK de Beto. La amortización lineal (S3) reducirá el `total` de la factura en espera por la parte del anticipo; en S1 el neto es solo `monto_total − retencion`.

### 2026-06-26 — Promoción

- Iniciativa de relevo sobre `dilesa-contratos-estimaciones` (done) y `dilesa-estimaciones-cxp` (done, vivienda). **Reusa** el patrón "en espera del XML" + `cxp_factura_recibir_cfdi` + la bandeja de Facturas ya en prod, en vez de inventar un camino nuevo para obra.
- El control de pago debe vivir en el **servidor** (RPC/trigger), no solo en la capa app (hoy `v_partida_control` y `armarControlPorPartida` son informativos). Override de Dirección donde el negocio lo requiera (obra extra), siempre con audit.

### 2026-06-26 — Plan técnico del Sprint 2 (tope duro vs contrato)

**Fórmula del tope (verificada contra datos de prod).** Se mide sobre el **devengado neto** = Σ `monto_total` de estimaciones autorizadas+pagadas (incluye el anticipo, resta amortizaciones negativas) — la misma definición de `deriveEstadoCuenta` y lo que la UI muestra como "Por devengar". Bloquea al autorizar si `devengado_actual + monto_estimación > valor_total + 1` (epsilon de 1 peso por redondeo). **Por qué sobre el devengado y no sobre los avances solos:** en prod el anticipo NO es doble conteo — anticipo + avances ≈ valor_total (las amortizaciones casi nunca se capturan: 18/20 contratos con anticipo sin amortizar). Medir sobre avances solos daría falsos negativos.

**Reglas:** (a) solo bloquean estimaciones **positivas** (las negativas/amortizaciones reducen el devengo); (b) contratos con `valor_total <= 0` se **eximen** (sin valor capturado — 1 hoy); (c) **override = Dirección + motivo**: la función ya gatea `fn_es_direccion`, así que no añade gate nuevo; el motivo (obra extra) se persiste en `dilesa.obra_estimaciones.tope_override_motivo` (visible inline con badge "obra extra") + `audit_log` con los montos; (d) **go-forward**: las 275 históricas no se re-autorizan; los 8 que ya exceden (7 por anticipo, 1 por `valor_total=0`) se quedan.

**Técnico:** la firma de `obra_estimacion_autorizar` cambia `(uuid)` → `(uuid, text)` (DROP+CREATE, re-grant authenticated+service_role sin PUBLIC). Helper puro `excedeTopeContrato` (espejo del guard, testeado) para que el front pida el override antes de llamar; la RPC re-valida server-side.

### 2026-06-26 — Decisión de Beto + plan técnico del Sprint 3 (amortización del anticipo)

**Decisión de Beto (cierra el modelo de facturación):** el contratista factura el avance **NETO** del anticipo amortizado ("Neto en la factura"). El operador captura el avance **bruto**; el sistema calcula la amortización y la factura/pago nacen netas. (Se descartó "Bruto + descuento al pagar" — más fiel a obra pública pero exige un mecanismo de aplicar-anticipo-contra-saldo; los datos además mostraban captura bruto + negativa, que esto reemplaza.)

**Fórmula (D-a, lineal):** `amortizacion = LEAST(round(anticipo_pct × monto, 2), anticipo_pendiente, monto)`, congelada en `dilesa.obra_estimaciones.amortizacion_aplicada` **al autorizar**. `anticipo_pendiente = anticipo_entregado − ya_amortizado`, donde `ya_amortizado` = amortización automática previa **+ negativas manuales históricas** (no duplica en los 2 contratos que las usan). Solo avances **positivos** que **no** sean el anticipo; contratos con `anticipo_pct > 0` y anticipo entregado. Validado en prod: 60%/50%/30% se aplican bien y el caso ya sobre-amortizado (I65) da 0.

**Neto a CxP** (factura en espera + pago) = `monto − retención − amortizacion_aplicada`. El **tope del S2 se ajusta** a medir el **devengado neto** (`Σ monto − Σ amortizacion_aplicada`) para que siga cuadrando ≈ `valor_total` ahora que la amortización es columna y no estimación negativa. `deriveEstadoCuenta`: devengado neto + "anticipo por amortizar" baja con la automática.

**Go-forward:** `amortizacion_aplicada` nace en 0 → lo histórico no cambia (el tope da idéntico a hoy); las negativas manuales se respetan y cuentan como ya-amortizado.

## Bitácora

- **2026-06-26 — Promovida.** Origen: Beto pide unificar el paso de estimación de obra autorizada → CxP (como vivienda) y endurecer el control de anticipo/retención/tope que hoy es manual. Diagnóstico de gaps en la sesión de cierre del pipeline CxP (ver memoria `reference_dilesa_estimaciones_destajo_cxp`).
- **2026-06-26 — Sprint 1 construido (PR abierto, sin auto-merge).** Espejo verificado del flujo de vivienda contra las defs vivas en prod.
  - **Migración financiera `20260626222108_dilesa_obra_estimacion_cxp_espera.sql`** (3 funciones): (1) nueva `erp.cxp_factura_desde_estimacion_obra_espera` — factura EN ESPERA por el neto (`monto_total − retencion`), con guards de estado/neto/factura-activa/contrato-no-vivienda/D5-factura-total; nace `REVOKE PUBLIC` + `GRANT authenticated` (no propaga el gap anon de las hermanas, fichado en `blindaje-financiero`). (2) `dilesa.obra_estimacion_autorizar` ahora crea el placeholder en el mismo acto de autorizar (solo si neto > 0 y el contrato no opera factura-total; atómico). (3) `erp.cxp_factura_recibir_cfdi` acepta origen `obra_estimacion_id` además de `estimacion_id`.
  - **Código:** `components/dilesa/obra-contrato-detalle.tsx` (botón "Emitir a CxP" → "Enviar a CxP" en espera del XML, RPC nueva); `app/api/[empresa]/cxp/facturas/upload-xml/route.ts` + su test (auto-match de la bandeja reconoce destajo **y** obra, query `.or()`, código de obra = `contrato · etiqueta`); `components/cxp/cxp-facturas-module.tsx` (bandeja "en espera del XML" incluye obra, link al contrato).
  - **Datos:** 275 estimaciones de obra, todas `autorizada`, 0 con retención, 0 facturas en CxP hoy → cambio **go-forward**, no re-procesa lo histórico.
- **2026-06-26 — Sprint 1 en prod (PR #1083 mergeado).** Beto dio OK; migración `20260626222108` aplicada por MCP, las 3 funciones verificadas en prod (la nueva quedó sin PUBLIC). Ledger reconciliado con `migration repair` (archivo `…222108` applied, huérfano del MCP `…230427` reverted; `migration list` 1:1). `types/supabase.ts` regenerado (RPC nueva); `SCHEMA_REF.md` sin cambios sustanciales (la migración solo tocó funciones). CI verde, auto-merge. **Siguiente: Sprint 2** (tope duro vs valor del contrato).
- **2026-06-26 — Sprint 2 construido (PR abierto, sin auto-merge).** Tope duro vs valor del contrato (decisión D-b: al autorizar).
  - **Migración financiera `20260626232311_dilesa_obra_estimacion_tope_contrato.sql`**: columna `dilesa.obra_estimaciones.tope_override_motivo` + `obra_estimacion_autorizar(uuid, text)` (DROP+CREATE) con el tope al autorizar (devengado neto vs `valor_total`, epsilon 1 peso, eximiendo `valor_total<=0` y estimaciones no-positivas) + override de Dirección (motivo persistido + audit con `devengado_resultante`/`valor_total`). Preserva el puente CxP del S1.
  - **Código:** helper puro `excedeTopeContrato` + 6 tests (`lib/dilesa/contratos-estado-cuenta`); `obra-contrato-detalle.tsx` (detecta el exceso → diálogo de override con motivo, badge "obra extra" en la fila); `cancelar-con-motivo-dialog.tsx` generalizado (`confirmVariant`/`submittingLabel`, defaults preservan cancelaciones) + su test actualizado.
  - **Datos (prod):** 33 contratos no-vivienda, 8 ya exceden (7 por anticipo no amortizado, 1 por `valor_total=0`). Go-forward. Pendiente aplicar la migración a prod con OK de Beto + regenerar SCHEMA_REF/types.
- **2026-06-26 — Sprint 2 en prod (PR #1087 mergeado).** Beto dio OK; migración `20260626232311` aplicada por MCP — columna `tope_override_motivo` + `obra_estimacion_autorizar(uuid, text)` verificadas en prod (función sin PUBLIC; firma vieja `(uuid)` dropeada). Ledger reconciliado (`…232311` applied, huérfano del MCP `…234555` reverted; `migration list` 1:1). SCHEMA_REF (columna nueva) + `types/supabase.ts` (firma nueva) regenerados y commiteados. CI verde, auto-merge. **Siguiente: Sprint 3** (amortización lineal del anticipo).
- **2026-06-27 — Sprint 3 construido (PR abierto, sin auto-merge).** Amortización lineal del anticipo (decisión Beto: contratista factura el avance NETO).
  - **Migración financiera `20260627010241_dilesa_obra_amortizacion_anticipo.sql`**: columna `dilesa.obra_estimaciones.amortizacion_aplicada` + 3 funciones tocadas — `obra_estimacion_autorizar` (calcula la amortización al autorizar `LEAST(anticipo_pct×monto, pendiente, monto)` + tope ahora sobre el **devengado neto**), `cxp_factura_desde_estimacion_obra_espera` y `cxp_pago_desde_estimacion` (neto = `monto − retención − amortización`).
  - **Código:** `deriveEstadoCuenta` cuenta la amortización automática (devengado neto + anticipo por amortizar) + 2 tests; `obra-contrato-detalle.tsx` (carga/muestra la amortización en la fila, neto del botón "Programar pago", nota del form actualizada — ya no se captura negativa a mano).
  - **Validado en prod (read-only, antes de aplicar):** la fórmula da 60%/50%/30% correcto y **0 para el contrato ya sobre-amortizado** (I65) — el tope al pendiente evita doble amortización. Solo 2 contratos usan negativas manuales (se respetan). Go-forward: `amortizacion_aplicada=0` en lo histórico → el tope da idéntico a hoy. Pendiente aplicar a prod con OK de Beto + regenerar SCHEMA_REF/types.
