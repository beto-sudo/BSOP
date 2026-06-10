# Iniciativa — Flujo de Gasto end-to-end (Proyectos ↔ Compras ↔ CxP) DILESA

**Slug:** `dilesa-flujo-gasto`
**Empresas:** DILESA (golden; el patrón hilo + home de gasto es replicable a las otras empresas cuando su P2P exista)
**Schemas afectados:** principalmente UI (Next.js App Router); vistas SQL de lectura en `erp` (hilo del gasto sobre FKs existentes), `core.modulos` (sub-slugs RBAC del detalle de proyecto con routed tabs). **Cero cambios al modelo de datos P2P** — todas las ligas del hilo ya existen como FKs.
**Estado:** done
**Próximo hito:** — (v1 entregado; fase 2 candidata si algún día se quiere: convergencia del checklist del anteproyecto con el ciclo P2P real)
**Dueño:** Beto
**Creada:** 2026-06-09
**Última actualización:** 2026-06-10 (cerrada — v1 completo en prod: S1 #784, S2 #787 + migración, S3 #788, S4 #789)

## Problema

Los módulos del ciclo de gasto de DILESA (Proyectos/Anteproyectos, Compras,
Construcción, CxP) están bien construidos individualmente — flujo lineal sin
recaptura, binding de partida heredado, control de 3 capas en
`erp.v_partida_control`, aprobaciones server-side. Pero el sistema está
**organizado por tipo de documento, no por flujo de trabajo**:

- Una compra de proyecto cruza **4 hubs con 17 pantallas**, ~9 conceptos y ~30
  estados. El usuario necesita traer el mapa en la cabeza; el sistema no se lo
  da.
- **El proyecto no responde la pregunta de negocio básica** ("¿cuánto llevamos
  comprometido/ejercido/pagado de X?"). La pantalla que la responde (Costeo, 3
  capas) vive como sexto tab de Construcción; el detalle de proyecto no tiene
  ni un link hacia Compras o CxP.
- **La trazabilidad es unidireccional**: desde la factura ves la OC, pero
  desde la OC no ves factura ni pago; desde la requisición solo un estado
  `con_oc`. La pregunta operativa #1 ("¿esta compra dónde quedó?") exige saber
  qué tab abrir.
- **El personal operativo no tiene "qué me toca"**: pendientes de autorizar /
  enviar / recibir / programar / aprobar viven cada uno en su módulo.

Hallazgo clave del análisis (2026-06-09): **el hilo completo ya existe en
FKs** — `cotizaciones.requisicion_id`, `ordenes_compra.requisicion_id` +
`cotizacion_id`, `contratos_construccion.cotizacion_id` + `partida_id`,
`facturas.orden_compra_id` + `obra_estimacion_id` + `partida_id`,
`cxp_pago_aplicaciones`, y `partida_id → presupuesto_partidas.proyecto_id`.
La iniciativa es recomposición de UI + vistas de lectura, no migración.

## Outcome

Que cualquier usuario (Dirección u operativo) viva el gasto como **un solo
flujo**: Solicitar → Cotizar (opcional) → Ordenar/Contratar → Recibir →
Facturar → Pagar.

1. **El proyecto es el home del gasto**: tab "Gasto" en el detalle de proyecto
   con las 4 capas (presupuesto/comprometido/ejercido/pagado + disponible),
   tabla por etapa › capítulo con drill-down, y actividad reciente. Costeo se
   **muda** aquí (decisión D1).
2. **Cada documento del ciclo muestra su hilo**: stepper compartido con los
   pasos del ciclo, los documentos ligados clickeables en ambas direcciones, y
   la siguiente acción sugerida.
3. **El personal ve "qué me toca"**: bandeja lite de pendientes por rol en las
   landings de Compras y CxP.
4. **El lenguaje deja de estorbar**: labels unificados + glosario; navegación
   en el orden del flujo.

## Alcance

### Dentro

- Detalle de proyecto → routed tabs (ADR-005/ADR-030) con tab **Gasto**;
  mudanza de Costeo (Construcción › Costeo → Proyecto › Gasto) con link de
  regreso en Construcción.
- Vista(s) SQL de lectura para el hilo del gasto (sin tablas nuevas).
- `<HiloGastoStepper>` en Requisición, RFQ, OC, Recepción, Factura y Pago —
  con 2 sabores (materiales / obra vía contrato-estimación) y soporte de hilos
  truncados (gasto directo entra en "Facturada"; histórico sin requisición).
- Bidireccionalidad OC → facturas/pagos ligados (hoy solo factura → OC).
- Reorden de tabs de Compras al orden del flujo (Requisiciones · Cotizaciones
  · Órdenes · Recepciones) + botón "Pedir cotizaciones" en requisición
  autorizada (usa `cotizaciones.requisicion_id` existente).
- Labels/glosario unificados (solo UI; la DB no cambia) — p.ej. anteproyecto
  `completado` → "Promovido".
- Alerta de gasto sin partida + bandeja "Sin proyecto/partida" (evitar gasto
  invisible al control).
- Bandeja lite "Te toca" por rol en landings de Compras y CxP (links directos
  a la acción). Auto-autorización de requisiciones creadas por Dirección.
- Quick wins de compras/proyectos: editar OC en borrador, auto-poblar
  plantilla al crear anteproyecto, form de análisis financiero agrupado.
- Doc "El viaje de una compra" + glosario como contenido del manual in-app
  (coordina con iniciativa `manual-usuario`).

### Fuera (no-goals duros)

- **No** tocar el modelo de datos P2P (tablas/FKs/estados en DB).
- **No** fusionar módulos físicamente ni mover URLs de Compras/CxP.
- **No** migrar/renombrar estados en DB (solo labels UI).
- **No** converger el mini-ciclo del checklist de anteproyecto
  (pasos cotización/factura/pago de tareas) con el ciclo real — fase 2
  explícita; v1 solo agrega links de salida del checklist.
- **No** quick wins de CxP (pre-seleccionar vencidas, notificar aprobador):
  pertenecen a la iniciativa `cxp` activa; se proponen allá.
- **No** rollout multi-empresa (depende del P2P de cada empresa).

## Diseño (resumen de decisiones de forma)

- **Home (D1)**: el detalle de proyecto pasa a routed tabs; "Gasto" es un tab
  (no otra sección del scroll). Costeo se muda completo (consulta + edición de
  partidas); una sola superficie, sin drift. Público: Dirección.
- **Hilo (D2)**: 100% derivado de FKs existentes; la complejidad vive en el
  componente (2 sabores + hilos truncados), no en datos. Carga lazy por
  documento (drawer), nunca en listados.
- **Patrón heredado de `dilesa-ventas-expediente`**: separar datos del estado
  del proceso; el proceso es una capa encima del expediente. Reuso de
  patrones, no de componentes 1:1.
- **RBAC**: sub-slugs nuevos del detalle de proyecto según ADR-030 (4 lugares
  en el mismo PR + backfill de permisos clonando el padre).

## Riesgos

| Riesgo                                                                                                                  | Mitigación                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Scope creep (es la iniciativa "pegamento")                                                                              | No-goals duros arriba; lo que no esté en Alcance/Dentro no entra sin decisión de Beto                 |
| Al exponer 3 capas en el proyecto afloran inconsistencias históricas (compras sin partida, ajuste F4 de OCs canceladas) | Tratarlas como hallazgo de datos, no bug de UI; bandeja "Sin partida" las hace visibles y trabajables |
| Gasto invisible (docs sin `partida_id` no aparecen en el home)                                                          | Alerta al capturar + bandeja "Sin proyecto/partida" en v1                                             |
| Performance del hilo (joins de 6+ tablas)                                                                               | Vista de lectura + carga lazy por documento                                                           |
| Re-aprendizaje (mover Costeo, reordenar tabs; ~1 mes de hábitos)                                                        | Redirect desde Construcción › Costeo, aviso, entrada en manual                                        |
| Colisión con `dilesa-ventas-expediente` (sesión paralela)                                                               | Carpetas distintas; Regla 2 para `INITIATIVES.md`; sin dependencia dura                               |

## Métricas de éxito

- "¿Cuánto va comprometido/pagado del proyecto X?" en **≤2 clicks** desde
  `/dilesa/proyectos` (hoy: imposible sin conocer Construcción › Costeo).
- Desde cualquier documento del ciclo, documentos ligados visibles en
  **1 click, ambas direcciones** (hoy: solo factura→OC).
- **0 gasto invisible**: toda factura/requisición DILESA con partida asignada
  o listada en la bandeja "Sin asignar".
- El flujo completo narrado en **1 doc del manual** al que las pantallas
  apuntan.

## Sprints

- **S1 — El hilo**: vista SQL + `<HiloGastoStepper>` en los 6 documentos +
  OC→facturas/pagos. Se entrega solo, valor inmediato.
- **S2 — El home**: routed tabs en detalle de proyecto + tab Gasto (4 capas,
  tabla etapa › capítulo, actividad, drill-down) + mudanza de Costeo.
- **S3 — Navegación y lenguaje**: reorden tabs Compras, "Pedir cotizaciones"
  desde requisición, labels/glosario, alerta gasto sin partida, doc del
  manual.
- **S4 — Bandeja "Te toca" (lite)** por rol + quick wins de compras (editar
  OC borrador, plantilla auto, form financiero agrupado).

## Decisiones registradas

- **2026-06-09 — Costeo se muda al proyecto (D1).** Una sola superficie de
  costeo (consulta + edición) en Proyecto › Gasto; link de regreso en
  Construcción. Razón: dos superficies generan drift y "¿dónde edito?"; el
  costeo es del proyecto y su público es Dirección. Decidido por Beto.
- **2026-06-09 — El hilo es derivado, no tabla nueva (D2).** Todas las ligas
  existen como FKs; una tabla "expediente de compra" sería sobre-ingeniería.
- **2026-06-09 — Convergencia checklist ↔ ciclo real fuera de v1 (D5).**
  Profunda (toca `populatePlantilla`, partidas auto, UX de tareas) y el dolor
  dominante es visibilidad. V1: solo links de salida. Fase 2 explícita.
- **2026-06-09 — Bandeja "Te toca" entra en v1 como S4 lite (D6).** Mayor
  beneficio directo al personal operativo; queries por estado ya existen. Si
  hay que recortar v1, se recorta esto antes que el hilo. Decidido por Beto.
- **2026-06-09 — Quick wins de CxP van a la iniciativa `cxp` (D8).**
  Pre-seleccionar vencidas y notificar aprobador tienen dueño activo; no se
  duplican aquí.
- **2026-06-09 — Vocabulario solo en UI (D4).** Labels + glosario
  centralizados; migrar enums en prod es riesgo sin retorno.
- **2026-06-09 — El hilo se arma en TypeScript, no en vista SQL (S1).** El
  planning decía "vista SQL"; al implementar se eligió `lib/gasto/hilo.ts`
  (builder puro testeable + fetch con queries dirigidas por ronda). Razones:
  los embeds cross-schema de PostgREST no funcionan (erp ↔ dilesa, patrón ya
  conocido del repo), el grafo del hilo varía por documento de arranque, y el
  builder puro quedó cubierto por 17 tests de vitest — una vista SQL no
  permitiría nada de eso. Cero migraciones en S1.
- **2026-06-09 — Drawers de detalle nuevos para OC y Requisición (S1).** El
  mapeo reveló que en Compras DILESA la OC y la requisición no tenían detalle
  abrible (solo fila con acciones) y que el link OC←factura de CxP apuntaba a
  `/{empresa}/ordenes-compra`, ruta inexistente en DILESA. S1 agregó ambos
  drawers (líneas + hilo), soporte `?focus=` en los 6 módulos (hook
  `useFocusDrilldown`) y centralizó los destinos en `hrefDoc` (fix del link).

## Bitácora

- **2026-06-10 — CERRADA (v1 completo, 4 sprints en ~1 día).** S1 hilo del
  gasto (#784) · S2 home del gasto en el proyecto + mudanza de Costeo +
  migración RBAC aplicada y verificada 8/8 permisos (#787) · S3 navegación y
  lenguaje (#788) · S4 bandeja "Te toca" + alta simple de partidas + editar
  OC borrador + crear-y-autorizar (#789). Métricas de éxito del doc:
  cumplidas — gasto del proyecto a 1 click desde el detalle, hilo
  bidireccional en los 6 documentos, gasto sin partida visible (badge),
  flujo narrado en el manual. Barrido de Reminders: limpio. Fuera de v1 por
  decisión: convergencia checklist↔ciclo (fase 2 explícita), plantilla-auto
  (sin alta en UI) y form financiero (ya agrupado).

- **2026-06-09 — Promovida.** Nace del análisis UX de Proyectos ↔ Compras ↔
  CxP (sesión de evaluación): mapeo de 17 superficies / 9 conceptos / ~30
  estados, verificación de que el hilo completo ya existe en FKs, y stress
  test de 8 decisiones de forma. Beto decidió D1 (mover Costeo), D6 (bandeja
  en v1) y la promoción. Estado inicial: `planned`.
- **2026-06-09 — Sprint 4 (bandeja + quick wins) a PR.** `<TeTocaStrip>` en
  los hubs Compras y CxP (6 chips accionables por conteo, gateados por write
  del módulo destino). Alta simple de partidas: 3 campos (clasificación,
  concepto, presupuesto) — los campos legacy (etapa texto, proveedor, gasto
  real, previo, fecha) solo en edición; pedida por Beto al ver el form de 9
  campos en el preview de S2. Editar OC en borrador (form de alta
  pre-poblado; UPDATE cabecera + replace de líneas con guard
  `eq('estado','borrador')`). "Crear y autorizar" en alta de requisición
  (un paso para quien puede autorizar).
- **2026-06-09 — Quick wins descartados en S4 (con razón).** (a) "Plantilla
  auto al crear anteproyecto": no existe alta de anteproyecto en la UI (se
  crean por fuera) — no hay callsite; el botón "Poblar plantilla" del
  checklist es el punto de entrada correcto. (b) "Form de análisis
  financiero agrupado": el componente ya agrupa en secciones con derivados;
  el hallazgo describía el estado pre-rediseño.
- **2026-06-09 — Sprint 3 (navegación y lenguaje) a PR.** Tabs de Compras en
  el orden del flujo (Requisiciones · Cotizaciones · Órdenes · Recepciones;
  URLs sin cambio). "Pedir cotizaciones (RFQ)" desde la requisición
  autorizada (usa `cotizaciones.requisicion_id` + copia líneas + redirige con
  `?focus=`). Label "Promovido" para anteproyecto `completado`. Columna
  "Partida" en CxP facturas DILESA con badge ámbar "Sin partida" (gasto
  invisible al control). Doc del manual
  `content/manual/dilesa/compras/flujo-del-gasto.md` (viaje completo +
  glosario) + "Ver también" en los 4 docs de compras.
- **2026-06-09 — Sprint 2 mergeado (#787) + migración aplicada a prod.**
  Migración `20260609230203` aplicada vía MCP y verificada: módulo
  `dilesa.proyectos.gasto` creado y 8 permisos clonados (paridad exacta con
  los 8 de `dilesa.construccion.costeo`). El tab Gasto es visible para todo
  rol que veía Costeo.
- **2026-06-09 — Sprint 2 (el home) a PR.** Detalle de proyecto con routed
  tabs (`[id]/layout.tsx`: Resumen | Gasto); tab Gasto =
  `<CosteoModule proyectoIdFijo>` (selector/header ocultos, alta de partida
  pre-fijada al proyecto, gate `dilesa.proyectos.gasto`) +
  `<GastoActividad>` (últimos movimientos OC/factura con drill-down).
  Construcción pierde el tab Costeo; su URL queda como aviso de mudanza
  (gate con el slug viejo). Migración `20260609230203` (sub-slug + backfill
  clonando permisos de `dilesa.construccion.costeo`) viaja en el PR — se
  aplica a prod con OK de Beto antes del merge; mientras no esté, el tab
  solo lo ven admins (nadie pierde nada: el aviso de Costeo sigue gateado
  por el slug viejo).
- **2026-06-09 — S2 mínimo coherente: tabs Resumen | Gasto.** Repartir el
  resto del scroll-largo (Unidades/Obras/Checklist como tabs propios) queda
  para decisión de Beto al ver el preview — no se infla S2 con un re-layout
  total no pedido.
- **2026-06-09 — Sprint 1 (el hilo) a PR.** `lib/gasto/hilo.ts` (builder puro
  - fetch, 17 tests) + `<HiloGastoStepper>` montado en los 6 documentos:
    drawers nuevos de OC y Requisición (antes sin detalle), panel de captura de
    RFQ, panel de recepción, drawers de CxP facturas y pagos. `?focus=` con
    `hooks/use-focus-drilldown.ts` en los 6 módulos; `hrefDoc` centraliza
    destinos y corrige el link OC desde CxP en DILESA. `CxpPagosModule` ganó la
    prop `empresa` (slug) para los hrefs. Sin migraciones. PR en revisión con
    Vercel Preview (UI visible → sin auto-merge).
