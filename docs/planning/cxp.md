# Iniciativa — Cuentas por Pagar (CxP)

**Slug:** `cxp`
**Empresas:** todas (golden: RDB; rollout DILESA/COAGAN/ANSA en Sprint 6)
**Schemas afectados:** `erp` (extiende `facturas`; nuevas `cxp_pagos`, `cxp_pago_aplicaciones`; absorbe `gastos`; extiende `movimientos_bancarios` con referencia polimórfica, ADR-037)
**Estado:** in_progress
**Próximo hito:** Sprint 5 — conciliación de `cxp_pagos` contra el estado de cuenta. CxP ya hace su parte (emite los movimientos bancarios); el casamiento movimiento↔banco es **v1 de `conciliacion-bancaria`** (hermana, hoy desbloqueada porque CxP ya emite). Decidir con Beto si esa iniciativa lo absorbe o se hace un puente mínimo acá. Sprints 6 y 7 **cerrados**.
**Dueño:** Beto
**Creada:** 2026-04-28
**Última actualización:** 2026-06-29 (nuevo reparto de deberes de pago: Contabilidad programa, Dirección autoriza+registra en un paso; "programar" sin gate, "autorizar+registrar" gateado a Dirección + filtro de horizonte en Programación, migración `20260629182508`)

## Problema

El cierre del ciclo OC → Recepción → Inventario que cierra `oc-recepciones` deja `total_a_pagar` congelado al cerrar la OC, pero **no hay módulo que registre, programe ni controle el pago al proveedor**. Hoy:

- **Las facturas de egreso se reciben por correo/papel** y se contabilizan a posteriori contra el estado de cuenta. No hay control de qué se debe, a quién, ni cuándo vence.
- `erp.facturas` existe (multi-empresa, con `flujo`, `uuid_sat`, montos, vencimiento) pero está subutilizada: ninguna UI escribe ahí, no enlaza con OC, no enlaza con pagos.
- `erp.pagos` está modelada **solo para CxC** (`cobranza_id` NOT NULL). No sirve para registrar pagos a proveedores sin forzar la semántica.
- `erp.gastos` se usa para gastos sueltos sin RFC formal del proveedor — gasolina, comidas, papelería — pero queda desconectado del catálogo de proveedores y de las facturas SAT.
- No existe **3-way match** (OC + recepción + factura): el riesgo operativo es pagar de más vs. lo recibido o pagar duplicado.
- No existe **calendario de pagos** ni **antigüedad de saldos por proveedor**: la decisión de qué pagar esta semana vive en una hoja de cálculo o en la cabeza del operador.
- Las **retenciones de IVA/ISR** (aplicables por régimen de la empresa receptora y del proveedor — RESICO, AGAPES, frontera norte, servicios profesionales, arrendamiento) se calculan a mano cada vez. Las CSF de `core.empresas` ya tienen el régimen estructurado (`regimen_fiscal`, `obligaciones_fiscales`, `tipo_contribuyente`) pero no se está aprovechando para automatizar.

Resultado operativo: doble captura entre la realidad bancaria y la contable, riesgo de pagar facturas no recibidas/duplicadas, y nula visibilidad de obligaciones a futuro. Hoy esto se sostiene por buena memoria; el mes que se cae, se cae feo.

## Outcome esperado

- **Una factura de egreso = una cuenta por pagar** vivida desde `erp.facturas` (extendida) sin tabla paralela. Saldo, estado y match con OC visibles desde la lista.
- **Carga inclusiva**: XML CFDI ideal pero no obligatorio. Captura manual + adjuntar PDF también funciona. Mejor pecar de capturar de más.
- **3-way match** explícito cuando la factura tiene OC: el sistema sugiere la OC abierta del proveedor, valida que `factura.total ≤ oc.total_a_pagar` y bloquea el pago si hay diferencia sin override de Comité.
- **Calendario de pagos semanal** por empresa: lo que vence, lo que ya está programado, lo que necesita aprobación.
- **Aprobación de pagos por cualquier miembro del Comité Ejecutivo** (Beto, Alejandra, Michelle hoy en RDB+DILESA). Sin tier por monto en v1.
- **Retenciones automáticas con override**: el sistema propone tasa de IVA y retenciones según régimen de la empresa receptora (CSF en `core.empresas`) y del proveedor (`erp.personas_datos_fiscales` ya cargado por `proveedores-csf-ai`). El Comité acepta o ajusta antes de timbrar el pago.
- **Pago efectivo** descontando de cuenta bancaria (cuando se hace la transferencia/cheque), conciliable después contra el flujo de `cortes-conciliacion` ya productivo.
- **Aging de saldos por proveedor**: cuánto le debo a cada uno, partido en buckets (vigente / 1-30 / 31-60 / 61-90 / >90 días).
- **`erp.gastos` migrado a CxP**: cada gasto se promueve a factura de egreso (con o sin RFC formal). El módulo `gastos` queda como vista de compatibilidad o se deprecia.
- **Disponible en RDB primero**, replicado a DILESA/COAGAN/ANSA con la misma estructura. RDB es deliberadamente el más chico para pulir el flujo antes de que DILESA (volumen alto) lo use en serio.

## Alcance v1

- [x] **Sprint 1 — Schema (DB-puro)** ✅ aplicado a prod 2026-06-01:
  - Extender `erp.facturas`:
    - `orden_compra_id` (uuid, FK → `erp.ordenes_compra`, nullable)
    - `condiciones_pago_dias` (int, nullable — 0 = contado, 30 = neto 30, etc.)
    - `fecha_pago_programada` (date, nullable — calculada al alta como `fecha_emision + condiciones_pago_dias` y editable)
    - `monto_pagado` (numeric, default 0 — actualizado por trigger desde `cxp_pago_aplicaciones`)
    - `saldo` (numeric generated `total - COALESCE(monto_pagado, 0)`)
    - `estado_cxp` (text CHECK `'borrador'|'por_pagar'|'parcial'|'pagada'|'cancelada'`)
    - `forma_pago_sat` (text — claves SAT: 01 efectivo, 03 transferencia, etc.)
    - `metodo_pago_sat` (text — PUE / PPD)
    - `uso_cfdi` (text — G01, G03, etc.)
    - `tasa_iva` (numeric — 0, 8 o 16 según frontera/AGAPES/general)
    - `retencion_iva` (numeric, default 0)
    - `retencion_isr` (numeric, default 0)
    - `motivo_cancelacion` (text, nullable)
    - `cancelada_at`, `cancelada_por`
  - Nueva `erp.cxp_pagos`:
    - `id`, `empresa_id`, `proveedor_id` (denormalizado para queries rápidos), `monto_total`, `fecha_programada`, `fecha_pago` (real, null hasta ejecutarse), `cuenta_bancaria_id` (FK → `erp.cuentas_bancarias`), `metodo_pago` ('transferencia'|'cheque'|'efectivo'|'tarjeta'), `referencia` (folio cheque, número de operación), `estado` ('programado'|'aprobado'|'pagado'|'rechazado'|'cancelado'), `programado_por`, `aprobado_por`, `aprobado_at`, `pagado_por`, `pagado_at`, `notas`, timestamps.
  - Nueva `erp.cxp_pago_aplicaciones` (un pago aplica a 1..N facturas):
    - `id`, `empresa_id`, `pago_id` (FK), `factura_id` (FK), `monto_aplicado`, `created_at`. CHECK `Σ aplicaciones.monto_aplicado = pago.monto_total`.
  - Backfill: facturas existentes con `flujo='egreso'` quedan en `estado_cxp='por_pagar'` con `monto_pagado=0`.
  - Trigger: al `INSERT/UPDATE` en `cxp_pago_aplicaciones`, recalcula `factura.monto_pagado` y `factura.estado_cxp` ('parcial' si > 0 y < total; 'pagada' si = total).
  - RPCs:
    - `erp.cxp_factura_alta(...)` — alta manual de factura de egreso. Acepta `orden_compra_id` opcional; si OC presente, valida proveedor y monto.
    - `erp.cxp_factura_alta_xml(xml_text)` — parsea CFDI y crea la factura. Dedup por `uuid_sat`.
    - `erp.cxp_factura_cancelar(factura_id, motivo)`
    - `erp.cxp_pago_programar(...)` — crea `cxp_pagos` en estado 'programado' + `cxp_pago_aplicaciones` por las facturas seleccionadas.
    - `erp.cxp_pago_aprobar(pago_id)` — solo si el caller pertenece al Comité Ejecutivo de la empresa.
    - `erp.cxp_pago_marcar_pagado(pago_id, fecha_pago, referencia)` — dispara movimiento bancario.
    - `erp.cxp_pago_cancelar(pago_id, motivo)`
  - Función helper `erp.es_comite_ejecutivo(usuario_id, empresa_id) returns boolean` — lee `empleados_puestos` cruzado con `puestos.nombre LIKE 'Comité%'`. Si los datos están sucios, fallback a whitelist hardcoded en SQL hasta cleanup; queda como TODO.
  - Toda transición escribe a `audit_log`.
  - **Regenerar `SCHEMA_REF.md`** y commitearlo.

- [x] **Sprint 2 — Ingesta XML CFDI** (parser + endpoint; match-OC y PDF-LLM diferidos):
  - Endpoint `POST /api/<empresa>/cxp/facturas/upload-xml` (parser determinista, no LLM — el CFDI es estructurado).
  - Validaciones: `Receptor.Rfc = empresa.rfc`, dedup por `uuid_sat`, emisor existe en `erp.proveedores` (si no, sugiere alta — reutiliza `proveedores-csf-ai`).
  - Sugerencia automática de OC: si el emisor tiene OCs cerradas con saldo pendiente de pagar, las propone para match.
  - PDF parser opcional con LLM (reutiliza `lib/documentos/extraction-core.ts`) para casos donde solo hay PDF: extrae RFC, monto, fecha, conceptos. El usuario revisa antes de guardar.
  - Bulk upload (drag de varios XML).

- [x] **Sprint 3 — UI factura + aging (RDB golden)**:
  - `/rdb/cxp/` con sub-rutas (sigue patrón `module-page-submodules` ADR-005):
    - `facturas` — lista con filtros (proveedor, fecha, vencimiento, estado, OC). Usa `<DataTable>` ADR-010. Filtros con `useUrlFilters` ADR-007.
    - `aging` — antigüedad de saldos por proveedor con buckets.
    - `proveedores` — agregado: saldo total + facturas abiertas + último pago. Link al detalle de proveedor existente.
  - Drawer de factura (`<DetailDrawer>` ADR-009 una vez exista, hoy `<DetailPage>` para detalle): cabecera, líneas, OC enlazada, retenciones, pagos aplicados, archivos XML/PDF (`erp.adjuntos`).
  - Acción "Cargar XML" + "Captura manual" en header.
  - Badge de estado por factura (vence en X días / vencida / pagada / parcial).

- [x] **Sprint 4 — Programación + aprobación de pagos** (RDB + DILESA, componentes compartidos):
  - `/{empresa}/cxp/programacion` — tabla de facturas por pagar (`saldo > 0`, `estado_cxp` por_pagar/parcial) ordenada por lo que vence primero (marca vencidas); selección múltiple → agrupa por proveedor → 1 `cxp_pago` por proveedor con `cxp_pago_programar`. Cuenta bancaria / método / fecha programada al lote. Confirmación antes de programar.
  - `/{empresa}/cxp/pagos` — lista de `cxp_pagos` por estado (programado/aprobado/pagado/cancelado) con filtro; acciones por estado: Aprobar (`cxp_pago_aprobar`, gate Dirección server-side, error elegante si no), Marcar pagado (`cxp_pago_marcar_pagado`, confirmación fuerte + fecha/referencia), Cancelar (`cxp_pago_cancelar` con motivo). Drawer con facturas aplicadas + trazabilidad.
  - El botón "Aprobar" NO se esconde por rol en cliente (defensa: el RPC manda); si el caller no es Dirección, el toast muestra el error del RPC.
  - **Diferido a follow-up**: notificación email al aprobador cuando hay pagos pendientes (infra de notificación separada; reusaría `lib/juntas/email.ts` para branding por empresa). No es parte de este PR.

- [ ] **Sprint 5 — Pago efectivo + conciliación**:
  - "Marcar pagado" registra `fecha_pago` real, `referencia` (folio cheque o número de transferencia), y crea movimiento en `erp.cuentas_bancarias_movimientos` (o equivalente que use cortes hoy) con `referencia_tipo='cxp_pago'` + `referencia_id=pago.id`.
  - En `cortes-conciliacion`: al matchear un cargo bancario contra un `cxp_pago`, marcar el pago como conciliado.
  - Vista en `/rdb/cortes` que muestra los `cxp_pagos` pendientes de conciliar.

- [ ] **Sprint 6 — Migración de gastos + rollout multi-empresa**:
  - Migrar cada `erp.gastos` a `erp.facturas` (flujo='egreso', sin `uuid_sat` cuando no hay XML formal). Mantener `categoria_id` y `referencia` como metadata.
  - Decidir: deprecar `erp.gastos` (DROP eventual con vista de compatibilidad) o dejarla como vista materializada que lee de facturas.
  - Replicar componentes a DILESA/COAGAN/ANSA siguiendo `shared-modules-refactor` (ADR-011): extraer `<CxpFacturasModule>`, `<CxpProgramacionModule>`, etc. a `components/cxp/`. Pages por empresa = ~5-17 líneas con props.
  - Smoke test por empresa.

## Fuera de alcance v1

- **Complemento de pago SAT (REP)** automático: la generación del XML/PDF de complemento al timbrar pago PPD es sub-iniciativa propia (`cxp-rep` o similar). En v1, el operador lo timbra fuera del sistema y adjunta el PDF/XML al pago.
- **Aprobaciones por tier de monto** (ej. < $50k cualquiera del Comité, ≥ $50k 2 firmas): hoy todos los del Comité aprueban igual. Si emerge la necesidad, sub-iniciativa.
- **Motor automático de retenciones por régimen** completo: v1 sugiere tasas con reglas básicas (RESICO PM, AGAPES tasa 0%, frontera norte 8%, servicios profesionales retención 10% ISR + 10.6667% IVA) pero el Comité revisa/ajusta antes de aprobar. Sub-iniciativa para automatizar 100%.
- **DIOT (Declaración Informativa de Operaciones con Terceros)**: reporte SAT mensual. Sub-iniciativa.
- **Anticipos a proveedores**: el flujo es factura → pago, no anticipo → factura. Si hay un anticipo, se modela manualmente como factura "anticipo" y se aplica contra la real. Modelado robusto de anticipos = sub-iniciativa.
- **Multi-moneda activa**: `erp.facturas` no tiene `moneda_id`; v1 asume MXN. Si llega factura en USD/EUR (raro en operación local), captura manual con tipo de cambio en `notas`.
- **Notas de crédito automáticas (CFDI relacionados)**: detectar y aplicar nota de crédito reduciendo saldo de la factura origen. Modelado básico en v1 (`erp.facturas_relacionadas` opcional), automatización completa = follow-up.
- **Mobile-first**: el flujo de captura/aprobación es desktop. Si en el futuro el Comité aprueba desde celular, sub-iniciativa de UI.

## Métricas de éxito

- **Cero pagos sin factura registrada**: en RDB, todos los movimientos bancarios de egreso a proveedores conciliados contra un `cxp_pago` después del rollout de Sprint 5.
- **3-way match efectivo**: 100% de las facturas de egreso ligadas a OC `cerrada` tienen `factura.total ≤ oc.total_a_pagar` o un override del Comité con razón documentada.
- **Tiempo de captura de factura**: una factura típica con XML se captura en ≤ 30 seg desde drop del archivo hasta confirmar.
- **Aging visible**: en RDB, vista de aging por proveedor refleja correctamente el saldo (validación: suma de buckets = `Σ facturas.saldo` por proveedor).
- **Aprobación trazable**: cada `cxp_pago` aprobado tiene `aprobado_por` + `aprobado_at`, y cada transición vive en `audit_log`.
- **Retenciones aplicadas correctamente**: muestra de 10 facturas RDB tras Sprint 1, retenciones propuestas por el sistema coinciden con lo que pone el contador en >80% de los casos. Lo que no, se documenta como caso edge para iterar reglas.
- **Migración de gastos no pierde data**: post Sprint 6, `count(erp.gastos)` previo = `count(erp.facturas WHERE source='migrated_gastos')`. Cero registros perdidos.

## Riesgos / preguntas abiertas

- [ ] **Régimen fiscal mal capturado en `core.empresas`**: el motor de retenciones depende de `regimen_fiscal` y `obligaciones_fiscales`. Si las CSF están desactualizadas o vacías, las propuestas serán incorrectas. Sprint 1 abre con un check de las 4 empresas — si hay drift, alta prioridad de actualizarlas (cada CSF de empresa puede re-extraerse con el mismo flujo de `proveedores-csf-ai`, escalado a `core.empresas`).
- [ ] **`erp.empleados_puestos` cobertura del Comité Ejecutivo**: hoy memoria confirma RDB + DILESA cargados. COAGAN y ANSA pendientes. Bloquea aprobación de pagos en empresas no cargadas — Sprint 4 valida y, si falta, completa cargas como pre-requisito de rollout.
- [ ] **Trigger de saldo en `erp.facturas`**: cuidar que el `UPDATE` recursivo no se dispare en bucle. Patrón seguro: trigger `AFTER INSERT OR UPDATE OR DELETE ON cxp_pago_aplicaciones FOR EACH ROW`, recalcula con un `SELECT SUM(...)` directo.
- [ ] **Match factura ↔ OC para gastos sin OC**: muchos egresos no tienen OC (gasolina, papelería, servicios). El flag de "necesita OC" debe ser opcional, no bloqueante. Por categoría de gasto se decide.
- [ ] **`erp.cuentas_bancarias_movimientos`**: SCHEMA_REF debe confirmar el nombre exacto y campos. Si no existe, Sprint 5 abre creándola o aprovechando el flujo de cortes ya productivo.
- [ ] **Concurrencia en pago programado**: dos miembros del Comité aprobando el mismo pago al mismo tiempo. RPC con `SELECT ... FOR UPDATE` o CHECK de estado actual antes de transicionar.
- [ ] **`erp.facturas.estado_id`**: hoy hay un FK a una tabla de estados. Coexiste con el nuevo `estado_cxp`. Decisión: dejar el legacy `estado_id` huérfano (o null en CxP) y operar con `estado_cxp`. Documentar la coexistencia, no romper consumidores existentes.
- [ ] **`shared-modules-refactor` cruza con Sprint 6**: extraer componentes `<CxpFacturasModule>` etc. siguiendo la convención SM1-SM6 ya establecida. Sin esperar — la convención está estable.
- [ ] **OCR para PDFs sin XML**: reutilizar `lib/documentos/extraction-core.ts` (ya productivo en `proveedores-csf-ai` y `cortes-conciliacion` para vouchers). Costo en tokens Anthropic — limitar a casos donde el usuario pide explícitamente "extraer del PDF".

## Sprints / hitos

| #   | Scope                                                                                                                                                                                                                                                                                                                | Estado              | PR          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------- |
| 0   | Promoción: este doc + fila en INITIATIVES.md                                                                                                                                                                                                                                                                         | _este PR_           | —           |
| 1   | DB: extender `erp.facturas` + crear `cxp_pagos` + `cxp_pago_aplicaciones` + RPCs (alta, cancelar, programar, aprobar, marcar_pagado, cancelar_pago) + helper `es_comite_ejecutivo` + backfill + regenerar SCHEMA_REF                                                                                                 | aplicado            | _este PR_   |
| 2   | Parser CFDI determinista (`lib/cxp`) + endpoint `upload-xml` (bulk + dedup `uuid_sat` + validación receptor + sugerencia de proveedor). Match-OC automático y PDF-LLM diferidos a Sprint 3/follow-up                                                                                                                 | en PR               | _este PR_   |
| 3   | UI RDB facturas (lista + drawer) + aging + vista por proveedor                                                                                                                                                                                                                                                       | en PR               | _este PR_   |
| 4   | UI programación + aprobación (RDB + DILESA, componentes compartidos). Email de notificación diferido a follow-up                                                                                                                                                                                                     | en PR               | _este PR_   |
| 5   | Pago efectivo + conciliación contra cortes (engancha con `cortes-conciliacion` / `conciliacion-bancaria`). **Parcial**: emit de `movimientos_bancarios` (Sprint 1 RPC) + comprobante de pago (#847) ✅; **falta** el casamiento de `cxp_pago` ↔ cargo bancario en cortes + vista "pendientes de conciliar"           | parcial             | #847        |
| 6   | Migración de `erp.gastos` a CxP + rollout multi-empresa. **Cerrado por decisión (2026-06-28)**: rollout RDB+DILESA ✅ (#633); migración de gastos = no-op (`erp.gastos` vacía, se conserva por FK de `conciliaciones`); rollout COAGAN/ANSA **diferido** (0 datos ERP, 0 Dirección hoy)                              | **done** (decisión) | #633        |
| 7   | Rediseño del flujo en 3 etapas (pipeline por pestaña). S1: pantalla Facturas absorbe la programación (filtro "por programar" + programar gateado a Dirección, programar=autoriza). S2: pantalla Programación ejecuta pago + comprobante. S3: pantalla Pagos = pagadas (absorbido en S2 vía `estadoInicial="pagado"`) | **done** (prod)     | #1068/#1069 |

## Pendientes (estado a 2026-06-28)

Lo que falta para cerrar la iniciativa v1, en orden sugerido. El núcleo del módulo
(captura, 3-way match, programación=autoriza, ejecución de pago + comprobante,
aging) **ya está vivo en RDB y DILESA**.

### Sprint 5 — conciliación de pagos contra cortes (parcial)

- [x] `cxp_pago_marcar_pagado` emite `erp.movimientos_bancarios` (`tipo='cargo'`,
      `referencia_tipo='cxp_pago'`, `referencia_id`) — entregado en Sprint 1.
- [x] Comprobante de pago adjuntable al marcar pagado (#847).
- [ ] **Casamiento `cxp_pago` ↔ cargo bancario en cortes**: al conciliar un cargo
      contra un `cxp_pago`, marcarlo conciliado. **No integrado** (grep `cxp_pago`
      en código de cortes = vacío).
- [ ] **Vista "pendientes de conciliar"** (`cxp_pagos` pagados sin conciliar) en
      `/rdb/cortes` (o donde viva hoy el flujo).
- ⚠️ **Cruza con la hermana `conciliacion-bancaria`** (in_progress): decidir si la
  conciliación de CxP la absorbe esa iniciativa (3er vértice del triángulo de
  tesorería, ADR-037 D-conciliación) o se hace acá un puente mínimo. Alinear
  antes de codear para no duplicar.

### Sprint 6 — migración de gastos + rollout COAGAN/ANSA — **cerrado por decisión (2026-06-28)**

Revisión contra prod (2026-06-28): los dos entregables que faltaban resultaron
**no-op** o **prematuros**, así que el sprint se cierra por decisión, no por código.

- [x] Rollout RDB + DILESA con componentes compartidos (ADR-011) — #633.
- [x] **Migración de datos `erp.gastos` → no aplica**: `erp.gastos` está **vacía
      (0 filas en todo el sistema)**. No hay nada que migrar — la métrica de
      no-pérdida se cumple trivialmente. **`erp.gastos` se conserva** (NO se dropea):
      `erp.conciliaciones` (legacy) la referencia por FK, y esa tabla pertenece al
      mundo de `conciliacion-bancaria`. Su deprecación/limpieza es decisión de esa
      iniciativa hermana, no de CxP.
- [x] **Rollout COAGAN + ANSA → diferido (sin valor hoy)**: ambas tienen **0
      facturas, 0 OC, 0 gastos y 0 usuarios con rol Dirección** en prod. Liberar el
      módulo ahí sería una pantalla vacía que nadie puede autorizar. Se difiere hasta
      que esas empresas (a) onboarden actividad ERP de compras/egresos y (b) tengan
      al menos un usuario con rol Dirección. Cuando llegue, es mecánico: 5 lugares
      RBAC (`NAV_ITEMS`, `ROUTE_TO_MODULE`, `EXPECTED_DB_MODULE_SLUGS`, `MODULE_DEPS`,
      migración INSERT módulos + backfill) + pages delgadas con `<CxpFacturasModule>`
      etc. + revisar CSF (COAGAN AGAPES tasa 0%, ANSA) para el motor de retenciones.

### Follow-ups técnicos (transversales, no bloquean v1)

- [ ] **Email al aprobador** cuando hay pagos en estado «programado» — diferido
      desde Sprint 4; sin implementar (reusaría `lib/juntas/email.ts` para branding
      por empresa). Con el rediseño S7 (programar = autoriza en un paso) **puede que
      ya no aplique** para la autorización; reevaluar si sigue teniendo sentido como
      aviso de "hay pagos por ejecutar" en Programación.
- [x] **Código muerto `CxpProgramacionModule` — resuelto (2026-06-28).** El
      componente de programación en lote quedó sin renderizar tras S7. Se eliminó
      (`components/cxp/cxp-programacion-module.tsx`); el helper puro
      `pendientesDeProgramar` + tipo `AplicacionViva` (vivos: los usa la bandeja
      «Te toca») se extrajeron a `lib/cxp/pendientes-programar.ts` con su test.
- [x] **`erp.cxc_pago_registrar` `tipo='ingreso'` — ya corregido en prod.** La
      definición viva inserta `tipo='abono'` (con comentario sobre el CHECK
      `cargo`/`abono`); el hallazgo latente de Sprint 1 se resolvió en algún PR
      posterior. Sin acción pendiente.
- [ ] **Email al aprobador** cuando hay pagos en estado «programado» — diferido
      desde Sprint 4; sin implementar (reusaría `lib/juntas/email.ts` para branding
      por empresa). Con el rediseño S7 (programar = autoriza en un paso) **puede que
      ya no aplique** para la autorización; reevaluar si sigue teniendo sentido como
      aviso de "hay pagos por ejecutar" en Programación.
- [ ] **"Comprometido en pagos" en la vista "Todas" de facturas**: nota de #807
      (facturas con pagos programados se ven `por_pagar` con saldo completo). La
      vista "Por programar" de S7 ya descuenta el comprometido; evaluar si falta
      exponerlo también en la vista "Todas". Cosmético.
- [ ] **Limpieza de catálogo**: 4 contratistas con persona duplicada (RFC vs
      sin-RFC) — detectado en #1062. No bloquea, pero ensucia el auto-match de
      destajos.

### Iniciativas hermanas que consumen/extienden CxP (separadas, no son sprints de acá)

- `dilesa-estimaciones-cxp` (destajos semanales → CxP) — **cerrada/prod**.
- `dilesa-obra-estimaciones-cxp` (estimación de obra → CxP «en espera del XML») —
  in_progress, Sprint 4.
- `dilesa-catalogo-contable` (cuenta contable + partida en la factura) — Sprint 3
  en prod; alimenta la clasificación de la pantalla Facturas.
- `conciliacion-bancaria` — in_progress; 3er vértice de tesorería (ver Sprint 5).

## Decisiones registradas

### 2026-06-29 — Contabilidad programa, Dirección autoriza+registra (separación de deberes)

Reunión Michelle + Administración. El control de pagos se reparte así:
**Contabilidad** programa los pagos (y los carga al banco), **Dirección** los
autoriza y registra en BSOP. Implicaciones de diseño:

- "Programar" deja de ser un acto de Dirección → cualquier usuario con acceso al
  módulo puede programar (queda en `programado`, sin autorizar).
- La autorización y el registro del pago se fusionan en **un solo paso** para
  Dirección (`cxp_pago_autorizar_y_pagar`): por decisión de Michelle, ella
  autoriza y registra de un jalón; se sellan ambos timestamps de auditoría
  (`aprobado_*` y `pagado_*`). El estado `aprobado` intermedio queda como legacy
  (pagos viejos) pero el flujo nuevo no lo expone como paso separado.
- `marcar_pagado` se blinda con gate Dirección (antes libre) por si se invoca por
  otra vía. Política uniforme para todas las empresas (gate por rol Dirección por
  empresa, no por código empresa-específico).

### 2026-06-29 — El enlace factura→proveedor se resuelve por RFC scoped a empresa (+ trigger DB)

El match emisor→proveedor **siempre** debe filtrar por `empresa_id`: un mismo RFC
existe como persona en varias empresas del portafolio, y un match global rompe
(`maybeSingle` con 2 filas) dejando la factura sin proveedor. Además del fix en el
importador, el invariante se garantiza a nivel DB con
`erp.fn_cxp_factura_autolink_proveedor` (trigger BEFORE INSERT/UPDATE): cualquier
factura de egreso con `proveedor_id` NULL y `emisor_rfc` conocido se auto-enlaza a
la persona de su empresa. El trigger no pisa enlaces explícitos (solo actúa cuando
`proveedor_id IS NULL`). Razón: el botón "Programar pago" depende de
`factura.proveedor_id`; sin proveedor, el operador queda atorado sin recurso (hoy
no hay UI para enlazar manualmente — pendiente como mejora aparte).

### 2026-06-26 — Rediseño del flujo de CxP en 3 etapas (pipeline por pestaña)

Beto rediseña la navegación del módulo para que cada pestaña sea una etapa del
ciclo y el trabajo "avance de pantalla" conforme se procesa:

- **Pantalla 1 · Facturas** — entrada: facturas cargadas + en espera del XML.
  Contabilidad clasifica **cuenta contable** y **partida** (cualquiera con
  acceso al módulo). **Dirección programa el pago**, y esa programación **es la
  autorización** (un solo paso; no hay aprobación separada). Las facturas
  programadas salen de esta pantalla.
- **Pantalla 2 · Programación** — los pagos ya programados (= autorizados). Aquí
  se **ejecuta el pago** y se **sube el comprobante**; al marcarse pagado pasa
  solo a la pantalla 3.
- **Pantalla 3 · Pagos** — las ya pagadas (histórico).

**Cambia la decisión de 2026-04-28** ("aprobación = cualquier miembro del Comité
Ejecutivo, sin tiers"): la autorización del pago se **restringe al rol
Dirección** y se **fusiona con la programación** (programar ⇒ autorizado). El
gate usa `direccionEmpresaIds` (ver memoria `reference_roles_por_empresa`). La
clasificación contable / de partida queda abierta a contabilidad.

Implementación **incremental por sprint** (S1 pantalla 1, S2 pantalla 2, S3
pantalla 3) para no romper el flujo de pagos en producción; cada sprint con
Vercel Preview revisable antes de merge. El primer corte del auto-match de
destajo por persona duplicada (PR #1062) y la reconciliación del caso David ya
quedaron resueltos como prerequisito de higiene de datos.

### 2026-04-28 — Decisiones cerradas por Beto al promover la iniciativa

- **Golden = RDB, no DILESA.** RDB tiene menor volumen de proveedores → mejor sandbox para pulir el flujo antes de exponerlo al volumen real de DILESA. Inverso a la recomendación inicial pero coherente con la cultura del repo (oc-recepciones también arrancó RDB-first).
- **Aprobación = cualquier miembro del Comité Ejecutivo.** Sin tiers por monto en v1. Beto, Alejandra y Michelle aprueban con la misma autoridad. La membresía vive en `erp.empleados_puestos` (puesto "Comité Ejecutivo"). Si emerge necesidad de tier (montos altos requieren 2 firmas), sub-iniciativa.
- **Captura inclusiva.** XML CFDI es la entrada ideal pero no obligatoria. Captura manual con o sin RFC formal del proveedor también funciona. La política es "mejor capturar de más y limpiar después que perder un pago por rigidez".
- **Retenciones por régimen vía CSF.** El motor de propuesta de retenciones lee `core.empresas.regimen_fiscal` (empresa receptora) + `personas_datos_fiscales.regimen_fiscal` (proveedor) para sugerir tasas. Aplica estímulos vigentes (frontera norte, AGAPES, RESICO). El Comité acepta o ajusta antes de aprobar. Verificar que las CSF de las 4 empresas estén actualizadas en Sprint 1; si faltan, se actualizan como pre-requisito.
- **Gastos se migran.** `erp.gastos` se absorbe como facturas de egreso (con o sin XML). Decisión final entre deprecar la tabla o mantenerla como vista de compatibilidad se cierra en Sprint 6 cuando se vea el shape real de los datos migrados.
- **CxP empieza por RDB y se diseña genérico.** Lógica de DB + RPCs son multi-empresa desde Sprint 1; UI RDB primero (Sprints 3-5); rollout DILESA/COAGAN/ANSA en Sprint 6. Particularidades por empresa (ANSA volumen, COAGAN AGAPES, DILESA materiales) entran como sub-iniciativas si emergen.
- **Modo de ejecución pendiente de definir al arrancar Sprint 1.** Beto autorizó modo autónomo en `oc-recepciones`; aplica caso por caso. Para CxP, el primer PR de promoción se entrega y se espera green light explícito antes de Sprint 1.

### 2026-06-12 — Rechazos de ingesta XML auditables + status no-200

- **Los rechazos de carga son eventos de auditoría, no solo UX.** Todo
  archivo rechazado por upload-xml deja fila en `core.audit_log`
  (`cxp_factura_rechazo`) + una fila-resumen por lote
  (`cxp_facturas_upload_lote`). Razón: el modal es efímero; sin rastro
  server-side, un reporte de un operador días después es indiagnosticable.
  El insert es best-effort (un fallo de audit no aborta la carga).
- **El endpoint señaliza el desenlace en el status HTTP**: 200 todo
  cargado, 207 parcial, 422 ningún archivo pasó. El body no cambia. Razón:
  los logs de Vercel muestran el status sin abrir el body — un lote
  fallido se ve a simple vista. Se verificó que el único caller
  (`UploadXmlDialog`) trata non-2xx con `results` por la rama normal y
  `onDone(0)` es no-op.
- **`p_usuario_id` explícito en vez de impersonar al usuario.** El RPC
  recibe el `user.id` autenticado como parámetro opcional
  (`COALESCE(p_usuario_id, auth.uid())` en el INSERT de audit) en lugar de
  crear un client per-request con el JWT del usuario. Razón: cambio mínimo
  y compatible — los callers SQL existentes no se tocan; el endpoint ya
  corre con admin client por diseño (SECURITY DEFINER + storage).

### 2026-06-01 — Re-sincronización como gemela de CxC (ADR-037)

Al promover [`cxc`](cxc.md), Beto pidió diseñar CxC y CxP **juntas como
gemelas**. CxP no cambia su alcance v1 ni sus sprints; se alinea al
patrón canónico de **ADR-037** (subledger gemelo):

- **`cxp_pagos` / `cxp_pago_aplicaciones` siguen el mismo shape** que sus
  espejos `cxc_*`. La capa de aplicación N:M, el `CHECK Σ ≤ total`, el
  trigger de saldo `AFTER ... FOR EACH ROW` con `SELECT SUM` directo, y
  la derivación de estado (`vencido` por fecha, no almacenado) son
  idénticos en ambos lados.
- **Emisión de movimiento bancario**: `cxp_pago_marcar_pagado` escribe
  `erp.movimientos_bancarios` con `referencia_tipo='cxp_pago'` +
  `referencia_id`. La **extensión polimórfica de `movimientos_bancarios`
  la entrega CxC en su Sprint 1** (es quien arranca primero); CxP la
  consume sin volver a crearla.
- **Asimetría documentada (ADR-037 D2)**: CxP usa `erp.facturas` como
  documento de adeudo (semántica fiscal SAT propia); CxC usa
  `erp.cxc_cargos`. El resto del patrón es simétrico.
- **Conciliación (Sprint 5)**: el casamiento contra el estado de cuenta
  bancario se reorienta a la iniciativa hermana
  [`conciliacion-bancaria`](conciliacion-bancaria.md) (3er vértice del
  triángulo de tesorería). CxP Sprint 5 se limita a **emitir** el
  movimiento y conciliar contra cortes; la conciliación bancaria full
  vive en la hermana.
- **Componentes UI compartidos**: vista de aging por buckets, drawer de
  aplicación de pago y badges de estado se extraen a `components/` y los
  reusan CxC y CxP (convención `shared-modules-refactor`, ADR-011).

## Bitácora

- **2026-06-29 — Nuevo reparto de responsabilidades de pago (reunión Michelle + Admin).**
  Se separa "programar" de "autorizar": **Contabilidad** carga facturas, clasifica
  partida/cuenta y **programa** los pagos (y los carga al banco ellos mismos);
  **Dirección (Michelle)** **autoriza y registra** el pago en BSOP. Antes
  "programar = autoriza" (gate Dirección en Facturas) y "marcar pagado" era libre
  — se invirtió.
  - **Facturas tab:** "Programar pago" deja de exigir rol Dirección (lo gatea el
    acceso al módulo) y ya **no auto-aprueba** — el pago queda en `programado`.
  - **Programación tab:** una sola acción **"Autorizar y registrar pago"** para
    pagos `programado`/`aprobado` (RPC nueva `cxp_pago_autorizar_y_pagar`: aprueba
    si venía programado + marca pagado, atómico, gate Dirección). Se retiró el
    botón "Aprobar" separado.
  - **Gate:** `cxp_pago_marcar_pagado` ahora exige Dirección (antes libre);
    `cxp_pago_aprobar` se mantiene. Aplica a **todas las empresas** (gate por rol
    Dirección por empresa).
  - **Filtro de horizonte** en Programación: default **"Hoy + vencidos"**; presets
    próxima semana / próximos 15 días / próximo mes / todos (acumulativos; los
    pagos sin fecha programada siempre visibles). Helper puro
    `filtrarPagosPorHorizonte` + tests.
  - **Programar exige cuenta contable:** el botón "Programar pago" (pestaña
    Facturas) solo se habilita si la factura tiene proveedor enlazado **y** cuenta
    contable clasificada — no se programa un egreso sin clasificar.
  - Migración `20260629182508`. Aplica a prod al mergear con label `finanzas-ok`.

- **2026-06-29 — Fix: facturas sin botón "Programar pago" (proveedor sin enlazar).**
  Beto reportó facturas de egreso en DILESA donde no aparecía el botón. Causa raíz:
  el importador de XML (`app/api/[empresa]/cxp/facturas/upload-xml/route.ts`)
  matcheaba el emisor → proveedor con `.eq('rfc', …).maybeSingle()` **sin filtrar
  por empresa**. Para los RFCs que viven como persona en dos empresas del portafolio
  (HOME DEPOT, IMSS, RIPSA, GOBIERNO EDO., JORGE AMIN — duplicados en DILESA y RDB),
  `maybeSingle()` recibía 2 filas → error silencioso → `proveedor_id` NULL → sin
  proveedor el botón no se muestra (gate `factura.proveedor_id`). 10 de 12 facturas
  afectadas por esto; las otras 2 (AUTO SERVICIOS DE PIEDRAS NEGRAS, SOPORTE DE
  SUPERVISIÓN EN CONSTRUCCIÓN) simplemente no tenían proveedor en el catálogo.
  - **Fix raíz (código):** helper `matchProveedorId` scoped a `empresa_id`, robusto
    a duplicados intra-empresa (`order created_at + limit(1)`, no lanza). Reemplaza
    las 2 búsquedas del importador (analyze + commit).
  - **Backstop DB:** migración `20260629174922_cxp_factura_autolink_proveedor` —
    trigger `BEFORE INSERT/UPDATE` en `erp.facturas` que auto-enlaza
    `proveedor_id`+`persona_id` desde el RFC del emisor dentro de la misma empresa
    cuando viene NULL. Cubre **cualquier** vía de alta, no solo el importador.
  - **Datos:** la misma migración crea los 2 proveedores faltantes (morales) y
    backfillea las 12 facturas. Aplica a prod al mergear con label `finanzas-ok`.

- **2026-06-28 — Higiene + cierre honesto de Sprint 6 (diagnóstico contra prod).**
  Beto pidió arrancar pendientes. El diagnóstico contra prod desinfló dos de los
  tres "sprints grandes" del backlog:
  - **`erp.gastos` está vacía (0 filas en todo el sistema)** → la "migración de
    gastos" del Sprint 6 es no-op. **No se dropea** la tabla: `erp.conciliaciones`
    (legacy) la referencia por FK; su destino es de `conciliacion-bancaria`.
  - **COAGAN y ANSA: 0 facturas, 0 OC, 0 gastos, 0 usuarios Dirección** → rollout
    prematuro (pantalla vacía, nadie autoriza). **Diferido** hasta que onboarden ERP
    - tengan rol Dirección. Sprint 6 se cierra por decisión.
  - **Bug latente `erp.cxc_pago_registrar` `tipo='ingreso'`** (flageado en Sprint 1):
    la definición viva en prod ya inserta `tipo='abono'`. Ya corregido — sin acción.
  - **Código muerto eliminado**: `components/cxp/cxp-programacion-module.tsx` (el
    componente de programación en lote dejó de renderizarse tras S7, #1069). El
    helper puro `pendientesDeProgramar` + tipo `AplicacionViva` —vivos, los usa la
    bandeja «Te toca» (`components/gasto/te-toca-strip.tsx`)— se extrajeron a
    `lib/cxp/pendientes-programar.ts` con su test. ~600 líneas de JSX muerto fuera.
  - Saldo: **CxP v1 queda esencialmente completo** para quien lo usa (RDB/DILESA).
    El único pendiente sustantivo es la conciliación movimiento↔banco (Sprint 5),
    que pertenece a la hermana `conciliacion-bancaria` (in_progress, ahora
    desbloqueada porque CxP ya emite los movimientos).

- **2026-06-28 — Revisión de estado: Sprint 7 cerrado en prod, doc reconciliado.**
  Auditoría a pedido de Beto ("creo avanzamos más de lo registrado"). Hallazgo:
  el **Sprint 7 (rediseño del flujo en 3 etapas) está completo en prod** y el doc
  seguía marcándolo "in_progress (S1)".
  - **S1 (#1068, mergeado 2026-06-26):** la pantalla **Facturas** se vuelve la 1ª
    etapa del pipeline. Vista "Por programar" (`porProgramar = saldo − comprometido`,
    comprometido = pagos vivos programado/aprobado) + selector "Por programar | Todas".
    En el drawer, **Dirección** ve "Programar pago" que crea el `cxp_pago` y lo
    **aprueba en el mismo paso** (programar = autoriza). Gate cliente: admin O
    `direccionEmpresaIds`, espejo del gate server de `cxp_pago_aprobar` (sin
    migración — el RPC ya gateaba Dirección).
  - **S2 (#1069, mergeado 2026-06-26):** **cierra el rediseño**. Programación y
    Pagos reusan `<CxpPagosModule>` con prop nuevo **`estadoInicial`**: Programación
    = `"pendientes"` (programado+aprobado → marcar pagado + comprobante), Pagos =
    `"pagado"` (histórico). **S3 quedó absorbido aquí** (Pagos = histórico sale del
    filtro). RDB y DILESA ambas con el flujo nuevo.
  - **Deuda técnica que dejó el rediseño:** `components/cxp/cxp-programacion-module.tsx`
    (`CxpProgramacionModule`, programar en lote por proveedor) **ya no se renderiza**
    — solo aporta el helper `pendientesDeProgramar` + su test. Decidir: borrar el
    JSX muerto o re-exponer el lote como acción secundaria en Programación.
  - Sin cambios de código en esta entrada (solo doc). Promoción del Sprint 7 fue
    #1064.

- **2026-06-26 — Fix auto-match de destajo por persona duplicada + reconciliación + promoción del Sprint 7.**
  Síntoma: facturas de destajo con XML ya cargado seguían en "en espera del
  XML". Causa: el auto-match reconocía al contratista solo por `proveedor_id`
  exacto; cuando el destajo se capturó con una persona sin RFC y el CFDI matchea
  otra con RFC (mismo humano, registro duplicado), creaba una factura normal y
  dejaba el placeholder huérfano. Fix (PR #1062, mergeado): `candidatosParaCfdi`
  reconoce por `proveedor_id`, RFC o nombre normalizado. Dato reconciliado en
  prod con OK de Beto (caso David Salazar, destajo EST-2026-W26): placeholder
  cancelado + factura real ligada (estimación → 'facturada'), audit trail.
  Quedan 4 contratistas con persona duplicada (limpieza de catálogo aparte).
  Promovido el **Sprint 7** (rediseño del flujo en 3 etapas) con la decisión de
  Beto sobre programar=autoriza gateado a Dirección (PR #1064).

- **2026-06-12 — Audit trail server-side en upload-xml (caso Norberto).**
  Los rechazos por archivo del endpoint de ingesta XML (duplicado por
  `uuid_sat`, RFC receptor ajeno, error de parseo, error del RPC) solo se
  mostraban en el modal del cliente — "subí facturas y no se guardaron"
  era indiagnosticable server-side (Norberto/Contabilidad DILESA,
  2026-06-11, hubo que triangular Vercel + audit_log + storage). Ahora el
  route inserta en `core.audit_log` (best-effort, batch único): una fila
  `cxp_factura_rechazo` por archivo rechazado (filename, motivo, uuid_sat,
  emisor_rfc; en duplicados `registro_id` = factura existente) + una
  `cxp_facturas_upload_lote` por lote (total/exitosos/rechazados), ambas
  con `usuario_id` y `user_agent`. El RPC `erp.cxp_factura_alta` gana
  `p_usuario_id` opcional (migración `20260612161552`, DROP+CREATE para no
  dejar overload) y deja de registrar `usuario_id=NULL` vía service role.
  Status del endpoint: 200 todo cargado / 207 parcial / 422 ningún archivo
  pasó (el modal ya manejaba non-2xx con `results`; verificado sin cambios
  de cliente). Tests del route nuevos (6). Migración aplicada a prod el
  mismo día con OK verbal de Beto (`supabase db push`, firma verificada
  sin overload) + `types/supabase.ts` regenerado. PR #859.
- **2026-06-11 — Hotfix cross-sesión (sesión presupuesto-baseline, con OK de
  Beto): `20260611003056_cxp_fix_saldo_solo_pagos_ejecutados`.** Bug
  reportado por Beto: al PROGRAMAR un pago las facturas se marcaban
  "pagada" (el trigger de saldo sumaba aplicaciones sin distinguir estado
  del pago; caso real 2 facturas $306k con $0 ejecutado). Fix:
  `fn_cxp_recalc_factura` compartida (solo pagos `estado='pagado'` vivos
  cuentan), trigger nuevo en `cxp_pagos` (cambio de estado recalcula
  facturas), `cxp_pago_programar` valida contra comprometido vivo
  (anti doble-programación), `cxp_pago_aprobar` gana override de admin
  global (política Beto 2026-06-10: admin nunca se bloquea) y backfill
  (0 inconsistencias). Nota UI para esta iniciativa: las facturas con
  pagos programados ahora se ven `por_pagar` con saldo completo —
  valdría mostrar "comprometido en pagos" en la tabla de facturas.

### 2026-06-02 — Sprint 4 (UI programación + aprobación de pagos · RDB + DILESA)

Programación y aprobación de pagos a proveedores, componentes compartidos
cross-empresa desde el inicio (ADR-011, SM1-SM6). Modo autónomo, **sin
auto-merge** (UI visible → preview para revisión de Beto).

- **`components/cxp/cxp-programacion-module.tsx`** (`CxpProgramacionModule`,
  `empresa` + `empresaId`): tabla de facturas de egreso con `saldo > 0` y
  `estado_cxp IN ('por_pagar','parcial')`, ordenada por la fecha que vence
  primero (`fecha_pago_programada` || `fecha_vencimiento`), con badge de
  urgencia (vencida Nd / vence hoy / vence Nd). Selección múltiple
  (checkbox por fila + select-all de lo filtrado, footer con total y #
  proveedores). Al confirmar, **agrupa por proveedor** (clave id→RFC→nombre)
  y llama `erp.cxp_pago_programar` **una vez por proveedor** con
  `[{factura_id, monto: saldo}]`. El dialog elige cuenta bancaria
  (`erp.cuentas_bancarias` activas de la empresa), método y fecha programada
  (comunes al lote); bloquea si alguna factura no tiene proveedor enlazado.
  Secuencial por grupo → reporta fallas por proveedor sin abortar el lote
  (la RPC valida saldo factura por factura).
- **`components/cxp/cxp-pagos-module.tsx`** (`CxpPagosModule`, `empresaId`):
  lista de `erp.cxp_pagos` por estado (filtro, default «programado»), con
  proveedor/cuenta resueltos por query puntual. Acciones por estado:
  - **Aprobar** (programado): `ConfirmDialog` → `cxp_pago_aprobar`. El botón
    **NO se esconde por rol** en cliente (defensa: manda el RPC); si el caller
    no es Dirección, el RPC lanza y se muestra su mensaje con toast claro
    («Solo un miembro del Comité Ejecutivo puede aprobar pagos» — copy del RPC).
  - **Marcar pagado** (aprobado): dialog con `fecha_pago` + `referencia` y
    **confirmación fuerte** (egreso real; advierte si emite o no movimiento
    bancario según haya cuenta) → `cxp_pago_marcar_pagado`.
  - **Cancelar** (no pagado): dialog con motivo → `cxp_pago_cancelar`.
  - **Drawer** (`<DetailDrawer>`): datos del pago, trazabilidad
    (aprobado/pagado), y facturas aplicadas vía embed
    `cxp_pago_aplicaciones → facturas!factura_id`.
- **4 pages delgadas** (`app/{rdb,dilesa}/cxp/{programacion,pagos}/page.tsx`):
  wrappers `<RequireAccess modulo="<sub-slug>">` → componente compartido con
  la identidad de la empresa (`*_EMPRESA_ID` de `lib/empresa-constants.ts`).
  El gate de `RequireAccess` (retorna null mientras carga) provee el boundary
  de Suspense para el `useSearchParams` que programación usa vía
  `useUrlFilters` — mismo patrón que la page de facturas.
- **2 tabs nuevos** en AMBOS layouts (rdb + dilesa) con su `module:`
  (`Facturas · Programación · Pagos · Saldos · Proveedores`). Sidebar parent
  no cambia.
- **4 lugares RBAC** (regla "Liberación de módulo nuevo" + ADR-030):
  (1) layouts `TABS`; (2) `ROUTE_TO_MODULE` — 4 URLs nuevas → sus sub-slugs;
  (3) `EXPECTED_DB_MODULE_SLUGS` — `{rdb,dilesa}.cxp.{programacion,pagos}`;
  (4) migración `20260602020000_modulos_cxp_pagos_subslugs.sql`: INSERT de los
  4 sub-slugs (sección `administracion`, JOIN a `core.empresas`, `ON CONFLICT
DO NOTHING`) + **backfill defensivo** clonando los permisos del sub-slug
  hermano `<empresa>.cxp.facturas` a cada nuevo. **Aplicada a prod vía
  `execute_sql`** (no `db push`) para evitar carrera con migraciones paralelas;
  archivo committeado como fuente de verdad (CI lo valida en el Preview branch)
  - registrada en `schema_migrations`. Verificado en prod: 10 slugs `%.cxp.%`,
    los nuevos espejo de `facturas` (DILESA 9 roles 5L/3E, RDB 6 roles 5L/4E).
- Sin migración de schema → `SCHEMA_REF.md`/`types/supabase.ts` sin cambios
  (RBAC-only). Sin `as any`; `as unknown as Json` solo para el JSONB de
  aplicaciones y `as unknown as` para el shape del embed de facturas.
- **Diferido a follow-up (pendiente operativo)**: notificación email al
  aprobador cuando hay pagos en estado «programado». Es infra de notificación
  separada (reusaría `lib/juntas/email.ts` para branding por empresa); no se
  incluyó en este PR para mantenerlo acotado a la UI.
- 5 checks verdes: typecheck + 1177 tests + lint (0 errores) + format +
  schema:check.

**Próximo:** Sprint 5 — pago efectivo + conciliación contra cortes (engancha
con `cortes-conciliacion`).

### 2026-06-02 — Rollout DILESA + extracción de componentes compartidos (ADR-011)

Rollout del módulo CxP a **DILESA** (`/dilesa/cxp`) + extracción de la UI RDB a
componentes compartidos cross-empresa (ADR-011, SM1-SM6). Modo autónomo, **sin
auto-merge** (UI visible → preview para revisión de Beto). Extiende PR #630
(RDB + DILESA).

- **Extracción a `components/cxp/`** (ADR-011): la lógica/JSX de las 3 pages RDB
  se movió a 3 módulos parametrizados por `empresa: EmpresaSlug` + `empresaId`:
  - `CxpFacturasModule` (`cxp-facturas-module.tsx`) — lista + drawer
    (`FacturaDrawer`) + uploader (`UploadXmlDialog`), todo en un archivo (el
    drawer y el uploader solo los usa facturas). El uploader construye la URL
    `/api/${empresa}/cxp/facturas/upload-xml` y el copy del dialog dice el
    receptor por empresa; el link de la OC usa `/${empresa}/ordenes-compra`.
  - `CxpAgingModule` (`cxp-aging-module.tsx`) — buckets por proveedor.
  - `CxpProveedoresModule` (`cxp-proveedores-module.tsx`) — agregado por proveedor.
  - Reusa el `EmpresaSlug` (`'dilesa' | 'rdb'`) y los UUIDs de
    `lib/empresa-constants.ts` (single source of truth, SM3). Sin `as any`;
    `as unknown as` solo para el shape del embed `cxp_pagos`.
- **Pages RDB reescritas como wrappers delgados** (SM1): `app/rdb/cxp/page.tsx`
  (904→21 líneas), `aging/page.tsx` (263→21), `proveedores/page.tsx` (222→21).
  El `layout.tsx` RDB no cambia (tabs RDB). RDB sigue funcionando idéntico:
  typecheck + 1155 tests verdes, mismas queries (filtradas por `empresaId`),
  mismo drawer, mismo uploader.
- **Pages DILESA nuevas** (`app/dilesa/cxp/`): `layout.tsx` (RoutedModuleTabs con
  sub-slugs `dilesa.cxp.*`), `page.tsx` (facturas), `aging/`, `proveedores/`,
  cada una `<RequireAccess empresa="dilesa" modulo="dilesa.cxp.<sub>">` →
  módulo compartido con `empresa="dilesa"`. El gate de `RequireAccess` (que
  retorna null mientras carga) provee el boundary para el `useSearchParams` que
  el módulo de facturas usa vía `useUrlFilters` — mismo patrón que la page RDB
  original que ya pasaba CI.
- **4 lugares RBAC** (regla "Liberación de módulo nuevo" + ADR-030):
  (1) `NAV_ITEMS` — entry `{ label: 'CxP', href: '/dilesa/cxp' }` en sección
  Administración de DILESA, junto a CxC; (2) `ROUTE_TO_MODULE` — `/dilesa/cxp`→
  `.facturas`, `/aging`→`.aging`, `/proveedores`→`.proveedores`;
  (3) `EXPECTED_DB_MODULE_SLUGS` — padre `dilesa.cxp` + 3 sub-slugs;
  (4) migración `20260602010000_modulos_dilesa_cxp.sql`.
- **Migración** (espejo de la de RDB): inserta `dilesa.cxp` + 3 sub-slugs
  resolviendo `empresa_id` con JOIN a `core.empresas WHERE slug='dilesa'`
  (robusto a Preview) + `ON CONFLICT DO NOTHING`, sección `administracion`.
  **Backfill defensivo**: clona los permisos de cada rol DILESA sobre
  `dilesa.cobranza` (CxC, mismo sección/finanzas, gemelo del subledger ADR-037)
  hacia los 4 slugs nuevos. `NOTIFY pgrst`. **Aplicada a prod vía `execute_sql`**
  (no `db push`) para evitar carrera con la migración paralela
  `20260602004906_core_gobierno_corporativo` (aplicada a prod por otra sesión,
  su archivo aún no en main). Verificado en prod: 4 slugs en `administracion`,
  cada uno con 9 roles backfilled (5 lectura / 3 escritura) — espejo de
  `dilesa.cobranza`. Registrada en `schema_migrations`.
- **Nota de drift (no CxP):** `schema:check` local contra prod marca las tablas
  `core.gobierno_*` de la migración paralela (no en este branch). Mi cambio no
  toca schema (solo data en `core.modulos`/`core.permisos_rol`), así que
  `SCHEMA_REF.md`/`types/supabase.ts` se dejaron en el estado del branch (no se
  commitearon artefactos de gobierno sin su migración). Se reconcilian al
  rebasar sobre main cuando el PR de gobierno mergee.
- typecheck + 1155 tests + lint (0 errores) + format verdes.

**Próximo:** Sprint 4 — programación + aprobación de pagos por rol Dirección.

### 2026-06-02 — Sprint 3 (UI RDB: facturas + drawer + aging + proveedores)

Módulo UI `/rdb/cxp` (golden = RDB). Gemelo del módulo CxC `/dilesa/cobranza`.
Patrón routed-tabs (ADR-005) + sub-slugs (ADR-030). Modo autónomo, **sin
auto-merge** (UI visible → preview para revisión de Beto).

- **Migración `20260602001532_modulos_rdb_cxp.sql`** (aplicada a prod con
  `supabase db push`): inserta el padre `rdb.cxp` (umbrella, sección
  `administracion`) + 3 sub-slugs `rdb.cxp.facturas` / `.aging` / `.proveedores`
  con `ON CONFLICT DO NOTHING`. **Backfill defensivo**: clona los permisos que
  cada rol RDB tiene sobre `rdb.ordenes_compra` (módulo de Compras comparable —
  antecesor natural del flujo OC→factura→pago) hacia los 4 slugs nuevos →
  verificado: 6 roles con fila `permisos_rol`, 5 con lectura. `NOTIFY pgrst`.
- **4 lugares RBAC** (regla "Liberación de módulo nuevo" + ADR-030):
  (1) `NAV_ITEMS` — entry del padre `/rdb/cxp` en sección Administración de RDB;
  (2) `ROUTE_TO_MODULE` — 1 entry por URL (`/rdb/cxp`→`.facturas`,
  `/aging`→`.aging`, `/proveedores`→`.proveedores`); (3) `EXPECTED_DB_MODULE_SLUGS`
  — padre + 3 sub-slugs; (4) la migración anterior.
- **UI** (`app/rdb/cxp/`): `layout.tsx` (tabs Facturas/Saldos/Proveedores con
  `module:` por tab), `page.tsx` (lista `<DataTable>` ADR-010: proveedor, folio
  fiscal, emisión, vence, total, saldo, badge de estado derivado por vencimiento
  —vence Nd / vencida Nd / pagada / parcial—, OC; filtros `useUrlFilters` de
  búsqueda + estado; header "Cargar XML" → dialog multi-archivo que pega al
  endpoint Sprint 2 `/api/rdb/cxp/facturas/upload-xml` y muestra resultado por
  archivo; **drawer `<DetailDrawer>`** con cabecera fiscal, montos
  subtotal/IVA/retenciones/total/pagado/saldo, OC enlazada, pagos aplicados de
  `cxp_pago_aplicaciones` —embed tipado a `cxp_pagos`— y link al XML/PDF vía el
  proxy `/api/adjuntos/<path>`), `aging/page.tsx` (buckets vigente/1-30/31-60/
  61-90/>90 por proveedor, fecha base `fecha_pago_programada`||`fecha_vencimiento`,
  filtro `saldo>0` + `estado_cxp != cancelada`), `proveedores/page.tsx`
  (saldo total + # facturas abiertas + último pago desde `cxp_pagos`).
- Sin `as any` (regla del repo): clientes supabase tipados + `as unknown as`
  solo para el shape del embed. Nombre de proveedor prefiere `emisor_nombre`
  (denormalizado del CFDI); fallback a `erp.personas` por id (sin `razon_social`
  — esa columna no existe en `erp.personas`). `erp.facturas` arranca vacía →
  empty states en las 3 vistas hasta que se cargue el primer XML.
- typecheck + 1155 tests + lint (0 errores) + format + schema:check verdes.
  El regen de `types/supabase.ts` arrastró la baja de `es_comite_ejecutivo`
  (la migración `214500` se registró en historial al hacer `db push`).

**Próximo:** Sprint 4 — programación + aprobación de pagos por rol Dirección.

### 2026-06-01 — Sprint 2 (ingesta XML CFDI: parser + endpoint)

App-layer (sin migración). Backend de la carga de facturas de egreso.

- **`lib/cxp/cfdi-parser.ts`** — parser determinista de CFDI 4.0/3.3 (con
  `fast-xml-parser`, sin LLM). Extrae folio fiscal (UUID del TimbreFiscalDigital),
  emisor/receptor, montos, IVA trasladado + tasa derivada (0/8/16), retenciones
  IVA (002) e ISR (001), forma/método de pago, uso CFDI y tipo. 13 tests
  (`cfdi-parser.test.ts`): CFDI completo, retenciones de servicios profesionales,
  frontera 8%, sin timbrar (uuid null) y errores.
- **`POST /api/[empresa]/cxp/facturas/upload-xml`** — acepta 1..N XML (bulk). Por
  archivo: auth + acceso a la empresa (miembro o admin) → parse → valida que el
  receptor sea la empresa (por RFC) → dedup por `uuid_sat` → matchea emisor a
  proveedor (persona por RFC; si no existe, factura con proveedor nulo + sugiere
  alta) → `erp.cxp_factura_alta` → sube el XML a storage + `erp.adjuntos` +
  `xml_url`. Devuelve un resultado por archivo (no aborta el lote por un XML malo).
- Dep nueva: `fast-xml-parser ^5.8.0`. `'facturas'` agregado a `AdjuntoEntidad`.
- **Diferido** (Sprint 3 UI / follow-up): sugerencia automática de OC del emisor
  con saldo pendiente, y el parser opcional de PDF vía LLM (`extraction-core`)
  para facturas sin XML.
- typecheck + 1155 tests + lint + format verdes. PR _(este PR)_.

**Próximo:** Sprint 3 — UI RDB (lista de facturas + drawer + aging por proveedor).

### 2026-06-01 — Corrección del gate de aprobación: rol "Dirección" (no puesto Comité)

Beto corrigió un día después de Sprint 1: la autoridad para aprobar pagos es el
**rol "Dirección"** (modelo `core.usuarios_empresas` + `core.roles`), que tienen
asignado Ale, Michelle y Beto — **no** el puesto "Comité Ejecutivo" de
`erp.empleados_puestos` que se usó por error en Sprint 1. Beto además tiene admin,
que **no** cuenta para aprobar (control financiero estricto).

- Migración `20260601214500_cxp_gate_aprobacion_direccion.sql`: `cxp_pago_aprobar`
  pasa a gatear con `core.fn_user_has_role('Dirección', empresa)` (helper canónico,
  ver memoria `reference_roles_por_empresa`) y se **elimina** `erp.es_comite_ejecutivo`.
- Verificado en prod: `es_comite_ejecutivo` eliminado, `cxp_pago_aprobar` usa
  Dirección, **4 usuarios con rol Dirección** (6 asignaciones usuario-empresa) →
  mejor cobertura que el modelo de puesto (solo mapeaba 2). Resuelve el riesgo de
  cobertura del gate que se había flageado.
- Aplicado a prod vía `execute_sql` (DDL idempotente: CREATE OR REPLACE + DROP)
  para evitar carrera de `db push` con el PR paralelo del fix de CxC (#627). El
  archivo de migración queda como fuente de verdad y la CI lo valida fresco en el
  Supabase Preview branch.

### 2026-06-01 — Sprint 1 (schema CxP, DB-puro) aplicado a prod

Gemelo de CxC (ADR-037). Migración `20260601200000_erp_cxp_subledger.sql`
aplicada a prod con `supabase db push` (OK de Beto). Modo autónomo.

- **Extiende `erp.facturas`** (16 cols CxP): `orden_compra_id`, `proveedor_id`,
  `condiciones_pago_dias`, `fecha_pago_programada`, `monto_pagado` (trigger),
  `saldo` (generated), `estado_cxp`, campos SAT (`forma_pago_sat`,
  `metodo_pago_sat`, `uso_cfdi`, `tasa_iva`, `retencion_iva/isr`), cancelación.
  El legacy `estado_id` coexiste (CxP opera con `estado_cxp`). RLS de facturas
  ya existía, no se tocó.
- **`erp.cxp_pagos` + `erp.cxp_pago_aplicaciones`** — espejo de `cxc_*`: trigger
  `AFTER … SELECT SUM` sin recursión recalcula `facturas.monto_pagado` y
  `estado_cxp`. cancelar/rechazar borran aplicaciones → el trigger descuenta.
- **6 RPCs**: `cxp_factura_alta` (dedup `uuid_sat` + valida OC), `cxp_factura_cancelar`,
  `cxp_pago_programar`, `cxp_pago_aprobar` (gate Comité), `cxp_pago_marcar_pagado`
  (emite `movimientos_bancarios` `tipo='cargo'`, `referencia_tipo='cxp_pago'`),
  `cxp_pago_cancelar`. `audit_log` en cada transición.
- **`es_comite_ejecutivo(usuario, empresa)`** — mapea usuario→persona por email
  (core.usuarios no tiene `persona_id`) → empleado → puesto 'Comité Ejecutivo'
  (`ILIKE 'comit%ejecutivo'`, evita "Asistente Ejecutivo"). **Estricto a Comité,
  SIN override de admin** (decisión de Beto, control financiero fuerte): el smoke
  detectó que `adalberto.ss@dilesa.mx` es admin no-Comité y un override de admin
  lo dejaba aprobar pagos de cualquier empresa → se quitó. Verificado en prod:
  Comité→true en su empresa, admin-no-Comité→false, empresa ajena→false.
- **Decisión de scope**: el parser CFDI XML vive en el endpoint app de Sprint 2;
  `cxp_factura_alta` hace el dedup por `uuid_sat` (no se metió parser XML en SQL).
- Reusa la ref polimórfica de `movimientos_bancarios` que entregó CxC. `erp.facturas`
  vacía → backfill no-op. SCHEMA_REF + types regenerados. 5 checks verdes (1142 tests).
- **Cobertura del gate**: solo 2 de los 6 empleados-Comité mapean a una cuenta
  `core.usuarios` por email hoy → asegurar el match persona↔usuario de Ale/Michelle
  es pre-requisito de Sprint 4 (aprobación), ya flageado en Riesgos.
- **Hallazgo aparte (no CxP):** `erp.cxc_pago_registrar` inserta movimiento con
  `tipo='ingreso'`, que viola el CHECK `tipo IN ('cargo','abono')` de
  `movimientos_bancarios`. **Latente** (la UI de abonos no pasa `cuenta_bancaria_id`,
  ese path no corre). Fix pendiente en PR chico aparte.

**Próximo:** Sprint 2 — ingesta XML CFDI (parser determinista en endpoint app) +
match con OC + bulk upload + sugerencia de alta de proveedor.
