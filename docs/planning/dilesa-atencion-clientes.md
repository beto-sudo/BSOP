# Iniciativa — Atención a Clientes (recepción de obra → entrega → conformidad) DILESA

**Slug:** `dilesa-atencion-clientes`
**Empresas:** DILESA
**Schemas afectados:** principalmente sobre datos existentes; `dilesa` (tabla nueva de recepción/checklist de obra; consolidación del hito de recepción en `plantilla_tareas`/`tareas_construccion`; lectura de `construccion`, `ventas`, `venta_fases`, `unidades`, `venta_encuestas`), `core` (módulo nuevo `dilesa.atencion_clientes` + sub-slugs + permisos de rol)
**Estado:** in_progress
**Próximo hito:** **Sprint 1 (recepción de obra) ✅ mergeado a prod** (PR #906, 2026-06-16): flujo programar → checklist → acta firmada → recibida, con candado de avance previo. Sigue **Sprint 2 — bandeja de Atención a Clientes** (cola de Ciori: obras por recibir → pre-entrega → entrega → encuesta de conformidad) — pendiente de OK de Beto para arrancar. La redistribución de % y la unificación de nombres en DB quedan diferidas a arranques nuevos.
**Dueño:** Beto
**Creada:** 2026-06-15
**Última actualización:** 2026-06-16 (Sprint 1 mergeado a prod — recepción de obra con candados de secuencia)

## Problema

DILESA tiene un departamento de **Atención a Clientes** (lo controla Ciori) responsable del tramo final del ciclo de la vivienda: **recibe la obra terminada directo del contratista**, hace la **revisión pre-entrega**, ejecuta la **entrega física al cliente** y cierra la **conformidad del cliente**. Hoy ese trabajo está repartido y parcialmente fuera del sistema:

- **La recepción de obra al contratista no está controlada en BSOP.** En Coda, la última tarea de cada construcción era la recepción de la unidad terminada, **solo Ciori podía palomearla**, y aparte llenaba un checklist de pruebas/verificaciones de la vivienda que **nunca se controló en sistema**. Al palomear esa tarea se daba la obra por terminada (y se cerraba el ciclo con el contratista — Beto reporta que tiene un valor relevante para el cierre/pago; ver D2). En BSOP ese control no migró: `dilesa.construccion_tareas_terminadas.revisado_por` viene NULL en el 100% del backfill de Coda, y existen **5 variantes** de "tarea de recepción" en distintas etapas heredadas de la inconsistencia de Coda (ver Hallazgos).
- **No hay control fino sobre quién cierra esa recepción.** El gate actual `dilesa.construccion.tareas` (write) es genérico: habilita palomear _cualquier_ tarea de construcción, no solo la de recepción. Replicar el "solo Ciori cierra la recepción" requiere un gate específico.
- **La captura de pre-entrega / entrega / conformidad SÍ existe** (fases 14-16 del Expediente de Venta), pero Ciori no tiene una **bandeja consolidada** que le muestre solo lo suyo en el momento indicado: hoy tendría que navegar el listado completo de ventas y abrir cada expediente para descubrir qué le toca. El departamento opera "a ciegas" sobre la cola real de trabajo.

## Outcome esperado

- **La recepción de obra al contratista vive en BSOP**, con su checklist de verificaciones/pruebas capturado en sistema (lo que no se controlaba en Coda), y **solo el rol Atención a Clientes (+ Dirección/admin)** puede cerrarla. Cerrarla es lo que da la vivienda por terminada.
- **Ciori opera desde una bandeja propia** que le muestra su cola por momento (obra por recibir → pre-entrega pendiente → entrega pendiente → encuesta sin responder), con un clic a la captura que ya existe. Cero duplicación de captura: la fuente de verdad sigue siendo `dilesa.venta_fases` + `dilesa.construccion`.
- **El departamento es medible**: tiempo recepción→entrega, NPS promedio, encuestas pendientes, viviendas en cada etapa.

## Decisión de arquitectura (cerrada con Beto, 2026-06-15)

**El módulo "Atención a Clientes" es una BANDEJA / cola de trabajo (vista), NO captura nueva.** Las capturas de pre-entrega (F14), entrega (F15) y conformidad (F16) ya existen en el Expediente de Venta y se reutilizan vía deep-link. El único flujo con captura nueva es la **recepción de obra al contratista** (gap real). Esto respeta "una fuente de verdad / no multiplicar docs ni capturas". El patrón de bandeja ya existe en el repo: `<TeTocaStrip>` del ciclo de gasto ([components/gasto/te-toca-strip.tsx](../../components/gasto/te-toca-strip.tsx)).

## Hallazgos (estado real verificado en prod, 2026-06-15)

**Rol `Atencion a Clientes` (`e2be40c5-…`) ya configurado por Beto** — casi completo:

| Acceso                                           | Tiene        | Falta                                           |
| ------------------------------------------------ | ------------ | ----------------------------------------------- |
| `dilesa.ventas` (padre)                          | read + write | —                                               |
| `dilesa.ventas.fase14/15/16`                     | read + write | — (control fino correcto: solo sus 3 fases)     |
| `dilesa.ventas.fases` / `.inventario` / `.lista` | read         | —                                               |
| `dilesa.construccion.obras`                      | read         | —                                               |
| `dilesa.construccion.tareas`                     | read         | **write** (para palomear la recepción — ver D3) |
| `dilesa.ventas.clientes`                         | —            | **read** (ver contacto del cliente)             |
| `dilesa.manual`                                  | —            | **read** (ayuda contextual)                     |

Quick-win inmediato (Beto, desde la matriz `/settings/acceso`, sin migración): marcar **`dilesa.ventas.clientes` (read)** y **`dilesa.manual` (read)** al rol. El write de `dilesa.construccion.tareas` queda condicionado a D3.

**Las 5 variantes de "tarea de recepción" en plantillas (heredadas de Coda):**

| Tarea                                                            | Etapa                                   | En prototipos | Veces cerrada | Última              |
| ---------------------------------------------------------------- | --------------------------------------- | ------------- | ------------- | ------------------- |
| `limpieza y recepcion con check list de detalles`                | RECEPCIÓN CHEK LIST                     | 8             | 312           | 2026-06-12 (activa) |
| `Checklist de Recepcion a Contratista`                           | LIMPIEZA RETIRO DE ESCOMBRO Y RECEPCION | 6             | 1050          | 2026-05-20          |
| `Control de Calidad ✅ Construcción Terminada 🏁`                | LIMPIEZA RETIRO DE ESCOMBRO Y RECEPCION | 6             | 1050          | 2026-05-20          |
| `Entrega de Kit`                                                 | KIT DE ENTREGA                          | 6             | 1052          | 2026-05-20          |
| `limpieza y control de calidad recepcion construcción terminada` | ENTREGA LLAVE EN MANO                   | 8             | 310           | 2026-02-20          |

Las 5 variantes existen porque **el bloque de cierre no está estandarizado entre prototipos** — hay 2 familias (verificado en los 14 prototipos con plantilla, todos suman 100% hoy):

| Familia           | Prototipos                                             | Bloque de cierre actual                                                                                                                              | Suma del bloque                     |
| ----------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Interés social    | LDLE-ISC, LV-ISA, LV-ISB, LV-ISC, LV2-ISC, LV2-ISD (6) | 2 tareas: `Checklist de Recepcion a Contratista` (~0.4%) + `Control de Calidad … Terminada` (~6.3%)                                                  | **~6.7%** (ya cerca del objetivo)   |
| Residencial medio | LDS-RMA/B/C/D, LDV-RMA/B/C/D (8)                       | 3 tareas distintas: `limpieza y recepcion con check list` (~0.5%) + `retiro de escombro` (~1.9%) + `limpieza y control de calidad recepcion` (~1.3%) | **~3.7%** (bajo + nombres dispares) |

El `costo_mo_plantilla` viene ~0 (no se cargó en el import); el peso real es el **`porcentaje_costo`** de cada tarea. La familia RM (8 prototipos) es la que hay que reestructurar.

## Decisiones resueltas (Beto, 2026-06-15)

- **D1 — Bloque de cierre canónico = 3 pasos** (no 1). Estandarizar en TODOS los prototipos (interés social y residencial medio) el mismo bloque final, en este orden: **(1) Checklist de recepción** — Atención a Clientes recorre la vivienda, detecta detalles y se los hace saber al contratista; **(2) Retiro de escombro / limpieza** — el contratista corrige y limpia; **(3) Recepción / control de calidad terminada** — Atención a Clientes recibe la unidad formalmente. Los pasos 1 y 3 son los gates de Atención a Clientes; el 3 es el cierre que da la obra por terminada. Modelado recomendado: la recepción como **objeto propio** (`dilesa.recepcion_obra`, con su checklist estructurado de pruebas/verificaciones) + marca la tarea canónica del paso 3 al cerrarse (idempotente, robusto a plantillas dispares).
- **D2 — El bloque de cierre debería pesar ~6%** (recepción mayor peso), PERO **NO se tocan porcentajes ni conceptos ahora** (decisión Beto, 2026-06-15): redistribuir el `porcentaje_costo` recalcularía el `avance_pct` de las obras en construcción a media obra. La estandarización de % queda **diferida a arranques nuevos** (en LDS ya se terminaron los arranques; en LDLE se podría meter a la plantilla solo para arranques nuevos, pero por ahora no conviene). Lo único que SÍ se hace en v1 es **estandarizar el NOMBRE** de la tarea de checklist y de la tarea de recepción en todos los prototipos — solo el texto del diccionario `tareas_construccion`, sin tocar `porcentaje_costo` ni la estructura de `plantilla_tareas` (avance de obras en curso intacto). Consecuencia aceptada: las 2 familias siguen con pesos dispares en el bloque (IS ~6.7% / RM ~3.7%) hasta que se rebalanceen los prototipos en arranques futuros (ver Deuda diferida).
- **D3 — Permiso especial en la recepción.** Solo el rol Atención a Clientes (+ Dirección/admin) puede cerrar la recepción final. Gate específico (p. ej. `dilesa.construccion.recepcion` write) en vez del genérico `dilesa.construccion.tareas`. Por eso el write genérico de tareas NO se le marcó al rol. Para identificar la tarea de recepción/checklist en cada prototipo sin depender del texto, se evalúa una bandera marcadora (no toca %).

## Alcance v1 (sprints propuestos — pendientes de aprobación)

- [ ] **Sprint 1 — Recepción de obra al contratista (el gap real).** Tres entregables:
  - **S1a · Marca semántica `hito_recepcion` ✅ APLICADA (2026-06-16).** Columna aditiva en `dilesa.tareas_construccion` (`checklist` | `recepcion_final`), 4 filas marcadas (2 por familia → cubre los 14 prototipos). Identifica el hito por ID, no por nombre/etapa/% (que divergen entre familias). NO toca nombres, `porcentaje_costo`, etapas ni avance. La consistencia visual del nombre se resuelve en la **UI** derivando un label canónico de la marca (checklist = "Checklist de Recepción a Contratista"; recepción = "Control de Calidad — Recepción de Vivienda Terminada") — NO se renombra/consolida en DB. Migración `20260616011322`.
  - **S1b · Recepción capturable en BSOP — ✅ BACKEND APLICADO (2026-06-16).** Tabla `dilesa.recepcion_obra` (1 por construcción, RLS empresa-scoped) con `checklist jsonb` (snapshot de verificaciones/pruebas) + RPC `dilesa.fn_recepcion_cerrar` que UPSERTea la recepción y marca (idempotente) la tarea `recepcion_final` como terminada → obra terminada. Migración `20260616020032`. **Pendiente UI** (drawer de checklist) + definir el contenido del checklist con Ciori (borrador propuesto).
  - **S1c · Gate específico del cierre — ✅ BACKEND APLICADO (2026-06-16).** Sub-slug `dilesa.construccion.recepcion` (write: Atención a Clientes + Dirección; admin siempre) + gate en la RPC + trigger defensa-en-profundidad `tg_recepcion_gate` (bloquea cerrar la tarea `recepcion_final` sin rol, deja pasar backfills). **Pendiente UI**: botón "Recibir obra" gated + label canónico derivado de la marca. El checklist (paso 1) queda con el gate genérico; el cierre (paso 3) con el específico.
- [ ] **Sprint 2 — Bandeja de Atención a Clientes (el workspace).** Módulo nuevo `dilesa.atencion_clientes` (sidebar, sección Inmobiliario o sección propia) como cola por momento, alimentada por vistas SQL sobre datos existentes:
  - **Obra por recibir** — `construccion` al 100% sin recepción cerrada.
  - **Pre-entrega pendiente** — recibidas sin F14.
  - **Entrega pendiente** — F14 sin F15.
  - **Encuesta sin responder** — F15 con `venta_encuestas` programada/enviada.
    Cada tarjeta deep-linkea a la captura existente (recepción de S1, F14/F15/F16). Patrón `<TeTocaStrip>`. RBAC: padre + sub-slugs por tab (ADR-030), backfill de permisos al rol.
- [ ] **Sprint 3 — Métricas + cierre.** KPIs del departamento (`<ModuleKpiStrip>`): tiempo medio recepción→entrega, NPS promedio (de `venta_encuestas`), # encuestas pendientes, # viviendas por etapa. Manual de usuario del módulo (iniciativa `manual-usuario`). Notificación opcional a Ciori cuando una obra llega a 100% (catálogo `core.notification_*`).

## Deuda diferida (no en v1)

- **Estandarizar los % del bloque de cierre (~6%, recepción mayor peso) entre las 2 familias.** No se hace mientras haya obras en construcción (recalcularía su avance). Se aplica a **arranques nuevos**, metiendo el cambio a la plantilla del prototipo correspondiente (LDLE u otros) solo para construcciones futuras, y rebalanceando proporcionalmente el resto a 100%. Disparador: cuando se decida abrir un nuevo lote de arranques con plantilla actualizada. Hasta entonces, IS ~6.7% / RM ~3.7% conviven.
- **Unificar los NOMBRES de las tareas en la DB (consolidar a 1 fila canónica por concepto).** Descartado en v1: lograr el texto idéntico exige repuntar `plantilla_tareas` + soft-delete de filas (cambio estructural sobre obras en curso; el classifier lo frenó con razón el 2026-06-16). Con la marca + label en UI ya hay consistencia visual sin tocar DB. Si en arranques nuevos se rehacen las plantillas, ahí se nombran canónicas desde el inicio (sin consolidar nada existente).

## Lo que YA existe (no rehacer)

- **Pipeline de venta, fases 14-17** con captura, checklists imprimibles (PDF) y gate fino por fase ([14-preparada-entrega](../../app/dilesa/ventas/[id]/capturar/14-preparada-entrega/page.tsx), 15, 16, 17). Catálogo en [migración comercializacion:201](../../supabase/migrations/20260522212328_dilesa_v2_comercializacion.sql).
- **Conformidad (F16) automática**: `dilesa.venta_encuestas` + encuesta pública con magic link ([app/dilesa/encuesta/[token]](../../app/dilesa/encuesta)) + cron `dilesa-encuestas` (D+2, 2 recordatorios). NPS + calidad + proceso + comentario.
- **Construcción + tareas**: `dilesa.construccion`, `construccion_tareas_terminadas`, `plantilla_tareas`, `etapas_construccion`; palomeo inline en [construccion/[id]](../../app/dilesa/construccion/[id]). Trigger `tg_construccion_avance` recalcula `avance_pct` y transiciona la unidad a `terminada` al 100%.
- **Rol `Atencion a Clientes`** ya creado y casi completo (ver Hallazgos).
- **Patrón de bandeja** `<TeTocaStrip>` y de KPIs `<ModuleKpiStrip>`.

## Riesgos

- **Tocar % o estructura rompería el avance de obras en curso.** Por eso v1 NO redistribuye porcentajes ni consolida/renombra filas (D2 + classifier 2026-06-16): usa una marca semántica aditiva. La estandarización de pesos y nombres queda diferida a arranques nuevos.
- **Doble fuente de verdad si el módulo deriva en captura.** Mitigación: la bandeja es estrictamente vista + deep-link; la única captura nueva es la recepción (S1b).
- **El % de recepción es avance/MO, no flujo de dinero** (D2). Si más adelante se liga a liberación de retención / último pago al contratista, eso va en iniciativa/PR aparte con confirmación explícita (engancha CxP/estimaciones) — no se asume en v1.
- **Control fino mal puesto esconde el módulo** (regla ADR-014: backfill defensivo de permisos al crear sub-slugs).

## Métricas de éxito

- 100% de las recepciones de obra nuevas capturadas en BSOP con su checklist (vs. 0% hoy).
- Ciori opera el tramo completo desde la bandeja sin abrir el listado general de ventas.
- Tiempo medio recepción→entrega y NPS visibles y con tendencia.

## Decisiones registradas

- **2026-06-15** — Arquitectura: bandeja/cola (vista) + deep-link a captura existente; captura nueva solo para recepción de obra. Razón: una fuente de verdad, no duplicar las fases 14-16.
- **2026-06-15** — Accesos inmediatos de Ciori: agregar `dilesa.ventas.clientes` (read) y `dilesa.manual` (read) — aplicados en prod (INSERT en `core.permisos_rol`); el resto del rol ya estaba bien configurado.
- **2026-06-15** — D1: bloque de cierre canónico de **3 pasos** (checklist → retiro de escombro → recepción); recepción modelada como objeto propio. D2: el bloque debería pesar **~6%** (recepción mayor peso). D3: **permiso especial** en el cierre (solo Atención a Clientes + Dirección). Razón: replicar el control que vivía en Coda y darle peso real al hito de recepción.
- **2026-06-15 (revisión D2)** — Beto: **NO tocar porcentajes ni conceptos mientras haya obras en construcción** (rompería el avance a media obra). La estandarización de % se difiere a **arranques nuevos** (LDS ya cerró arranques; LDLE solo a futuro). Las 2 familias conviven con pesos dispares hasta el rebalanceo futuro (ver Deuda diferida).
- **2026-06-16 (resolución S1a)** — La identificación del hito se implementa con una **marca semántica** `hito_recepcion` (columna aditiva en `tareas_construccion`), NO renombrando/consolidando en DB. El panel de diseño (4 agentes) verificó que es la opción robusta a la divergencia estructural entre familias y al `UNIQUE(nombre)`, y que NO recalcula avance. La consistencia visual del nombre va por **label en la UI** derivado de la marca. La consolidación de nombres en DB se descartó (estructural; el classifier la frenó). Resultado: divergencia de etapas/tareas entre familias se vuelve irrelevante (el sistema lee la marca, no la estructura).

## Bitácora

- **2026-06-15** — Iniciativa promovida + alcance cerrado en la misma sesión de diseño del perfil de Atención a Clientes (Ciori). Verificado en prod: rol existente + permisos actuales (2 reads agregados) + 5 variantes de tarea de recepción + 2 familias de prototipos sin estandarizar (IS ~6.7% / RM ~3.7%) + gate fino por fase de venta ya implementado. Decisiones D1/D2/D3 resueltas con Beto → pasa a `planned`. Promoción documentada en [PR #894](https://github.com/beto-sudo/BSOP/pull/894).
- **2026-06-16** — S1a entregado: migración `20260616011322` (marca `hito_recepcion`) **aplicada a prod**; 4 filas marcadas (checklist + recepción × 2 familias) cubriendo los 14 prototipos; cero cambio de nombres/%/avance (verificado). SCHEMA_REF + types regenerados. Panel de diseño adversarial (4 agentes) usado para elegir el modelo. Pendiente UI: label canónico derivado de la marca. Próximo: S1b (objeto `recepcion_obra` + checklist) + S1c (gate `dilesa.construccion.recepcion`).
- **2026-06-16** — S1b+S1c **backend aplicado a prod** (migración `20260616020032`): tabla `dilesa.recepcion_obra` (RLS empresa-scoped, 1 viva por construcción, checklist JSONB) + RPC `dilesa.fn_recepcion_cerrar` (gate admin/Atención a Clientes/Dirección; UPSERT + marca idempotente la tarea `recepcion_final`) + trigger `tg_recepcion_gate` (defensa en profundidad, bypass backfill) + sub-slug `dilesa.construccion.recepcion` con write para Atención a Clientes + Dirección. SCHEMA_REF + types + `EXPECTED_DB_MODULE_SLUGS` actualizados; 42 tests de permisos verdes. Patrones tomados de fn_user_has_role / tg_ctt_lock_pagadas / cxp_pago_aprobar. **Pendiente: UI** (drawer de checklist + botón "Recibir obra" + label canónico) y **definir el contenido del checklist con Ciori**.
- **2026-06-16** — S1b+S1c **UI entregada** (PR de revisión, rama `claude/dilesa-recepcion-ui`): catálogo `lib/dilesa/recepcion-checklist.ts` que **digitaliza el formato en papel "CHECK LIST PRE-ENTREGA VIVIENDA" de DILESA** tal cual (Exterior 9, Interior PB 13, Interior PA 14 opcional, Azotea 4, Patio 5) + **cancelería de ventanas** (único agregado pedido por Beto; tarja/boiler descartados). Confirmado **EVAP = Atención a Clientes**. Drawer `recepcion-obra-drawer.tsx` (estado por ítem Cumple/Observación/N/A + nota, Planta Alta marcable N/A en 1 planta, resultado Recibida/Con observaciones/Rechazada) que llama `fn_recepcion_cerrar`. Integrado en `construccion/[id]`: botón "Recibir obra" gated por `dilesa.construccion.recepcion` + **label canónico** de las tareas de cierre derivado de la marca. 6 checks verdes (typecheck/lint/format/coverage/initiatives + test nuevo del catálogo). Va SIN auto-merge: UI visible para que Beto/Ciori la prueben en el Vercel Preview.
- **2026-06-16** — **S1d candados de secuencia** (Beto observó que la recepción se habilitaba antes de tiempo). Migración `20260616203207` **aplicada a prod**: estado `programada` + `fecha_programada`, helper `fn_construccion_previas_completas` (todas las tareas de obra no-recepción terminadas), RPC `fn_recepcion_programar` (gate rol + previas) y endurecimiento de `fn_recepcion_cerrar` (para `recibida` exige: previas completas + checklist sin observaciones + **acta firmada subida**). UI (PR #906): botón contextual deshabilitado con tooltip hasta el 100% de avance previo → "Programar recepción" (dialog fecha) → "Continuar recepción" (drawer) con **Guardar avance** / **Recibir obra** (esta última solo con todo verde + acta subida); slot para subir el acta firmada; los hitos de recepción ya **no se palomean a mano** en la lista (badge "Recibir obra"). Acta generada por el sistema: `app/dilesa/construccion/[id]/acta-recepcion` (PrintLayout, formato DILESA lleno + firmas Supervisor/Contratista/EVAP) imprimible para recabar firma. Flujo: programar → checklist → imprimir/firmar → subir acta → recibir. 1847 tests verdes (+ MODULE_DEPS del slug nuevo).
- **2026-06-16** — **Sprint 1 mergeado a prod** ([PR #906](https://github.com/beto-sudo/BSOP/pull/906)), revisado por Beto. Ajuste post-revisión: el estado "recepción bloqueada" (obra a medias) pasó de un `<Button disabled>` sutil a un chip con candado + contador ("🔒 Recepción · faltan N") inequívoco; verificado con datos reales (obra M13-L4-LDS-RMC: 25 previas pendientes → candado correcto). Aprendizaje: `prettier --write <ruta con [id]>` trata los corchetes como glob y NO formatea el archivo; CI con `prettier --check .` sí lo detecta → usar `prettier --write .`. Iniciativa pasa a `in_progress`. **Siguiente: Sprint 2 (bandeja de Atención a Clientes)**, pendiente de OK de Beto.
