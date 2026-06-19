# Iniciativa — Registro de IA (inventario, costo y continuidad de los usos de IA)

**Slug:** `registro-ia`
**Empresas:** todas (capa transversal; hoy la IA productiva vive en cross + DILESA)
**Schemas afectados:** principalmente código (`lib/ai/` capa única + registry); Sprint 2 agrega `core` (tablas `ai_config` override de modelo, `ai_invocaciones` log de uso/costo). Lectura de `core.usuarios` para autoría.
**Estado:** in_progress
**Próximo hito:** Beto valida la extracción de un doc real por tipo en el Preview de [#960](https://github.com/beto-sudo/BSOP/pull/960) y mergea (CI verde). Luego Sprint 2 — `core.ai_config` (override de modelo runtime) + `core.ai_invocaciones` (log de costo/uso por empresa/proceso).
**Dueño:** Beto
**Creada:** 2026-06-19
**Última actualización:** 2026-06-19 (Sprint 1 entregado — PR #960 verde, en review)

## Problema

La IA productiva de BSOP vive **dispersa y sin registro**. Mapeo del 2026-06-19:

- **7 procesos de IA en producción**, todos colgando de **2 llaves** (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) y con el **modelo escrito a mano**:
  - cross — extracción de documentos notariales + embeddings ([extraction-core.ts](../../lib/documentos/extraction-core.ts))
  - cross — búsqueda semántica ([semantic-search/route.ts](../../app/api/documentos/semantic-search/route.ts))
  - cross — extracción CSF (empresas + proveedores) ([extract-csf.ts](../../lib/proveedores/extract-csf.ts))
  - DILESA — análisis de planos ([plano-ai/analizar.ts](../../lib/dilesa/plano-ai/analizar.ts))
  - DILESA — revisión PLD F13: informe + acuse ([revision-pld/route.ts](../../app/api/dilesa/ventas/%5BventaId%5D/revision-pld/route.ts))
  - DILESA — estados de cuenta bancarios ([estados-cuenta/extraer.ts](../../lib/dilesa/estados-cuenta/extraer.ts))
  - DILESA — doc notarial de venta ([notarial-ai/extraer.ts](../../lib/dilesa/notarial-ai/extraer.ts))
- **Cero registro / catálogo / log de uso de IA** (`rg` de `ai_uso|ai_registry|usage_log|tokens_in` = vacío). No hay observabilidad de costo ni conteo por empresa/proceso.
- **El riesgo ya se materializó silenciosamente:** los 7 flujos corren en `claude-opus-4-7`, un modelo superado por el default vigente (`claude-opus-4-8`). Nadie lo notó porque está hardcodeado en 6 archivos. Si Anthropic deprecara 4-7, se caen los 7 flujos a la vez, repartidos en 6 archivos, **sin alerta**.

El objetivo de Beto: _"tener muy claro el día que alguno deje de funcionar para ir directo a cambiarlo"_ + costos y conteos de uso. RDB/ANSA/COAGAN/Nigropetense no tienen IA embebida hoy.

## Outcome esperado

- **Un solo lugar** define proveedor + modelo de cada uso de IA; cambiar de modelo (caída/deprecación) = 1 acción, no cacería en 6 archivos.
- **El registro no envejece:** drift-guard en CI falla si alguien llama a un SDK de IA fuera de la capa única (mismo principio que `notificaciones-catalogo` y el snapshot+guard de `blindaje-financiero`).
- **Costo y conteo atribuibles** por empresa y proceso (log propio, no dependiente de las consolas de Anthropic/OpenAI).
- **Modelo cambiable desde la UI sin redeploy** (override en `core.ai_config`; en Vercel una env var no es hot-swap — las lambdas warm cachean `process.env`).

## Alcance v1 (sprints)

- [ ] **Sprint 1 — Capa única + registry + drift-guard (refactor, sin DB).** `lib/ai/` como único entry point (clients, models, registry declarativo, `resolveModel` async, wrappers `runGenerateObject`/`runEmbed`). Migrar los 7 call-sites. Test guard: ningún `@ai-sdk/*` ni `from 'ai'` fuera de `lib/ai/`. `usoId` tipado contra el registry (un typo = error de compilación → el registro está completo por construcción). Bump del default `claude-opus-4-7 → claude-opus-4-8` en un solo lugar (validar 1 doc real por tipo en Preview). ADR-046.
- [ ] **Sprint 2 — Override de modelo + log de uso/costo.** Migración `core.ai_config` (override por uso, fail-open al default del registry) + `core.ai_invocaciones` (modelo, proceso, empresa, tokens in/out, costo estimado con pricing semilla de `data/models.json`). El wrapper resuelve el override y loguea cada llamada. RLS admin/Dirección.
- [ ] **Sprint 3 — UI en Configuración.** Tabla de usos (auto-generada del registry) + panel de costo/conteo por empresa y proceso + editor de `ai_config` (cambiar modelo desde ahí, surte sin redeploy).

## Riesgos

- **Bump de modelo** (4-7→4-8) cambia el comportamiento de extracciones con schema/visión estrictos (PLD, CSF, planos). Mitigación: el default vive en un solo lugar (rollback = 1 línea); validar un doc real por tipo en Preview antes de mergear.
- **Override de embedding es peligroso:** el modelo de embedding está amarrado a `vector(1536)` en `erp.documentos.contenido_embedding`; cambiarlo exige reindexar todo. Mitigación: el registry lo marca con criticidad alta + nota; la UI (S3) lo advierte.
- **No regresar latencia:** el override por DB (S2) agrega una lectura; mitigación: cache en memoria con TTL corto + fail-open al default.

## Métricas de éxito

- 0 imports de `@ai-sdk/*` o `from 'ai'` fuera de `lib/ai/` (enforced por CI).
- 100% de los usos de IA presentes en el registry (garantizado por el tipo `AiUsoId`).
- Cambiar el modelo de un uso = 1 acción (S1: 1 línea; S3: 1 click), 0 cacería.
- Costo de IA visible y atribuido por empresa/proceso (S2/S3).

## Decisiones registradas

- **2026-06-19** — Alcance v1 acordado con Beto (3 bifurcaciones): (1) **solo IA embebida en BSOP** (no relevamiento manual de SaaS/empleados ni tooling personal); (2) **log propio por llamada** para costo atribuible por empresa/proceso; (3) continuidad = **inventario + modelo configurable** (no failover automático ni alertas en v1).
- **2026-06-19** — La tabla `core.ai_config` (override runtime) + el log se mueven a Sprint 2 (no Sprint 1): se acoplan con el código de logging y requieren migración aplicada a prod (OK de Beto). Sprint 1 queda como refactor puro sin DB → cero riesgo de migración, CI verde autónomo, y deja `resolveModel` async como seam drop-in.

## Bitácora

- **2026-06-19** — Promovida desde conversación con Beto (estrés de la idea con el inventario real del código). Arranca Sprint 1.
- **2026-06-19** — Sprint 1 entregado en [#960](https://github.com/beto-sudo/BSOP/pull/960): capa `lib/ai` (registry tipado + `runGenerateObject`/`runEmbed` + `resolveModel` async como seam del override) + drift-guard en CI + bump `claude-opus-4-7 → claude-opus-4-8` + ADR-046. 7 call-sites migrados (documentos, CSF, planos, PLD informe+acuse, estados de cuenta, búsqueda semántica); `extraccion_modelo`/`modelo` ahora = `resolveModel(usoId)` (fix del literal stale en planos). 1896 tests verdes, CI verde. **Sin auto-merge**: Beto valida la extracción en Preview antes de mergear (cambio de comportamiento en rutas sensibles; rollback = 1 línea en `lib/ai/models.ts`).
