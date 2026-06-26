# Iniciativa — Destajos semanales (estimaciones de vivienda) → CxP (DILESA)

**Slug:** `dilesa-estimaciones-cxp`
**Empresas:** DILESA
**Schemas afectados:** `erp` (`facturas.estimacion_id` nuevo + índice único activo; nuevas RPCs `cxp_factura_desde_estimacion_destajo`, `cxp_factura_recibir_cfdi`; trigger de sync factura→estimación), `dilesa` (`estimaciones`: guard de gobierno + RPC `estimacion_destajo_autorizar`), UI en `app/dilesa/construccion/estimaciones/**`, `components/cxp/**` y `app/api/[empresa]/cxp/facturas/upload-xml`
**Estado:** in_progress
**Próximo hito:** v1 **en prod** (migraciones aplicadas + #1043 mergeado 2026-06-26). Falta: smoke test con un XML real (aprobar destajo → subir XML en CxP → programar/pagar → ver `pagada` derivado) + pulido opcional (KPIs/manual del módulo de estimaciones; decidir backfill de `facturada` históricas si las hubiera).
**Dueño:** Beto
**Creada:** 2026-06-25
**Última actualización:** 2026-06-26

> **Origen:** decisión **D3** de `dilesa-contratos-estimaciones` (cerrada 2026-06-10),
> que dejó explícitamente registrada esta integración como "iniciativa futura al
> terminar aquella". Beto la promovió el 2026-06-25 tras revisar el flujo actual
> de "Marcar factura recibida" dentro del módulo de construcción.

## Problema

Las **estimaciones de destajo semanal** (pago a contratistas por tareas
terminadas de vivienda — `dilesa.estimaciones`, ciclo
`borrador → aprobada → facturada → pagada`) cierran **todo** su ciclo dentro
del módulo de construcción, con UPDATEs a mano en el detalle:

- "Marcar factura recibida" pide **folio + URL + fecha** tecleados a mano.
- "Marcar pagada" pide **referencia + fecha** tecleados a mano.

Esto obliga a **administración** a meterse al módulo de construcción para
registrar facturas y pagos —responsabilidad que es de **Cuentas por Pagar**—
y captura el folio/link en vez de simplemente **subir el XML del CFDI**.

En contraste, las estimaciones de **obra** (contratos no-vivienda,
`dilesa.obra_estimaciones`) ya hacen lo correcto: al autorizarse generan una
factura de egreso en CxP (`cxp_factura_desde_estimacion`), administración la
procesa en el módulo CxP, y un trigger sincroniza el estado de vuelta. CxP ya
tiene **ingesta determinista de XML CFDI** (`lib/cxp/cfdi-parser.ts` +
`POST /api/[empresa]/cxp/facturas/upload-xml`). El puente solo falta para
destajo.

## Outcome

1. **Construcción solo aprueba el devengo.** Al "Aprobar" una estimación de
   destajo (lo que hoy es `borrador → aprobada`), se crea automáticamente una
   **factura en espera** en CxP, ligada a la estimación, con el contratista,
   el monto neto y el desglose de obras/contratos que abona. Suma al
   _Pendiente por pagar $_ desde ese momento (devengo al autorizar).
2. **Administración trabaja en CxP.** En una bandeja "Facturas en espera" ve
   la fila del contratista y **sube el XML** del CFDI. El parser valida el RFC
   del emisor vs el contratista y que el monto cuadre, llena folio fiscal +
   montos + XML, y la promueve a `por_pagar`. **Cero captura de folio/link.**
3. **El pago sigue el ciclo CxP normal**: programar → aprobar (admin/Dirección)
   → pagar (genera movimiento bancario). Un trigger sincroniza la estimación
   de destajo a `facturada`/`pagada` — **derivado**, no capturado.
4. **En construcción desaparecen** "Marcar factura recibida" y "Marcar
   pagada"; quedan un estado read-only + "Ver en CxP →".

## Alcance

### Dentro

- **Modelo + devengo (S1):**
  - `erp.facturas.estimacion_id` (FK → `dilesa.estimaciones`), espejo de
    `obra_estimacion_id`; índice único parcial (1 factura activa por
    estimación, re-emitible si se cancela).
  - RPC `dilesa.estimacion_destajo_autorizar` — `borrador → aprobada` con gate
    de miembro de la empresa (la "gerencia/residencia de obra" = quien opera
    construcción; el candado financiero vive en la aprobación del pago en CxP)
    - override de admin + `core.audit_log`. Llama a
      `erp.cxp_factura_desde_estimacion_destajo`.
  - RPC `erp.cxp_factura_desde_estimacion_destajo` — nace la factura **en
    espera** (`estado_cxp='borrador'`, sin `uuid_sat`) por el **monto neto**,
    ligada a la estimación, proveedor = contratista.
  - Guard trigger en `dilesa.estimaciones` (flag `app.estimacion_destajo_gate`):
    el estado solo se mueve por las RPCs y el sync (no por UPDATE crudo).
  - Backfill: las estimaciones hoy en `aprobada` sin pagar generan su factura
    en espera al aplicar (aparecen en CxP desde el día uno). Las pagadas
    históricas se quedan como están.
- **Recepción del XML (S2):**
  - Bandeja "Facturas en espera" en CxP (facturas `borrador` con
    `estimacion_id`): contratista · obras/contratos · monto · link a la
    estimación.
  - Extender `upload-xml` para aceptar un `factura_id` destino: valida RFC
    emisor = contratista, dedup `uuid_sat`, cuadra el monto (tolerancia +
    warning), llena los montos fiscales + XML y promueve a `por_pagar`
    (RPC `erp.cxp_factura_recibir_cfdi`).
  - Trigger de sync `erp.facturas` → `dilesa.estimaciones`: `uuid_sat` puesto
    → `facturada`; `estado_cxp='pagada'` → `pagada` (+ reversa).
- **Invertir la UI (S3):**
  - Quitar "Marcar factura recibida" y "Marcar pagada" del detalle de
    estimación; `facturada`/`pagada` read-only derivados + chip "Ver en CxP →".
  - Ajustar KPIs del módulo de estimaciones + manual.

### Fuera (no-goals duros)

- **No** modelar fondo de garantía / retención liberable: el contratista
  factura el **neto** (decisión de Beto 2026-06-25) — la CxP nace por el neto,
  se paga el neto, no hay nada que liberar después.
- **No** re-modelar `dilesa.estimaciones` (tareas/tarifas) ni el cálculo de
  bruto/retención/neto.
- **No** tocar el puente de obra (`obra_estimaciones`) ni `v_partida_control`.
- **No** rollout multi-empresa (DILESA es la única con destajo hoy).

## Diseño (decisiones de forma)

- **Devengo al autorizar (D2 de Beto).** La factura en espera nace al
  "Aprobar" la estimación — el pasivo es visible desde el miércoles aunque el
  XML llegue días después. Es el devengo contablemente correcto.
- **La factura nace en `borrador` (esperando XML)**, no en `por_pagar`. La
  promueve a `por_pagar` la subida del XML (`cxp_factura_recibir_cfdi`). Esto
  refina el patrón de obra (que nace `por_pagar`) para que **subir el XML sea
  la acción que la habilita**. El trigger de recálculo de saldo ya preserva
  `borrador` cuando no hay pagos (hotfix 2026-06-11), así que es seguro.
- **Autoriza quien opera construcción; paga quien controla CxP (D3 de Beto).**
  El gate de `estimacion_destajo_autorizar` es membresía de empresa (la página
  ya filtra por RBAC del módulo); el candado fuerte (admin/Dirección) está en
  `cxp_pago_aprobar`, intacto.
- **Match por el neto.** El monto de la estimación es mano de obra **sin IVA**;
  el CFDI del contratista puede traer IVA por encima. El match valida contra el
  total del CFDI con tolerancia y **avisa** si no cuadra (no bloquea — admin
  decide), tomando el total real del CFDI como autoritativo de la factura.
- **Migraciones robustas a Preview** (JOIN a `core.empresas` + NOT EXISTS, sin
  asumir datos de prod) y **como archivo** — tocan finanzas, las aplica Beto.

## Riesgos

| Riesgo                                                                                    | Mitigación                                                                                                                        |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| El XML del contratista no cuadra con el neto autorizado (IVA, error de captura)           | El match avisa con ambos montos (esperado vs CFDI) y deja al admin decidir; el total real del CFDI gobierna la factura            |
| Doble vía de transición (UPDATE crudo histórico vs RPC) deja estados inconsistentes       | Guard trigger en `dilesa.estimaciones`: el estado solo se mueve por RPC/sync (flag de transacción), igual que `obra_estimaciones` |
| Estimaciones `aprobada` históricas sin factura en CxP                                     | Backfill defensivo: las `aprobada` vivas generan su factura en espera al aplicar; las `pagada` se quedan como están               |
| Cancelar la factura en espera en CxP deja la estimación colgada                           | El sync regresa la estimación a `aprobada` al cancelar su factura; el índice único activo permite re-emitir                       |
| Aplicar la migración sin la UI de S2/S3 confunde al operador (factura en espera huérfana) | Aplicar S1 junto con S2/S3 (un solo gate de salida), como hizo `dilesa-contratos-estimaciones`                                    |

## Métricas de éxito

- Administración registra factura + pago de un destajo **sin entrar al módulo
  de construcción**, subiendo solo el XML.
- Toda estimación `aprobada` tiene su factura en espera en CxP con el desglose
  de contratos que abona.
- El detalle de la estimación en construcción muestra `facturada`/`pagada`
  derivado de CxP (0 captura manual de folio/referencia).
- El _Pendiente por pagar $_ del módulo CxP incluye los destajos autorizados.

## Sprints

- **S1 — Modelo + devengo**: migración (`facturas.estimacion_id`,
  `estimacion_destajo_autorizar`, `cxp_factura_desde_estimacion_destajo`, guard
  trigger, backfill) + rewire del botón "Aprobar" en el detalle de estimación
  para llamar la RPC. Migración como archivo (finanzas → la aplica Beto).
- **S2 — Recepción en CxP**: bandeja "Facturas en espera", extensión de
  `upload-xml` con `factura_id` destino (`cxp_factura_recibir_cfdi`), trigger
  de sync factura→estimación. Migración como archivo.
- **S3 — Invertir la UI**: quitar "Marcar factura recibida"/"Marcar pagada" de
  construcción, estados derivados read-only + "Ver en CxP →", KPIs + manual.

## Decisiones registradas

- **2026-06-25 — El contratista factura el neto (D1).** No se modela fondo de
  garantía ni retención liberable: la CxP nace por el neto y se paga el neto.
  Decidido por Beto.
- **2026-06-25 — Devengo al autorizar (D2).** La factura en espera nace al
  aprobar la estimación, no al subir el XML — visibilidad temprana del pasivo.
  Decidido por Beto.
- **2026-06-25 — Autoriza obra, paga CxP (D3).** El gate de autorizar es
  membresía de empresa (quien opera construcción); el candado financiero queda
  en `cxp_pago_aprobar` (admin/Dirección). Decidido por Beto.

## Bitácora

- **2026-06-26 — CUTOVER: migraciones aplicadas a prod + #1043 mergeado (OK de Beto en chat).**
  S1 (`20260625212801`) + S2 (`20260625213616`) aplicadas vía `psql`
  (`ON_ERROR_STOP=1`) y registradas en el ledger con `migration repair --status
applied` (1:1, sin huérfanos — no se usó `db push` porque el ledger traía
  drift de otras sesiones: `dilesa_notif_tareas_pendientes` #1022 local-only y
  un huérfano `fix_detonacion_acumula_abonos_coacreditados`; ambos ajenos, se
  dejaron intactos). **Verificación post-aplicación:** 6/6 objetos S1 + 3/3 S2;
  **backfill = 4 facturas en espera creadas = 4 estimaciones aprobadas vivas**
  (W26-MAYA, W26-SALA, W25, W24). SCHEMA_REF + types regenerados desde prod
  (solo `estimacion_id` + 4 RPCs, sin absorber schema ajeno). CI verde,
  incluido **Supabase Preview** (el `failed to bundle function` previo era flake
  transitorio del runner de branching — no toqué edge functions; #1040/#1039
  bundlearon ✅; pasó en el re-run). Merge squash (#1043 → main `17525a3`).
  **Pendiente operativo (no bloqueante):** smoke test con un XML real.
- **2026-06-25 — S1+S2+S3 construidos en un PR — [#1043](https://github.com/beto-sudo/BSOP/pull/1043), SIN auto-merge (gated por aplicar migraciones a prod).**
  Dos migraciones como archivo (`20260625212801` S1 + `20260625213616` S2):
  `erp.facturas.estimacion_id` + índice único activo; guard
  `dilesa.fn_estimaciones_guard`; RPCs `estimacion_destajo_autorizar` /
  `estimacion_destajo_cancelar` / `cxp_factura_desde_estimacion_destajo`
  (factura en espera por el neto al aprobar) / `cxp_factura_recibir_cfdi`
  (sube XML → por_pagar) + trigger de sync `fn_cxp_factura_sync_estimacion`
  (facturada/pagada/reversa derivados); backfill de `aprobada` vivas. UI:
  rewire de Aprobar/Cancelar a RPC, fuera "Marcar factura recibida"/"Marcar
  pagada", "Ver en CxP →"; bandeja "Facturas en espera" + diálogo "Subir XML"
  en `components/cxp/cxp-facturas-module.tsx`; `upload-xml` acepta `factura_id`
  destino. **Verificación local**: typecheck + test:coverage (2069) + lint +
  format:check verdes; el schema nuevo se puentea con casts (`as any` rpc),
  `SCHEMA_REF`/types **sin tocar** (se regeneran al aplicar). **CI**: "Lint /
  Typecheck / Unit tests" verde + Vercel Preview desplegado. Conflicto de
  `INITIATIVES.md` (auto-generada) resuelto con `--theirs` + regen.
  **Pendiente de Beto (gate de salida):** `supabase db push` de ambas
  migraciones → regenerar `SCHEMA_REF.md` + `types/supabase.ts` → mergear.
  Backfill de KPIs/manual del módulo de estimaciones quedó como pulido menor
  (los estados se preservan; los KPIs siguen contando por estado).
- **2026-06-25 — Promovida (`in_progress`) + arranque autónomo.** Nace de la
  decisión D3 de `dilesa-contratos-estimaciones`. Beto autorizó arrancar en
  autónomo dejando las migraciones (finanzas) como archivo para aplicarlas él
  al verificar. Diseño cerrado con 3 decisiones de Beto (D1/D2/D3 arriba).
