# Aplicar sprint dilesa-1 UI (Terrenos scaffold)

Este folder contiene el parche `dilesa-ui-terrenos.patch` con el scaffold del
módulo Terrenos + landing inmobiliario + stubs de Prototipos, Anteproyectos y
Proyectos + shared components reutilizables.

El parche se generó desde un `git worktree` del sandbox (el mount FUSE no me
deja hacer commit ni push directo por los locks de `.git/worktrees/*.lock`).
Tú lo aplicas localmente en un branch fresco.

## Aplicar

Desde el repo `BSOP/` en tu máquina:

```bash
git fetch origin main
git checkout -b feat/dilesa-ui-terrenos origin/main
git apply sprint-dilesa-1-ui/dilesa-ui-terrenos.patch
git status   # revisa que los archivos nuevos y modificados son los esperados
git add -A
git commit -m "sprint dilesa-1 UI: scaffold módulo Terrenos + landing inmobiliario"
git push -u origin feat/dilesa-ui-terrenos
```

Después:

- Abre PR en GitHub — Vercel corre Preview Deploy y Supabase Preview Branch.
- Validación visual: entra a `/dilesa` → tiles nuevos de Inmobiliario → click
  en Terrenos → verifica que la tabla carga (o muestra empty state), que el
  botón Nuevo abre el Sheet y que puedes capturar un terreno de prueba.
- El folder `sprint-dilesa-1-ui/` se puede borrar antes o después del merge —
  no entra al scope del feature.

## Archivos tocados (preview)

Modificados:

- `app/dilesa/page.tsx` — landing reorganizada con grupo Inmobiliario.
- `components/app-shell/nav-config.ts` — divisor + 4 rutas nuevas.
- `lib/status-tokens.ts` — PRIORIDAD, TERRENO_ETAPA, ANTEPROYECTO_ESTADO.

Nuevos (Terrenos end-to-end):

- `app/dilesa/terrenos/page.tsx`
- `app/dilesa/terrenos/[id]/page.tsx`

Nuevos (stubs que se llenan en branches siguientes):

- `app/dilesa/prototipos/page.tsx`
- `app/dilesa/anteproyectos/page.tsx`
- `app/dilesa/proyectos/page.tsx`

Nuevos (shared):

- `components/shared/module-tabs.tsx`
- `components/shared/empty-state-imported.tsx`
- `components/shared/coming-soon-module.tsx`
- `lib/dilesa-constants.ts`

## Plan completo

Vive fuera del repo, en el folder de knowledge Dilesa:
`/mnt/DILESA/knowledge/dilesa-1-ui-plan.md`. Ahí está el detalle de los 4
módulos, endpoints, convenciones, riesgos, fuera de scope y plan de PRs.
