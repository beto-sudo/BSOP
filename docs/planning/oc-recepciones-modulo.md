# Iniciativa — OC: Recepciones como módulo RBAC propio

**Slug:** `oc-recepciones-modulo`
**Empresas:** RDB golden; multi-empresa diferido (igual que `oc-recepciones` y `oc-cierre-ciclo`)
**Schemas afectados:** `core` (`modulos`, `permisos_rol`)
**Estado:** planned
**Dueño:** Beto
**Creada:** 2026-04-30
**Última actualización:** 2026-04-30 (promoción — alcance v1 cerrado, modo autónomo aprobado)

## Problema

Hoy todo el ciclo OC vive en un solo módulo RBAC (`rdb.ordenes_compra`) y un solo archivo ([`app/rdb/ordenes-compra/page.tsx`](../../app/rdb/ordenes-compra/page.tsx), ~1549 líneas tras `oc-recepciones` + `oc-cierre-ciclo`). Quien tenga `acceso_escritura=true` en ese módulo accede a TODAS las acciones: crear, asignar proveedor, editar líneas, override de precio, marcar enviada, imprimir, cerrar OC, cancelar OC, **y recibir mercancía**.

No hay forma de darle al Gerente solo la recepción de productos sin abrirle también la administración de la OC al proveedor. Beto necesita esa separación operativa: el Gerente recibe lo que llega, el Comprador/Director envía/cierra/cancela la OC.

## Outcome esperado

- **Dos módulos RBAC distintos**, dos páginas, mismas RPCs de DB.
  - `rdb.ordenes_compra` (existente): administración de la OC (Comprador/Director).
  - `rdb.recepciones` (nuevo): captura de recepciones + cancelación de pendiente por línea (Gerente y/o Comprador, según RBAC).
- **Cero duplicación de lógica DB**: las RPCs `erp.oc_recibir_linea`, `erp.oc_cancelar_pendiente_linea`, `erp.oc_cerrar_orden` ya existen y siguen vivas. Las dos páginas las consumen.
- **Backfill defensivo de permisos**: la migración clona los permisos actuales de `rdb.ordenes_compra` → `rdb.recepciones` por cada rol existente para preservar el comportamiento entre `apply` de la SQL y el ajuste fino manual que hace Beto. Sin esto, el módulo nuevo quedaría invisible a no-admins (regla de "Liberación de módulo nuevo (RBAC sync)" en `CLAUDE.md`).
- **Link cruzado** entre los dos módulos: desde el drawer de OC, link "Capturar recepciones →" navega a `/rdb/recepciones?focus={oc_id}`; el page de Recepciones soporta ese deep-link.

## División concreta de responsabilidades

### Queda en `rdb.ordenes_compra` (módulo actual)

| Acción                                                                           | Estado donde aplica                       |
| -------------------------------------------------------------------------------- | ----------------------------------------- |
| Crear OC borrador (líneas, productos, cantidades, `precio_unitario`)             | `borrador`                                |
| Asignar/cambiar proveedor                                                        | `borrador`                                |
| Editar líneas (productos, cantidades, `precio_unitario`)                         | `borrador`                                |
| Override de precio (`precio_real`) — admin only                                  | `borrador`                                |
| **Marcar Enviada** (`borrador → enviada`)                                        | `borrador` con proveedor asignado         |
| **Imprimir OC** (PDF formal con sello)                                           | `enviada / parcial / cerrada / cancelada` |
| **Cerrar OC** (`enviada/parcial → cerrada`, congela `total_a_pagar`)             | `enviada / parcial`                       |
| **Cancelar OC** (sin recepciones, `borrador/enviada → cancelada`)                | `borrador / enviada`                      |
| Vista de progreso por línea (Pedida/Recibida/Pendiente/Cancelada) — solo lectura | todos                                     |
| Banner "Listo para CxP"                                                          | `cerrada` con `total_a_pagar > 0`         |

### Se mueve a `rdb.recepciones` (módulo nuevo)

| Acción                                                         | Estado donde aplica |
| -------------------------------------------------------------- | ------------------- |
| Bandeja de OCs con pendiente de recibir                        | `enviada / parcial` |
| **Recibir N** por línea (input numérico + Aplicar)             | `enviada / parcial` |
| **Recibir Todo** (auto-rellenar al máximo recibible)           | `enviada / parcial` |
| **Cancelar pendiente de línea individual** + motivo            | `enviada / parcial` |
| Sección "Historial de recepciones" (movida desde drawer de OC) | todas               |
| Vista de progreso por línea — solo lectura                     | todos               |

**Razonamiento clave** (decisiones de Beto al promover):

- **"Cancelar pendiente de línea" se mueve a Recepciones**: son quienes se dan cuenta y saben si el proveedor aún va a entregar lo pendiente o no.
- **"Cerrar OC" se queda en módulo OC**: el Comprador formaliza el cierre; el Gerente solo registra lo que llegó y cancela líneas que no van a llegar.
- **Comprador puede capturar recepciones SI** su rol tiene `acceso_escritura=true` en `rdb.recepciones`. Se controla por RBAC, no por hardcode en UI.
- **Rol "Gerente" ya existe** en `core.roles`; Beto hace la división fina de permisos manualmente post-migración. Esta iniciativa solo crea el slug del módulo y preserva status quo.

## Alcance v1

### Sprint 1 — DB + sidebar + RBAC sync (PAUSA para `psql`)

- [ ] **Migración SQL** `supabase/migrations/<ts>_modulo_rdb_recepciones.sql`:
  - `INSERT INTO core.modulos (slug='rdb.recepciones', nombre='Recepciones', descripcion=..., empresa_id=<RDB>, seccion='Compras')` con `ON CONFLICT (empresa_id, slug) DO NOTHING`.
  - **Backfill defensivo**: por cada `(rol_id, modulo_id)` existente en `core.permisos_rol` para `rdb.ordenes_compra` en RDB, clonar `acceso_lectura` y `acceso_escritura` al `rdb.recepciones` recién creado, con `ON CONFLICT DO NOTHING`. Beto ajusta finamente después.
  - `NOTIFY pgrst, 'reload schema';` al final.
- [ ] **Sidebar** ([components/app-shell/nav-config.ts](../../components/app-shell/nav-config.ts)): agregar `{ label: 'Recepciones', href: '/rdb/recepciones' }` debajo de "Órdenes de Compra" en sección "Compras" de RDB.
- [ ] **`lib/permissions.ts`** `ROUTE_TO_MODULE`: agregar `'/rdb/recepciones': 'rdb.recepciones'`.
- [ ] **`lib/permissions.test.ts`** `EXPECTED_DB_MODULE_SLUGS`: agregar `'rdb.recepciones'`.
- [ ] **PAUSA**: Beto aplica la migración con `psql` y hace su división fina de permisos por rol. CC se detiene aquí, no avanza a Sprint 2 hasta confirmación.
- [ ] Post-aplicación: regenerar `supabase/SCHEMA_REF.md` y `types/supabase.ts` (Beto o CC en commit chico).

### Sprint 2 — Página `app/rdb/recepciones/page.tsx`

- [ ] **Bandeja**: lista de OCs con `estado IN ('enviada','parcial')` ordenadas por `autorizada_at DESC`. Columnas: folio, proveedor, fecha autorizada, progreso (recibido / pedido), estado.
- [ ] **Drawer al click en OC**: header con folio + proveedor + fecha + estado; tabla de líneas con contadores Pedida/Recibida/Pendiente (+ Cancelada cuando aplica); inputs editables "Recibir N" por línea con botón Aplicar; botón global "Recibir Todo" (auto-rellena al máximo recibible); botón × por línea para cancelar pendiente individual con `<ConfirmDialog>` + `<Textarea>` de motivo.
- [ ] **Sección colapsable "Historial de recepciones"** debajo de la tabla de líneas (la que hoy vive en drawer de OC desde Sprint 2 de `oc-cierre-ciclo`): query a `erp.movimientos_inventario` filtrada por `referencia_tipo='oc_recepcion' AND referencia_id=oc_id`, embed PostgREST de producto/almacén, total al pie ("Recibido $X de $Y (N%)"), click en fila → deep-link a `/rdb/inventario/movimientos?focus={mov_id}`.
- [ ] **Deep-link `?focus={oc_id}`**: page abre el drawer correspondiente al cargar (mismo patrón que `/rdb/ordenes-compra` desde Sprint 4 de `oc-recepciones`).
- [ ] **`<RequireAccess module="rdb.recepciones" write>`** en el page para gatear escritura.
- [ ] **`<DesktopOnlyNotice>`** + envoltura `hidden sm:block` (consistente con `oc-recepciones` page que es `desktop-only` por `responsive-policy`).
- [ ] **JSDoc `@responsive desktop-only`** en el page.
- [ ] **Reuse**: types compartidos (`OrdenCompraItem`, `MovimientoRecepcion`, etc.) idealmente extraídos a `lib/oc/types.ts` para no duplicar; si requiere refactor mayor del page de OC, postergar al Sprint 3 y duplicar en Sprint 2 (regla "tres líneas similares es mejor que una abstracción prematura").

### Sprint 3 — Limpiar `app/rdb/ordenes-compra/page.tsx`

- [ ] **Quitar** inputs editables "Recibir N" por línea + botón "Aplicar" + botón global "Recibir Todo".
- [ ] **Quitar** botón × por línea para cancelar pendiente + `<ConfirmDialog>` + `<Textarea>` asociados.
- [ ] **Quitar** sección colapsable "Historial de recepciones" del drawer (la que vive ahí desde Sprint 2 de `oc-cierre-ciclo`). Vive solo en módulo Recepciones.
- [ ] **Mantener** la tabla de líneas con contadores Pedida/Recibida/Pendiente/Cancelada en modo lectura — sigue siendo útil para que el Comprador vea el progreso.
- [ ] **Mantener** los botones globales: Marcar Enviada, Imprimir, Cerrar OC, Cancelar OC, Override de precio.
- [ ] **Agregar link cruzado**: cuando `estado ∈ {enviada, parcial}`, mostrar botón / link "Capturar recepciones →" que navega a `/rdb/recepciones?focus={oc_id}`.
- [ ] **Smoke verificación**: typecheck + lint + format + tests + build pasan; cuenta de prueba con rol Gerente confirma aislamiento (post-aplicación SQL + ajuste de Beto).

### Sprint 4 — Closeout

- [ ] Bitácora final en este doc.
- [ ] Mover fila a sección `## Done` de INITIATIVES.md.
- [ ] Barrer Reminders relacionados en lista `Claude: BSOP`.

## Fuera de alcance

- **Construir CxP**: sigue en iniciativa `cxp` (planned). Esta no toca CxP.
- **Multi-empresa rollout** (DILESA/COAGAN/ANSA): igual que `oc-recepciones` Sprint 5, diferido hasta que esas empresas tengan operación real de OC.
- **Devoluciones a proveedor** (`cantidad_rechazada`): sigue fuera de alcance.
- **Mobile-first** del módulo Recepciones: sigue desktop (consistente con `responsive-policy` para flujos de oficina).
- **Refactor de la lógica DB**: las 3 RPCs (`oc_recibir_linea`, `oc_cancelar_pendiente_linea`, `oc_cerrar_orden`) NO se tocan. Si emerge la necesidad de gatear quién puede llamar cada una a nivel `SECURITY DEFINER`, sub-iniciativa propia.
- **Rol "Gerente" alta y backfill por rol**: lo hace Beto manualmente post-migración. Esta iniciativa solo crea el slug `rdb.recepciones` y clona permisos para preservar status quo.

## Métricas de éxito

- Gerente RDB ve "Recepciones" en sidebar y ejecuta recepción + cancelación de pendiente sin tocar la administración de la OC.
- Comprador/Director sigue capturando OC end-to-end; opcionalmente captura recepciones según el ajuste de RBAC que haga Beto.
- Cero código duplicado: las RPCs son las mismas; la sección "Historial" vive en un solo lugar (módulo Recepciones).
- Link cruzado bidireccional funciona (drawer de OC → `/rdb/recepciones?focus`; tabla de Recepciones permite ver folio + abrir su OC original cuando aplica).
- CI verde en cada sprint; smoke test post-Sprint 3 con cuenta Gerente confirma aislamiento.

## Riesgos / preguntas abiertas

- [ ] **Comprador acostumbrado a recibir desde el drawer de OC**: el Sprint 3 lo fuerza a navegar a `/rdb/recepciones`. Mitigación: el link cruzado "Capturar recepciones →" debe ser visible y obvio en el drawer.
- [ ] **Embed PostgREST de movimientos en el módulo nuevo**: `erp.movimientos_inventario` no tiene FK declarada hacia `oc_id` (relación polimórfica vía `referencia_tipo`/`referencia_id`). Sprint 2 reusa el patrón de Sprint 2 de `oc-cierre-ciclo` (filtro por `referencia_tipo` + `referencia_id`).
- [ ] **Aplicación SQL es bloqueante para Sprint 2**: el page nuevo monta `<RequireAccess module="rdb.recepciones">`. Si la migración no está aplicada, todos los usuarios reciben "Acceso denegado" al entrar al page. Mitigación: el PR de Sprint 2 puede mergearse sin que rompa builds (nada en deploy depende del módulo en DB), pero la página queda inaccesible hasta que Beto aplique. Coordinación entre Sprints 1 y 2 es bloqueante por diseño.
- [ ] **Tests de `permissions.test.ts`**: `EXPECTED_DB_MODULE_SLUGS` es lista hardcoded — el test no consulta DB. Agregar el slug ahí antes de aplicar la migración no rompe nada; es a la inversa lo que rompe (slug en DB sin estar en la lista).
- [ ] **Refresh post-mutación cross-page**: tras una recepción, ¿la lista en `/rdb/ordenes-compra` se actualiza en otra pestaña? No — la propagación cross-tab no aplica. Aceptable para v1.
- [ ] **Comprador con `acceso_escritura=true` en `rdb.recepciones`**: si Beto le mantiene escritura en ambos, el Comprador tiene exactamente el mismo poder que hoy (operativamente). El split solo aporta valor si Beto efectivamente diferencia roles. Aceptable: la herramienta queda lista para cuando se quiera diferenciar.

## Sprints / hitos

| #   | Scope                                                                                                                                      | Estado      | PR        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | --------- |
| 0   | Promoción: doc + fila en INITIATIVES.md                                                                                                    | in_progress | _este PR_ |
| 1   | DB migración + sidebar + `permissions.ts` + `permissions.test.ts` (con PAUSA para que Beto aplique SQL antes de Sprint 2)                  | pending     | TBD       |
| 2   | Crear `app/rdb/recepciones/page.tsx` con bandeja + drawer + acciones recibir/cancelar + historial + deep-link `?focus`                     | pending     | TBD       |
| 3   | Limpiar `app/rdb/ordenes-compra/page.tsx`: quitar inputs de recepción + historial; agregar link cruzado a `/rdb/recepciones?focus={oc_id}` | pending     | TBD       |
| 4   | Closeout: bitácora final + mover a `## Done` + barrer Reminders                                                                            | pending     | TBD       |

## Decisiones registradas

### 2026-04-30 — Decisiones cerradas por Beto al promover

- **Comprador puede capturar recepciones**: solo si su rol tiene `acceso_escritura=true` en `rdb.recepciones`. Se controla por RBAC, no por hardcode en UI.
- **"Cancelar pendiente de línea" se mueve a Recepciones**: razonamiento operativo — son quienes se dan cuenta si el proveedor va a surtir el resto o no.
- **Rol "Gerente" ya existe**; Beto se encarga de la división fina de permisos por rol post-migración. La iniciativa solo crea el slug `rdb.recepciones` y clona permisos para preservar status quo.
- **Modo autónomo aprobado**: CC genera PRs sprint-por-sprint y mergea con CI verde sin pedir confirmación intermedia. Única pausa: aplicar SQL del Sprint 1 (Beto bloquea `apply_migration` MCP y `psql` desde CC para no bypassar PR/CI).
- **Backfill de permisos = clonar de `rdb.ordenes_compra`**: preserva status quo entre `apply` y ajuste fino. Beto luego rebaja Gerente en módulo OC y/o ajusta otros roles.

## Bitácora

### 2026-04-30 — Sprint 0 (Promoción) en marcha

- Doc creado + fila agregada a `INITIATIVES.md`.
- Estado `proposed → planned` con autorización de modo autónomo.
- 3 preguntas de alcance respondidas por Beto antes de promover:
  1. Comprador SÍ puede recibir vía RBAC (no hardcode).
  2. "Cancelar pendiente de línea" se mueve a Recepciones (Gerente decide).
  3. Rol "Gerente" ya existe; Beto maneja el ajuste fino de permisos.
- Diagnóstico previo confirma: todo el ciclo OC vive en `app/rdb/ordenes-compra/page.tsx` (~1549 líneas) bajo módulo `rdb.ordenes_compra` único — el split del módulo + del page es la forma natural de aterrizar la separación de responsabilidades.
- Iniciativas hermanas cerradas relevantes: `oc-recepciones` (2026-04-28, schema + RPCs) y `oc-cierre-ciclo` (2026-04-29, gates UI + sello + historial intra-drawer + handoff CxP). Esta sub-iniciativa cierra el split RBAC que faltaba.
