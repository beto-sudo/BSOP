# Iniciativa — Peptides (base de info de sourcing + bitácora simple)

**Slug:** `sanren-peptides`
**Empresas:** SANREN (salud/biohacking personal — gateada `RequireAccess empresa="sanren"`, igual que Salud y Familia; **sin** slug de `core.modulos`, gate puro por empresa)
**Schemas afectados:** `peptides` (5 tablas nuevas: `peptidos`, `vendors`, `tests`, `insumos`, `notas`); **reusa** `health.protocolo_*` para la bitácora (sin tablas nuevas ahí)
**Estado:** done
**Dueño:** Beto
**Creada:** 2026-06-03
**Última actualización:** 2026-06-04 (CERRADA — módulo Peptides completo en prod: base de info, score de vendor, bitácora + calculadora, y Notas curadas de guía/wiki/Telegram/PDFs. PRs #674/#676/#677/#678/#679 + cierre. Post-cierre: calculadora multi-unidad mg/mcg/mL/u + blends multi-péptido (KLOW) en #683)

## Problema

Beto está juntando mucha información de péptidos —de un grupo de Telegram de
~34k miembros ("STG") y sus recursos curados: una guía imprimible, un wiki
([stairwaytogray.com](https://www.stairwaytogray.com/)) y varias Google
Sheets— para decidir qué compuestos usar y, sobre todo, **de qué fuente
comprarlos de forma segura**. Hoy esa info vive dispersa en sheets de terceros
que cambian seguido y en un chat imposible de filtrar. No hay forma de cruzar
la pregunta que de verdad importa: _"¿qué vendor/batch está limpio (pureza
alta, endotoxina OK), a qué precio, y qué tan confiable es el vendor?"_.

El tracker **clínico** ya existe en Health (iniciativa `salud-protocolo`):
catálogo + bitácora de tomas + efectos 0–5, centrado en el cruce
dosis ↔ biomarcadores por el perfil post-bypass. Beto quiere **separar** la
parte de "investigación y decisión de sourcing" en un módulo propio
(**Peptides**, fuera de Health) y tener ahí una **bitácora más simple** que la
clínica.

Contexto que pesa en el diseño: Beto es **post triple-bypass (jul-2024)**.
Estos compuestos son research-grade de mercado gris; la data misma muestra
riesgos reales: un batch de un vendor a **>2,300 EU de endotoxina** con recall,
un vendor **indictado por el DOJ** por vender opioides sintéticos mal
etiquetados, "zero-pep", contaminación con partículas, tinte rojo en Lipo-C.
Para alguien post-bypass, **el filtro de endotoxina/contaminación no es trivia:
es seguridad aguda**. El módulo pone ese filtro al frente, no enterrado.

## Outcome esperado

Un módulo **SANREN → Peptides** que permita:

- **Reunir y filtrar** la info de sourcing en un solo lugar. Caso estrella:
  _"para Retatrutide → vendors activos, batches ≥99% pureza + endotoxina OK,
  ordenados por $/mg, sin flags"_ — un filtro sobre `tests ⨝ vendors ⨝ peptidos`.
- **Catalogar** los péptidos (qué es, para qué, protocolo/dosis típica,
  reconstitución, cautelas).
- **Ver vendors** con su historial de confiabilidad (warnings, removidos,
  garantía, precio $/mg, warehouses, métodos de pago).
- **Consultar COAs** (pureza/endotoxina/masa por batch, con link al reporte).
- **Insumos** (dónde comprar bac water, viales, jeringas, sharps).
- **Notas/Hallazgos** curados (alertas, protocolos) — donde aterriza el digest
  del Telegram cuando libere.
- **Bitácora simple** de lo que va probando (qué, cuánto, cuándo, una nota),
  **reusando** los datos que ya viven en `health.protocolo_*`.

Lo que esta iniciativa **no** es: no es consejo médico, no valida dosis, no
recomienda compuestos ni avala vendors. Organiza la info que Beto ya está
juntando para que decida con mejor señal (lo cual, de hecho, empuja hacia un
sourcing más seguro). La data de COA/vendors es **comunitaria y volátil**; se
marca con fecha "as of" y link a la fuente viva — un snapshot viejo que diga
"limpio" sería peligroso.

## Decisiones de alcance (cerradas con Beto 2026-06-03)

- **D1 · Datos** → importar **snapshot** de las sheets a BSOP (filtrable
  nativo) **+ fecha "as of" por registro + link a la fuente viva + script de
  re-import on-demand**. Sin cron (una pasada; re-pull cuando Beto quiera).
- **D2 · Bitácora** → vive **en Peptides** con UI mínima y **reusa
  `health.protocolo_*`** + las server actions existentes (`registrarToma` /
  `crearCompuesto`). Se **retira la captura compleja de Health**; Health
  conserva solo lo clínico (overlay dosis ↔ biomarcadores + export al
  cardiólogo — futuro Sprint 4 de `salud-protocolo`). Un solo origen de datos,
  un solo lugar de captura.
- **D3 · Gobierno** → iniciativa **hermana** de `salud-protocolo`. **Modo
  autónomo**: backend/datos/docs se mergean en cuanto CI pasa verde; la UI
  (base de info + bitácora) queda en **PR con preview** para revisión de Beto
  antes del merge.

## Modelo de datos (schema `peptides`, 5 tablas nuevas)

Nombres en **español** (consistente con core/erp/dilesa/rdb). RLS **deny-all** +
grant solo `service_role` (igual que `health.protocolo_*` — data personal,
lectura/escritura server-side). El schema se **expone a PostgREST**
(`pgrst.db_schemas`) para que `supabase-js` pueda `.schema('peptides')`.

Links blandos por texto (`vendor_codigo`, `peptido`) en vez de FK uuid: el
import es **snapshot-replace** y los nombres del dataset comunitario son
ruidosos; el cruce se hace en la app. Esto evita churn de FK en cada re-import.

### `peptides.peptidos` — catálogo de referencia (curado, se preserva en re-import)

- `id` uuid PK · `nombre` text NOT NULL UNIQUE · `aliases` text[]
- `clase` text — glp1 / healing / nootropic / longevity / otro
- `descripcion` text · `protocolo_tipico` text · `reconstitucion` text · `cautelas` text
- `fuente` text — wiki / doc / manual · `created_at` / `updated_at` timestamptz

### `peptides.vendors` — fuentes (snapshot de las sheets; `nota_personal` se preserva)

- `id` uuid PK · `codigo` text UNIQUE · `nombre` text
- `estado` text — activo / removido / warning (según sección de la sheet)
- `precio_mg` numeric · `precio_mg_sale` numeric · `moneda` text DEFAULT 'USD'
- `us_warehouse` / `china_warehouse` / `eu_warehouse` bool
- `metodos_pago` text · `primer_contacto` text · `garantia` text
- `notas` text — historial de confiabilidad / WARNINGS (columna oro de la sheet)
- `nota_personal` text — anotación de Beto (sobrevive al re-import)
- `fuente_url` text · `imported_at` timestamptz

### `peptides.tests` — COA / testing (snapshot-replace en cada import)

- `id` uuid PK · `vendor_codigo` text · `peptido` text
- `test_date` date · `batch` text
- `expected_mass_mg` numeric · `mass_mg` numeric · `purity_pct` numeric
- `tfa` text · `endotoxin` text — valor o pass/fail (varía en la fuente)
- `test_lab` text · `file_name` text · `lab_url` text · `imported_at` timestamptz
- Índices: `(peptido)`, `(vendor_codigo)`, `(purity_pct)`

### `peptides.insumos` — proveedores de insumos (snapshot-replace)

- `id` uuid PK · `proveedor` text UNIQUE · `url` text · `productos` text · `imported_at` timestamptz

### `peptides.notas` — hallazgos/alertas curados (Telegram/wiki/doc/manual)

- `id` uuid PK · `titulo` text · `cuerpo` text · `tags` text[]
- `tipo` text — alerta / hallazgo / protocolo / nota
- `peptido` text NULL · `vendor_codigo` text NULL (links opcionales)
- `fuente` text · `fecha` timestamptz · `created_at` timestamptz

**Bitácora (D2):** sin tablas nuevas — reusa `health.protocolo_compuestos` /
`protocolo_tomas` / `protocolo_efectos` (ya sembradas con Retatrutide / KLOW /
Semax + 13 tomas) vía las server actions de `app/health/actions.ts`.

## Alcance v1 (sprints)

- **Sprint 0** — Planning doc + fila en INITIATIVES (este PR).
- **Sprint 1** — Schema `peptides` (5 tablas + RLS deny-all + grants) +
  exposición a PostgREST + registro de módulo SANREN (`nav-config.ts`,
  `ROUTE_TO_EMPRESA`, página `/peptides` gateada). Aplicar a prod vía connector
  `apply_migration` (drift multi-sesión) + regen `SCHEMA_REF`/`types`.
- **Sprint 2** — Importer idempotente (`scripts/import_peptides_stg.ts`): lee
  las 3 sheets públicas, upsert/snapshot-replace a `peptides.*` con `imported_at`.
- **Sprint 3** — UI base de info (preview): filtro estrella COA, vendors con
  warnings, catálogo, insumos, notas. Server-side fetch + filtro client-side.
- **Sprint 4** — Bitácora simple en `/peptides` (reusa `health.protocolo_*`) +
  retirar captura compleja de Health (preview).
- **Sprint 5** — Wiki crawl + Doc (vía `gog`) → catálogo/notas; digest del
  export de Telegram → `notas` cuando libere el cooldown de 24h.

## Fuera de alcance (v1)

- **Sync automático (cron)** de las sheets. Re-import manual on-demand.
- **Compras / pedidos / tracking de órdenes.** Solo referencia + decisión.
- **Motor de interacciones fármaco-fármaco.** No aplica.
- **Multi-usuario.** El módulo es de Beto.
- **Scraping del Telegram en vivo.** Digest de un export puntual.

## Métricas de éxito

- Beto filtra "vendors limpios para Retatrutide por $/mg" en **<10 s**.
- Cada registro trae **fecha "as of" + link a la fuente**; re-import en 1 comando.
- La **bitácora simple** captura una toma en **<15 s** sin tocar Health.
- El **digest del Telegram** aterriza como notas/alertas filtrables.
- CI verde por sprint.

## Riesgos / preguntas abiertas

- **Staleness de la data comunitaria** — mitigado con "as of" + link a fuente +
  re-import. La UI marca la antigüedad del snapshot.
- **El Doc de Google da 404 anónimo** — requiere la sesión de Beto (vía `gog`).
  Pendiente para Sprint 5.
- **Export del Telegram en cooldown de 24h** (límite de seguridad de Telegram a
  la 1ª exportación). Sprint 5 parcialmente bloqueado hasta que libere.
- **OCR de los IDs de las sheets** — validar al re-import; si una truena, pedir
  el link en texto. (Las 3 sheets bajaron OK el 2026-06-03; el Doc no.)
- **Datos sensibles de sourcing** — schema `peptides` deny-all + service-role,
  no expuesto a `authenticated`/`anon`. No logs con payload crudo.
- **No es consejo médico / no avala vendors** — encuadrar en la UI.

## Bitácora

- **2026-06-03** — Promovida a `in_progress`. Origen: Beto pidió un módulo
  Peptides aparte de Health para reunir la info que junta (Telegram STG + guías +
  sheets) y poder filtrar/decidir, más una bitácora propia más simple.
  Exploración del día: las 3 Google Sheets públicas bajaron vía export CSV
  (COA testing 1,441 filas / 66 vendors / 61 péptidos; lista de vendors +
  precios + historial; insumos); el Doc dio 404 anónimo (necesita auth); el
  export del Telegram entró en cooldown de 24h. Alcance v1 cerrado con D1+D2+D3.
  Confirmado por Explore: SANREN gatea por empresa (sin `core.modulos`), y la UI
  debe leer server-side con service-role (RLS deny-all) + filtrar client-side.
- **2026-06-04** — Sprints 1-5 entregados. PR #674 mergeado: schema `peptides`
  (5 tablas) en prod + importer de las 3 sheets (1,441 COAs / 29 vendors / 15
  insumos / 59 péptidos) + UI `/peptides` (filtro estrella COA, **score de
  vendor**, filtros región/estado, catálogo, insumos, notas) + bitácora simple
  reusando `health.protocolo_*` (Health pasó a read-only, captura movida). Beto
  pidió el score de vendor + filtros USA/China a media construcción (se agregó
  antes de la bitácora). Sprint 5 (doc+wiki): el Doc de Google "Guides" entró
  con el link corregido por Beto (OCR confundió `l`↔`I`); curé **12 notas**
  (seguridad, reconstitución, testing, dosis, almacenamiento, labs, crypto,
  diccionario, alerta de endotoxina) + enriquecí 5 GLP-1 vía
  `scripts/seed_peptides_notas.ts`. **Pendiente:** digest del Telegram → notas
  cuando Beto pase el `result.json` (export seguía en cooldown).

- **2026-06-04** — **Iniciativa cerrada.** Sprint 6 (calculadora de
  reconstitución + selector mg/mcg + precarga de la última config + editar/borrar
  tomas; columnas `vial_mg`/`bac_ml`/`concentracion`/`unidades` en
  `health.protocolo_tomas`) en [#678](https://github.com/beto-sudo/BSOP/pull/678).
  Fix de refresco de la bitácora ([#677](https://github.com/beto-sudo/BSOP/pull/677):
  `/peptides` force-dynamic + `revalidatePath`). Digest del Telegram: del export
  STG (37,661 msgs) curé 12 alertas de mods a Notas — bans/recalls (ASC, SRY ×2,
  SSA mislabel), AOD=frag, pH, SLU-PP/Botox/PBS, impersonador
  ([#679](https://github.com/beto-sudo/BSOP/pull/679)). PDFs: análisis
  "Manufacturer Groups" (5 grupos de fábrica) a Notas + ficha BPC-157 al catálogo;
  los "protocolos" de Spiritys resultaron sátira ("It's all made up"). Estado
  final: 25 notas (guía+wiki+Telegram+PDF), 6 péptidos enriquecidos, 1,441 COAs /
  29 vendors con score. Telegram export en `~/Downloads/Telegram Desktop/ChatExport_*`;
  re-sync = `scripts/import_peptides_stg.ts` + `scripts/seed_peptides_notas.ts`.

- **2026-06-04** — _Post-cierre · mejoras a la calculadora._ La calculadora de
  la bitácora pasó a **multi-unidad** (mg/mcg/mL/u con panel de equivalencias —
  misma dosis en las 4 unidades vía la concentración; mL/u por jeringa U-100) en
  [#683](https://github.com/beto-sudo/BSOP/pull/683). Sobre esa rama se agregó
  **soporte de blends multi-péptido (caso KLOW** = TB-500 10 + BPC-157 10 + KPV
  10 + GHK-Cu 50 = 80mg/vial**)**: columna `componentes jsonb` en
  `health.protocolo_compuestos` (migración additive/nullable, DDL puro — el seed
  va por `scripts/seed_protocolo_klow.ts`, no en migración), `lib/blend.ts`
  (math puro client-safe: `blendTotalMg`/`blendBreakdown`/`parseComponentes` +
  test), y en la UI: al elegir un blend la dosis se captura **por volumen**
  (vial = suma derivada, no editable) y un **panel de desglose** muestra los mg
  entregados de cada componente para el volumen jalado
  (`mg_i = comp.mg × mL/agua`). El form "+Nuevo" gana un editor de componentes
  para crear otros blends. KLOW ya existía como compuesto en prod → el seed le
  adjuntó la receta vía UPDATE idempotente.

- **2026-06-08** — _Post-cierre · filtros + equivalencias en la bitácora._ La
  lista "Últimas tomas" gana **filtros por péptido y por rango de fecha**
  (desde/hasta, fechas locales `America/Matamoros`; el recorte a 60 se aplica
  **después** de filtrar) y cada fila muestra ahora la **concentración + mg +
  mcg** de la toma, derivados al vuelo con `computeConversions` de lo que se
  guardó (`vial_mg`/`bac_ml`/`dosis`/`unidad`) — misma math que el panel de
  equivalencias del registro, sin columnas nuevas en `health.protocolo_tomas`.
  Cambio UI-only en `components/peptides/bitacora-tab.tsx`.

## Decisiones registradas

- **2026-06-03** — Schema **`peptides` propio** (no tablas dentro de `health`).
  _Razón:_ dominio distinto (sourcing/COA/vendors) al clínico de Health; Beto lo
  quiere conceptualmente separado. Costo: 1 migración de exposición a PostgREST
  (patrón `*_expose_schema` ya conocido). _Aplica a:_ todo el schema.
- **2026-06-03** — Links **blandos por texto** (`vendor_codigo`, `peptido`) en
  `tests`, no FK uuid. _Razón:_ el import es snapshot-replace con nombres
  ruidosos de fuente comunitaria; FK uuid generaría churn en cada re-import. El
  cruce se hace en la app. _Aplica a:_ `tests`, links opcionales en `notas`.
- **2026-06-03** — `tests`/`vendors`/`insumos` = **snapshot-replace** en import;
  `peptidos`/`notas` = **curados/preservados**; `vendors.nota_personal`
  sobrevive al re-import. _Razón:_ separar lo que viene de la fuente (se refresca
  entero) de lo que cura Beto (no se pisa). _Aplica a:_ el importer.
- **2026-06-03** — Bitácora **reusa `health.protocolo_*`** en vez de tabla nueva.
  _Razón:_ evita dos fuentes de verdad y conserva el seed real (Reta/KLOW/Semax);
  la UI simple solo cambia la captura, no el modelo. _Aplica a:_ Sprint 4.
- **2026-06-03** — RLS **deny-all + service-role** (igual que `health.protocolo_*`).
  _Razón:_ consistencia + data de sourcing no debe ser legible por API directa;
  la app lee/escribe server-side. _Aplica a:_ las 5 tablas `peptides.*`.
- **2026-06-04** — **Score de vendor** (`lib/peptides-score.ts`): resultados/calidad
  40% · precio 25% · evidencia (# COAs, log-escalado) 20% · endotoxina 15%, con
  `estado` como multiplicador (activo 1 / warning 0.75 / removido 0.4). Match
  blando vendor↔COA por código normalizado (BFF ↔ BFF/AMO). _Razón:_ Beto pidió
  puntuar para decidir dónde comprar; transparente y recalibrable (pesos
  documentados + desglose en el drawer), no caja negra. _Aplica a:_ pestaña Vendors.
- **2026-06-04** — **Blends como `componentes jsonb` en el compuesto, dosis por
  volumen, desglose derivado** (no persistido por toma). _Razón:_ un blend es un
  solo vial físico con varios péptidos en proporción fija; modelarlo como un
  compuesto con receta `[{nombre,mg}]` evita inventar tablas hijas y mantiene la
  bitácora con un registro por inyección. El desglose por componente
  (`mg_i = comp.mg × mL/agua`) es función pura de la receta + agua + volumen, así
  que se calcula al vuelo (si Beto corrige la receta, las tomas viejas se
  recalculan solas — deseable para una bitácora personal). La dosis se captura
  por volumen (mL/u) porque es lo que se jala de la jeringa; el vial total es la
  suma derivada (no editable). _Aplica a:_ `lib/blend.ts`, calculadora de la
  bitácora, `crearCompuesto`.
