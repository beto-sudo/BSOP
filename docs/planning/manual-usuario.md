# Iniciativa — Manual de usuario in-app

**Slug:** `manual-usuario`
**Empresas:** DILESA (golden; piloto = módulo Ventas). Sistema cross-empresa, pensado para rollout a las 5 empresas.
**Schemas afectados:** `core.modulos` (slug nuevo `dilesa.manual` + backfill defensivo de permisos). El **contenido vive en el repo** (markdown versionado con git), **no** en la DB.
**Estado:** in_progress
**Próximo hito:** Sprint 0 (fundación + ADR-043) mergeado (#720, preview). Próximo: Beto aplica la migración `20260607170000_modulo_dilesa_manual.sql` + valida en preview → Sprint 1 (resto del contenido de Ventas: ~8 docs)
**Dueño:** Beto
**Creada:** 2026-06-07
**Última actualización:** 2026-06-07 (promoción — enfoque cerrado con Beto: in-app + PDF, markdown en repo, piloto end-to-end con Ventas)

## Problema

Los usuarios de BSOP no tienen **dónde consultar cómo usar cada módulo**. Cuando
surge una duda ("¿cómo doy de alta una venta?", "¿qué significa este estado?",
"¿qué pide la Fase 2?"), el único camino es **preguntarle a Beto**. Esto:

- No escala: DILESA ya tiene ~14 superficies en el sidebar; el portafolio son 5
  empresas. La carga de soporte recae 100% en Beto.
- No deja rastro: cada respuesta de Beto se pierde; la siguiente persona vuelve a
  preguntar lo mismo.
- No tiene versión: cuando un módulo cambia, nadie sabe **qué cambió** ni desde
  cuándo. No hay changelog para el usuario.

Hoy **no existe nada** de ayuda/manual in-app (confirmado por barrido del repo:
cero `manual|ayuda|help` en `app/` o `components/`).

## Outcome esperado

1. **Ayuda contextual in-app**: botón `?` en el header de cada pantalla que abre
   un drawer lateral con la ayuda **de esa pantalla** (hereda el gate RBAC de la
   page).
2. **Portada "Manual"** en el sidebar de la empresa: índice navegable + buscador +
   versión global del manual + botón **Descargar PDF** (completo o por módulo).
3. **Contenido en markdown versionado en git**, con la regla dura _"tocas un
   módulo → actualizas su `.md` de ayuda y bumpeas la versión, en el mismo PR"_
   (igual que ya forzamos `SCHEMA_REF`). Esto es lo que impide que el manual
   envejezca.
4. **Versión + changelog por módulo** visibles para el usuario ("v1.2 ·
   actualizado 07-jun" + qué cambió).
5. **PDF on-demand** generado del mismo markdown (una sola fuente de verdad).
6. **Patrón replicable**: una plantilla canónica + un shell de rendering que
   conviertan "documentar un módulo nuevo" en "llenar la plantilla", para escalar
   a los otros 13 módulos DILESA y a las 4 empresas restantes.

## Alcance v1 (piloto Ventas)

**Dentro:**

- **Foundation técnica**: componente `<HelpDrawer>` (reusa `<DetailDrawer>`),
  mecanismo de rendering de markdown, ubicación del contenido en el repo, botón
  `?` en `<ModuleHeader>`.
- **Módulo "Manual"** en el sidebar de DILESA (los 4 lugares de la regla de
  liberación de módulo: `NAV_ITEMS`, `ROUTE_TO_MODULE`, `EXPECTED_DB_MODULE_SLUGS`,
  migración SQL con backfill defensivo).
- **Contenido completo de Ventas**: 5 tabs (Ventas / Inventario / Fases /
  Clientes / Vendedores) + pipeline de captura (nueva, detalle, capturar Fase
  2/3).
- **PDF on-demand** + portada del manual (índice + buscador).
- **ADR** con la convención (dónde vive, plantilla canónica, regla de versión).
- **Plantilla replicable** documentada para el resto del rollout.

**Fuera (v2+):**

- Los otros 13 módulos de DILESA (post-validación del patrón).
- Las otras 4 empresas (RDB, ANSA, COAGAN, Nigropetense).
- Capturas de pantalla automáticas (v1 es **text-first**; imágenes manuales
  selectivas solo donde un flujo lo pida).
- Contenido editable in-app desde la DB (descartado en D2).
- Multi-idioma y videos.

## Decisiones registradas

> Cerradas con Beto el 2026-06-07 en la sesión de promoción.

- **D1 — Entrega: in-app contextual + PDF on-demand.** Botón `?` por pantalla +
  portada "Manual"; PDF generado del mismo markdown. **Una sola fuente de
  verdad.** Descartados: PDFs sueltos (se desincronizan, versión manual) y sitio
  de docs externo (otro login/sistema, riesgo de exponer datos).
- **D2 — Fuente del contenido: markdown en el repo, versionado con git. NO
  editable desde la DB.** Razón: atar el contenido al código es lo único que
  garantiza que no envejezca (regla "tocas módulo → actualizas ayuda"); el audit
  trail es gratis con git. Trade-off aceptado: el texto solo se edita vía PR —
  Claude genera los borradores leyendo el código, Beto revisa en preview.
- **D3 — Estrategia: piloto end-to-end.** Un módulo completo (shell + contenido +
  versión + PDF) para validar todo el patrón antes de escalar a los 13 restantes.
- **D4 — Módulo piloto: Ventas.** El más rico (5 tabs + pipeline por fases) y de
  alta consulta de operadores → valida el patrón en el peor caso.
- **D5 — Slug `manual-usuario`** (sin prefijo de empresa: la infraestructura es
  cross-empresa; el contenido v1 es DILESA).
- **D6 — Tono text-first.** Sin capturas que envejecen; imágenes manuales solo
  donde el texto no baste.
- **D7 — Versionado por módulo** (semver + fecha + changelog en el frontmatter del
  `.md`) + una versión global del manual visible en la portada.

## Riesgos

- **R1 — Rendering de markdown en Next 16.** Cache Components + file tracing en
  Vercel pueden complicar leer archivos en runtime. _Mitigación:_ spike en Sprint
  0; decidir entre markdown-as-module (bundleado, a prueba de Vercel) vs `fs` read
  con `outputFileTracingIncludes`. Leer docs de Next 16 antes de codear (mi
  conocimiento puede estar viejo).
- **R2 — Envejecimiento del contenido.** _Mitigación:_ regla dura en `CLAUDE.md`
  del repo (PR que toca módulo actualiza su ayuda + bump de versión). Check de CI
  a futuro si la regla blanda no basta (no en v1).
- **R3 — RBAC del módulo Manual.** La ayuda contextual hereda el gate de la page;
  la portada es visible a todo miembro pero filtra secciones por permiso (igual
  que el sidebar). _Mitigación:_ backfill defensivo siguiendo la regla de
  liberación de módulo.
- **R4 — El esfuerzo de contenido se percibe alto.** _Mitigación:_ Claude genera
  los borradores leyendo código + planning docs; la plantilla canónica baja el
  costo marginal por módulo.

## Métricas de éxito

- Reducción cualitativa de preguntas a Beto sobre "cómo se usa X" (validar con
  operadores de Ventas tras el piloto).
- 100% de las superficies de Ventas con su `.md` + versión + changelog.
- Cero drift: el siguiente PR que toque Ventas actualiza su ayuda sin recordatorio.
- Costo de "llenar un módulo nuevo" con la plantilla razonable (medir en el primer
  rollout post-piloto).

## Sprints / hitos

- **Sprint 0 — Fundación + ADR.** Spike de rendering de markdown; `<HelpDrawer>` +
  botón `?` en `<ModuleHeader>`; ubicación del contenido en el repo; módulo
  "Manual" en el sidebar de DILESA (4 lugares RBAC + migración con backfill); ADR
  con convención, plantilla canónica y regla de versión.
- **Sprint 1 — Contenido de Ventas.** ~8 docs (5 tabs + pipeline). Borrador de
  Claude → revisión de Beto en preview.
- **Sprint 2 — PDF on-demand + portada.** Export del manual (completo y por
  módulo), índice navegable, buscador.
- **Sprint 3 — Closeout + plantilla replicable.** Documentar el patrón + checklist
  para los 13 módulos DILESA restantes y las 4 empresas.

## Bitácora

- **2026-06-07** — Iniciativa promovida a `planned`. Enfoque cerrado con Beto en 7
  decisiones (D1-D7): in-app + PDF on-demand, markdown versionado en repo, piloto
  end-to-end con el módulo Ventas, text-first, versionado por módulo + global.
  Próximo: Sprint 0 (fundación + ADR).
- **2026-06-07** — **Sprint 0 (fundación) construido** (PR a preview). Pipeline
  de rendering: deps `react-markdown` + `remark-gfm` + `gray-matter`;
  `lib/manual/load.ts` (fs + frontmatter, anti-path-traversal); route handler
  `/api/manual/[...slug]` (auth-gated); `outputFileTracingIncludes` para
  `content/manual/**` (mismo patrón que ghostscript-wasm — R1 cerrado).
  `<HelpButton>`/`<HelpDrawer>` sobre `<DetailDrawer>` + slot `helpSlug` en
  `<ModuleHeader>`. Contenido golden `content/manual/dilesa/ventas/lista.md`
  (v1.0.0) + botón "?" integrado en el header de Ventas. Portada
  `/dilesa/manual` (índice + versión por módulo). RBAC: 3 lugares de código
  (`NAV_ITEMS` sección Ayuda, `ROUTE_TO_MODULE`, `EXPECTED_DB_MODULE_SLUGS`) +
  migración `20260607170000_modulo_dilesa_manual.sql` (módulo top-level +
  backfill `lectura=true/escritura=false` a todos los roles DILESA) **dejada
  como archivo para que Beto la aplique** (otorga permisos → no autónoma).
  ADR-043 (M1-M7) + índice en `ARCHITECTURE.md` §5. 5 checks verdes (typecheck,
  1312 tests, lint 0 errores, format, sync de slugs). PR a **preview sin
  auto-merge** (UI visible). Próximo: aplicar migración + validar en preview →
  Sprint 1 (resto del contenido de Ventas).
- **2026-06-07** — **Sprint 0 mergeado (#720)** + migración aplicada a prod
  (módulo `dilesa.manual`, `seccion='sistema'`, lectura a los 9 roles DILESA,
  versión `20260607170000` registrada sin drift). Fix en el camino: la migración
  chocaba con `modulos_seccion_check` de tesorería al extenderlo con `'ayuda'`;
  se cambió a `'sistema'` (transversal, ya permitido) sin tocar el constraint.
- **2026-06-07** — **Ajuste de UX (feedback de Beto):** el "?" se movió del
  header de cada módulo al **header global** (entre la campanita y el menú de
  usuario), ahora contextual a la pantalla actual vía `resolveHelpSlug`
  (`lib/manual/help-routes.ts`, reusa `ROUTE_TO_MODULE`: slug de módulo ↔ ruta
  del `.md`). Se quitó la sección "Ayuda" del sidebar y el "?" per-módulo
  (revertido `<ModuleHeader helpSlug>`). ADR-043 M2/M4 actualizados. La portada
  `/dilesa/manual` queda accesible por URL pero sin enlace en sidebar (pendiente
  confirmar con Beto si se conserva). PR a preview sin auto-merge.
