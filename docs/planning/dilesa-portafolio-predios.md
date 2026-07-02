# Iniciativa — Predios, prediales y expediente pleno del Portafolio (DILESA)

**Slug:** `dilesa-portafolio-predios`
**Empresas:** DILESA
**Schemas afectados:** `dilesa` (nuevas `cuentas_prediales`, `prediales_ejercicios`, `prediales_convenios`, `activo_movimientos`; INSERT masivo en `activos`; sub-slug RBAC `dilesa.portafolio.prediales` en `core.modulos`/`core.permisos_rol`). `erp` (lectura `documentos`/`adjuntos` para escrituras y KMZ). UI: retiro del drawer de detalle → página expediente `/dilesa/portafolio/activo/[id]`, tab Prediales en el hub, visor KMZ, ficha comercial PDF.
**Estado:** in_progress
**Próximo hito:** S1 en prod (schema prediales + carga de los ~121 predios de los 2 Excel)
**Dueño:** Beto
**Creada:** 2026-07-01
**Última actualización:** 2026-07-01 (promovida; arranca tramo autónomo nocturno S1→S4)

> **Sucede a** [`dilesa-portafolio-expediente`](dilesa-portafolio-expediente.md) (cerrada). El visor interactivo multi-capa (fraccionamientos, avances de urbanización/ventas sobre plano) sigue viviendo en la iniciativa hermana [`mapas-interactivos`](mapas-interactivos.md) — aquí solo el render del KMZ del activo.

## Problema

DILESA tiene ~121 predios a su nombre (27 parcelas/ranchos del Ejido Villa de Fuente + 94 predios urbanos en ~17 fraccionamientos) que hoy viven en 2 Excel sueltos. No hay:

1. **Inventario en el portafolio** — los predios no existen como activos; no se pueden consultar, filtrar ni valuar.
2. **Control de prediales** — el impuesto anual (predial + recargos + aseo + bomberos) se controla a mano. Adeudo actual: ~$950k en parcelas (2022-2026) + ~$2.25M urbano 2026 (con acuerdo verbal de reducción 60% para 2026-2027 → ~$900k a pagar).
3. **Expediente por predio** — KMZ, escritura, planos y cuadro constructivo dispersos; la ficha actual es un side drawer que corta la información.
4. **Procesos de subdivisión/fusión** — se hacen ante notario/catastro sin registro estructurado del linaje (la Parcela 122 ya aparece partida en el Excel; hay una relotificación en trámite para entregar área verde al municipio).
5. **Material de oferta** — no hay ficha comercial imprimible/enviable para prospectos de venta o renta.

## Outcome esperado

El Portafolio se vuelve la fuente de verdad de **todos** los inmuebles DILESA con:

1. Los ~121 predios cargados, clasificados y agrupados (padre por fraccionamiento/ejido).
2. Control anual de prediales por cuenta catastral: matriz cuenta × ejercicio, adeudo vivo, pagos con comprobante, convenios de descuento. **v1 = registro y control** (sin integración CxP).
3. Expediente de página completa por activo (adiós drawer) con mapa del KMZ embebido.
4. Motor de subdivisión/fusión con trazabilidad (ADR).
5. Evaluación de compra pulida (checklist due diligence, bitácora, kanban).
6. Ficha comercial PDF + preparación de email para prospectos.

## Alcance

- **S1 — Schema + carga (backend):** `cuentas_prediales` (1 fila por clave catastral, FK a activo; diseño listo para ligar `unidad_id` a futuro), `prediales_ejercicios` (cuenta × año, montos + estado + comprobante), `prediales_convenios` (descuento 60% 2026-2027). Migración de datos idempotente y robusta a Preview (JOIN `core.empresas` + NOT EXISTS): padres + activos + cuentas + ejercicios históricos + convenio.
- **S2 — Expediente full-page:** `/dilesa/portafolio/activo/[id]` reemplaza al `ActivoDetailDrawer`; secciones: identificación, ubicación, valor/legal, satélite por tipo, análisis de compra, jerarquía (padre/hijos), prediales, documentos, escrituras, origen/obra.
- **S3 — Tab Prediales:** sub-slug `dilesa.portafolio.prediales` (RBAC 5 lugares ADR-014/030), matriz × año con filtros por fraccionamiento, KPIs (adeudo total, pagado del ejercicio, cuentas al corriente), registrar pago con comprobante (`erp.adjuntos`).
- **S4 — Visor KMZ:** parser KMZ→GeoJSON + mapa (leaflet) en el expediente. Base reutilizable por `mapas-interactivos`.
- **S5 — Subdivisiones/fusiones:** ADR + `activo_movimientos` + RPC atómica + wizard. Piloto: relotificación área verde del convenio predial.
- **S6 — Evaluación 2.0:** checklist due-diligence, bitácora append-only del embudo, kanban, comparables $/m².
- **S7 — Ficha comercial PDF + email** (react-pdf vía API route; email por catálogo de notificaciones, envío manual confirmado).
- **S8 — Ligado asistido de escrituras:** matching IA entre `erp.documentos` existentes y activos (por clave catastral/superficie/nombre extraídos), propuesta + confirmación manual.
- **Entregable operativo:** Excel checklist de los predios cargados para que el equipo recopile KMZ/escritura por predio.

**Fuera:** integración de pagos de predial a CxP/tesorería (fase 2 explícita, gate financiero); cálculo automático de recargos por mora (decisión Beto 2026-07-01: captura manual de lo que diga el recibo); visor interactivo multi-capa (→ `mapas-interactivos`); gestión del contrato de renta DILESA→RDB (→ módulo arrendamiento).

## Riesgos

- **Datos sucios en los Excel**: folios de recibo repetidos (31066×3), clave catastral duplicada (`0022220051` filas 53/57 de Lomas del Sol), celdas "PAGADO" sin monto, montos idénticos sospechosos entre RDB y un lote de Business Park (¿copy-paste?). El loader dedupea y las excepciones se reportan a Beto.
- **Acuerdo municipal de palabra** (60% × 2026-2027 a cambio de predial 2025 completo + área verde): se registra como convenio con nota íntegra — el sistema es el único papel que existe. Ámbito exacto (¿aplica también a parcelas ejidales?) por confirmar con Beto.
- **Doble inventario activo/unidad**: decisión Beto 2026-07-01 — los lotes remanentes de fraccionamientos son lotes comerciales y SÍ van al portafolio; solo Villa Real fue urbanizado-y-vendido completo. El loader igual verifica colisiones contra `dilesa.unidades` por si acaso.
- **Leaflet + Next 16**: render client-only (`dynamic import { ssr: false }`); KMZ es ZIP → parser server-side.
- **Bucket `adjuntos` sin scoping robusto de empresa** (gap conocido) — comprobantes de pago heredan la misma advertencia que el resto del portafolio.

## Métricas de éxito

- 100% de los predios de ambos Excel cargados con cuenta predial; totales cuadrados vs Excel (checksum documentado).
- Adeudo de prediales consultable en ≤2 clicks, con corte por fraccionamiento y por ejercicio.
- Expediente completo (página) operable; drawer retirado sin regresión de permisos.
- Lista de gaps: predios sin KMZ / sin escritura ligada visible como pendiente operativo (alimenta el checklist del equipo).

## Decisiones registradas

- **2026-07-01 — Cuenta predial como entidad propia** (`cuentas_prediales`), no columnas en `activos`: una clave catastral puede amparar macro-lotes y sobrevive a subdivisiones; diseño listo para ligar unidades de inventario en venta (columna futura) sin duplicar predios como activos.
- **2026-07-01 — Todos los predios de los 2 Excel entran como activos** (Beto): son lotes comerciales remanentes o reservas, no inventario de venta activo.
- **2026-07-01 — Deportivo RDB = activo DILESA** (terreno + construcciones), destino Arrendamiento; la relación de renta con RDB se gestionará en el módulo arrendamiento.
- **2026-07-01 — Prediales v1 sin CxP** (Beto): control + comprobante; integración financiera después.
- **2026-07-01 — Sin cálculo automático de recargos** (Beto): se captura lo que diga el recibo/estado de cuenta municipal.
- **2026-07-01 — Full page > drawer** (Beto): el detalle de activo migra a página completa; preferencia general contra side drawers para expedientes ricos.
- **2026-07-01 — Convenio 60%**: se modela como `prediales_convenios` referenciado por los ejercicios 2026 urbanos; el descuento se aplica al calcular adeudo neto, no reescribiendo montos capturados.

## Bitácora

- **2026-07-01** — Promovida tras sesión de diseño con Beto sobre los 2 Excel de prediales (27 parcelas ejido + 94 urbanos). Se estresaron 7 decisiones (ver arriba). Arranca tramo autónomo nocturno: S1→S4 + checklist KMZ; S5-S8 en tramos siguientes.
