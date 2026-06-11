# Iniciativa — Presupuesto gobernado: baseline + órdenes de cambio (DILESA)

**Slug:** `dilesa-presupuesto-baseline`
**Empresas:** DILESA (golden; el patrón baseline + órdenes de cambio es replicable a las otras empresas cuando tengan presupuesto por partidas)
**Schemas afectados:** `erp` (nuevas `presupuesto_baselines`, `presupuesto_baseline_partidas`, `presupuesto_cambios`; trigger guard + RPCs sobre `presupuesto_partidas`; escribe `core.audit_log`), `core.modulos` (sin slugs nuevos — reusa `dilesa.proyectos.gasto`), UI en `app/dilesa/proyectos/[id]/gasto` y componentes de Costeo
**Estado:** in_progress
**Próximo hito:** Sprint 2 — UI de baseline y órdenes de cambio
**Dueño:** Beto
**Creada:** 2026-06-10
**Última actualización:** 2026-06-10 (S1 en prod, #798)

## Problema

La tubería del gasto (`dilesa-flujo-gasto`, cerrada 2026-06-10) dejó visible el
ciclo completo, pero **el presupuesto como tal no tiene gobierno**:

- **No existe "presupuesto inicial" como acto formal.** La autorización es
  partida por partida (`autorizado_at`/`autorizado_por`); nunca se congela el
  paquete completo como referencia del proyecto. `presupuesto_previo` y
  `presupuesto_aprobado` son dos columnas editables sin semántica de versión.
- **Editar un monto aprobado es un UPDATE silencioso.** Desde Costeo/Gasto se
  modifica `presupuesto_aprobado` directo: sin concepto de aditiva/deductiva,
  sin motivo, sin autorización y sin rastro — `core.audit_log` solo se escribe
  donde una RPC lo hace (CxC sí; presupuesto no tiene RPC gatekeeper).
  Imposible reconstruir la historia de un monto.
- **Las decisiones no tienen expediente.** Los documentos viven dispersos
  (pasos de tarea, RFQ, factura), pero la partida no admite adjuntos ni
  registra por qué cambió; no hay forma de ligar "subimos esta partida $X"
  con la cotización/minuta que lo amparó.
- **Los gates de autorización son débiles.** `autorizarPartida` confía en RLS
  — y `erp.*` es `USING(true)` (el aislamiento real es capa app);
  `autorizarPaso` gatea por `core.usuarios.rol='admin'`, que excluye al rol
  Dirección legítimo de la empresa (patrón correcto:
  `EffectiveUser.direccionEmpresaIds`).

## Outcome

Que el presupuesto de un proyecto DILESA tenga ciclo de vida gobernado:

1. **Formación libre** (anteproyecto): estimados y cotizaciones evolucionan
   las partidas sin fricción, con su soporte documental colgado de la partida.
2. **Baseline por proyecto**: un acto formal de Dirección congela el
   presupuesto inicial completo (snapshot inmutable). Desde ahí, el monto
   aprobado queda bloqueado a edición directa.
3. **Cambios como documento**: toda aditiva o deductiva es una **orden de
   cambio** con motivo estructurado + adjuntos, autorizada por Dirección vía
   RPC que aplica el delta y escribe `core.audit_log`. El vigente siempre es
   reconstruible: **baseline + Σ cambios autorizados**.
4. **Historia consultable**: en el tab Gasto se ve Original | Cambios |
   Vigente por partida, con drawer de historial (motivo, documentos, quién,
   cuándo) — siempre se sabe a dónde ir a reconstruir cómo y por qué se
   decidió.

## Alcance

### Dentro

- Tablas `erp.presupuesto_baselines` + `erp.presupuesto_baseline_partidas`
  (snapshot inmutable por partida al autorizar el inicial) y
  `erp.presupuesto_cambios` (orden de cambio: tipo aditiva/deductiva, delta,
  categoría de motivo, motivo, estado solicitada→autorizada/rechazada,
  solicitado_por/at, resuelto_por/at).
- RPC `fn_presupuesto_baseline_autorizar` (congela snapshot, gate Dirección,
  audit_log) y RPC `fn_presupuesto_cambio_resolver` (autoriza/rechaza, aplica
  delta a `presupuesto_aprobado`, audit_log).
- **Trigger guard** en `erp.presupuesto_partidas`: bloquea UPDATE directo de
  `presupuesto_aprobado` en proyectos con baseline salvo flag de sesión que
  solo setean las RPCs (enforcement real en DB, no solo capa app).
- Vista de reconciliación (vigente vs baseline + Σ cambios) para detectar
  drift.
- Fix de gates: `autorizarPartida` y `autorizarPaso` pasan al patrón
  Dirección (`EffectiveUser.direccionEmpresaIds`), igual que la resolución de
  órdenes de cambio y el baseline.
- UI en tab Gasto: acción "Autorizar presupuesto inicial" (revisa el paquete;
  exige resolver partidas `preliminar` antes de congelar), columnas
  Original | Cambios (±) | Vigente, form de solicitud de cambio desde la
  partida (tipo, delta, categoría, motivo, adjuntos), drawer de historial por
  partida, bandeja/chip "Cambios por autorizar" para Dirección (extiende
  `<TeTocaStrip>`).
- Adjuntos en partida (`<FileAttachments entidad="presupuesto_partidas">`) —
  el soporte del estimado vive en la partida desde la formación.
- Partida nueva post-baseline: nace con vigente 0 + orden de cambio aditiva
  por su monto (mismo flujo, sin caso especial).
- Baseline retroactivo para proyectos en vuelo: acción explícita de Beto por
  proyecto activo (el estado actual se congela como inicial).
- Doc del manual: "Cómo se autoriza y modifica un presupuesto" (coordina con
  `manual-usuario`).

### Fuera (no-goals duros)

- **No** re-baseline / versiones múltiples de baseline (v1: un baseline por
  proyecto, `UNIQUE(proyecto_id)`; si algún día se requiere, se agrega
  `version`).
- **No** umbrales de autorización por monto/rol (Beto decidió: solo
  Dirección, sin umbral; se puede agregar después si estorba la operación).
- **No** comentarios threaded multi-usuario (Beto decidió: motivo
  estructurado + adjuntos es suficiente).
- **No** tocar el cálculo de comprometido/ejercido/pagado
  (`erp.v_partida_control` sigue intacta; solo cambia el gobierno del
  presupuesto).
- **No** workflow multi-paso de aprobación (`erp.aprobaciones` queda sin uso
  aquí; la orden de cambio es un solo escalón: Dirección).
- **No** rollout multi-empresa.

## Diseño (resumen de decisiones de forma)

- **El vigente vive donde siempre**: `presupuesto_aprobado` sigue siendo el
  monto vigente — `v_partida_control`, el tab Gasto y todo lo existente
  siguen leyendo igual. El baseline es snapshot aparte; el invariante
  `vigente = baseline + Σ cambios autorizados` lo mantienen las RPCs y lo
  verifica la vista de reconciliación.
- **El cambio es un documento, no una edición**: la orden de cambio es el
  registro de la decisión (motivo estructurado + adjuntos + quién/cuándo).
  `core.audit_log` guarda el antes/después del monto (patrón CxC).
- **Enforcement en DB, no solo app**: dado que `erp.*` es `USING(true)`, el
  bloqueo de edición directa post-baseline va con trigger + flag de sesión
  (`set_config`) que solo las RPCs setean.
- **Categorías de motivo** (catálogo corto, CHECK): `alcance`,
  `precio_mercado`, `error_estimacion`, `adjudicacion`, `reasignacion`,
  `otro` — estructura sin burocracia; el texto libre es obligatorio.
- **Gate Dirección server-side**: server action valida
  `EffectiveUser.direccionEmpresaIds` (admin global O rol Dirección en la
  empresa) antes de invocar la RPC; la RPC re-registra el actor en
  audit_log.

## Riesgos

| Riesgo                                                                                             | Mitigación                                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Proyectos en vuelo sin baseline (Delicias, Ampliación ya operan)                                   | Baseline retroactivo explícito por proyecto (Beto autoriza el estado actual como inicial); mientras no exista, la partida se edita como hoy |
| Fricción operativa: todo cambio requiere Dirección                                                 | Form de ~30 segundos + chip en "Te toca" con autorización a 1 click; si estorba, se agrega umbral después (no-goal de v1)                   |
| Trigger guard rompe flujos existentes que tocan `presupuesto_aprobado` (promoción de anteproyecto) | Scope del trigger: solo proyectos CON baseline; la promoción ocurre antes del baseline por definición                                       |
| Migración otorga control financiero (regla de migraciones autónomas)                               | Migración viaja como archivo en el PR; se aplica a prod solo con OK explícito de Beto                                                       |
| Drift vigente ↔ baseline+cambios por escrituras imprevistas                                        | Vista de reconciliación + trigger guard; cualquier diferencia es hallazgo visible, no silencioso                                            |

## Métricas de éxito

- **0 ediciones directas posibles** de `presupuesto_aprobado` post-baseline
  (trigger lo rechaza; solo RPCs con orden de cambio autorizada).
- **Todo cambio reconstruible**: cada delta con motivo + categoría + autor +
  autorizador + timestamp + adjuntos, visible en ≤2 clicks desde el tab
  Gasto.
- **Vigente = baseline + Σ cambios autorizados** verificado por la vista de
  reconciliación (0 filas con drift).
- El presupuesto original de cualquier proyecto consultable siempre (columna
  Original en el tab Gasto).

## Sprints

- **S1 — Gobierno duro del monto** (DB): tablas baseline/cambios + trigger
  guard + RPCs con audit_log + vista de reconciliación + fix de gates
  Dirección (`autorizarPartida`, `autorizarPaso`). Migración como archivo;
  aplica Beto o con su OK.
- **S2 — UI de baseline y órdenes de cambio**: "Autorizar presupuesto
  inicial", columnas Original | Cambios | Vigente, form de solicitud,
  resolución por Dirección (bandeja + chip "Te toca"), drawer de historial
  por partida.
- **S3 — Expediente y cierre**: adjuntos en partida, timeline del presupuesto
  en el tab Gasto, baseline retroactivo de proyectos activos (con Beto), doc
  del manual.

## Decisiones registradas

- **2026-06-10 — Baseline por proyecto completo (D1).** Un acto formal
  congela todo el paquete; da sentido a "incremento" vs "presupuesto
  inicial". La autorización partida-por-partida queda solo como paso de
  formación. Decidido por Beto.
- **2026-06-10 — Solo Dirección autoriza cambios (D2).** Sin umbrales por
  monto en v1. Decidido por Beto.
- **2026-06-10 — Las deductivas también requieren autorización (D3).** Una
  deductiva mal hecha esconde sobrecostos reasignando; mismo flujo que
  aditivas. Decidido por Beto.
- **2026-06-10 — Motivo estructurado + adjuntos, sin threads (D4).** La orden
  de cambio ES el comentario: categoría + texto obligatorio + documentos.
  Decidido por Beto.
- **2026-06-10 — `presupuesto_aprobado` sigue siendo el vigente (D5).** No se
  introduce columna nueva de "monto vigente": todo lo construido
  (`v_partida_control`, tab Gasto) sigue leyendo igual; el baseline es
  snapshot aparte y el invariante lo garantizan RPCs + trigger +
  reconciliación.
- **2026-06-10 — Enforcement con trigger + flag de sesión (D6).** Con
  `erp.*` en `USING(true)`, un gate solo-app es bypasseable; el trigger
  rechaza UPDATE directo post-baseline salvo `set_config` de las RPCs.

## Bitácora

- **2026-06-10 — S2 mergeado (#803, en prod) + S3/manual a PR.** S2 entregó
  además la edición de partida inline bajo el renglón (feedback de Beto en
  el preview) y 19 tests de las actions (coverage CI). Manual:
  `content/manual/dilesa/proyectos/gasto.md` ("Presupuesto del proyecto:
  autorizarlo y modificarlo" — formación, autorizar inicial, órdenes de
  cambio, historial, FAQ; slug 1:1 con `dilesa.proyectos.gasto`) +
  cross-link desde "El viaje de una compra". Pendiente de S3: adjuntos en
  partida, timeline en tab Gasto, baseline retroactivo con Beto.

- **2026-06-10 — S1 mergeado (#798) + migración `20260610212116` aplicada a
  prod y verificada.** Objetos confirmados (3 tablas, 2 triggers, 5
  funciones, vista); guard probado en vivo (edición pre-baseline pasa;
  orden de cambio sin baseline rechazada con el mensaje del guard);
  historial de migraciones alineado a la versión del archivo. SCHEMA_REF +
  types regenerados en el mismo PR. Cero cambio operativo hasta autorizar
  el primer baseline.

- **2026-06-10 — Sprint 1 (gobierno duro del monto) a PR.** Migración
  `20260610212116_erp_presupuesto_baseline_cambios.sql` (NO aplicada a
  prod — espera OK de Beto): 3 tablas (baselines sin grants de
  escritura — inmutables por construcción; cambios con resolución
  solo-RPC), trigger guard sobre `presupuesto_partidas` (INSERT con
  monto, UPDATE de `presupuesto_aprobado`, soft-delete con vigente ≠ 0 y
  cambio de proyecto — todo bloqueado post-baseline salvo flag de sesión
  de las RPCs), `erp.fn_es_direccion` (espejo SQL del gate app), RPCs
  `fn_presupuesto_baseline_autorizar` / `fn_presupuesto_cambio_resolver`
  con `core.audit_log` (patrón CxC), y vista
  `erp.v_presupuesto_reconciliacion`. En app: helper
  `lib/auth/direccion-gate.ts` (`checkDireccionEmpresa`, 8 tests) y fix
  de gates — `autorizarPartida` (antes sin gate) y `autorizarPaso`
  (antes solo `rol='admin'`) ahora exigen Dirección;
  `promoteAnteproyecto` refactorizado al helper (−50 líneas duplicadas).
- **2026-06-10 — Promovida (estado inicial: `planned`).** Nace de la sesión
  de evaluación del proceso de control del gasto (post-cierre de
  `dilesa-flujo-gasto`): mapeo DB + UI confirmó que el presupuesto no tiene
  baseline formal, que editar un monto aprobado es un UPDATE sin rastro
  (audit_log no cubre presupuesto), que las partidas no admiten adjuntos y
  que los gates de autorización no restringen realmente a Dirección. Beto
  decidió D1–D4 y la promoción con alcance cerrado.
