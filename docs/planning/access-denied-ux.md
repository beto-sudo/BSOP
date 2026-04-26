# Iniciativa — Access Denied UX (`<RequireAccess>`)

**Slug:** `access-denied-ux`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** proposed
**Dueño:** Beto
**Creada:** 2026-04-26
**Última actualización:** 2026-04-26

> **Bloqueada hasta cierre de `a11y-baseline`.** Alcance v1 detallado se
> cierra cuando arranque su turno.

## Problema

El componente `<RequireAccess>` decide qué se renderiza cuando un usuario
no tiene permiso, pero el "qué" varía por módulo. La rúbrica
(`docs/qa/ui-rubric.md` Section 1) menciona "Acceso restringido" pero no
fija copy ni diseño. Probablemente hay deriva: pantalla en blanco,
mensaje genérico, redirección silenciosa a `/`, o `<RequireAccess>` no
aplicado consistentemente.

Síntomas anticipables:

- "Acceso restringido" sin acción — el usuario no sabe a quién pedirle
  el permiso.
- Algunos módulos redirigen, otros muestran mensaje, otros no protegen
  nada (ouch).

## Outcome esperado

- Componente compartido `<AccessDenied>` con copy estándar, indicación
  del permiso requerido, y CTA "Pedir acceso a [admin]" o link a
  página de soporte.
- `<RequireAccess>` aplicado consistentemente en todas las rutas
  protegidas.
- Lint rule o test que detecte páginas sin protección de acceso.

## Alcance v1 (tentativo — refinar al arrancar)

- [ ] Auditoría: catalogar uso de `<RequireAccess>` en `app/**`.
- [ ] Componente `<AccessDenied permissionRequired>` con copy
      estándar y acción.
- [ ] Decisión: ¿mostrar la página con `<AccessDenied>` o redirigir
      a `/`? (Recomendación previa: mostrar — el usuario sabe que el
      módulo existe pero no tiene acceso.)
- [ ] CTA "Pedir acceso" — definir qué hace (mailto, slack, ticket).
- [ ] Documentar en ADR.

## Fuera de alcance

- Sistema de solicitud de acceso self-service con aprobación. Eso es
  feature de producto.
- RLS / permisos a nivel DB — eso es DB, no UI.

## Métricas de éxito

- 100% de rutas en `app/<empresa>/**` protegidas con `<RequireAccess>`.
- `<AccessDenied>` reusa componente compartido (cero copy ad-hoc).
- Usuarios reportan menos confusión cuando no tienen acceso.

## Riesgos / preguntas abiertas

- [ ] ¿Detectar permiso requerido por convención de path o explícito
      por prop?
- [ ] ¿Mostrar "no tienes acceso" para módulos completos que el rol
      del usuario no incluye en sidebar (consistencia con la nav)?
- [ ] Coordinar con `a11y-baseline` (focus en mensaje al cargar,
      role="alert").

## Sprints / hitos

_(se llena cuando arranque ejecución, vía Claude Code)_

## Decisiones registradas

_(append-only, fechadas — escrito por Claude Code)_

## Bitácora

_(append-only, escrita por Claude Code al ejecutar)_
