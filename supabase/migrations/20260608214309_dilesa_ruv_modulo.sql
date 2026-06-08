-- ============================================================================
-- DILESA · Módulo RUV (Registro Único de Vivienda) — Sprint 1: schema + RBAC
-- ----------------------------------------------------------------------------
-- Iniciativa `dilesa-ruv`. Ver docs/planning/dilesa-ruv.md (Anexo Sprint 0).
--
-- El deep-dive de Coda reveló que el detalle RUV por vivienda (CUV + hitos
-- DTU/seguro/extracción/paquete + frente como texto) YA vive en
-- `dilesa.construccion`. Lo único que falta modelar es la OFERTA ante INFONAVIT
-- (Frente RUV) y el CATÁLOGO de documentos del paquete. Por eso este schema es
-- mínimo:
--
--   1. dilesa.ruv_frentes             — la oferta (93 rows en Coda)
--   2. dilesa.ruv_documentos_catalogo — catálogo de tipos de documento (27)
--   3. dilesa.ruv_frente_documentos   — estado de cada documento por frente (M:N)
--   4. dilesa.construccion.frente_id   — liga vivienda→oferta (backfill en Sprint 2)
--   5. vista dilesa.v_ruv_frente_avance — avance derivado (no se almacena)
--
-- RBAC (D2): módulo `dilesa.ruv` liberado a Dirección + Gerente de Proyectos +
-- Asistente de Proyectos (rol NUEVO = la operadora del módulo) + admin (bypass).
-- Excluidos: Gerencia Ventas, Vendedor, Contabilidad.
--
-- Idempotente. RLS canónica `core.fn_has_empresa(empresa_id) OR core.fn_is_admin()`.
-- ============================================================================

BEGIN;

-- ── 1. dilesa.ruv_frentes ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dilesa.ruv_frentes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       uuid NOT NULL REFERENCES core.empresas (id),
  proyecto_id      uuid REFERENCES dilesa.proyectos (id) ON DELETE SET NULL,
  nombre           text NOT NULL,
  id_oferta        bigint,
  id_orden         bigint,
  fecha_inicio     date,
  fecha_fin        date,
  viviendas_oferta integer,
  coda_id          text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

-- Idempotencia del import (Sprint 2): el row id de Coda es la clave natural.
CREATE UNIQUE INDEX IF NOT EXISTS ruv_frentes_coda_id_uidx
  ON dilesa.ruv_frentes (empresa_id, coda_id)
  WHERE coda_id IS NOT NULL AND deleted_at IS NULL;
-- Para el backfill de construccion.frente_id por nombre (Sprint 2).
CREATE INDEX IF NOT EXISTS ruv_frentes_empresa_nombre_idx
  ON dilesa.ruv_frentes (empresa_id, nombre) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ruv_frentes_proyecto_idx
  ON dilesa.ruv_frentes (proyecto_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE dilesa.ruv_frentes IS
  'Oferta de viviendas ante INFONAVIT (RUV). Fuente: tabla "Frente RUV" de Coda. Agrupa viviendas (dilesa.construccion.frente_id) para el trámite de registro de paquete.';
COMMENT ON COLUMN dilesa.ruv_frentes.id_oferta IS 'Folio INFONAVIT de la oferta (ej. 50294004).';
COMMENT ON COLUMN dilesa.ruv_frentes.id_orden IS 'Folio de orden de verificación (ej. 50294004001).';
COMMENT ON COLUMN dilesa.ruv_frentes.coda_id IS 'Row id original en Coda (trazabilidad + idempotencia del import).';

-- ── 2. dilesa.ruv_documentos_catalogo ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS dilesa.ruv_documentos_catalogo (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES core.empresas (id),
  nombre      text NOT NULL,
  orden       integer,
  descripcion text,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Cada tipo de documento es único por empresa (idempotencia del import).
CREATE UNIQUE INDEX IF NOT EXISTS ruv_documentos_catalogo_nombre_uidx
  ON dilesa.ruv_documentos_catalogo (empresa_id, nombre);

COMMENT ON TABLE dilesa.ruv_documentos_catalogo IS
  'Catálogo de tipos de documento requeridos para el paquete RUV (27 tipos en Coda: Pago Registro Paquete, Póliza de Seguro, Plano Topográfico, …). Fuente: tabla "Documentos Necesarios" de Coda.';

-- ── 3. dilesa.ruv_frente_documentos (M:N frente × documento) ────────────────
CREATE TABLE IF NOT EXISTS dilesa.ruv_frente_documentos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid NOT NULL REFERENCES core.empresas (id),
  frente_id             uuid NOT NULL REFERENCES dilesa.ruv_frentes (id) ON DELETE CASCADE,
  documento_catalogo_id uuid NOT NULL REFERENCES dilesa.ruv_documentos_catalogo (id) ON DELETE RESTRICT,
  estado                text NOT NULL DEFAULT 'pendiente'
                          CHECK (estado IN ('cargado', 'pendiente')),
  fecha_carga           date,
  archivo_url           text,
  notas                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

-- Un registro por par frente×documento.
CREATE UNIQUE INDEX IF NOT EXISTS ruv_frente_documentos_uidx
  ON dilesa.ruv_frente_documentos (frente_id, documento_catalogo_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ruv_frente_documentos_frente_idx
  ON dilesa.ruv_frente_documentos (frente_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE dilesa.ruv_frente_documentos IS
  'Estado (cargado/pendiente) de cada documento del catálogo por frente RUV. En Coda esta relación está parcial/derivada; se recaptura en BSOP. archivo_url reservado para adjuntos vía Storage (futuro).';

-- ── 4. Liga vivienda → oferta ───────────────────────────────────────────────
-- El CUV y los hitos ya están en dilesa.construccion; solo falta normalizar el
-- frente (hoy texto en construccion.frente_ruv) a una FK. Backfill en Sprint 2.
ALTER TABLE dilesa.construccion
  ADD COLUMN IF NOT EXISTS frente_id uuid
    REFERENCES dilesa.ruv_frentes (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS construccion_frente_id_idx
  ON dilesa.construccion (frente_id) WHERE deleted_at IS NULL;

COMMENT ON COLUMN dilesa.construccion.frente_id IS
  'Oferta RUV (dilesa.ruv_frentes) a la que pertenece la vivienda. Backfill por match contra el texto legacy construccion.frente_ruv (iniciativa dilesa-ruv, Sprint 2).';

-- ── 5. RLS canónica (aislamiento por empresa) ───────────────────────────────
ALTER TABLE dilesa.ruv_frentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dilesa.ruv_documentos_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE dilesa.ruv_frente_documentos ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ruv_frentes', 'ruv_documentos_catalogo', 'ruv_frente_documentos']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON dilesa.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_select ON dilesa.%I FOR SELECT USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())',
      t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON dilesa.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_insert ON dilesa.%I FOR INSERT WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())',
      t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_update ON dilesa.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_update ON dilesa.%I FOR UPDATE USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()) WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())',
      t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON dilesa.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_delete ON dilesa.%I FOR DELETE USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())',
      t, t);
  END LOOP;
END $$;

-- ── 6. Vista de avance por frente (derivada, no se almacena) ────────────────
CREATE OR REPLACE VIEW dilesa.v_ruv_frente_avance WITH (security_invoker = on) AS
SELECT
  f.id           AS frente_id,
  f.empresa_id,
  f.proyecto_id,
  f.nombre,
  f.viviendas_oferta,
  c.viviendas,
  c.cuvs_emitidos,
  c.con_dtu,
  c.con_seguro_calidad,
  c.con_paquete_ruv,
  d.documentos_pendientes,
  CASE
    WHEN f.viviendas_oferta > 0
    THEN round(100.0 * c.con_paquete_ruv / f.viviendas_oferta, 1)
    ELSE NULL
  END AS pct_paquete_ruv
FROM dilesa.ruv_frentes f
LEFT JOIN LATERAL (
  SELECT
    count(*)                                                    AS viviendas,
    count(*) FILTER (WHERE cc.cuv ~ '^\d{16}$')                 AS cuvs_emitidos,
    count(*) FILTER (WHERE cc.fecha_dtu IS NOT NULL)            AS con_dtu,
    count(*) FILTER (WHERE cc.fecha_seguro_calidad IS NOT NULL) AS con_seguro_calidad,
    count(*) FILTER (WHERE cc.fecha_paquete_ruv IS NOT NULL)    AS con_paquete_ruv
  FROM dilesa.construccion cc
  WHERE cc.frente_id = f.id AND cc.deleted_at IS NULL
) c ON true
LEFT JOIN LATERAL (
  SELECT count(*) FILTER (WHERE fd.estado = 'pendiente') AS documentos_pendientes
  FROM dilesa.ruv_frente_documentos fd
  WHERE fd.frente_id = f.id AND fd.deleted_at IS NULL
) d ON true
WHERE f.deleted_at IS NULL;

COMMENT ON VIEW dilesa.v_ruv_frente_avance IS
  'Avance del trámite RUV por frente: viviendas, CUVs emitidos, DTUs, seguro de calidad, paquetes RUV y documentos pendientes. Derivado de dilesa.construccion + dilesa.ruv_frente_documentos; sustituye los campos-fórmula de Coda.';

-- ── 7. Módulo en core.modulos (sección 'operaciones', ADR-014) ──────────────
INSERT INTO core.modulos (slug, nombre, descripcion, empresa_id, seccion)
SELECT 'dilesa.ruv', 'RUV',
       'Registro Único de Vivienda (INFONAVIT): ofertas, documentos del paquete y avance del trámite por vivienda.',
       e.id, 'operaciones'
FROM core.empresas e
WHERE e.slug = 'dilesa'
ON CONFLICT (empresa_id, slug) DO NOTHING;

-- ── 8. Rol nuevo: Asistente de Proyectos (la operadora del módulo RUV) ───────
-- core.roles no tiene UNIQUE(empresa_id, nombre) → idempotencia con NOT EXISTS.
INSERT INTO core.roles (nombre, empresa_id, descripcion)
SELECT 'Asistente de Proyectos', e.id,
       'Operadora del módulo RUV (Registro Único de Vivienda). Captura ofertas, documentos del paquete y da seguimiento al trámite ante INFONAVIT.'
FROM core.empresas e
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM core.roles r
    WHERE r.empresa_id = e.id AND r.nombre = 'Asistente de Proyectos'
  );

-- ── 9. Backfill de permisos (D2): read+write a dilesa.ruv ────────────────────
-- Dirección + Gerente de Proyectos + Asistente de Proyectos. Admin (Beto) entra
-- por bypass de core.fn_is_admin(), no necesita fila.
WITH dilesa AS (SELECT id FROM core.empresas WHERE slug = 'dilesa'),
matriz(rol_nombre, slug) AS (VALUES
  ('Dirección', 'dilesa.ruv'),
  ('Gerente de Proyectos', 'dilesa.ruv'),
  ('Asistente de Proyectos', 'dilesa.ruv')
)
INSERT INTO core.permisos_rol (rol_id, modulo_id, acceso_lectura, acceso_escritura)
SELECT r.id, m.id, true, true
FROM matriz x
JOIN core.roles r ON r.nombre = x.rol_nombre AND r.empresa_id = (SELECT id FROM dilesa)
JOIN core.modulos m ON m.slug = x.slug AND m.empresa_id = (SELECT id FROM dilesa)
ON CONFLICT (rol_id, modulo_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
