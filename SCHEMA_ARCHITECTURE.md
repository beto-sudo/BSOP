# BSOP — Arquitectura de Schemas

_Source of truth para la estructura de base de datos. Actualizar aquí cuando se mueva, cree o elimine algo._

---

## Principio rector

| Scope                  | Schema              | Descripción                                                                                                                                                                 |
| ---------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Multi-empresa**      | `erp`               | Todo lo compartido entre empresas: personas, empleados, tareas, juntas, productos, inventario, cortes, compras, documentos, etc. Cada tabla tiene `empresa_id` como filtro. |
| **Plataforma**         | `core`              | Auth, acceso y permisos. Usuarios, roles, módulos, permisos. **No hay lógica de negocio aquí.**                                                                             |
| **Empresa-específico** | `rdb`               | Lógica exclusiva de Rincón del Bosque: Waitry (POS), duplicados, inventario RDB-específico.                                                                                 |
| **Empresa-específico** | `dilesa` _(futuro)_ | Cuando se necesite lógica exclusiva de DILESA que no aplique a otras empresas.                                                                                              |
| **Integración**        | `playtomic`         | Canchas: reservas, participantes, jugadores. Alimentado por API Playtomic.                                                                                                  |
| **Personal / Health**  | `public`            | Salud (Apple Watch), usage tracking, perfil. No es operativo-empresarial.                                                                                                   |

---

## Schema: `core` — Auth y Acceso

Solo plataforma. Sin lógica de negocio.

| Tabla                        | Rows | Descripción                                     | Status       |
| ---------------------------- | ---- | ----------------------------------------------- | ------------ |
| `usuarios`                   | 5    | Usuarios de la plataforma (email, nombre, auth) | ✅ Activa    |
| `empresas`                   | 6    | Catálogo de empresas                            | ✅ Activa    |
| `roles`                      | 5    | Roles de acceso                                 | ✅ Activa    |
| `modulos`                    | 22   | Módulos del sistema                             | ✅ Activa    |
| `usuarios_empresas`          | 14   | Relación usuario↔empresa con rol                | ✅ Activa    |
| `permisos_rol`               | 66   | Permisos por rol por módulo                     | ✅ Activa    |
| `permisos_usuario_excepcion` | 0    | Excepciones de permisos por usuario             | ✅ Activa    |
| `documentos`                 | 59   | Documentos operativos                           | ✅ Activa    |
| `empleados`                  | 0    | ❌ Vacía, reemplazada por `erp.empleados`       | 🗑️ Eliminada |
| `juntas`                     | 0    | ❌ Vacía, reemplazada por `erp.juntas`          | 🗑️ Eliminada |
| `junta_participantes`        | 0    | ❌ Vacía                                        | 🗑️ Eliminada |
| `junta_tareas`               | 0    | ❌ Vacía (ya dropped por cascade)               | 🗑️ Eliminada |
| `junta_adjuntos`             | 0    | ❌ Vacía                                        | 🗑️ Eliminada |
| `notifications`              | 0    | ❌ Vacía, sin uso                               | 🗑️ Eliminada |
| `attachments`                | 0    | ❌ Vacía, sin uso                               | 🗑️ Eliminada |

---

## Schema: `erp` — Operación Multi-empresa

Todas las tablas tienen `empresa_id`. Filtrar por empresa para separar datos.

### Personas y Empleados

| Tabla                    | Rows | Descripción                                      |
| ------------------------ | ---- | ------------------------------------------------ |
| `personas`               | 260  | Directorio de personas (todas las empresas)      |
| `empleados`              | 212  | Empleados activos vinculados a persona + empresa |
| `empleados_compensacion` | 85   | Sueldos, prestaciones, comisiones                |
| `puestos`                | 52   | Catálogo de puestos                              |
| `departamentos`          | —    | Departamentos por empresa                        |

### Tareas y Juntas

| Tabla               | Rows  | Descripción                                                                       |
| ------------------- | ----- | --------------------------------------------------------------------------------- |
| `tasks`             | 1,251 | Tareas operativas (pendiente/en_progreso/bloqueado/completado/cancelado)          |
| `task_updates`      | 0     | Bitácora de actualizaciones por tarea (avance, cambio_estado, cambio_fecha, nota) |
| `task_comentarios`  | 0     | ⚠️ ¿Redundante con task_updates? Revisar                                          |
| `juntas`            | 719   | Juntas/reuniones con minuta                                                       |
| `juntas_asistencia` | —     | Asistencia a juntas                                                               |
| `juntas_notas`      | 0     | Notas de juntas                                                                   |

### Inventario y Productos

| Tabla                    | Rows   | Descripción              |
| ------------------------ | ------ | ------------------------ |
| `productos`              | 310    | Catálogo de productos    |
| `productos_precios`      | 310    | Precios por producto     |
| `inventario`             | 283    | Stock actual             |
| `movimientos_inventario` | 14,000 | Historial de movimientos |
| `almacenes`              | 1      | Almacenes                |
| `lotes`                  | 0      | Lotes de producción      |

### Compras

| Tabla                    | Rows | Descripción             |
| ------------------------ | ---- | ----------------------- |
| `requisiciones`          | 188  | Requisiciones de compra |
| `ordenes_compra`         | 160  | Órdenes de compra       |
| `ordenes_compra_detalle` | 656  | Detalle de órdenes      |
| `recepciones`            | 0    | Recepción de mercancía  |
| `recepciones_detalle`    | 0    | Detalle de recepciones  |
| `proveedores`            | —    | Catálogo de proveedores |

### Finanzas y Cajas

| Tabla                   | Rows | Descripción                      |
| ----------------------- | ---- | -------------------------------- |
| `cortes_caja`           | 427  | Cortes de caja (abierto/cerrado) |
| `movimientos_caja`      | 396  | Depósitos, retiros, etc.         |
| `cajas`                 | 5    | Catálogo de cajas                |
| `facturas`              | 0    | Facturación                      |
| `pagos`                 | 0    | Pagos                            |
| `cobranza`              | 0    | Cobranza                         |
| `cuentas_bancarias`     | 0    | Cuentas bancarias                |
| `movimientos_bancarios` | 0    | Movimientos bancarios            |
| `conciliaciones`        | 0    | Conciliaciones bancarias         |
| `pagos_provisionales`   | 0    | Pagos provisionales (fiscal)     |
| `gastos`                | 0    | Control de gastos                |

### Ventas

| Tabla                        | Rows | Descripción              |
| ---------------------------- | ---- | ------------------------ |
| `ventas_autos`               | 0    | Ventas ANSA (futuro)     |
| `ventas_inmobiliarias`       | 0    | Ventas DILESA (futuro)   |
| `ventas_tickets`             | 0    | Ventas RDB tickets       |
| `ventas_refacciones_detalle` | 0    | Detalle refacciones ANSA |

### Otros

| Tabla                   | Rows | Descripción                       |
| ----------------------- | ---- | --------------------------------- |
| `documentos`            | 59   | Documentos operativos             |
| `activos`               | 0    | Activos fijos                     |
| `activos_mantenimiento` | 0    | Mantenimiento de activos          |
| `vehiculos`             | 0    | Flota vehicular                   |
| `proyectos`             | 0    | Proyectos                         |
| `contratos`             | 0    | Contratos                         |
| `aprobaciones`          | 0    | Flujo de aprobaciones             |
| `turnos`                | 0    | Turnos de personal                |
| `taller_servicio`       | 0    | Servicios de taller ANSA (futuro) |
| `clientes`              | 0    | Catálogo de clientes              |

---

## Schema: `rdb` — Rincón del Bosque (específico)

Lógica exclusiva de RDB que no aplica a otras empresas.

### Waitry (POS)

| Tabla                         | Rows   | Descripción                                        |
| ----------------------------- | ------ | -------------------------------------------------- |
| `waitry_inbound`              | 9,917  | Payload crudo del webhook                          |
| `waitry_pedidos`              | 9,917  | Pedidos procesados (FK corte_id → erp.cortes_caja) |
| `waitry_productos`            | 14,014 | Productos por pedido                               |
| `waitry_pagos`                | 10,026 | Pagos por pedido                                   |
| `waitry_duplicate_candidates` | 841    | Candidatos a duplicado                             |

### Inventario RDB

| Tabla           | Rows | Descripción                 |
| --------------- | ---- | --------------------------- |
| `inv_ajustes`   | 0    | Ajustes de inventario       |
| `inv_entradas`  | 0    | Entradas de inventario      |
| `inv_productos` | 0    | Productos de inventario RDB |

### Legacy (candidatas a eliminar)

| Tabla                           | Rows | Descripción                             | Status                                 |
| ------------------------------- | ---- | --------------------------------------- | -------------------------------------- |
| `cortes_legacy`                 | 426  | Cortes pre-migración → erp.cortes_caja  | 🔴 Eliminar cuando se confirme sin FKs |
| `movimientos_legacy`            | 401  | Movimientos pre-migración               | 🔴 Eliminar                            |
| `productos_legacy`              | 310  | Productos pre-migración → erp.productos | 🔴 Eliminar                            |
| `cajas_legacy`                  | 5    | Cajas pre-migración → erp.cajas         | 🔴 Eliminar                            |
| `ordenes_compra_items_legacy`   | 656  | OC items pre-migración                  | 🔴 Eliminar                            |
| `requisiciones_items_legacy`    | 4    | Requi items pre-migración               | 🔴 Eliminar                            |
| `inventario_movimientos_legacy` | 816  | Movimientos inv pre-migración           | 🔴 Eliminar                            |

---

## Schema: `playtomic` — Canchas

| Tabla                  | Rows  | Descripción               |
| ---------------------- | ----- | ------------------------- |
| `bookings`             | 1,403 | Reservas de canchas       |
| `booking_participants` | 4,152 | Participantes por reserva |
| `players`              | 697   | Jugadores registrados     |

---

## Schema: `public` — Personal / Health / Platform

| Tabla                | Rows   | Descripción            | Status              |
| -------------------- | ------ | ---------------------- | ------------------- |
| `health_metrics`     | 93,841 | Métricas Apple Watch   | ✅ Activa           |
| `health_workouts`    | 0      | Workouts               | ✅ Estructura lista |
| `health_ingest_log`  | 99     | Log de ingesta         | ✅                  |
| `health_ecg`         | 0      | ECG                    | ✅                  |
| `health_medications` | 0      | Medicamentos           | ✅                  |
| `usage_messages`     | 500    | Mensajes OpenClaw      | ✅                  |
| `usage_summary`      | 0      | Resumen de uso         | ✅                  |
| `profile`            | 5      | Perfil de usuarios     | ✅                  |
| `user_presence`      | 0      | Presencia              | 🟡 Sin uso          |
| `trip_expenses`      | 0      | Gastos de viaje        | 🟡 Sin uso          |
| `trip_participants`  | 0      | Participantes de viaje | 🟡 Sin uso          |

---

## Schema: `shared` — ⚠️ A eliminar

| Tabla     | Rows | Descripción      | Status                         |
| --------- | ---- | ---------------- | ------------------------------ |
| `monedas` | 2    | Catálogo MXN/USD | 🔴 Sin uso en código, eliminar |

---

## Acciones pendientes de limpieza

### 🔴 Eliminar (0 referencias en código, 0 datos útiles)

1. Tablas `*_legacy` en `rdb` (7 tablas) — datos migrados a `erp`

### 🟡 Revisar

1. `erp.task_comentarios` (0 rows) — ¿la dejamos o la eliminamos ahora que existe task_updates?

---

_Última actualización: 2026-04-15_
