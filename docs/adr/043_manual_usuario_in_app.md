# ADR-043 — Manual de usuario in-app (contextual + versionado en git)

**Estado:** Aceptado · Sprint 0 (fundación) en este PR (piloto DILESA · Ventas)
**Fecha:** 2026-06-07
**Iniciativa:** `manual-usuario` (ver [planning](../planning/manual-usuario.md))

## Contexto

Los usuarios de BSOP no tienen dónde consultar **cómo usar cada módulo**; la
única vía es preguntarle a Beto. No escala (DILESA ya son ~14 superficies × 5
empresas), no deja rastro, y no hay forma de saber **qué cambió** en una
pantalla ni desde cuándo. No existía nada de ayuda/manual in-app.

Las alternativas obvias tienen costos conocidos:

- **PDFs sueltos** en un centro de descargas → se desincronizan del producto,
  versionado 100% manual, no contextual.
- **Sitio de docs externo** (GitBook/Mintlify) → otro login/sistema que
  mantener, riesgo de exponer datos internos, fuera del ecosistema.
- **Contenido editable in-app desde la DB** → flexible, pero nada obliga a
  actualizarlo cuando el código cambia → envejece igual que un PDF.

## Decisión

Un **manual in-app, contextual, con el contenido en markdown versionado en
git**, con export a PDF on-demand (Sprint 2). Reglas canónicas:

- **M1 — Una sola fuente de verdad: markdown en el repo.** El contenido vive en
  `content/manual/<empresa>/<...>.md` con frontmatter (`titulo`, `version`,
  `actualizado`). Nada de contenido en la DB. El PDF se genera del mismo
  markdown.
- **M2 — Ayuda contextual, un solo botón "?" global.** El header global (entre
  la campanita y el menú de usuario) monta un `<HeaderHelpButton>` que abre la
  ayuda de la **pantalla actual**: deriva el doc con `usePathname()` vía
  `resolveHelpSlug` (reusa `ROUTE_TO_MODULE` — el slug del módulo ↔ la ruta del
  `.md`). En pantallas sin doc, el drawer (`<HelpDrawer>` sobre `<DetailDrawer>`)
  muestra "todavía no hay ayuda". _(El primer diseño puso el "?" en cada
  `<ModuleHeader helpSlug>`; se centralizó en el header global por simplicidad —
  un solo punto, siempre visible, sin cablear cada módulo.)_
- **M3 — Carga server-side, traza explícita en Vercel.** Los `.md` se leen con
  `fs` (`lib/manual/load.ts`) desde un route handler (`/api/manual/[...slug]`,
  auth-gated) y desde la portada (server component). Viajan al deploy vía
  `outputFileTracingIncludes` en `next.config.ts` (mismo mecanismo que
  ghostscript-wasm). El loader valida los segmentos contra path traversal.
- **M4 — Sin entrada de sidebar para la ayuda.** El botón "?" global (M2) es el
  único punto de acceso — no hay sección "Ayuda" en el sidebar. La portada
  `/dilesa/manual` (índice de docs por versión; módulo RBAC `dilesa.manual`
  read-only, `lectura=true/escritura=false` a todos los roles) sigue existiendo
  como página accesible por URL, pero ya no se enlaza desde el sidebar.
- **M5 — Versionado por módulo y global.** Cada `.md` lleva su `version`
  semántica, la fecha `actualizado` y un changelog `## Cambios` al pie. El
  usuario ve "v1.2 · actualizado 07-jun" en el drawer.
- **M6 — Regla anti-envejecimiento (la clave).** Todo PR que cambia el
  comportamiento de un módulo **actualiza su `.md` de ayuda y bumpea la
  versión, en el mismo PR** — igual que `SCHEMA_REF`. Es lo único que garantiza
  que el manual no diverja del producto.
- **M7 — Text-first.** Sin capturas que envejecen; imágenes manuales solo donde
  un flujo no se entienda sin ellas. Claude genera los borradores leyendo el
  código; el dueño del producto revisa en preview.

## Consecuencias

- **Positivas:** la duda se resuelve donde surge; cero sistema/login nuevo; el
  versionado y el audit trail son gratis con git; el patrón es replicable
  (documentar un módulo nuevo = llenar la plantilla canónica); el manual no
  puede divergir del código si se respeta M6.
- **Trade-offs:** el contenido solo se edita por PR (no hay edición in-app) —
  aceptado en D2 porque atar el contenido al código es justo lo que evita el
  envejecimiento. M6 es una **regla blanda** (no hay check de CI en v1); si se
  desincroniza pese a la regla, se escala a un check automatizado.
- **Alcance v1:** piloto end-to-end con DILESA · Ventas (lista). El resto de
  Ventas + los 13 módulos DILESA + las 4 empresas restantes se llenan después
  reusando esta fundación.
