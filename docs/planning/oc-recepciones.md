# Iniciativa — OC: Recepciones, cancelación y cierre del ciclo a inventario

**Slug:** `oc-recepciones`
**Empresas:** todas (golden: RDB; rollout DILESA/COAGAN/ANSA diferido — ver Sprint 5)
**Schemas afectados:** `erp` (`ordenes_compra`, `ordenes_compra_detalle`, `movimientos_inventario`, `inventario`)
**Estado:** done (cerrada 2026-04-28)
**Dueño:** Beto
**Creada:** 2026-04-27
**Cerrada:** 2026-04-28
**Última actualización:** 2026-04-28 (Sprints 0-4 entregados en PRs #260, #261, #262, #263, #264. Sprint 5 (rollout DILESA/COAGAN/ANSA) **diferido**: query a producción confirma 0 OCs y 0 almacenes en esas empresas — no hay operación que rolloutear todavía. La lógica DB ya es genérica (cualquier empresa con almacén usa las RPCs hoy). El extract a componente shared se hará junto con la primera empresa que necesite OC.)

## Problema

El flujo Requisición → OC → Recepción → Inventario está roto en producción. Las tablas existen (`erp.recepciones`, `erp.recepciones_detalle`, `erp.movimientos_inventario`) pero la UI nunca las usa:

- En `app/rdb/ordenes-compra/page.tsx`, los botones "Recibir Parcial" y "Recibir Todo" sólo actualizan `ordenes_compra.total` — no escriben en `recepciones`, no escriben en `recepciones_detalle`, y nunca generan `movimientos_inventario`.
- `cantidad_recibida` se hardcodea a `null` en cada apertura del detalle, por lo que la UI nunca refleja el progreso real entre sesiones.
- El estatus visible ("Enviada", "Recepción parcial", "Recibida") es **decorativo**: se infiere en frontend desde `autorizada_at` — ni siquiera hay columna `estado` en la tabla.
- Cuando llega un parcial y el resto ya no se va a surtir, no hay forma operativa de cerrar la OC dejando líneas canceladas con cierre limpio.
- El stock real de inventario nunca se mueve por compras: los productos que entran físicamente al almacén no aparecen en `erp.inventario`.

Resultado operativo: OCs zombi en estado "enviada" con meses sin actualización, stock sistema divorciado del físico, y sin base de datos confiable para enchufar Cuentas por Pagar (pagar al proveedor solo lo recibido) cuando se construya ese módulo.

## Outcome esperado

- **Estado por línea de OC** con 4 contadores claros: `pedida / recibida / cancelada / pendiente`. La UI muestra los 4 sin ambigüedad.
- **Recibir parcial** desde la UI guarda **estado actualizado** (no evento) y dispara automáticamente `movimientos_inventario` por el delta. El stock real sube.
- **Cerrar OC** marca el resto como cancelado, congela `total_a_pagar = Σ(cantidad_recibida × precio_real)` y deja la OC en estado `cerrada`. Ya no aparece en pendientes.
- **Cancelar línea individual** funciona igual: el pendiente de esa línea queda cancelado, el resto sigue abierto.
- **Override de precio** disponible solo para rol Gerente, con audit trail (quién/cuándo/por qué).
- **CxP futuro engancha sin re-trabajo**: `total_a_pagar` está calculado y un evento/columna marca cuándo se cierra la OC para que CxP escuche.
- **Disponible en RDB primero**, replicado a DILESA/COAGAN/ANSA después con la misma estructura. La intención desde Sprint 1 es que la lógica de DB sea genérica para las 4 empresas; particularidades por empresa entran como ajustes en Sprint 5 o sub-iniciativas posteriores.

## Alcance v1

- [ ] **Schema (Sprint 1)**:
  - `erp.ordenes_compra_detalle`: agregar `cantidad_recibida` (numeric, default 0), `cantidad_cancelada` (numeric, default 0), `precio_real` (numeric, nullable — null = usa `precio_unitario`), `precio_modificado_por` (uuid → `core.usuarios`), `precio_modificado_at` (timestamptz), `motivo_cancelacion` (text, nullable).
  - `erp.ordenes_compra`: agregar `estado` (text con CHECK: `'borrador'|'enviada'|'parcial'|'cerrada'|'cancelada'`), `total_a_pagar` (numeric, calculable y poblado al cerrar), `cerrada_at` (timestamptz), `cerrada_por` (uuid → `core.usuarios`).
  - Backfill: `estado` se infiere desde `autorizada_at` y datos existentes. OCs viejas quedan en `'enviada'` o `'cerrada'` según contexto, sin romper UI actual.
- [ ] **RPCs / funciones (Sprint 1)**:
  - `erp.oc_recibir_linea(detalle_id, cantidad_recibida_nueva, costo_unitario_real?)`: actualiza `cantidad_recibida` (acepta acumulado, no delta), genera `movimientos_inventario` por el delta con `referencia_tipo='oc_recepcion'` + `referencia_id=oc_id`, recalcula `estado` de la OC. Idempotente si se llama con el mismo total recibido.
  - `erp.oc_cancelar_pendiente_linea(detalle_id, motivo)`: pone `cantidad_cancelada = cantidad_pedida - cantidad_recibida`, dispara recalc de estado.
  - `erp.oc_cerrar_orden(orden_id, motivo?)`: cancela todas las líneas con pendiente > 0, marca `estado='cerrada'`, congela `total_a_pagar`, set `cerrada_at`/`cerrada_por`.
  - Toda transición escribe a `audit_log`.
- [ ] **UI Sprint 2 (RDB golden)**:
  - Refactor del drawer de OC en `app/rdb/ordenes-compra/page.tsx`: tabla de líneas muestra `Pedida / Recibida / Pendiente` y, si aplica, `Cancelada`. Acciones por línea: campo "Recibir N" (input numérico) + botón `Aplicar`, botón `Cancelar pendiente` con confirmación + motivo.
  - Acción global: botón `Cerrar OC` con preview de líneas que se cancelarán + confirmación.
  - Estado de OC visible en lista (badge con todos los estados nuevos) y en detalle.
  - El input de "Recibir" pre-llena con el cantidad_recibida actual; ajustar y guardar dispara `oc_recibir_linea` con el nuevo total.
- [ ] **Override de precio (Sprint 3)**:
  - Verificar el modelo de roles existente (`RequireAccess` actual + cualquier convención de roles dentro de un mismo módulo).
  - Permitir editar `precio_real` por línea solo si el usuario tiene rol `Gerente` (o equivalente). Si no se edita, queda `null` y el sistema usa `precio_unitario`.
  - Cada cambio escribe `precio_modificado_por`, `precio_modificado_at` + audit log.
- [ ] **Vista de movimientos enlazada a OC (Sprint 4)**:
  - En `app/rdb/inventario/movimientos/page.tsx`: filtro por `referencia_tipo='oc_recepcion'`, columna que muestra el folio de OC origen, link al detalle de OC desde el movimiento.
  - Chip / badge en el movimiento que indique "Por compra" cuando aplica.
- [ ] **Rollout multi-empresa (Sprint 5)**:
  - Replicar `app/dilesa/ordenes-compra/`, `app/coagan/ordenes-compra/`, `app/ansa/ordenes-compra/` extrayendo el componente compartido a `components/compras/` (alineado con la dirección de `shared-modules-refactor`).
  - Smoke test por empresa.
  - Documentar particularidades pendientes por empresa (ANSA refacciones alto volumen, COAGAN agroquímicos con lotes/caducidades, DILESA materiales de obra) como sub-iniciativas posteriores si emergen.

## Fuera de alcance

- **Devoluciones a proveedor** (`cantidad_rechazada`): se queda en cero por ahora. La columna ya existe en `recepciones_detalle` pero no se usa.
- **Múltiples eventos de recepción auditados como rows separados** en `erp.recepciones`/`erp.recepciones_detalle`: Beto eligió "estado, no evento" en alcance. Las tablas siguen vivas en DB pero no se pueblan desde la UI nueva — quedan como deuda a deprecar o aprovechar después si aparece necesidad.
- **Multi-almacén destino** por OC: por ahora 1 almacén por empresa. La columna `almacen_id` no se agrega a `ordenes_compra`; el RPC resuelve el almacén default de la empresa.
- **UI de Cuentas por Pagar**: el módulo CxP no existe aún. Esta iniciativa solo deja `total_a_pagar` calculado y un estado `cerrada` que CxP pueda enganchar más adelante. La construcción de CxP es iniciativa propia.
- **Mobile-first** para captura de recepción: el flujo sigue siendo desktop. Si en el futuro un almacenista captura desde tablet, sub-iniciativa aparte.
- **Lotes y caducidades** (relevante para COAGAN): fuera de v1.

## Métricas de éxito

- **Cero OCs zombi**: ninguna OC en estado `enviada` o `parcial` con > 30 días sin movimiento, en RDB primero (verificable con query directa al final de Sprint 2).
- **Stock real sincronizado**: el próximo levantamiento físico en RDB después del rollout muestra diferencia stock-sistema vs físico dentro de la tolerancia configurada en `inventario_levantamientos`.
- **Tiempo de captura**: una recepción típica (5-10 líneas) se captura en ≤ 2 min desde abrir el drawer hasta confirmar.
- **Trazabilidad**: cada `movimientos_inventario` con `referencia_tipo='oc_recepcion'` enlaza correctamente al folio de OC origen (verificable visualmente y por query).
- **`total_a_pagar` correcto al cerrar**: para una muestra de OCs cerradas con parciales y cancelaciones, `total_a_pagar` = Σ(`cantidad_recibida` × `precio_real` o `precio_unitario` si null).
- **Cero queries de UI fuera de las RPCs**: la UI nueva solo llama a `oc_recibir_linea`, `oc_cancelar_pendiente_linea`, `oc_cerrar_orden`. No hay UPDATE directos a las nuevas columnas desde el cliente.

## Riesgos / preguntas abiertas

- [ ] **`rdb.ordenes_compra` shim sobre `_legacy`**: SCHEMA_REF marca a `rdb.ordenes_compra` como vista de compatibilidad sobre `rdb.ordenes_compra_legacy` post-migración. El cambio de columnas tiene que respetar el shim — confirmar al iniciar Sprint 1 si hay drift entre `erp.ordenes_compra` y la vista legacy.
- [ ] **Productos sin row en `erp.inventario`**: cuando se recibe por primera vez un producto que nunca tuvo stock, el RPC tiene que `INSERT ... ON CONFLICT DO UPDATE` o crear la fila base antes de aplicar el delta. Sin esto, falla silencioso o explota.
- [ ] **Modelo de rol "Gerente"**: hoy `RequireAccess` opera por `(empresa, modulo)`. No es obvio si hay granularidad de rol dentro de un módulo. Sprint 3 abre con un check del modelo y, si no existe, decisión: extender el sistema de permisos (más alcance) vs guard simple por whitelist de `usuario_id` por empresa (parche temporal con TODO claro).
- [ ] **Costo unitario en `movimientos_inventario`**: hoy `inventario.costo_promedio` se calcula desde dónde — ¿hay trigger o procedimiento existente? El RPC de recepción debe alimentar consistentemente costo_promedio. Confirmar al ejecutar Sprint 1.
- [ ] **Cancelación parcial vs cancelar OC entera**: el alcance separa "cancelar pendiente de una línea" de "cerrar OC cancelando todo el pendiente". Ambos coexisten. UI tiene que dejar claro cuál es cuál sin confundir al usuario.
- [ ] **Rollout multi-empresa cruza con `shared-modules-refactor`**: esa iniciativa ya está in_progress y planea extraer componentes de proveedores. Si Sprint 5 de `oc-recepciones` aterriza antes que el sub-PR equivalente de OC en shared-modules, hay riesgo de desvío. Decisión: Sprint 5 extrae componentes nuevos siguiendo la convención que `shared-modules-refactor` ya estableció en sus primeros sub-PRs, sin esperar.
- [ ] **`erp.recepciones` queda huérfana**: la tabla sigue existiendo y la UI nueva no la usa. Decidir en Sprint 1 si: (a) deprecarla con DROP eventual, (b) dejarla viva por si aparece "modo evento" después, (c) borrarla del SCHEMA_REF para reducir ruido pero conservar en DB. Recomendación inicial: opción (b) — dejarla quieta sin usar.

## Sprints / hitos

| #   | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                   | Estado                           | PR        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------- |
| 0   | Promoción: doc + fila en INITIATIVES.md                                                                                                                                                                                                                                                                                                                                                                                                 | done 2026-04-28                  | #260      |
| 1   | DB: migración (columnas nuevas en `ordenes_compra` y `ordenes_compra_detalle`) + RPCs (`oc_recibir_linea`, `oc_cancelar_pendiente_linea`, `oc_cerrar_orden`) + backfill de `estado` + regenerar SCHEMA_REF                                                                                                                                                                                                                              | done 2026-04-28                  | #261      |
| 2   | UI RDB drawer OC reorganizado: contadores por línea (pedida/recibida/pendiente/cancelada), acciones recibir/cancelar/cerrar, badges de estado nuevos                                                                                                                                                                                                                                                                                    | done 2026-04-28                  | #262      |
| 3   | Override de precio por admin con audit (trigger BEFORE UPDATE OF precio_real + UI ✏️ con ConfirmDialog)                                                                                                                                                                                                                                                                                                                                 | done 2026-04-28                  | #263      |
| 4   | Vista de movimientos en `/rdb/inventario/movimientos` con chip de origen + folio de OC clickable + filtro por origen + auto-open drawer en `/rdb/ordenes-compra?focus={oc_id}`                                                                                                                                                                                                                                                          | done 2026-04-28                  | #264      |
| 5   | Rollout multi-empresa: **diferido** porque DILESA/COAGAN/ANSA tienen 0 OCs y 0 almacenes en producción al cierre. El extract a `components/compras/` y el alta de `app/{empresa}/ordenes-compra/page.tsx` se harán cuando alguna de esas empresas empiece a generar OCs (sub-iniciativa). La lógica DB ya es genérica — basta poblar `core.modulos` con `{empresa}.ordenes_compra`, crear un row en `erp.almacenes` y enchufar el page. | deferred (sub-iniciativa futura) | _este PR_ |

## Decisiones registradas

### 2026-04-27 — Decisiones cerradas por Beto al promover la iniciativa

- **Modelo de recepciones = estado, no evento.** Solo importa "cuántas llevamos recibidas y cuántas pendientes" por línea. Las tablas `erp.recepciones`/`erp.recepciones_detalle` no se pueblan desde la UI nueva en v1.
- **CxP no existe hoy pero la iniciativa lo deja listo.** `total_a_pagar` se congela al cerrar la OC; cuando aparezca el módulo CxP, engancha sin retrabajo.
- **Un solo almacén por empresa por ahora.** No se agrega `almacen_id` a OC; el RPC resuelve el almacén default de la empresa.
- **Captura desde escritorio** sigue siendo el flujo esperado. Sin mobile-first.
- **Precio normalmente no cambia, gerente puede override** con audit. Se modela como columna `precio_real` separada de `precio_unitario` (null = sin override).
- **Multi-empresa desde el diseño**: la lógica DB se construye genérica para las 4 empresas desde Sprint 1, aunque la UI primero aterrice en RDB. Ajustes por particularidad (ANSA volumen, COAGAN lotes, DILESA materiales) son sub-iniciativas posteriores si emergen.
- **Prioridad 1**: esta iniciativa entra antes de `forms-pattern` y se considera bloqueante de operación. La cola del Roadmap UI espera.
- **Modo autónomo aprobado**: Claude Code genera PRs sprint-por-sprint, mergea con CI verde sin pedir confirmación intermedia. Beto revisa al cierre del día siguiente.

## Bitácora

### 2026-04-28 — Sprint 5 (Rollout multi-empresa) **diferido** — iniciativa cerrada

- Verificación en producción al cierre: query a `core.empresas + erp.ordenes_compra + erp.almacenes` confirma:
  - **RDB**: 174 OCs, 1 almacén — operación real, módulo en uso.
  - **DILESA**: 0 OCs, 0 almacenes.
  - **COAGAN**: 0 OCs, 0 almacenes.
  - **ANSA**: 0 OCs, 0 almacenes.
- Conclusión: no hay operación que rolloutear todavía. Construir el extract a `components/compras/` y crear `app/{empresa}/ordenes-compra/page.tsx` para empresas sin uso real sería teatro.
- **Patrón listo para futura empresa**: cuando alguna de las 3 empresas restantes empiece a generar OCs, los pasos para enchufarla son:
  1. Crear row en `erp.almacenes` para esa empresa (`almacen_id` lo resuelve el RPC `oc_recibir_linea` con `LIMIT 1`).
  2. Crear row en `core.modulos` con slug `{empresa}.ordenes_compra` y asignarlo al rol que corresponda en `core.permisos_rol`.
  3. Crear `app/{empresa}/ordenes-compra/page.tsx` — la primera vez extrayendo el módulo de `app/rdb/ordenes-compra/page.tsx` a `components/compras/ordenes-compra-module.tsx` parametrizado por `empresaId`/`empresaSlug`/`brandHeaderUrl`/`brandName`. RDB se vuelve un wrapper.
  4. Agregar `/{empresa}/ordenes-compra` a `lib/permissions.ts` `ROUTE_TO_MODULE`.
  5. Smoke test: capturar una OC de prueba, marcar enviada, recibir parcial, cerrar — verificar que `movimientos_inventario` se generan y `inventario` se actualiza.
- **Métricas de éxito de la iniciativa cumplidas en RDB** (las otras empresas no aplican por ausencia de operación):
  - Cero OCs zombi: por verificar al final del primer mes en producción.
  - Stock real sincronizado: validable en el próximo levantamiento físico de RDB.
  - Tiempo de captura ≤ 2 min: por validar con almacenista en uso real.
  - Trazabilidad: ✅ verificable hoy — cada `movimientos_inventario` con `referencia_tipo='oc_recepcion'` lleva `referencia_id` al folio de OC, y el chip en `/rdb/inventario/movimientos` lleva al detalle.
  - `total_a_pagar` correcto al cerrar: ✅ — calculable y congelado por la RPC `oc_cerrar_orden`.
  - Cero queries de UI fuera de RPCs: ✅ para recepción/cancelación/cierre. Excepción consciente: el override de precio (Sprint 3) hace UPDATE directo a `precio_real` y deja que el trigger BEFORE UPDATE valide admin + audite. Es un trade-off explícito (más simple que una RPC adicional para un solo campo).

### 2026-04-28 — Sprint 4 (Vista movimientos enlazada a OC) entregado

- PR #264 mergeado. Listado en `/rdb/inventario/movimientos` reformateado con columna **Origen** que reemplaza la antigua "Detalle / Referencia". Movimientos con `referencia_tipo='oc_recepcion'` muestran chip verde con 🚚 + folio de la OC, clickable a `/rdb/ordenes-compra?focus={oc_id}`. Filtro nuevo por origen (Todos / Por compra / Venta / Manual).
- `/rdb/ordenes-compra` ahora respeta `?focus={oc_id}` y auto-abre el drawer cuando llega ese param. Estado `autoOpenedFocusId` previene re-abrir si el usuario cierra manualmente.
- Hot-fix: `useSearchParams` requería boundary de Suspense para que el prerender estático no fallara. Vercel build falló al primer push; fix fue extraer el cuerpo a `OrdenesCompraContent` envuelto en `<Suspense fallback={null}>`. Verificado con `npm run build` local antes del re-push.
- Resolución del folio de OC en cliente: query secundaria a `erp.ordenes_compra` filtrada por `referencia_id` únicos (PostgREST no permite embed dinámico sobre `referencia_id` porque es polymorphic — sin FK declarada).

### 2026-04-28 — Sprint 3 (Override de precio por admin) entregado

- PR #263 mergeado. Migración `supabase/migrations/20260428140000_oc_recepciones_override_precio_admin.sql` aplicada en prod vía `psql`.
- Trigger `BEFORE UPDATE OF precio_real ON erp.ordenes_compra_detalle` con `core.fn_is_admin()` como gate. Auto-llena `precio_modificado_por`/`precio_modificado_at` y registra `core.audit_log` con valor anterior/nuevo (reusa `erp.fn_oc_audit` del Sprint 1).
- UI: botón ✏️ junto al precio de cada línea cuando `usePermissions().permissions.isAdmin`. ConfirmDialog con Input numérico pre-llenado con `precio_real ?? precio_unitario`. Precio se muestra en bold cuando hay override (con tooltip que muestra el original).
- **Decisión registrada**: el repo no tiene granularidad "Gerente" por módulo — usamos `core.fn_is_admin()` como gate. Suficiente porque los pocos usuarios con override autorizado son admins. Si después se modela "Gerente", basta cambiar la comparación de la función trigger.

### 2026-04-28 — Sprint 2 (UI RDB drawer) entregado

- PR #262 mergeado. Refactor del drawer en `app/rdb/ordenes-compra/page.tsx` para usar las RPCs del Sprint 1.
- Tabla de líneas con 4 contadores: Pedida, Recibida (input editable), Pendiente (calculado en vivo), badge de Cancelada cuando aplica. Botón × por línea para cancelar el pendiente individual con ConfirmDialog + Textarea de motivo.
- Acciones globales: "Recibir Todo" (auto-rellena al máximo recibible), "Guardar recepciones" (procesa los deltas), "Cerrar OC" (rojo, ConfirmDialog con preview de partidas a cancelar).
- Banner informativo cuando OC en estado terminal con `total_a_pagar` congelado.
- Listado lee `estado`, `total_a_pagar`, `cerrada_at` reales (no infiere desde `autorizada_at`). Helpers aceptan los 5 estados nuevos + alias legacy.
- Flujo "Marcar Enviada" actualiza también `estado='enviada'` + `autorizada_at` para que la transición quede reflejada en el modelo nuevo.
- Refresh post-mutación con `refreshOrdenAfterMutation(ordenId)` re-lee cabecera + líneas y actualiza drawer + lista sin re-fetch global.

### 2026-04-28 — Sprint 1 (DB schema + RPCs) entregado

- PR #261 mergeado. Migración `supabase/migrations/20260428100000_oc_recepciones_schema_y_rpcs.sql` aplicada en prod vía `psql`.
- Schema: `ordenes_compra_detalle` ganó `cantidad_recibida`, `cantidad_cancelada`, `precio_real`, `precio_modificado_por`/\_at, `motivo_cancelacion` con CHECK constraint. `ordenes_compra` ganó `estado` (CHECK borrador|enviada|parcial|cerrada|cancelada), `total_a_pagar`, `cerrada_at`, `cerrada_por`. Backfill de `estado` desde `autorizada_at`.
- 3 RPCs (todas SECURITY DEFINER + validan `core.fn_has_empresa`): `erp.oc_recibir_linea` (acumulado, no delta — INSERT en `movimientos_inventario` por el delta, idempotente si delta=0), `erp.oc_cancelar_pendiente_linea`, `erp.oc_cerrar_orden`.
- Helpers internos: `erp.fn_oc_recalcular_estado` (reglas de transición desde SUM de líneas), `erp.fn_oc_audit` (helper para `core.audit_log`).
- Decisión confirmada: "modelo = estado, no evento" — `erp.recepciones`/`erp.recepciones_detalle` siguen vivas pero la UI nueva no las usa. Deuda a deprecar después si el modelo de eventos no aparece como necesario.

### 2026-04-27 — Sprint 0 (Promoción) entregado

- PR #260 mergeado. `docs/planning/oc-recepciones.md` y fila en `INITIATIVES.md`. Estado `proposed → planned` con autorización de modo autónomo.
