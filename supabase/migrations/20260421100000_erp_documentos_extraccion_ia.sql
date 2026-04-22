-- Habilita extracción automática de contenido para erp.documentos.
--
-- El flujo objetivo (implementado en PR B, script batch):
--   1) Por cada PDF adjunto del documento, llamar a Claude API (multimodal)
--      para extraer: texto completo, resumen humano, metadatos legales
--      estructurados (tipo de operación, partes, monto, ubicación, folio, etc.).
--   2) Generar embedding de 1536 dims con OpenAI `text-embedding-3-large`
--      (truncado vía Matryoshka) y guardarlo en contenido_embedding.
--   3) La columna contenido_texto_tsv se mantiene sola (GENERATED) y alimenta
--      la búsqueda full-text en español.
--
-- Razones de diseño:
--   * 1536 dims — máximo que soporta el índice HNSW de pgvector 0.8 sin usar
--     halfvec. Calidad suficiente para ~500-5000 escrituras.
--   * Columnas fijas para los 8 campos legales más filtrados (tipo_operacion,
--     monto, municipio, estado, etc.) — queries SQL directos, sin JSONB ops.
--   * `partes` como JSONB porque el rol varía por tipo de documento
--     (vendedor/comprador, poderdante/apoderado, fideicomitente/fiduciaria...).
--   * `subtipo_meta` preexistente se conserva para campos super específicos
--     de un tipo (cláusulas, gravámenes, escalada de renta, etc.).

-- 1) Extensiones --------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- 2) Columnas nuevas ----------------------------------------------------------

ALTER TABLE erp.documentos
  -- Contenido extraído
  ADD COLUMN IF NOT EXISTS contenido_texto     TEXT,
  ADD COLUMN IF NOT EXISTS contenido_embedding extensions.vector(1536),

  -- Auditoría del proceso de extracción
  ADD COLUMN IF NOT EXISTS extraccion_status   TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (extraccion_status IN ('pendiente','procesando','completado','error','omitido')),
  ADD COLUMN IF NOT EXISTS extraccion_fecha    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extraccion_modelo   TEXT,
  ADD COLUMN IF NOT EXISTS extraccion_error    TEXT,

  -- Campos legales estructurados (los que se filtran frecuentemente en UI)
  ADD COLUMN IF NOT EXISTS tipo_operacion      TEXT,
  ADD COLUMN IF NOT EXISTS monto               NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS moneda              TEXT DEFAULT 'MXN',
  ADD COLUMN IF NOT EXISTS superficie_m2       NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS ubicacion_predio    TEXT,
  ADD COLUMN IF NOT EXISTS municipio           TEXT,
  ADD COLUMN IF NOT EXISTS estado              TEXT,
  ADD COLUMN IF NOT EXISTS folio_real          TEXT,
  ADD COLUMN IF NOT EXISTS libro_tomo          TEXT,

  -- Partes involucradas — array de { rol, nombre, rfc?, representante? }
  ADD COLUMN IF NOT EXISTS partes              JSONB;

-- 3) tsvector GENERATED para búsqueda full-text en español -------------------
--
-- Ponderación:
--   A — titulo, numero_documento (matches más relevantes)
--   B — descripcion (resumen humano)
--   C — ubicacion_predio (suele ser una query común)
--   D — contenido_texto (texto completo, peso más bajo)

ALTER TABLE erp.documentos
  ADD COLUMN IF NOT EXISTS contenido_texto_tsv TSVECTOR
    GENERATED ALWAYS AS (
      setweight(to_tsvector('spanish', coalesce(titulo, '')),            'A') ||
      setweight(to_tsvector('spanish', coalesce(numero_documento, '')),  'A') ||
      setweight(to_tsvector('spanish', coalesce(descripcion, '')),       'B') ||
      setweight(to_tsvector('spanish', coalesce(ubicacion_predio, '')),  'C') ||
      setweight(to_tsvector('spanish', coalesce(contenido_texto, '')),   'D')
    ) STORED;

-- 4) Índices ------------------------------------------------------------------

-- Full-text search
CREATE INDEX IF NOT EXISTS erp_documentos_contenido_texto_tsv_idx
  ON erp.documentos USING GIN (contenido_texto_tsv);

-- Búsqueda semántica (cosine). Parámetros HNSW default (m=16, ef_construction=64)
-- son razonables para <10k vectores; si crecemos mucho, re-evaluamos.
CREATE INDEX IF NOT EXISTS erp_documentos_contenido_embedding_idx
  ON erp.documentos USING HNSW (contenido_embedding extensions.vector_cosine_ops);

-- Filtros frecuentes en UI
CREATE INDEX IF NOT EXISTS erp_documentos_tipo_operacion_idx
  ON erp.documentos (tipo_operacion)
  WHERE tipo_operacion IS NOT NULL;

CREATE INDEX IF NOT EXISTS erp_documentos_municipio_estado_idx
  ON erp.documentos (municipio, estado)
  WHERE municipio IS NOT NULL;

CREATE INDEX IF NOT EXISTS erp_documentos_monto_idx
  ON erp.documentos (monto)
  WHERE monto IS NOT NULL;

-- Partes: permite filtrar "documentos donde Fulano participa" con @>
CREATE INDEX IF NOT EXISTS erp_documentos_partes_idx
  ON erp.documentos USING GIN (partes jsonb_path_ops);

-- Encontrar rápido los documentos que faltan procesar (parcial, chico)
CREATE INDEX IF NOT EXISTS erp_documentos_extraccion_pendientes_idx
  ON erp.documentos (extraccion_status, created_at)
  WHERE extraccion_status IN ('pendiente','error');

-- 5) Comentarios --------------------------------------------------------------

COMMENT ON COLUMN erp.documentos.contenido_texto IS
  'Texto completo extraído del PDF principal del documento. Se puebla por el '
  'script de extracción (Claude API multimodal, incluye OCR de escaneados).';
COMMENT ON COLUMN erp.documentos.contenido_embedding IS
  'Embedding 1536 dims (OpenAI text-embedding-3-large truncado con Matryoshka). '
  'Usado para búsqueda semántica con distancia coseno.';
COMMENT ON COLUMN erp.documentos.contenido_texto_tsv IS
  'GENERATED. tsvector en español con weights A (título/número), B (descripción), '
  'C (ubicación), D (contenido). Indexado con GIN para full-text.';

COMMENT ON COLUMN erp.documentos.extraccion_status IS
  'pendiente | procesando | completado | error | omitido. Default pendiente. '
  'omitido = decisión humana de no procesar (doc sensible, irrelevante, etc.).';
COMMENT ON COLUMN erp.documentos.extraccion_fecha IS
  'Cuándo se completó la última extracción exitosa.';
COMMENT ON COLUMN erp.documentos.extraccion_modelo IS
  'Modelo que generó el contenido (ej. claude-opus-4-7). Para re-procesar si cambia.';
COMMENT ON COLUMN erp.documentos.extraccion_error IS
  'Último mensaje de error — para reintento manual o debugging del script batch.';

COMMENT ON COLUMN erp.documentos.tipo_operacion IS
  'Naturaleza legal del documento: compraventa, donacion, hipoteca, poder, '
  'fideicomiso, permuta, arrendamiento, constitutiva, acta, etc. Texto libre '
  'extraído por Claude — normalizar con lookup si crece el vocabulario.';
COMMENT ON COLUMN erp.documentos.monto IS
  'Valor económico de la operación (si aplica). Moneda en columna moneda.';
COMMENT ON COLUMN erp.documentos.superficie_m2 IS
  'Superficie del inmueble en metros cuadrados (si aplica).';
COMMENT ON COLUMN erp.documentos.ubicacion_predio IS
  'Dirección o descripción del objeto del documento (inmueble, predio, etc.).';
COMMENT ON COLUMN erp.documentos.folio_real IS
  'Folio real asignado por el Registro Público de la Propiedad.';
COMMENT ON COLUMN erp.documentos.libro_tomo IS
  'Referencia al protocolo notarial: libro, tomo, foja, folio. Texto libre.';

COMMENT ON COLUMN erp.documentos.partes IS
  'Partes involucradas — array de objetos JSON: '
  '[{"rol":"vendedor","nombre":"...","rfc":"...","representante":"..."}]. '
  'El rol varía por tipo de documento (vendedor/comprador, poderdante/apoderado, '
  'fideicomitente/fiduciaria/fideicomisario, otorgante, beneficiario, etc.).';

-- 6) Reload PostgREST schema cache -------------------------------------------

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
