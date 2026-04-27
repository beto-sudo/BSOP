# ADR-011 — Módulos compartidos cross-empresa

- **Status**: Accepted
- **Date**: 2026-04-27
- **Authors**: Beto, Claude Code (iniciativa `shared-modules-refactor`)
- **Related**: [ADR-004](../../supabase/adr/004_module_page_layout_convention.md), [ADR-009](./009_detail_page.md), [ADR-010](./010_data_table.md), [planning](../planning/shared-modules-refactor.md)

---

## Contexto

BSOP es multi-empresa: cada empresa (RDB, DILESA, ANSA cuando entre, COAGAN
cuando entre) tiene sus propias rutas bajo `app/<empresa>/`. Muchos módulos
son **funcionalmente idénticos** entre empresas — el mismo CRUD, el mismo
flujo, los mismos componentes shadcn — pero con diferencias cosméticas
(`empresa_id`, logo de impresión, slug del permiso, etiqueta visible).

El equipo ya tenía una convención **de facto** que cumplía RH (departamentos,
empleados, puestos): un page chico de ~17 líneas en `app/<empresa>/rh/<x>/`
que delega a un componente compartido en `components/rh/<x>-module.tsx`,
parametrizado por `empresaId / empresaSlug / title / ...`.

La iniciativa `proveedores-csf-ai` (cerrada 2026-04-27, 7 PRs) priorizó
velocidad de entrega del feature OCR + DB + endpoints y dejó **el módulo
de Proveedores duplicado al 100% entre RDB y DILESA**: 1579 vs 1578 líneas,
1535 idénticas literal, 23 de diff cosmético (empresa_id hardcoded vs
importado, logo path, alt text, permission slug, label en un modal). Ver
auditoría completa en [docs/planning/shared-modules-refactor.md](../planning/shared-modules-refactor.md).

Sin un ADR explícito de la convención no era obvio que extraer es la regla.
Cuando la pregunta es "¿el patrón cumplido por RH es la convención del repo
o es coincidencia?", la respuesta debe ser inequívoca. Este ADR cierra ese
gap.

## Decisión

Cuando dos o más empresas renderizan el mismo módulo, el patrón es:

1. **Un componente compartido** vive en `components/<modulo>/<modulo>-module.tsx`
   con la lógica + JSX completo del módulo, parametrizado por props.
2. **Un page por empresa** de ~30 líneas en `app/<empresa>/<modulo>/page.tsx`,
   wrappea con `<RequireAccess>` y delega al componente shared con las
   props específicas de esa empresa.
3. **Los UUIDs de empresa** viven centralizados en `@/lib/empresa-constants`
   (single source of truth).

Ejemplo ya cumpliendo la convención (RH, antes de este ADR):

```tsx
// app/rdb/rh/departamentos/page.tsx — 19 líneas
export default function Page() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.rh.departamentos">
      <DepartamentosModule
        empresaId={RDB_EMPRESA_ID}
        empresaSlug="rdb"
        title="Departamentos — Rincón del Bosque"
        showEmpleadosCount
      />
    </RequireAccess>
  );
}
```

Ejemplo nuevo cumplido por este ADR (Proveedores):

```tsx
// app/rdb/proveedores/page.tsx — 17 líneas
export default function Page() {
  return (
    <RequireAccess empresa="rdb" modulo="rdb.proveedores">
      <ProveedoresModule
        empresaId={RDB_EMPRESA_ID}
        empresaSlug="rdb"
        logoPath="/membrete-rdb.jpg"
        membreteAlt="Membrete Rincón del Bosque"
      />
    </RequireAccess>
  );
}
```

### Las 5 reglas (SM1–SM5)

#### SM1 — Page cross-empresa = wrapper de delegación

Si dos o más empresas renderizan el mismo módulo, cada page de
`app/<empresa>/<modulo>/page.tsx` debe ser un wrapper corto (~30 líneas o
menos) que:

- Wrappea con `<RequireAccess empresa="..." modulo="...">` para gating de
  permisos.
- Renderiza `<XModule {...propsEmpresaEspecificos} />` adentro.

No hay JSX inline duplicado entre pages. No hay handlers, useState, ni
queries en el page. **Si lo querés en los dos pages, va al componente
shared**.

#### SM2 — Componente shared vive en `components/<modulo>/`

El componente compartido vive en `components/<modulo>/<modulo>-module.tsx`.

- **No** en `app/_shared/`.
- **No** en `lib/` (lib es para utilidades sin JSX).
- **No** con sub-namespace por empresa (ej. `components/rdb/proveedores/`)
  — el componente es cross-empresa por definición.

Si el módulo tiene helpers/types/sub-componentes específicos del módulo,
viven en archivos hermanos en el mismo folder
(`components/<modulo>/helpers.ts`, `components/<modulo>/types.ts`, etc.).

#### SM3 — Props parametrizan diferencias cosméticas

Las diferencias entre empresas se modelan como props del componente shared:

- **Identidad de la empresa**: `empresaId: string`, `empresaSlug: '<slug1>' | '<slug2>'`.
- **Branding visible**: `logoPath`, `membreteAlt`, `title`, `subtitle`.
- **Flags de feature**: `showEmpleadosCount?: boolean`, `features?:
('contrato' | 'finiquito')[]`, etc. — solo cuando una empresa tiene
  features que otra no.

**Permisos no se duplican como prop.** El `<RequireAccess empresa="..."
modulo="...">` vive en el page (es responsabilidad del routing decidir
quién puede entrar). El componente shared no recibe `permissionSlug` —
agregarlo sería ruido sin uso interno.

Las constantes de empresa se importan de `@/lib/empresa-constants`. Cada
nueva empresa que entre al repo agrega su `<X>_EMPRESA_ID` ahí.

Si una diferencia entre empresas no es cosmética sino lógica genuinamente
divergente, las opciones son (en orden de preferencia):

1. **Prop con flag/feature switch** (`features={['x']}`). Preferido cuando
   la divergencia es comportamiento opcional.
2. **Branch interno por `empresaSlug`**. Aceptable cuando el branch es
   chico y cohesivo.
3. **Excepción documentada** con JSDoc al inicio del page: cuándo y por
   qué este page no puede compartir. Ver SM4.

#### SM4 — Cuándo NO aplica

Esta convención **no aplica** cuando:

- **Módulos genuinamente single-empresa**. Cortes/Ventas/Inventario/Productos
  son solo de RDB; Terrenos/Proyectos/Prototipos/Anteproyectos son solo de
  DILESA. No hay duplicación a evitar.
- **Landings de empresa**. `app/<empresa>/page.tsx` es la home de la
  empresa, intencionalmente distinta entre empresas (cards, KPIs, branding
  específico).
- **Excepciones legítimas con asimetría grande**. Ej: si DILESA tiene
  detalle de empleados al doble por features extra (contrato/finiquito) y
  la deuda real de duplicación literal queda < 200 líneas, se documenta
  como excepción con JSDoc al inicio de cada page explicando la asimetría.

Si la deuda asimétrica supera ~200 líneas duplicadas, la solución es
extraer la base común a `<XModuleBase>` y dejar features extras en wrappers
por empresa que extiendan la base.

#### SM5 — Code review enforza

Cualquier PR que cree o modifique un page cross-empresa con > ~50 líneas de
JSX inline debe:

- **Justificar la excepción** (con JSDoc al inicio del page citando
  SM4) — _o_ —
- **Extraer al componente shared** correspondiente.

Reviewer rechaza si no.

Cuando una empresa nueva entra al repo (ANSA o COAGAN) y necesita un
módulo que ya existe en RDB/DILESA, agregar la empresa cuesta ~30 líneas
de page nuevo + extender props del componente shared si hay cosmética
nueva.

## Implementación

Este ADR se adopta como parte del Sub-PR 1 de la iniciativa
`shared-modules-refactor`:

- Componente nuevo: `components/proveedores/proveedores-module.tsx`.
- Pages reducidos: `app/rdb/proveedores/page.tsx` y
  `app/dilesa/proveedores/page.tsx` (ambos ~18 líneas).
- Constantes centralizadas: `lib/empresa-constants.ts` (RDB y DILESA por
  ahora; ANSA/COAGAN cuando entren).
- `lib/dilesa-constants.ts` re-exporta `DILESA_EMPRESA_ID` desde el archivo
  centralizado para no romper call sites existentes; queda marcado como
  legacy.

Los siguientes Sub-PRs de la iniciativa aplican esta misma convención a
`juntas-detail`, `juntas-list` (Tier B — auditoría primero) y
`empleados-detail` (Tier C — decisión de excepción documentada vs
extracción).

## Consecuencias

### Positivas

- **Mantenibilidad.** Bug fixes en módulos cross-empresa se aplican una vez,
  no N veces por empresa. El riesgo de drift entre RDB y DILESA en producción
  baja a cero (no hay 2 archivos para olvidarse de actualizar).
- **Escalabilidad.** Cuando ANSA o COAGAN entren al repo, agregar
  Proveedores / Juntas / RH cuesta ~30 líneas de page nuevo, no ~1500
  líneas de duplicación.
- **Code review claro.** Hay un check binario: ¿este PR duplica JSX entre
  dos pages de empresa? Si sí, extraer. Si no, OK.
- **Onboarding.** Un dev nuevo lee un componente shared y entiende todo el
  módulo, no tiene que diff-ear dos archivos para saber qué es real.

### Negativas

- **Un nivel de indirección.** El page no contiene la lógica visible — hay
  que ir al componente shared para entender qué hace. Mitigación: este
  trade-off ya estaba aceptado por la convención de RH cumplida; este ADR
  solo lo formaliza.
- **Props de configuración**: la API del componente shared crece con cada
  empresa nueva con un detalle distinto. Mitigación: SM3 prefiere props
  cosméticas y feature flags antes que branches por empresa.
- **Drift accidental no se evita 100%.** Si alguien crea un page nuevo
  cross-empresa sin extraer, esta ADR no lo detecta solo. Mitigación: SM5
  pone el check en code review humano. Si en algún momento la deuda crece,
  se puede agregar un script `audit-cross-empresa.sh` que falle CI cuando
  detecte duplicación cross-empresa > N líneas.

## Referencias

- [docs/planning/shared-modules-refactor.md](../planning/shared-modules-refactor.md) — auditoría
  cross-empresa del 2026-04-27 + 5 sub-PRs planificados + tabla con tier
  de cada page.
- [ADR-004](../../supabase/adr/004_module_page_layout_convention.md) — anatomía base de páginas
  modulares (header, content, filters).
- [ADR-009](./009_detail_page.md) — `<DetailPage>` para detalles individuales (cuando un módulo
  tiene `[id]/page.tsx` cross-empresa, este ADR-011 también aplica).
- [ADR-010](./010_data_table.md) — `<DataTable>` compartido (estándar de tablas usado dentro
  de los componentes shared).
