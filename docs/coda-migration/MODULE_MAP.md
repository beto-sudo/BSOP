# Mapa de módulos — Coda real vs BSOP objetivo

> Este documento responde: **¿qué se usa de verdad en Coda?** (con row counts reales del audit 2026-04-18) y **¿en qué orden conviene migrar?** dados (a) el uso real y (b) la leverage cross-empresa.
>
> Ver también: [`INVENTORY.md`](./INVENTORY.md), [`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md).

---

## Legend

- ★★★ = módulo con miles de rows, uso diario, migrar prioridad
- ★★ = cientos de rows, uso activo
- ★ = docenas de rows, uso ocasional
- ∅ = 0 rows o views/formularios muertos, no migrar
- 🔁 = sirve a múltiples empresas (cross-empresa leverage)
- ✅ = ya en BSOP (Supabase) con datos
- ⚠️ = estructura lista en BSOP (0 rows), falta UI + migración
- ❌ = schema NO existe en BSOP todavía

---

## 1. Ranking por volumen de data real (top 30 tablas con >500 rows)

|       Rows | Doc         | Tabla fuente                    | Estado BSOP                                                      |
| ---------: | ----------- | ------------------------------- | ---------------------------------------------------------------- |
| **18,644** | DILESA      | Tareas Construcción Terminadas  | ❌ (relacionada a `erp.tasks` pero es historial de construcción) |
|  **8,372** | DILESA      | Cargas Combustible              | ❌                                                               |
|  **6,968** | DILESA      | Horas Máquina                   | ❌                                                               |
|  **4,921** | DILESA      | Acarreos                        | ❌                                                               |
|  **4,749** | ANSA        | Citas                           | ⚠️ `erp.citas` (0 rows)                                          |
|  **4,539** | ANSA        | Citas del Día Servicio          | same                                                             |
|  **3,496** | SR Group    | Gastos                          | ⚠️ `erp.gastos`                                                  |
|  **2,995** | RDB         | Detalle Conteo                  | ❌ (audits físicos inventario)                                   |
|  **2,953** | RDB         | Productos del Pedido            | ✅ `rdb.waitry_productos` (15,214)                               |
|  **2,610** | SR Group    | Movimientos AMEX                | ⚠️ `erp.movimientos_bancarios`                                   |
|  **2,421** | SR Group    | Movimientos Banamex             | same                                                             |
|  **2,115** | DILESA      | Lotes                           | ⚠️ `erp.lotes`                                                   |
|  **1,929** | ANSA-Ventas | Cliente                         | ⚠️ `erp.clientes`                                                |
|  **1,748** | DILESA      | Plantilla Tareas Construcción   | ❌                                                               |
|  **1,706** | ANSA-Ventas | Facturas Compra Unidades        | ⚠️ `erp.vehiculos` + `erp.facturas`                              |
|  **1,611** | RDB         | Pedidos Waitry                  | ✅ `rdb.waitry_pedidos` (10,746)                                 |
|  **1,590** | DILESA      | Inventario (inmobiliario)       | ⚠️ `erp.lotes`                                                   |
|  **1,541** | ANSA-Ventas | Facturas Venta Unidades         | ⚠️ `erp.ventas_autos` + `erp.facturas`                           |
|  **1,523** | SR Group    | Movimientos IBC                 | ⚠️ `erp.movimientos_bancarios`                                   |
|  **1,462** | ANSA-Ventas | Avanzadas (ventas planificadas) | ⚠️ `erp.ventas_autos`                                            |
|  **1,449** | RDB         | Pagos Waitry                    | ✅ `rdb.waitry_pagos`                                            |
|  **1,443** | ANSA-Ventas | Programación de Entrega         | ⚠️ `erp.ventas_autos`                                            |
|  **1,411** | DILESA      | Clientes DILESA                 | ⚠️ `erp.clientes`                                                |
|  **1,372** | DILESA      | Construcción por Lote           | ❌                                                               |
|  **1,249** | DILESA      | Tareas                          | ✅ `erp.tasks` (1,253) — **match casi perfecto**                 |
|  **1,240** | DILESA      | Urbanización por Lote           | ❌                                                               |
|  **1,132** | DILESA      | CUV (RUV)                       | ❌                                                               |
|  **1,079** | DILESA      | Escrituración Total             | ⚠️ `erp.documentos` (60) — parcial                               |
|  **1,060** | DILESA      | Depósitos Clientes              | ❌ (pagos inmobiliarios)                                         |
|    **918** | RDB         | Entradas inventario             | ✅ `erp.movimientos_inventario` (14,895)                         |
|    **796** | SR Group    | Registros Pendientes Banamex    | ⚠️ `erp.conciliaciones`                                          |
|    **719** | DILESA      | Juntas                          | ✅ `erp.juntas` (720) — **match perfecto**                       |
|    **698** | RDB         | Detalle Requisición             | ✅                                                               |
|    **517** | SR Group    | Facturas                        | ⚠️ `erp.facturas`                                                |

---

## 2. Módulos agrupados por estado

### ✅ Ya en BSOP con datos (RDB prácticamente completo)

| Módulo BSOP              | Origen Coda    |      Rows BSOP | Estado                                     |
| ------------------------ | -------------- | -------------: | ------------------------------------------ |
| Empleados/Puestos/Depts  | DILESA + RDB   |       212/53/8 | ✅ funcional                               |
| Tasks                    | DILESA + RDB   |          1,253 | ✅ funcional, pegado a Coda DILESA (1,249) |
| Juntas                   | DILESA         |            720 | ✅ pegado a Coda DILESA (719)              |
| Cortes de caja           | RDB            |            433 | ✅ funcional                               |
| Movimientos caja         | RDB            |            409 | ✅ funcional                               |
| Productos                | RDB            |            310 | ✅ funcional                               |
| Inventario + movimientos | RDB            |   283 + 14,895 | ✅ funcional                               |
| Requisiciones            | RDB            |            188 | ✅ funcional                               |
| OCs                      | RDB            |            160 | ✅ funcional                               |
| Proveedores              | RDB + DILESA   |             48 | ✅ funcional                               |
| Documentos (escrituras)  | DILESA parcial |             60 | ⚠️ falta 1,019 de Escrituración Total      |
| Waitry POS               | RDB            | 10,746 pedidos | ✅ funcional (cron sync)                   |
| Playtomic                | RDB            | 1,442 bookings | ✅ funcional (cron sync)                   |

**Insight**: RDB está **casi 100% migrado**. Solo faltan: Carga Física / Cierres (audits 247+235 rows) y el reporte de conteo (2,995 rows que son detail de carga física).

### ⚠️ Estructura en BSOP, 0 rows, falta migrar + UI

Ordenado por **uso real en Coda** + **leverage cross-empresa**:

| Módulo                           | Empresas que lo usan                                    |                           Rows Coda | Prioridad | Razón                                         |
| -------------------------------- | ------------------------------------------------------- | ----------------------------------: | --------- | --------------------------------------------- |
| **Gastos** 🔁                    | SR + DILESA + ANSA + RDB                                |            3,496 (SR) + desglose 81 | **alta**  | 4 empresas, volumen alto, control financiero  |
| **Movimientos bancarios** 🔁     | SR (AMEX+Banamex+IBC) + ANSA (BBVA) + DILESA            |      6,554 SR + 569 ANSA + ? DILESA | **alta**  | Cross-empresa, volumen altísimo               |
| **Cuentas bancarias** 🔁         | Base de Movimientos bancarios                           |                         ~10 cuentas | **alta**  | Prerequisito para movimientos                 |
| **Citas**                        | ANSA (servicio + ventas) + DILESA (visitas obra futuro) |                 4,749 + 4,539 + 150 | **alta**  | ANSA lo usa A DIARIO                          |
| **Facturas** 🔁                  | SR (fiscal) + ANSA (compra/venta autos) + DILESA futuro | 517 SR + 1,706 compra + 1,541 venta | **alta**  | Fiscal + operativo                            |
| **Clientes** 🔁                  | DILESA + ANSA Ventas                                    |                       1,411 + 1,929 | **alta**  | Prerequisito para ventas inmobiliaria y autos |
| **Conciliaciones bancarias** 🔁  | SR (Registros Pendientes)                               |              796+331+193+85 = 1,405 | media     | Depende de Movimientos                        |
| **Pagos provisionales**          | SR (fiscal ISR)                                         |                                 219 | media     | Time-sensitive                                |
| **Recepciones de OC** 🔁         | RDB + DILESA + ANSA futuro                              |                    ~cantidad de OCs | media     | Cierra ciclo de compras                       |
| **Lotes (inmobiliario)**         | DILESA                                                  |                               2,115 | media     | Grande pero DILESA-exclusivo                  |
| **Proyectos**                    | DILESA                                                  |                       ~50 proyectos | media     | Prerequisito para Lotes/Ventas                |
| **Ventas inmobiliarias**         | DILESA                                                  |                   ~1,000 (deducido) | media     | Depende de Lotes + Clientes                   |
| **Ventas autos**                 | ANSA Ventas                                             |       1,541 venta + 1,462 avanzadas | media     | ANSA-exclusivo                                |
| **Vehículos (inventario autos)** | ANSA Ventas                                             |                          1,706 VINs | media     | ANSA-exclusivo                                |
| **Turnos** 🔁                    | RDB + ANSA + DILESA                                     |                            catálogo | baja      | Se puede hardcodear                           |
| **Activos** 🔁                   | ANSA (resguardos) + SR                                  |                              varios | baja      | Nice-to-have                                  |
| **Conteo denominaciones**        | RDB                                                     |                           0 en Coda | baja      | Feature nueva                                 |

### ❌ Schema NO existe en BSOP — diseñar nuevo

| Módulo Coda                        | Empresas          |        Rows Coda | Vale la pena?   | Comentario                                               |
| ---------------------------------- | ----------------- | ---------------: | --------------- | -------------------------------------------------------- |
| **Cargas Combustible**             | DILESA Maquinaria |            8,372 | sí              | Alto uso. Reddiseñable como "movimientos de activo"      |
| **Horas Máquina**                  | DILESA Maquinaria |            6,968 | sí              | Alto uso. Same pattern                                   |
| **Acarreos**                       | DILESA Maquinaria |            4,921 | sí              | Alto uso. Same pattern                                   |
| **Tareas Construcción Terminadas** | DILESA            |           18,644 | sí              | Historia de construcción; tal vez fundir con `erp.tasks` |
| **Plantilla Tareas Construcción**  | DILESA            |            1,748 | sí              | Templates; podría ser `erp.task_templates`               |
| **Construcción por Lote**          | DILESA            |            1,372 | sí              | Avance de obra                                           |
| **Urbanización por Lote**          | DILESA            |            1,240 | sí              | Avance urbanización                                      |
| **Depósitos Clientes**             | DILESA            |            1,060 | sí              | Pagos inmobiliarios (ligado a cobranza)                  |
| **CUV** (RUV)                      | DILESA            |            1,132 | sí              | Clave Única de Vivienda                                  |
| **Documentos RUV**                 | DILESA            |              169 | sí              | INFONAVIT trámites                                       |
| **Urgencias RUV**                  | DILESA            |              256 | sí              | same                                                     |
| **Sueldos y Salarios**             | SR Group          |              162 | sí              | Fiscal personal                                          |
| **Tablas ISR**                     | SR Group          |              989 | **NO**          | Catálogo SAT, reference data — usar servicio externo     |
| **Activos financieros SR**         | SR Group          |              <50 | baja            | Inversiones personales                                   |
| **Urbanización** (19 sub-módulos)  | DILESA            | cada uno bajo 1k | **NO replicar** | Rediseñar como "avances por partida"                     |

### ∅ Views/formularios muertos — NO migrar

- Todas las tablas `View of X`, `*X`, `Temp X`, `Alta X`, `Consulta X`, `Captura X`, `Resumen X` — son UI de Coda que en BSOP ya no necesitamos (se resuelve con CRUD nativo).
- **Catálogos de Vehículos Mensuales** (ANSA-Ventas tiene 12 snapshots) — 1 tabla + columna temporal.

---

## 3. Orden propuesto (post-torneo)

Basado en: uso real + leverage cross-empresa + dependencias + tu guía de "habilitar los que realmente utilizamos".

### **Semana 1 (post-torneo) — Terminar RH "all-in"**

Objetivo: sacar RH de Coda para DILESA + RDB + empezar en ANSA.

1. **Polir Empleados/Puestos/Depts** en BSOP (ya existen):
   - Agregar `erp.empleados_compensacion` UI (ya tiene 85 rows, sin UI)
   - Agregar `Actividades Laborales` de ANSA (272 rows) → `erp.empleados_actividades` (schema nuevo)
   - Agregar `Funciones Laborales` (143 rows) → puede ir como `erp.puestos.funciones` (JSONB)
   - Agregar `Ex-Empleados` (DILESA 205 + ANSA 85) como vista de `erp.empleados WHERE activo = false` + fechas baja
2. **Cutover RH** en Coda DILESA + RDB + ANSA: watermark "migrado"

**Entregable**: RH 100% en BSOP para 3 empresas, Coda read-only para RH.

### **Semana 2 — Cuentas + Movimientos bancarios (cross-empresa)** 🔁

Objetivo: control financiero unificado. Construir **una vez**, usar en 4 empresas.

1. **Schema `erp.cuentas_bancarias`** ya existe (0 rows)
   - Definir 6-10 cuentas (AMEX SR, Banamex SR, IBC SR, BBVA ANSA, cuentas DILESA)
2. **Migrar `erp.movimientos_bancarios`**:
   - AMEX (2,610) → Banamex (2,421) → IBC (1,523) → BBVA ANSA (569)
   - Total: ~7,100 movimientos
3. **UI `BancosModule`** siguiendo el patrón:
   - `components/bancos/bancos-module.tsx` con scope empresa/user-empresas
   - Filtros: cuenta, rango fechas, tipo movimiento, estado (conciliado/pendiente)
4. **Conciliaciones** (SR Pendientes = 1,405 rows)
   - Matching automático por fecha+monto con `erp.gastos` y `erp.facturas`
   - Reglas por banco

**Entregable**: Beto puede ver movimientos de las 4 empresas en un solo dashboard BSOP.

### **Semana 3 — Gastos (cross-empresa)** 🔁

Objetivo: el módulo financiero más usado (3,496 gastos SR).

1. **Migrar `erp.gastos`** de SR (3,496) + diseñar captura para DILESA/ANSA/RDB
2. **Sub-categorías** (SR: 73 sub-categorías)
3. **UI GastosModule**:
   - Captura rápida (móvil-friendly)
   - Asociación con factura (si hay) y movimiento bancario (si ya se pagó)
4. **Reportes**: gasto mensual por empresa, por categoría

**Entregable**: Gastos unificados en BSOP para las 4 empresas.

### **Semana 4 — Citas (ANSA)**

Objetivo: desbloquear ANSA completo (es lo que más usan a diario).

1. **Migrar `erp.citas`** de ANSA (4,749 + 4,539 día = 9,288 rows)
2. **UI `CitasModule`**:
   - Vista día (Citas del Día Servicio + Día Ventas)
   - Filtros por asesor, estado, tipo
   - Integración con `erp.empleados` (asesor) y `erp.personas` (cliente)

**Entregable**: ANSA Servicio operando en BSOP.

### **Semana 5-6 — Facturas + Fiscal** 🔁

Objetivo: pipeline fiscal básico.

1. **`erp.facturas`** — compra (ANSA 1,706) + venta (ANSA 1,541) + SR (517)
2. **`erp.pagos_provisionales`** (SR 219)
3. **UI FiscalModule** + relación con Gastos y Movimientos bancarios

### **Semana 7-8 — Clientes + DILESA Inmobiliario (fase 1)**

Objetivo: arrancar el núcleo inmobiliario de DILESA.

1. **`erp.clientes`** (DILESA 1,411 + ANSA Ventas 1,929 = 3,340)
2. **`erp.proyectos`** (pocos, ~50)
3. **`erp.lotes`** (2,115)
4. **UI ProyectosModule + LotesModule**

### **Semana 9+ — DILESA Maquinaria**

Rediseño grande: 3 tablas Coda (combustible/horas/acarreos) → 1 tabla unificada `erp.maquinaria_movimientos` con tipo + equipo + proyecto + cantidad.

### **Semana 10+ — Ventas inmobiliarias + contratos + cobranza DILESA**

Completar el ciclo de venta DILESA.

### **Más adelante (lower priority)**

- ANSA Automotriz (vehiculos + ventas autos + taller) — 6-8 semanas
- DILESA Construcción (contratos contratistas, supervisión, prototipos) — 4-6 semanas
- DILESA Urbanización (rediseñado) — 4-6 semanas
- DILESA RUV (CUV + DTUs + INFONAVIT) — 3-4 semanas
- SR Group Budget/Flujo/Estado de Resultados — features de reporte que dependen de Gastos + Facturas

---

## 4. Cross-empresa winners (build once, use N times)

Esto es donde **ganamos leverage real**. Un solo módulo BSOP sirve a múltiples empresas:

| Módulo                | Empresas servidas                                    |         Leverage |
| --------------------- | ---------------------------------------------------- | ---------------: |
| Gastos                | 4 (DILESA, ANSA, SR, RDB)                            |               4x |
| Facturas              | 3+ (SR fiscal, ANSA autos, DILESA futuro)            |               3x |
| Movimientos bancarios | 4                                                    |               4x |
| Conciliaciones        | 4                                                    |               4x |
| Cuentas bancarias     | 4                                                    |               4x |
| Clientes              | 3 (DILESA, ANSA, RDB futuro)                         |               3x |
| Citas                 | 2+ (ANSA, DILESA futuro)                             |               2x |
| Empleados/RH          | 4 (todas)                                            | 4x — ya hecho ✅ |
| Tasks                 | 4 (todas)                                            | 4x — ya hecho ✅ |
| Juntas                | 4 (todas)                                            | 4x — ya hecho ✅ |
| Proveedores           | 3 (DILESA, RDB, ANSA futuro)                         | 3x — ya hecho ✅ |
| Documentos            | 4 (todas — escrituras, contratos, facturas, recibos) | 4x — ya hecho ✅ |
| Activos               | 3 (ANSA, SR, DILESA maquinaria)                      |               3x |

**Insight**: los siguientes 5-6 módulos que salgan (Gastos, Bancos, Citas, Facturas, Clientes, Conciliaciones) resuelven **muchísimo** para las 4 empresas de un solo golpe.

---

## 5. Lo que ANSA-Ventas tiene pero no atacamos aún

ANSA-Ventas es el doc más grande en densidad de uso (8k+ rows activos). Complejo porque toca: vehículos VIN, facturación SAT, programación entregas, asignación, costeo.

**Estrategia sugerida**: no arrancar ANSA-Ventas hasta que esté el módulo Facturas genérico + Clientes cross-empresa + Vehículos. Cuando esos 3 estén, ANSA-Ventas se arma con 60% menos esfuerzo.

---

## 6. Lo que DILESA Urbanización realmente necesita

Los 19 sub-módulos de urbanización (excavación sanitaria, línea agua, pozo visita, transformador, carpeta asfáltica, etc.) son el "god module" de DILESA. No tiene sentido crear 19 tablas en BSOP.

**Propuesta de rediseño** (para cuando toquemos esto):

```
erp.obra_partidas (id, nombre, categoria, unidad, costo_estandar)
erp.obra_avances (id, lote_id, partida_id, fecha, cantidad, costo_real, responsable, evidencia_url)
```

Un solo par de tablas + `categoria` = "urbanización" | "construcción" + `partida` identifica el tipo de avance. **Reemplaza 19 tablas con 2**.

---

_Actualizado: 2026-04-18 (post row-count audit de los 5 docs)._
