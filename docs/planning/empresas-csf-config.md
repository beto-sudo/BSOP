# Iniciativa — Empresas CSF Config

**Slug:** `empresas-csf-config`
**Empresas:** todas (las 4 SA de CV ya cargadas; UI nueva en `/settings/empresas`)
**Schemas afectados:** `core` (lectura/escritura `core.empresas`; `audit_log`; `erp.adjuntos` para archivar PDF)
**Estado:** planned
**Dueño:** Beto
**Creada:** 2026-04-28
**Última actualización:** 2026-04-28 (alcance v1 cerrado tras 5 decisiones de Beto: reuso directo del extractor de proveedores sin refactor previo, espejo simple de endpoints en `/api/empresas`, incluye flujo de alta nueva, drawer + campo registro patronal inline en `empresa-detail`, permisos solo admin)

## Problema

`core.empresas` ya tiene **todos los campos del CSF estructurados** desde la migración del 2026-04-16 (`rfc`, `razon_social`, `regimen_capital`, `nombre_comercial`, `fecha_inicio_operaciones`, `estatus_sat`, `id_cif`, `regimen_fiscal`, domicilio fiscal completo, `actividades_economicas` y `obligaciones_fiscales` jsonb, `csf_fecha_emision`, `csf_url`, `representante_legal`, `escritura_constitutiva`, `escritura_poder`, `tipo_contribuyente`, `curp`) además de `registro_patronal_imss` (agregado el 2026-04-19 para contrato LFT).

El problema:

- **No hay UI para cargar/actualizar el CSF de una empresa**. Las 4 empresas vivas (RDB, DILESA, ANSA, COAGAN) tienen sus datos cargados porque Beto pasó manualmente los PDFs a Claude en sesiones interactivas y este los dio de alta vía SQL/migración. Si una empresa renueva su CSF (cambio de domicilio, alta de obligación, cambio de régimen), no hay flujo operativo.
- **`registro_patronal_imss` existe en DB pero no en UI**. El campo se agregó porque lo necesitaba `empleados-multi-puesto` para el contrato LFT pero `app/settings/empresas/[slug]/page.tsx` no lo expone — está cargado a mano vía SQL en empresas que ya tienen empleados, vacío en las que no.
- **No hay flujo de alta de empresa nueva**. Si en el futuro entra una 5ª empresa al grupo, hoy se crea vía SQL/migración. Repetir lo que hicimos para proveedores (drawer "Nueva con CSF") es la dirección correcta.
- **Las CSF en `core.empresas` son dependencia de la iniciativa `cxp`** que apenas se promovió. CxP usa `regimen_fiscal` y `obligaciones_fiscales` para proponer retenciones automáticas. Si el CSF de empresa está desactualizado o vacío, las retenciones serán incorrectas. CxP Sprint 1 abre con un check de las 4 — `empresas-csf-config` provee la herramienta para refrescarlas en lugar de re-pasar PDFs a Claude cada vez.

Mecanismo análogo ya existe y está mergeado: `proveedores-csf-ai` (PRs #234-#244, cerrada el 2026-04-27) corre `lib/proveedores/extract-csf.ts` (parser determinista con Anthropic + Ghostscript-WASM) sobre PDF de CSF de proveedor → escribe campos estructurados a `core.personas` + `erp.personas_datos_fiscales`. Endpoints `extract-csf`, `create-with-csf`, `[persona_id]/update-csf` con diff selectivo y audit. UI drawer en `/rdb/proveedores` y `/dilesa/proveedores`.

Empresa es estructuralmente igual al proveedor moral: mismo PDF de SAT, mismos campos. No hay razón para reinventar.

## Outcome esperado

- **Drawer "Actualizar CSF"** en `app/settings/empresas/[slug]/page.tsx`: usuario sube PDF, sistema extrae campos, presenta diff selectivo (igual que proveedores), usuario aprueba qué actualizar y se commitea con audit.
- **Campo `registro_patronal_imss` editable** en la sección "Datos fiscales" del detalle de empresa, debajo de los campos del CSF (no viene en el PDF, captura manual).
- **Botón "Nueva empresa"** en `/settings/empresas` que abre flujo análogo a "Nuevo proveedor con CSF": sube PDF → extrae → confirma → alta en `core.empresas`.
- **Reuso directo de `lib/proveedores/extract-csf.ts`** sin refactor previo. Empresas importa desde ese path; si en el futuro se promueve a `lib/csf/`, ambos consumidores se actualizan en un PR de refactor separado.
- **Endpoints en `/api/empresas/`**: `extract-csf`, `create-with-csf`, `[id]/update-csf`, y `PATCH /api/empresas/[id]` para `registro_patronal_imss`. Espejo simple del shape de proveedores.
- **Permisos solo admin** (igual que la pantalla actual de `/settings/empresas`, sin nueva matriz de roles).
- **PDF archivado en `erp.adjuntos`** con `entidad_tipo='empresa', rol='csf'`, mismo patrón que proveedores. Histórico nativo de las constancias subidas.
- **Las 4 empresas existentes refrescadas** con el flujo nuevo como rollout (Sprint 4) — valida que el extractor funciona end-to-end y deja los datos al día para CxP Sprint 1.

## Alcance v1

- [ ] **Sprint 1 — Endpoints `/api/empresas/`**:
  - `POST /api/empresas/extract-csf`: recibe PDF (FormData), llama `lib/proveedores/extract-csf.ts`, regresa campos extraídos. Sin escribir DB. Permiso admin.
  - `POST /api/empresas/create-with-csf`: alta de empresa nueva. Body: campos del CSF + `slug` + `nombre_comercial` + `tipo_contribuyente` (default `persona_moral`). Crea registro en `core.empresas`, archiva PDF en `erp.adjuntos`. Dedup por RFC (`UNIQUE` en `core.empresas.rfc` si no existe — verificar y agregar si falta). Permiso admin.
  - `PATCH /api/empresas/[id]/update-csf`: recibe PDF + `accepted_fields[]` (mismo shape que proveedores). Compara con `core.empresas` actual, aplica selectivo, escribe a `audit_log` por campo. Archiva PDF nuevo en `erp.adjuntos` con `rol='csf'`.
  - `PATCH /api/empresas/[id]`: actualiza `registro_patronal_imss` (también queda abierto para otros campos sueltos a futuro: branding ya tiene su propio endpoint, este queda para campos no-CSF y no-branding). Audit por campo modificado.
  - Tests: parser determinista corre sobre fixtures de CSF de las 4 empresas (si tenemos los PDFs en `tests/fixtures/csf/`); endpoints con tests de integración (extract retorna shape esperado, create dedup por RFC, update aplica selectivo, PATCH valida regex de registro patronal).
  - **No regenera SCHEMA_REF** salvo que el ajuste de `erp.adjuntos.entidad_tipo` (riesgo abajo) requiera DDL.

- [ ] **Sprint 2 — UI drawer "Actualizar CSF" + campo registro patronal**:
  - En `app/settings/empresas/[slug]/page.tsx` (o `_components/empresa-detail.tsx`): bloque "Datos fiscales" muestra campos read-only del último CSF parseado (`rfc`, `razon_social`, `regimen_fiscal`, `csf_fecha_emision`, domicilio).
  - Botón header "Actualizar CSF" abre drawer:
    - Estado A: drop PDF.
    - Estado B: extracción en curso (loader).
    - Estado C: diff selectivo con checkbox por campo (espejo del modal de proveedores `_components/csf-diff-modal.tsx`).
    - Estado D: confirmado, refresca página.
  - Debajo de "Datos fiscales", **input editable** para `registro_patronal_imss` con mask `A0000000000` y validación regex (`/^[A-Z]\d{10}$/`). Guarda con `PATCH /api/empresas/[id]`.
  - Reuso de `<CsfDiffModal>` si está exportado de `components/proveedores/`; si está en `_components/` privado, espejo en `components/empresas/csf-diff-modal.tsx` o se promueve a `components/csf/csf-diff-modal.tsx` en este PR (decisión al implementar — depende de qué tan acoplado esté a tipos de proveedor).
  - Smoke test: drag de un PDF de CSF de RDB existente → diff muestra "no changes" si datos están al día, o cambios reales si difiere.

- [ ] **Sprint 3 — Botón "Nueva empresa" + flujo `create-with-csf`**:
  - En `app/settings/empresas/page.tsx`: botón header "Nueva empresa" abre drawer análogo al de "Nuevo proveedor con CSF".
  - Flujo: drop PDF → extrae → previsualiza campos → captura `slug`, `nombre_comercial`, `tipo_contribuyente` (default `persona_moral`) → confirma → POST `/api/empresas/create-with-csf` → redirige a `/settings/empresas/[nuevo-slug]`.
  - Validación de slug único en cliente y server (`core.empresas.slug` ya tiene `UNIQUE` — manejar el error friendly).
  - Default de slug = slugify del `nombre_comercial`, editable antes de confirmar.

- [ ] **Sprint 4 — Refresh operativo de las 4 empresas**:
  - **Sin código, solo operación.** Beto sube los CSF actuales de RDB, DILESA, COAGAN y ANSA por la UI nueva. Confirma en cada una que el extract es correcto, captura `registro_patronal_imss` donde aplique.
  - Verifica que `cxp` Sprint 1 puede leer `regimen_fiscal` y `obligaciones_fiscales` correctamente para las 4 (pre-requisito documentado en `cxp.md`).
  - Cierra iniciativa.

## Fuera de alcance v1

- **Refactor `lib/proveedores/extract-csf.ts → lib/csf/`** para uso compartido más limpio. Tras 2 consumidores el refactor empieza a tener sentido; sub-iniciativa con su propio PR cuando ambos consumidores estén estables.
- **Validación SAT en línea** (consultar el RFC en `api.sat.gob.mx` para confirmar estatus actual). El extractor parsea el PDF; no llama al SAT. Si en el futuro se quiere validar contra el padrón, sub-iniciativa.
- **Histórico de versiones del CSF** con vista "este campo cambió de X a Y el día Z". Hoy `audit_log` lo registra pero no hay UI para verlo. Sub-iniciativa (puede compartir UI con `activity-log-pattern` cuando arranque).
- **Persona física como empresa propia** del grupo. Las 4 actuales son SA de CV; el extractor soporta persona física pero la UI v1 asume `tipo_contribuyente='persona_moral'` con override manual al alta. Caso edge si entra alguna vez.
- **Bulk upload** de CSF (varios PDFs de empresa a la vez). N=4 lo hace innecesario. Sub-iniciativa si N crece.
- **CSF de sucursales o establecimientos secundarios**. Cada empresa tiene 1 CSF. Si emerge necesidad, sub-iniciativa.
- **Edición manual de campos del CSF** sin re-subir el PDF. La política del v1 es "el CSF es la fuente; si quieres cambiar régimen, baja la nueva CSF del SAT y súbela acá". Si emerge un caso justificado de override sin PDF, sub-iniciativa.
- **Renovación automática del CSF**. El SAT no expira el CSF; el documento es perpetuo hasta que cambias algo. No hay alarma de renovación a v1.

## Métricas de éxito

- **Las 4 empresas refrescadas en Sprint 4** vía la UI nueva: cada una con `csf_fecha_emision` actualizada y `csf_url` apuntando a un PDF en `erp.adjuntos`.
- **`registro_patronal_imss` capturado** en las empresas que tienen empleados (RDB, DILESA hoy; COAGAN/ANSA cuando carguen empleados).
- **Tiempo de actualización de CSF**: subir PDF → confirmar diff → aplicar = ≤ 60 seg en empresa típica (referencia: proveedores corre en ~30 seg, empresas tendrá overhead similar).
- **Audit trazable**: cada `update-csf` deja N entradas en `audit_log` (una por campo aceptado), con `quien` (admin que aprobó) y `cuando`. Mismo patrón que proveedores.
- **CxP Sprint 1 desbloqueado**: el motor de retenciones tiene datos confiables sobre las 4 empresas.

## Riesgos / preguntas abiertas

- [ ] **Acoplamiento con `lib/proveedores/extract-csf.ts`**: si proveedores refactoriza el shape del extractor (cambia nombres de campos o añade nuevos), empresas se rompe sin warning. Mitigación: test de contrato compartido en `lib/proveedores/extract-csf.test.ts` que verifica shape estable; nota en bitácora del refactor cuando se proponga `lib/csf/`.
- [ ] **`<CsfDiffModal>` de proveedores en `_components/` privado**: si está bajo `app/<empresa>/proveedores/_components/` (ruta privada de Next), Empresas no puede importarlo. Sprint 2 abre verificando ubicación; si privada, espejo a `components/csf/` (refactor mínimo, no cambia API).
- [ ] **CSF de SA de CV vs SA de CV de RL** y otras variaciones de razón social: el parser determinista usa heurísticas sobre el texto del PDF; PDFs no estándar pueden fallar. Mitigación: fixtures con los 4 PDFs reales en Sprint 1; si alguno falla, ajustar parser (cambio cae en `lib/proveedores/extract-csf.ts` afectando proveedores también — coordinar).
- [ ] **`erp.adjuntos.entidad_tipo` debe aceptar `'empresa'`**: confirmar que el `CHECK` constraint o ENUM no restringe a `'persona'` solo. Si restringe, Sprint 1 abre con migración mínima para agregar `'empresa'` (regenera SCHEMA_REF en ese caso).
- [ ] **Permiso admin = qué helper**: hoy `app/settings/empresas` valida vía `core.fn_is_admin()` (presumido — verificar). Endpoints nuevos deben usar el mismo helper para consistencia.
- [ ] **Slug autogenerado vs manual**: para alta nueva, `slug` se deriva del nombre (slugify) y el usuario puede editar antes de confirmar. Decisión final al implementar Sprint 3.
- [ ] **CSF re-subido idéntico al actual**: el diff selectivo debe mostrar "no hay cambios" sin obligar al usuario a marcar nada. Comportamiento del modal de proveedores ya lo maneja — verificar al hacer espejo.
- [ ] **Dedup por RFC en `create-with-csf`**: si `core.empresas.rfc` no tiene `UNIQUE`, agregarlo es parte de Sprint 1 (DDL mínimo). Si ya existe, solo manejar el error friendly en el endpoint.

## Sprints / hitos

| #   | Scope                                                                                                                                  | Estado    | PR  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- | --- |
| 0   | Promoción: este doc + fila en INITIATIVES.md                                                                                           | _este PR_ | —   |
| 1   | Endpoints `/api/empresas/extract-csf`, `create-with-csf`, `[id]/update-csf`, `PATCH [id]` (registro patronal) + tests con fixtures CSF | pending   | —   |
| 2   | UI drawer "Actualizar CSF" en `/settings/empresas/[slug]` + campo `registro_patronal_imss` editable + reuso `<CsfDiffModal>`           | pending   | —   |
| 3   | Botón "Nueva empresa" + drawer `create-with-csf` en lista `/settings/empresas`                                                         | pending   | —   |
| 4   | Refresh operativo: subir CSF al día de RDB/DILESA/COAGAN/ANSA + capturar `registro_patronal_imss` faltantes                            | pending   | —   |

## Decisiones registradas

### 2026-04-28 — Decisiones cerradas por Beto al promover la iniciativa

- **Reuso directo de `lib/proveedores/extract-csf.ts`** sin refactor previo. Empresas importa desde ese path tal cual. Si proveedores cambia el shape, empresas se actualiza con él. Refactor a `lib/csf/` queda como sub-iniciativa para cuando ambos consumidores estén estables.
- **Endpoints como espejo simple de proveedores**, no genérico. Estructura `/api/empresas/extract-csf`, `/api/empresas/create-with-csf`, `/api/empresas/[id]/update-csf`, `/api/empresas/[id]`. Más fácil de auditar y RLS por path; un endpoint `/api/csf/{action}` parametrizado se descartó porque el ahorro de código no compensa el costo de routing dinámico.
- **Incluir flujo de alta nueva** (`create-with-csf`). Aunque hoy las 4 empresas ya están de alta vía SQL, si entra una 5ª al grupo o se decide separar una operación a entidad propia, el flujo vía UI es el correcto. Mantenerlo en alcance v1 evita regresar a este doc en 6 meses.
- **UI = drawer "Actualizar CSF" + campo `registro_patronal_imss` inline**. No rediseño completo de la pantalla de empresa; se suma un botón al header del detalle y un input al bloque de datos fiscales. Las empresas son 4, se editan rara vez — overengineerear la pantalla no compensa.
- **Permisos solo admin** (igual que la pantalla actual de `/settings/empresas`). No se introduce matriz de roles nueva. Si en el futuro se quiere "solo accionistas" o "solo consejeros", sub-iniciativa con su propio cambio de permisos.

## Bitácora
