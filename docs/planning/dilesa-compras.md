# Iniciativa — Compras centralizadas (Procure-to-Pay) DILESA

**Slug:** `dilesa-compras`
**Empresas:** DILESA (golden); componente compartido pensado para rollout a las 5 empresas
**Schemas afectados:** `erp` (catálogo de conceptos nuevo, cotizaciones/RFQ nuevas, binding `partida_id` en líneas de compra, posible generalización del presupuesto), `dilesa` (`proyecto_presupuesto_partidas`, integración con el checklist de anteproyecto), `core.modulos` (sub-slugs RBAC del módulo nuevo)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-06-04
**Última actualización:** 2026-06-05 (Sprint 1 **cerrado** —PR #688 mergeado: rediseño Costeo + clasificación 128/128. **Sprint 2 planeado**: hub `/dilesa/compras` con tabs, modelo constructora-first; discovery hecho + 4 decisiones D10–D13. Plan de 4 fases [A hub+RBAC · B OC · C recepción · D requisiciones+componente compartido]; schema mínimo = INSERT sub-slugs + 1 RPC de recepción. Próximo: Fase A. Pendiente aparte: retiro de `dilesa.obra_presupuesto` con OK de Beto.)

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
