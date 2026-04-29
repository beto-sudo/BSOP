# ADR-024 — Access denied UX (`<AccessDenied>` + `<RequireAccess>`)

- **Status**: Accepted
- **Date**: 2026-04-29
- **Authors**: Beto, Claude Code (iniciativa `access-denied-ux`)
- **Related**: [ADR-014](./014_sidebar_taxonomia.md), [ADR-019](./019_responsive_policy.md), [ADR-020](./020_a11y_baseline.md)

---

## Contexto

`<RequireAccess>` ya existe en `components/require-access.tsx` y gobierna las pages de empresa (`app/dilesa/**`, `app/rdb/**`, `app/settings/empresas/**`, etc.). Pero el componente interno de "no tienes acceso" estaba **privado, hardcoded**, y limitado:

- Copy genérico ("No tienes permisos para acceder a esta sección. Contacta al administrador si necesitas acceso.") sin info de qué permiso falta.
- Sin CTA ("Pedir acceso a [admin]"). El usuario sabe que no entra pero no a quién pedirle.
- Visual artesanal con emoji 🔒 inline; no usa los tokens del design system.
- No reutilizable en sub-secciones (e.g. una tab dentro de un módulo permitido pero la sub-feature requiere admin).

Adicionalmente, el sidebar (ADR-014) ya esconde módulos que el usuario no puede acceder — pero el caso de "el usuario llega a la URL directo via deep-link, share, o histórico" sigue mostrando el `<AccessDenied>` viejo.

## Decisión

Componente público `<AccessDenied>` en `components/access-denied/` con copy + tokens + CTA configurable. `<RequireAccess>` lo importa y le pasa el contexto del permiso requerido (`required` line). Sub-secciones denied dentro de pages permitidas usan el mismo componente con `variant="inline"`.

```tsx
import { AccessDenied, RequestAccessButton } from '@/components/access-denied';

<AccessDenied
  title="Acceso restringido"
  required={<>dilesa · contabilidad · escritura</>}
  action={<RequestAccessButton email="admin@anorte.com" />}
/>;
```

### Las 5 reglas (AD1–AD5)

#### AD1 — `<RequireAccess>` para empresa/módulo/admin checks; nunca redirect silencioso

`<RequireAccess>` (existente) sigue siendo el guard único. NO se redirige silenciosamente a `/` cuando falta acceso — el usuario merece saber que el módulo existe pero no tiene permiso. Esto previene confusión ("¿este módulo es real? ¿lo borraron?").

> **Por qué**: redirect silencioso oculta info útil. Mostrar `<AccessDenied>` con copy explícito + CTA es la decisión correcta tanto en UX (el usuario entiende) como en seguridad (no pretende que la URL no existe).

#### AD2 — `<AccessDenied>` es el componente canónico; sin copy ad-hoc

Cualquier surface de "acceso restringido" usa `<AccessDenied>`:

- **Page-level** (default `variant="page"`): full-height centered, usado por `<RequireAccess>`.
- **Inline** (`variant="inline"`): card compacta, usada para sub-secciones denied dentro de un page permitido.

Copy default: `"Acceso restringido"` + descripción genérica. Override via props cuando el caso lo amerita.

> **Por qué**: copy + look consistente. Cambiar el design del access-denied se hace en un lugar.

#### AD3 — `required` line muestra qué permiso falta

`<RequireAccess>` arma una string `<empresa> · <modulo> · <escritura/lectura>` y la pasa como `required` prop. El `<AccessDenied>` la rendea en una pill mono.

Casos:

- `<RequireAccess adminOnly>` → `required={<>admin</>}`.
- `<RequireAccess empresa="dilesa">` → `required={<>dilesa · lectura</>}`.
- `<RequireAccess empresa="dilesa" modulo="contabilidad" write>` → `required={<>dilesa · contabilidad · escritura</>}`.

> **Por qué**: el usuario sabe exactamente qué pedirle al admin. Sin esto, el ticket de soporte arranca con "no me sirve" y termina con "necesito acceso a algo".

#### AD4 — CTA opcional via `action` prop; `<RequestAccessButton>` para mailto

`<AccessDenied>` acepta `action` ReactNode arbitrario. Helper `<RequestAccessButton email subject body>` rendea un `<Button variant="outline">` que abre `mailto:`.

```tsx
<AccessDenied
  required={<>dilesa · escritura</>}
  action={
    <RequestAccessButton
      email="admin@anorte.com"
      subject="Acceso a DILESA · escritura"
      body="Necesito permiso de escritura para..."
    />
  }
/>
```

CTA NO es obligatoria — algunos contextos no tienen email accionable. Default sin CTA = solo copy.

> **Por qué**: mailto es lo más simple que funciona en todas las orgs. Cuando se conecte un sistema de tickets / Slack / Linear, se reemplaza el helper.

#### AD5 — A11y: `role="alert"` + `aria-live="polite"` + heading semántico

`<AccessDenied>` rendea con `role="alert"` y `aria-live="polite"` para que screen readers lo anuncien al cargar. El título es `<h2>` semántico (NO un `<h1>` — la page ya tiene su h1 fuera del componente). Esto cumple WCAG 4.1.3 Status Messages (ADR-020 A1).

Focus management: el componente NO roba focus al cargar — la pill de copy es lectura, no interacción. Si hay `action`, el botón es focusable normalmente vía Tab.

> **Por qué**: anunciarlo al screen reader sin robar focus respeta el flow del usuario. WCAG 2.1 AA cumplido (ADR-020 A1).

## Implementación

- **Sprint 1** (este PR): `components/access-denied/access-denied.tsx` con `<AccessDenied>` + `<RequestAccessButton>`. `components/require-access.tsx` actualizado para importar + pasar `required` line. ADR-024.
- **Sprint 2** (postponed): audit de pages y aplicar `<RequireAccess>` donde falte. Ya hoy la mayoría está cubierto (ver `grep -rn "RequireAccess"` en `app/`); el audit confirma 100%.
- **Sprint 3** (postponed): integrar `<RequestAccessButton>` con sistema de tickets cuando lo haya.

## Consecuencias

### Positivas

- **Copy consistente** en todos los access-denied. Cambiar el wording se hace en un lugar.
- **Required line** elimina la ambigüedad — usuario y admin se entienden.
- **`variant="inline"`** permite gates más finos (sub-features dentro de pages permitidos) sin rebuild.
- **A11y por construcción**: `role="alert"` + heading semántico + focus management correcto.

### Negativas

- **`<RequireAccess>` viejo existía hace tiempo**: el AccessDenied interno previo era OK pero limitado. Refactor mínimo (delegar al componente público), sin breaking changes en la API exterior.
- **Sin sistema de tickets** integrado en v1. `<RequestAccessButton>` mailto es lo más simple; cuando haya algo mejor (Linear, Slack), se reemplaza el helper.

### Cosas que NO cambian

- API de `<RequireAccess>` (props `empresa`/`modulo`/`write`/`adminOnly`) — sin cambios.
- Logic de `permissions` (admin bypass, grace period via `hadAccessRef`) — sin cambios.
- Sidebar filtering (ADR-014) — sigue escondiendo módulos no accesibles; este ADR cubre el deep-link case.

## Fuera de alcance v1

- **Sistema self-service de solicitud de acceso** con aprobación automática. Feature de producto, no UX.
- **RLS / permisos a nivel DB** — Domain del backend, no UI.
- **Audit automatizado** de pages sin `<RequireAccess>`. Sprint 2 manual; lint custom es postergable.
- **`<RequireAccess>` con redirect opcional** (caso edge: módulo deprecado, redirect a /). Por ahora sin esa opción — show always.

## Referencias

- Componente: [components/access-denied/access-denied.tsx](../../components/access-denied/access-denied.tsx)
- Guard: [components/require-access.tsx](../../components/require-access.tsx)
- Iniciativa: [docs/planning/access-denied-ux.md](../planning/access-denied-ux.md)
- ADR-014 — sidebar taxonomía (filtering por permisos).
- ADR-020 — a11y baseline (`role="alert"`, headings).
