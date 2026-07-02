# ADR-056 — Modelo del POS propio de RDB (datos, estados, RPCs, identidad)

**Status:** Accepted
**Fecha:** 2026-07-02
**Iniciativa:** [`rdb-pos-propio`](../planning/rdb-pos-propio.md)
**Relacionados:** ADR-005/006/008 (supabase/adr, saga Waitry), ADR-031/035/036
(dedup/fantasmas), ADR-014 (módulos RBAC), ADR-030 (sub-slugs), ADR-023
(activity log), ADR-054 (timezone).

## Contexto

RDB reemplaza el POS SaaS Waitry por un módulo propio (ver planning doc: por
qué, alcance v1 y decisiones de negocio). Este ADR fija el modelo técnico que
implementa S1: tablas, máquinas de estados, contratos de escritura, identidad
en tablets compartidas e integración con cortes/inventario/reportería. Las
lecciones vienen de la saga Waitry: los duplicados nacieron de doble-tap +
re-cierres sin idempotencia de origen, y la reportería sufrió por leer tablas
crudas sin capa canónica.

## Decisión

### 1. Tablas nuevas en `rdb` (no generalizar `waitry_*`)

```
pos_estaciones   -- punto de captura físico: mostrador, tablet cancha, kds
                 -- (id, empresa_id, nombre, tipo, activa)
pos_cuentas      -- la "cuenta" (mesa/cancha/mostrador): estado, ubicación,
                 -- corte de apertura, totales server-side, playtomic_folio
pos_rondas       -- momentos de captura dentro de una cuenta; inmutables
                 -- (cuenta_id, numero, capturada_por, client_action_id)
pos_items        -- líneas con SNAPSHOT (producto_id + nombre, precio,
                 -- categoria, va_a_cocina, receta_version); estado KDS
pos_pagos        -- pagos INMUTABLES (cuenta_id, metodo, monto, propina,
                 -- corte_id al momento del cobro, voucher_ref, reversa_de)
pos_eventos      -- audit trail append-only (ADR-023): evento, actor
                 -- (empleado + dispositivo), datos_antes/despues, razon
```

- Waitry es un pipeline de ingesta webhook con semántica propia (`superseded`,
  dedup, external ids); mezclar fuentes en una tabla es nullable-hell y
  arriesga doble descuento de inventario. **Cada venta vive en UNA tabla.**
- `rdb.waitry_*` queda histórico read-only tras el cutover; no se migra.
- El catálogo NO se duplica: `pos_items.producto_id` → catálogo existente de
  productos RDB, con flag nuevo **`va_a_cocina`** a nivel producto/categoría
  (todo el club vende por el POS; solo lo preparable aparece en el KDS).

### 2. Máquinas de estados mínimas

```
pos_cuentas.estado: abierta → en_cobro → pagada
                    abierta → cancelada          (sin pagos; con pagos = reembolso)
pos_items.estado:   capturado → en_cocina → listo → entregado
                    capturado → void             (antes de en_cocina)
                    en_cocina|listo → void_merma (post-preparación: merma auditada)
```

- Transiciones validadas por trigger; todo lo demás se rechaza.
- Items que NO van a cocina nacen `entregado` (renta de cancha, tiendita).
- Editar un item enviado a cocina está prohibido: se hace void + línea nueva.
- Reabrir cuenta `pagada`/`cancelada` está bloqueado; una corrección crea
  cuenta nueva ligada (`cuenta_origen_id`).

### 3. Escrituras solo por RPC transaccional + idempotencia de origen

Toda mutación pasa por RPCs `SECURITY DEFINER` (`fn_pos_*`): abrir cuenta,
agregar ronda, void, cobrar, cancelar. Nada de INSERT/UPDATE directo desde el
cliente (RLS de escritura lo bloquea).

- **`client_action_id` (uuid generado en el cliente por tap)** con UNIQUE en
  la operación: el retry/doble-tap devuelve el resultado original en vez de
  duplicar. El bug fundacional de la saga Waitry muere por diseño.
- Totales **server-side siempre**; el cliente solo muestra.
- Cobro exige `corte_id` activo y lo congela en el pago (el dinero pertenece
  al corte donde se cobra). Cierre de corte bloqueado con cuentas abiertas
  relevantes o tarjeta sin voucher (gate #1149 vigente).
- Pagos inmutables: corregir = fila de reversa (`reversa_de`), nunca UPDATE.
- Descuento sobre umbral (config) exige PIN de autorizador + razón; cortesía
  y venta tipo `empleado` siempre con razón. Todo queda en `pos_eventos`.

### 4. Identidad: dispositivo + PIN de operador

- La tablet/monitor se autentica como **cuenta de dispositivo** (Supabase
  Auth) ligada a `pos_estaciones`, con permisos mínimos (solo RPCs del POS).
- Cada acción lleva **PIN corto de empleado** (hash en tabla de operadores
  POS) que resuelve al empleado real → `pos_eventos.actor_empleado_id`. El
  audit trail nunca se atribuye a "la tablet".
- El PIN identifica al operador de turno; NO sustituye auth de admin. Config,
  estaciones y auditoría requieren sesión personal normal con RBAC.

### 5. Inventario por evento de línea

Trigger espejo de `fn_trg_waitry_to_movimientos`: al pasar un item a estado
consumido descuenta en `erp.movimientos_inventario` (motor de recetas +
conversión, `lib/unidades.ts`) con `referencia_tipo='venta_pos'` e id de
línea; `void` pre-preparación revierte; `void_merma` post-preparación deja la
salida como merma auditada. Idempotente por id de línea.

### 6. Vista canónica y reportería

`rdb.v_ventas_canonicas` une `pos_*` (post-cutover) + `v_waitry_pedidos`
(histórico, ya filtrado de fantasmas) con columna `source`. **Nadie lee
tablas crudas**: `/rdb/ventas`, `/rdb/home` y la conciliación Playtomic
migran a la vista. `pos_cuentas.playtomic_folio` conserva la referencia
`P-XXXXXX` que hoy se captura a mano.

### 7. KDS: tabla real + Realtime con ACK

El KDS lee `pos_items` (filtro `va_a_cocina`) por Supabase Realtime con
**fallback a polling** (5-10 s) y ACK de cocina (`en_cocina`). El insert en
DB precede al "éxito" en la UI del capturista. Cancelación post-envío exige
confirmación de cocina en el KDS (alerta sonora).

### 8. RLS y RBAC

- RLS lectura: empresa-scoped set-membership
  (`empresa_id IN (SELECT fn_current_empresa_ids())`) con InitPlan wrap —
  patrón obligado tras los timeouts de `rdb`/`playtomic` (#1151/#1181).
- RLS escritura: deny-all; solo RPCs.
- Módulos (ADR-014/030): **`rdb.pos`** umbrella + sub-slugs
  **`rdb.pos.captura`** (mostrador/meseros), **`rdb.pos.kds`** (cocina),
  **`rdb.pos.admin`** (estaciones, PINs, umbrales, auditoría). Migración con
  INSERT + backfill defensivo de permisos, 5 lugares del checklist ADR-014.

## Alternativas consideradas

1. **Generalizar `waitry_*` con discriminador `origen`** — rechazada:
   semánticas incompatibles, nullable-hell, riesgo de doble descuento.
2. **Sesiones Supabase individuales por mesero con quick-switch** —
   rechazada: re-auth lenta en cambio de manos, y una sesión olvidada
   atribuye ventas a la persona equivocada (audit trail falso).
3. **KDS como vista sobre pedidos** — rechazada: sin estado propio por línea
   no hay ACK ni métricas de cocina; Realtime requiere tabla publicable.
4. **Detectores de duplicados estilo Waitry para el POS** — innecesarios:
   la idempotencia por `client_action_id` previene en origen (los detectores
   existentes quedan vivos para el histórico Waitry).

## Consecuencias

- S1 implementa exactamente este modelo (migración + RPCs + vista + tests).
- La UI de captura es "tonta": muestra estado del servidor, nunca calcula.
- Costo aceptado: PIN agrega un paso por acción sensible (no por item) — el
  precio de un audit trail honesto en tablets compartidas.
- Post-cutover (S6): apagar `waitry-webhook` (incl. espejo a Coda), export
  final de Waitry, y las 4 iniciativas de dedup quedan sin materia prima.
