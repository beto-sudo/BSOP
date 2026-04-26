# Iniciativa — Filters URL-sync

**Slug:** `filters-url-sync`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** proposed
**Dueño:** Beto
**Creada:** 2026-04-26
**Última actualización:** 2026-04-26

> **Bloqueada hasta cierre de `module-states`.** Alcance v1 detallado se
> cierra cuando arranque su turno — el alcance acá es preliminar para
> que CC tenga contexto.

## Problema

Los filtros de cada `<ModuleFilters>` viven en `useState` local: refrescar
la página los pierde, no se pueden compartir como link, browser back no
funciona, y bookmarks no sirven. Inconsistente con el patrón de routed
tabs (ADR-005) que ya gana share/bookmark/back para la nav primaria.

A eso se suma que cada módulo implementa "Limpiar filtros" y el contador
de "N filtros activos" por su cuenta — duplicación y deriva.

## Outcome esperado

- Los filtros viven en la URL (`?almacen=X&estado=activo&q=texto`).
- Refresh, share y browser back funcionan igual que con routed tabs.
- "Limpiar todo" y contador de filtros activos como pattern compartido.
- Hook compartido (ej. `useUrlFilters`) que cada `<ModuleFilters>` usa.

## Alcance v1 (tentativo — refinar al arrancar)

- [ ] Hook `useUrlFilters` que lee/escribe `searchParams` con tipos.
- [ ] Convención de nombres de query params (snake_case vs camelCase,
      booleanos como `1`/`0` vs `true`/`false`).
- [ ] Componente / API para "Limpiar todo" + contador de filtros
      activos (badge en el filter bar).
- [ ] Migrar 1-2 módulos de prueba (probable: Ventas e Inventario).
- [ ] ADR-007 documentando la decisión.

## Fuera de alcance

- Persistencia server-side de filtros por usuario (ej. "mis vistas
  guardadas"). Eso es feature de producto, no convención de UI.
- Filtros complejos con AND/OR explícito — v1 asume AND implícito
  entre todos los filtros activos.

## Métricas de éxito

- Compartir un link con filtros aplicados reproduce la misma vista en
  otro browser.
- Browser back navega correctamente entre estados de filtros.
- Cero `useState` local para filtros en módulos migrados.

## Riesgos / preguntas abiertas

- [ ] Compatibilidad con Next.js App Router — `useSearchParams` es
      cliente, hay que confirmar que no rompe SSR ni revalidate.
- [ ] Filtros con muchos valores (multi-select largo) en URL — ¿hay
      límite de longitud? ¿hash vs ids?
- [ ] Coexistencia con `?tab=...` de routed tabs (ADR-005). Definir
      orden y conflict resolution.

## Sprints / hitos

_(se llena cuando arranque ejecución, vía Claude Code)_

## Decisiones registradas

_(append-only, fechadas — escrito por Claude Code)_

## Bitácora

_(append-only, escrita por Claude Code al ejecutar)_
