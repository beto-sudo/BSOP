# Iniciativa — Descuentos y promociones de venta (catálogo, amarre total↔buckets, auditoría y tope) DILESA

**Slug:** `dilesa-descuentos-promos`
**Empresas:** DILESA
**Schemas afectados:** `dilesa` (`ventas` — columnas de descuento + `promocion_id`; `promociones` — CRUD nuevo; RPC nueva `fn_actualizar_descuentos_venta` + helper de auditoría), `core` (`audit_log`, sub-slug `dilesa.ventas.promociones`), `erp` (lectura). Mayormente código: `lib/dilesa/cuadratura*.ts`, `components/dilesa/cuadratura-ajustes.tsx`, `app/dilesa/ventas/{nueva,[id]}`, tab nuevo `app/dilesa/ventas/promociones` (sub-slug `dilesa.ventas.promociones`, ADR-030).
**Estado:** in_progress
**Próximo hito:** Sprint 2 — catálogo de promociones (CRUD como 6º tab del hub de Ventas, sub-slug `dilesa.ventas.promociones`) + auto-asignación de la promo aplicable al capturar venta.
**Dueño:** Beto
**Creada:** 2026-06-15
**Última actualización:** 2026-06-16 (Sprint 1 — auditoría + amarre total↔buckets — en CI; migración aplicada a prod)

## Problema

El motor de cuadratura (PR #890) topa el descuento que entra al saldo a lo autorizado, pero **solo contra un tope confiable = monto de la promoción de la solicitud** (`dilesa.promociones.monto` vía `ventas.promocion_id`). El `descuento_maximo_autorizado` legacy de Coda quedó descartado como tope. El diagnóstico que motivó esta iniciativa (2026-06-15) confirmó que el modelo forward es correcto en su núcleo pero tiene huecos que impiden garantizar "todo registrado y topado desde el inicio":

- **El descuento no se audita (choca con la regla dura de trazabilidad).** `core.audit_log` registra `erp.cxc_cargos`, OC, pagos… pero **`dilesa.ventas` no pasa por ningún auditor: 0 registros**. Editar los buckets de descuento (potencialmente cientos de miles) es un `UPDATE` plano en [`cuadratura-ajustes.tsx`](../../components/dilesa/cuadratura-ajustes.tsx) sin rastro de quién, cuándo, ni de cuánto a cuánto.
- **Dos fuentes del descuento que pueden divergir / quedar invisibles al saldo.** Formalizada (fase 3) escribe `descuento_total` directo; el motor lee **solo los 4 buckets** (`descuento_precio + equipamiento + gastos_escrituracion + nota_credito`). Si Dirección no desglosa en la pestaña Cuadratura, los buckets quedan NULL → el motor ve descuento = 0 → el saldo muestra un faltante que no existe (el problema inverso al legacy: sub-acreditar). El número está registrado pero ciego al saldo/tope.
- **El tope puede nacer indefinido (=0).** La promo es **opcional** al crear la venta (`promocion_id || null`). Hoy solo existe **1 promoción activa** ($15,000, prototipo LDLE-ISC) y 13 de 14 prototipos no tienen ninguna; el 99% de las ventas LDLE no la traen asignada. Sin promo no hay tope contra el cual registrar/limitar el descuento, y **no existe un CRUD del catálogo** (las promos solo se siembran por migración; `promociones` ni siquiera está en nav/permisos).

Contexto de datos del diagnóstico (prod, `deleted_at IS NULL`):

- Las 315 ventas con descuento son **todas legacy (0 con promoción)**.
- De las 159 que "exceden" su máximo legacy: **118 tienen el máximo en 0** (campo nunca llenado en Coda) y 41 tienen un máximo positivo pero parcial. De las 156 que no exceden, **145 tienen máximo = total exacto** (backfill espejo). Solo 11 de 315 usan el campo como un techo real con holgura → el máximo legacy **no es un techo confiable**.
- `descuento_total = suma de los 4 buckets` en **159/159** del grupo de exceso, y **0 divergencias** en las 1,309 ventas vivas → cambiar el motor para que lea `descuento_total` no altera el valor de ninguna venta.
- Los 4 buckets **nunca se usan por separado** en ninguna fórmula: la NC fiscal de Fase 13 se deriva del CFDI XML (no del bucket `descuento_nota_credito`) y el cheque a notaría sale de `gastos − apoyo Infonavit` del catálogo (no del bucket de gastos). El motor solo usa la suma.

## Outcome esperado

- **El descuento queda registrado.** Todo cambio de descuento/promoción en `dilesa.ventas` deja entrada en `core.audit_log` (anterior/nuevo + autor), vía RPC `SECURITY DEFINER` igual que las ~21 funciones financieras del repo.
- **Una sola fuente de la verdad del "cuánto".** `descuento_total` es el monto autoritativo que lee el motor; los 4 buckets son el desglose de "en qué se aplica", con invariante `sum(buckets) = descuento_total`. Se cierra el hueco de descuento invisible al saldo.
- **El tope está definido desde el inicio y es administrable.** El catálogo de promociones es la fuente única de autorización: se da de alta/baja/expira desde un CRUD; la promo aplicable se auto-asigna al capturar la venta; el máximo siempre sale de `promociones.monto`. El **uso parcial ya funciona** (`descuentoAplicado = min(otorgado, tope)`): con promo de $15,000 el cliente puede usar $12,000 y el resto queda como techo no usado.
- **Sin pendientes falsos en histórico.** Las ventas legacy (de Coda) sin promo siguen sin tope; el endurecimiento `sin-promo → 0` aplica solo a ventas nativas de BSOP.

## Alcance v1 (sprints — ordenados por seguridad operativa)

- [x] **Sprint 1 — Auditoría + amarre `total↔buckets` (#1 + #2).** Migración: helper `dilesa.fn_venta_auditar_descuentos` (resuelve `usuario_id` vía email del JWT, inserta en `core.audit_log`) + RPC `dilesa.fn_actualizar_descuentos_venta` (`SECURITY DEFINER`, gate de empresa, captura anterior/nuevo de las columnas de descuento + `promocion_id`, garantiza `descuento_total = sum(buckets)`, audita). Motor (`lib/dilesa/cuadratura-server.ts`, `use-venta-resumen.ts`, `app/dilesa/ventas/[id]/page.tsx`) pasa a leer `descuento_total` autoritativo (0 divergencias → sin cambio de valor). Ruteo de los 2 puntos de captura (Formalizada + pestaña Cuadratura) por el RPC. **El comportamiento del tope no cambia aún** (no disrumpe nada). Tests + ADR ("`descuento_total` autoritativo, buckets = desglose").
- [ ] **Sprint 2 — Catálogo de promociones (CRUD) + auto-asignación (#3).** Promociones entra como **6º tab del hub de Ventas** (ruta `/dilesa/ventas/promociones`, sub-slug `dilesa.ventas.promociones`), junto a Inventario/Fases/Clientes/Vendedores — **no** es módulo top-level del sidebar (que sigue mostrando solo "Ventas"). Página de alta/edición de `monto`, `productos_aplicables`, `vigencia_inicio/fin`, `activa`, solo Dirección/admin. RBAC por sub-slug (ADR-030): agregar el tab al `TABS` del layout (`module: 'dilesa.ventas.promociones'`) + `ROUTE_TO_MODULE` + `EXPECTED_DB_MODULE_SLUGS` + migración que inserta el sub-slug heredando del padre `dilesa.ventas` + backfill clonando sus permisos. + en captura de venta: auto-seleccionar la promo cuando hay exactamente 1 aplicable al prototipo (editable; badge "auto-asignada").
- [ ] **Sprint 3 — Tope estricto (`sin-promo → 0`).** Cuando el catálogo ya esté poblado, el motor topa a 0 las ventas **nativas** sin promo (descuento solo autorizado vía catálogo; un descuento sin promo se marca como no acreditado). Las ventas legacy (con `coda_row_id`) siguen sin tope. Tests del corte legacy↔nativo.

## Riesgos

- **Tocar el camino de captura del descuento** (Sprint 1) es lógica financiera viva. Mitigación: el cambio del motor es value-neutral (0 divergencias hoy); el RPC se prueba con tests de comportamiento antes de rutear la UI; la migración la revisa y aplica Beto.
- **Endurecer el tope antes de poblar el catálogo** bloquearía descuentos legítimos en los 13 prototipos sin promo. Mitigación: el Sprint 3 (estricto) va **después** del Sprint 2 (CRUD), para que primero existan las promos.
- **RPC vs trigger para auditar.** Se eligió RPC (convención del repo); riesgo: un futuro write directo a las columnas de descuento evadiría el audit. Mitigación: rutear los 2 (únicos) puntos de captura por el RPC y dejar los buckets gated a Dirección; revisar en code-review futuro cualquier write directo nuevo.
- **Corte legacy↔nativo** (Sprint 3) depende de `coda_row_id` como marca de origen. Mitigación: las ventas nativas nunca tienen `coda_row_id` (lo pone solo el import); test del corte.

## Métricas de éxito

- 100% de los cambios de descuento/promoción en `dilesa.ventas` generan entrada en `core.audit_log` (verificado por test del RPC).
- 0 ventas vivas con `descuento_total ≠ sum(buckets)` tras el amarre (invariante enforzada por el RPC).
- 0 descuentos capturados que no se vean en el saldo (el motor lee el total autoritativo).
- Catálogo administrable: Dirección da de alta/expira promos sin tocar SQL.
- % de ventas con promo aplicable que la traen asignada → de 0.9% a ≥ objetivo operativo (auto-asignación).

## Decisiones registradas

- **2026-06-15 — El máximo legacy de Coda NO se usa como tope.** `descuento_maximo_autorizado` importado de Coda es un dato no confiable (118/315 vacío, 145/315 espejo del total, solo 11/315 techo real). Razón: comparar un otorgado real contra un campo vacío/espejo inventa pendientes falsos. (Diagnóstico que originó la iniciativa; ya implementado en PR #890.)
- **2026-06-15 — `descuento_total` es el monto autoritativo; los 4 buckets son desglose.** "En uno se define cuánto, los buckets definen en qué se aplica y cuánto, ligados por `sum(buckets) = total`." Seguro porque los buckets nunca se usan por separado en ninguna fórmula y hay 0 divergencias hoy.
- **2026-06-15 — La auditoría del descuento se hace por RPC (convención BSOP), no por trigger.** BSOP audita con ~21 RPCs `SECURITY DEFINER` que insertan en `core.audit_log` (autor vía email del JWT); no hay triggers de auditoría. Se sigue esa convención.
- **2026-06-15 — La autorización de descuento es por catálogo de promociones, auto-aplicado.** El tope siempre sale de `promociones.monto`; no se introduce un máximo manual por venta. Sin promo aplicable = sin descuento autorizado; la vía para habilitarlo es dar de alta la promo en el catálogo (que se mantiene metiendo/quitando/expirando). El uso parcial por debajo del tope ya está soportado (`min(otorgado, tope)`).
- **2026-06-15 — El endurecimiento `sin-promo → 0` aplica solo a ventas nativas de BSOP.** Las ventas legacy (con `coda_row_id`) siguen sin tope para no inventar pendientes en histórico.
- **2026-06-15 — Promociones vive como tab del hub de Ventas, no como módulo top-level.** Ruta `/dilesa/ventas/promociones`, sub-slug `dilesa.ventas.promociones` (ADR-030), junto a Inventario/Fases/Clientes/Vendedores. Razón (Beto): es un catálogo dependiente de ventas, como las demás páginas del hub; el sidebar muestra solo "Ventas".

## Bitácora

- **2026-06-15** — Promovida desde el diagnóstico del tope de descuento (origen: PR #890, que dejó el descuento legacy sin topar). El diagnóstico (queries a prod + workflow de mapeo de blast radius) confirmó: el motor es agnóstico a la fuente del total (buckets nunca usados por separado, 0 divergencias en 1,309 ventas vivas), BSOP audita por RPC y no por trigger, y existe 1 sola promo activa sin CRUD para administrar el catálogo. Beto cerró las 3 decisiones de diseño (amarre total↔buckets, auditoría por RPC, autorización por catálogo auto-aplicado con uso parcial). Alcance v1 = 3 sprints ordenados por seguridad operativa. Promovida en PR [#897](https://github.com/beto-sudo/BSOP/pull/897). Pendiente: arrancar Sprint 1.
- **2026-06-15** — Corrección de alcance (Beto): el catálogo de promociones se ubica como **6º tab del hub de Ventas** (sub-slug `dilesa.ventas.promociones`, ADR-030), no como módulo top-level del sidebar. Ajustados header (Schemas), Sprint 2 y Decisiones registradas.
- **2026-06-16** — **Sprint 1 entregado.** Migración `20260616020428_dilesa_ventas_audit_descuentos` aplicada a prod (vía MCP) y verificada end-to-end en transacción revertida: modo total-only, modo buckets cuadrando, auditoría con autor resuelto, `RAISE` cuando el desglose no cuadra, y gate 42501 sin permiso. Helper `dilesa.fn_venta_auditar_descuentos` (patrón `erp.fn_oc_audit`) + RPC `dilesa.fn_actualizar_descuentos_venta`. El motor (server + client + fase 17) ahora lee `descuento_total` autoritativo (0 divergencias → sin cambio de valor). Editor de Cuadratura con campo "total" + reconciliación; Formalizada rutea el descuento por la RPC. Los 6 checks de CI en verde local. PR en auto-merge.
