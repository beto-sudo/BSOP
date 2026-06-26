# Iniciativa — Estimaciones de obra → CxP + control de anticipo/retención (DILESA)

**Slug:** `dilesa-obra-estimaciones-cxp`
**Empresas:** DILESA
**Schemas afectados:** `dilesa` (`obra_estimaciones`, `contratos_construccion`: amortización de anticipo, retención acumulada, topes), `erp` (`facturas`/`cxp_pagos` ligas a obra; nuevo/ajuste de RPC de emisión en espera-del-XML), UI en `app/dilesa/construccion/contratos/**` y `components/cxp/**`
**Estado:** in_progress
**Próximo hito:** Sprint 1 **construido** (PR abierto, sin auto-merge por ser migración financiera) — falta aplicar la migración `20260626222108` a prod con OK de Beto + regenerar SCHEMA_REF/types; luego arranca el Sprint 2 (tope duro vs valor del contrato).
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

| #   | Scope                                                                                                                                                                                                                                                                                                                                                                        | Estado       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | **Estimación de obra → CxP "en espera del XML".** Al pasar a CxP, crear la factura en espera (borrador + `obra_estimacion_id`) por el neto, que aparezca en la bandeja de Facturas y se reciba con `cxp_factura_recibir_cfdi` (XML del contratista) igual que los destajos de vivienda. Unificar el auto-match de la bandeja para reconocer ambos orígenes (destajo y obra). | build ✓ (PR) |
| 2   | **Tope duro vs valor del contrato.** Bloquear autorizar/emitir estimaciones cuyo acumulado supere el `valor_total` del contrato; override explícito de Dirección para obra extra, con motivo + audit.                                                                                                                                                                        | pending      |
| 3   | **Amortización automática del anticipo.** Modelar el anticipo como saldo a recuperar; descontar la proporción (`anticipo_pct`) en cada estimación de avance al emitir a CxP; mostrar "anticipo por amortizar" en el estado de cuenta del contrato.                                                                                                                           | pending      |
| 4   | **Retención acumulada + liberación en finiquito.** Contador del fondo de garantía retenido por contrato; paso guiado de liberación en la estimación de finiquito, con su control y audit.                                                                                                                                                                                    | pending      |

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

## Bitácora

- **2026-06-26 — Promovida.** Origen: Beto pide unificar el paso de estimación de obra autorizada → CxP (como vivienda) y endurecer el control de anticipo/retención/tope que hoy es manual. Diagnóstico de gaps en la sesión de cierre del pipeline CxP (ver memoria `reference_dilesa_estimaciones_destajo_cxp`).
- **2026-06-26 — Sprint 1 construido (PR abierto, sin auto-merge).** Espejo verificado del flujo de vivienda contra las defs vivas en prod.
  - **Migración financiera `20260626222108_dilesa_obra_estimacion_cxp_espera.sql`** (3 funciones): (1) nueva `erp.cxp_factura_desde_estimacion_obra_espera` — factura EN ESPERA por el neto (`monto_total − retencion`), con guards de estado/neto/factura-activa/contrato-no-vivienda/D5-factura-total; nace `REVOKE PUBLIC` + `GRANT authenticated` (no propaga el gap anon de las hermanas, fichado en `blindaje-financiero`). (2) `dilesa.obra_estimacion_autorizar` ahora crea el placeholder en el mismo acto de autorizar (solo si neto > 0 y el contrato no opera factura-total; atómico). (3) `erp.cxp_factura_recibir_cfdi` acepta origen `obra_estimacion_id` además de `estimacion_id`.
  - **Código:** `components/dilesa/obra-contrato-detalle.tsx` (botón "Emitir a CxP" → "Enviar a CxP" en espera del XML, RPC nueva); `app/api/[empresa]/cxp/facturas/upload-xml/route.ts` + su test (auto-match de la bandeja reconoce destajo **y** obra, query `.or()`, código de obra = `contrato · etiqueta`); `components/cxp/cxp-facturas-module.tsx` (bandeja "en espera del XML" incluye obra, link al contrato).
  - **Datos:** 275 estimaciones de obra, todas `autorizada`, 0 con retención, 0 facturas en CxP hoy → cambio **go-forward**, no re-procesa lo histórico. Migración construida como archivo; **pendiente aplicar a prod con OK de Beto** (norma de migraciones financieras) + regenerar SCHEMA_REF/types.
