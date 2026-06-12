# Manual de usuario — cómo funciona y cómo se replica

> Convención completa en [ADR-043](../../docs/adr/043_manual_usuario_in_app.md)
> (reglas M1-M8). Historia y decisiones en
> [docs/planning/manual-usuario.md](../../docs/planning/manual-usuario.md).
> Este README es la guía operativa: qué tocar para documentar una pantalla
> nueva o llevar el manual a otra empresa.

## El sistema en 1 minuto

- **El contenido vive aquí**: `content/manual/<empresa>/<...>.md`, markdown GFM
  con frontmatter (`titulo`, `modulo`, `version`, `actualizado`). Versionado
  con git — nada en la DB (D2).
- **Ayuda contextual**: el botón "?" del header global resuelve el doc de la
  pantalla actual con `resolveHelpSlug` ([lib/manual/help-routes.ts](../../lib/manual/help-routes.ts)):
  override explícito → módulo RBAC (`ROUTE_TO_MODULE`, el slug `dilesa.ventas.lista`
  ↔ la ruta `dilesa/ventas/lista` del `.md`) → fallback al primer ancestro.
- **Portada** `/dilesa/manual`: índice agrupado (taxonomía del sidebar, en
  [lib/manual/groups.ts](../../lib/manual/groups.ts)) + buscador full-text
  (`/api/manual/search`) + descarga PDF.
- **PDF on-demand** (`/dilesa/manual/imprimir`, completo o `?modulo=<grupo>`):
  print del browser sobre la vista imprimible, que usa el **mismo renderer**
  ([components/manual/manual-markdown.tsx](../../components/manual/manual-markdown.tsx))
  que el drawer — una sola fuente de verdad incluye el renderer (M8). Si
  necesitas soportar un elemento markdown nuevo, agrégalo AHÍ, nunca en un
  renderer paralelo.
- **Regla anti-envejecimiento (M6)**: todo PR que cambia el comportamiento de
  un módulo **actualiza su `.md` y bumpea `version` en el mismo PR** — igual
  que `SCHEMA_REF`.

## Checklist A — documentar una pantalla nueva (empresa que ya tiene manual)

1. Copia [`_PLANTILLA.md`](./_PLANTILLA.md) a
   `content/manual/<empresa>/<modulo>/<pantalla>.md` (sin el `_`). El path =
   slug RBAC del módulo con `.` → `/` (así la resuelve el "?" sin cablear nada).
2. Llena la plantilla **leyendo el código real de la page** (columnas, acciones,
   estados, gates de rol) en lenguaje de usuario, no de developer.
3. `version: '1.0.0'` y `actualizado` de hoy, **entre comillas**.
4. Solo si la pantalla es dinámica (`/[id]`) o su doc no sale del slug RBAC:
   agrega el override en `HELP_ROUTE_OVERRIDES`
   ([lib/manual/help-routes.ts](../../lib/manual/help-routes.ts)).
5. Solo si estrenas una carpeta de grupo nueva: registra el label en
   `MANUAL_GROUPS` ([lib/manual/groups.ts](../../lib/manual/groups.ts)) — el
   test `groups.test.ts` falla si lo olvidas.
6. Corre `npx vitest run lib/manual/` — valida frontmatter, grupos y carga de
   TODOS los `.md`.

## Checklist B — rollout a una empresa nueva (RDB, ANSA, COAGAN, Nigropetense)

El sistema es cross-empresa por diseño; lo que hoy está fijado a DILESA son
las superficies. Delta completo:

1. **Contenido**: carpeta `content/manual/<empresa>/` + un `.md` por pantalla
   (Checklist A). Empieza por el módulo más consultado (piloto), no por los 14.
2. **Módulo RBAC** `<empresa>.manual` — los 4 lugares de la regla de liberación
   (ADR-014 en `CLAUDE.md`): `NAV_ITEMS` no aplica (M4: sin sidebar),
   `ROUTE_TO_MODULE` (`/<empresa>/manual` → `<empresa>.manual`),
   `EXPECTED_DB_MODULE_SLUGS`, migración con backfill
   `lectura=true/escritura=false` a todos los roles (plantilla:
   `supabase/migrations/20260607170000_modulo_dilesa_manual.sql`,
   `seccion='sistema'`).
3. **Portada + vista imprimible**: `app/<empresa>/manual/page.tsx` y
   `app/<empresa>/manual/imprimir/page.tsx` copiando las de DILESA (cambian
   empresa, módulo RBAC y textos).
4. **Grupos**: `MANUAL_GROUPS` hoy es el mapa de DILESA — al llegar la segunda
   empresa, parametrízalo por empresa (mismo archivo, un mapa por empresa)
   siguiendo la taxonomía de SU sidebar.
5. **Búsqueda**: `/api/manual/search` hoy busca en `dilesa` — agrega el
   parámetro `empresa` (validado contra la lista de empresas con manual) al
   generalizar.
6. **File tracing**: en `next.config.ts`, una entrada por ruta nueva
   (`/<empresa>/manual`, `/<empresa>/manual/imprimir`) → `content/manual/**`.
   Sin esto los `.md` NO viajan al deploy de Vercel y el manual sale vacío.
7. **El "?" contextual no necesita nada**: `resolveHelpSlug` ya deriva de
   `ROUTE_TO_MODULE`, que cubre todas las empresas.

## Gotchas conocidas

- `actualizado: 2026-06-07` sin comillas → YAML lo parsea como `Date` (el bug
  que dejó el manual "vacío"; el loader normaliza, pero usa comillas).
- Archivos con prefijo `_` se ignoran (por eso la plantilla vive como
  `_PLANTILLA.md`).
- Cada segmento del path debe ser `[a-z0-9_-]+` (el loader rechaza lo demás
  como defensa anti path-traversal).
