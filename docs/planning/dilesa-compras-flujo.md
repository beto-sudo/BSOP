# Iniciativa — Flujo de compras gobernado (candado en la adjudicación + avisos) DILESA

**Slug:** `dilesa-compras-flujo`
**Empresas:** DILESA (golden; el patrón candado + avisos es replicable a las otras empresas cuando su P2P exista)
**Schemas afectados:** principalmente UI (`components/compras/*`, `components/gasto/te-toca-strip.tsx`, `app/api/cron/daily-task-summary`, `lib/task-summary-email`). Lectura de `erp` (cotizaciones/requisiciones/órdenes/partidas para el correo y los conteos) y `core` (gating de Dirección vía `usuarios_empresas`+`roles`; resolución de destinatarios del correo). **Sin cambios de modelo en Sprints 1-2.** Sprint 3 (opcional, con `blindaje-financiero`) agrega RPC de adjudicación/emisión con `audit_log`.
**Estado:** in_progress
**Próximo hito:** Sprint 2 (sección "Compras por autorizar" + "Tus solicitudes" en el correo diario) en revisión de Beto (preview enviado); luego Sprint 3 (blindaje server-side del candado, con `blindaje-financiero`)
**Dueño:** Beto
**Creada:** 2026-06-22
**Última actualización:** 2026-06-22 (S1 mergeado #986; S2 construido y en revisión)

## Problema

El ciclo P2P de DILESA está completo (`dilesa-compras`, `dilesa-flujo-gasto`,
cerradas), pero el **gobierno del flujo está suelto** y los pendientes no se
atienden a tiempo. Hallazgos verificados en código (2026-06-22):

- **La autorización casi no significa nada.** Autorizar la requisición es un
  `UPDATE autorizada_at = now()` que hace cualquiera con acceso de escritura al
  módulo ([`requisiciones-module.tsx:476`](../../components/compras/requisiciones-module.tsx)); no hay rol Dirección
  ni segregación, y "Generar OC" autoriza la requisición de pasada
  ([`:588`](../../components/compras/requisiciones-module.tsx)).
- **Se cotiza y se ordena sin autorización previa.** "Pedir cotizaciones" no
  valida que la requisición esté autorizada ([`:609`](../../components/compras/requisiciones-module.tsx)); el orden depende de
  que la gente lo haga bien, no de una regla.
- **La adjudicación crea la OC automática** (correcto), pero nace en `borrador`
  y exige un segundo paso de autorización — ceremonia que sobra.
- **Los pendientes no buscan a nadie.** La bandeja "Te toca"
  ([`te-toca-strip.tsx`](../../components/gasto/te-toca-strip.tsx)) es 100% pasiva: solo aparece si entras a
  `/dilesa/compras`, se carga una vez, y reparte por rol (no por persona). No
  hay correo ni alerta; la campana del header está sin implementar. Si Dirección
  no entra, las cosas se quedan en el limbo (dolor reportado por Beto).

## Outcome

Que el flujo de compras tenga **un solo candado claro, donde se compromete el
dinero, y que los pendientes lleguen solos a quien los resuelve.**

1. **Candado único en la adjudicación**, solo Dirección/admin: solicitar y
   cotizar quedan abiertos a las gerencias; nada se vuelve OC (compromiso real)
   sin el visto bueno de Dirección.
2. **Adjudicar = autorizar = emitir** en un acto: la OC nace emitida, sin doble
   paso.
3. **Rechazar/cancelar** saca de pendientes lo que ya no procede.
4. **Aviso diario a Dirección** (sección dentro del correo de tareas) con lo que
   espera su autorización: quién solicita, concepto, monto, partida y días desde
   la solicitud; y el solicitante ve el estado de las suyas.

## Decisiones registradas

> Cerradas con Beto el 2026-06-22 en la sesión de análisis del flujo.

- **D1 — El candado vive en la adjudicación de la cotización, no en la
  requisición.** Solo **Dirección/admin** adjudica. Solicitar (requisición) y
  cotizar (RFQ) quedan abiertos a las gerencias. Razón: el control debe estar
  donde se compromete el dinero; lo anterior es preparación.
- **D2 — Adjudicar emite la OC en un solo acto.** La OC adjudicada nace
  `enviada` (no `borrador`) y compromete el presupuesto en ese momento; se
  elimina el doble paso adjudicar → re-autorizar.
- **D3 — Compra directa sin cotización = excepción, mismo candado.** Se permite
  generar OC directa desde la requisición (proveedor único / urgencia), pero
  solo Dirección/admin la emite. No se fuerza una RFQ de un solo proveedor.
- **D4 — Se elimina "autorizar requisición".** Cualquiera (gerencias) requisita
  y pide cotizaciones sin gate; desaparece el estado/paso de autorización de la
  requisición.
- **D5 — Rechazar/cancelar con motivo** en requisición y cotización las saca de
  pendientes. Visible para el **solicitante** (la suya) y **Dirección**
  (cualquiera). Reusa `CancelarConMotivoDialog` (ya existe en ambos módulos).
- **D6 — Aviso diario dentro del correo de tareas.** Sección "Compras por
  autorizar" para Dirección/admin (solicitante · concepto · monto · partida ·
  días desde la solicitud, ordenada por antigüedad) **y** sección "Tus
  solicitudes" para el solicitante (estado de las suyas). Dirección recibe el
  correo aunque no tenga tareas (hoy solo se envía a quien tiene tareas).
- **D7 — Sin umbral de monto.** Dirección autoriza todas, por pequeñas que
  sean.

## Alcance v1

**Entra:**

- Reordenar el flujo en UI: gate de adjudicación + emisión de OC a Dirección/
  admin; OC emitida en un acto; quitar "autorizar requisición"; compra directa
  como excepción gateada.
- Ajuste de la bandeja "Te toca": chip de Dirección = "cotizaciones por
  adjudicar" (+ "OC directas por emitir" si aplica); fuera "requisiciones por
  autorizar".
- Rechazar/cancelar visible para solicitante (la suya) y Dirección (cualquiera).
- Sección "Compras por autorizar" + "Tus solicitudes" en el correo diario;
  Dirección recibe aunque no tenga tareas.

**Fuera de v1 (backlog):**

- Blindaje server-side del candado (RPC SECURITY DEFINER con audit) — Sprint 3,
  alinea con `blindaje-financiero`; migración la aplica Beto.
- Campana del header / notificación in-app (placeholder hoy).
- Escalamiento configurable por días sin atender (más allá del orden por
  antigüedad en el correo).
- Rollout multi-empresa (depende del P2P de cada empresa).

## Sprints

- **S1 — Reordenar el flujo (UI, sin migración).** Candado de adjudicación +
  emisión de OC a Dirección/admin (D1/D2); compra directa gateada (D3); quitar
  "autorizar requisición" (D4); bandeja "Te toca" ajustada; rechazar/cancelar
  por solicitante+Dirección (D5). Preview-first.
- **S2 — Avisos diarios (correo).** Sección "Compras por autorizar" (a
  Dirección) + "Tus solicitudes" (al solicitante) en el cron de tareas; bucket
  que incluye a Dirección aunque no tenga tareas; builder testeable + log de
  notificación (D6).
- **S3 — Blindaje server-side (opcional, con `blindaje-financiero`).** Mover el
  candado a RPC con gate Dirección + override admin + `core.audit_log`; migración
  aplicada por Beto.

## Riesgos

| Riesgo                                                                               | Mitigación                                                                                                                     |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| El candado vive solo en UI en S1 (un `UPDATE` directo se podría hacer por fuera)     | S1 entrega el flujo correcto y visible; S3 lo blinda en servidor (RPC+audit). Se documenta que S1 no es control duro.          |
| Quitar "autorizar requisición" cambia hábitos y la semántica de los conteos          | Migrar el chip de la bandeja a "por adjudicar" en el mismo PR; nota en el manual; sin tocar enums en DB (D4 es solo UI/flujo). |
| El correo solo llega a quien tiene tareas (Dirección sin tareas no vería pendientes) | S2 arma el bucket por **compras pendientes**, no solo por tareas (D6).                                                         |
| Resolver "quién es Dirección" server-side (cron) sin `EffectiveUser`                 | Query a `core.usuarios_empresas`+`roles` (rol Dirección) ∪ admin; patrón de `lib/permissions`/roles por empresa.               |
| Doble conteo / monto ambiguo de una RFQ por adjudicar (varios proveedores)           | Mostrar el mejor total disponible; si no hay precios, el estimado de la requisición.                                           |

## Métricas de éxito

- Cero OC emitidas sin que la adjudique Dirección/admin (en UI v1; duro en S3).
- Dirección recibe a diario, sin entrar a la app, la lista de lo que espera su
  autorización (con antigüedad).
- Las requisiciones/cotizaciones rechazadas desaparecen de los pendientes.
- El flujo se explica en una pantalla (diagrama del análisis 2026-06-22).

## Bitácora

- **2026-06-22 — Promovida + arranca Sprint 1.** Nace del análisis del flujo de
  compras pedido por Beto: mapeo del ciclo P2P real (costear → solicitar →
  cotizar → adjudicar → recibir → pagar) y de los mecanismos de pendientes (todos
  pasivos). Verificado en código que (a) la autorización de requisición no tiene
  gate de Dirección, (b) se puede cotizar sin autorizar, (c) la adjudicación ya
  crea la OC (en `borrador`), (d) la bandeja "Te toca" es pull-only y la campana
  del header está sin implementar. 7 decisiones cerradas con Beto (D1-D7):
  candado en la adjudicación (solo Dirección), OC emitida en un acto, compra
  directa como excepción gateada, fin de "autorizar requisición", rechazo con
  motivo por solicitante+Dirección, aviso diario en el correo de tareas, sin
  umbral de monto. Plan de 3 sprints (UI → correo → blindaje server-side).
- **2026-06-22 — Sprint 1 construido (UI, sin migración) — preview-first.**
  Candado reordenado en los tres módulos de `components/compras/` + la bandeja
  `components/gasto/te-toca-strip.tsx`: (D1) **adjudicar** solo Dirección/admin
  (`esDireccion = isAdmin || direccionEmpresaIds`), con nota "lo realiza
  Dirección" para quien captura; (D2) la OC adjudicada y la OC directa nacen
  `enviada` + `autorizada_at` (comprometen en el acto), y "marcar enviada" de
  Órdenes queda gateado a Dirección (guard en `cambiarEstado` + visibilidad);
  (D3) "Generar OC" directa desde la requisición solo Dirección; (D4) eliminados
  "Marcar autorizada" (lista + drawer) y "Crear y autorizar" del alta —
  requisitar y pedir cotizaciones siguen abiertos a gerencias. Bandeja: fuera el
  chip "requisiciones por autorizar"; "cotizaciones por adjudicar" y "órdenes
  por emitir" pasan a `direccion: true`. 6 checks locales verdes (typecheck,
  1965 tests, lint 0-err, format, initiatives; schema n/a — sin DB). **Diferido
  a follow-up de S1** (no bloquea): gating de cancelar por solicitante (hoy
  `puedeEscribir`; falta `solicitante_id` en `ReqRow`) y el pulido de
  badge/KPI de requisición ("pendiente" → "abierta", quitar "Autorizadas" que
  ahora queda en 0). Próximo: Sprint 2 (avisos en el correo).
- **2026-06-22 — Sprint 2 construido (avisos en el correo) — preview enviado a
  Beto.** Dos secciones nuevas en el correo diario de tareas (cron
  `daily-task-summary`, 07:00 CST), sin migración: (1) **"Compras por autorizar"**
  para Dirección/admin = cotizaciones listas para adjudicar (≥1 proveedor
  respondió), con solicitante · concepto · monto (mejor total respondido) ·
  partida/proyecto · días desde la solicitud, ordenadas de más vieja a más nueva;
  (2) **"Tus solicitudes en curso"** para el solicitante = sus requisiciones sin
  OC + cotizaciones abiertas/comparadas. Dirección recibe el correo **aunque no
  tenga tareas** (bucket creado por email). Identidad: Dirección = `core.roles`
  ilike 'direcci%n' de DILESA + `usuarios_empresas` activos (espejo de
  `loadDireccionEmpresaIds`), más admins globales (`core.usuarios.rol='admin'`);
  nombre/email desde `core.usuarios`. Arquitectura: helpers puros en
  `lib/compras/avisos.ts` (12 tests) + render en `lib/task-summary-email.ts` +
  fetch/fusión-por-email en el cron. 6 checks verdes (typecheck, 1977 tests, lint
  0-err, format; schema n/a). Preview-first (es correo a personal real): el PR
  queda sin auto-merge; al mergear, las secciones salen en la corrida de la
  mañana siguiente. `TASK_SUMMARY_TEST_TO` permite una prueba dirigida antes.
  Próximo: Sprint 3 (blindaje server-side del candado).
