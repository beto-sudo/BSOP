# Iniciativa — Atención a Clientes (recepción de obra → entrega → conformidad) DILESA

**Slug:** `dilesa-atencion-clientes`
**Empresas:** DILESA
**Schemas afectados:** principalmente sobre datos existentes; `dilesa` (tabla nueva de recepción/checklist de obra; consolidación del hito de recepción en `plantilla_tareas`/`tareas_construccion`; lectura de `construccion`, `ventas`, `venta_fases`, `unidades`, `venta_encuestas`), `core` (módulo nuevo `dilesa.atencion_clientes` + sub-slugs + permisos de rol)
**Estado:** planned
**Próximo hito:** Arrancar Sprint 1. S1a (estandarizar el bloque de cierre de 3 pasos + redistribuir % en los 8 prototipos RM) requiere OK explícito de Beto antes de aplicar la migración — toca el modelo de avance/MO. En paralelo S1b (objeto `recepcion_obra` + checklist de verificaciones) y S1c (gate `dilesa.construccion.recepcion`).
**Dueño:** Beto
**Creada:** 2026-06-15
**Última actualización:** 2026-06-15 (decisiones D1/D2/D3 resueltas con Beto: bloque de cierre canónico de 3 pasos ~6%, recepción mayor peso, permiso especial en el cierre → alcance v1 cerrado, pasa a planned)

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
- **D2 — El bloque de cierre pesa ~6% del valor de la obra** (un poco más es aceptable), con el **paso 3 (recepción) llevando el mayor peso**. Esto obliga a **estandarizar + redistribuir** el `porcentaje_costo` en la familia RM (hoy ~3.7%): subir el bloque a ~6% y recalcular proporcionalmente el ~94% restante de cada prototipo para mantener el 100% (mover un concepto exige rebalancear todos). La familia IS ya está ~6.7% (ajuste menor o dejar). El valor es el **% del avance/MO de la obra**, no un flujo de dinero nuevo — Sprint 1 NO toca pagos/CxP directamente (la retención al contratista se evalúa aparte si aplica).
- **D3 — Permiso especial en el paso 3 (recepción).** Solo el rol Atención a Clientes (+ Dirección/admin) puede cerrar la recepción final. Gate específico (p. ej. `dilesa.construccion.recepcion` write) en vez del genérico `dilesa.construccion.tareas`. Por eso el write genérico de tareas NO se le marcó al rol.

## Alcance v1 (sprints propuestos — pendientes de aprobación)

- [ ] **Sprint 1 — Recepción de obra al contratista (el gap real).** Tres entregables:
  - **S1a · Estandarizar el bloque de cierre (3 pasos) + redistribuir %.** Definir el bloque canónico de 3 tareas (checklist → retiro de escombro → recepción) y aplicarlo a los 14 prototipos, en especial reestructurar los 8 de la familia RM (hoy ~3.7%). Subir el bloque a ~6% (paso 3 mayor peso) y **redistribuir proporcionalmente** el resto de cada prototipo para mantener 100%. Migración idempotente + verificación de que cada prototipo suma 1.00. **Riesgo a manejar**: recalcula `avance_pct` de obras en curso con esos prototipos (las terminadas no cambian su total). Requiere OK explícito de Beto antes de aplicar (toca el modelo de avance/MO).
  - **S1b · Recepción capturable en BSOP.** Objeto propio `dilesa.recepcion_obra` ligado a `construccion`/unidad, con checklist estructurado de pruebas/verificaciones (lo que no se controlaba en Coda); al cerrarse marca la tarea canónica del paso 3 → obra terminada. Acta/PDF de recepción opcional.
  - **S1c · Gate específico del cierre.** Nuevo sub-slug `dilesa.construccion.recepcion` (write solo Atención a Clientes + Dirección/admin) — ADR-014. El paso 1 (checklist) puede quedar bajo el mismo gate o el genérico; el paso 3 SIEMPRE bajo el específico.
- [ ] **Sprint 2 — Bandeja de Atención a Clientes (el workspace).** Módulo nuevo `dilesa.atencion_clientes` (sidebar, sección Inmobiliario o sección propia) como cola por momento, alimentada por vistas SQL sobre datos existentes:
  - **Obra por recibir** — `construccion` al 100% sin recepción cerrada.
  - **Pre-entrega pendiente** — recibidas sin F14.
  - **Entrega pendiente** — F14 sin F15.
  - **Encuesta sin responder** — F15 con `venta_encuestas` programada/enviada.
    Cada tarjeta deep-linkea a la captura existente (recepción de S1, F14/F15/F16). Patrón `<TeTocaStrip>`. RBAC: padre + sub-slugs por tab (ADR-030), backfill de permisos al rol.
- [ ] **Sprint 3 — Métricas + cierre.** KPIs del departamento (`<ModuleKpiStrip>`): tiempo medio recepción→entrega, NPS promedio (de `venta_encuestas`), # encuestas pendientes, # viviendas por etapa. Manual de usuario del módulo (iniciativa `manual-usuario`). Notificación opcional a Ciori cuando una obra llega a 100% (catálogo `core.notification_*`).

## Lo que YA existe (no rehacer)

- **Pipeline de venta, fases 14-17** con captura, checklists imprimibles (PDF) y gate fino por fase ([14-preparada-entrega](../../app/dilesa/ventas/[id]/capturar/14-preparada-entrega/page.tsx), 15, 16, 17). Catálogo en [migración comercializacion:201](../../supabase/migrations/20260522212328_dilesa_v2_comercializacion.sql).
- **Conformidad (F16) automática**: `dilesa.venta_encuestas` + encuesta pública con magic link ([app/dilesa/encuesta/[token]](../../app/dilesa/encuesta)) + cron `dilesa-encuestas` (D+2, 2 recordatorios). NPS + calidad + proceso + comentario.
- **Construcción + tareas**: `dilesa.construccion`, `construccion_tareas_terminadas`, `plantilla_tareas`, `etapas_construccion`; palomeo inline en [construccion/[id]](../../app/dilesa/construccion/[id]). Trigger `tg_construccion_avance` recalcula `avance_pct` y transiciona la unidad a `terminada` al 100%.
- **Rol `Atencion a Clientes`** ya creado y casi completo (ver Hallazgos).
- **Patrón de bandeja** `<TeTocaStrip>` y de KPIs `<ModuleKpiStrip>`.

## Riesgos

- **Redistribuir % sin romper avance (S1a).** Subir el bloque de cierre a ~6% en los 8 prototipos RM exige rebalancear el resto para mantener 100%, y eso recalcula `avance_pct` de las obras en curso con esos prototipos (las terminadas no cambian su total, pero sí su desglose histórico). Mitigación: migración idempotente + verificación `sum=1.00` por prototipo + objeto de recepción desacoplado de la tarea de plantilla + OK explícito de Beto antes de aplicar.
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
- **2026-06-15** — D1: bloque de cierre canónico de **3 pasos** (checklist → retiro de escombro → recepción), estandarizado en los 14 prototipos; recepción modelada como objeto propio. D2: el bloque pesa **~6%** del valor de la obra, recepción mayor peso → estandarizar + redistribuir % en los 8 prototipos RM (hoy ~3.7%) manteniendo 100%; es % de avance/MO, no flujo de dinero nuevo. D3: **permiso especial** en el cierre (solo Atención a Clientes + Dirección). Razón: replicar el control que vivía en Coda y darle peso real al hito de recepción.

## Bitácora

- **2026-06-15** — Iniciativa promovida + alcance cerrado en la misma sesión de diseño del perfil de Atención a Clientes (Ciori). Verificado en prod: rol existente + permisos actuales (2 reads agregados) + 5 variantes de tarea de recepción + 2 familias de prototipos sin estandarizar (IS ~6.7% / RM ~3.7%) + gate fino por fase de venta ya implementado. Decisiones D1/D2/D3 resueltas con Beto → pasa a `planned`. Promoción documentada en [PR #894](https://github.com/beto-sudo/BSOP/pull/894). Próximo: arrancar Sprint 1 (S1a requiere OK explícito de Beto antes de tocar % de plantillas).
