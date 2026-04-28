# Iniciativa — Empresa: Documentos Legales (referencias a `erp.documentos`)

**Slug:** `empresa-documentos-legales`
**Empresas:** todas (las 4 actuales + futuras)
**Schemas afectados:** `core` (nueva tabla `core.empresa_documentos`; columnas-caché en `core.empresas`), `erp` (lectura de `erp.documentos`; posible extensión del schema de extracción IA)
**Estado:** planned
**Dueño:** Beto
**Creada:** 2026-04-28
**Última actualización:** 2026-04-28 (alcance v1 cerrado tras 11 decisiones de Beto: tabla intermedia con rol, jsonb caché en empresa con sync automático, roles iniciales fijos pero extensibles, múltiples vigentes con flag `es_default`, validación contra campos del documento referenciado, dropdown con búsqueda + CTA a Documentos, metadata + ver-doc, escrituras/poderes primero, constitutiva + reformas referenciadas, solo admin v1)

## Problema

La iniciativa `empresas-csf-config` (cerrada hoy) ya capturó todos los datos del SAT (CSF) en `core.empresas`. Pero al ir a `/rdb/rh/personal` para dar de alta empleados, sigue bloqueado porque `lib/rh/datos-fiscales-empresa.ts` exige también:

- `representante_legal` (text)
- `escritura_constitutiva` (jsonb con número, fecha, notario, número de notaría, distrito)
- `escritura_poder` (idéntico shape)

En `feat(empresas-csf-config): editor de representante legal + escrituras` (PR #280, mergeado hoy) los agregamos como inputs editables a mano que persisten en `core.empresas` como jsonb plano. **Eso desbloquea el alta de empleados a corto plazo, pero deja un problema estructural sin resolver:**

- Los **PDFs** de las escrituras y poderes ya viven (o van a vivir) en `erp.documentos` — la "fuente de verdad en ERP" según `supabase/SCHEMA_REF.md`. Esa tabla tiene `tipo`, `subtipo_meta` jsonb, `archivo_url`, `notario_proveedor_id` (link a la persona del notario), extracción IA con `extraccion_status` y prompt en `lib/documentos/extraction-core.ts` que parsea documentos legales completos.
- **Hoy duplicamos la metadata** de la escritura entre `erp.documentos.subtipo_meta` (donde realmente está el PDF + extracción) y `core.empresas.escritura_constitutiva` (jsonb pelado, capturado a mano). Si Beto sube el acta constitutiva al módulo de Documentos, la IA la extrae automáticamente — pero no hay forma de "decirle" a la empresa "USA ESTA escritura para tu Constitutiva".
- **No hay trazabilidad** del PDF original desde el flujo de RH. El contrato laboral se imprime con metadata pero sin liga al instrumento notarial real.
- **Falta semántica de "para qué se usa cada documento"**. Una empresa puede tener varios poderes vigentes (general de administración, actos de dominio, bancario, IMSS). Hoy `core.empresas.escritura_poder` es un solo jsonb — no hay forma de declarar "este poder es el que se usa para contratos laborales", "este otro es para abrir cuentas bancarias".
- **No escala más allá de escrituras/poderes**. Mañana van a aparecer reglamento interior de trabajo, comprobantes de domicilio, políticas internas — todos documentos legales de la empresa con un rol específico.

La propuesta de Beto: en lugar de duplicar metadata en `core.empresas`, **ligar referencias** a documentos del módulo de Documentos. En la sección "Documentos legales" de la empresa, especificar el rol del documento ("Acta constitutiva", "Poder de representación para Contratos de Empleados", etc.). El módulo de Documentos sigue siendo la fuente de verdad del PDF + la extracción IA.

## Outcome esperado

- **Tabla `core.empresa_documentos`** (polimórfica con rol, mismo patrón que `erp.adjuntos`): `(empresa_id, documento_id, rol, es_default, asignado_por, asignado_at, notas)`. Un documento puede tener varios roles para la misma empresa, varios documentos pueden compartir el mismo rol (ej. múltiples poderes vigentes), y uno por rol se marca como `es_default` para ser el "estándar" usado por flujos automáticos.
- **Caché en `core.empresas`**: las columnas jsonb `escritura_constitutiva` y `escritura_poder` se mantienen, pero ahora se llenan automáticamente al asignar/cambiar el documento default de los roles `acta_constitutiva` y `poder_general_administracion`. El validador de `lib/rh/datos-fiscales-empresa.ts` no necesita refactor — sigue leyendo del caché, que ahora está sincronizado con la metadata extraída del PDF real.
- **Sección "Documentos legales — alta de empleados"** rediseñada en `app/settings/empresas/[slug]`: lista agrupada por rol, cada rol con sus docs asignados (mostrando metadata extraída + botón "Ver documento") y los roles vacíos con dropdown "Asignar documento" + CTA "o súbelo en `/<empresa>/admin/documentos`".
- **Validación end-to-end** sobre los campos canónicos del subtipo_meta del documento (número, fecha, notario, número de notaría, distrito). Si la extracción IA no los puebla, se piden al usuario en la captura del documento.
- **Roles iniciales** (extensibles según necesidad): `acta_constitutiva`, `acta_reforma`, `poder_general_administracion`, `poder_actos_dominio`, `poder_pleitos_cobranzas`, `poder_bancario`, `representante_legal_imss`. Constitutiva + reformas: todas referenciadas (no solo la última).
- **Permisos solo admin v1** (consistente con el resto de empresa). Sub-iniciativa futura: definir matriz de roles para todo lo admin-only y abrir a comité ejecutivo donde aplique.

## Alcance v1

- [ ] **Sprint 1 — DB schema**:
  - Migración `core.empresa_documentos` con columnas: `id` (uuid PK), `empresa_id` (FK core.empresas), `documento_id` (FK erp.documentos), `rol` (text con CHECK constraint sobre la lista inicial — ampliable por ALTER), `es_default` (bool), `asignado_por` (FK core.usuarios), `asignado_at` (timestamptz NOT NULL DEFAULT now()), `notas` (text), `created_at`/`updated_at`.
  - **Constraint UNIQUE** sobre `(empresa_id, documento_id, rol)` — un doc no puede tener el mismo rol asignado dos veces a la misma empresa.
  - **Índice parcial UNIQUE** sobre `(empresa_id, rol) WHERE es_default = true` — solo un default por rol por empresa.
  - **RLS**: SELECT abierto a miembros activos de la empresa + admin; INSERT/UPDATE/DELETE solo admin (consistente con `app/settings/empresas` actual).
  - **Trigger** opcional para sincronizar `core.empresas.escritura_constitutiva` y `escritura_poder` cuando cambia el `es_default` de los roles `acta_constitutiva` y `poder_general_administracion`. Lee `subtipo_meta` del documento referenciado y proyecta los 5 campos al jsonb. (Alternativa: hacerlo en application code en el endpoint de asignación; decisión al implementar.)
  - Regenera `SCHEMA_REF.md`.

- [ ] **Sprint 2 — Auditoría y extensión de extracción IA**:
  - Revisar qué campos extrae hoy `lib/documentos/extraction-core.ts` para documentos tipo "escritura" / "poder" — ver `ParteSchema` y los schemas específicos por subtipo.
  - **Confirmar** que el `subtipo_meta` ya incluye los 5 campos canónicos (`numero_escritura`, `fecha_escritura`, `notario_nombre`, `notaria_numero`, `distrito_notarial`). Si faltan, ampliar el zod schema y el prompt.
  - Para poderes específicamente, capturar también `tipo_poder` (general administración, actos dominio, etc.), `alcance`, `vigencia` (revocable/perpetuo, fecha de revocación si aplica). Estos campos NO bloquean v1 pero son útiles para el dropdown de asignación (auto-sugerir el rol según la extracción).
  - Si requiere reprocesar documentos existentes, script en `scripts/` que invoca el extractor sobre los docs ya cargados con `extraccion_status='extraido'`.

- [ ] **Sprint 3 — API endpoints `/api/empresas/[id]/documentos`**:
  - `GET`: lista los documentos asignados a la empresa, agrupados por rol, con metadata mínima del documento (titulo, numero_documento, fecha, archivo_url, subtipo_meta) y los flags (es_default, asignado_at).
  - `POST`: asigna un documento existente a la empresa con un rol. Body: `{ documento_id, rol, es_default?, notas? }`. Si `es_default=true`, baja el flag de los demás docs con el mismo rol. Verifica que el documento pertenezca a `empresa_id` (no se pueden asignar docs de otra empresa).
  - `PATCH /api/empresas/[id]/documentos/[asignacion_id]`: cambia `es_default`, `notas` o `rol` (rol cambio: tratar como delete + insert para mantener UNIQUE).
  - `DELETE /api/empresas/[id]/documentos/[asignacion_id]`: desasigna.
  - Side-effect en POST/PATCH/DELETE de roles `acta_constitutiva` y `poder_general_administracion`: sincroniza el jsonb caché en `core.empresas` (si el trigger DB no lo hace).
  - Tests con mocks fluentes (mismo patrón que `app/api/empresas/_test-helpers.ts`).

- [ ] **Sprint 4 — UI "Documentos legales" en `app/settings/empresas/[slug]`**:
  - Reemplaza las dos cards actuales `<EscrituraCard>` (que editan el jsonb directo) por una **lista agrupada por rol** dentro de la sección "Documentos legales — alta de empleados".
  - Cada rol con sus documentos asignados: card con titulo, número, fecha, notario, badge `default`, botones "Ver documento" / "Marcar como default" / "Desasignar".
  - Para roles sin documentos asignados: card vacía con dropdown "Asignar documento" (búsqueda contra `erp.documentos` filtrado por `empresa_id` + tipo legal) + link "o súbelo en `/<empresa>/admin/documentos`" (CTA al módulo de Documentos).
  - Si la extracción del doc seleccionado falta algún campo canónico, mostrar warning amigable: "Este documento no tiene capturado el [campo]. Ábrelo en Documentos para completarlo".
  - Mantiene el flujo actual de "Editar manual" como fallback de emergencia para empresas que aún no han subido sus PDFs (legacy mode), pero con un banner sugiriendo que migren a la liga.
  - Smoke test: en una empresa con sus actas en Documentos, asignar la constitutiva y un poder general → verificar que el caché en `core.empresas` se llena correctamente y que `/rdb/rh/personal` desbloquea "Nuevo empleado".

- [ ] **Sprint 5 — Migración operativa (sin código)**:
  - **DILESA**: ya tiene sus documentos en el módulo (presunción de Beto). Sprint = entrar a `/settings/empresas/dilesa`, asignar la constitutiva al rol `acta_constitutiva`, asignar el poder principal a `poder_general_administracion` con `es_default=true`. Verificar que el caché se sincroniza.
  - **RDB / ANSA / COAGAN**: subir las escrituras y poderes vigentes a `/<empresa>/admin/documentos`. La extracción IA los procesa. Después asignarlos en `/settings/empresas/[slug]`.
  - Cierra iniciativa cuando las 4 empresas tienen al menos `acta_constitutiva` y `poder_general_administracion` asignados con `es_default=true`.

- [ ] **Sprint 6 — Cleanup (post-rollout)**:
  - Cuando todas las empresas activas tengan referencias asignadas, deprecar el flujo "Editar manual" de jsonb. Mantener las columnas como caché read-only.
  - Documentar la decisión en ADR: "Cómo se ligan los documentos legales a empresas — referencias polimórficas con rol".

## Fuera de alcance v1

- **Múltiples roles abiertos a documentos no notariales** (reglamento interior, política de privacidad, comprobantes de domicilio). Modelo soporta extensión, pero v1 arranca con escrituras/poderes para no inflar el alcance.
- **Permisos no-admin** (comité ejecutivo, accionistas). Beto pidió mantener admin-only mientras se define la matriz general de roles. Sub-iniciativa cross-cutting.
- **Auto-sugerir el rol al asignar** según el `subtipo_meta` del documento. Útil para UX pero no bloqueante; se puede agregar en Sprint 4 si es low-cost.
- **Histórico de asignaciones** (auditoría tipo "este doc estaba asignado al rol X hasta tal fecha, después se cambió a Y"). v1 mantiene `asignado_por` + `asignado_at` y borrados son hard delete; un audit_log más rico queda como sub-iniciativa.
- **Vigencia automática de poderes** (alarma cuando un poder se acerca a vencer). Los poderes mexicanos generalmente no tienen vencimiento explícito (revocables por testimonio); la lógica de "vigente" hoy se infiere de "no revocado". Lógica de vencimiento queda fuera.
- **Sincronización inversa** (editar el caché `core.empresas.escritura_*` actualiza el `subtipo_meta` del documento referenciado). El flujo es siempre `documento → empresa.cache`, nunca al revés. Si el caché está stale, se re-sincroniza al re-asignar.
- **Asignar el mismo documento a varias empresas** (caso edge: poder cruzado donde Beto representa RDB en una junta de DILESA). El modelo soporta múltiples assignments del mismo `documento_id` a distintos `empresa_id`, pero la UX de "documento compartido" queda fuera de v1.

## Métricas de éxito

- **Las 4 empresas vivas tienen `acta_constitutiva` y `poder_general_administracion` asignados con `es_default=true`** y el caché en `core.empresas.escritura_*` sincronizado al final de Sprint 5.
- **`/rdb/rh/personal` desbloquea "Nuevo empleado"** sin necesidad de capturar metadata a mano: el flujo es "subir PDF en Documentos → asignar a la empresa con rol → contratos LFT funcionan".
- **Cada cambio en `core.empresas.escritura_*`** (caché jsonb) tiene su contraparte en `core.empresa_documentos` + se puede trazar al `documento_id` y `archivo_url` del PDF original.
- **Tiempo de captura de un poder nuevo**: subir PDF → IA extrae → asignar rol = ≤ 2 minutos en empresa típica (vs ~5 minutos con el flujo manual de jsonb hoy, asumiendo que el extractor extrae los 5 campos correctamente).
- **0 columnas nuevas en `core.empresas`** durante v1. Si emergen nuevos roles, viven en `core.empresa_documentos` sin tocar el schema base.

## Riesgos / preguntas abiertas

- [ ] **Cobertura de extracción IA para escrituras**: si el extractor actual no produce los 5 campos canónicos en `subtipo_meta`, Sprint 2 se vuelve bloqueante para Sprint 4. Mitigación: arrancar Sprint 2 antes que Sprint 3. Si la extracción es parcial (saca número y fecha pero no notario), v1 puede aceptar captura híbrida (UI permite editar `subtipo_meta` antes de asignar).
- [ ] **CHECK constraint sobre `rol` vs ENUM**: CHECK + texto es más fácil de extender (ALTER constraint) pero no aprovecha el type-safety. Decisión al implementar Sprint 1; tentativamente CHECK con la lista inicial + comentario "agregar nuevos roles aquí".
- [ ] **Triggers DB vs application-code para sincronizar caché**: triggers son atómicos y no se saltan, pero más opacos para debugging y suelen ser quebradizos en cambios de schema. Application code (en el endpoint de asignación) es más explícito pero deja al caché desincronizado si alguien escribe directo a la tabla. Recomendación: trigger DB con función `core.fn_sync_escrituras_cache(empresa_id)` que se llame desde el trigger Y desde un endpoint admin manual de "resincronizar caché" para casos edge.
- [ ] **`subtipo_meta` shape no normalizado**: hoy es jsonb libre. El validador de empresa lee 5 campos específicos (numero, fecha, notario, notaria_numero, distrito). Si los nombres en `subtipo_meta` son distintos (ej. `numero_escritura` vs `numero`), el sync requiere mapping. Sprint 1 audita el shape actual y lo documenta.
- [ ] **Documentos huérfanos al borrar la asignación**: borrar `(empresa_id, documento_id, rol)` no borra el documento — sigue en `erp.documentos`. Comportamiento correcto, pero la UI debe dejarlo claro: "desasignar" ≠ "eliminar PDF".
- [ ] **Constitutiva + reformas en el contrato LFT**: la cadena legal es "constitutiva + todas las reformas vigentes". El printable de contrato hoy lee solo un objeto `escrituraConstitutiva`. ¿El caché refleja la última reforma o la constitutiva original? Decisión tentativa: el caché siempre apunta al `acta_constitutiva` original (que tiene los datos de identidad social), las reformas se referencian por separado y aparecen en la UI pero no en el contrato. Confirmar al implementar Sprint 4.
- [ ] **Flujo "subir nuevo documento" desde dropdown**: si abrimos un drawer/modal contextual del módulo de Documentos dentro de `/settings/empresas`, hay riesgo de race condition (el usuario sube, refrescamos la lista, asignamos). Alternativa más simple: link al módulo de Documentos en otra pestaña; el usuario regresa y refresca. Decisión al implementar Sprint 4 según el peso del flujo.
- [ ] **Múltiples poderes default por mismo rol** (caso edge): si hay 3 poderes generales vigentes y todos quieren ser "el de uso estándar" para distintas cosas (uno para contratos, otro para SAT, otro para bancos), `es_default` solo permite uno por rol. ¿Hay que sub-categorizar el rol (`poder_general_administracion_contratos_laborales` vs `poder_general_administracion_sat`)? Beto en B2 dijo "creo que puede haber varios poderes vigentes para una acción determinada, pero el que se utiliza por estándar que sea el que esté definido ahí". Mi lectura: `es_default` por rol, varios vigentes coexistiendo, y los flujos automáticos (alta empleado) usan el default. Si más adelante emerge necesidad de sub-categorías, se agregan roles más finos.
- [ ] **Permisos en el flujo de Documentos** (no en empresa): hoy `/<empresa>/admin/documentos` puede tener su propia matriz de permisos. Asignar un doc a empresa requiere admin de empresa, pero **leer** un doc (para el dropdown de búsqueda) requiere acceso al módulo de Documentos. ¿Conflicto? Probablemente no — solo admin de empresa entra a `/settings/empresas` y solo admin de Documentos sube PDFs. Verificar al implementar.

## Sprints / hitos

| #   | Scope                                                                                                                                                             | Estado    | PR  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --- |
| 0   | Promoción: este doc + fila en INITIATIVES.md                                                                                                                      | _este PR_ | —   |
| 1   | DB schema — `core.empresa_documentos` + RLS + UNIQUE/partial index + trigger sync caché + regenera SCHEMA_REF                                                     | pending   | —   |
| 2   | Auditoría y extensión de extracción IA — confirmar/agregar 5 campos canónicos al `subtipo_meta` de escrituras y poderes; reprocesar docs existentes si hace falta | pending   | —   |
| 3   | API endpoints `/api/empresas/[id]/documentos` (GET/POST/PATCH/DELETE) con sync de caché en transición de `es_default` + tests                                     | pending   | —   |
| 4   | UI "Documentos legales" rediseñada en `/settings/empresas/[slug]`: lista por rol + dropdown asignar + CTA a Documentos + warning si faltan campos canónicos       | pending   | —   |
| 5   | Migración operativa: DILESA asigna sus docs ya cargados; RDB/ANSA/COAGAN suben sus PDFs y los asignan; `/rh/personal` desbloquea alta sin captura manual de jsonb | pending   | —   |
| 6   | Cleanup: deprecar UI de "Editar manual" de jsonb cuando todas las empresas estén migradas; ADR documentando el patrón                                             | pending   | —   |

## Decisiones registradas

### 2026-04-28 — Decisiones cerradas por Beto al promover la iniciativa

- **A1 (modelo de datos): tabla intermedia `core.empresa_documentos`** con `(empresa_id, documento_id, rol, es_default, ...)`, no FK directa en `core.empresas`. Razón: extensible sin agregar columnas al schema base, soporta múltiples roles para el mismo doc, soporta múltiples docs vigentes por rol, mantiene histórico nativo (`asignado_at`).
- **A2 (caché en empresa): mantener jsonb en `core.empresas.escritura_*` como caché sincronizado**. El validador de RH y los printables siguen leyendo del jsonb sin refactor. La asignación/cambio de `es_default` dispara el sync. Razón: cambio incremental, no rompe consumers existentes.
- **B1 (roles iniciales): set fijo extensible.** Arrancamos con `acta_constitutiva`, `acta_reforma`, `poder_general_administracion`, `poder_actos_dominio`, `poder_pleitos_cobranzas`, `poder_bancario`, `representante_legal_imss`. Texto con CHECK constraint (ampliable por ALTER) en lugar de ENUM (que requiere migración por cada nuevo valor).
- **B2 (vigencia múltiple): varios documentos pueden estar vigentes para un mismo rol**, pero exactamente uno se marca `es_default=true` por `(empresa_id, rol)`. Los flujos automáticos (alta empleado, contrato LFT) usan el default. UX permite cambiar default sin desasignar los demás.
- **C1 (validación): validar contra los 5 campos del documento referenciado** (numero, fecha, notario, notaria_numero, distrito). Si el `subtipo_meta` del doc no los tiene, el flujo de RH bloquea (y la UI sugiere abrir el doc en Documentos para completar la captura).
- **C2 (extracción IA): el extractor actual entiende el documento entero**; v1 verifica que el `subtipo_meta` resultante incluya los 5 campos canónicos para escrituras/poderes y los agrega si faltan. No es un rewrite del extractor; es una extensión del schema zod del subtipo legal.
- **D1 (UX asignar): dropdown con búsqueda** entre los documentos ya cargados en `/<empresa>/admin/documentos`, filtrados por tipo legal. Si no aparece el documento esperado, leyenda "súbelo en módulo de Documentos" con link al módulo. No abrimos un sub-flujo de upload contextual en v1.
- **D2 (UX read-only): metadata + botón "Ver documento"** (consistente con `csf_url` existente). No preview inline de PDF en v1.
- **E1 (alcance documentos legales): arrancar con escrituras/poderes**, modelo extensible para reglamento interior, comprobantes de domicilio, política de privacidad, etc. en sub-iniciativas futuras.
- **E2 (migración operativa): DILESA tiene sus docs cargados** (Sprint 5 entra a asignar); RDB/ANSA/COAGAN suben primero (parte del mismo Sprint 5).
- **E3 (constitutiva + reformas): se referencian todas**. El caché para el contrato LFT apunta a la `acta_constitutiva` original (identidad social estable); las reformas se ven en la UI pero no en el printable v1.
- **F1 (permisos): solo admin v1**. Apertura a comité ejecutivo / accionistas queda como sub-iniciativa cross-cutting cuando se defina la matriz completa de "acciones admin-only" del repo.

## Bitácora
