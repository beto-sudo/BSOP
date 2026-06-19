# ADR-046 — Capa única de acceso a IA: registry + entry point + drift-guard

- **Status**: Accepted
- **Date**: 2026-06-19
- **Authors**: Beto, Claude Code
- **Iniciativa**: [`registro-ia`](../planning/registro-ia.md)

---

## Contexto

La IA productiva de BSOP vivía **dispersa y sin registro**: 7 procesos (extracción
de documentos notariales, CSF, planos, PLD informe+acuse, estados de cuenta,
búsqueda semántica) repartidos en 6 archivos, cada uno creando su propio cliente
o importando `@ai-sdk/*` / `'ai'` directo, con el **modelo escrito a mano** en
cada sitio (`MODELO_CLAUDE` + literales sueltos como `'claude-opus-4-7'` en la
ruta de planos).

Consecuencias del modelo viejo:

- **Cambiar de modelo era una cacería**: una deprecación de Anthropic obligaba a
  tocar 6 archivos. De hecho los 7 flujos corrían en `claude-opus-4-7`, ya
  superado por el default vigente (`claude-opus-4-8`), sin que nadie lo notara.
- **Cero inventario / observabilidad**: no había forma de saber qué usa IA, con
  qué llave, ni cuánto cuesta por empresa/proceso.
- **Nada impedía que un uso nuevo se escondiera** llamando al SDK directo.

## Decisión

`lib/ai/` es la **capa única** de acceso a IA. Reglas:

1. **Único entry point.** Solo `lib/ai/` importa los SDK (`@ai-sdk/*`, `'ai'`).
   Todo call-site llama a `runGenerateObject` / `runEmbed` con un `usoId`.
2. **Registry declarativo** (`lib/ai/registry.ts`): inventario de cada uso
   (empresa, proveedor, modelo por defecto, env var, criticidad, archivo). El
   doc/UI de configuración se generan de aquí; `AiUsoId = keyof typeof AI_USOS`
   hace que un `usoId` no registrado sea un error de compilación → **el registro
   está completo por construcción**.
3. **Modelo desde un solo lugar** (`lib/ai/models.ts` → `resolveModel`). Cambiar
   el default es 1 línea. `resolveModel` es `async` a propósito: el override por
   uso vía `core.ai_config` (editable desde la UI sin redeploy — en Vercel una
   env var **no** es hot-swap) entra en el Sprint 2 sin tocar ningún call-site.
4. **Drift-guard en CI** (`lib/ai/guard.test.ts`): el build falla si algún
   archivo fuera de `lib/ai/` importa `@ai-sdk/*` o `'ai'`. Esto es lo que evita
   que el inventario envejezca.
5. **La etiqueta de auditoría refleja el modelo real**: los sitios que persisten
   `extraccion_modelo` / `modelo` llaman a `resolveModel(usoId)` (misma fuente
   que usó el wrapper), no a un literal.

Mismo principio que [ADR-043] (catálogo de notificaciones) y el snapshot+guard de
la iniciativa `blindaje-financiero`: centralizar + catálogo + guard en CI.

## Alternativas consideradas

- **Doc estático** (markdown con la lista de usos): se desincroniza del código —
  es justo lo que ya falló con los modelos hardcodeados. Descartado.
- **Solo una constante central, sin guard**: nada impide que el próximo uso
  vuelva a llamar al SDK directo y quede fuera del inventario. El guard es lo que
  hace la regla auto-sostenible.
- **Override de modelo por env var**: en Vercel las lambdas warm cachean
  `process.env`; no es hot-swap. El override va a DB (`core.ai_config`, Sprint 2)
  para cambiar el modelo desde la UI sin redeploy.

## Consecuencias

- Cambiar el modelo de un uso (caída/deprecación) = 1 acción, no cacería.
- Inventario de IA siempre vivo y tipado; base para el log de costo/uso por
  empresa/proceso (`core.ai_invocaciones`, Sprint 2) y la UI de configuración
  (Sprint 3).
- **Costo**: todo uso nuevo debe registrarse en `registry.ts` y pasar por los
  wrappers (el guard lo obliga). Es el costo deseado de la regla.
- **Embeddings**: el modelo de embedding está amarrado a `vector(1536)` en
  `erp.documentos.contenido_embedding`; el registry lo marca con una nota —
  cambiarlo exige reindexar, no es un swap libre.

[ADR-043]: ./043_manual_usuario_in_app.md
