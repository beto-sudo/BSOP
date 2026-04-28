# Iniciativa — Shared modules refactor (cross-empresa)

**Slug:** `shared-modules-refactor`
**Empresas:** todas (ANSA, DILESA, RDB, COAGAN — y futuras)
**Schemas afectados:** n/a (UI)
**Estado:** done
**Dueño:** Beto
**Creada:** 2026-04-27
**Última actualización:** 2026-04-27 (cierre — Sub-PR 5 mergeado)

## Problema

Auditoría cross-empresa del 2026-04-27 detectó que **proveedores rompió
una convención que el resto del repo cumple**: módulos cross-empresa
deben tener un page chico (~30 líneas) que delega a un componente
compartido en `components/<modulo>/`, parametrizado por
`empresaId / empresaSlug / logoPath / permissionSlug / título`.

### Tabla de auditoría (RDB ↔ DILESA)

| Page                                 | RDB líneas | DILESA líneas | Sim      | Estado                                                                                                   |
| ------------------------------------ | ---------- | ------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `proveedores/page.tsx`               | 1579       | 1578          | **100%** | 🚨 Tier S — 1535 líneas duplicadas literal; refactor mecánico                                            |
| `admin/juntas/[id]/page.tsx`         | 1801       | 1817          | **88%**  | 🔴 Tier A — ~1346 líneas duplicadas; 12% divergencia legítima a clasificar                               |
| `inicio/juntas` ↔ `rdb/admin/juntas` | 504        | 502           | **81%**  | 🟡 Tier B — además existe `dilesa/admin/juntas` (687 líneas) con 59% sim — triángulo a auditar           |
| `rh/empleados/[id]/page.tsx`         | 679        | 1441          | 61%      | 🟡 Tier C — DILESA al doble; tiene features extra (contrato/finiquito); auditar antes de refactor masivo |
| `admin/juntas/page.tsx`              | 502        | 687           | 59%      | 🟡 Tier B — DILESA divergió; auditar dentro de Sub-PR 3                                                  |
| `rh/departamentos/page.tsx`          | 19         | 19            | 79%      | ✅ Cumple — delega a `<DepartamentosModule>`                                                             |
| `rh/empleados/page.tsx`              | 18         | 21            | 72%      | ✅ Cumple — delega a `<EmpleadosModule>`                                                                 |
| `rh/puestos/page.tsx`                | 20         | 21            | 79%      | ✅ Cumple — delega a `<PuestosModule>`                                                                   |
| `admin/tasks/page.tsx`               | 14         | 19            | 67%      | ✅ Cumple — delega                                                                                       |
| `admin/documentos/page.tsx`          | 18         | 14            | 63%      | ✅ Cumple — delega                                                                                       |

> Pages que solo existen en una empresa (Cortes/Ventas/Inventario/Productos
> en RDB; Terrenos/Proyectos/Prototipos/Anteproyectos en DILESA) NO son
> candidatos — son módulos genuinamente single-empresa.

### Riesgo concreto

- Cualquier bug fix en proveedores debe aplicarse a 2 archivos. Alguien
  va a olvidar uno y producirse drift entre RDB y DILESA en producción.
- ANSA o COAGAN pueden pedir Proveedores cualquier día → triplicamos /
  cuadruplicamos la deuda en hardware.
- Cuando arranque `forms-pattern` (siguiente UI), el form de proveedores
  necesita migrar en 2 lugares en vez de 1.

### Por qué pasó

`proveedores-csf-ai` (cerrada 2026-04-27, 7 PRs) priorizó velocidad de
entrega del feature OCR + DB + endpoints. La extracción a componente
shared se postergó implícitamente y nunca se hizo. **Sin un ADR
explícito de la convención, no es obvio que extraer es la regla.** Este
es el ADR que cierra el gap.

## Outcome esperado

- Pages cross-empresa con ≥50 líneas duplicadas migran a la convención:
  page de ~30 líneas + componente shared parametrizado.
- ADR-011 codifica la convención y los criterios de "cuándo aplica" /
  "cuándo no aplica" / "excepción documentada".
- Bug fixes en módulos cross-empresa se hacen 1 vez (no N veces por
  empresa).
- Code review tiene check binario: ¿este PR duplica JSX entre dos pages
  de empresa? Si sí, requiere extraer.
- Cuando ANSA o COAGAN entren al repo, agregar Proveedores / Juntas /
  RH es ~30 líneas de page + props del componente shared.

## Alcance v1

### Sub-PR 1 — `proveedores-shared` (Tier S, mecánico)

**Objetivo:** extraer 1535 líneas duplicadas literal entre
`app/rdb/proveedores/page.tsx` y `app/dilesa/proveedores/page.tsx` a un
componente compartido. Sin cambiar lógica, sin tocar el form pattern
(eso queda para `forms-pattern` después).

**Alcance:**

- Crear `components/proveedores/proveedores-module.tsx` con todo el JSX
  - lógica que hoy está duplicado en los dos pages.
- Props del componente: `empresaId`, `empresaSlug` (`'rdb' | 'dilesa'`),
  `logoPath`, `membreteAlt`, `permissionSlug` (`'rdb.proveedores' |
'dilesa.proveedores'`).
- Extraer también helpers compartidos a `components/proveedores/`
  (probable: `csf-diff-fields.ts`, `helpers.ts`).
- `app/rdb/proveedores/page.tsx` y `app/dilesa/proveedores/page.tsx`
  quedan en ~30 líneas cada uno: `<RequireAccess>` wrapper +
  `<ProveedoresModule {...props} />`.
- Sin cambios funcionales: smoke en RDB y DILESA confirma que todo
  sigue igual (alta nueva con CSF, modal de diff, lista, edit, archive).
- Verificar que `RDB_EMPRESA_ID` hardcoded se reemplaza con prop —
  consistente con el patrón de DILESA que importa `DILESA_EMPRESA_ID`
  desde `@/lib/dilesa-constants`. Si no hay equivalente para RDB, crear
  `@/lib/rdb-constants.ts` paralelo (alineado con la convención).

**Estimación:** sesión corta de CC (1-2 PRs internos si conviene split).

**Riesgo:** bajo. Es refactor de extracción mecánica con smoke de
"funciona igual". Tests existentes (si los hay) no requieren cambios.

### Sub-PR 2 — ADR-011

**Objetivo:** codificar la convención que hoy es de facto en RH y se
viola en proveedores.

**Ubicación:** `docs/adr/011_shared_modules_cross_empresa.md`.

**Estructura mínima:**

- Status: Accepted. Date: la fecha de mergeo. Authors: Beto, Claude Code.
- Contexto: lo de proveedores como ejemplo concreto, RH como ejemplo
  de cumplimiento.
- Decisión: la convención (page ≤ ~30 líneas + componente shared en
  `components/<modulo>/<modulo>-module.tsx`).
- Reglas (5 esperadas, SM1–SM5):
  - **SM1 — Page cross-empresa = wrapper de delegate.** Si dos o más
    empresas renderizan el mismo módulo, cada page de `app/<empresa>/<modulo>/page.tsx`
    debe ser ~30 líneas: `<RequireAccess>` + `<XModule {...props} />`.
  - **SM2 — Componente shared vive en `components/<modulo>/`.** No
    en `app/_shared/` ni en `lib/`. La convención existente de RH es
    el patrón.
  - **SM3 — Props parametrizan diferencias cosméticas.** `empresaId`,
    `empresaSlug`, `logoPath`, `permissionSlug`, `title`, etc. Si una
    diferencia es de **lógica** (no cosmética), o se prop-iza
    explícitamente o se documenta como excepción.
  - **SM4 — Cuándo NO aplica.** Módulos genuinamente single-empresa
    (Cortes RDB, Terrenos DILESA, Inventario RDB) — no hay
    duplicación a evitar. Excepciones legítimas (ej. RH empleados
    detail con DILESA al doble por features extra como
    contrato/finiquito) se documentan con JSDoc al inicio del page.
  - **SM5 — Code review enforza.** Cualquier PR que cree o modifique
    un page cross-empresa con > ~50 líneas de JSX inline debe
    justificar (es excepción) o extraer (es duplicación nueva).
    Reviewer rechaza si no.
- Consecuencias: positivas (mantenibilidad, ANSA/COAGAN cuestan ~30
  líneas), negativas (un nivel de indirección por componente shared
  vs page directo — aceptable por la convención de RH ya cumplida).

**Estimación:** ~30 minutos de CC dentro del Sub-PR 1 (mismo PR o
follow-up).

### Sub-PR 3 — `juntas-detail-shared` (Tier A, requiere análisis)

**Objetivo:** extraer las ~1346 líneas duplicadas entre
`app/rdb/admin/juntas/[id]/page.tsx` y `app/dilesa/admin/juntas/[id]/page.tsx`
(88% sim, 1801/1817 líneas).

**Alcance:**

- **Análisis primero (no migrar de inmediato):** clasificar los ~464
  diff lines en 3 categorías:
  - **Cosmético/config** — empresa_id, logo, copy, slug. Va a props.
  - **Lógica divergente legítima** — features que existen en una empresa
    y no en otra. Va a props con flags (`features={['feature-x']}`)
    o a branches en el componente.
  - **Drift puramente accidental** — código que debería ser idéntico
    pero divergió por bugs / merges / olvidos. Se unifica en la
    versión correcta.
- Una vez clasificado, extraer a
  `components/juntas/junta-detail-module.tsx` (probable; o
  `components/admin/juntas/junta-detail-module.tsx` si conviene
  separación admin).
- Pages quedan en ~30 líneas con props.

**Estimación:** sesión más larga (análisis + extracción cuidadosa). 1-2
PRs internos.

**Riesgo:** medio. La divergencia del 12% requiere clasificación
correcta para no perder features ni mezclar bugs. Smoke exhaustivo
post-merge en ambas empresas.

### Sub-PR 4 — `juntas-list-shared` (Tier B, auditar primero)

**Objetivo:** resolver el triángulo `inicio/juntas` ↔
`rdb/admin/juntas` ↔ `dilesa/admin/juntas` (3 lugares: 504/502/687
líneas, sim 59-81%).

**Alcance:**

- **Auditoría primero:** ¿son 3 vistas del mismo módulo o son 2 módulos
  distintos (admin vs inicio)?
  - Si son 3 vistas del mismo dataset con ligeras diferencias (filtros,
    permisos, copy), → `<JuntasListModule mode={'inicio' | 'admin'}>`.
  - Si Inicio es vista personal y admin es vista global → posible que
    sean dos componentes hermanos (`<MisJuntasList>` vs
    `<AdminJuntasModule>`) que comparten un sub-componente
    (`<JuntasTable>` ya documentado pendiente de
    `data-table` Fase 2).
- Migrar según el resultado del análisis.

**Estimación:** sesión corta-media. Empieza con audit; si el resultado
es "no extraer porque son módulos distintos", el Sub-PR cierra con
JSDoc en cada page documentando la decisión.

**Riesgo:** bajo. La auditoría puede concluir que NO refactor — eso
también es entregable válido (decisión documentada).

### Sub-PR 5 — `empleados-detail-audit` (Tier C, auditoría sin compromiso)

**Objetivo:** decidir si `app/rdb/rh/empleados/[id]/page.tsx` (679
líneas) y `app/dilesa/rh/empleados/[id]/page.tsx` (1441 líneas) deben
unificarse o quedarse separados.

**Alcance:**

- DILESA al doble que RDB sugiere features extras (`contrato/page.tsx`
  y `finiquito/page.tsx` ya están "Solo DILESA", probablemente
  consumidas desde el `[id]/page.tsx` de DILESA).
- Si la deuda real (líneas duplicadas literal) es < 200 líneas, dejar
  como excepción documentada con JSDoc al inicio de cada page
  explicando la asimetría.
- Si la deuda es > 200 líneas duplicadas, extraer la base común a
  `<EmpleadoDetailModuleBase>` y dejar features extras de DILESA en un
  wrapper (`<DilesaEmpleadoDetail>` que extiende la base).

**Estimación:** sesión corta. Audit + decisión + JSDoc o pequeña
extracción.

**Riesgo:** muy bajo. Es ejercicio de decisión con código real.

## Fuera de alcance

- **`forms-pattern` retro-migración** — sigue siendo iniciativa aparte
  (siguiente en cola UI). Una vez que `<ProveedoresModule>` extraiga,
  el form de proveedores migra a `<Form>` + zod + RHF en el PR de
  adopción de `forms-pattern`. NO se mezcla con shared-modules.
- **`drawer-anatomy` retro-migración** — el `Sheet` del flujo de alta
  de proveedores es candidato natural para `<DetailDrawer>` cuando
  arranque esa iniciativa. Idem: NO se mezcla con shared-modules.
- **Refactor de Inicio dashboards / landings** — `app/page.tsx`,
  `app/rdb/page.tsx`, `app/dilesa/page.tsx` son distintos por diseño
  (cada empresa tiene su landing). No aplica la convención.
- **Renombrar archivos / paths existentes** que ya cumplen la
  convención. RH se queda como está.

## Métricas de éxito

- Cero pages cross-empresa con > ~50 líneas de JSX inline duplicado.
  Verificable con script `scripts/audit-cross-empresa.sh` (sub-tarea
  oportunista — no bloqueante).
- ADR-011 mergeado y referenciable.
- Tiempo de agregar un módulo a una empresa nueva (cuando ANSA o
  COAGAN entren) es ~30 líneas de page + props.
- Bug fix futuro en proveedores se aplica 1 vez, no 2.

## Riesgos / preguntas abiertas

- [ ] **Constantes de empresa hardcoded vs imports.** RDB usa
      `RDB_EMPRESA_ID = '...'` hardcoded; DILESA importa de
      `@/lib/dilesa-constants`. Inconsistencia. **Decisión sugerida:**
      crear `@/lib/empresa-constants.ts` (o equivalente) que exporta
      todos los IDs (`ANSA_EMPRESA_ID`, `DILESA_EMPRESA_ID`,
      `RDB_EMPRESA_ID`, `COAGAN_EMPRESA_ID`). Sub-PR 1 lo crea si no
      existe. Sub-tarea: deprecar / borrar `@/lib/dilesa-constants` a
      favor del archivo nuevo.
- [ ] **Path del componente shared.** ¿`components/proveedores/` o
      `components/erp/proveedores/`? La convención de RH es
      `components/rh/<x>-module.tsx` — sin sub-namespace. Mantener.
- [ ] **Coordinación con `forms-pattern`.** Si `forms-pattern` arranca
      durante shared-modules-refactor, conflicto en el form de
      proveedores. **Mitigación:** shared-modules-refactor termina
      Sub-PR 1 ANTES de que `forms-pattern` arranque. La cola UI
      respeta este orden.
- [ ] **Tests / CI.** Sub-PRs son refactors mecánicos sin cambios
      funcionales — los tests existentes deben pasar sin modificación.
      Si algún test rompe, el refactor introdujo regresión, no es
      bug aceptable.
- [ ] **Smoke obligatorio en ambas empresas.** Cada Sub-PR requiere
      smoke en RDB y DILESA antes de mergear. No vale "compiló y CI
      verde" — el ojo humano valida que el module se ve igual.

## Sprints / hitos

- **Sub-PR 1 — `proveedores-shared`** (2026-04-27): mergeado en PR
  pendiente. Componente `<ProveedoresModule>` extraído a
  `components/proveedores/proveedores-module.tsx`. Pages reducidos a
  ~17 líneas. Constantes centralizadas en `lib/empresa-constants.ts`.
  Incluye ADR-011 (convención SM1-SM5).
- **Sub-PR 2 — ADR-011** (2026-04-27): incluido en el mismo PR del Sub-PR 1
  (decisión: mismo PR para que la convención salga junto al primer ejemplo
  cumplido — ver §Decisiones registradas).
- **Sub-PR 3 — `juntas-detail-shared`** (2026-04-27): mergeado en PR
  pendiente. Componente `<JuntaDetailModule>` extraído a
  `components/juntas/junta-detail-module.tsx`. Pages reducidos a 12
  líneas. Análisis previo clasificó las ~464 líneas de divergencia en
  3 categorías (cosmético / lógica divergente legítima / drift
  accidental) — ver §Decisiones registradas para cómo se resolvió cada
  una.
- **Sub-PR 4 — `juntas-list-shared`** (2026-04-27): mergeado en PR
  pendiente. Auditoría previa concluyó que `inicio/juntas` es módulo
  distinto (vista personal multi-empresa) — no extraer. RDB+DILESA
  admin sí se extrajeron a `<AdminJuntasListModule>` adoptando la
  versión DILESA como fuente correcta (RDB hereda auto-title, filtro
  por mes, content preview, task counts granulares avanzadas/terminadas).
  Pages reducidos a ~14 líneas. Bug de `<RequireAccess empresa="rdb">`
  hardcoded en ambos pages de `/inicio/juntas` (lista + detalle)
  arreglado oportunísticamente.
- **Sub-PR 5 — `empleado-detail-shared`** (2026-04-27): mergeado en PR
  pendiente. La auditoría inicial (Tier C, "decidir si extraer o quedarse
  separados") escaló al darnos cuenta de que **contrato y finiquito
  aplicaban a todas las empresas, no solo a DILESA** (Beto). El alcance
  cambió de Tier C a Tier A: extracción + rollout cross-empresa.
  Componente `<EmpleadoDetailModule>` extraído a
  `components/rh/empleado-detail-module.tsx` (~1100 líneas) adoptando
  DILESA como base canónica — RDB hereda beneficiarios (Art. 501 LFT),
  documentos/adjuntos, notas, contrato individual, finiquito y baja con
  generación de finiquito. Componentes nuevos
  `<EmpleadoContratoModule>` y `<EmpleadoFiniquitoModule>` con la misma
  arquitectura. `PATRON_DILESA` (fallback hardcoded) eliminado de
  `contrato-printable.tsx` y `finiquito-printable.tsx`. Validación
  centralizada en `lib/rh/datos-fiscales-empresa.ts`. Pages reducidos a
  ~5 líneas cada uno (DILESA y RDB × 3 rutas: detalle, contrato,
  finiquito = 6 pages). RDB ganó las rutas `/contrato` y `/finiquito`
  como ciudadano de primera clase. ADR-011 actualizado con SM6 (cero
  fallback hardcoded en módulos legales).

## Decisiones registradas

- **2026-04-27 — Sub-PR 2 (ADR-011) en el mismo PR que Sub-PR 1.** Razón:
  el ADR codifica la convención y el código demuestra cumplimiento. Mismo
  PR = audit trail directo + reviewer ve la convención y su primer
  ejemplo en una sola pasada. La alternativa (PR aparte) hubiera sido más
  reviewable pero introduce orden de mergeo (qué entra primero) sin
  beneficio claro.
- **2026-04-27 — `lib/empresa-constants.ts` solo exporta IDs reales.**
  ANSA y COAGAN no se exportan como placeholders (UUID de ceros) porque
  un import prematuro compilaría pero apuntaría a un UUID inválido,
  generando bugs sutiles si alguien lo usa antes de que la empresa entre
  al repo. Cuando ANSA/COAGAN entren, se agregan las constantes con sus
  UUIDs reales en ese momento.
- **2026-04-27 — `lib/dilesa-constants.ts` re-exporta el const desde
  `lib/empresa-constants.ts` y queda marcado como legacy.** Razón: 30+
  call sites del repo importan de `@/lib/dilesa-constants` (incluye
  componentes, scripts, e2e tests). Cambiar todos en este PR sería churn
  fuera del alcance del Sub-PR 1 y aumentaría la superficie de revisión.
  La re-exportación garantiza single source of truth para el UUID; los
  call sites pueden migrar gradualmente sin un PR mecánico masivo.
- **2026-04-27 — `permissionSlug` no entra como prop del componente
  shared.** Razón: el `<RequireAccess empresa="..." modulo="...">` ya
  vive en el page (responsabilidad del routing). Pasarlo también como
  prop al componente shared introduce ruido (prop unused triggerea
  warning de lint) sin valor agregado. Queda reflejado en SM3 del
  ADR-011 ("Permisos no se duplican como prop").
- **2026-04-27 — Bug encontrado y arreglado durante extracción:** el
  modal de RFC duplicado en `app/dilesa/proveedores/page.tsx` decía
  hardcoded "ya está registrado como proveedor activo en RDB" — texto
  copy-pasteado del page de RDB sin actualizar. Resuelto en el componente
  shared usando `empresaSlug.toUpperCase()` como label dinámico ("RDB" o
  "DILESA"). Es exactamente el tipo de drift accidental que SM5 quiere
  evitar a futuro.

### Sub-PR 3 — juntas-detail-shared (2026-04-27)

- **Sub-PR 3 — Validación estricta al crear tarea desde junta (opción A
  del análisis previo).** Razón: el schema de `erp.tasks` permite NULL
  para `prioridad`, `asignado_a`, `fecha_vence` (la única columna NOT
  NULL es `titulo`). DILESA exigía los 3 campos al crear tarea desde
  junta, RDB solo exigía `titulo`. Beto eligió adoptar DILESA → mejor
  disciplina de datos: cada tarea creada desde una junta tiene dueño,
  prioridad y fecha. RDB heredera la validación al unificar.
- **Sub-PR 3 — Drift `fecha_vence` vs `fecha_compromiso` resuelto
  escribiendo ambos en el insert.** Razón: `erp.tasks` tiene los dos
  campos. El handler de _update_ ya escribía ambos en sync (RDB L965-966
  y DILESA L911-913) — solo el _create_ había divergido (RDB → solo
  `fecha_vence`, DILESA → solo `fecha_compromiso`). El componente shared
  unifica al patrón del update: ambos campos siempre en sync, cero
  pérdida funcional.
- **Sub-PR 3 — Bugs en RDB arreglados oportunísticamente al adoptar
  patrones de DILESA:**
  - **Auto-save de notas no normalizaba URLs**: RDB persistía signed
    URLs de Supabase (TTL 6h) en `juntas.descripcion`; al expirar, las
    imágenes embebidas se rompían. DILESA llamaba
    `normalizeHtmlImagesToPaths()` antes de persistir. El componente
    shared adopta el patrón de DILESA — RDB hereda el fix.
  - **Editor readiness con race condition**: RDB hidrataba el contenido
    inicial dentro de `fetchAll`, lo que podía dispararse antes de que
    el editor TipTap estuviera listo. DILESA lo había sacado a un
    `useEffect` separado dependiente de `editor`. Adoptado en el
    shared.
  - **`selectedPersonaId` state local innecesario**: RDB tenía state
    local para el ID del Combobox antes de agregar participante (paso
    intermedio + click en botón). DILESA usaba el `onChange` del
    Combobox directamente. Adoptado el patrón de DILESA — un click
    menos.
  - **Title del checkbox "Enviar a Consejo" decía hardcoded
    `consejo@dilesa.mx` en ambos pages**, incluyendo RDB. Era drift
    accidental por copy-paste. El componente shared usa mensaje
    genérico ("al correo del consejo configurado para esta empresa")
    porque el mapeo real de email vive server-side en
    `lib/juntas/email.ts` (`CONSEJO_EMAIL_BY_EMPRESA`) y no es
    apropiado importar al cliente.
- **Sub-PR 3 — `useMemo` para opciones de combobox adoptado.**
  DILESA optimizaba `empleadoOptions` y `availablePersonaOptions` con
  `useMemo`; RDB no. El shared adopta — perf win neto en re-renders.
- **Sub-PR 3 — `JuntaDetailModule` solo recibe `empresaSlug` como
  prop.** Razón: el `empresa_id` se lee de `juntaData.empresa_id` (ya
  está en la fila de juntas, no necesita hardcodearse), y no hay logo
  ni branding visual específico por empresa en este módulo. Una sola
  prop alcanza para construir la URL de retorno (`/${empresaSlug}/admin/juntas`).
  Cumple SM3 con la API mínima posible.

### Sub-PR 4 — juntas-list-shared (2026-04-27)

- **Sub-PR 4 — Auditoría previa concluyó: 2 módulos distintos, no 3.**
  Los 3 archivos (`inicio/juntas`, `rdb/admin/juntas`, `dilesa/admin/juntas`)
  parecían un triángulo cross-empresa pero no lo son: `inicio/juntas` es
  vista personal multi-empresa (filtra por empresas del usuario actual,
  query distinta, navegación distinta). RDB+DILESA admin sí son el mismo
  módulo. El Sub-PR extrajo solo el admin, no Inicio. Inicio queda como
  módulo standalone — alineado con el patrón de `/inicio/tasks` que está
  documentado como "sin RequireAccess porque el dashboard personal es
  para todo usuario logueado".
- **Sub-PR 4 — DILESA es la versión correcta; RDB se iguala.** Beto
  decidió adoptar todas las features de DILESA para ambas empresas en
  vez de feature-flags opcionales. RDB hereda: auto-title generation
  (`generateTitulo()` con formato ISO + "9:05 AM - Tipo"), filtro por
  mes, columna `JuntaContentPreview` con conteo de imágenes y excerpt
  plain-text de descripción, columnas Avanzadas/Terminadas para task
  counts granulares, búsqueda en descripción además del título, UX de
  Sheet con flujo "Iniciar Junta" en lugar de Dialog modal. La
  alternativa (feature flags por empresa) hubiera sido sobre-ingeniería
  para una deuda que se resuelve más limpio igualando comportamiento.
- **Sub-PR 4 — `JuntaContentPreview` se mantiene como columna TEMP
  documentada.** Es deuda de la migración Coda en curso (~2-4 semanas
  restantes). El componente y la columna llevan JSDoc explícito de
  remoción cuando termine el backfill. Cuando esto pase, hay que
  remover una sola sección del componente shared — no N pages.
- **Sub-PR 4 — `<AdminJuntasListModule>` API**: `empresaId`, `empresaSlug`,
  `title`, `subtitle?` (default "Agenda y minutas de juntas"). Sigue el
  mismo patrón mínimo que `<DepartamentosModule>` (RH).
- **Sub-PR 4 — Bug `<RequireAccess empresa="rdb">` hardcoded en
  `/inicio/juntas/page.tsx` y `/inicio/juntas/[id]/page.tsx`.**
  Bloqueaba acceso a usuarios DILESA (sólo RDB podía abrir su dashboard
  personal de juntas). Resuelto quitando el wrap `<RequireAccess>`
  completo, igualando el patrón de `/inicio/tasks` (proxy ya valida
  sesión). Comentario JSDoc explica por qué no hay RequireAccess.

### Sub-PR 5 — empleado-detail-shared (2026-04-27)

- **Sub-PR 5 — Cambio de alcance: de auditoría Tier C a extracción Tier
  A.** Razón: el plan original era "decidir si la asimetría justifica
  wrapper o se queda como excepción documentada (SM4)". Al revisar el
  contrato/finiquito de DILESA con Beto, quedó claro que **contrato y
  finiquito son features estándar para cualquier empresa con empleados
  formales**, no peculiaridades de DILESA. La asimetría que existía era
  porque RDB nunca se rolloutó, no porque la feature aplicara solo a
  DILESA. La decisión fue rolloutear RDB en el mismo PR — más limpio que
  documentar una excepción que iba a desaparecer en el siguiente sprint.
- **Sub-PR 5 — Cero fallback hardcoded; datos fiscales obligatorios.**
  `PATRON_DILESA` (constante hardcoded con datos fiscales reales de
  DILESA en `contrato-printable.tsx`) se eliminó. Razón: era un fallback
  silencioso que generaba contratos con datos de DILESA en empresas que
  no eran DILESA si los datos no estaban capturados — riesgo legal alto.
  Ahora el flujo es:
  1. La empresa captura RFC, registro patronal, representante legal,
     escrituras, domicilio fiscal en `core.empresas` (Settings →
     Empresas).
  2. Sin esos datos, el botón "Nuevo empleado" se deshabilita en RDB
     y los botones "Contrato" / "Finiquito" se deshabilitan en el
     detalle.
  3. La página de contrato/finiquito muestra mensaje claro con la
     lista de campos faltantes y CTA a Settings → Empresas si alguien
     llega por URL directa.
     Esta regla queda codificada como SM6 en ADR-011.
- **Sub-PR 5 — DILESA como base canónica del detail page.** RDB tenía
  679 líneas, DILESA 1441 — DILESA con todas las features (multi-tel,
  contacto emergencia, beneficiarios, documentos, notas, contrato/
  finiquito desde el detalle, baja con generación de finiquito, foto
  con avatar, todos los campos LFT del contrato). RDB hereda todo. Las
  features extras no eran asimetría legítima — eran deuda de
  incompletitud en RDB.
- **Sub-PR 5 — `<EmpleadoDetailModule>` recibe solo `empresaSlug`.**
  Razón: el `empresaId` se lee de `empleado.empresa_id` (ya está en la
  fila), y los datos fiscales se cargan via
  `useDatosFiscalesEmpresa(empresaId)`. El page no necesita pasar más
  contexto. API mínima alineada con SM3.
- **Sub-PR 5 — Validador centralizado en
  `lib/rh/datos-fiscales-empresa.ts`.** Single source of truth de qué
  campos son obligatorios para usar RH formal. Funciones expuestas:
  `camposFaltantes()` (lista de strings), `tieneDatosCompletos()`,
  `buildPatronFromDatos()` (lanza si incompleto), `useDatosFiscalesEmpresa(empresaId)`
  (hook React). Reutilizable por cualquier módulo futuro que necesite
  los datos fiscales (ej. emisión de facturas, recibos de nómina).
- **Sub-PR 5 — Guard de alta solo aplica en single-empresa.** En
  `<EmpleadosModule>` con `scope='user-empresas'` (vista global
  `/rh/personal`) el botón "Nuevo empleado" se deshabilita siempre con
  tooltip "abre la página de la empresa específica". Razón: en multi-
  empresa no hay una sola empresa destino — pasar el empleado a la
  primera del array sería ambiguo. El admin va a `/dilesa/rh/personal`
  o `/rdb/rh/personal` para crear. Es disciplina, no limitación.

## Bitácora

- **2026-04-27 — Sub-PR 1 + ADR-011** (Claude Code, branch
  `feat/proveedores-shared`):
  - Creado `lib/empresa-constants.ts` (RDB + DILESA).
  - Modificado `lib/dilesa-constants.ts` para re-exportar desde el archivo
    centralizado (legacy, marcado en JSDoc).
  - Creado `components/proveedores/proveedores-module.tsx` (1098 líneas
    parametrizadas) con todo el flujo de Proveedores: lista, alta con
    CSF (drag PDF + diff + acepta), edit, archivar/restaurar, dedup por
    RFC, update CSF con diff selectivo.
  - Reducido `app/rdb/proveedores/page.tsx` de 1579 → 17 líneas.
  - Reducido `app/dilesa/proveedores/page.tsx` de 1578 → 17 líneas.
  - Creado `docs/adr/011_shared_modules_cross_empresa.md` codificando la
    convención SM1-SM5.
  - PR #247 mergeado.
- **2026-04-27 — Sub-PR 3** (Claude Code, branch
  `feat/juntas-detail-shared`):
  - Análisis previo del diff (606 líneas) clasificó las divergencias:
    53 cosmético, 196 lógica divergente legítima, 215 drift accidental.
  - Creado `components/juntas/junta-detail-module.tsx` (~1300 líneas)
    con todo el flujo de detalle de junta: edición, participantes,
    notas con TipTap (auto-save + emergency save + polling), tareas
    con avances/diff, terminar/reenviar/eliminar.
  - Reducido `app/rdb/admin/juntas/[id]/page.tsx` de 1801 → 12 líneas.
  - Reducido `app/dilesa/admin/juntas/[id]/page.tsx` de 1817 → 12 líneas.
  - Bugs heredados de RDB arreglados al unificar (auto-save sin
    normalizar, race condition del editor, state innecesario, title
    hardcoded con email de DILESA).
  - PR #248 mergeado.
- **2026-04-27 — Sub-PR 4** (Claude Code, branch
  `feat/juntas-list-shared`):
  - Auditoría previa concluyó: `inicio/juntas` es módulo standalone
    (vista personal multi-empresa) — no extraer. RDB+DILESA admin sí.
  - Creado `components/juntas/admin-juntas-list-module.tsx` (~520 líneas)
    adoptando DILESA como base correcta. RDB hereda: auto-title
    generation, filtro por mes, content preview con conteo de imágenes,
    task counts granulares (avanzadas/terminadas), búsqueda en
    descripción, UX de Sheet con "Iniciar Junta".
  - Reducido `app/rdb/admin/juntas/page.tsx` de 502 → 14 líneas.
  - Reducido `app/dilesa/admin/juntas/page.tsx` de 687 → 14 líneas.
  - Bug `<RequireAccess empresa="rdb">` hardcoded en
    `/inicio/juntas/page.tsx` y `/inicio/juntas/[id]/page.tsx`
    arreglado quitando el wrap (patrón canónico de
    `/inicio/`: sin RequireAccess porque el proxy valida sesión).
  - 4 checks de CI verde local (typecheck, lint sin warnings nuevos —
    los 4 warnings pre-existentes de `/inicio/juntas/[id]/page.tsx` no
    están en mi alcance), format, 222 tests del repo. Pendiente smoke
    manual antes de mergeo.
- **2026-04-27 — Sub-PR 5** (Claude Code, branch
  `feat/empleado-detail-shared-rh-formal`):
  - Cambio de alcance autorizado por Beto en sesión: contrato y
    finiquito aplican para todas las empresas (no solo DILESA), cero
    fallback hardcoded, datos fiscales obligatorios para alta de
    empleado.
  - Creado `lib/rh/datos-fiscales-empresa.ts` con validador
    centralizado (`camposFaltantes`, `tieneDatosCompletos`,
    `buildPatronFromDatos`, `useDatosFiscalesEmpresa`).
  - Eliminado `PATRON_DILESA` de
    `components/rh/contrato-printable.tsx` y removida importación de
    `components/rh/finiquito-printable.tsx`. `patron` ahora es prop
    requerida en ambos printables.
  - Creado `components/rh/empleado-detail-module.tsx` (~1100 líneas)
    parametrizado por `empresaSlug` adoptando DILESA como base canónica
    (todas las features: multi-tel, contacto emergencia, beneficiarios
    Art. 501, documentos, notas, contrato, finiquito, baja+finiquito).
  - Creado `components/rh/empleado-contrato-module.tsx` (~210 líneas)
    y `components/rh/empleado-finiquito-module.tsx` (~330 líneas) con
    bloqueo duro si datos fiscales incompletos (mensaje + CTA a
    `/settings/empresas/<slug>`).
  - Reducido `app/dilesa/rh/personal/[id]/page.tsx` de 1441 → 5 líneas.
  - Reducido `app/rdb/rh/personal/[id]/page.tsx` de 679 → 5 líneas.
  - Reducido `app/dilesa/rh/personal/[id]/contrato/page.tsx` de 232 → 5
    líneas y `/finiquito/page.tsx` de 353 → 5 líneas.
  - Creadas rutas espejo en RDB:
    `app/rdb/rh/personal/[id]/contrato/page.tsx` y
    `/finiquito/page.tsx` (5 líneas cada una).
  - Modificado `components/rh/personal-module.tsx`: botón "Nuevo
    empleado" deshabilitado cuando datos fiscales incompletos (single-
    empresa) o cuando el scope es multi-empresa global.
  - Actualizado ADR-011 con regla SM6 (cero fallback hardcoded en
    módulos legales).
  - DILESA mantiene operación normal porque ya tiene datos fiscales
    completos. RDB queda en estado "datos fiscales pendientes" hasta
    que Beto cargue la CSF (anunciado para el día siguiente).
