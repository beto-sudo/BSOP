# Iniciativa — Audit pre-cutover DILESA Coda → BSOP

**Slug:** `dilesa-prelaunch-audit`
**Empresas:** DILESA
**Schemas afectados:** ninguno (audit puro, no toca código en sí)
**Estado:** done
**Próximo hito:** — (cerrada 2026-06-08)
**Dueño:** Beto
**Creada:** 2026-05-26
**Última actualización:** 2026-06-08 (**cerrada** — audit pre-cutover consumido; la ventana ya pasó y el cutover de DILESA ocurrió)

## Problema

El sábado **2026-05-31** se pausa Coda como source-of-truth de DILESA y
el lunes **2026-06-02** el staff opera 100% en BSOP. Antes de ese
cutover quiero saber, sin endulzar nada, qué tan listos estamos:
estructura, contenido, estandarización, gaps. Lo que detectemos esta
semana se mete antes del viernes 29-may; lo demás queda como backlog
post-cutover documentado.

## Outcome esperado

1. Inventario consolidado de DILESA en BSOP (UI + DB + iniciativas).
2. Lista priorizada de gaps con clasificación P0/P1/P2.
3. Plan accionable día-por-día mié → dom con tareas concretas.
4. Riesgos sin mitigación explícitos para que Beto decida con datos.

## Audit realizado (snapshot 2026-05-26)

### UI

- **40 pages** en `app/dilesa/*` totalizando **10,814 LOC**.
- **13 componentes** en [`components/dilesa/`](../../components/dilesa/) con propósito claro
  (módulos hub + módulos lista + 2 detalles full-page).
- **28 entries** de DILESA en
  [`lib/permissions.ts:ROUTE_TO_MODULE`](../../lib/permissions.ts) —
  RBAC granular (ADR-030 sub-slugs) implementado correctamente.
- **Hubs operativos** con routed tabs (ADR-005):
  - `/dilesa/ventas` (5 tabs: lista, inventario, fases, clientes, vendedores)
  - `/dilesa/proyectos` (2 tabs: activos, anteproyectos)
  - `/dilesa/construccion` (5 tabs: obras, contratos, contratistas, prototipos, estimaciones)
- **Shells canónicos** (delegan en módulos shared cross-empresa):
  - `/dilesa/admin/{tasks,juntas,documentos}` → módulos compartidos
  - `/dilesa/rh/{personal,puestos,departamentos}` → módulos shared
  - `/dilesa/proveedores` → módulo shared
- **Forms críticos** ya migrados:
  - [`app/dilesa/ventas/nueva/page.tsx`](../../app/dilesa/ventas/nueva/page.tsx) — 1,296 LOC (Sprint 7c-2 fase 1 KYC)
  - [`app/dilesa/construccion/contratos/nuevo/page.tsx`](../../app/dilesa/construccion/contratos/nuevo/page.tsx) — 912 LOC
  - [`app/dilesa/construccion/estimaciones/nueva/page.tsx`](../../app/dilesa/construccion/estimaciones/nueva/page.tsx) — 515 LOC

### DB

- **46 tablas** en schema `dilesa` con RLS habilitado y políticas activas
  (`fn_has_empresa` + `fn_is_admin` patrón canónico).
- **8 vistas** incluyendo `v_proyecto_avances`, `v_proyecto_avances_estricto`,
  `v_construccion_tareas_terminadas_con_mo`, `v_estimaciones_resumen`.
- **9+ RPCs/funciones**, incluyendo `fn_proyecto_promote_anteproyecto`
  (8 pasos transaccionales) y dos backfill idempotentes de estimaciones.
- **65+ migraciones** los últimos 30 días, surge final 2026-05-21 → 2026-05-27.
- **Schema v2** (ADR-009/010 taxonomía Activo/Proyecto/Producto/Unidad)
  vivo desde 2026-05-21; v1 dropeada (PR #482).
- **Contenido importado** (según bitácoras de iniciativas):
  - 1,425 ventas + 1,300 clientes + 11,878 adjuntos (dilesa-portafolio-activos)
  - 188 estimaciones históricas (dilesa-estimaciones)
  - 5 anteproyectos + 8 desarrollos (dilesa-proyectos-anteproyectos)
  - ~1,372 obras + ~3,824 tareas construcción (dilesa-construccion)
  - 23 contratistas (cross-linked vía `erp.personas` + `dilesa.contratistas_datos`)
  - 247 activos en portafolio

### Estandarización vs ADRs canónicos

| ADR     | Tema                               | Cumplimiento DILESA                                              |
| ------- | ---------------------------------- | ---------------------------------------------------------------- |
| ADR-004 | `ModuleKpiStrip` cap 5             | ✓ Cumple en todos los hubs                                       |
| ADR-005 | Routed module tabs                 | ✓ Cumple                                                         |
| ADR-010 | DataTable primitives               | ✓ Cumple                                                         |
| ADR-014 | Sidebar sections                   | ✓ Cumple                                                         |
| ADR-016 | Forms-pattern `<Form>` + zod + RHF | ✓ Forms grandes lo aplican                                       |
| ADR-017 | Badge tones                        | ✓ Cumple                                                         |
| ADR-018 | DetailDrawer anatomy               | ✓ Cumple (donde aplica)                                          |
| ADR-019 | `@responsive` JSDoc                | ✓ Cumple (40/40 pages)                                           |
| ADR-020 | a11y baseline                      | ✓ Heredado de componentes shared                                 |
| ADR-021 | `useTriggerPrint`                  | ✗ **No usado** (no hay impresión en DILESA todavía)              |
| ADR-022 | `<FileAttachments>`                | ⚠ **No usado** (forms de venta usan patrón custom para adjuntos) |
| ADR-023 | `<ActivityLog>`                    | ✗ **No usado** (no hay timeline visible en ventas/proyectos)     |
| ADR-024 | Access-denied UX                   | ✓ Implícito vía RequireAccess                                    |
| ADR-025 | wizard-pattern                     | ✓ N/A (no hay wizards multi-step en DILESA)                      |
| ADR-026 | DetailDrawer DD7-DD11              | ✓ Cumple                                                         |
| ADR-030 | Sub-slugs RBAC granular            | ✓ Cumple (28 sub-slugs)                                          |
| ADR-034 | KPIs reactivos a filtros           | ✓ Cumple (KPI1-KPI7)                                             |

### Iniciativas DILESA activas/recientes

| Slug                             | Estado      | Bloquea cutover?              | Observación                                                                                                                                                         |
| -------------------------------- | ----------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dilesa-estimaciones`            | done        | NO — espera cutover operativo | Cutover programado sáb 31-may pausar Coda → dom 1-jun smoke E2E → lun 2-jun staff usa BSOP                                                                          |
| `dilesa-proyectos-anteproyectos` | done        | NO                            | Sprint 4 mergeado 2026-05-26, RPC live                                                                                                                              |
| `dilesa-tablas-filtros-columnas` | done        | NO                            | Sprint 1+2 mergeados                                                                                                                                                |
| `dilesa-construccion`            | in_progress | **POSIBLEMENTE**              | Sprints 1-4 mergeados. Sprint 5 = verificación E2E del trigger 20% → disponible, sin DDL nuevo. Es testing, no implementación.                                      |
| `dilesa-portafolio-activos`      | in_progress | NO                            | Sprint 7c-2 mergeado 2026-05-26. 7c-3 a 7c-5 pendientes (15 fases captura restantes). Operativo, no técnico — operadores pueden capturar lo que falta post-cutover. |
| `dilesa-ruv`                     | proposed    | NO                            | 1,557 rows en Coda. Decisión Beto: arrancar post-cutover (junio).                                                                                                   |

## Gaps detectados

### P0 — Validar pre-cutover (mié 27 → vie 29)

1. **Sprint 5 construcción no verificado E2E.** El trigger
   `BEFORE UPDATE dilesa.construccion SET avance >= 20%` que setea
   `unidades.estado='en_construccion'` + `producto_id` está deployed
   pero no se ha validado end-to-end con caso real. Sin esa
   verificación, el bug del prototipo en form de venta nueva podría
   re-aparecer.
   - **Acción:** smoke en preview, ejecutar manualmente "registrar
     tarea terminada" hasta avance 18→22 en una unidad real, verificar
     que dropdown del form de venta nueva muestra el prototipo.
2. **Paridad row counts Coda vs BSOP no validada en bulk.** Los counts
   reportados en bitácoras son del momento de carga. Falta correr
   un script que compare en vivo (último delta puede haber drift).
   - **Acción:** correr [`scripts/dilesa_validate_rowcounts.ts`](../../scripts/dilesa_validate_rowcounts.ts)
     si existe, o crear uno simple si no. Reportar diferencias por
     tabla.
3. **File-attachments en forms de venta usa patrón custom.** Los
   forms `/ventas/nueva` y `/ventas/[id]` capturan adjuntos pero NO
   usan el primitivo `<FileAttachments>` (ADR-022). Confirmar que
   el patrón actual no tiene bugs antes del cutover (ej. paths
   correctos, permisos, RLS).
   - **Acción:** smoke manual: subir un PDF de venta en preview con
     login operador real, verificar que se guarda y se ve.

### P1 — Calidad pre-cutover (viernes 29)

4. **Smoke completo con login real por persona.** Hoy ningún operador
   ha hecho un día completo de captura en BSOP. Beto/Ale/Michelle
   (admin) bypassean RLS y no verían bugs visibles solo a no-admins.
   - **Acción:** sesión de pruebas con Pablo HM o quien vaya a operar
     ventas, capturando 1 venta completa de prueba en preview con
     login real (no admin).
5. **Email de sync diario con paridad Coda.** Sprint 6 de estimaciones
   agregó columna Coda con flag verde/rojo. Hay que validar que se
   mande y se vea bien al menos 1 vez antes del sáb.
   - **Acción:** correr cron manualmente jue 28-may en preview,
     verificar email llega y la flag de paridad funciona.
6. **Backup completo de Coda doc antes del freeze.** Sin esto, si algo
   sale mal el lun no hay rollback.
   - **Acción:** Beto exporta el doc completo de Coda DILESA como JSON
     - screenshot de cada vista crítica (`/backups/coda-dilesa-20260530.json`).

### P2 — Post-cutover (junio)

7. **`dilesa-ruv` no migrado.** 1,557 rows en Coda. Una persona
   dedicada opera. Decisión Beto: arrancar Sprint 0 post-cutover.
   - **Acción:** mantener Coda DILESA en read-only post-cutover
     ÚNICAMENTE para que la operadora de RUV consulte historial
     hasta que módulo BSOP esté listo.
8. **Sprints 7c-3 a 7c-5 portafolio (15 fases restantes captura).**
   No bloquea cutover porque los operadores pueden capturar lo que
   ya está implementado (Fase 1 KYC) y el resto se difiere.
   - **Acción:** mantener iniciativa `dilesa-portafolio-activos`
     in_progress, retomar Sprint 7c-3 lun 2-jun.
9. **ADR-021 print, ADR-022 file-attachments, ADR-023 activity-log
   no adoptados en DILESA.** Cuando lleguen requerimientos (imprimir
   contrato de venta, adjuntos canónicos, timeline de cambios en
   proyecto), aplicar los patrones existentes en lugar de inventar.
   - **Acción:** ninguna pre-cutover; documentar como deuda técnica
     post-cutover.

## Plan accionable mié → dom

### Miércoles 27-may

- [ ] **AM — Audit visual completo en preview** con cada hub DILESA
      abierto en pantalla. Logear como admin primero, luego como rol
      operador. 60 min.
- [ ] **AM — Correr smoke Sprint 5 construcción**: ejecutar tareas
      hasta cruzar 20% en una unidad real (no admin), verificar trigger
      y verificar dropdown en `/ventas/nueva`. 30 min.
- [ ] **PM — Paridad row counts**. Script que cuente filas por tabla
      DILESA y compare con conteo Coda (Beto exporta CSV de Coda). 60 min.
- [ ] **PM — Decisión Beto:** ¿arrancamos Sprint 7c-3 ventas esta
      semana o esperamos a post-cutover? Default: esperar.

### Jueves 28-may

- [ ] **AM — Smoke con operador real** (Pablo HM o quien aplique):
      capturar 1 venta completa en preview, validar adjuntos, validar
      KPIs reactivos. 90 min.
- [ ] **AM — Cron de sync con paridad email**: correr manualmente
      en preview, verificar email llega bien, columna Coda con flag
      verde si row counts match.
- [ ] **PM — Cerrar formal Sprint 5 construcción** si smoke verde.
      Mover `dilesa-construccion` a `done` en INITIATIVES.md.
- [ ] **PM — Status check 16h:** Beto valida todo lo que se hizo
      mié+jue. Decisión go/no-go para freeze del sábado.

### Viernes 29-may

- [ ] **AM — Comunicación a staff DILESA**: aviso oficial "esta es la
      última semana en Coda, sábado se pausa". Mensaje WhatsApp + email.
      Beto autoriza el texto.
- [ ] **AM — Backup completo Coda DILESA** a JSON +
      screenshots de vistas críticas. Repo en `/backups/coda-dilesa-20260529.json`.
- [ ] **PM — Día de soltarse**: nada estructural nuevo, fix-on-fly
      si aparece bug del smoke.
- [ ] **PM — Pre-cutover checklist**: confirmar último cron corrió
      bien, paridad sigue verde, sin tickets abiertos críticos.

### Sábado 30-may

- [ ] **AM** — Beto pone Coda DILESA en modo lectura (todos los
      permisos de edit revocados, solo lectura). Aviso final al staff.
- [ ] **PM** — Ningún cambio en BSOP. Día de observación.

### Domingo 31-may (cutover oficial)

- [ ] **AM** — Cron corre por última vez con Coda como fuente.
      Validar email diario sin drift.
- [ ] **PM** — Smoke E2E final: 1 venta de prueba + 1 tarea de
      construcción + 1 estimación, todo en BSOP. Sin tocar Coda.

### Lunes 1-jun

- [ ] **AM** — Staff arranca en BSOP. Equipo (Claude Code + Beto)
      en standby para incidencias durante 2-3 horas.
- [ ] **PM** — Retrospectiva corta: qué funcionó, qué falla detectada,
      qué se ajusta antes de cerrar la semana.

## Riesgos sin mitigación al cutover

1. **Bug del prototipo re-emerge** si el trigger 20%→disponible no se
   verifica E2E. Mitigación: smoke jueves.
2. **File-attachments en venta capture rompe en producción** porque
   patrón custom no se probó al 100%. Mitigación: smoke con operador
   real jueves.
3. **Operadora de RUV pierde acceso** a 1,557 rows si Coda se pone
   read-only mal. Mitigación: confirmar con ella el viernes que sigue
   consultando Coda en read mode.
4. **Row counts no match** entre Coda y BSOP en cutover. Mitigación:
   validación bulk miércoles + jueves.
5. **Drift entre datos capturados en Coda vie 29 → cutover sáb 30**.
   Mitigación: último cron de sync corre temprano sábado, antes del
   freeze de Coda.

## Fuera de alcance

- Implementar ADR-021/022/023 en DILESA (post-cutover, junio).
- Sprint 0 deep-dive de `dilesa-ruv` (post-cutover, junio).
- Sprints 7c-3 a 7c-5 de captura por fase (post-cutover, junio).
- Refactor de god components (`construccion-module.tsx` 599 LOC,
  `proyecto-detalle.tsx` 614 LOC) — todavía manejables.

## Métricas de éxito

- **Lun 2-jun 14:00 CST:** ≥1 venta completa capturada en BSOP por
  operador (no admin) sin necesidad de hotfix.
- **Lun 2-jun 18:00 CST:** ≥1 tarea de construcción registrada en BSOP
  por gerente sin necesidad de hotfix.
- **Mié 4-jun 12:00 CST:** ≥3 días sin incidencias críticas reportadas.
- **Cero rollbacks** a Coda como source-of-truth post-cutover.

## Decisiones registradas

(append-only)

- **2026-05-26** — Audit realizado en sesión nocturna autónoma de
  Claude Code. Beto leerá el reporte en la mañana del 27-may y
  ajustará prioridades.

## Bitácora

(append-only)

- **2026-06-08 (cierre de la iniciativa)** — Audit puro (0 schemas) que sirvió su propósito: snapshot del 2026-05-26 para la ventana pre-cutover del 31-may. Esa ventana ya pasó y el cutover de DILESA (Coda → BSOP) se completó. El propio header pedía cerrarlo. Si se necesita un nuevo pre-cutover (p.ej. otra empresa), se abre una iniciativa fresca reusando el formato. Cerrada por instrucción de Beto tras auditoría de estado real (el header estaba stale respecto al trabajo ya en prod).

- **2026-05-26** — Iniciativa creada como audit pre-cutover. Análisis
  paralelo de 3 agentes Explore (UI / DB / iniciativas) + validación
  cruzada por mí mismo. Hallazgos calibrados contra planning docs y
  `INITIATIVES.md` (varios reportes de agentes tenían imprecisiones:
  Agent A confundió shells canónicos con stubs; Agent B reportó
  "287 ventas" cuando son 1,425; ambos confirmados via grep directo).
  Documento queda como `proposed` esperando que Beto decida si lo
  promueve a `planned` con cambios o lo cancela.
