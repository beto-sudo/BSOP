# Iniciativa — Drawers DILESA → Páginas completas

**Slug:** `dilesa-drawers-a-paginas`
**Empresas:** DILESA
**Schemas afectados:** ninguno (cambio puramente de UI/routing)
**Estado:** done
**Dueño:** Beto
**Creada:** 2026-05-26
**Cerrada:** 2026-05-26
**Última actualización:** 2026-05-26 (Sprint 1 mergeado — DILESA tenía solo 2 drawers efectivos (Proyecto y Anteproyecto), ambos convertidos. La iniciativa cierra completa.)

## Problema

Los detalles de proyectos, anteproyectos y demás entidades DILESA se
abren como **side drawers** (`<DetailDrawer>` con `<Sheet>` lateral).
A medida que las secciones de detalle crecieron (Sprint A de
`dilesa-proyectos-paridad-coda` agregó "Avances" + "Documentos y
configuración" al drawer de proyecto, llevándolo a ~7 secciones), el
drawer se queda corto:

- Demasiado scroll vertical en un panel angosto.
- No hay URL canónica del detalle → no se puede compartir link al
  proyecto X ni recordar dónde estabas tras reload.
- Toda la lógica de detalle vive en `<DetailDrawer size="xl">` que
  ocupa ~600px del viewport, sobre la lista de fondo que estorba.

Beto pidió explícitamente: "quitar todos los side drawers de DILESA,
con excepción del de Tareas — los demás prefiero que sean páginas
completas".

## Outcome esperado

1. **Cada entidad DILESA con detalle complejo tiene su propia ruta**
   `/dilesa/<modulo>/[id]` que carga la página completa con todas las
   secciones (ficha, avances, documentos, unidades, tareas, etc.) en
   layout scroll-largo (no sub-tabs).
2. **Lista → detalle** navega vía `router.push` (deep-linking
   automático). Click en fila ya no abre drawer.
3. **Excepciones documentadas**: `<TasksUpdates>` (drawer de tareas
   sobre cualquier entidad) **sigue siendo drawer** porque es
   contextual y se invoca desde dentro de páginas existentes.
4. **Patrón canónico documentado** para que futuras entidades DILESA
   nazcan como páginas, no drawers.

## Modelo conceptual

### Patrón canónico `app/dilesa/<modulo>/[id]/page.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { RequireAccess } from '@/components/require-access';
import { DesktopOnlyNotice } from '@/components/responsive';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export default function Page() {
  return (
    <RequireAccess empresa="dilesa" modulo="<sub-slug>">
      <DesktopOnlyNotice module="<Modulo>" />
      <div className="hidden sm:block">
        <Body />
      </div>
    </RequireAccess>
  );
}

function Body() {
  const { id } = useParams<{ id: string }>();
  // fetch entidad + datos derivados
  // ...
  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center gap-3">
        <Link
          href="/dilesa/<modulo>"
          className="text-sm text-[var(--text)]/60 hover:text-[var(--text)] inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver
        </Link>
      </header>
      <h1 className="text-2xl font-semibold">{entidad.nombre}</h1>
      {/* secciones verticales, scroll largo */}
      <section>...</section>
      <section>...</section>
    </div>
  );
}
```

### Reglas duras

- **DP1**: el detalle es una page (`[id]/page.tsx`), no un drawer.
- **DP2**: breadcrumb "Volver" con `<Link>` canónico al listado padre.
- **DP3**: secciones verticales scroll-largo. Sub-tabs (ADR-005) solo
  si la página crece más allá de ~5 secciones grandes.
- **DP4**: edición inline en cada sección (no formulario aparte).
- **DP5**: `<RequireAccess>` + `<DesktopOnlyNotice>` por defecto
  (alineado con ADR responsive-policy).
- **DP6**: el `<TasksUpdates>` drawer (tareas asociadas) es la única
  excepción — se invoca desde la página como flotante contextual.

### Estrategia de refactor

Para no romper UX durante la migración:

- Cada PR convierte 1-3 drawers en páginas, en orden de prioridad.
- El componente del drawer existente se **renombra** a
  `<ProyectoDetalle>` (componente presentacional sin
  `<DetailDrawer>` wrapper) y se importa desde la page nueva. Esto
  preserva la lógica de fetch + UI sin reescribir.
- El módulo padre (`<ProyectosModule>`) cambia `onRowClick={(p) =>
router.push(\`/dilesa/proyectos/${p.id}\`)}` en vez de abrir drawer.
- Una vez todas las consumers redirigen, el archivo
  `*-detail-drawer.tsx` se elimina.

## Sprints

### Sprint 1 — Proyecto + Anteproyecto (este PR)

DILESA tiene 2 detail drawers efectivos (verificado al iniciar):
`<ProyectoDetailDrawer>` y `<AnteproyectoDetailDrawer>`. Sprint 1 los
convierte a páginas:

- `app/dilesa/proyectos/[id]/page.tsx` (nueva).
- `app/dilesa/proyectos/anteproyectos/[id]/page.tsx` (nueva).
- `<ProyectoDetalle>` y `<AnteproyectoDetalle>` componentes
  presentacionales extraídos del drawer (sin `<DetailDrawer>` wrap).
- `<ProyectosModule>` y `<AnteproyectosModule>` redirigen vía
  `router.push` en lugar de abrir drawer.
- Eliminar `proyecto-detail-drawer.tsx` y `anteproyecto-detail-drawer.tsx`.
- Sub-slugs RBAC ya existentes (`dilesa.proyectos.activos`,
  `dilesa.proyectos.anteproyectos`) cubren las rutas nuevas.
- 1 PR.

### Sprint 2 — NO requerido ✅

Verificación al cierre del Sprint 1: el resto de módulos DILESA
(Ventas, Construcción, Inventario, Estimaciones, Contratos,
Contratistas, Prototipos, Portafolio) ya operan en pages directamente
o en módulos con tabs. **Ningún módulo DILESA usa
`<DetailDrawer>` además de los 2 ya convertidos**. La iniciativa
cierra completa.

## Riesgos

1. **`<TasksUpdates>`** debe seguir funcionando dentro de la page
   nueva (contexto: lista de tareas del proyecto). Verificar que el
   wiring sobrevive al refactor.
2. **Deep-linking previo**: si algún email/notificación apunta a
   `/dilesa/proyectos?focus=<id>` o similar, la nueva ruta directa
   `/dilesa/proyectos/<id>` es compatible. El query param `?focus=`
   queda como compatibilidad — la page lista verifica y redirige
   si lo recibe.
3. **Tests existentes** sobre `deriveKpis` y `deriveAnalisis` siguen
   verdes (las funciones se mueven al módulo correspondiente sin
   cambios de lógica).
4. **Mobile**: las pages siguen `desktop-only` igual que los drawers
   actuales (alineado con responsive-policy).

## Bitácora

- **2026-05-26 (promoción + Sprint 1 + closeout)** — Iniciativa
  promovida tras decisión explícita de Beto: convertir todos los
  side drawers DILESA a páginas completas con excepción de
  `<TasksUpdates>`. Verificación inicial: solo 2 drawers efectivos
  en `components/dilesa/` (Proyecto y Anteproyecto). Sprint 1 los
  convierte: archivos renombrados de `*-detail-drawer.tsx` a
  `*-detalle.tsx`, componentes exportados como `<ProyectoDetalle>` y
  `<AnteproyectoDetalle>` (sin `<DetailDrawer>` wrapper, layout
  scroll-largo en `<div className="space-y-6 p-4 sm:p-6">`). Pages
  nuevas `app/dilesa/proyectos/[id]/page.tsx` y
  `app/dilesa/proyectos/anteproyectos/[id]/page.tsx` con breadcrumb
  "Volver". `<ProyectosModule>` y `<AnteproyectosModule>` usan
  `useRouter().push()` en `onRowClick` en lugar de abrir drawer.
  Eliminado state de `selected`/`drawerOpen`. Sub-slugs RBAC
  existentes cubren ambas rutas. Sprint 2 verificó que no hay más
  drawers DILESA — iniciativa cierra completa.

## Decisiones registradas

- **2026-05-26 — Scroll largo en lugar de sub-tabs** (decisión 3 de
  Beto al promover). Sub-tabs solo si la página supera ~5 secciones
  grandes y se vuelve tediosa de navegar.
- **2026-05-26 — Reemplazar drawer**, no coexistir (decisión 1). Un
  solo flujo, menos código.
- **2026-05-26 — Breadcrumb "Volver" + Link al listado padre**
  (decisión 2). UX consistente con el resto del repo.
- **2026-05-26 — `<TasksUpdates>` es la única excepción** — sigue
  como drawer porque es contextual a la página, no es un detalle de
  entidad principal.
