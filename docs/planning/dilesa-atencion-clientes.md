# Iniciativa — Atención a Clientes (recepción de obra → entrega → conformidad) DILESA

**Slug:** `dilesa-atencion-clientes`
**Empresas:** DILESA
**Schemas afectados:** principalmente sobre datos existentes; `dilesa` (tabla nueva de recepción/checklist de obra; consolidación del hito de recepción en `plantilla_tareas`/`tareas_construccion`; lectura de `construccion`, `ventas`, `venta_fases`, `unidades`, `venta_encuestas`), `core` (módulo nuevo `dilesa.atencion_clientes` + sub-slugs + permisos de rol)
**Estado:** proposed
**Próximo hito:** Beto aprueba alcance v1 + resuelve las 3 decisiones abiertas (D1 hito de recepción canónico, D2 valor MO de la tarea de recepción, D3 write de la tarea de recepción solo para el rol) → arrancar Sprint 1
**Dueño:** Beto
**Creada:** 2026-06-15
**Última actualización:** 2026-06-15 (promovida desde la conversación de diseño del perfil de Ciori / departamento de Atención a Clientes)

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

El `costo_mo_plantilla` de estas tareas está en ~0 en las plantillas vigentes — **choca con "tiene un valor importante" (D2, a reconciliar)**.

## Decisiones abiertas (resolver antes de Sprint 1)

- **D1 — Hito de recepción canónico.** Hay 5 variantes. ¿Consolidamos a **una** tarea/hito canónico de "recepción de obra al contratista" (la activa hoy parece ser _"limpieza y recepcion con check list de detalles"_)? ¿O modelamos la recepción como un objeto propio (`dilesa.recepcion_obra`) desacoplado de la tarea de plantilla, y la tarea solo refleja el cierre? Recomendación: objeto propio + marcar la tarea canónica al cerrarlo (idempotente, robusto a plantillas dispares).
- **D2 — Valor de la tarea de recepción.** Beto la describió como "valor importante para cerrar el ciclo y recibirle al contratista", pero el `costo_mo_plantilla` está en ~0. ¿El valor es el % de MO de esa tarea (mal cargado en BSOP y hay que corregirlo), o es el hito de liberación de retención / último pago al contratista (otra cosa)? Define si Sprint 1 toca dinero o no.
- **D3 — Control fino del cierre.** ¿El cierre de la recepción se gatea con un sub-slug específico (p. ej. `dilesa.construccion.recepcion` write, solo rol Atención a Clientes + Dirección/admin), en lugar del genérico `dilesa.construccion.tareas`? Recomendación: sí — es justo lo que Coda hacía ("solo ella podía palomear").

## Alcance v1 (sprints propuestos — pendientes de aprobación)

- [ ] **Sprint 1 — Recepción de obra al contratista (el gap real).** Resolver D1/D2/D3. Modelar la recepción capturable en BSOP: checklist estructurado de verificaciones/pruebas de la vivienda (lo que no se controlaba en Coda) ligado a `dilesa.construccion`/unidad; gate específico para que solo Atención a Clientes (+ Dirección/admin) la cierre; cerrarla marca el hito canónico y da la obra por terminada. Acta/PDF de recepción opcional. Consolidar/mapear las 5 variantes.
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

- **Consolidar las 5 variantes de tarea sin romper avance histórico.** El backfill ya cerró 1050+ recepciones; tocar las plantillas/tareas debe ser idempotente y no recalcular `avance_pct` de obras terminadas hacia atrás. Mitigación: objeto de recepción desacoplado (D1) en vez de migrar la tarea.
- **Doble fuente de verdad si el módulo deriva en captura.** Mitigación: la bandeja es estrictamente vista + deep-link; la única captura nueva es la recepción (S1).
- **El "valor" de la tarea (D2) puede arrastrar lógica financiera** (retención/último pago al contratista). Si toca dinero, va con confirmación explícita y posible enganche con CxP/estimaciones — no asumir.
- **Control fino mal puesto esconde el módulo** (regla ADR-014: backfill defensivo de permisos al crear sub-slugs).

## Métricas de éxito

- 100% de las recepciones de obra nuevas capturadas en BSOP con su checklist (vs. 0% hoy).
- Ciori opera el tramo completo desde la bandeja sin abrir el listado general de ventas.
- Tiempo medio recepción→entrega y NPS visibles y con tendencia.

## Decisiones registradas

- **2026-06-15** — Arquitectura: bandeja/cola (vista) + deep-link a captura existente; captura nueva solo para recepción de obra. Razón: una fuente de verdad, no duplicar las fases 14-16.
- **2026-06-15** — Accesos inmediatos de Ciori: agregar `dilesa.ventas.clientes` (read) y `dilesa.manual` (read) desde la matriz UI (sin migración); el resto del rol ya estaba bien configurado.

## Bitácora

- **2026-06-15** — Iniciativa promovida. Conversación de diseño del perfil de Atención a Clientes (Ciori). Verificado en prod: rol existente + permisos actuales + 5 variantes de tarea de recepción + gate fino por fase ya implementado. Alcance v1 en 3 sprints. Pendiente: Beto resuelve D1/D2/D3 y aprueba alcance para pasar a `planned`.
