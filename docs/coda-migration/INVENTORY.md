# Coda → BSOP — Inventory & Migration Map

> **Fuente de este audit**: combinación de
>
> - Datos previos de OpenClaw (`data/coda.json`, auditoría 2026-03-23)
> - Coda REST API directa (este audit, 2026-04-18) — `CODA_API_KEY` en 1Password
> - Supabase MCP listing de `ybklderteyhuugzfmxbi` (este audit)
>
> **Regla operativa**: nada se mueve/modifica en Coda sin aprobación explícita de Beto. Este documento es **solo inventario y plan**.

---

## 1. Docs Coda — estado actual

Los 5 docs siguen activos (todos `updatedAt` esta semana). Owner: `beto@anorte.com`.

| Doc         | docId        | Tablas (API) |   Pages |                Health\* | Last update |
| ----------- | ------------ | -----------: | ------: | ----------------------: | ----------- |
| DILESA      | `ZNxWl_DI2D` |          256 |     100 | 0.62 avg · 26 high-risk | 2026-04-18  |
| ANSA        | `pnqM3j0Yal` |           59 |      76 |  0.32 avg · 1 high-risk | 2026-04-18  |
| ANSA Ventas | `vVmCl2wBfC` |           77 |      74 |  0.27 avg · 4 high-risk | 2026-04-18  |
| RDB         | `yvrM3UilPt` |           45 |      46 |  0.20 avg · 2 high-risk | 2026-04-18  |
| SR Group    | `MaXoDlRxXE` |           58 |      43 |  0.05 avg · 0 high-risk | 2026-04-12  |
| **Total**   |              |      **495** | **339** |                         |             |

_\*Health score del audit OpenClaw: 0=clean, 7=max risk. "High-risk" = tablas con score ≥ 5 (exceso de columnas, lógica sobrecargada, fórmulas anidadas)._

### Patrón común observado

Cada doc repite la misma estructura mental:

- **Tablas fuente** (los datos reales) — p. ej. `Personal`, `Citas`, `Cortes de Caja`
- **Tablas de captura/alta** (`Alta X`, `Registra X`) — formularios one-shot que escriben a la fuente
- **Tablas de consulta** (`Consulta X`) — views/filtros
- **Tablas de reporte** (`Resumen X`, `Reporte X`) — agregados
- **Tablas espejo/staging** (`Temp X`, `View of X`, `*X`) — cache intermedia

En BSOP **no reproducimos este modelo**. Un CRUD en una tabla fuente reemplaza todos estos niveles.

---

## 2. Módulos Coda por doc

### DILESA (100 pages, 256 tablas)

6 módulos top-level:

- **Administración** → Recursos Humanos (Personal, Puestos, Depts, Competencias, KPIs, Políticas), Depósitos, Juntas, Tareas, Escrituras, Saldos Bancos
- **Presupuestos** → Partidas presupuestales, Gastos
- **Proyectos** → Terrenos, Anteproyectos, Proyectos, Lotes, Documentos
  - **Urbanización** (19 sub-módulos: excavación, líneas sanitaria/agua, pozos, transformadores, carpetas, banquetas, liberaciones CFE/SIMAS…)
  - **RUV** → Altas/Consultas frente RUV, DTUs, Extracción, Pago seguro
- **Maquinaria** → Equipos, Clientes, Proyectos, Cargas combustible, Acarreos, Horas máquina
- **Construcción** → Contratos, Contratistas, Supervisión (bitácora, termina vivienda), Prototipos, Costo materiales, Checklist
- **Ventas** → Inventario, Fase de Venta, Comité, Solicitud asignación

### ANSA (76 pages, 59 tablas)

3 módulos:

- **Citas** → catálogo, Citas del Día Servicio, Citas del Día Ventas, Reporte
- **Administración** → Personal (alta/baja/consulta), Puestos, Departamentos, Activos, Proveedores, Resguardos
- **Recursos Humanos** → Competencias, Funciones, KPIs, Cumpleañeros

### ANSA Ventas (74 pages, 77 tablas)

2 módulos:

- **Administración** → Catálogos CFDI, Catálogo vehículos (12 versiones mensuales!), Carga Factura, Asignación/Apartado, Beneficiarios controladores, Accesorios
- **Asesores** → Asesores de ventas, Mis Clientes

### RDB (46 pages, 45 tablas)

7 módulos:

- **Productos** → Catálogo, Categorías, IVA, Estatus
- **Inventario** → Ajustes, Almacenes, Carga física, Cierres, Conteos, Entradas/Salidas, Inventario a fecha
- **Requisiciones** → Nueva, Detalle, Autoriza, Convierte a OC
- **Orden de Compra** → OCs, Detalle, Consulta, Impresión
- **Cortes de Caja** → Cortes, Movimientos, Denominaciones, Corte Actual
- **Ventas** → (Waitry POS integration)
- **Datos** — catálogos base

### SR Group (43 pages, 58 tablas)

11 módulos (financieros/personales):

- **Recibos Casa SR** (rentas)
- **Pagos Provisionales** (ISR)
- **Declaraciones** (anual y provisional)
- **Registros / Budget / Estado de Resultados / Ingresos / Gastos / Flujo / Activos / Fiscal**
- Movimientos bancarios AMEX, Banamex, BBVA, IBC

---

## 3. Estado BSOP/Supabase (lo que ya existe)

Schema de producción: `ybklderteyhuugzfmxbi`. Fuente: `supabase/SCHEMA_REF.md` + MCP listing.

### ✅ Operativo con datos

| Área              | Tablas                                                                     |                        Rows | Origen                     |
| ----------------- | -------------------------------------------------------------------------- | --------------------------: | -------------------------- |
| Auth/RBAC         | `core.usuarios, empresas, modulos, roles, permisos_rol, usuarios_empresas` |              5/6/22/5/66/14 | BSOP nativo                |
| RH cross-empresa  | `erp.personas, empleados, empleados_compensacion`                          |                  260/212/85 | Migrado Coda DILESA/RDB    |
| RH organigrama    | `erp.departamentos, puestos`                                               |                        8/53 | Migrado Coda               |
| Proveedores       | `erp.proveedores`                                                          |                          48 | Migrado Coda               |
| Productos/precios | `erp.productos, productos_precios`                                         |                     310/310 | BSOP + waitry map          |
| Inventario        | `erp.almacenes, inventario, movimientos_inventario`                        |                1/283/14,895 | BSOP activo                |
| Compras           | `erp.requisiciones, _detalle, ordenes_compra, _detalle`                    |               188/4/160/656 | Migrado desde rdb.\*       |
| Tasks             | `erp.tasks, task_updates, task_comentarios`                                |                    1253/5/— | BSOP nativo                |
| Juntas            | `erp.juntas, juntas_asistencia, juntas_notas`                              |                     720/5/0 | Migrado Coda DILESA        |
| Cortes RDB        | `erp.cortes_caja, movimientos_caja, cajas`                                 |                   433/409/5 | Migrado Coda + Waitry sync |
| Docs legales      | `erp.documentos`                                                           |                          60 | Migrado escrituras DILESA  |
| Waitry POS        | `rdb.waitry_inbound, pedidos, productos, pagos`                            | 10,746/10,746/15,214/10,846 | Cron sync-cortes           |
| Playtomic         | `playtomic.bookings, players, participants, resources, sync_log`           |      1,442/705/4,179/19/377 | Cron sync                  |

### ⚠️ Estructura lista, 0 rows (tablas creadas esperando UI + migración)

| Área                    | Tablas                                                                                     | Empresa principal              | Coda fuente                               |
| ----------------------- | ------------------------------------------------------------------------------------------ | ------------------------------ | ----------------------------------------- |
| Clientes                | `erp.clientes`                                                                             | Cross-empresa                  | Coda `Clientes`                           |
| Citas                   | `erp.citas`                                                                                | ANSA (servicio/ventas), DILESA | Coda Citas                                |
| Aprobaciones            | `erp.aprobaciones`                                                                         | Cross-empresa                  | Nuevo — no existe en Coda                 |
| Turnos                  | `erp.turnos`                                                                               | RDB (cajeros), ANSA            | Coda parcial                              |
| Bancos                  | `erp.cuentas_bancarias, movimientos_bancarios, conciliaciones`                             | SR Group, DILESA, ANSA         | Coda SR movimientos AMEX/Banamex/BBVA/IBC |
| Gastos                  | `erp.gastos`                                                                               | SR Group, DILESA, ANSA         | Coda Gastos                               |
| Fiscal                  | `erp.facturas, pagos_provisionales`                                                        | SR Group                       | Coda SR Fiscal                            |
| Recepciones             | `erp.recepciones, _detalle`                                                                | Cross-empresa                  | Coda Entradas Almacén                     |
| Activos                 | `erp.activos, activos_mantenimiento`                                                       | ANSA (resguardos), SR Group    | Coda Activos                              |
| Conteo denomin.         | `erp.corte_conteo_denominaciones`                                                          | RDB                            | Coda Denominaciones                       |
| **DILESA inmobiliario** | `erp.proyectos, lotes, ventas_inmobiliarias, contratos, cobranza, pagos`                   | DILESA                         | Coda DILESA Proyectos+Ventas              |
| **ANSA automotriz**     | `erp.vehiculos, ventas_autos, ventas_tickets, ventas_refacciones_detalle, taller_servicio` | ANSA                           | Coda ANSA+ANSA Ventas                     |

### ❌ No existe en BSOP todavía

Todo lo de DILESA **Urbanización** (19 sub-módulos de construcción civil detallada), **RUV** (DTUs, trámites INFONAVIT), **Presupuestos** (partidas, gastos), **Construcción** (contratos, supervisión, prototipos). Tampoco ANSA **Competencias Laborales** / **KPIs** / **Resguardos activos**. Tampoco SR Group nada (budget, flujo, pagos provisionales, declaraciones).

---

## 4. Patrón de mapeo observado

Para cada módulo Coda, **no copiamos la estructura — rediseñamos**:

### Lo que NO se traduce

- Tablas espejo (`*Tabla`, `View of X`, `Temp X`) → UI filtros/views en BSOP
- Tablas formulario (`Alta X`, `Registra X`, `Captura X`) → dialog/sheet CRUD en BSOP
- Tablas reporte (`Resumen X`, `Consulta X`) → views SQL o memoized selectors en UI
- Tablas catálogo de catálogos (`Catálogo Vehículos Enero 2023`, `...Febrero 2023`, etc.) → 1 tabla con columna temporal

### Lo que SÍ se traduce

- Tabla fuente → tabla Supabase
- Columnas de datos → columnas Postgres (parseando tipos de Coda)
- Relaciones referenciales → foreign keys
- Fórmulas/botones → lógica de servidor en endpoints BSOP
- Automation rules de Coda → cron jobs o triggers de Postgres

### Ejemplos ya aplicados

| Coda                                                                         | BSOP                                                                 |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| DILESA `Personal` + `Alta Personal` + `Consulta Personal` + `Baja Personal`  | `erp.empleados` + `EmpleadosModule`                                  |
| RDB `Cortes de Caja` + `*Cortes de Caja` + `Denominaciones` + `Corte Actual` | `erp.cortes_caja` + `movimientos_caja` + edge function `sync-cortes` |
| DILESA `Captura Juntas` (×3) + `Tareas Creadas y Terminadas en Junta`        | `erp.juntas` + `juntas_asistencia` + `juntas_notas` + `erp.tasks`    |

---

## 5. Próximos pasos (ver MIGRATION_PLAN.md)

1. **Inventario data-level por tabla fuente** — para cada módulo Coda priorizado, query ligera vía API Coda para contar rows y extraer schema de columnas → documentar en `docs/coda-migration/<doc>/<modulo>.md`
2. **Cruzar con tablas Supabase existentes** — si ya hay destino, planear el sync; si no, diseñar schema nuevo
3. **Priorizar orden de migración** — ver MIGRATION_PLAN.md

---

## Apéndice: Archivos fuente de este audit

Todos los archivos crudos del audit quedaron en `/tmp/coda-audit/` (local, no versionado):

- `dilesa-tables.json`, `dilesa-pages.json`
- `ansa-tables.json`, `ansa-pages.json`
- `ansa-ventas-tables.json`, `ansa-ventas-pages.json`
- `rdb-tables.json`, `rdb-pages.json`
- `sr-group-tables.json`, `sr-group-pages.json`

Si se requiere refrescar, correr los mismos curl comandos del `CODA_API_KEY` (ver `~/.openclaw/.env`).
