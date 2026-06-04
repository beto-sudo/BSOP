# Iniciativa — Compras centralizadas (Procure-to-Pay) DILESA

**Slug:** `dilesa-compras`
**Empresas:** DILESA (golden); componente compartido pensado para rollout a las 5 empresas
**Schemas afectados:** `erp` (catálogo de conceptos nuevo, cotizaciones/RFQ nuevas, binding `partida_id` en líneas de compra, posible generalización del presupuesto), `dilesa` (`proyecto_presupuesto_partidas`, integración con el checklist de anteproyecto), `core.modulos` (sub-slugs RBAC del módulo nuevo)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-06-04
**Última actualización:** 2026-06-04 (Sprint 0 aplicado a prod: ADR-040 + `erp.conceptos_compra` con 3 etapas / 18 capítulos / 71 conceptos, seed normalizado de `dilesa.obra_presupuesto`. Estado → `in_progress`. Próximo: Sprint 1 — cerrar D9 (unificación de presupuesto en `erp`) + binding `partida_id` + vista `v_partida_control`.)

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
