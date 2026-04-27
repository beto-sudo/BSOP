# Iniciativa — Proveedores · Alta y actualización por CSF (AI)

**Slug:** `proveedores-csf-ai`
**Empresas:** todas (RDB ya tiene módulo, DILESA segundo, resto conforme se desarrollen)
**Schemas afectados:** `erp` (expansión de modelo de personas/datos fiscales) + UI
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-04-27
**Última actualización:** 2026-04-27

## Problema

El alta de proveedor hoy es 100% captura manual: el usuario llena nombre, apellidos, RFC, teléfono, email, dirección como string libre, etc. Es lento, propenso a typos (sobre todo el RFC y el domicilio fiscal) y la información que tenemos del proveedor queda incompleta — no guardamos régimen fiscal, no separamos razón social de nombre/apellidos, y la dirección es texto libre sin estructura.

Además, la **Constancia de Situación Fiscal (CSF)** del SAT trae todos esos datos ya validados oficialmente, pero hoy el proveedor la manda por correo, alguien la imprime, alguien la teclea, y la PDF se pierde — no queda archivada en el sistema, así que cuando se necesita re-emitir un comprobante o validar régimen, hay que pedirla de nuevo.

El módulo de Documentos ya tiene el patrón de extracción IA con Claude (`/api/documentos/[id]/extract` + `lib/documentos/extraction-core`): subir PDF → Claude lee → campos pre-llenados. Reutilizar ese patrón para el flujo de proveedores reduce el alta a ~1 minuto y asegura que la CSF quede archivada y auditable.

## Outcome esperado

- **Alta de proveedor en ≤ 1 minuto** end-to-end (subir PDF + revisar campos pre-llenados + guardar), vs. los varios minutos de captura manual de hoy.
- **CSF archivada como adjunto versionado** del proveedor, con histórico — siempre disponible para consulta, re-emisión o auditoría.
- **Datos fiscales completos y estructurados**: razón social vs nombre, tipo de persona (física/moral), régimen fiscal, domicilio fiscal con CP, regímenes y obligaciones.
- **Detección automática de duplicados por RFC** al alta, evitando el typo silencioso de hoy donde se crean dos proveedores con el mismo RFC con pequeñas diferencias en el nombre.
- **Update con confianza**: cuando un proveedor existente sube CSF nueva (cambio de domicilio, régimen, etc.), el usuario ve un diff campo-por-campo antes de aplicar — no hay sobrescritura silenciosa.

## Alcance v1

- [ ] **Modelo DB (`erp`)**: expansión de `personas` o nueva tabla anexa `personas_datos_fiscales` para soportar `tipo_persona` (física/moral), razón social separada, régimen fiscal (catálogo SAT), domicilio fiscal estructurado (calle, núm ext, núm int, colonia, CP, municipio, estado), fecha inicio operaciones, regímenes, obligaciones. Decisión columnas-vs-tabla la cierra Claude Code en ADR al arrancar ejecución.
- [ ] **Adjuntos**: `entidad_tipo='proveedor'` + `rol='csf'`, versionado (cada nueva CSF se agrega, no reemplaza). UI muestra la última en el detalle + "Ver históricos" para listarlas con fecha.
- [ ] **Extracción IA reutilizando patrón documentos**: nueva ruta tipo `POST /api/proveedores/extract-csf` (o equivalente) que reciba el PDF, lo procese con Claude usando un schema dedicado a CSF (todos los campos arriba), y devuelva los datos pre-llenados al cliente sin todavía persistir.
- [ ] **UI alta nueva**: drawer "+ Nuevo Proveedor" arranca con sección "Sube CSF (recomendado, auto-llenado)" + link discreto "Capturar manualmente sin CSF" (preserva el flujo actual). Tras subir CSF: spinner ~60s → form pre-llenado → usuario revisa/corrige → guardar.
- [ ] **UI update existente**: botón "Cargar / Actualizar CSF" en el drawer/detalle del proveedor. Al procesar, modal de **diff campo-por-campo** (valor actual → valor nuevo), checkbox por campo para aceptar/rechazar, botón "Aplicar cambios". La CSF nueva queda archivada como histórico aunque el usuario rechace todos los cambios.
- [ ] **Detección de duplicados por RFC**: al alta, si el RFC extraído ya existe como proveedor activo en esa empresa, bloquear con mensaje + dos CTAs ("Ir al proveedor existente" / "Actualizar su CSF con este PDF").
- [ ] **Detección persona física vs moral**: la extracción IA setea `tipo_persona`. UI muestra/oculta campos correspondientes (apellidos solo físicas; razón social solo morales) e inactiva los que no aplican.
- [ ] **Estados de error**: si Claude falla o el PDF no es CSF válida, mensaje claro con opción a reintentar o saltar a captura manual.
- [ ] **Rollout por empresa**: arrancar habilitando flujo en RDB (módulo ya existe) y DILESA (módulo nuevo siguiendo este patrón). Otras empresas se suman cuando se cree su módulo de proveedores.

## Fuera de alcance

- Validación contra el SAT en tiempo real (verificar que el RFC esté activo, etc.) — solo confiamos en la CSF que el proveedor entrega.
- Importación masiva / batch de CSFs (subir varios PDFs a la vez para alta masiva). Solo flujo 1-a-1 en v1.
- Reconocimiento de otros documentos fiscales (CFDI, opinión de cumplimiento). Solo CSF.
- Notificaciones automáticas al proveedor solicitando CSF actualizada.
- Migrar/extraer datos fiscales de proveedores existentes que no tienen CSF subida — los proveedores actuales viven con datos parciales hasta que alguien suba su CSF manualmente vía el flujo de update.

## Métricas de éxito

- **Tiempo medio de alta de proveedor con CSF: ≤ 1 minuto** end-to-end (medido desde click en "+ Nuevo Proveedor" hasta guardar exitoso). Métrica primaria.
- **% de proveedores nuevos con CSF adjuntada** (objetivo a definir post-launch, observacional).
- **% de proveedores existentes con CSF actualizada** vía el botón de update (objetivo a definir post-launch, observacional).

## Riesgos / preguntas abiertas

- [ ] **Decisión de modelo DB**: columnas nuevas en `erp.personas` vs tabla anexa `personas_datos_fiscales`. Tradeoff: simplicidad de queries vs. evitar inflar `personas` con campos que solo aplican a proveedores. ADR al arrancar ejecución.
- [ ] **Catálogo de régimen fiscal**: ¿usamos catálogo SAT como tabla referencial (`erp.regimenes_fiscales`) o lo guardamos como string con el código? Decisión en ejecución.
- [ ] **Compatibilidad con proveedores existentes en RDB**: hoy `erp.personas` ya tiene rows. La migración debe ser aditiva (nuevas columnas nullables o nueva tabla 1:1 opcional). Sin breaking changes.
- [ ] **Costo de Claude por extracción**: ~60-120s de tiempo + tokens. A volumen de altas actuales (decenas/mes por empresa), no es problema. A monitorear si crece.
- [ ] **Falsos positivos en duplicado por RFC**: si dos empresas legítimamente tienen el mismo proveedor (mismo RFC), el bloqueo por RFC debe ser **por empresa**, no global.
- [ ] **CSF de PDFs escaneados de baja calidad**: la extracción puede fallar o ser parcial. UX de error debe ser clara y no bloquear el flujo manual.
- [ ] **Formato de CSF cambia con el tiempo**: el SAT actualiza el layout ocasionalmente. El prompt de Claude debe ser robusto a variaciones (no parsear por posición fija).

## Sprints / hitos

### Sprint 1.A — Modelo DB ✅

- [x] Migración `supabase/migrations/20260427103620_personas_datos_fiscales.sql` siguiendo ADR-007. Aplicada a la DB.
- [x] Columna `tipo_persona` en `erp.personas` (default 'fisica', check fisica|moral).
- [x] Tabla `erp.personas_datos_fiscales` 1:1 con personas + RLS + trigger updated_at.
- [x] `supabase/SCHEMA_REF.md` regenerado con `npm run schema:ref`.
- [x] `types/supabase.ts` actualizado con los nuevos types (manualmente, `npm run db:types` bloqueado en sandbox).

### Sprint 1.B — Endpoint de extracción IA ✅

- [x] `POST /api/proveedores/extract-csf` que recibe PDF (multipart/form-data), lo procesa con Claude usando schema dedicado a CSF, devuelve los datos pre-llenados sin persistir. Reutiliza `lib/documentos/extraction-core.ts` (anthropic, MODELO_CLAUDE, ensurePdfFitsForClaude).
- [x] Schema `CsfExtraccionSchema` (Zod) en `lib/proveedores/extract-csf.ts` cubre todos los campos del ADR-007.
- [x] Tests unitarios del schema (9 tests pasando — moral, física, múltiples regímenes, rechazos).
- _Smoke con CSFs reales pendiente para cuando exista UI Sprint 2 (alternativa: curl)._

### Sprint 2.A — Backend de alta con CSF

- [ ] `POST /api/proveedores/create-with-csf` que recibe FormData con PDF + JSON de campos editados + `empresa_id`. Persiste en orden: dedup RFC → `erp.personas` → `erp.proveedores` → upload PDF a storage → `erp.adjuntos` (rol='csf') → `erp.personas_datos_fiscales`.
- [ ] Detección de duplicado por RFC al inicio (`empresa_id + rfc + activo=true` en `erp.personas`). Si existe, 409 con `existing_persona_id` y `existing_proveedor_id`.
- [ ] Tests unitarios del schema de input + tests de la lógica de dedup.

### Sprint 2.B — UI de alta nueva (RDB primero)

- [ ] Drawer `+ Nuevo Proveedor` con sección "Sube CSF (recomendado)" + link "Capturar manualmente" (preserva flujo actual).
- [ ] Flujo upload → spinner ~60s → form pre-llenado → revisar/corregir → guardar (llama `create-with-csf`).
- [ ] UI de duplicado: cuando 409 con `existing_persona_id`, modal con dos CTAs ("Ir al proveedor existente" / "Actualizar su CSF con este PDF" — esto último vincula con Sprint 3).
- [ ] Detección persona física vs moral: la extracción setea `tipo_persona`; UI muestra/oculta campos correspondientes.
- [ ] Estados de error (Claude falla, PDF no es CSF, timeout) con CTA a captura manual.

### Sprint 3 — UI de update existente (diff campo-por-campo)

- [ ] Botón "Cargar / Actualizar CSF" en drawer/detalle del proveedor.
- [ ] Modal de diff: valor actual → valor nuevo, checkbox por campo, "Aplicar cambios".
- [ ] CSF nueva queda archivada como histórico aunque el usuario rechace todos los cambios. `csf_adjunto_id` se actualiza al PDF nuevo solo si se aceptó al menos un cambio.
- [ ] Vista "Ver históricos" lista CSFs anteriores con fecha.

### Sprint 4 — Rollout DILESA y cierre

- [ ] Replicar el flujo en módulo de Proveedores DILESA (módulo nuevo si no existe).
- [ ] Smoke manual end-to-end en RDB y DILESA con CSFs reales de proveedores actuales.
- [ ] Closeout: medir tiempo medio de alta vs baseline manual; documentar en bitácora.

## Decisiones registradas

- **2026-04-27 — Modelo DB: tabla anexa 1:1.** Se cierra la pregunta del alcance "columnas vs tabla anexa" con [ADR-007](../../supabase/adr/007_personas_datos_fiscales.md): nueva tabla `erp.personas_datos_fiscales` con FK UNIQUE `persona_id` a `erp.personas`. La única columna que toca `personas` es `tipo_persona` ('fisica'|'moral') porque define el tratamiento UI desde antes de cualquier CSF. Razones principales: sigue el patrón establecido del repo (`proveedores`, `empleados`, `clientes` ya son anexas a `personas`), separa concerns (identidad vs datos fiscales formales), migración aditiva sin riesgo, espacio para versionado futuro sin re-trabajo.
- **2026-04-27 — CSF como adjunto polimórfico, no campo del modelo fiscal.** El PDF se archiva en `erp.adjuntos` con `entidad_tipo='persona', rol='csf', entidad_id=persona_id`. Histórico nativo por `created_at`; `csf_adjunto_id` en `personas_datos_fiscales` apunta al vigente. Reutiliza el patrón ya usado por el módulo Documentos sin tabla nueva.
- **2026-04-27 — Régimen fiscal denormalizado, no catálogo SAT.** Guardamos `(codigo, nombre)` como texto en la tabla. Crear catálogo SAT solo para esta iniciativa es over-engineering; si después hace falta filtrar estructuradamente, se normaliza en otro ADR.

## Bitácora

- **2026-04-27 — Sesión de arranque.** Se registra la iniciativa en `INITIATIVES.md` (PR [#234](https://github.com/beto-sudo/BSOP/pull/234)). Beto aprueba alcance v1 inmediatamente. Se promueve estado `proposed → planned` y se cierra la decisión de modelo DB con [ADR-007](../../supabase/adr/007_personas_datos_fiscales.md).
- **2026-04-27 — Sprint 1.A cerrado (PR [#235](https://github.com/beto-sudo/BSOP/pull/235)).** Migración aplicada a la DB: columna `tipo_persona` en `erp.personas` + tabla `erp.personas_datos_fiscales` con RLS y trigger updated_at. SCHEMA_REF y types regenerados. CI verde (typecheck/lint/test/format/drift-check). Estado `planned → in_progress`. Próximo: Sprint 1.B (endpoint extract-csf).
- **2026-04-27 — Sprint 1.B cerrado (PR [#236](https://github.com/beto-sudo/BSOP/pull/236)).** Endpoint `POST /api/proveedores/extract-csf` que recibe PDF y devuelve campos extraídos (sin persistir). `CsfExtraccionSchema` con todos los campos del ADR-007. 9 tests unitarios del schema pasando. Reutiliza `lib/documentos/extraction-core.ts`. Como efecto colateral, descubrimos un bug del workflow `db-types.yml` que regeneraba types sin schemas `dilesa`/`maquinaria` (causando typecheck fail en su PR auto-generado #227); arreglado en PR [#239](https://github.com/beto-sudo/BSOP/pull/239) y memoria `reference_db_types_workflow_sync.md` agregada. Próximo: Sprint 2.A (endpoint create-with-csf + dedup RFC).
