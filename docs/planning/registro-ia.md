# Iniciativa — Registro de IA (inventario, costo y continuidad de los usos de IA)

**Slug:** `registro-ia`
**Empresas:** todas (capa transversal; hoy la IA productiva vive en cross + DILESA)
**Schemas afectados:** principalmente código (`lib/ai/` capa única + registry); Sprint 2 agrega `core` (tablas `ai_config` override de modelo, `ai_invocaciones` log de uso/costo). Lectura de `core.usuarios` para autoría.
**Estado:** done
**Próximo hito:** — (cerrada; los 3 sprints en prod: #960 capa+guard+bump, #961 override+log, #962 UI de Configuración).
**Dueño:** Beto
**Creada:** 2026-06-19
**Última actualización:** 2026-06-19 (cerrada — los 3 sprints en prod, validados; #960/#961/#962)

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

- [x] **Sprint 1 — Capa única + registry + drift-guard (refactor, sin DB).** `lib/ai/` como único entry point (clients, models, registry declarativo, `resolveModel` async, wrappers `runGenerateObject`/`runEmbed`). 7 call-sites migrados. Drift-guard en CI. `usoId` tipado contra el registry. Bump `claude-opus-4-7 → claude-opus-4-8`. ADR-046. **En prod (#960), validado contra 6 docs reales.**
- [~] **Sprint 2 — Override de modelo + log de uso/costo.** Migración `core.ai_config` (override por uso) + `core.ai_invocaciones` (modelo, proceso, empresa, tokens in/out, costo estimado). `resolveModel` lee el override (cache 60s + fail-open); los wrappers loggean cada llamada (fail-open). Pricing autoritativo en `lib/ai/pricing.ts`. **Código construido + migración como archivo; pendiente: OK de Beto para aplicar a prod.**
- [~] **Sprint 3 — UI en Configuración.** Página admin-only `/settings/ia` (#962): tabla de usos (del registry) + modelo efectivo con editor de override (escribe `core.ai_config`, surte sin redeploy) + KPIs de costo/conteo + costo por empresa (de `core.ai_invocaciones`). Embeddings read-only con aviso de reindex. **Sin migración** (settings = admin-gated; lee/escribe vía admin client sobre el RLS deny-all). En review de Preview.

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
- **2026-06-19 (S2)** — **Pricing autoritativo** en `lib/ai/pricing.ts` (no `data/models.json`, que está stale y no trae 4-8 ni el embedding): opus-4-8 = $5/$25 por 1M (fuente Anthropic), text-embedding-3-large = $0.13/1M (OpenAI). Los **tokens loggeados son factuales**; el costo es derivado → si el pricing cambia, se actualiza ahí y se recomputa desde los tokens.
- **2026-06-19 (S2)** — **RLS deny-all** en `ai_config`/`ai_invocaciones` (sin policies; service_role bypassa; revoke a anon/authenticated). La UI del Sprint 3 lee vía route handler con admin client. Evita depender de `fn_is_admin` y cierra el perímetro como en blindaje-financiero.
- **2026-06-19 (S2)** — **Atribución de empresa v1 = slug estático del registry** (`cross`/`dilesa`), no el `empresa_id` real en runtime. Da costo por proceso (siempre) y por dilesa-vs-cross sin tocar los 7 call-sites. El threading del `empresa_id` real (para partir el costo de los usos `cross` por empresa) queda como fast-follow.
- **2026-06-19 (S2)** — El código es **fail-open** (resolveModel y logInvocacion caen al default / no-op si la tabla no existe) → se puede deployar **antes** de aplicar la migración a prod sin romper nada; el Preview branch la corre y la valida.
- **2026-06-19 (S3)** — La UI vive en **`/settings/ia` (admin-gated), NO como módulo RBAC** → cero migración, cero touchpoints de ADR-014. Lee/escribe vía admin client (bypassa el RLS deny-all del S2). Mismo patrón que `/settings/notificaciones`. El editor del cliente importa solo de `registry`/`pricing` (puros) para no arrastrar `@ai-sdk` al bundle. Embeddings sin editor (read-only + aviso de reindex).

- **2026-06-19** — Promovida desde conversación con Beto (estrés de la idea con el inventario real del código). Arranca Sprint 1.
- **2026-06-19** — Sprint 1 entregado en [#960](https://github.com/beto-sudo/BSOP/pull/960): capa `lib/ai` (registry tipado + `runGenerateObject`/`runEmbed` + `resolveModel` async como seam del override) + drift-guard en CI + bump `claude-opus-4-7 → claude-opus-4-8` + ADR-046. 7 call-sites migrados (documentos, CSF, planos, PLD informe+acuse, estados de cuenta, búsqueda semántica); `extraccion_modelo`/`modelo` ahora = `resolveModel(usoId)` (fix del literal stale en planos). 1896 tests verdes, CI verde. **Sin auto-merge**: Beto valida la extracción en Preview antes de mergear (cambio de comportamiento en rutas sensibles; rollback = 1 línea en `lib/ai/models.ts`).
- **2026-06-19** — **Validación del bump 4-7→4-8 hecha por CC** (Beto delegó: "haz las pruebas"). Script throwaway que bajó PDFs reales de prod y corrió la extracción con 4-8, diffeando contra el baseline 4-7 guardado: 2 escrituras (tipo_operacion + n_partes ✓), 2 planos (tipología + lotes exactos: 163 y 354, área exacta ✓), 2 CSF (RFC exacto NIG070412DB7 / DIE030904866 ✓). **0 regresión** → #960 mergeado a main (4-8 en prod).
- **2026-06-19** — Sprint 2 construido: migración `20260619174421_core_ai_config_y_invocaciones.sql` (2 tablas + RLS deny-all + revoke anon + índices) + `resolveModel` lee el override (cache 60s + fail-open) + wrappers loggean uso/costo (fail-open) + `lib/ai/pricing.ts`. Tests nuevos (config/pricing/run = override, costo, wiring de logging, fail-open). **Migración NO aplicada a prod** (toca `core` + RLS → OK de Beto); código fail-open seguro de deployar antes.
- **2026-06-19** — **Sprint 2 aplicado + mergeado** (#961): Beto dio OK; `supabase db push` aplicó la migración a prod (verificado: ambas tablas con RLS on + 0 policies; ledger 1:1 sin drift), regen de SCHEMA_REF + types, CI verde (Supabase Preview aplicó la migración limpia), auto-merge. `core.ai_config` + `core.ai_invocaciones` vivas en prod.
- **2026-06-19** — **Sprint 3 construido** ([#962](https://github.com/beto-sudo/BSOP/pull/962)): pantalla admin-only `/settings/ia` (page + client + actions) + entrada en el nav + `MODELOS_POR_PROVEEDOR` en `pricing.ts` + fix del sync test de nav-config. typecheck/lint/format limpios, 1909 tests verdes. **Sin migración.** Sin auto-merge (UI → Beto revisa el Preview y mergea; cierra la iniciativa).
- **2026-06-19** — **#962 mergeado → iniciativa CERRADA.** Los 3 sprints en prod. Resultado: la IA de BSOP pasó de dispersa-y-sin-registro a (1) una capa única `lib/ai/` con drift-guard que no deja que envejezca, (2) modelo cambiable sin redeploy desde **Configuración → IA**, (3) costo y conteo atribuidos por empresa/proceso. Fast-follows opcionales (no bloqueantes): threading del `empresa_id` real en runtime para partir el costo de los usos `cross` por empresa; tightening de los casts `as any` ahora que `core.ai_config`/`ai_invocaciones` están en los tipos generados.
