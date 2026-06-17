# Iniciativa — Portafolio como expediente operable (DILESA)

**Slug:** `dilesa-portafolio-expediente`
**Empresas:** DILESA
**Schemas afectados:** `dilesa` (escritura en `activos` + satélites vía alta/edición; restaurar columnas de documento en `activo_terreno`; `activo_espectacular` + scoring/dueño-terreno; nueva tabla puente `activo_documentos` 1:N a `erp.documentos`; posible `v_portafolio_*` para filtros/KPIs; RPCs de alta/transición). `erp` (lectura `documentos` para ligar escrituras; `adjuntos` para planos/escrituras/KMZ como archivos). UI: `portafolio-module`, `activo-detail-drawer` + nuevo drawer de captura, hub de tabs ADR-030.
**Estado:** in_progress
**Próximo hito:** Sprint 1 — drawer de alta/edición de activos (desbloqueo: hoy el módulo es read-only) + filtros ricos + KPI strip + adjuntos (planos/escrituras/KMZ como archivos) en la ficha.
**Dueño:** Beto
**Creada:** 2026-06-16
**Última actualización:** 2026-06-16 (promovida; arranca Sprint 1)

> **Sucede a** [`dilesa-portafolio-destinos`](dilesa-portafolio-destinos.md) (cerrada) y [`dilesa-portafolio-activos`](dilesa-portafolio-activos.md) (v1 del schema). El **módulo de arrendamiento** y los **mapas interactivos** ([`mapas-interactivos`](mapas-interactivos.md)) son iniciativas hermanas separadas.

## Problema

El módulo Portafolio es **100% read-only**: no hay forma de dar de alta ni editar un activo en la UI (todo entró por import de Coda o por el RPC de liberación). Eso bloquea **todo** lo que el negocio necesita: cargar terrenos nuevos en evaluación de compra, cargar los espectaculares, ligar planos/escrituras/KMZ. Un análisis multi-lente (2026-06-16) además descubrió que el schema **ya soporta mucho más de lo que el módulo muestra**:

- `dilesa.activo_terreno` ya trae el **embudo de evaluación de compra completo** (precio solicitado/ofertado, valor objetivo, propietario, corredor, origen, etapa, decisión, prioridad, responsable, próxima acción) heredado de la vieja tabla Coda — invisible por falta de UI. Y se **perdieron 3 columnas de documento** (kmz/zcu/escritura) al plegar la tabla al satélite.
- Los 11 satélites por tipo son ricos; `activo_espectacular` está casi completo (faltan scoring de medios + dueño del terreno).
- Filtros pobres (solo tipo + nombre), sin KPIs, sin captura, sin pipeline, sin documentos ligados.

## Outcome esperado

El Portafolio deja de ser una lista y se vuelve el **expediente operable de cada activo** + un **hub de gestión**:

1. **Captura/edición** de cualquier activo desde la UI (el desbloqueo).
2. **Filtros ricos + KPIs** sobre dimensiones que ya existen (estado, destino, municipio, valor).
3. **Documentos ligados**: planos, escrituras y KMZ por activo (archivos), escrituras además estructuradas (1:N a `erp.documentos` con extracción IA).
4. **Evaluación de compra de terrenos**: pipeline gobernado (prospecto→adquirido/descartado) con snapshot financiero ($/m² aprovechable) y **bitácora de auditoría** (regla dura de Beto).
5. **Espectaculares** cargados (52 del doc Coda 6-2avcAHjP, todos DILESA) con su scoring.

## Alcance

- **Sprint 1 (desbloqueo + quick wins):** drawer de alta/edición de activos (server actions gated admin/Dirección, atómico master+satélite) + filtros ricos (estado/destino/municipio/valor, useUrlFilters) + KPI strip + sección "Documentos" en la ficha (planos/escrituras/KMZ como archivos vía `<FileAttachments>`). Restaurar las 3 columnas de documento de `activo_terreno`.
- **Sprint 2 (evaluación de compra):** tab "Evaluación" (pipeline de terrenos) + snapshot financiero (recuperar derivadas de la vieja `dilesa.terrenos`) + bitácora append-only del embudo + due-diligence/factibilidades como checklist-gate.
- **Sprint 3 (espectaculares):** migración chica (scoring de medios jsonb + dueño del terreno; decisión de grano = 1 activo con caras jsonb) + loader idempotente de los 52 + UI de alta/edición + filtros OOH.
- **Sprint 4 (escrituras + hub):** tabla puente `activo_documentos` (1:N a `erp.documentos`) + extracción IA de escritura + hub de tabs ADR-030 (Inventario · Evaluación · …).

**Fuera:** módulo de arrendamiento (iniciativa propia, futura); mapas interactivos (iniciativa `mapas-interactivos`); el desembolso/compra real (vive en flujo de gasto/CxP — aquí solo el handoff de datos).

## Riesgos

- **Bucket de Storage `adjuntos` sin scoping de empresa robusto** (gap conocido, ver [[project_erp_rls_empresa_isolation]]) — validar antes de exponer adjuntos del portafolio a no-admins.
- **Captura atómica master+satélite**: un alta a medias deja satélites huérfanos → RPC transaccional.
- **FK cross-schema `dilesa.activos`↔`erp.documentos`**: supabase-js no embebe cross-schema → dos queries con `.in()` (ver [[reference_supabase_cross_schema_fk]]).
- **Embudo con datos heterogéneos de Coda**: normalizar etapas existentes antes de imponer CHECK.
- **PostGIS no instalado**: la geo se modela como archivo + jsonb cacheado, no `geometry` (el render de mapas vive en la iniciativa `mapas-interactivos`).

## Métricas de éxito

- Alta/edición de activos operable por Dirección sin tocar SQL.
- 52 espectaculares cargados con scoring.
- Pipeline de evaluación con audit trail por terreno.
- Filtros + KPIs sobre el portafolio completo.

## Decisiones registradas

- **2026-06-16 — Los 52 espacios publicitarios del doc Coda (incl. los 20 "Padel") son de DILESA** (Beto) → se cargan todos al portafolio DILESA.
- **2026-06-16 — Escrituras 1:N** (tabla puente `activo_documentos` a `erp.documentos`), no FK simple — predios pueden fraccionarse en varias escrituras.
- **2026-06-16 — Mapa del portafolio = KMZ como archivo** en esta iniciativa; la visualización interactiva se hace en `mapas-interactivos` (cross-módulo).
- **2026-06-16 — Espectacular = 1 activo con caras en jsonb** (no 2 activos por panel) — propuesto; confirmar al llegar al Sprint 3.

## Bitácora

- **2026-06-16** — Promovida tras análisis multi-lente del módulo (5 lentes: datos, adquisición, UX/IA, geo-docs, espectaculares). Hallazgo raíz: el módulo es read-only y el schema ya soporta evaluación de terrenos. Arranca por el desbloqueo (captura + filtros + KPIs + adjuntos).
