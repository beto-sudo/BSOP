# Iniciativa — Gobierno corporativo

**Slug:** `gobierno-corporativo`
**Empresas:** todas (golden: **DILESA**; rollout al resto cuando aplique)
**Schemas afectados:** `core` (8 tablas nuevas: `empresa_socios`, `gobierno_config`, `gobierno_mayorias`, `gobierno_consejeros`, `gobierno_actas`, `gobierno_acta_acuerdos`, `gobierno_acta_votos`, `gobierno_acta_asistentes`); **reutiliza** `erp.documentos` para todos los PDFs (reglamento + actas).
**Estado:** in_progress
**Dueño:** Beto
**Creada:** 2026-06-01
**Última actualización:** 2026-06-02 (**Sprint 1 aplicado a prod**: migración `20260602004906_core_gobierno_corporativo.sql` (8 tablas en `core` + RLS canónica + 4 refinamientos del Reglamento) aplicada vía `supabase db push`, verificada (8 tablas, RLS on, 4 policies c/u), `SCHEMA_REF`/`types` regenerados. Estado `planned → in_progress`. Drift de historial con la sesión hermana `cxp-sprint-3` (migración `001532` remote-only, módulo `rdb.cxp`) resuelto alineando el archivo local temporalmente — no se commitea en este PR. Próximo: Sprint 2 (tabs Cuadro accionario + Gobierno corporativo). | Promovida y alcance v1 cerrado el mismo día. Beto cerró las 3 bifurcaciones de schema: (1) **cuadro accionario real** vía `core.empresa_socios` — llena el tab placeholder existente y es la columna vertebral de gobierno + votación; (2) **voto por socio por acuerdo** (`gobierno_acta_votos`) para máxima trazabilidad; (3) promover a iniciativa golden DILESA. Schema = `core` (evita fricción de `db:types`/workflow de un schema nuevo). RBAC admin-only heredado del host de tabs. Próximo: aplicar Sprint 1 (schema DB-puro) tras OK del modelo. Ver Bitácora.)

## Problema

DILESA es de **3 familias al 33.33%** — Nigropetense (Santos de los Santos), CHC (Chavarría Cruz), Gesan (Santos Diego). Tiene un **Reglamento de Gobierno firmado (ago-2021)** y está en pre-análisis de una **reestructura patrimonial**. Hoy:

- El reglamento, las reglas de mayorías, el derecho del tanto, la composición del consejo y los periodos de mandato viven en **papel + memoria de Beto**. No hay fuente de verdad consultable.
- Las **actas de asamblea** (ordinarias/extraordinarias) viven en carpetas físicas / PDFs sueltos. No hay índice por folio, ni trazabilidad de quórum, acuerdos ni votación por familia.
- El **cuadro accionario** (quién tiene qué %) y **quién ostenta el voto de cada familia** no está modelado en BSOP — los tabs "Cuadro accionario" y "Beneficiario controlador" de Configuración > Empresas son **placeholders** ("Próximamente") sin schema.
- Cualquier decisión de gobierno (¿esta venta requiere 75% o 51%?, ¿quién firma por Gesan?, ¿cuándo vence el mandato del consejo?) requiere abrir el reglamento físico y buscar.

En el contexto de una **reestructura patrimonial**, no tener el gobierno corporativo como repositorio vivo y auditable es un riesgo: decisiones que necesitan respaldo documental quedan sin trazabilidad, y el histórico de acuerdos no es consultable.

## Outcome esperado

- **BSOP es el repositorio vivo del gobierno corporativo** de cada empresa, empezando por DILESA.
- **Cuadro accionario real**: lista de socios con % de participación. El socio puede ligarse a una empresa BSOP (Nigropetense _es_ una `core.empresas`) o quedar como entidad/persona externa. Llena el tab placeholder existente.
- **Gobierno corporativo estructurado**: reglamento (PDF) + mayorías por tipo de decisión (umbral % + quórum + órgano) + consejeros con qué familia representan y si ostentan el voto + derecho del tanto (aplica/plazo/prelación) + periodos de mandato.
- **Actas de asamblea**: repositorio con folio, tipo (ordinaria/extraordinaria), fecha, quórum y % representado, orden del día, **acuerdos con votación por socio por acuerdo** (favor/contra/abstención, auditable), protocolización notarial (escritura, notario, fecha, registro público) y PDF del acta.
- **Trazabilidad total**: el voto de cada familia en cada acuerdo queda registrado; el quórum y las mayorías son recalculables contra el cuadro accionario, no un dato suelto.
- **Reutiliza la plomería existente**: los PDFs viven en `erp.documentos` (extracción IA + full-text gratis); la RLS es canónica; el RBAC es admin-only heredado del host de tabs (cero maquinaria de módulo de sidebar).

## Decisiones registradas

- **2026-06-01 — Schema = `core`, no un schema nuevo.** Un schema nuevo obliga a sincronizar `db:types` en `package.json` **y** `.github/workflows/db-types.yml` (drift conocido que rompe el PR autogenerado de tipos). `core` ya está cubierto por ambos → cero fricción. Además es data de configuración de empresa, admin-only, vecina natural de `core.empresas`/`core.empresa_documentos`.
- **2026-06-01 — PDFs reutilizan `erp.documentos`.** No se guardan binarios ni columnas `archivo_url` nuevas. El reglamento se liga vía `gobierno_config.reglamento_documento_id`; cada acta vía `gobierno_actas.documento_id`. Las actas se dan de alta como `erp.documentos` con `tipo_operacion='acta_asamblea'` → ganan extracción IA + búsqueda. (Cross-schema: sin embedding de PostgREST; el app-layer hidrata con segunda query con `.in()`, patrón ya usado en `/api/empresas/[id]/documentos`.)
- **2026-06-01 — RBAC admin-only.** Heredado de `<RequireAccess adminOnly>` del host de tabs. NO aplica la regla "Liberación de módulo nuevo" (slug + backfill de permisos) — esa es solo para módulos del sidebar. Ahorra una migración entera. RLS en DB de todas formas canónica (`core.fn_has_empresa OR core.fn_is_admin`; UPDATE/DELETE solo admin, como `erp.finiquitos` — las actas no se editan a la ligera).
- **2026-06-01 — D1 (cuadro accionario): tabla real `core.empresa_socios`.** Beto eligió construir el cap-table de verdad (vs. mini-tabla self-contained en gobierno). Llena el tab placeholder "Cuadro accionario" y es la referencia de consejeros + votación de actas. Amplía alcance v1 pero evita duplicar/migrar después.
- **2026-06-01 — D2 (votación de actas): voto por socio por acuerdo.** Beto eligió `gobierno_acta_votos` granular (vs. resumen por acuerdo) — alineado a la regla dura de audit trails. Permite recalcular quórum y mayorías contra el cuadro accionario.
- **2026-06-01 — El reglamento se liga por FK directo en `gobierno_config`, no por rol en `core.empresa_documentos`.** Mantiene el gobierno self-contained; el panel de documentos legales se queda enfocado en docs de RH/LFT. El histórico de reformas del reglamento queda como filas previas en `erp.documentos`.
- **2026-06-02 — Escrituras de gobierno por browser client, no API routes.** El plan original preveía `/api/empresas/[id]/gobierno` con `requireAdmin`. Para socios/mayorías/consejeros/config (data de configuración, sin cross-schema complejo) las escrituras van directo por el browser client: la página es `<RequireAccess adminOnly>` **y** la RLS de las tablas exige admin para UPDATE/DELETE. Ahorra ~10 endpoints. Las referencias cross-schema (reglamento/acta → `erp.documentos`) se resuelven con lectura directa + hidratación, no necesitan route handler. Si más adelante se quiere audit server-side, se agrega sin reescribir la UI.
- **Pendiente al ejecutar (no bloquea schema):** sembrar los datos reales de DILESA (% por familia, las mayorías y derecho del tanto del Reglamento ago-2021, composición del consejo y mandatos) requiere leer el **Reglamento de Gobierno** — Beto lo aporta en Sprint 4.

## Modelo de datos (migración propuesta — Sprint 1)

> **APLICADA a prod 2026-06-02** — `supabase/migrations/20260602004906_core_gobierno_corporativo.sql` (8 tablas + RLS + `NOTIFY pgrst`; `SCHEMA_REF.md`/`types/supabase.ts` regenerados). El archivo de migración es la **fuente canónica**; el bloque SQL de abajo es el modelo conceptual. La versión aplicada incorpora 4 refinamientos extraídos del Reglamento (ver "Datos extraídos del Reglamento"): `empresa_socios.familia`; `gobierno_config.dividendo_anual_monto`/`dividendo_moneda`/`consejo_sesiones_por_anio`/`consejo_max_miembros`; `gobierno_consejeros.vitalicio`/`organo`; y `organo='comite_directivo'` en `gobierno_mayorias`.

```sql
-- ============================================================================
-- Iniciativa: gobierno-corporativo · Sprint 1 (schema DB-puro)
-- Schema: core. Golden: DILESA. RBAC admin-only en app; RLS canónica en DB.
-- ============================================================================

-- 1) Cuadro accionario — el "quién". Llena el tab placeholder existente.
CREATE TABLE IF NOT EXISTS core.empresa_socios (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       uuid NOT NULL REFERENCES core.empresas(id) ON DELETE CASCADE,
  nombre           text NOT NULL,                          -- "Nigropetense", "CHC", "Gesan"
  tipo             text NOT NULL DEFAULT 'entidad'
                     CHECK (tipo IN ('familia','persona','entidad')),
  socio_empresa_id uuid REFERENCES core.empresas(id),      -- si el socio ES empresa BSOP (Nigropetense)
  socio_persona_id uuid,                                   -- → erp.personas (cross-schema; FK suave)
  porcentaje       numeric(7,4) NOT NULL CHECK (porcentaje >= 0 AND porcentaje <= 100),
  orden            integer NOT NULL DEFAULT 1,
  activo           boolean NOT NULL DEFAULT true,
  notas            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz
);
CREATE INDEX ON core.empresa_socios (empresa_id) WHERE activo;

-- 2) Config de gobierno — 1 fila por empresa.
CREATE TABLE IF NOT EXISTS core.gobierno_config (
  empresa_id              uuid PRIMARY KEY REFERENCES core.empresas(id) ON DELETE CASCADE,
  reglamento_documento_id uuid,                            -- → erp.documentos (PDF del reglamento vigente)
  reglamento_fecha        date,                            -- ago-2021 en DILESA
  mandato_meses_default   integer,                         -- periodo de mandato estándar de consejeros
  tanto_aplica            boolean NOT NULL DEFAULT false,  -- derecho del tanto sí/no
  tanto_plazo_dias        integer,                         -- plazo para ejercerlo
  tanto_orden_prelacion   text,                            -- a quién se ofrece primero
  notas                   text,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid REFERENCES core.usuarios(id)
);

-- 3) Mayorías por tipo de decisión.
CREATE TABLE IF NOT EXISTS core.gobierno_mayorias (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES core.empresas(id) ON DELETE CASCADE,
  tipo_decision text NOT NULL,                             -- "Venta de activos", "Presupuesto anual"...
  organo        text NOT NULL CHECK (organo IN ('asamblea','consejo')),
  quorum_pct    numeric(5,2) CHECK (quorum_pct >= 0 AND quorum_pct <= 100),
  umbral_pct    numeric(5,2) NOT NULL CHECK (umbral_pct > 0 AND umbral_pct <= 100),
  orden         integer NOT NULL DEFAULT 1,
  notas         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON core.gobierno_mayorias (empresa_id);

-- 4) Consejeros — quién ostenta el voto de cada socio + mandato.
CREATE TABLE IF NOT EXISTS core.gobierno_consejeros (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL REFERENCES core.empresas(id) ON DELETE CASCADE,
  socio_id       uuid REFERENCES core.empresa_socios(id),  -- a qué familia representa
  persona_id     uuid,                                     -- → erp.personas (cross-schema; FK suave)
  nombre         text NOT NULL,                            -- snapshot legible del consejero
  cargo          text NOT NULL DEFAULT 'propietario'
                   CHECK (cargo IN ('presidente','secretario','propietario','suplente')),
  ostenta_voto   boolean NOT NULL DEFAULT true,
  periodo_inicio date,
  periodo_fin    date,
  activo         boolean NOT NULL DEFAULT true,
  notas          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz
);
CREATE INDEX ON core.gobierno_consejeros (empresa_id) WHERE activo;

-- 5) Actas de asamblea — header.
CREATE TABLE IF NOT EXISTS core.gobierno_actas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid NOT NULL REFERENCES core.empresas(id) ON DELETE CASCADE,
  folio                 text,
  tipo                  text NOT NULL CHECK (tipo IN ('ordinaria','extraordinaria')),
  fecha                 date NOT NULL,
  lugar                 text,
  quorum_pct            numeric(5,2),                       -- % representado presente (capturado o derivado)
  orden_dia             jsonb,                              -- ["1. ...", "2. ..."]
  -- protocolización notarial
  protocolizada         boolean NOT NULL DEFAULT false,
  numero_escritura      text,
  notario               text,
  fecha_protocolizacion date,
  registro_publico      text,                              -- folio mercantil / inscripción
  documento_id          uuid,                              -- → erp.documentos (PDF del acta)
  estado                text NOT NULL DEFAULT 'borrador'
                          CHECK (estado IN ('borrador','firmada','protocolizada')),
  notas                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES core.usuarios(id),
  updated_at            timestamptz
);
CREATE INDEX ON core.gobierno_actas (empresa_id, fecha DESC);

-- 6) Acuerdos por acta.
CREATE TABLE IF NOT EXISTS core.gobierno_acta_acuerdos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acta_id    uuid NOT NULL REFERENCES core.gobierno_actas(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES core.empresas(id) ON DELETE CASCADE,
  orden      integer NOT NULL DEFAULT 1,
  punto      text NOT NULL,                                -- texto del acuerdo
  resultado  text NOT NULL CHECK (resultado IN ('aprobado','rechazado','aplazado')),
  notas      text
);
CREATE INDEX ON core.gobierno_acta_acuerdos (acta_id);

-- 7) Voto por socio por acuerdo (auditable — D2).
CREATE TABLE IF NOT EXISTS core.gobierno_acta_votos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acuerdo_id       uuid NOT NULL REFERENCES core.gobierno_acta_acuerdos(id) ON DELETE CASCADE,
  empresa_id       uuid NOT NULL REFERENCES core.empresas(id) ON DELETE CASCADE,
  socio_id         uuid REFERENCES core.empresa_socios(id),
  sentido          text NOT NULL CHECK (sentido IN ('favor','contra','abstencion')),
  representado_por text,                                   -- consejero/apoderado que emitió el voto
  UNIQUE (acuerdo_id, socio_id)
);
CREATE INDEX ON core.gobierno_acta_votos (acuerdo_id);

-- 8) Asistentes / representación (quórum + % representado).
CREATE TABLE IF NOT EXISTS core.gobierno_acta_asistentes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acta_id          uuid NOT NULL REFERENCES core.gobierno_actas(id) ON DELETE CASCADE,
  empresa_id       uuid NOT NULL REFERENCES core.empresas(id) ON DELETE CASCADE,
  socio_id         uuid REFERENCES core.empresa_socios(id),
  presente         boolean NOT NULL DEFAULT true,
  representado_por text,                                   -- apoderado, si no asistió en persona
  porcentaje       numeric(7,4),                           -- snapshot del % al momento del acta
  UNIQUE (acta_id, socio_id)
);
CREATE INDEX ON core.gobierno_acta_asistentes (acta_id);

-- ── RLS canónica (se aplica a las 8 tablas; patrón mostrado para una) ────────
ALTER TABLE core.empresa_socios ENABLE ROW LEVEL SECURITY;
CREATE POLICY empresa_socios_sel ON core.empresa_socios FOR SELECT
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY empresa_socios_ins ON core.empresa_socios FOR INSERT
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY empresa_socios_upd ON core.empresa_socios FOR UPDATE
  USING (core.fn_is_admin()) WITH CHECK (core.fn_is_admin());
CREATE POLICY empresa_socios_del ON core.empresa_socios FOR DELETE
  USING (core.fn_is_admin());
-- … idéntico para gobierno_config, gobierno_mayorias, gobierno_consejeros,
--    gobierno_actas, gobierno_acta_acuerdos, gobierno_acta_votos,
--    gobierno_acta_asistentes (los hijos resuelven empresa_id de su propia
--    columna desnormalizada).

NOTIFY pgrst, 'reload schema';
```

**Notas de diseño:**

- `empresa_id` desnormalizado en todas las tablas hijas (acuerdos/votos/asistentes) → la RLS resuelve sin JOINs y las queries son directas, patrón ya usado en el repo (`erp.juntas_notas`, `cxp_pago_aplicaciones`).
- `socio_persona_id` y `persona_id` apuntan a `erp.personas` (cross-schema): FK dura a nivel DB ok, pero el app-layer **no** puede usar embedding de PostgREST `.schema('core')` → hidratar con segunda query (memoria `reference_supabase_cross_schema_fk.md`). Por eso `consejeros.nombre` y `votos.representado_por` guardan snapshot legible: la UI no rompe aunque la persona no esté en `erp.personas`.
- No hay constraint que fuerce `Σ porcentaje = 100` por empresa (puede haber transiciones donde no sume — reestructura). Se valida en UI con warning, no en DB.

## Alcance v1

- [x] **Sprint 1 — Schema (DB-puro)** ✅ aplicado a prod 2026-06-02: las 8 tablas + RLS canónica + índices + `NOTIFY pgrst` + `SCHEMA_REF`/`types` regenerados. Verificado: 8 tablas, RLS on, 4 policies c/u.
- **Sprint 2 — Tab "Cuadro accionario" + "Gobierno corporativo"**:
  - [x] **2a · Cuadro accionario** — lleno el placeholder con CRUD de `empresa_socios` (nombre, familia, tipo, %, liga opcional a empresa BSOP, orden, activo) + badge de Σ% con warning (`incompleto`/`excedido`). Helpers puros en `lib/gobierno/cap-table.ts` + 10 tests. Escrituras directas por browser client.
  - [x] **2b · Gobierno corporativo** — tab nuevo con 3 secciones: `gobierno_config` (reglamento link a `erp.documentos` + Ver, derecho del tanto, dividendo, cadencia/tamaño consejo, mandato; edit-in-place con upsert) + `gobierno_mayorias` (tabla + drawer CRUD) + `gobierno_consejeros` (tabla + drawer CRUD, liga a socio, ostenta_voto, vitalicio, periodo; resumen del consejo en el header). Helpers puros `lib/gobierno/gobierno.ts` + 5 tests.
- [x] **Sprint 3 — Tab "Actas de asamblea"** ✅:
  - Tab `actas-asamblea`: lista (folio, tipo, fecha, asunto, estado/protocolizada) + drawer de detalle (header + orden del día + acuerdos con **voto por socio** + asistentes con **quórum derivado** + protocolización + link al PDF en `erp.documentos`).
  - Alta/edición de acta (drawer con `key`-remount), CRUD de acuerdos, voto por socio por acuerdo (upsert/delete inline), asistencia por socio (upsert) con quórum derivado live.
  - Helpers puros `lib/gobierno/actas.ts` (`quorumDerivado`, `tallyVotos`, `parseOrdenDia`) + 7 tests. Escrituras por browser client (igual que 2a/2b).
- **Sprint 4 — Seed DILESA + closeout**:
  - [x] **4a · Seed gobierno + headers** ✅ aplicado a prod (migración `20260602023802`): 3 socios (Σ=100%), config (reglamento ago-2021, mandato 36m, consejo 8/12, dividendo $12M, tanto + prelación), 4 mayorías, 5 consejeros (2 vitalicios + comité), 35 headers de actas (fecha desde serial Excel, tipo por heurística RESULTADOS→ordinaria). Guardado por slug + NOT EXISTS (idempotente, no-op en Preview). Todo editable en la UI.
  - [x] **4b · Subir PDFs** ✅ — script `scripts/import_gobierno_pdfs_dilesa.ts` subió a `adjuntos/dilesa/gobierno/…` el Reglamento + **26 actas** (31/32/34 en versión protocolizada, incl. una de 42 MB), creó 27 filas en `erp.documentos` y las ligó. Guard por año: **acta 1 NO ligada** (el PDF del folder dice 2013 pero el acta del índice es 2003 → revisar a mano). 8 actas sin PDF en el folder (4,6,7,8,9,10,16,19). Idempotente (upsert + skip si ya ligada).
  - [x] **4c · Capturar acuerdos/votos** ✅ — leídas las 26 actas con PDF (vía 10 subagentes en paralelo) y sembrados **109 acuerdos + 254 votos (favor, unánimes) + 75 asistentes** vía `scripts/import_gobierno_acuerdos_dilesa.ts` (idempotente, datos embebidos). Mapeo entidad→socio por holding (Nigropetense/Gesan/CHC), NO por apellido del rep. Las 8 actas sin PDF (4,6-10,16,19) + acta 1 (PDF mismatch) quedan header-only.
  - [ ] **Closeout** — verificación de Beto: día exacto del reglamento; **consejo actual** (las actas 32/2021 y 34/2022 definen un consejo de 19 miembros — Gerardo presidente, Urbano secretario, Adalberto tesorero + 16 vocales por familia — que **excede el máx. 8 del Reglamento**; decidir si sembrar ese consejo completo a `gobierno_consejeros`); revisar acta 1 (PDF del folder es de 2013, no del APERTURA 2003). `ARCHITECTURE.md` §2 opcional (tablas en `core`, no schema nuevo). Mover a `done` en INITIATIVES cuando Beto confirme.

## Riesgos

- **Modelo de votación demasiado rígido para casos reales.** Mitigación: `gobierno_acta_votos` permite `socio_id` NULL (voto no atribuible) y `representado_por` libre; el acuerdo guarda `resultado` final independiente de que el desglose esté completo.
- **`Σ porcentaje ≠ 100` durante la reestructura.** Por diseño no se fuerza en DB; warning en UI. Aceptado.
- **Cross-schema a `erp.personas`/`erp.documentos`** sin embedding. Mitigado con snapshots legibles + hidratación por segunda query (patrón probado).
- **Datos sensibles** (gobierno + cap table) visibles a no-admin si alguien aflojara el RBAC. Mitigación: admin-only en app **y** RLS UPDATE/DELETE admin-only en DB; SELECT restringido a miembros de la empresa o admin.

## Métricas de éxito

- DILESA con su gobierno corporativo 100% capturado: cuadro accionario (3 familias), reglamento ligado, mayorías y derecho del tanto, consejo con mandatos.
- ≥ N actas de asamblea históricas de DILESA cargadas con acuerdos + votación por familia, consultables por folio/fecha.
- Cero PDFs binarios fuera de `erp.documentos`.

## Datos extraídos del Reglamento DILESA (ago-2021) — fuente del seed Sprint 4

**Cap table (3 socios al 33.33%)** — pág. 20-21:

| Socio (persona moral)                  | Familia              | ¿Es empresa BSOP?    |
| -------------------------------------- | -------------------- | -------------------- |
| Nigropetense Inmobiliaria S.A.         | Santos de los Santos | sí (`core.empresas`) |
| Inmobiliaria CHC                       | Chavarría Cruz       | no (externa)         |
| Gesan Inmobiliaria del Bravo, SA de CV | Santos Diego         | no (externa)         |

**Órganos:** Asamblea de Accionistas → Consejo de Administración → Comité Directivo.

**Comité Directivo (10.3.2):** Alejandra Chavarría Cruz, Michelle Santos Diego, Adalberto Santos de los Santos.

**Consejo de Administración:**

- Máx **8** miembros (3.1.1); mandato **3 años** (5.2.2).
- Hasta 2 consejeros propietarios por sociedad; cada par representa ≥30% de DILESA; 1 ostenta voto, 1 respaldo/suplente (3.2.1).
- **Gerardo Santos Benavides** y **Urbano Santos Benavides** = fundadores vitalicios (3.2.2).
- Consejero independiente: ≥51% de la propiedad para nombrarlo (5.1.4.2); máx 2 periodos consecutivos (5.2.5); 2 independientes "cuando sea el momento" (3.2.4).

**Mayorías / reglas de decisión:**

- Consejo: consenso; si no, voto por representación accionaria → con 3 consejeros con voto = **2 de 3** (≈66.67%) (2.4.6).
- Cese de consejero: **≥60%** de las acciones (5.2.4).
- Asamblea decide: elección de consejeros, política de dividendos, escisiones y fusiones — considerando la recomendación del consejo (1.1.4).
- Escisión: basta que 2 de 3 sociedades lo deseen; 3 partes por sorteo (1.1.5).
- Incluir tema en agenda del consejo: 2 consejeros (6.1.2.1).

**Derecho del tanto (1.2):** aplica; orden de prelación: (1) otros accionistas de la sociedad del vendedor → (2) accionistas de las otras 2 sociedades → (3) DILESA. No se puede vender a no-accionistas (1.2.2).

**Política de dividendos:** monto anual **$12,000,000 MXN** (2.3.4.3.1); prioridad a dividendos sobre reinversión.
**Cadencia del consejo:** **12** sesiones/año (2.4.4).
**Comisiones del consejo (6.3):** auditoría/control/cumplimiento; nombramientos/retribuciones; estrategia/inversiones.

**Actas (índice `1 RESUMEN ACTAS.xlsx`):** 35 actas (2003–2022) + 2 pendientes (36/37 — ejercicios 2023/2024). Protocolizadas: 1, 31, 32, 34 (las 3 últimas con PDF de alta resolución en carpeta "Actas Protocolizadas"). Se capturan en Sprint 4.

## Bitácora

- **2026-06-02 (Sprint 4c)** — Capturados acuerdos/votos/asistentes de las 26 actas con PDF. Leí cada acta con **10 subagentes en paralelo** (lotes; los escaneados de 13/15/42 MB con lectura por rangos de página) que devolvieron JSON estructurado; consolidé y sembré vía `scripts/import_gobierno_acuerdos_dilesa.ts`: **109 acuerdos, 254 votos (todos favor — ninguna acta registró disidencias), 75 asistentes**. Corregí en consolidación el mapeo de Gesan (los agentes a veces lo ponían en "Santos de los Santos" por el apellido del rep Gerardo Santos **Benavides**; lo correcto por la tabla del Reglamento es Gesan=Santos Diego) mapeando por **entidad holding**. Hallazgo: actas 32 (2021) y 34 (2022) traen el **consejo actual completo de 19 miembros** (excede el máx. 8 del Reglamento) — documentado para que Beto decida si sembrarlo. Verificado en prod (26/109/254/75). Build de la iniciativa **completo**; pendiente solo verificación de Beto + transición a `done`.
- **2026-06-02 (Sprint 4b)** — Subidos a prod (Storage `adjuntos/dilesa/gobierno/…` + `erp.documentos`): Reglamento + 26 actas (31/32/34 protocolizadas), 27 docs, todos ligados (`gobierno_actas.documento_id` / `gobierno_config.reglamento_documento_id`). Script `import_gobierno_pdfs_dilesa.ts` con guard de año que evitó ligar el PDF del folder "Acta 1" (2013) al acta 1 del índice (2003) — flaggeada para revisión manual. 8 actas (4,6-10,16,19) no tienen PDF en el folder. Verificado por conteo (26 con PDF / 9 sin / reglamento 1). Próximo: 4c (acuerdos/votos por acta).
- **2026-06-02 (Sprint 4a)** — Seed de DILESA aplicado a prod (migración `20260602023802_gobierno_seed_dilesa.sql`, data-only guardada por slug + NOT EXISTS): 3 socios al 33.33% (Σ=100.0000%, Nigropetense ligada a `core.empresas`), config del Reglamento (ago-2021, mandato 36m, consejo 8 miembros / 12 sesiones, dividendo $12M MXN, derecho del tanto + prelación), 4 mayorías (consejo 66.67%, cese 60%, independiente 51%, escisión 66.67%), 5 consejeros baseline (Gerardo + Urbano vitalicios con voto + comité directivo Ale/Michelle/Beto), 35 headers de actas (fecha desde serial Excel epoch 1899-12-30, tipo por heurística). Verificado por conteo en prod. Sin DDL → SCHEMA_REF/types intactos. Próximo: 4b (subir PDFs) + 4c (capturar acuerdos/votos por acta). A confirmar Beto: día exacto del reglamento + consejo actual + voto de CHC.
- **2026-06-02 (Sprint 3)** — Tab **Actas de asamblea** construido: `ActasAsambleaPanel` (lista + `ActaFormDrawer` para header/protocolización/PDF + `ActaDetailDrawer` con orden del día, `AcuerdosSection` con voto por socio inline, `AsistentesSection` con quórum derivado). Helpers `lib/gobierno/actas.ts` + 7 tests. Resueltos 2 hits de `react-hooks/set-state-in-effect`: el detail deriva el PDF de `docs` con useMemo (sin fetch) y el form drawer remonta por `key` en vez de sincronizar en effect. Checks verdes (typecheck, 1177 tests, lint, format). Próximo: Sprint 4 (seed DILESA + subir Reglamento/actas a Documentos) — pendiente confirmar datos con Beto antes de escribir a prod.
- **2026-06-02 (Sprint 2b)** — Tab **Gobierno corporativo** construido: `GobiernoCorporativoPanel` con 3 secciones (config con reglamento link+Ver + upsert edit-in-place; mayorías tabla+drawer; consejeros tabla+drawer con liga a socio + resumen del consejo). Helpers `lib/gobierno/gobierno.ts` (`mandatoLabel`, `resumenConsejo`) + 5 tests. Fix de lint `react-hooks/set-state-in-effect` unificando el efecto al patrón IIFE+try/finally. Checks verdes (typecheck, 1170 tests, lint, format). Con esto **Sprint 2 completo** (Cuadro accionario + Gobierno corporativo). Próximo: Sprint 3 (Actas de asamblea).
- **2026-06-02 (Sprint 2a)** — Tab **Cuadro accionario** construido (llena el placeholder): `CuadroAccionarioPanel` con tabla + drawer de alta/edición + delete, badge de Σ% con estado (ok/incompleto/excedido). Helpers puros `lib/gobierno/cap-table.ts` + 10 tests. Escrituras directas por browser client (decisión registrada). Checks verdes (typecheck, 1165 tests, lint, format). Próximo: Sprint 2b (tab Gobierno corporativo).
- **2026-06-02 (Sprint 1)** — Leí el Reglamento de Gobierno completo (21 pp) + el índice de 35 actas (`1 RESUMEN ACTAS.xlsx`). Refiné el modelo con 4 ajustes derivados del documento (familia controladora; política de dividendos + cadencia/tamaño del consejo; consejero vitalicio + órgano). Migración `20260602004906` aplicada a prod vía `supabase db push` — drift de historial con la sesión hermana `cxp-sprint-3` (`001532`, módulo `rdb.cxp`, data-only) resuelto alineando el archivo local sin tocar su trabajo ni commitearlo. 8 tablas verificadas (RLS on, 4 policies c/u). `SCHEMA_REF`/`types` regenerados. Datos del Reglamento documentados arriba para el seed. Próximo: Sprint 2.
- **2026-06-01** — Iniciativa promovida por Beto. Exploración del patrón existente: `core.empresas` + host de tabs `app/settings/empresas/[slug]/page.tsx` (tabs Cuadro accionario y Beneficiario controlador son placeholders sin schema); patrón de oro de PDFs = `core.empresa_documentos` → `erp.documentos`; RBAC admin-only. Confirmado: no existe ninguna tabla de socios/gobierno/asamblea en el schema. Cerradas D1 (cuadro accionario real), D2 (voto por socio) y promoción golden DILESA. Modelo completo (8 tablas) + migración propuesta documentados arriba. Pendiente: OK del modelo para aplicar Sprint 1.
