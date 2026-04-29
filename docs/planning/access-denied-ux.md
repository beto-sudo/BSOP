# Iniciativa — Access Denied UX (`<AccessDenied>`)

**Slug:** `access-denied-ux`
**Empresas:** todas
**Schemas afectados:** n/a (UI)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-04-26
**Última actualización:** 2026-04-29

## Problema

`<RequireAccess>` (en `components/require-access.tsx`) decide qué se
renderiza cuando un usuario no tiene permiso, pero el `AccessDenied`
interno era hardcoded y limitado: copy genérico sin info del permiso
faltante, sin CTA ("pedir acceso a quién?"), no reutilizable en
sub-secciones.

## Outcome esperado

- Componente compartido `<AccessDenied>` con copy estándar, indicación
  del permiso requerido, y CTA opcional.
- `<RequireAccess>` aplicado consistentemente en todas las rutas
  protegidas (Sprint 2 audit).
- Variant `inline` para sub-secciones dentro de pages permitidos.
- A11y por construcción.

## Alcance v1 (cerrado 2026-04-29 — ver ADR-024)

- [x] `<AccessDenied>` público en `components/access-denied/` con
      variants `page`/`inline`.
- [x] `<RequestAccessButton>` helper para CTA mailto.
- [x] `<RequireAccess>` actualizado para pasar `required` line con el
      permiso faltante (formato `<empresa> · <modulo> · <escritura/lectura>`).
- [x] A11y: `role="alert"` + `aria-live="polite"` + heading semántico.
- [x] ADR-024 con 5 reglas (AD1-AD5).
- [ ] Audit completo de pages + aplicar `<RequireAccess>` donde falte —
      Sprint 2 (postponed).

## Decisiones tomadas al cerrar alcance

- **No redirect silencioso** (AD1): mostrar `<AccessDenied>` con copy
  explícito previene confusión ("¿el módulo existe?") y respeta el deep-
  link del usuario.
- **`required` line obligatoria** (AD3): elimina ambigüedad sobre qué
  permiso pedir. El admin recibe un ticket entendible.
- **Variant `page` + `inline`**: cubre tanto el guard de page completo
  como sub-features. Cambiar visual se hace en un lugar.
- **CTA mailto** como helper minimalista: cuando haya tickets/Slack/Linear,
  se reemplaza el helper sin tocar callsites.
- **`role="alert"` + `aria-live="polite"`**: anuncia al screen reader sin
  robar focus.

## Fuera de alcance v1

- **Sistema self-service de solicitud de acceso**.
- **RLS / permisos DB**.
- **Audit automatizado** (lint custom).
- **`<RequireAccess>` con redirect opcional**.

## Métricas de éxito

- 100% de rutas en `app/<empresa>/**` y `app/settings/**` protegidas con `<RequireAccess>` (Sprint 2 audit).
- `<AccessDenied>` reusa el componente compartido (cero copy ad-hoc en
  módulos nuevos).

## Sprints / hitos

| #   | Sprint                                               | Estado    | PR  |
| --- | ---------------------------------------------------- | --------- | --- |
| 1   | `<AccessDenied>` + `<RequestAccessButton>` + ADR-024 | done      | TBD |
| 2   | Audit + aplicar `<RequireAccess>` donde falte        | postponed | —   |
| 3   | Integrar CTA con sistema de tickets futuro           | postponed | —   |

## Decisiones registradas

### 2026-04-29 · ADR-024 — Access denied UX (Sprint 1)

Codificado en [ADR-024](../adr/024_access_denied_ux.md). Las 5 reglas:

- **AD1** — `<RequireAccess>` para checks; nunca redirect silencioso.
- **AD2** — `<AccessDenied>` es el componente canónico; sin copy ad-hoc.
- **AD3** — `required` line muestra qué permiso falta (`<empresa> · <modulo> · <escritura/lectura>`).
- **AD4** — CTA opcional via `action` prop; `<RequestAccessButton>` para mailto.
- **AD5** — A11y: `role="alert"` + `aria-live="polite"` + heading semántico.

## Bitácora

### 2026-04-29 — Sprint 1 mergeado

Foundation:

- `components/access-denied/access-denied.tsx` — `<AccessDenied>` con
  variants `page`/`inline` + `<RequestAccessButton>` helper.
- `components/access-denied/index.ts` — barrel export.
- `components/require-access.tsx` — refactor: importa `<AccessDenied>` del
  componente público, agrega helper `describeRequired()` que arma la
  línea de permiso faltante a partir de las props (empresa/modulo/write/
  adminOnly).
- ADR-024 con 5 reglas (AD1-AD5).

API exterior de `<RequireAccess>` sin cambios — backwards compatible.

PR: pendiente.
