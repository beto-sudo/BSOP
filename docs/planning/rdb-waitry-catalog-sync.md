# Iniciativa — Waitry: sincronización de catálogo (BSOP → Waitry) y reemplazo del flujo entrante

**Slug:** `rdb-waitry-catalog-sync`
**Empresas:** RDB
**Schemas afectados:** rdb (productos_waitry_map), erp (productos, productos_precios, categorias_producto)
**Estado:** proposed
**Dueño:** Beto
**Creada:** 2026-04-29
**Última actualización:** 2026-04-29

## Problema

Hoy el flujo BSOP ↔ Waitry es **unidireccional entrante**: Waitry POSTEA pedidos/pagos a `waitry-webhook` y los persistimos en `rdb.waitry_inbound` → `waitry_pedidos` / `_pagos` / `_productos`. Toda la captura del **catálogo** (alta de productos, cambios de precio, sold-out, apertura/cierre del local) sucede manualmente en el panel de Waitry. Esto trae varios costos:

- **Doble captura.** Cuando se da de alta un producto en BSOP (`erp.productos`), alguien tiene que volver a darlo de alta en Waitry. Lo mismo cuando cambia un precio (`erp.productos_precios.precio_venta`).
- **Drift de precios.** No hay un único source-of-truth: BSOP y Waitry pueden divergir, y el operador del POS termina cobrando precios viejos.
- **Sold-out manual.** Si se acaba un insumo/producto en RDB no hay forma estructurada de "apagarlo" en Waitry — depende de que el operador se acuerde.
- **Mapping frágil.** Hoy `rdb.productos_waitry_map` mapea por `waitry_nombre` (texto). Si Waitry renombra un producto, el match se rompe silenciosamente.

Adicionalmente, la doc técnica de Waitry (recibida de Ignacio Correa el 2026-04-29) define un endpoint `Push New Order` que **reemplazaría el webhook actual** con un payload mucho mejor estructurado (eater + cart + modifier_groups + charges + tax + payment + delivery). Migrar a ese formato resolvería gran parte de la fricción que estamos atacando en `rdb-waitry-ingesta-dedup`.

## Outcome esperado

- **BSOP es source-of-truth del catálogo de RDB.** Cualquier alta, baja, cambio de precio, sold-out o pausa del local en BSOP se refleja en Waitry sin captura manual.
- **Mapping estable BSOP ↔ Waitry.** Tabla `rdb.productos_waitry_map` evolucionada: matching por ID externo (`waitry_external_id`) en vez de por nombre. Bidireccional: cuando hacemos sync, capturamos el `id` que Waitry asigna y lo guardamos.
- **Catálogo enriquecido.** `erp.productos` gana `image_url` (preparado para imágenes públicas, aunque su contenido se puebla luego operativamente).
- **Reemplazo del flujo entrante.** Endpoint `Push New Order` activo, `waitry-webhook` deprecado/quitado. El nuevo payload reduce dependencia del `compute_content_hash` artesanal y mejora la calidad del dedup.
- **Cero captura manual** en Waitry para operación rutinaria de RDB. La excepción es el setup inicial (dar de alta el local, configurar mesas, layout) que vive en su panel.

## Alcance v1

> **Pre-requisito v1: nada arranca hasta tener `client_id` + `client_secret` + `user` + `password` (perfil "interface") + `placeId` de RDB en Waitry.** Pedirlos a Waitry implica firmar el NDA. Hasta entonces, esta iniciativa vive en `proposed` esperando ese desbloqueo.

### Sprint 1 — Catálogo: subir productos de RDB a Waitry (manual)

- [ ] **Migración**: agregar `waitry_external_id text` a `rdb.productos_waitry_map` (nullable durante transición). Mantener `waitry_nombre` como fallback hasta el primer sync exitoso.
- [ ] **Migración**: agregar `image_url text NULL` a `erp.productos`. Sin populate aún — preparado para cuando se organicen las imágenes.
- [ ] **Edge function** `waitry-catalog-sync` con:
  - OAuth client (grant_type=password, refresh cada 14d, cache de token).
  - Mapper BSOP → Waitry (ver § Mapeo de datos abajo).
  - POST a `syncMenuPOSWebhook?placeId={id}` con el payload completo del catálogo de RDB.
  - Captura del response → escribe `waitry_external_id` de regreso en `productos_waitry_map`.
  - Ambiente: sandbox primero (`https://api.waitry.net/dev/`), prod después (`https://api.waitry.net/1/`) tras validación.
- [ ] **UI**: botón "Sincronizar carta a Waitry" en `/rdb/inventario` (admin-only via `<RequireAccess>`). Confirma con `<ConfirmDialog>`. Muestra resultado del último sync (timestamp + #items + errores).
- [ ] **Secrets**: `WAITRY_CLIENT_ID`, `WAITRY_CLIENT_SECRET`, `WAITRY_USER`, `WAITRY_PASSWORD`, `WAITRY_PLACE_ID_RDB` en 1Password Infrastructure + Supabase Edge Function secrets.

### Sprint 2 — Sold-out: deshabilitar items dinámicamente

- [ ] Endpoint `syncItemsPOSWebhook?placeId={id}` con `{ itemId, suspension_info: { suspend_until: unix_ts } }`.
- [ ] Trigger: cuando el stock de un producto cae a cero en levantamientos / movimientos manuales, ofrecer "Apagar en Waitry hasta {fecha}". Manual por ahora — la automatización vive en Sprint 4.
- [ ] UI: botón en stock detail drawer (`/rdb/inventario` → producto → drawer).

### Sprint 3 — Open/close place

- [ ] Endpoint `syncPlacePOSWebhook?placeId={id}` con `{ status: "ONLINE" | "PAUSED" }`.
- [ ] UI: switch en `/rdb/admin` (admin-only) para pausar/reanudar pedidos en Waitry. Útil para cierres por mantenimiento, eventos privados, etc.

### Sprint 4 — On-change automation

- [ ] Trigger DB sobre `erp.productos`, `erp.productos_precios` (UPDATE de `precio_venta` con `vigente=true`), y `rdb.productos_waitry_map` que enqueue un job de re-sync. Throttling para no spam Waitry.
- [ ] Trigger DB sobre stock cero → auto-suspend en Waitry (Sprint 2 endpoint).
- [ ] Vista `/rdb/admin/waitry-sync-log` con historial de syncs (idempotencia, errores, retry).

### Sprint 5 — Push New Order (reemplazo del webhook entrante)

> **Sólo después de que Sprints 1-4 estén estables.** Tocar el flujo entrante vivo es alto-riesgo y la ganancia depende de cerrar primero `rdb-waitry-ingesta-dedup` Fase 2.B.

- [ ] Definir endpoint propio (URL + auth — probablemente HMAC con shared secret) y compartirlo con Waitry.
- [ ] Implementar handler en Supabase edge function nueva `waitry-order-ingest` que:
  - Persiste payload crudo en `rdb.waitry_inbound` (preserva audit trail).
  - Materializa a `waitry_pedidos`/`_pagos`/`_productos` con la nueva estructura (más rica que el webhook viejo).
  - Marca `inbound_source = 'push_external_order'` para diferenciar histórico.
- [ ] Coordinar con Waitry corte del webhook viejo y arranque del nuevo (probablemente con doble-fire por 24-48h para validar).
- [ ] Deprecar `waitry-webhook` edge function una vez validado.

## Mapeo de datos BSOP → Waitry (referencia v1)

| BSOP                                                 | Waitry                                     | Notas                                                                                    |
| ---------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `erp.categorias_producto.{id, nombre, orden, color}` | `Category.{id, title, description}`        | `id` Waitry = `id` BSOP (uuid string). `external_data` = id BSOP.                        |
| `erp.productos.{id, nombre, descripcion}`            | `Item.{id, title, description}`            | Solo `tipo='producto'` con `activo=true`.                                                |
| `erp.productos_precios.precio_venta` (vigente)       | `Item.price` con `vat_rate_percentage: 16` | IVA inclusive (México).                                                                  |
| `erp.productos.image_url`                            | `Item.image_url`                           | Si NULL, omitir el campo.                                                                |
| `erp.productos.parent_id` (variantes)                | `ModifierGroup`                            | Variantes hijas se agrupan bajo el padre. Detalle a cerrar contra ejemplos reales.       |
| `erp.productos.id` (uuid)                            | `Item.external_data`                       | String libre — guardamos UUID BSOP. Es el discriminante de regreso en órdenes entrantes. |

## Fuera de alcance

- **ANSA / DILESA / COAGAN.** No usan Waitry. Si en el futuro entran, se promueve iniciativa hermana — el mapper y la edge function pueden generalizarse pero v1 hardcodea RDB.
- **Setup operativo en panel Waitry.** Crear el local, configurar mesas, layout, horarios de apertura: lo hace Beto en su UI. El sync no toca eso.
- **Cambios al POS Waitry** (lado del proveedor). No controlamos su código.
- **Imágenes en sí.** Solo agregamos la columna `image_url`. El contenido (subir fotos, gestionar bucket público, etc.) se aborda fuera de esta iniciativa cuando se organice.
- **Empuje de inventario en tiempo real a Waitry.** El stock vive en BSOP — Waitry sólo recibe sold-out (binary on/off vía endpoint #2), no cantidades.

## Riesgos / impacto en producción

> **OBLIGATORIO** — esta iniciativa toca DB live (productos, precios) y, en Sprint 5, el camino del webhook que alimenta `erp.cortes_caja`.

- [ ] **Sprint 1 — primer sync masivo.** Riesgo: `syncMenuPOSWebhook` puede ser **reemplazo total** (no upsert por id). Si lo es, antes del primer sync prod hay que confirmar contra Waitry y considerar exportar el catálogo Waitry actual primero (vía `getOrdersPOS` o panel).
- [ ] **Token OAuth de 14d.** Si el refresh falla, el sync se cae silencioso. Mitigación: alerta en CW/Sentry cuando un sync intenta auth y falla; reintento manual obvio.
- [ ] **Mapeo de `external_data`.** Si en Sprint 1 no capturamos correctamente el `id` que Waitry devuelve, los syncs siguientes podrían crear duplicados en Waitry. Mitigación: dry-run obligatorio en sandbox antes de prod; verificar que el response del endpoint contiene IDs canónicos.
- [ ] **Drift entre `precio_venta` y lo que cobra Waitry.** Si BSOP cambia un precio y el sync no llegó/falló, el cliente paga el precio viejo. Mitigación: timestamp visible del último sync exitoso en `/rdb/inventario` + alerta si > X horas sin sync exitoso.
- [ ] **Sprint 5 — coordinación de cutover del webhook.** Si activamos `Push New Order` y Waitry no cortó el webhook viejo, doble ingesta = duplicados garantizados. Mitigación: doble-fire controlado durante 24-48h con dedup tag, luego cutover atómico.
- [ ] **Captura activa de cajero.** Cualquier sync que mueva mucho dato debe correrse fuera de horario operativo (≤6am o >11pm Matamoros) — al menos hasta que el sistema demuestre estabilidad.

## Métricas de éxito

- **Sprint 1:** 100% de productos `activos` de RDB presentes en carta Waitry post-sync, con `precio_venta` actual ±$0 dentro de 60s. `productos_waitry_map.waitry_external_id` poblado para 100% del catálogo.
- **Sprint 2:** ≤1min entre stock=0 detectado y producto suspendido en Waitry (manual). Cero ventas de productos sold-out reportadas por Laisha.
- **Sprint 3:** switch de open/close se refleja en Waitry en ≤30s.
- **Sprint 4:** cero re-syncs manuales necesarios en operación rutinaria. Ventana entre cambio de precio en BSOP y reflejado en Waitry ≤2min.
- **Sprint 5:** 0 pedidos perdidos durante cutover del webhook. Calidad del dedup ≥ baseline post-fix de Fase 2.B (no peor).

## Sprints / hitos

- **Sprint 0 — desbloqueo externo.** ⏸️ Bloqueado en NDA + keys. Cuando lleguen, arranca Sprint 1.
- **Sprint 1 — catálogo manual + bidireccional.** ⏸️ Pendiente Sprint 0.
- **Sprint 2 — sold-out endpoint.** ⏸️ Pendiente Sprint 1.
- **Sprint 3 — open/close place.** ⏸️ Pendiente Sprint 2.
- **Sprint 4 — automation on-change.** ⏸️ Pendiente Sprint 3 + estabilidad demostrada.
- **Sprint 5 — Push New Order (reemplazo webhook).** ⏸️ Pendiente cierre de `rdb-waitry-ingesta-dedup` Fase 2.B + estabilidad de Sprints 1-4.

## Decisiones registradas

- **2026-04-29 (Beto + CC) — Promovida tras recibir doc técnico de Waitry.** Ignacio Correa (Founder & CTO) mandó "Integration Waitry - POS — Tech Doc" (30 páginas) por correo. NDA pendiente; keys vienen post-firma. Beto autorizó: solo RDB v1, todos los endpoints divididos por sprints, manual primero → on-change después, agregar `image_url` desde el principio, mapping bidireccional (capturar IDs de Waitry de regreso), Push New Order como Sprint 5 (al final, reemplazando webhook actual).
- **2026-04-29 (CC) — Mapping por ID, no por nombre.** Hoy `productos_waitry_map` matchea por `waitry_nombre`. Sprint 1 migra a `waitry_external_id` para que el matching no se rompa silenciosamente si Waitry renombra. Se conserva `waitry_nombre` como fallback durante transición.
- **2026-04-29 (CC) — `erp.productos.image_url` se agrega ahora aunque no haya contenido.** Beto pidió dejarlo preparado. Aceptar NULL hasta que se organicen las imágenes. Cuando se pueblen, el sync ya las empuja sin migración adicional.
- **2026-04-29 (CC) — Auth OAuth password grant.** Waitry usa `grant_type=password` con `client_id` + `client_secret` + `user` + `password`. Token vive 14 días. Implica crear usuario "interface" en `app.waitry.net` además de las keys de cliente. Cuatro secretos a guardar (no dos).

## Bitácora

- **2026-04-09** — Beto solicita acceso API a `info@waitry.net`.
- **2026-04-22** — Pago al corriente con Waitry (adeudo histórico saldado).
- **2026-04-23** — Lucía Correa (Operations Manager) confirma envío de la solicitud al equipo de desarrollo.
- **2026-04-29** — Ignacio Correa (Founder & CTO) envía doc técnico (30 páginas, 7 endpoints documentados). Indica que tras avanzar mandarán NDA y luego keys.
- **2026-04-29** — Beto + CC promueven iniciativa a `proposed`. Próximo movimiento: responder a Ignacio agradeciendo el doc, solicitando NDA + keys, y haciendo las preguntas técnicas pendientes (sandbox, semántica de syncMenu, image hosting, i18n format, rate limits, modificadores anidados, auth para Push New Order, deprecación del webhook actual, NDA bilateralidad). Sin tocar código hasta tener Sprint 0 desbloqueado.
