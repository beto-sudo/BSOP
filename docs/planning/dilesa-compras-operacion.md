# Iniciativa — Compras operable: documentos, panorama y alertas (DILESA)

**Slug:** `dilesa-compras-operacion`
**Empresas:** DILESA (golden; el patrón de documento PDF + envío + alertas del ciclo P2P es replicable a las otras empresas cuando su compras exista)
**Schemas afectados:** Principalmente UI (`components/compras/*`) + nuevos PDFs (`lib/dilesa/pdf/`) y rutas API (`app/api/dilesa/...`). `erp`: folio secuencial de OC (RPC con secuencia/contador atómico sobre `ordenes_compra`; los campos `condiciones_pago`/`fecha_entrega`/`direccion_entrega` ya existen sin captura), **tabla nueva de evento de recepción** (hoy la recepción solo setea `ordenes_compra_detalle.cantidad_recibida` de forma absoluta, sin quién/cuándo/cuánto). `core`: nueva `notification_definitions` slug `dilesa_orden_compra` (kill-switch). `lib/compras/avisos.ts` + cron `daily-task-summary` para la alerta de OC sin recibir. Reusa `<DateRangeFilter>`, Resend, el molde react-pdf con branding DILESA. **Línea roja: NO toca `erp.v_partida_control` ni el modelo de precio c/IVA-incluido** (los números de control que ve el Consejo).
**Estado:** in_progress
**Próximo hito:** **Sprint 3a (enviar la OC por email + botones visibles) en revisión de Beto** ([#1021](https://github.com/beto-sudo/BSOP/pull/1021), sin auto-merge — UI + correo real). Sigue **Sprint 3b** (PDF del cuadro comparativo de la RFQ + envío masivo de la solicitud). Sprints 0/1/2a/2b ya mergeados.
**Dueño:** Beto
**Creada:** 2026-06-24
**Última actualización:** 2026-06-24 (Sprint 3a en PR #1021: enviar la OC por email + "Imprimir/Enviar" en el menú de la fila; Sprint 2b PDF #1020 mergeado)

> Detonante: Beto pidió revisar a fondo el módulo de Compras de DILESA "como si fuera un usuario", detectando mejoras para **simplificar y tener todos los elementos**: documentación que hoy no existe (impresión de orden de compra), envío por email de algunos elementos, filtros predeterminados mal planteados y filtros faltantes. El análisis se rebotó con dos agentes críticos (operativo + técnico) hasta acordar el corte indispensable.

## Problema

El ciclo P2P de DILESA está **completo y en prod** (`dilesa-compras`, `dilesa-flujo-gasto`, `dilesa-compras-flujo`, todas cerradas): Requisición → Cotización (RFQ) → Orden de compra → Recepción → Costo de materiales, con el candado de dinero en la adjudicación (solo Dirección) y avisos al correo diario. Pero el módulo **registra bien y entrega mal**. Recorriéndolo como usuario aparecen tres dolores:

1. **El módulo no produce su entregable principal.** La OC es EL documento que recibe el proveedor, y hoy **no hay forma de sacarla del sistema**: no hay PDF (no existe `lib/dilesa/pdf/orden-compra.tsx`), no hay email de OC (solo la solicitud RFQ tiene email), no hay export a Excel (cero en todo el repo). "Marcar enviada" solo cambia un badge; el proveedor no se entera. Encima, los folios se generan con `Date.now().toString(36)` → `OC-LXY8Z3K`: ilegibles en un documento que va al proveedor y al SAT.

2. **El usuario no ve su trabajo pendiente.** Los 4 tabs principales **auto-seleccionan un solo fraccionamiento** al entrar (`autoSelectDone`), escondiendo el panorama — peor en Recepciones ("¿qué me falta recibir?" debería ser TODO). No hay **filtro por estado** ("solo borradores", "solo por recibir"), la pregunta #1 del comprador cada mañana, hoy imposible sin escanear la tabla. En vista "Todos" no hay columna Proyecto ni búsqueda por proyecto: no se sabe de qué fraccionamiento es cada renglón.

3. **Lo que se cae no avisa.** El correo diario avisa "RFQ por adjudicar" y "tus solicitudes", pero **nadie vigila la OC que se mandó y el material no llegó** — exactamente donde se atora el avance de obra. Y la recepción de hoy no guarda quién/cuándo/cuánto (solo el acumulado), así que tampoco hay base para medir el rezago.

## Cómo se trabajó (trazabilidad)

Recorrido de los 5 tabs como usuario + dos agentes críticos en paralelo (lente operativa "comprador/Dirección que lo usa a diario" + lente técnica que verificó cada hallazgo contra el código con file:line y midió esfuerzo/riesgo). La doble crítica **corrigió varios hallazgos** del inventario inicial (ver Decisiones registradas).

## Decisiones registradas

- **2026-06-24 — Alcance = Opción B "Operación completa".** Beto eligió, sobre tres opciones (A mínima / B completa / C con IVA). B = documentos + panorama + alertas + evento de recepción + cuadro comparativo + export, **sin** desglose de IVA.
- **2026-06-24 — NO se toca el modelo de precio c/IVA (descartada Opción C).** El sistema trata todo c/IVA-incluido a lo largo de la tubería, y `v_partida_control` (comprometido/ejercido) se calcula así. Desglosar IVA movería esos números ~8% de golpe (los ve el Consejo) y descuadraría contra el CFDI de CxP. Beneficio diario nulo (el IVA acreditable ya lo da el CFDI en CxP), riesgo financiero alto. A lo mucho, `tasa_iva` informativa sin cambiar qué número alimenta el control — y solo si surge la necesidad.
- **2026-06-24 — El "estado inicial inconsistente de la OC" NO es bug de control de dinero.** Un crítico lo levantó como agujero del candado; la verificación lo refutó: la OC que nace `enviada` desde requisición/cotización **solo la genera/adjudica Dirección** (gate `esDireccion` en `requisiciones-module.tsx:513` y la adjudicación de cotizaciones). Lo que queda es cosmético + el manual desactualizado ("la OC nace en borrador", cierto solo para la OC directa). Se corrige el manual en Sprint 0; unificar el estado es opcional, no urgente.
- **2026-06-24 — El folio secuencial va ANTES del PDF.** El PDF y el email deben llevar un folio legible. Romper el formato viejo no afecta downstream (verificado: `avisos.ts` usa `codigo` solo para mostrar/ordenar; el hilo del gasto referencia por `id`). Se genera con RPC/secuencia atómica (no en cliente) por concurrencia multi-sesión; toca los **3 productores de OC** + contrato/req/RFQ → PR aislado.
- **2026-06-24 — Comprobante de recepción y alerta de "sin recibir" dependen de modelar el evento de recepción primero.** Hoy `oc_recibir_linea_partida` setea `cantidad_recibida` de forma absoluta, sin tabla de eventos. Sin el evento, "hace N días" no tiene fecha contra qué medir y el PDF sería de un dato que no se guarda.
- **2026-06-24 — Sale del alcance lo ya hecho / redundante.** El manual del flujo P2P ya está escrito (`flujo-del-gasto.md`); el filtro por proveedor ya es buscable por texto (queda como nice-to-have, no sprint).
- **2026-06-24 (Sprint 0) — El manual ya documentaba "la OC nace en borrador"; el código había driftado.** Al implementar se vio que `requisiciones.md` y el propio JSDoc de `generarOC` ya decían que la OC de requisición nace en borrador, pero el código la creaba `enviada`. La acción de "alinear el manual" se invirtió: se alineó el **código al manual** (requisición→OC nace `borrador`), lo que de paso resuelve la inconsistencia de estado inicial (antes E6) y rutea esa OC por la emisión validada de Órdenes. El candado no se reabre: "Generar OC" sigue siendo de Dirección. Otro drift corregido en el manual: el paso "Marcar autorizada" ya no existe (lo quitó `dilesa-compras-flujo`).

## Outcome esperado

Que Compras **produzca y entregue sus documentos** (OC en PDF con folio decente, enviada al proveedor por email en un acto; cuadro comparativo de la adjudicación; comprobante de recepción), que el usuario **entre y vea todo su trabajo pendiente** (panorama completo, filtro por estado/fecha, sabe de qué proyecto es cada renglón), y que **lo que se atora avise solo** (OC enviada sin recibir hace N días). Todo sin tocar el modelo de dinero del control presupuestal.

## Alcance

Ordenado por dependencia técnica (prerequisitos primero; lo que toca dinero/schema, aislado y al final).

**Sprint 0 — Prerequisitos (S · riesgo bajo).** Quick wins que desbloquean.

- Validar proveedor antes de emitir la OC (hoy se puede emitir con `proveedor_id` null) — prerequisito del email.
- Opción "Gasto suelto" en Órdenes (paridad con Requisiciones, sentinel `LIBRE`; sin ella las OC sin proyecto quedan invisibles al filtrar).
- Alinear el manual: corregir "la OC nace en borrador" (cierto solo para la OC directa).

**Sprint 1 — Panorama y filtros (S · riesgo bajo · alto ROI).** → Dolor 2.

- Arrancar en "Todos los proyectos" (quitar el auto-select; ajustar el gate del botón "Nueva…" que hoy exige proyecto activo).
- Filtro por estado en los 4 tabs (en Requisiciones el estado es derivado, `deriveReqEstado`, no columna).
- Filtro de rango de fecha (reusa `<DateRangeFilter>` de `components/filters/`, ya en 7 módulos DILESA).
- Búsqueda por nombre de proyecto + columna Proyecto en Órdenes y Recepciones (Costo-materiales ya la tiene).
- Export a Excel/CSV de la lista filtrada.

**Sprint 2 — Folio + documento de la OC (M · riesgo medio).** → Dolor 1.

- Folio secuencial `OC-2026-0001` por empresa/año vía RPC con secuencia/contador atómico (precedente: `LEV-{año}-{NNNN}` por trigger en levantamientos). Toca los 3 productores de OC + contrato/req/RFQ. **PR aislado.**
- PDF de la OC (molde `solicitud-cotizacion.tsx` + `header-footer.tsx` + `styles.ts`, `renderToBuffer`). Incluye **capturar 3 campos que hoy faltan en la UI** (las columnas ya existen): condiciones de pago, fecha y dirección de entrega; tolera RFC/domicilio del proveedor vacío (vive en `personas_datos_fiscales`, puede no estar).

**Sprint 3 — Envío y soporte de decisión (M · riesgo medio).** → Dolor 1.

- "Enviar OC" en un acto = PDF + email al proveedor + estado (reusa el endpoint Resend de la RFQ + migración de `notification_definitions` slug `dilesa_orden_compra`; manejo de fallo parcial para no dejar la OC inconsistente si el correo falla).
- PDF del cuadro comparativo / fallo de adjudicación de la RFQ (datos ya existen; soporte de auditoría de "por qué le compré a este").
- Envío masivo de la solicitud RFQ a todos los invitados (hoy 1×1).

**Sprint 4 — Evento de recepción + alertas (M-L · toca schema).** → Dolor 3.

- Modelar la tabla de evento de recepción (quién/cuándo/cuánto **incremental**) — de paso arregla la trampa actual de capturar "recibido total acumulado" en vez de "lo que llegó hoy". Posible backfill de las recepciones ya hechas.
- Comprobante de recepción de materiales (PDF con folio, sobre el evento).
- Alerta "OC enviada sin recibir hace N días" en el correo diario (extiende `lib/compras/avisos.ts` — puro y testeable — + su fetch en el cron `daily-task-summary`).

**Backlog (opcional, otra ola).** KPIs clicables (toca el primitivo compartido `<ModuleKpiStrip>`) · Recepciones → `<DataTable>` (la fila expandible no es nativa, verificar row-expand o drawer) · vista consolidada del ciclo Req→RFQ→OC→Recepción.

## Riesgos

- **Folio secuencial / concurrencia.** Generar en cliente condiciona carrera entre sesiones serverless → RPC `SECURITY DEFINER` con secuencia o `INSERT ... ON CONFLICT DO UPDATE RETURNING`. Cuidado con RLS/empresa en la RPC. PR aislado.
- **Email de OC / fallo parcial.** Si el correo falla, la OC no debe quedar en estado inconsistente. El "acto único" (PDF+email+estado) necesita orden de efectos y rollback del estado si aplica.
- **Evento de recepción / migración.** Tabla nueva + posible backfill de lo ya recibido (que no tiene evento). No romper la RPC `oc_recibir_linea_partida` viva.
- **Línea roja financiera.** Ningún sprint toca `v_partida_control` ni el sentido c/IVA de `precio_unitario`. El header `subtotal`/`iva` de `ordenes_compra` está muerto (nunca se escribe); no revivirlo como parte de esto.

## Métricas de éxito

- 100% de OC emitidas con folio secuencial legible y PDF disponible; email entregado al proveedor desde el sistema (con log en `notification_log`).
- El comprador entra a cualquier tab y ve TODO el pendiente sin cambiar filtros; puede acotar por estado/fecha en ≤2 clics.
- Cero OC "enviadas" sin proveedor.
- Alerta diaria de OC sin recibir > umbral, accionable (con días de rezago y proyecto).

## Patrones a reusar (referencia técnica)

- **PDF:** `@react-pdf/renderer` + `lib/dilesa/pdf/{header-footer,styles}.tsx` + `renderToBuffer` en route handler. Molde directo: `lib/dilesa/pdf/solicitud-cotizacion.tsx`. Gate por sesión Supabase + RLS (sin cambios RBAC: el sub-slug `dilesa.compras.ordenes` ya existe).
- **Email:** Resend + `lib/notifications` (`getDefinitionBySlug`/`renderSubject`/`writeNotificationLog`) + kill-switch por catálogo. Molde: `app/api/dilesa/cotizaciones/[id]/solicitud/route.tsx`. Plantilla de notif def: `20260611232950_notif_catalogo_cotizacion_resumen_consejo.sql`.
- **Filtro fecha:** `components/filters/date-range-filter.tsx` (controlado, `isInDateRange`).
- **Folio:** precedente `LEV-{año}-{NNNN}` por trigger en `20260425162203_erp_inventario_levantamientos.sql`. UNIQUE real: `ordenes_compra_empresa_codigo_key (empresa_id, codigo)`.
- **Avisos:** `lib/compras/avisos.ts` (puro, con `avisos.test.ts`) alimenta el correo diario; extender con un helper + su fetch en el cron.

## Bitácora

- **2026-06-24 — Promoción.** Análisis del módulo (recorrido de los 5 tabs como usuario) + doble crítica adversarial (operativa + técnica) → corte indispensable y plan de 5 sprints. Beto aprobó alcance Opción B. Iniciativa creada en estado `planned`. Próximo: arrancar Sprint 0.
- **2026-06-24 — Sprint 0** ([#1017](https://github.com/beto-sudo/BSOP/pull/1017), sin auto-merge — UI visible). Proveedor obligatorio al emitir la OC (gate en "Marcar enviada"); requisición→OC nace `borrador` (alinea código↔manual, resuelve E6); "Gasto suelto" en Órdenes (paridad con Requisiciones, vuelve visibles las OC sin proyecto); manual de Órdenes/Requisiciones alineado. Sin migración, sin tocar el modelo de dinero. 6 checks verdes. **Mergeado** (#1017).
- **2026-06-24 — Sprint 1** ([#1018](https://github.com/beto-sudo/BSOP/pull/1018), sin auto-merge — UI visible). Panorama y filtros en los 4 tabs del ciclo (Requisiciones · Cotizaciones · Órdenes · Recepciones): quita el auto-select de un solo proyecto (arrancan en "Todos los proyectos"), filtro por estado y por rango de fecha (reusa `<DateRangeFilter>`), columna "Proyecto" + búsqueda por proyecto, y export a CSV de la lista filtrada (nuevo `lib/export/csv.ts` con BOM UTF-8 + test de `toCsv`). Sin migración. Checks verdes (2026 tests). **Mergeado** (#1018).
- **2026-06-24 — Sprint 2a — folio secuencial** ([#1019](https://github.com/beto-sudo/BSOP/pull/1019), auto-merge — migración/backend). Trigger `erp.fn_oc_asignar_folio` asigna `OC-{año}-{NNNN}` consecutivo por empresa+año (advisory lock, patrón probado de los folios `LEV-`); los 3 productores de OC omiten `codigo` y leen el del trigger. **Migración aplicada a prod con OK de Beto**: dry-run (BEGIN/ROLLBACK) confirmó DILESA→`OC-2026-0001/0002` y RDB intacto; ledger reconciliado 1:1. Solo numeración; RDB no afectado (manda su propio folio). **Mergeado** (#1019).
- **2026-06-24 — Sprint 2b — PDF de la OC** ([#1020](https://github.com/beto-sudo/BSOP/pull/1020), sin auto-merge — UI visible). El documento imprimible que faltaba (gap #1 de la iniciativa): componente `lib/dilesa/pdf/orden-compra.tsx` + endpoint `GET …/ordenes-compra/[id]/pdf` (molde olivo con precios/total/entrega), botón "Imprimir OC" en el drawer, y captura de los 3 campos que faltaban (condiciones de pago, fecha y dirección de entrega). Proveedor enriquecido con RFC + domicilio fiscal. Smoke test de render OK (~67KB). Sin migración. **Mergeado** (#1020).
- **2026-06-24 — Sprint 3a — enviar la OC por email + visibilidad** ([#1021](https://github.com/beto-sudo/BSOP/pull/1021), sin auto-merge — UI + correo real). `POST …/ordenes-compra/[id]/pdf` manda la OC en PDF por email (Resend, fail-open en el catálogo + log en `notification_log`); acción reintentable con confirmación que **no cambia el estado** (lo gobierna "Marcar enviada") para evitar inconsistencias por fallo parcial. **Atiende el feedback de Beto** ("no veo dónde imprimir"): "Imprimir OC" y "Enviar al proveedor" pasan al menú ⋯ de la fila (antes solo en el footer del drawer). Sin migración (el kill-switch/config del correo, slug `dilesa_orden_compra`, queda como INSERT opcional posterior). Pendiente: Beto revisa el Preview y mergea.
