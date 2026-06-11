# Iniciativa — Compras centralizadas (Procure-to-Pay) DILESA

**Slug:** `dilesa-compras`
**Empresas:** DILESA (golden); componente compartido pensado para rollout a las 5 empresas
**Schemas afectados:** `erp` (catálogo de conceptos nuevo, cotizaciones/RFQ nuevas, binding `partida_id` en líneas de compra, posible generalización del presupuesto), `dilesa` (`proyecto_presupuesto_partidas`, integración con el checklist de anteproyecto), `core.modulos` (sub-slugs RBAC del módulo nuevo)
**Estado:** done
**Próximo hito:** — (cerrada 2026-06-08)
**Dueño:** Beto
**Creada:** 2026-06-04
**Última actualización:** 2026-06-08 (**cerrada** — ciclo procure-to-pay completo en prod, círculo P2P de DILESA cerrado)

## Problema

El ciclo de compras de DILESA vive **regado** en varios lados y sin un hilo
que lo conecte de punta a punta:

- El **ciclo procure-to-pay completo ya existe en `erp.*`** (requisiciones,
  órdenes de compra, recepción state-based, facturas/CxP, pagos), pero DILESA
  solo tiene cableada **la cola** (`/dilesa/cxp` — factura → pago). Le falta
  toda **la cabeza**: requisición → cotización → OC → recepción.
- El **presupuesto por partidas del proyecto**
  ([`dilesa.proyecto_presupuesto_partidas`](../../supabase/SCHEMA_REF.md))
  tiene `monto_estimado`, `monto_aprobado` y `monto_ejercido`, pero
  **`monto_ejercido` nunca se llena** (default 0, sin trigger, sin FK a
  factura/OC/pago). No hay forma automática de saber cuánto se lleva gastado
  contra lo presupuestado de un concepto.
- El **checklist del anteproyecto** captura cotización·factura·pago **a mano**
  en `proyecto_tarea_pasos`, sin ligarse a compras reales (compras "de
  mentiritas" para el gate de decisión).
- **Nadie tiene cotización formal** (RFQ multi-proveedor): la elección de
  proveedor es informal/externa (email, Excel, Coda).
- Parte del control de obra todavía vive en **Excel por proyecto** (RESUMEN de
  LDLE/LDS con Etapa·Concepto·Proveedor·Factura·Orden — ver
  `dilesa-contratos-obra`).

Resultado: no hay una sola verdad de "qué compré, a quién, contra qué
presupuesto, cuánto va comprometido vs ejercido vs pagado".

## Outcome esperado

1. **Un módulo Compras en DILESA** (`/dilesa/compras`) que recorre el ciclo
   completo de forma lineal e intuitiva: requisición → **cotización (RFQ)** →
   OC → recepción → factura → pago, cada paso engendrando el siguiente con un
   clic, reusando el `erp.*` que ya existe.
2. **Control presupuestal en 3 capas** por concepto: comprometido (al emitir
   OC) → ejercido (al recibir/facturar) → pagado (al pagar), con
   `disponible = aprobado − comprometido` recalculado en vivo. Cierra el hueco
   de `monto_ejercido`.
3. **Cotización formal multi-proveedor**: de un requerimiento se cotiza a N
   proveedores, se comparan lado a lado, se adjudica y se genera la OC — con
   audit trail de "¿por qué a este proveedor?".
4. **Binding opcional a presupuesto**: cada compra puede colgar de una partida
   de un proyecto/anteproyecto (se descuenta automático) **o** ser gasto suelto
   sin proyecto (fluye igual). Cubre ambos casos que Beto pidió explícitamente.
5. **Catálogo de conceptos canónico** de obra, reutilizable entre proyectos,
   que permita comparar costos entre desarrollos y automatizar clasificación.
6. **Checklist de anteproyecto integrado**: sus pasos de cotización/factura/pago
   consumen el módulo real desde el día 1 del proyecto; al promover el
   anteproyecto a desarrollo, la historia de compra viaja con él.

## Decisiones registradas

> Cerradas con Beto el 2026-06-04 en la sesión de promoción.

- **D1 — Control en 3 capas (comprometido → ejercido → pagado).** El disponible
  del concepto se actualiza al emitir la OC (comprometido), al recibir/facturar
  (ejercido) y al pagar (pagado). Implementación: **vista derivada**
  (`v_partida_control`) que suma los documentos ligados, **no** columnas
  físicas mantenidas por triggers frágiles. `disponible = aprobado − comprometido`
  (política conservadora; no permite sobre-comprometer sin alerta).
- **D2 — Cotización formal RFQ multi-proveedor.** Tabla(s) nuevas en `erp`;
  comparativa lado a lado por línea; adjudicación genera OC heredando todo.
- **D3 — Catálogo de conceptos jerárquico canónico** (capítulo → partida →
  concepto), reutilizable entre proyectos.
- **D4 — DILESA golden + componente compartido.** Se construye en
  `components/compras/` reusando el patrón RDB/CxP y se enciende en DILESA
  primero. RDB **no se toca en v1** (su `/rdb/ordenes-compra`, etc. siguen
  intactos); su migración al compartido es backlog.
- **D5 — Seed del catálogo desde la taxonomía de obra que ya está en DB**
  (`dilesa.obra_presupuesto`: `etapa` + `concepto`, con datos reales
  traspasados de los Excel LDLE/LDS), normalizado en taller con Beto.
- **D6 — Checklist de anteproyecto integrado en v1.** Los pasos
  cotización·factura·pago del checklist consumen el módulo de compras real
  (una cotización del checklist _es_ una cotización del módulo), ligada a la
  partida preliminar del presupuesto del anteproyecto.
- **D7 — Enfoque constructora, no restaurante.** Lo que se comparta con RDB
  debe ser constructora-first. La línea de compra se ancla a **concepto +
  partida de presupuesto**, NO a `producto_id`/almacén (en obra se compra
  concreto/varilla/servicios que van directo a la obra, sin stock). La
  **recepción en DILESA devenga contra la partida**, no mueve inventario por
  default. El **catálogo de conceptos de obra es separado** del catálogo de
  productos de RDB. Al extraer el componente compartido se abstrae el "destino
  de la recepción" (inventario en RDB vs cargo a concepto en DILESA) sin
  arrastrar suposiciones de restaurante.
- **D8 — Construcción/contratistas queda intacto y separado.** El canal de
  estimaciones de contratistas → CxP (ADR-039, `erp.facturas.obra_estimacion_id`)
  **no se absorbe** en compras. Compras = materiales/servicios de proveedores;
  contratistas = mano de obra. Coexisten; ambos desembocan en CxP/`erp.facturas`.
- **D9 — Cross-schema presupuesto ↔ compras (a resolver en ADR-040, Sprint 0).**
  `erp.*` es genérico y el presupuesto por partidas hoy vive en `dilesa.*`. Un
  FK `erp → dilesa` acopla el schema genérico a uno de empresa. **Dirección
  propuesta:** generalizar el modelo de presupuesto a `erp` (p. ej.
  `erp.presupuestos` / `erp.presupuesto_partidas`) para que compras ligue
  limpio, migrando con cuidado lo que creó `dilesa-proyectos-anteproyectos`.
  **Alternativa:** puente polimórfico en `dilesa` (mantiene `erp` puro). Se
  decide en el ADR antes de tocar schema.
- **D10 — UI = hub `/dilesa/compras` con tabs routed (ADR-030)**, NO 3 módulos
  separados (cerrada 2026-06-05). Consistente con Ventas/Construcción. Sub-slugs:
  umbrella `dilesa.compras` + `dilesa.compras.requisiciones` /
  `dilesa.compras.ordenes` / `dilesa.compras.recepciones`. Proveedores se queda
  como entry aparte en la sección Compras.
- **D11 — Recepción ligera, sin documento formal** (cerrada 2026-06-05). Recibir
  contra la partida = `UPDATE ordenes_compra_detalle.cantidad_recibida` (eso
  alimenta `ejercido` en `v_partida_control`), SIN encabezado folio/fecha/firma y
  SIN tocar inventario. Las tablas `erp.recepciones`/`recepciones_detalle` (hoy
  vacías, no usadas por RDB) NO se adoptan en v1. Subir a documento formal queda
  como salida futura si obra lo pide.
- **D12 — Siempre hay partida** (cerrada 2026-06-05). Toda línea de
  requisición/OC se ancla a una partida existente del presupuesto del proyecto;
  si falta, se crea primero en Costeo. NO se agrega `concepto_id` a los detalles
  (el concepto se alcanza vía `partida_id → presupuesto_partidas.concepto_id`).
  El control de 3 capas siempre cuadra.
- **D13 — RPC de recepción nueva, no branch en la de RDB** (cerrada 2026-06-05).
  `oc_recibir_linea` mueve inventario de RDB en prod; en vez de meterle un branch
  riesgoso, se crea `erp.oc_recibir_linea_partida` (mismos guards de
  permiso/estado/cantidad, pero solo actualiza `cantidad_recibida` + recalcula
  estado + audit; cero inventario). Aísla el riesgo a RDB.
- **D14 — `ejercido` cuenta gastos directos (factura con partida sin OC)**
  (cerrada 2026-06-05, **ADR-041**). Para registrar gastos autorizados/pagados
  **fuera del proceso** requisición→OC, `v_partida_control.ejercido` pasa al
  **modelo híbrido**: `Σ recibido de OC + Σ facturas de egreso con partida y SIN
OC`. La condición `orden_compra_id IS NULL` evita el doble conteo (la factura
  de una OC ya se devengó vía su recepción). Un gasto directo se registra como
  **factura ligada a la partida (sin OC) + su pago en CxP** y fluye
  `ejercido → pagado`. No afecta RDB (la vista solo vive sobre el presupuesto de
  obra) ni el 3-way match de `cxp` (que aplica a facturas con OC). La UI para
  asignar `partida_id` a la factura va en el drawer de CxP (Fase 2, aditivo
  DILESA-first). Cruza `dilesa-compras` ∩ `cxp` (R2).
- **D15 — El contrato de obra compromete una partida (1:1)** (cerrada 2026-06-05,
  **ADR-042**). El contrato de obra es a la mano de obra lo que la OC es a los
  materiales: ambos comprometen una partida. Cada contrato se liga a **una sola**
  partida (`dilesa.contratos_construccion.partida_id` nuevo, FK → `erp.presupuesto_partidas`);
  su `valor_total` entra al `comprometido` de `v_partida_control` (Σ OC + Σ
  contratos). Las estimaciones → factura **heredan la partida del contrato** y
  ejercen/pagan por el modelo híbrido (ADR-041). El contrato se origina **desde el
  presupuesto** (selector de partida en su alta). Cierra el outcome #2 (control de
  3 capas de **todo** el gasto: compras + mano de obra). Cruza `dilesa-compras` ∩
  `dilesa-contratos-obra` ∩ `cxp`. Ejecución por sprint (DB → UI alta → emisión a
  CxP con `partida_id`, que cierra también el pendiente de ADR-039).

## Alcance v1

**Entra:**

- Catálogo de conceptos jerárquico (`erp.conceptos_compra` con `padre_id`),
  sembrado y normalizado desde `dilesa.obra_presupuesto`.
- Binding `partida_id` opcional en líneas de requisición/OC/factura + vista
  `v_partida_control` (3 capas) + backfill del `monto_ejercido` histórico.
- UI del ciclo en DILESA reusando `erp.*` y el patrón RDB: requisición + OC +
  recepción (con sub-slugs RBAC por ADR-030 y migración de `core.modulos`).
- Módulo de Cotización RFQ: schema + comparativa multi-proveedor + adjudicación
  → OC.
- Integración del checklist de anteproyecto (los pasos tiran del módulo real).
- Gasto suelto soportado (`partida_id` null).

**Fuera de v1 (backlog):**

- Rollout/encendido del módulo en RDB, COAGAN, ANSA (y migración de RDB al
  componente compartido).
- Conciliación bancaria (iniciativa hermana `conciliacion-bancaria`, ya
  existe, bloqueada hasta que CxC+CxP emitan movimientos).
- Complemento de pago (REP) y ingesta masiva de XML CFDI (viven en la
  iniciativa `cxp`).
- Almacén de obra / inventario de materiales con stock (si algún material sí
  requiere control de existencias, se evalúa después).

## Modelo de datos (propuesto — se confirma en Sprint 0/ADR-040)

**Nuevo en `erp`:**

- `erp.conceptos_compra` — catálogo jerárquico. `id`, `empresa_id`,
  `padre_id` (self-FK), `nivel`/`tipo` (capitulo|partida|concepto), `codigo`,
  `nombre`, `orden`, `activo`.
- `erp.cotizaciones` — la RFQ. `id`, `empresa_id`, `codigo`, `requisicion_id?`,
  binding a presupuesto, `descripcion`, `estado`
  (abierta|comparada|adjudicada|cancelada), `fecha_limite`, `creado_por`.
- `erp.cotizacion_lineas` — qué se pide. `cotizacion_id`, `concepto_id`,
  `descripcion`, `cantidad`, `unidad`.
- `erp.cotizacion_proveedores` — las respuestas. `cotizacion_id`,
  `proveedor_id`, `estado` (invitado|respondida|elegida|descartada),
  `monto_total`, `tiempo_entrega`, `condiciones`, `adjunto_id`, `notas`.
- `erp.cotizacion_proveedor_precios` — precio por línea por proveedor (para la
  comparativa lado a lado).
- `erp.ordenes_compra.cotizacion_id?` — FK nuevo (OC nacida de una cotización
  adjudicada).

**Binding a presupuesto (depende de D9):**

- `partida_id?` en `erp.requisiciones_detalle`, `erp.ordenes_compra_detalle`,
  `erp.facturas` (o nivel línea de factura).
- Vista `v_partida_control` deriva por partida: `aprobado`, `comprometido`
  (Σ OC activas), `ejercido` (Σ recibido/facturado), `pagado`
  (Σ `cxp_pago_aplicaciones`), `disponible`.

**Se reusa tal cual de `erp.*`:** `requisiciones`, `ordenes_compra`,
recepción state-based (`oc_recibir_linea`/`oc_cerrar_orden`), `facturas`,
`cxp_pagos`, `cxp_pago_aplicaciones`, `movimientos_bancarios`, `proveedores`,
`personas_datos_fiscales`, `personas_cuentas_bancarias`. Gate de aprobación de
pago: rol **Dirección** (ya vigente en CxP).

## Sprints (tentativo)

| #   | Entregable                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | **ADR-040** (decisión cross-schema D9) + `erp.conceptos_compra` + seed desde `dilesa.obra_presupuesto` + taller de normalización del catálogo con Beto                                                        |
| 1   | Binding `partida_id` en líneas + vista `v_partida_control` (3 capas) + backfill de `monto_ejercido` histórico + KPIs de disponible por concepto                                                               |
| 2   | UI del ciclo en DILESA reusando RDB: requisición + OC + recepción; módulo nuevo en sidebar + `ROUTE_TO_MODULE` + `EXPECTED_DB_MODULE_SLUGS` + migración `core.modulos` con backfill de permisos (ADR-014/030) |
| 3   | Cotización RFQ: schema + UI comparativa multi-proveedor + adjudicación → OC                                                                                                                                   |
| 4   | Integración con el checklist de anteproyecto (pasos consumen el módulo) + closeout                                                                                                                            |

## Riesgos

- **R1 — Cross-schema (D9).** Si se generaliza el presupuesto a `erp`, toca
  `dilesa.proyecto_presupuesto_partidas` y la RPC de promoción que creó
  `dilesa-proyectos-anteproyectos` (cerrada). Migración con backfill cuidadoso
  y tests; no romper la promoción anteproyecto→desarrollo.
- **R2 — Solapamiento con la iniciativa `cxp` activa.** Su Sprint 2 (ingesta
  XML CFDI + match con OC) toca `erp.facturas` y `components/cxp/`. Coordinar
  para no duplicar ni chocar en migraciones/historial (ver memoria de flujo de
  merge multi-sesión).
- **R3 — Catálogo sucio.** `obra_presupuesto.concepto` es texto libre; el seed
  requiere una pasada de normalización con Beto antes de canonizar.
- **R4 — Enfoque constructora en el compartido (D7).** Al diseñar
  `components/compras/` constructora-first hay que evitar arrastrar suposiciones
  de RDB-restaurante (producto/almacén obligatorio). RDB queda intacto en v1;
  la abstracción del "destino de recepción" se valida cuando RDB se migre
  (backlog), no antes.

## Métricas de éxito

- DILESA opera el ciclo completo de compras en BSOP (cero Excel nuevo de
  control de compras/órdenes para proyectos vivos).
- Por cada proyecto/concepto se ve presupuestado vs comprometido vs ejercido vs
  pagado sin captura manual del ejercido.
- Toda OC nace de una requisición o cotización con audit trail; toda factura
  de proveedor liga (cuando aplica) a su OC y a su partida.

## Bitácora

- **2026-06-08 (cierre de la iniciativa)** — Ciclo P2P de DILESA completo en prod — Sprints 0-3 (catálogo de conceptos, binding partida, vista de control 3 capas, UI del ciclo) + gasto directo + sprint RFQ/Cotizaciones Fases 0-3 (#705 schema, #706 UI captura+envío, #707 comparativa+adjudicación→OC/contrato). La adjudicación cierra el círculo P2P. Follow-ups menores (editar OC borrador, ajuste F4 de `v_partida_control` con OCs canceladas, rollout del componente compartido a RDB) quedan en backlog, no bloquean. Cerrada por instrucción de Beto tras auditoría de estado real (el header estaba stale respecto al trabajo ya en prod).

- **2026-06-04** — Iniciativa promovida a `planned`. Discovery a fondo del
  ciclo P2P existente (RDB golden en `erp.*`, DILESA solo CxP) y de las piezas
  regadas de DILESA (presupuesto de partidas con `monto_ejercido` vacío, pasos
  inline del checklist, canal de construcción/contratistas ya puenteado a CxP
  por ADR-039). Alcance v1 cerrado con 6 decisiones (D1–D6) + enfoque
  constructora (D7) + separación de contratistas (D8) + decisión cross-schema
  diferida al ADR-040 (D9). Continuación natural de `dilesa-contratos-obra`
  (que dejó "cotizaciones" apuntado como próximo dominio a promover).
- **2026-06-04** — **Sprint 0 aplicado a prod.** ADR-040 escrito (catálogo en
  `erp` firme; unificación de presupuesto y `partida_id` como dirección para
  Sprint 1). Migración `20260604190000_erp_conceptos_compra` aplicada vía MCP
  (no `db push`, por drift multi-sesión): tabla `erp.conceptos_compra`
  jerárquica (etapa→capitulo→concepto vía `padre_id`), RLS lectura
  miembros/escritura admin, + seed DILESA normalizando los 93 conceptos crudos
  de `obra_presupuesto` → **3 etapas / 18 capítulos / 71 conceptos** (verificado
  en prod: 0 huérfanos, 0 conceptos sin padre). `tipo_insumo` decidido como
  atributo de la partida/línea, no del concepto (un concepto se compra en
  MO+Material+Maquinaria). Gasto suelto fuera del catálogo (concepto libre).
  SCHEMA_REF regenerado (solo `conceptos_compra`, sin drift). `types` se difiere
  al workflow `db-types` (Sprint 0 es DB-puro, sin TS que use la tabla).
  Próximo: Sprint 1 cierra D9 (unificar `obra_presupuesto` en `erp`,
  coordinando con `dilesa-contratos-obra`).
- **2026-06-04** — **Sprint 1, fase aditiva aplicada a prod.** Tras mapear el
  acoplamiento real (Beto cerró: solo obra en S1, checklist al S4): se descubrió
  que `proyecto_presupuesto_partidas` (vacía) está cableada al checklist, y que
  la vista de compat para `obra_presupuesto` es frágil con supabase-js. Decisión
  (Beto pidió "lo más robusto"): modelo único en `erp`, re-apuntar `costeo` (no
  vista), cross-schema `partida→proyecto` aceptado. Migración
  `20260604230000_erp_presupuesto_partidas` aplicada vía MCP (con OK explícito de
  Beto): `erp.presupuesto_partidas` (superset obra + futuro checklist) + copia de
  las **128 partidas de obra** (47 clasificadas al catálogo por match único, 81
  pendientes) preservando IDs + `partida_id` (FK) en
  `requisiciones_detalle`/`ordenes_compra_detalle`/`facturas` + vista
  `erp.v_partida_control` (comprometido/ejercido/pagado/disponible). Verificado:
  128 copiadas, `obra_presupuesto` intacta (128), vista OK. Bug corregido en
  dry-run (`max(uuid)`→`array_agg`). ADR-040 §Revisión documenta los 3 ajustes.
  Coexistencia inerte (compras sin UI). **Próximo (fase 2, antes de Sprint 2):**
  re-apuntar `costeo` a `erp.presupuesto_partidas` con preview + retirar
  `obra_presupuesto`.
- **2026-06-04** — **Sprint 1 fase 2a: `costeo` re-apuntado.** `costeo-module`
  (SELECT + mapeo + soft-delete) y `costeo-concepto-form` (alta/edición) ahora
  leen y escriben `erp.presupuesto_partidas` (`concepto`→`concepto_texto`,
  `presupuesto_actualizado`→`presupuesto_aprobado`; altas marcan
  `fuente='obra_resumen'`). Cast `as any` + `eslint-disable` mientras la tabla
  no esté en `types` (se difiere al workflow). Verificado: ventana de edición =
  0 (las dos tablas idénticas, sin re-sync); cero queries activas a
  `obra_presupuesto` en código; 5 checks verdes (1247 tests). PR **UI-touching →
  preview sin auto-merge** para validar que las 128 partidas se ven/editan bien
  antes de mergear. **Fase 2b (sigue):** retirar `dilesa.obra_presupuesto` tras
  validar en prod.
- **2026-06-04** — **Sprint 1 fase 2b: rediseño UX de Costeo.** Plan cerrado con
  Beto y ejecutado como PR dedicado. 5 mejoras: (1) **tabla agrupada colapsable
  en 2 niveles etapa › capítulo** con subtotal por grupo (reemplaza el
  `<DataTable>` plano); (2) **orden por el catálogo canónico** `erp.conceptos_compra`
  (etapa→capítulo→concepto vía `codigo`), partidas sin `concepto_id` en grupo
  **"Sin clasificar" al final**; (3) **un proyecto a la vez** — auto-selecciona
  el primer proyecto al entrar; selector lista cada proyecto + "Todos" + "Sin
  proyecto asignado"; (4) **form + 2 dropdowns**: clasificación al catálogo
  (`<optgroup>` etapa›capítulo → `concepto_id`, prellena la etiqueta) +
  proveedor de `erp.proveedores` (→ `proveedor_persona_id`, default "Por
  definir", opción "Otro (texto libre)" que **preserva el `proveedor_texto`
  legacy** sin pérdida); (5) **edición por click en la fila** + botón **Eliminar
  dentro del cuadro de edición** (sin íconos en la orilla — ajuste pedido por
  Beto al revisar el preview). Nuevo helper puro
  `lib/dilesa/conceptos-catalogo.ts` (`buildCatalogoConceptos`: árbol +
  optgroups) y `groupCosteo` exportado, ambos con test unitario (17 tests
  nuevos). Estado: **129 partidas, 47 clasificadas** (82 a reclasificar con el
  dropdown nuevo), **0 con proveedor estructurado** (217 proveedores activos
  disponibles). 5 checks verdes (typecheck, **1257 tests**, lint 0-err, format).
  PR **UI-touching → preview sin auto-merge**. **Retiro de `dilesa.obra_presupuesto`
  pendiente del OK de Beto** (paridad verificada 128 legacy ↔ 129 canónico; cero
  referencias runtime en código, solo JSDoc viejo + script de import histórico +
  `types` generados).
- **2026-06-04** — **Clasificación masiva de partidas (backfill de `concepto_id`).**
  Beto pidió clasificar todo lo pendiente. Match `partida → concepto` por
  similitud de nombre (la mayoría casi idéntico) + etapa como tiebreaker para
  vialidades vs plataformas; 9 decisiones difíciles confirmadas con Beto (trío de
  lotificación → `1.04.05`; "1era etapa" sin marcador → plataformas etapa 3; "Maq
  2da/3era" → `2.01.10`; UID agua-drenaje-cordones → `2.04.02`). Aplicado vía MCP
  en transacción con guarda `concepto_id IS NULL` (no pisa lo ya clasificado) +
  el FK valida cada concepto (typo = rollback, no escritura mala). Fila de prueba
  "Prueba" ($215k sin gasto) soft-deleted. **Resultado: 128/128 partidas vivas
  clasificadas, 0 sin clasificar.** La tabla agrupada del rediseño ya muestra
  todo bajo su etapa › capítulo correcto (cero "Sin clasificar"). Reversible vía
  el dropdown del form. PR #688 mergeado (squash) el 2026-06-05; **Sprint 1
  cerrado** (binding `partida_id` + `v_partida_control` + re-apunte + rediseño +
  clasificación).
- **2026-06-05** — **Sprint 2 planeado (discovery + 4 decisiones).** Discovery
  read-only del fit constructora de la maquinaria `erp.*` (hecha restaurante-first
  para RDB). Hallazgos: requisiciones/OC + RPCs `oc_cerrar_orden`/
  `oc_cancelar_pendiente_linea`/`fn_oc_recalcular_estado` reusan limpio
  (`producto_id` ya nullable, `partida_id` ya existe); **único bloqueo** =
  `oc_recibir_linea` exige `producto_id` + escribe a `movimientos_inventario` con
  almacén → necesita variante sin inventario. Mapa de `v_partida_control`:
  `comprometido`=Σ línea OC×precio (estado enviada/parcial/cerrada), `ejercido`=Σ
  `cantidad_recibida`×precio (sin filtro de estado — posible ajuste, ver F4 del
  discovery), `pagado`=Σ aplicaciones vía `facturas.partida_id`. **Sorpresa
  crítica:** `partida_id` existe pero el código (`generarOrdenCompra`,
  `guardarRequisicion`) NO lo copia aún → `comprometido`/`ejercido` en $0 hasta
  cablearlo end-to-end. Decisiones D10–D13 cerradas con Beto (hub con tabs,
  recepción ligera, siempre-hay-partida, RPC nueva). Plan de 4 fases: A (hub +
  RBAC migración sub-slugs), B (OC, mueve comprometido), C (recepción vía
  `oc_recibir_linea_partida`, mueve ejercido), D (requisiciones + extraer
  `components/compras/`). Schema total del sprint = INSERT sub-slugs (A) + 1 RPC
  (C). Gates a respetar: rol Dirección (no `rol='admin'`), filtrado `empresa_id`
  por query, scope un-proyecto-a-la-vez.
- **2026-06-05** — **Fase A aplicada + Fase B construida.** Fase A (PR #689)
  mergeada; migración `20260605040000_modulos_dilesa_compras` aplicada a prod vía
  MCP con OK explícito de Beto (4 slugs × 8 roles, clonados de costeo; verificado).
  Nota de modo autónomo: el clasificador bloqueó aplicarla de noche con solo
  "avanza autónomo" — correcto, ver memoria `feedback_autonomous_prod_migrations`.
  **Fase B** (OC, este PR): `lib/compras/ordenes.ts` (helpers puros + KPIs,
  `comprometido` espeja la semántica de la vista; 7 tests) +
  `components/compras/ordenes-compra-module.tsx`: lista + KPIs + alta con líneas
  **ancladas a partida** (selector agrupado etapa›capítulo reusando
  `buildCatalogoConceptos`) + acciones enviar (→comprometido) / cerrar
  (RPC `oc_cerrar_orden`) / cancelar. `producto_id` null, sin inventario;
  `partida_id` SÍ se popula end-to-end (cierra la "sorpresa crítica"). Un proyecto
  a la vez. 1264 tests verdes. Pendiente Fase B: editar OC borrador + drawer de
  detalle con histórico (v1 es alta + acciones; sin edición de líneas existentes).
  Próximo: Fase C (recepción, RPC nueva).
- **2026-06-05** — **`obra_presupuesto` retirada (PR #691) + Fase C construida.**
  `dilesa.obra_presupuesto` → `_deprecated` (rename, no drop) con OK de Beto;
  verificado seguro (cero refs runtime, cero vistas/FKs, paridad 128↔128);
  SCHEMA_REF + types regenerados (types absorbió las tablas diferidas de S0/S1).
  **Fase C** (recepción, este PR): RPC nueva `erp.oc_recibir_linea_partida`
  (variante de `oc_recibir_linea` sin producto/almacén/inventario — solo actualiza
  `cantidad_recibida` + recalcula estado + audita → mueve `ejercido`) en archivo,
  **pendiente de aplicar a prod con OK de Beto** (en el preview se aplica al branch
  aislado). `components/compras/recepciones-module.tsx`: bandeja de OCs
  enviada/parcial + recibir N por línea (inline expand, "Recibir todo" + guardar)
  contra la partida; helpers `lineaPendiente`/`ocTienePendiente` + 4 tests.
  Recepción ligera (D11, sin documento/folio). 1268 tests verdes. Próximo:
  Fase D (requisiciones) + extraer componente compartido + (follow-up) ajuste F4
  de la vista si se confirma la semántica de `ejercido` con OCs canceladas.
- **2026-06-05** — **Fase D construida: Requisiciones + componente compartido
  (D4) — cierra Sprint 2.** Discovery de schema confirmó que el "modelo de
  estados" del handoff era un falso problema: `erp.requisiciones.estado_id` y
  `prioridad_id` son `uuid` sueltos **sin FK ni catálogo** que nadie usa (0/241
  filas vivas, todas RDB). El ciclo se modela con `autorizada_at` + la OC ligada
  (igual que RDB): pendiente → autorizada → con_oc. `subtipo` tiene CHECK
  (`general|combustible|servicios|activos`), se deja null. **Sin migración**:
  `requisiciones_detalle.partida_id` ya existía y los sub-slugs RBAC entraron en
  Fase A. Entregables: (1) `lib/compras/requisiciones.ts` (tipos + estado
  derivado + KPIs, 11 tests); (2) `lib/compras/partidas.ts` —**materializa D4**:
  extrae la indexación de partidas (label/proyecto/optgroups etapa›capítulo) que
  Órdenes y Recepciones duplicaban, y **refactoriza ambos** para consumirla (OC
  −35 líneas netas; de paso corrige un sort latente que ponía "Sin clasificar"
  primero, inocuo hoy porque 128/128 están clasificadas; 6 tests); (3)
  `components/compras/requisiciones-module.tsx` (lista + KPIs + alta anclada a
  partida con selector agrupado + acciones Autorizar / Cancelar / **Generar OC**);
  (4) page real reemplaza el placeholder `ComprasProximamente` (retirado, ya
  huérfano en las 3 tabs). **El valor central — "Generar OC" copia `partida_id`**
  de `requisiciones_detalle` → `ordenes_compra_detalle` (**cierra el riesgo F3**
  que arrastra `generarOrdenCompra` de RDB), con `producto_id` null y precio
  estimado → `precio_unitario`; la OC nace `borrador` y sigue su flujo en el tab
  Órdenes. `solicitante_id` = usuario actual (audit trail). Un proyecto a la vez.
  5 checks verdes (typecheck, **1285 tests**, lint 0-err, format, schema sin
  drift). PR **UI-touching → preview-first sin auto-merge**; **sin migración → el
  preview corre contra datos de prod** (las altas de prueba escriben a prod —
  borrarlas tras revisar). Con esto **Sprint 2 (A/B/C/D) queda completo**;
  próximo Sprint 3 = Cotización RFQ. Follow-ups vivos: editar OC borrador/drawer
  de detalle (Fase B), ajuste F4 de `v_partida_control` (OCs canceladas en
  `ejercido`), migración de RDB al componente compartido (backlog).
- **2026-06-05** — **Ajustes post-Fase D pedidos por Beto (mismo PR #693).** Tres
  cosas: (1) **Requisición libre / gasto suelto** — opción "Gasto suelto (sin
  proyecto)" en el selector → líneas de texto libre sin partida (`partida_id`
  null; la OC generada tampoco lleva partida ni compromete presupuesto).
  `puedeGenerarOc` relajado: partida opcional (alineado con el alcance v1 "gasto
  suelto soportado"). +1 test (1286). (2) **Selector "solo con presupuesto"** —
  Requisiciones y Órdenes listan únicamente fraccionamientos con partidas
  cargadas (o con documentos previos); los vacíos/cerrados se ocultan solos, sin
  marcar estado en DB. (3) **Clonación de catálogo a prod (datos, no migración)**
  — 5 proyectos sin presupuesto recibieron las 71 partidas del catálogo canónico
  (`erp.conceptos_compra` nivel concepto) en **$0**, idempotente (`NOT EXISTS`),
  con `fuente='catalogo_clon'` para reversión: **Ampliación Lomas de los Encinos**
  - **Lomas de las Delicias** (desarrollos abiertos) + **Loma Escondida** +
    **Lomas del Bosque** + **Plaza Comercial Los Encinos** (anteproyectos en
    análisis). 355 filas, verificado (71 c/u, todas con concepto_id, todas en cero,
    3 etapas). Beto captura los montos reales en Costeo. **Cerrados sin clon
    (invisibles por la regla del selector):** Loma Verde, Loma Verde 2, Lomas del
    Valle, Paseo del Valle. Reversión: `... WHERE fuente='catalogo_clon'`.
    Presupuestos reales preexistentes: Lomas del Sol (73), Lomas de los Encinos (55).
- **2026-06-05** — **Sprint "gasto directo" arrancado — Fase 1 (DB) construida.**
  Beto necesita registrar pagos ya hechos **fuera del proceso** requisición→OC
  (Lomas de las Delicias) y que sumen al control. Decisiones cerradas: entran como
  **factura CFDI + asignación de partida** (carga inclusiva ya soportada por
  `cxp`); se construye **capacidad permanente en UI**; semántica **modelo híbrido**
  (D14/ADR-041). Discovery confirmó que `erp.facturas` ya tiene `partida_id` +
  `orden_compra_id` nullable (factura sin OC) y que `v_partida_control.pagado` ya
  suma facturas con partida; el único hueco era `ejercido` (solo leía recepciones
  de OC) y la **ausencia de UI para asignar partida** (el módulo CxP solo ingesta
  XML, 0 refs a partida). **Fase 1 (este PR):** ADR-041 + migración
  `20260605180000_v_partida_control_ejercido_gasto_directo` (CREATE OR REPLACE
  VIEW → ejercido híbrido). Validada en dry-run (BEGIN/ROLLBACK): compila, 483
  partidas, totales sin cambio (0 facturas hoy → aditivo puro). **Pendiente de
  OK de Beto para aplicar a prod.** **Fase 2 (siguiente):** acción "Asignar
  proyecto→partida" en el drawer de factura del módulo CxP compartido (aditivo,
  DILESA-first, reusa `buildPartidaIndex`) — coordinar con Sprint 5 de `cxp` (R2).
  Flujo final: subir XML → asignar partida → registrar pago → suma ejercido+pagado.
- **2026-06-05** — **Sprint "gasto directo" — Fase 1 aplicada + Fase 2 construida.**
  **Fase 1** (#696) aplicada a prod (vista híbrida verificada: tiene el bloque
  `orden_compra_id IS NULL`, filtra egreso, 483 partidas legibles) y mergeada. De
  paso se arregló una **colisión de timestamp** `20260605160000` (Fase C #692 +
  backfill #694) que rompía el Supabase Preview de todo PR con migración (rename
  del backfill a `...161000`). **Fase 2** (este PR, UI): en
  `components/cxp/cxp-facturas-module.tsx` (módulo CxP compartido) se agrega, en el
  drawer de la factura, la sección **"Partida del presupuesto"** — selector
  proyecto + partida (agrupado etapa›capítulo vía `buildPartidaIndex`, solo
  proyectos con presupuesto) con acciones Asignar / Cambiar / Quitar →
  `UPDATE erp.facturas.partida_id`. **Aditivo y DILESA-first** (`usaPartidas =
empresa === 'dilesa'`): RDB no carga partidas ni ve la sección (cero cambio de
  comportamiento). 5 checks verdes (typecheck, 1286 tests, lint 0-err, format).
  PR **UI-touching → preview-first sin auto-merge**. Con esto el flujo de gasto
  directo queda completo end-to-end: subir XML → asignar partida → pagar → suma
  ejercido+pagado de la partida. Generalizar a otras empresas constructora =
  cambiar el gate `empresa === 'dilesa'` por lista/prop (trivial, backlog).
- **2026-06-05** — **Sprint "contratos de obra al control de partidas" promovido
  (D15/ADR-042).** Discovery a fondo de la costura `dilesa-contratos-obra` ↔
  `dilesa-compras`: los dos mundos (302 contratos + 275 estimaciones vs 483
  partidas de costeo) nunca convergieron — 0 partidas con `contrato_id`, 0
  facturas con `obra_estimacion_id`; el histórico tampoco ligaba (0/128). Beto
  preguntó cómo ligar contrato↔presupuesto y cómo debería ser el procedimiento.
  Visión cerrada: el **presupuesto es el centro**, el contrato de obra compromete
  una partida igual que la OC, las estimaciones la ejercen/pagan. Decisiones de
  Beto: **1:1** (contrato → una partida, `contratos_construccion.partida_id`
  nuevo), estimación **hereda la partida** del contrato, **promover**. ADR-042
  escrito. Ejecución por sprint (3 fases: DB `partida_id` + `comprometido`
  extendido en `v_partida_control`; UI selector de partida en el alta del
  contrato; emisión a CxP con `partida_id` — cierra el pendiente de ADR-039).
  **Pendiente de arrancar la Fase 1 con OK de Beto (toca la vista de control —
  cambio financiero).**
- **2026-06-05** — **Sprint Cotizaciones (RFQ) arrancado · Fase 0 (DB) aplicada a
  prod.** Fase 0 del sprint Cotizaciones = Fase 1 (DB) de ADR-042/D15 (prerrequisito:
  para que la cotización adjudique a contrato de obra, el contrato debe poder
  comprometer una partida). Migración
  `20260605190000_contrato_obra_partida_id_y_comprometido` aplicada vía MCP con OK de
  Beto: (1) `dilesa.contratos_construccion.partida_id` (FK → `erp.presupuesto_partidas`,
  nullable, cross-schema `dilesa→erp`, `ON DELETE SET NULL`) + índice parcial; (2)
  `erp.v_partida_control.comprometido` extendido a `Σ OC (enviada/parcial/cerrada) + Σ
contratos activos por partida_id` (join filtrado por `empresa_id`, activo =
  `deleted_at IS NULL`), con `disponible` ajustado al comprometido total. **Aditivo
  puro**: 0 contratos tienen partida hoy (columna nueva) → `comprometido_total` sin
  cambio (verificado en prod: 483 partidas, $0→$0). Lógica validada read-only antes de
  aplicar (simular ligar el contrato de urbanización más grande, $7.69M, sube el
  comprometido y dispara la alerta de sobre-contratación de ADR-042). El comprometido de
  contratos empieza a contar cuando la UI ligue contratos a partidas (sprint
  `dilesa-contratos-obra` Fase 2 de ADR-042, o desde la adjudicación de la RFQ). **Nota
  IVA**: se suma `valor_total` (c/IVA) por mandato de ADR-042; el comprometido de OC va a
  subtotal s/IVA y el desglose `valor_subtotal/valor_iva` está NULL en los 302 contratos
  traspasados (solo `valor_total` poblado), así que es lo único disponible. SCHEMA_REF +
  types regenerados (1 columna, sin drift). Próximo: Fase 1 del sprint = schema RFQ (4
  tablas en `erp` + sub-slug RBAC `dilesa.compras.cotizaciones`).
- **2026-06-05** — **Sprint Cotizaciones · Fase 1 (schema RFQ) aplicada a prod.**
  Migración `20260605191000_erp_cotizaciones_rfq`: 4 tablas en `erp` (`cotizaciones` la
  RFQ con `tipo` compra|obra que decide a qué adjudica; `cotizacion_lineas` ancladas a
  partida D12; `cotizacion_proveedores` invitados+respuesta con `UNIQUE(cotizacion,proveedor)`;
  `cotizacion_proveedor_precios` la matriz precio×línea×proveedor con
  `UNIQUE(cot_proveedor,linea)`), RLS por empresa (patrón `core.fn_has_empresa`, 16
  políticas) + grants a `authenticated` + triggers `updated_at` + 2 FKs de adjudicación
  (`erp.ordenes_compra.cotizacion_id`, `dilesa.contratos_construccion.cotizacion_id`,
  `ON DELETE SET NULL`). RBAC: sub-slug **`dilesa.compras.cotizaciones`** en `core.modulos`
  - backfill de 8 permisos clonados de `dilesa.compras.ordenes` (regla 4 lugares:
    EXPECTED*DB_MODULE_SLUGS actualizado; ROUTE_TO_MODULE + page + TAB llegan con la UI en
    Fase 2, cuando se libera la URL). Helper puro `lib/compras/cotizaciones.ts` (matriz:
    `precioCelda`/`totalProveedorMatriz`/`mejorProveedorLinea`/`rankingProveedores`/
    `puedeAdjudicar`/`adjudicaA`/KPIs; 12 tests). Validada en dry-run (BEGIN/ROLLBACK: 4
    tablas, 16 policies, 8 permisos, 2 columnas) antes de aplicar; verificada en prod.
    Tablas vacías → aditivo puro. **Fix de drift/colisión de historial (con OK de Beto):**
    el MCP `apply_migration` registra cada migración con el timestamp del momento (no el del
    archivo) → mis Fase 0/1 quedaron como `215128`/`222129` en el historial, y la sesión
    paralela `rdb-waitry` colisionó el timestamp `20260605180000` con `v_partida_control`
    (#696). Eso rompía el Supabase Preview (`MIGRATIONS_FAILED` + out-of-order). Repair:
    alineadas las 3 entradas de historial a sus timestamps de archivo (190000/191000/184000)
    vía UPDATE en `supabase_migrations.schema_migrations`, y **renombrado el archivo de
    waitry** `20260605180000*…`→`20260605184000\_…`para resolver la colisión en`main`.
Próximo: Fase 2 = UI de captura (`components/compras/cotizaciones-module.tsx` + page +
    TAB + ROUTE_TO_MODULE).
- **2026-06-05** — **Sprint Cotizaciones · Fase 2 (UI de captura).** Tab "Cotizaciones"
  del hub `/dilesa/compras` (4° tab, entre Requisiciones y Recepciones). Liberación del
  sub-slug (4 lugares completados: ROUTE_TO_MODULE + page + TAB; el slug en `core.modulos`
  y EXPECTED_DB_MODULE_SLUGS entraron en Fase 1). `components/compras/cotizaciones-module.tsx`
  (molde de `ordenes-compra-module.tsx`): lista + KPIs (`deriveCotizacionKpis`), **alta de
  RFQ** (proyecto solo-con-presupuesto · tipo compra|obra · descripción · fecha límite ·
  líneas ancladas a partida con selector agrupado etapa›capítulo vía `buildPartidaIndex` ·
  invitar N proveedores de `erp.proveedores` por chips) → insert `cotizaciones` +
  `cotizacion_lineas` + `cotizacion_proveedores` (estado `invitado`); y **captura de la
  matriz** (sub-componente `CapturaPrecios`): tabla líneas×proveedores con un input de
  precio por celda (resalta el mejor precio por renglón vía `mejorProveedorLinea`), total
  por proveedor en vivo, + datos de respuesta (entrega/condiciones) → upsert
  `cotizacion_proveedor_precios` (onConflict proveedor+línea) + update
  `cotizacion_proveedores` (pasa a `respondida`, `monto_total` derivado de la matriz).
  Client-side directo, un proyecto a la vez. 5 checks verdes (typecheck, 1305 tests, lint,
  format, schema). **Sin migración → preview-first sin auto-merge** (Beto revisa el preview
  visual). Próximo: Fase 3 = comparativa lado a lado + adjudicación → OC (`cotizacion_id` +
  herencia de precios) o contrato de obra (`partida_id` + `cotizacion_id`).
- **2026-06-06** — **Ajustes UX de Fase 2 (feedback de Beto en el preview, mismo PR #706).**
  Dos cambios pedidos: (1) **selector de proveedores con búsqueda** — reemplazado el grid de
  chips toggle (no escala con 200+ proveedores) por el `Combobox` searchable del repo (buscar
  y agregar uno a uno; invitados como chips removibles; el dropdown excluye a los ya
  agregados). (2) **flujo de captura claro + recepción de archivos** — Beto no encontraba
  dónde se "recibe/captura" la cotización. La captura dejó de estar escondida en un botón:
  ahora **clic en la fila** de la RFQ expande el panel "Capturar y comparar" (patrón
  `onRowClick` + panel inline en la página, como `tareas-checklist`); la columna muestra
  **Respuestas X/N**; y cada proveedor tiene su **`<FileAttachments>`** (ADR-022, bucket
  `adjuntos` + `erp.adjuntos`) para subir el PDF/Excel de su cotización — se agregó
  `'cotizaciones'` a `AdjuntoEntidad` (`lib/storage/path.ts`), `entidadId` = la fila del
  proveedor invitado. El campo `cotizacion_proveedores.adjunto_url` de la Fase 1 queda sin uso
  (los adjuntos viven en `erp.adjuntos` por política; el campo se retira en un cleanup futuro).
  Gate de escritura: el guardado de precios y el upload respetan `puedeEscribir`. 5 checks
  verdes (1305 tests).
- **2026-06-06** — **Fase 2: envío de la solicitud al proveedor (feedback de Beto, mismo
  PR #706).** Tres pedidos más: (1) **agregar proveedores a una RFQ ya creada** — combobox
  en el panel de captura que invita otro proveedor (insert + refresh sin cerrar). (2) **PDF
  de Solicitud de Cotización** — componente `lib/dilesa/pdf/solicitud-cotizacion.tsx`
  (reusa branding DILESA `HeaderBand`/`FooterBand`/`styles`); lleva **solo el listado** de
  conceptos a cotizar (concepto/partida, descripción, cantidad, unidad — sin precios, el
  proveedor responde en su formato) + folio/proyecto/fecha límite/destinatario + nota. (3)
  **Envío por email** — endpoint `app/api/dilesa/cotizaciones/[id]/solicitud/route.tsx`:
  GET `?proveedor=` descarga el PDF; POST `{cotProveedorId}` lo manda al `erp.personas.email`
  del proveedor vía Resend (mismo patrón que estimaciones: `renderToBuffer` + adjunto base64
  - `from` DILESA + `writeNotificationLog` con slug `dilesa_cotizacion`, fail-open sin
    definición). UI: botones **PDF** y **Enviar** por proveedor en su tarjeta; el envío
    (acción externa) pide **confirmación inline** y respeta `puedeEscribir`. Pendiente fino:
    el `from`/`reply_to` usa defaults (`noreply@bsop.io` / `compras@dilesa.mx`) — afinar
    cuando Beto defina el buzón; idealmente crear la definición `dilesa_cotizacion` en el
    catálogo de notificaciones. 5 checks verdes (1305 tests). Sigue preview-first.
- **2026-06-06** — **Fase 3 (comparativa + adjudicación) — cierra el sprint Cotizaciones.**
  En el panel "Capturar y comparar" se agrega la sección **Adjudicar**: ranking de
  proveedores que respondieron (ordenado por total efectivo vía `rankingProveedores`, el
  más barato marcado) con botón **Adjudicar** por proveedor (confirmación inline, respeta
  `puedeEscribir`). Al adjudicar, según `adjudicaA(tipo)`: **compra → OC** (insert
  `erp.ordenes_compra` con `cotizacion_id` + `proveedor_id` elegido, estado `borrador`, +
  `ordenes_compra_detalle` heredando `partida_id` y el **precio del proveedor elegido** por
  línea desde la matriz — molde `requisiciones-module::generarOC`); **obra → contrato**
  (insert `dilesa.contratos_construccion` con `contratista_id`=persona del proveedor,
  `proyecto_id` resuelto de la partida, `valor_total`=total del elegido, `partida_id` de la
  1ª línea, `cotizacion_id`, `tipo='urbanizacion'` — molde `nuevo-obra/page`). Luego marca
  la RFQ `adjudicada` + `adjudicado_proveedor_id`, y a los proveedores `elegida`/`descartada`
  (audit trail). **Sin migración** (las FKs de adjudicación entraron en Fase 1). La OC nace
  borrador y sigue su flujo en el tab Órdenes; el contrato compromete su partida por ADR-042.
  Limitaciones v1: el contrato toma la partida de la 1ª línea (1:1, ADR-042) y `tipo`
  fijo `urbanizacion` (ajustable luego en el módulo de obra); la adjudicación usa los
  **precios persistidos** (avisa "guarda antes de adjudicar"). 5 checks verdes (1305 tests).
  **Preview-first.** Con esto el sprint Cotizaciones queda **completo** (Fases 0-3); cierra
  el círculo P2P de DILESA.
- **2026-06-10** — **Tab "Costo materiales" (post-cierre, puente CONTPAQ).** Auditoría
  pre-cutoff del sync Coda→BSOP de `construccion.costo_materiales`
  (`scripts/check_dilesa_costo_materiales_sync.ts`, read-only): 1,310 OK / 0 mismatch /
  **50 faltantes** (capturadas en Coda post-backfill, ~$9.1M, todas LDLE) → con OK de Beto
  se re-corrió `backfill_dilesa_costo_materiales.ts` (50 actualizadas) + recálculo de
  `costo_materiales_referencia` (14 prototipos); re-auditoría: 1,360/1,360 OK, 0
  faltantes, 0 terminadas sin costo — cutoff del grid seguro. Para capturar el costo
  final de materiales de viviendas que se van terminando ya sin Coda (mientras el control
  de materiales sigue en CONTPAQ y no exista su módulo en BSOP): 5to tab del hub
  `/dilesa/compras/costo-materiales` (sub-slug `dilesa.compras.costo_materiales`,
  ADR-030) con vista Pendientes/Todas sobre construcciones terminadas
  (terminada/dtu/seguro_calidad/extraida) y captura inline MoneyCell (commit on-blur).
  Write vía RPC `dilesa.fn_construccion_capturar_costo_materiales` (SECURITY DEFINER):
  gate admin OR escritura efectiva del sub-slug (semántica excepción>rol de
  `lib/permissions.ts`), exige estado terminado, `round(,2)`, recalcula
  `productos.costo_materiales_referencia` (WHERE canónico de 20260530210000) y deja
  `core.audit_log` con valor anterior/nuevo. Migración
  `20260611022746_dilesa_compras_costo_materiales.sql` (slug + backfill permisos clonando
  el padre + RPC, guard para Preview sin datos). 6 checks verdes (1531 tests).
  **Preview-first.**
