# Iniciativa — Cuentas por Pagar (CxP)

**Slug:** `cxp`
**Empresas:** todas (golden: RDB; rollout DILESA/COAGAN/ANSA en Sprint 6)
**Schemas afectados:** `erp` (extiende `facturas`; nuevas `cxp_pagos`, `cxp_pago_aplicaciones`; absorbe `gastos`; extiende `movimientos_bancarios` con referencia polimórfica, ADR-037)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-04-28
**Última actualización:** 2026-06-02 (**Sprint 3** en PR: módulo UI `/rdb/cxp` (facturas + drawer + aging + proveedores) + migración de módulos `rdb.cxp` × 3 sub-slugs + 4 lugares RBAC. UI visible — sin auto-merge, preview para revisión de Beto. Sprints 1+2 ya en prod. Modo autónomo. Próximo: Sprint 4 (programación + aprobación de pagos). Ver Bitácora.)

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

- [ ] **Sprint 4 — Programación + aprobación de pagos**:
  - `/rdb/cxp/programacion` — calendario semanal (lo que vence) + tabla "para programar esta semana" (selección masiva de facturas → genera 1 `cxp_pago` por proveedor).
  - `/rdb/cxp/pagos` — lista de pagos en cada estado (programado/aprobado/pagado).
  - Botón "Aprobar" visible solo si el usuario pertenece al Comité Ejecutivo (RPC valida).
  - Notificación email al Comité cuando hay pagos pendientes de aprobación (reutiliza `lib/juntas/email.ts` para branding por empresa).

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

| #   | Scope                                                                                                                                                                                                                | Estado    | PR        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------- |
| 0   | Promoción: este doc + fila en INITIATIVES.md                                                                                                                                                                         | _este PR_ | —         |
| 1   | DB: extender `erp.facturas` + crear `cxp_pagos` + `cxp_pago_aplicaciones` + RPCs (alta, cancelar, programar, aprobar, marcar_pagado, cancelar_pago) + helper `es_comite_ejecutivo` + backfill + regenerar SCHEMA_REF | aplicado  | _este PR_ |
| 2   | Parser CFDI determinista (`lib/cxp`) + endpoint `upload-xml` (bulk + dedup `uuid_sat` + validación receptor + sugerencia de proveedor). Match-OC automático y PDF-LLM diferidos a Sprint 3/follow-up                 | en PR     | _este PR_ |
| 3   | UI RDB facturas (lista + drawer) + aging + vista por proveedor                                                                                                                                                       | en PR     | _este PR_ |
| 4   | UI RDB programación + aprobación por Comité + email de notificación                                                                                                                                                  | pending   | —         |
| 5   | Pago efectivo + conciliación contra cortes (engancha con `cortes-conciliacion`)                                                                                                                                      | pending   | —         |
| 6   | Migración de `erp.gastos` a CxP + rollout multi-empresa (DILESA, COAGAN, ANSA)                                                                                                                                       | pending   | —         |

## Decisiones registradas

### 2026-04-28 — Decisiones cerradas por Beto al promover la iniciativa

- **Golden = RDB, no DILESA.** RDB tiene menor volumen de proveedores → mejor sandbox para pulir el flujo antes de exponerlo al volumen real de DILESA. Inverso a la recomendación inicial pero coherente con la cultura del repo (oc-recepciones también arrancó RDB-first).
- **Aprobación = cualquier miembro del Comité Ejecutivo.** Sin tiers por monto en v1. Beto, Alejandra y Michelle aprueban con la misma autoridad. La membresía vive en `erp.empleados_puestos` (puesto "Comité Ejecutivo"). Si emerge necesidad de tier (montos altos requieren 2 firmas), sub-iniciativa.
- **Captura inclusiva.** XML CFDI es la entrada ideal pero no obligatoria. Captura manual con o sin RFC formal del proveedor también funciona. La política es "mejor capturar de más y limpiar después que perder un pago por rigidez".
- **Retenciones por régimen vía CSF.** El motor de propuesta de retenciones lee `core.empresas.regimen_fiscal` (empresa receptora) + `personas_datos_fiscales.regimen_fiscal` (proveedor) para sugerir tasas. Aplica estímulos vigentes (frontera norte, AGAPES, RESICO). El Comité acepta o ajusta antes de aprobar. Verificar que las CSF de las 4 empresas estén actualizadas en Sprint 1; si faltan, se actualizan como pre-requisito.
- **Gastos se migran.** `erp.gastos` se absorbe como facturas de egreso (con o sin XML). Decisión final entre deprecar la tabla o mantenerla como vista de compatibilidad se cierra en Sprint 6 cuando se vea el shape real de los datos migrados.
- **CxP empieza por RDB y se diseña genérico.** Lógica de DB + RPCs son multi-empresa desde Sprint 1; UI RDB primero (Sprints 3-5); rollout DILESA/COAGAN/ANSA en Sprint 6. Particularidades por empresa (ANSA volumen, COAGAN AGAPES, DILESA materiales) entran como sub-iniciativas si emergen.
- **Modo de ejecución pendiente de definir al arrancar Sprint 1.** Beto autorizó modo autónomo en `oc-recepciones`; aplica caso por caso. Para CxP, el primer PR de promoción se entrega y se espera green light explícito antes de Sprint 1.

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
