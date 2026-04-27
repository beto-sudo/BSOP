# Iniciativa — Shared modules refactor (cross-empresa)

**Slug:** `shared-modules-refactor`
**Empresas:** todas (ANSA, DILESA, RDB, COAGAN — y futuras)
**Schemas afectados:** n/a (UI)
**Estado:** planned
**Dueño:** Beto
**Creada:** 2026-04-27
**Última actualización:** 2026-04-27

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

_(se llena cuando arranque ejecución, vía Claude Code)_

## Decisiones registradas

_(append-only, fechadas — escrito por Claude Code)_

## Bitácora

_(append-only, escrita por Claude Code al ejecutar)_
