# Iniciativa — Peptides (base de info de sourcing + bitácora simple)

**Slug:** `sanren-peptides`
**Empresas:** SANREN (salud/biohacking personal — gateada `RequireAccess empresa="sanren"`, igual que Salud y Familia; **sin** slug de `core.modulos`, gate puro por empresa)
**Schemas afectados:** `peptides` (5 tablas nuevas: `peptidos`, `vendors`, `tests`, `insumos`, `notas`); **reusa** `health.protocolo_*` para la bitácora (sin tablas nuevas ahí)
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-06-03
**Última actualización:** 2026-06-03 (promovida a `in_progress`; Sprint 0 — planning doc + fila en INITIATIVES)

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
