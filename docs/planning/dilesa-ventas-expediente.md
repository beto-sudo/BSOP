# Iniciativa — Expediente de Operación (workspace unificado de venta) DILESA

**Slug:** `dilesa-ventas-expediente`
**Empresas:** DILESA (golden; el patrón de "workspace de operación" es replicable a las otras empresas)
**Schemas afectados:** principalmente UI (Next.js App Router); `dilesa` (posible vista `v_venta_cuadratura` + columnas/slugs de fases 14-17), `core.modulos` (sub-slugs RBAC de 14-17). Reusa lo existente: `dilesa.ventas`, `dilesa.venta_fases`, `erp.adjuntos`, `erp.cxc_pagos`/`cxc_cargos`
**Estado:** done
**Próximo hito:** — (cerrada: cutover Coda de ventas completado 2026-06-11 — paridad certificada, daily apagado, equipo de ventas con usuarios/perfiles activos. Coda queda read-only de consulta)
**Dueño:** Beto
**Creada:** 2026-06-09
**Última actualización:** 2026-06-11 (S6: cutover ejecutado — último sync, paridad 14,186/14,186 fases + 1438/1438 ventas, fix merge venta_fases, daily apagado. Pagaré: desglose de intereses + tasas TIIE+4 / moratorio 3×)

## Problema

El pipeline de ventas se construyó (Fases 1-13) como **17 formularios
aislados, uno por fase**. Sirvió para meter datos rápido y enforzar el orden,
pero al usarlo de verdad aparece el costo:

- **Captura a ciegas:** cada pantalla de captura solo muestra el header mínimo
  (cliente + identificador). Al registrar una escritura (F11) no ves los datos
  básicos del cliente ni de la operación — capturas sin contexto.
- **Sin vista holística:** entender una operación obliga a saltar entre 13
  pantallas. No hay un solo lugar que cuente toda la historia.
- **El dinero está disperso:** enganche, depósitos, crédito institución,
  crédito directo, cheque a notaría, factura, nota de crédito viven en fases
  distintas. No hay una **cuadratura** unificada que valide que todo cierra.
- **"¿Qué falta?" no es evidente:** el operador adivina qué información o
  documento falta para avanzar o cerrar.

Raíz del problema: mezclamos **los datos de la operación** (que se acumulan)
con **el estado del proceso** (en qué hito vas). Atar cada dato a su fase
fragmenta todo.

## Outcome

Una sola pantalla **"Expediente de Operación"** por venta donde se ve y se
trabaja toda la operación con **contexto permanente**, una **cuadratura
financiera unificada**, un **expediente documental** completo, y un **copiloto
de cierre** que dice en lenguaje claro qué falta para avanzar/cerrar. Captura
en contexto, cero información fuera, lo más simple posible. Reusa el modelo de
datos y los formularios ya construidos.

## Alcance

### Dentro

- Workspace de 3 zonas por venta (cabecera persistente + timeline + panel de
  trabajo con tabs).
- Reuso de los 13 formularios de fase como **paneles** de la tab Captura.
- **Cuadratura**: vista financiera unificada (todos los montos + depósitos CxC
  - balance/semáforo).
- **Expediente documental**: todos los adjuntos en un grid agrupado por etapa.
- **Copiloto de cierre**: checklist de lo que falta para avanzar/cerrar.
- **Definir + construir Fases 14-17** dentro del nuevo modelo.
- Auditoría de paridad Coda (cutoff readiness) — qué columnas de Coda no
  estamos bajando.

### Fuera (por ahora)

- Cambiar el modelo de datos de fondo (las tablas ya están; esto es
  recomposición de UI + agregados).
- El módulo de cobranza/CxC (existe aparte; aquí solo se **lee** para la
  cuadratura y referencia de depósitos).

## Diseño (UX)

### Principio: una operación = un workspace

Separar **datos** (se editan en contexto, cuando se tengan, con permisos) de
**hitos** (se cierran en orden, registran fecha + responsable). El proceso es
una capa de estado **encima** del expediente, no 17 silos.

### Zona A — Cabecera persistente (siempre a la vista)

Cliente (nombre, contacto, CURP/RFC) · Vivienda (proyecto · Mz/Lote ·
prototipo · domicilio · identificador) · Comercial (precio de asignación,
asesor, gerente) · Estado (fase actual + barra de progreso) · **mini-cuadratura**
(Precio | Crédito institución | Depósitos | Crédito directo | **Saldo**, con
semáforo).

### Zona B — Timeline (riel lateral)

Las 17 fases con estado (✓ cerrada / ● actual / ○ pendiente) + fecha de cierre.
Agrupadas en **5 macro-etapas** para que el humano no piense en 17 pasos:

1. **Comercial** (1-3): Solicitud → Asignada → Formalizada.
2. **Crédito** (4-9): Avalúo → Avalúo Cerrado → Inscrita → Dictamen →
   Dictaminada → Validación Patronal.
3. **Cierre legal** (10-12): Firmas Programadas → Escriturada → Detonada.
4. **Administrativo** (13): Facturada.
5. **Entrega** (14-17): Preparada → Entregada → Comisión Pagada → Terminada.

Click en una fase → carga su panel en la Zona C.

### Zona C — Panel de trabajo (tabs)

- **Captura** — el formulario de la fase activa (los mismos que ya existen),
  pero con la Zona A al lado.
- **Documentos** — expediente completo en grid, agrupado por etapa.
- **Cuadratura** — todo el dinero (enganche, depósitos, crédito institución,
  crédito directo, cheque notaría, factura, nota de crédito) reconciliado;
  donde Beto valida que cuadra.
- **Bitácora** — quién cerró qué fase y cuándo.

### Copiloto de cierre

Panel que dice, en lenguaje claro: _"Para escriturar falta: X. Para cerrar la
operación falta: Y."_ El sistema señala lo pendiente; el operador no adivina.

### Reuso de lo construido

El modelo de datos ya está completo (`dilesa.ventas` + `venta_fases` +
`erp.adjuntos` + `erp.cxc_*`). Los 13 formularios de captura se vuelven los
paneles de la tab Captura. Es recomposición de UI + agregados (cuadratura,
expediente, copiloto), no reescritura.

## Decisiones abiertas (para Beto)

- **D1 — Página:** el workspace **evoluciona** la página de detalle actual
  (`/dilesa/ventas/[id]`), no se duplica. (Recomendado.)
- **D2 — Captura no-lineal:** separar "editar un dato" (libre, en cualquier
  momento, con permisos) de "cerrar un hito" (secuencial, con fecha +
  responsable). El copiloto marca lo que falta. (Recomendado — resuelve el
  dolor de "no tengo los datos básicos enfrente".)
- **D3 — Fases 14-17:** el workspace se diseña **agnóstico de fase**; los
  campos/docs específicos de 14-17 se definen cuando lleguemos a ese sprint
  (como pidió Beto: "ya que tengas todo acomodado").
- **D4 — Cuadratura (necesito la lógica de Beto):** ¿qué define que una
  operación "cuadra"? Ej.: ¿Precio de asignación = crédito institución +
  depósitos cliente + crédito directo? ¿Cómo se relacionan Valor de
  Escrituración / Valor Facturado / Valor Real Venta Dilesa / Monto Nota de
  Crédito entre sí y con el precio? Esta es la regla central del copiloto.

## Riesgos

- **Timing vs cutoff:** el rediseño compite con el cutoff de esta semana. Se
  decide secuencia con Beto (rediseño primero vs cutoff primero).
- **Scope grande:** se mitiga con sprints chicos, cada uno mergeable.
- **No romper lo que ya está en prod:** las 13 capturas están vivas y en uso;
  el workspace las envuelve sin perder funcionalidad.
- **RLS/permisos por sección:** la cuadratura/finanzas puede requerir gating
  distinto al de captura.

## Sprints (propuesta)

- **S0** — Diseño cerrado (D1-D4) + auditoría de paridad Coda.
- **S1** — Esqueleto del workspace: Zona A (cabecera persistente) + Zona B
  (timeline) + tab Captura reusando los 13 formularios.
- **S2** — Tab Cuadratura (vista financiera unificada según D4).
- **S3** — Tab Documentos (expediente) + Bitácora.
- **S4** — Copiloto de cierre (readiness checklist).
- **S5** — Definir + construir Fases 14-17 en el nuevo modelo.
- **S6** — Cutover Coda (apagar el módulo de ventas en Coda).

## Bitácora

- **2026-06-09:** Promovida. Beto eligió el rediseño completo (opción B) sobre
  el parche incremental, tras notar que la captura por fase pierde el contexto
  de la operación.
- **2026-06-09 (S0):** Decisiones D1-D4 cerradas con Beto (D4: fórmulas de
  cuadratura reverse-engineered de las 66 fórmulas Coda de `grid-mMIXWCSfyr`,
  validadas con ejemplo real). Motor puro `lib/dilesa/cuadratura.ts` + tests.
  Auditoría de paridad Coda: ~7 gaps reales de 109 columnas (PR #776).
- **2026-06-09 (S1):** Workspace en prod — Zona A cabecera persistente +
  mini-cuadratura (#776), Zona B timeline de macro-etapas (#777), Zona C
  pestañas Operación/Cuadratura/Documentos/Bitácora (#778).
- **2026-06-09 (S2a):** 6 columnas de entrada de cuadratura + mappings del
  import (cutoff data) + wiring del motor (#779).
- **2026-06-09 (S2b):** Editor de ajustes de cuadratura (4 buckets de
  descuento + tope autorizado) con recálculo en vivo (#780). Apoyo Infonavit
  pasó de captura manual a derivado del catálogo `dilesa.tipos_credito`
  (paridad 100% con Coda `grid-gBvr7_9fgV`); de paso se corrigió que el
  desglose RPC nunca recibía `p_tipo_credito_id` (apoyo y costo adicional
  Fovissste/IMSS +6% salían en 0).
- **2026-06-09 (sync):** Construcción cortada del sync nocturno Coda→BSOP
  (#782) tras verificar diff 13,942/13,943 tareas y cero palomeos en Coda
  post corte de accesos (2026-06-03). Daily queda solo ventas + expediente
  hasta el cutoff de ventas (S6).
- **2026-06-10 (2c):** Valor Facturado exacto — `tieneRecibo` derivado de los
  adjuntos `recibo_caja` por abono (#786). De fondo: el puente
  venta_pagos→CxC era one-shot y estaba congelado; ahora es paso nocturno
  (`sync_dilesa_cxc_incremental`), se corrigió el dedup del expediente que
  generó 1,450 adjuntos duplicados (borrados con OK de Beto) y se re-corrió
  el backfill (29 pagos + 46 aplicaciones). Pulidos S3: Bitácora con
  responsable + Documentos agrupados por macro-etapa.
- **2026-06-10 (S5 parcial):** Fase 14 — Preparada para Entrega (#794):
  Checklist Pre-Entrega imprimible (43 puntos, prellenado, firmas) + captura
  del escaneado firmado; gate especial desde Escriturada (11). Fase 15 —
  Entregada (#795): Checklist de Entrega al cliente (22 conceptos, firma del
  cliente + Atención a Clientes). RBAC pre-sembrado en ambas (sin migración).
- **2026-06-10 (análisis IA notarial):** En F8 los PDFs del notario (carta de
  instrucción + condiciones financieras Anexo B, slot nuevo) se analizan con
  Claude automáticamente y precargan valor de escrituración, crédito,
  referencia y gastos, con verificaciones cruzadas (NSS, nombre, domicilio
  vs unidad, CLABE vs cuentas DILESA, vendedor) (#796). El magic link del
  notario acepta ambos archivos. Análisis de adjuntos ya cargados persistido
  en `erp.adjuntos.metadata.analisis_notarial` + expandible "Datos
  capturados" por fase en el pipeline (#799). Validado con el expediente
  real Arizpe Luna: extracción 100% exacta.

- **2026-06-11 (F16):** "Comisión Pagada" → "Conformidad del Cliente" (#808):
  encuesta posventa automatizada (trigger al cerrar F15 → envío D+2 → 2
  recordatorios → Atención a Clientes; cron diario `dilesa-encuestas`).
  Encuesta pública mobile vía magic link (NPS + 2 calificaciones +
  comentario); responder cierra la fase sola. Migración aplicada (ledger
  20260611003221). Las comisiones serán pantalla mensual aparte (futura
  iniciativa).
- **2026-06-11 (S4 + F17):** Copiloto de cierre en el workspace (#812): 4
  verificaciones en lenguaje claro (pipeline 1-16, expediente documental con
  docs condicionales eximidos, cuadratura cubierta, conformidad) + página F17
  que re-verifica y sella "Operación Terminada". Pipeline 17/17 construido.
- **2026-06-11 (scope Vendedor):** Verificación de Beto destapó que el
  aislamiento por vendedor NO existía; implementado en capa app (#812):
  rol Vendedor puro ve solo sus ventas/clientes y no abre detalles ajenos.
- **2026-06-11 (problema ZCU):** Flag `dilesa.unidades.problema_zcu` (espejo
  de la columna "Problema ZCU" del Inventario Coda); 35 casas LDLE
  (M12/M20/M21) marcadas en prod. `fn_calcular_precio_venta` deja de sumar
  el costo adicional del crédito (Fovissste +6%) en esas casas y devuelve
  `zcu_exento`; UI de captura y detalle lo señalan. Mapeo agregado al import
  FULL de inventario (#816). Quedan 5 ventas activas capturadas con el 6%
  adentro (4 Fovissste + 1 Infonavit/Fovissste) — Beto decide si se corrigen.
- **2026-06-11 (pagaré con intereses):** Reporte de Beto en prueba de fase 10:
  el interés ordinario del crédito directo se capturaba pero nunca se
  calculaba (solo cláusula de texto) y el pagaré no desglosaba. Motor nuevo
  `lib/dilesa/pagare-interes.ts` (interés simple sobre saldos insolutos, año
  comercial 360, redondeo por fila) + tests; el PDF ahora desglosa Capital /
  Interés / Pago total por parcialidad con fila TOTAL, y la fase 10 muestra
  preview en vivo del mismo motor antes de generar.
- **2026-06-11 (modelo de tasas del pagaré):** Segunda corrección de Beto: el
  modelo estaba volteado (el spread alimentaba el moratorio y el ordinario
  era libre con default 0). Migración `20260611042746` aplicada a prod:
  rename `cd_spread_moratorio_pct`→`cd_spread_ordinario_pct` + CHECK ≥ 4,
  columna `cd_interes_moratorio_pct`, backfill de la única venta nativa con
  TIIE (ordinario 13.6%, moratorio 40.8%). Fase 10 deriva y muestra ambas
  tasas (inputs: TIIE requerida + spread mín. 4); el PDF imprime la
  composición TIIE+spread en la cláusula ordinaria y el moratorio pactado.
- **2026-06-11 (S6 — cutover de ventas, cierre):** Cutoff ejecutado. Beto
  creó los usuarios del equipo (5 con rol Vendedor + Edgar en Gerencia
  Ventas), asignó perfiles, mandó invitaciones y retiró la escritura en
  Coda (queda solo consulta). Último sync manual corrido (run GH 27322758419) y **paridad certificada**: ventas 1438/1438, pagos 1126
  (+9 depósitos huérfanos conocidos sin venta), fases 14,186/14,186
  (re-run del import reporta 0 nuevas + 0 cambiadas, 0 duplicadas),
  expediente 8/8 adjuntos, puente CxC OK. De paso se destapó y reparó que
  los syncs del 8-10 jun NO actualizaban `venta_fases`: la migración
  `20260608004732` convirtió `venta_fases_uk` en partial unique index
  (`WHERE deleted_at IS NULL`) y el `ON CONFLICT` de PostgREST no matchea
  índices parciales — los 29 chunks fallaban en silencio (el wrapper lo
  trataba como no-fatal). `import_dilesa_ventas.ts` ahora hace merge manual
  (SELECT activas → diff → INSERT/UPDATE); las 52 fases del gap se
  recuperaron. Daily apagado (el `schedule:` salió del workflow; queda
  `workflow_dispatch` manual como vía de rescate), runbook actualizado.
  Iniciativa cerrada.
- **2026-06-11 (post-cierre — descuento máximo desde promoción):** Regla de
  Beto: el Descuento Máximo Autorizado de la cuadratura ES el valor de la
  promoción/bono elegido en la Solicitud (bonos flexibles repartibles entre
  buckets) — derivado, no captura. `promociones.monto` ($15,000 al bono
  LDLE-ISC) + `ventas.promocion_id` (la solicitud persiste FK, ya no texto en
  notas); el editor de cuadratura quita el input y muestra el tope auto con
  alerta si los 4 buckets lo exceden. Legacy Coda (264 activas) cae al valor
  capturado allá. Migración aplicada a prod.
- **2026-06-11 (post-cierre — correo de escrituración F11):** Réplica
  mejorada del correo de Coda "📜 Escrituración" al cerrar la fase: cliente
  (TO) + vendedor (CC) + `escrituras@dilesa.mx` (extra editable en el
  catálogo de notificaciones, slug `dilesa_escrituracion`, kill switch +
  log). Mejoras vs Coda: número de escritura, notaría desde catálogo
  (`notario_id` → `erp.personas`), branding de empresa, reply-to
  `admin@dilesa.mx`, redacción corregida y sin links internos. Disparo
  automático fire-and-forget en la captura + botón "Correo de escrituración"
  en el expediente (reenviar / enviarse prueba) que cubre ventas escrituradas
  antes del feature. Idempotencia `notif_escrituracion_at` (migración
  `20260611190612` aplicada). Template aprobado por Beto con prueba real
  (venta Limas M3-L16-LDLE-ISC). Ventas migradas de Coda sin `notario_id` ni
  vendedor-usuario omiten esas partes del correo con gracia.

## Decisiones registradas

- **2026-06-09:** Ir por rediseño completo (workspace "Expediente de
  Operación"), reusando los datos y formularios de las 13 fases ya
  construidas; definir Fases 14-17 dentro del nuevo modelo, no antes.
- **2026-06-09:** El "saldo cero" de la cuadratura se mide contra **Valor de
  Escrituración** (no precio de asignación); cubierta ⇔ saldo ≤ 0. Confirmado
  por Beto con ejemplo real.
- **2026-06-09:** Apoyo Infonavit NO se captura ni se importa: se deriva en
  runtime de `dilesa.tipos_credito.apoyo_infonavit_monto` por nombre del tipo
  de crédito (misma fuente que el RPC de desglose).
- **2026-06-09:** Pre-cutoff, los descuentos se capturan en Coda (el sync
  nocturno pisa los campos mapeados); el editor de BSOP queda listo para
  cuando BSOP sea master (S6).
- **2026-06-10:** El análisis IA de docs notariales es automático al subir
  (sin botón) pero NADA se persiste a la venta hasta Guardar; para adjuntos
  ya cargados la precarga es suave (solo campos vacíos) y el resultado se
  persiste en el metadata del adjunto (una extracción por documento).
- **2026-06-10:** La preparación de entrega (F14) arranca desde la escritura
  (F11) sin esperar Detonada/Facturada (`GATE_PREVIA_OVERRIDE`); la entrega
  al cliente (F15) sí exige F14 cerrada.
- **2026-06-10:** El extractor notarial es genérico: con cartas de
  FOVISSSTE/banca extrae lo que el documento traiga y lo ausente se captura
  manual — no bloquea créditos no-Infonavit.
- **2026-06-11:** Casas con problema ZCU no trasladan al precio el costo
  adicional del tipo de crédito (FOVISSSTE no financia ese sobreprecio). El
  flag vive en la unidad, no en la venta; la fuente de marcado sigue siendo
  Coda Inventario (botón "Registra Problema ZCU") mientras el módulo viva
  ahí. Ventas ya capturadas no se recalculan automáticamente.
- **2026-06-11:** El plan de pagos del pagaré captura SOLO capital (la suerte
  principal — el "Bueno por" del título no cambia); el interés ordinario se
  deriva en runtime con convención mercantil mexicana: interés simple sobre
  saldos insolutos, año comercial de 360 días, periodo desde la suscripción /
  vencimiento anterior. No se persiste el desglose (es determinista de
  fechas + tasa); UI y PDF comparten el motor. Si el abogado pide otra base
  (p. ej. 365), se cambia en un solo lugar.
- **2026-06-11:** Tasas del crédito directo (regla de Beto): interés
  ordinario SIEMPRE = TIIE 28d + spread mínimo de 4 puntos (CHECK en DB);
  interés moratorio = 3× la ordinaria. Ambas se persisten como snapshot
  pactado al guardar (la TIIE cambia, el pagaré conserva la tasa del día de
  suscripción). Contexto legal investigado: no existe tope numérico fijo
  para moratorios pactados en pagarés mercantiles; el límite es la doctrina
  anti-usura SCJN (referente práctico ~37% — 3× con TIIE+4 ≈ 31.8% queda
  debajo; con spreads altos puede excederlo y es decisión por venta).
- **2026-06-11 (cutover):** El workflow `dilesa-coda-sync` NO se borra:
  queda manual-only (`workflow_dispatch`) como vía de rescate para rezagos
  puntuales de Coda. Cuidado al usarlo post-cutover: el modo daily pisa los
  campos mapeados de las ventas con `coda_row_id` — confirmar antes que
  nadie haya editado esas ventas en BSOP, o lo editado se pierde.
- **2026-06-11 (ZCU — confirmación de Beto):** Las 5 ventas activas
  capturadas con el 6% Fovissste adentro (M12-L28, M12-L33, M21-L28,
  M21-L33, M20-L28) **no se corrigen**: la exención ZCU se autorizó hoy y
  aplica solo a asignaciones nuevas; lo capturado antes queda como estaba.
  Cierra el pendiente abierto en el PR #816.
