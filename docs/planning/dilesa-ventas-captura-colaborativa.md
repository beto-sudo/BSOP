# Iniciativa — Captura colaborativa de fases + revisión asistida (ventas DILESA)

**Slug:** `dilesa-ventas-captura-colaborativa`
**Empresas:** DILESA (el patrón de captura por documento es replicable a futuros pipelines de otras empresas)
**Schemas afectados:** principalmente UI (Next.js); `erp.adjuntos` (reuso, ya tiene `uploaded_by`), `dilesa.ventas` / `dilesa.venta_fases` (reuso), posible tabla nueva `dilesa.venta_fase_revisiones` (Sprint 3, veredicto IA persistido)
**Estado:** in_progress
**Próximo hito:** aplicar migración venta_fase_revisiones a prod + merge de Sprint 3 (PR en revisión) → cierre de iniciativa (S4 rollout queda opcional)
**Dueño:** Beto
**Creada:** 2026-06-12
**Última actualización:** 2026-06-12

## Problema

Las pantallas de captura de fase del pipeline de ventas (las 17 fases,
`app/dilesa/ventas/[id]/capturar/*`) persisten **todo al final**: los
documentos viven en `useState<File>` del navegador y solo se suben a
storage + `erp.adjuntos` cuando el usuario logra cerrar la fase
(`marcarFase`). El proceso real es **colaborativo y asíncrono** — en Fase 13
(Facturada): una persona genera la factura y la sube, otra genera el Aviso
PLD y lo sube, y Michelle revisa todo antes de avanzar la fase (así operaba
Coda, donde cada upload persistía al instante).

Consecuencias:

- **Trabajo perdido**: quien sube su documento sin tener los demás no puede
  cerrar la fase (validación todo-o-nada) y al salir su archivo se esfuma.
  Incidente real: Norberto (Contabilidad) subió facturas el 2026-06-11,
  reportó "no se guardaron" — nunca llegaron al servidor.
- **Sin trazabilidad**: no queda quién subió cada documento ni cuándo
  (aunque `erp.adjuntos.uploaded_by` ya existe, solo se llena al cierre, con
  el usuario que cierra — no con el que aportó el documento).
- **Captura manual de montos derivados**: valor real venta DILESA, valor
  facturado y monto de nota de crédito se teclean a mano en Fase 13 aunque
  el motor de cuadratura (`lib/dilesa/cuadratura.ts`) ya los calcula con las
  fórmulas de Coda.
- **Revisión humana sin red**: nada valida que la factura, la NC y el PLD
  correspondan a la operación antes de avanzar.

## Outcome

Capturar una fase es **colaborativo, incremental y auditado**: cada documento
persiste al momento de subirse con quién/cuándo; los montos derivados se
pintan solos desde la cuadratura; y el cierre de fase pasa por una **revisión
asistida** (determinista para CFDI vía XML, IA con visión para el PLD) que
habilita el botón solo cuando todo cuadra — con override exclusivo de
Dirección, registrado. Cero trabajo perdido, cero captura a ciegas.

## Alcance (sprints)

### Sprint 1 — Captura colaborativa (Fase 13 piloto)

- Helper genérico `lib/dilesa/captura/docs-fase.ts`:
  - `subirDocFase()` — sube a storage + inserta `erp.adjuntos`
    (entidad_tipo='venta', rol, `uploaded_by`, `created_at`) **al instante**.
  - `listarDocsFase()` — adjuntos por venta+roles; vigente = más reciente
    por rol, los anteriores quedan como historial (no se borra nada).
- Fase 13 rediseñada sobre el helper:
  - Slots de documento muestran lo ya subido (nombre, quién, cuándo, link),
    suben al seleccionar el archivo (sin esperar el cierre), y "Cambiar"
    versiona (insert nuevo, conserva anterior).
  - Montos con **"Guardar montos"** independiente del cierre (UPDATE a
    `dilesa.ventas` sin tocar `venta_fases`).
  - **Valor real venta DILESA: pintado read-only** desde
    `calcularCuadratura()` (decisión Beto 2026-06-12 — "ya es precalculado,
    es solo pintarlo"); se persiste como snapshot al cerrar la fase. Valor
    facturado y monto NC siguen capturables en S1 con hint del valor que
    sugiere la cuadratura (en S2 pasan a automáticos vía XML).
  - **"Cerrar fase"** (antes "Guardar fase") valida documentos requeridos
    contra el **expediente** (adjuntos persistidos), no contra la memoria
    del navegador; cierra vía `marcarFase` con `docs: []`.
- `marcarFase` se mantiene para las otras 16 fases (rollout posterior).

### Sprint 2 — XML CFDI + montos automáticos

- Slots de factura y nota de crédito piden **XML CFDI obligatorio** (PDF
  opcional, solo representación visual). Parser determinista existente
  (`lib/cxp/cfdi-parser.ts`) — sin OCR/LLM para CFDI.
- Validaciones deterministas: emisor RFC = DIE030904866, receptor RFC = RFC
  del cliente (`erp.personas`), tipo de comprobante (I/E), NC relacionada al
  UUID de la factura (CFDI relacionados), folio fiscal no usado en otra
  venta.
- `valor_facturado` ← total del CFDI factura; `monto_nota_credito` ← total
  del CFDI NC; cruce vs los calculados de cuadratura (discrepancia =
  advertencia, no bloqueo — los flags `tieneRecibo` por depósito siguen
  siendo gap de captura).
- Campos pasan a read-only con badge "extraído del XML"; corrección manual
  posible pero auditada.

### Sprint 3 — Revisión IA del PLD + gate de cierre

- Extracción con visión (Claude) del Informe de Avisos SPPLD (estructura
  confirmada con PDF real 2026-06-12, ver checks abajo) + cruce
  determinista contra el expediente.
- Checklist semáforo persistido (tabla `dilesa.venta_fase_revisiones`:
  venta_id, fase, checks jsonb, veredicto, ejecutado_por/at) — parte del
  expediente, re-ejecutable.
- "Cerrar fase" habilitado solo con verde. Con rojos: advertencia que
  informa que **avanzar una operación que no cumple requiere autorización de
  Dirección** (decisión Beto 2026-06-12); el override (solo Dirección/admin,
  `EffectiveUser.direccionEmpresaIds`) pide motivo y queda en
  `core.audit_log`.
- Resiliencia: si la API de IA falla, la revisión queda "pendiente" y aplica
  el mismo override — la operación nunca se atora por infraestructura.

#### Checks del Aviso PLD (set inicial, Michelle afina)

| #   | Check                                                                          | Contra                     | Severidad                                          |
| --- | ------------------------------------------------------------------------------ | -------------------------- | -------------------------------------------------- |
| 1   | RFC sujeto obligado = DIE030904866                                             | constante empresa          | error                                              |
| 2   | Nombre completo + RFC de la persona objeto                                     | `erp.personas` de la venta | error (RFC), warning (nombre con diferencia menor) |
| 3   | Figura cliente = COMPRADOR, tipo = COMPRA VENTA DE INMUEBLES                   | constantes                 | error                                              |
| 4   | Valor pactado = valor de escrituración                                         | `dilesa.ventas`            | error                                              |
| 5   | Domicilio del inmueble + m² terreno/construcción                               | `dilesa.unidades`          | warning                                            |
| 6   | Núm. instrumento público + fecha + núm. notario                                | Fase 11 (escritura)        | error (instrumento), warning (fecha/notario)       |
| 7   | Valor avalúo/catastral                                                         | Fase 5 (monto avalúo)      | warning                                            |
| 8   | Σ liquidaciones vs depósitos registrados y vs valor pactado                    | `erp.cxc_pagos`            | warning (con desglose)                             |
| 9   | Mes reportado vs fecha de operación (plazo LFPIORPI: día 17 del mes siguiente) | fechas de la venta         | warning                                            |
| 10  | Tipo de alerta = SIN ALERTA                                                    | —                          | error informativo a Dirección si hay alerta        |

### Sprint 4 (posterior, alcance corto) — Rollout del patrón

- Migrar las demás fases con documentos (2, 3, 5, 8, 9, 11, 14, 15) al
  helper de captura incremental. Sin cambios de modelo.

## No-alcance

- Facturas de venta (ingreso) hacia `erp.facturas` flujo='ingreso' — posible
  integración futura, no aquí.
- Cambios al motor de cuadratura (fórmulas ya validadas vs Coda).
- Captura de los gaps `tieneRecibo`/`directoCliente` por depósito (vive en
  `dilesa-ventas-expediente`).

## Decisiones registradas

- **2026-06-12 — En F13 nada se captura a mano (feedback Beto en review).**
  `valor_escrituracion` viene de la Fase 8 (Dictaminada) y en F13 solo se
  muestra; `valor_facturado`/`monto_nota_credito` se derivan SOLO del XML
  (sin captura manual ni siquiera como degradación) — corregir = subir el
  XML corregido (queda versionado). El cierre no pisa montos que el XML no
  respalde (las históricas migradas conservan los suyos). El botón "Guardar
  montos" desaparece: la sección Montos es informativa.

- **2026-06-12 — Gate duro con override de Dirección.** El cierre de fase
  bloquea si la revisión no está en verde; la advertencia informa que
  avanzar requiere autorización de Dirección. Override registrado con motivo
  (audit log). Razón: control fuerte sin atorar operación legítima
  (política admin-nunca-bloqueado).
- **2026-06-12 — XML obligatorio para factura/NC en F13 (PDF opcional).**
  Validación determinista con el parser CFDI existente > extracción IA del
  PDF: cero alucinación, montos exactos. IA solo para el PLD (acuse no
  estructurado).
- **2026-06-12 — Valor real venta DILESA no se captura: se pinta.** Fuente
  única `lib/dilesa/cuadratura.ts` (fórmulas Coda). Snapshot a
  `dilesa.ventas.valor_real_venta_dilesa` al cerrar la fase.
- **2026-06-12 — Versionado por historial de adjuntos.** "Cambiar" inserta
  un adjunto nuevo; el vigente es el más reciente por rol. No se borra nada
  (audit trail).

## Riesgos

- **`valorFacturado` calculado depende de depósitos `tieneRecibo` (gap)** →
  en S1 el campo sigue capturable con hint; en S2 el XML trae el real y la
  discrepancia se reporta como advertencia.
- **Adjuntos huérfanos al desasignar venta** — pregunta abierta heredada de
  `dilesa-ventas-captura` (¿se conservan como histórico?). El historial por
  versión los multiplica; barrer con el script storage-cleanup existente.
- **Costo/latencia IA (S3)** — un PLD por venta ≈ centavos; revisión
  on-demand con resultado persistido (no re-corre en cada render).

## Preguntas abiertas

- [ ] El Informe de Avisos dice "la impresión no implica envío
      satisfactorio" — ¿exigir también el **acuse** de envío SPPLD como doc
      aparte? (propuesta: rol `acuse_pld` opcional en S3)
- [ ] ¿El override de Dirección se notifica (email al estilo resumen diario)
      o basta el registro en audit?

## Métricas de éxito

- Cero reportes de "subí y no se guardó" en fases de venta.
- 100% de documentos de fase con `uploaded_by` + timestamp del autor real.
- En F13, montos derivados sin captura manual (S2) y revisión persistida por
  cada cierre (S3).

## Bitácora

- **2026-06-12** — Sprint 3 entregado (PR en revisión): extracción IA del
  Aviso PLD (visión, mismo stack que estados de cuenta) + cruce determinista
  de los 10 checks + tabla `dilesa.venta_fase_revisiones` (append-only,
  ligada al adjunto exacto) + semáforo en F13 + **cierre movido a endpoint
  con gate server-side** (`cerrar-fase13`): solo revisión vigente en verde
  cierra; cualquier otro caso requiere override de Dirección con motivo
  (audit_log + nota en venta_fases). 9 tests fijan el contrato del gate.
  Migración pendiente de aplicar a prod (requiere aprobación explícita).

- **2026-06-12** — Sprint 2 entregado (PR en revisión con preview): slots
  `factura_xml` (requerido) y `nota_credito_xml` con validación determinista
  al subir (parser CxP extendido con CfdiRelacionados), dedup de folio
  fiscal cross-venta, montos derivados del XML (read-only; corregir = subir
  XML corregido, queda versionado), checks persistidos en
  `erp.adjuntos.metadata`. PDF de factura pasa a opcional. Sprint 1 (PR
  #860) mergeado el mismo día.

- **2026-06-12** — Sprint 1 entregado (PR #860, sin auto-merge por ser UI
  visible — preview a revisión de Beto): captura incremental con autoría
  visible en Fase 13, montos guardables sin cerrar, valor real pintado de
  cuadratura, cierre validando contra expediente. Helper genérico
  `lib/dilesa/captura/docs-fase.ts` + GET de docs con nombres resueltos
  server-side.
- **2026-06-12** — Promovida tras diagnóstico del incidente de Norberto
  (facturas "no guardadas" = diseño todo-al-final de la captura de fase).
  Alcance y decisiones confirmadas con Beto en sesión. PDF real de Aviso PLD
  analizado para derivar los checks del Sprint 3.
