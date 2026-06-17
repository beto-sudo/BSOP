# Iniciativa — Cuadratura del sobreprecio y cheque a notaría (DILESA)

**Slug:** `dilesa-cuadratura-sobreprecio`
**Empresas:** DILESA
**Schemas afectados:** principalmente lógica en `lib/dilesa/cuadratura.ts` (motor puro) + UI `components/dilesa/cuadratura-panel.tsx` y armado de inputs en `app/dilesa/ventas/[id]/page.tsx`. Lectura de `dilesa` (`ventas` incl. `desglose_precio`, `tipos_credito`, `productos.valor_comercial_referencia`, `unidades`) y `erp` (`cxc_pagos` como depósitos). Posible saneamiento de datos legacy en `dilesa.ventas.descuento_total`. Sin schema nuevo previsto en v1.
**Estado:** proposed
**Próximo hito:** Beto decide D1–D4 (modelo del excedente, semántica del cheque pre-F11, saneamiento del descuento legacy, alcance v1) → arrancar Sprint 1 (ajustes seguros de presentación, sin tocar el saldo)
**Dueño:** Beto
**Creada:** 2026-06-17
**Última actualización:** 2026-06-17 (promovida tras el análisis multi-agente detonado por la venta MAYRA)

> Detonante operativo: la venta **MAYRA ALEJANDRA GOMEZ TERRAZAS** (FOVISSSTE Tradicional) se regresó de fase buscando "capturar un pagaré para cuadrar". El pagaré era una pista falsa (ver [PR #927](https://github.com/beto-sudo/BSOP/pull/927), chip fantasma); el problema de fondo es que la **cuadratura no refleja bien el modelo de sobreprecio**. Modelo confirmado en memoria `reference_dilesa_sobreprecio_cheque_notaria`. Hermana de las iniciativas de cuadratura previas (ver `reference_dilesa_cuadratura_valor_facturado`, `reference_dilesa_cuadratura_saldo_efectivo`).

## Problema

DILESA usa un **sobreprecio** para que el crédito hipotecario fondee los gastos de escrituración del cliente. El motor de cuadratura (`lib/dilesa/cuadratura.ts`, réplica del modelo de Coda) no representa bien ese mecanismo, y eso produce dos síntomas:

1. **Derivados absurdos antes de escriturar (bug real, acotado).** El cheque a notaría se captura hasta la **fase 11 (Escriturada)**. Antes de eso, el motor cae a un `chequeNotariaCalculado = min(gastosNetos, excedenteDisponible)` ([`cuadratura.ts:226`](../../lib/dilesa/cuadratura.ts)). Cuando el crédito ≈ valor de escrituración (el caso normal de FOVISSSTE, porque el sobreprecio está embebido en ambos y se cancela en `montoDisponible − valorEscrituracion`), el excedente colapsa y los derivados que dependen del cheque salen sin sentido: en MAYRA, `valorRealVentaDilesa = −39,651` y `montoNotaCredito = 1,018,721`. Eso es lo que el operador ve "descuadrado".

2. **El sobreprecio no aparece como fuente de fondeo (tensión de modelo, decisión de negocio).** La cuadratura toma `valor_escrituracion` (que **ya incluye** el sobreprecio +6%) como el valor a cubrir. Como el crédito también lo incluye, el sobreprecio (~59k en MAYRA) se cancela y no se contabiliza como el dinero del que realmente sale el cheque a notaría. Económicamente el sobreprecio sí paga los gastos; el motor no lo refleja, así que proyecta faltantes donde no necesariamente los hay.

Además, el análisis empírico (230 ventas escrituradas con cheque > 0) mostró un **descuadre multifactorial**: datos legacy de Coda contaminan (descuento "15,000 plano" en ~129/230, outliers de captura), y no hay distinción entre "enganche a la unidad" y "aportación del cliente a gastos" (ambos llegan como `cxc_pagos.fuente='cliente'` y pueden contarse dos veces). **Ningún ajuste de fórmula único cierra todo**: hay que separar bug, gap de modelo y dato malo.

## Modelo confirmado (validado contra prod, 2026-06-17)

- **Sobreprecio (+6%)** vive **dentro del precio** vía `fn_calcular_precio_venta` (= `productos.valor_comercial_referencia × costo_venta_adicional_pct`), inflando `precio_asignacion` y `valor_escrituracion` a la vez. Tipos con +6%: **Fovissste Tradicional, Fovissste para Todos, IMSS, Infonavit/Fovissste**. Snapshot en `dilesa.ventas.desglose_precio`.
- **Cheque a notaría = `gastos_escrituracion − apoyo_infonavit`** (~92% de los casos). `apoyo_infonavit_monto` = 30,000 solo en los 3 Infonavit; FOVISSSTE/IMSS = 0 → cheque = gastos completos. El "patrón cheque ≈ gastos − 30k" es el **apoyo del INFONAVIT, no aporte del cliente**.
- Sobreprecio y apoyo son **mutuamente excluyentes** por tipo de crédito.
- **MAYRA:** el sobreprecio SÍ está aplicado (`desglose_precio = {920000, 979070}`, +6.42%). No es dato faltante. El descuadre es el bug de presentación (#1) + un posible faltante real al girar el cheque (gastos 84,038 vs excedente de depósitos+descuento ~74,651), sensible a cuánto del descuento de 39,651 es real vs legacy.

## Outcome esperado

1. La cuadratura **deja de mostrar números absurdos** antes de escriturar (los derivados pendientes del cheque se marcan "estimado / pendiente de escriturar", no se inventan).
2. Cuando el sobreprecio no alcanza a fondear los gastos, el sistema lo **señala como alerta accionable** ("faltan $X o falta documentar descuento"), no como un derivado sin sentido.
3. El modelo de cuadratura **reconoce explícitamente el sobreprecio** como fuente de fondeo de gastos (decisión de Beto sobre la fórmula).
4. Los datos legacy que contaminan el cuadre (descuento plano de Coda, outliers) quedan **identificados y saneables** caso por caso, sin romper las ventas que hoy cuadran.

## Alcance

**Dentro (v1, propuesto):**

- Ajustes seguros de **presentación** en el motor + panel: no derivar `valorRealVentaDilesa`/`montoNotaCredito`/`descuentoReal` del cheque calculado cuando `monto_cheque_notaria` es null (marcar estimado/null); bandera `gastosNoFondeados` cuando el excedente no cubre los gastos. No tocan `saldoCliente`/`cubierta`.
- Tests del motor para los huecos: cheque null, `excedente < gastosNetos`.

**Dentro (v2, requiere decisión de negocio):**

- Reformular de dónde sale el dinero del cheque (¿medir excedente contra `valor_comercial` en vez de `valor_escrituracion`?). Candidato a **ADR** (cruza el modelo financiero de toda venta).
- Distinguir "enganche a la unidad" vs "aportación a gastos" en `cxc_pagos` (gap de modelo de datos — alto riesgo, ver Riesgos).

**Fuera / aparte:**

- Saneamiento masivo de datos legacy de Coda (descuento plano). Es limpieza de datos con OK caso por caso, no código de este módulo.

## Decisiones pendientes (Beto)

- **D1 — Modelo del excedente:** ¿la cuadratura debe reconocer el sobreprecio embebido como fuente de fondeo de gastos (excedente contra `valor_comercial`), o se mantiene contra `valor_escrituracion`?
- **D2 — Cheque pre-F11:** ¿el cheque proyectado antes de escriturar se asume optimista (`gastos − apoyo`) o se deja capeado al excedente (muestra faltante)? (El Ajuste 2 hace esta decisión menos urgente: la bandera surface el faltante de cualquier modo.)
- **D3 — Aportación del cliente a gastos:** ¿se captura por separado del enganche? (raíz del posible doble conteo).
- **D4 — Descuento legacy "15,000 plano":** ¿se sanea el dato de Coda o se deja y solo se documenta?
- **MAYRA puntual:** ¿el crédito FOVISSSTE autorizado fue 979,070 (operación no cuadra del todo, faltan ~9,387) o el descuento de 39,651 es real y cubre la diferencia? Requiere ver la autorización del crédito; no es inferible desde la DB.

## Riesgos

- **Tocar el saldo rompe ventas que hoy cuadran.** Validado: quitar el depósito-cliente del disponible rompería decenas de ventas correctas. Cualquier cambio a `saldoCliente`/`cubierta` exige verificación adversarial contra las ~230 escrituradas antes de mergear. Los ajustes v1 evitan esto por diseño (solo presentación).
- **Números macro no confiables aún.** Los conteos agregados de "cuántas cuadran" salieron inconsistentes entre agentes (confusión `saldoCobranza` vs `saldoCliente`). Antes de cualquier saneamiento masivo hace falta una pasada de medición cuidadosa con la definición exacta del motor.
- **Modelo financiero sensible.** Cambios al motor afectan correo al Consejo, copiloto de cierre y nota de crédito. Regla dura: nada de cambios financieros sin confirmación explícita de Beto.

## Métricas de éxito

- 0 ventas mostrando derivados absurdos (valor real negativo / NC inflada) antes de escriturar.
- Toda venta con sobreprecio insuficiente muestra una alerta accionable cuantificada, no un número sin sentido.
- Las ventas que hoy cuadran siguen cuadrando tras cada ajuste (verificación adversarial verde).

## Sprints / hitos (propuestos)

- **Sprint 0 — Decisiones (Beto):** resolver D1–D4 + el caso MAYRA. Bloqueante de todo lo demás.
- **Sprint 1 — Ajustes seguros (presentación):** derivados estimados/null pre-F11 + bandera `gastosNoFondeados` + tests. Sin tocar el saldo. (Listo para arrancar apenas Beto fije alcance v1.)
- **Sprint 2 — Medición confiable:** reproducir el cuadre con la definición exacta del motor sobre las 230 escrituradas; caracterizar cuántas descuadran y por qué (bug vs gap vs dato).
- **Sprint 3 — Modelo del excedente (si D1 lo pide):** ADR + reformular el fondeo del cheque; verificación adversarial obligatoria.
- **Sprint 4 — Saneamiento de datos legacy (si D4 lo pide):** limpieza del descuento plano caso por caso con OK de Beto.

## Bitácora

- **2026-06-17** — Promovida. Detonante: venta MAYRA. Análisis multi-agente (workflow `dilesa-cuadratura-sobreprecio`, 7 agentes + verificación adversarial) confirmó el modelo de sobreprecio/cheque y corrigió la hipótesis inicial (el +6% sí está aplicado en MAYRA; no era dato faltante). En paralelo se entregó [PR #927](https://github.com/beto-sudo/BSOP/pull/927) (chip "Pagaré" fantasma + rol del pagaré en fase 10), que resolvió la confusión que originó el reporte. Modelo guardado en memoria `reference_dilesa_sobreprecio_cheque_notaria`.

## Decisiones registradas

- **2026-06-17** — El descuadre es **multifactorial**; v1 se limita a ajustes de **presentación** (no tocar `saldoCliente`/`cubierta`) porque cualquier cambio al saldo rompe ventas que hoy cuadran. El cambio del modelo del excedente (D1) se trata como v2 con ADR, no se mete a la fuerza en v1.
