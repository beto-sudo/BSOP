# Iniciativa — Expediente de Operación (workspace unificado de venta) DILESA

**Slug:** `dilesa-ventas-expediente`
**Empresas:** DILESA (golden; el patrón de "workspace de operación" es replicable a las otras empresas)
**Schemas afectados:** principalmente UI (Next.js App Router); `dilesa` (posible vista `v_venta_cuadratura` + columnas/slugs de fases 14-17), `core.modulos` (sub-slugs RBAC de 14-17). Reusa lo existente: `dilesa.ventas`, `dilesa.venta_fases`, `erp.adjuntos`, `erp.cxc_pagos`/`cxc_cargos`
**Estado:** in_progress
**Próximo hito:** Sprint 2c (recibo de caja → Valor Facturado exacto) + S5 (definir y construir Fases 14-17, Beto define campos/docs). Luego S4 (copiloto de cierre) y S6 (cutover Coda de ventas)
**Dueño:** Beto
**Creada:** 2026-06-09
**Última actualización:** 2026-06-09 (S0-S2b entregados; corte de construcción del sync nocturno)

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
