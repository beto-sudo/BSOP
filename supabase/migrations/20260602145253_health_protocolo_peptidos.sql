-- MIGRATION: Bitácora de protocolo (péptidos + suplementos) — schema `health`
-- Iniciativa `salud-protocolo` · Sprint 1 (docs/planning/salud-protocolo.md).
--
-- Modelo de 3 tablas:
--   protocolo_compuestos → catálogo de lo que Beto se administra (qué).
--   protocolo_tomas      → cada administración real (la bitácora; ground-truth
--                          de la titración: `dosis` = dosis real aplicada).
--   protocolo_efectos    → cómo cae (escalas 0–5 + nota, correlacionables).
-- Los biomarcadores (peso/RHR/HRV/BP) NO se duplican: viven en
-- `health.health_metrics` y se cruzan por fecha en el overlay (Sprint 4).
--
-- SEGURIDAD (datos clínicos personales de Beto):
--   A diferencia de health_metrics/health_workouts/etc. (que otorgan SELECT a
--   `authenticated`), estas tablas habilitan RLS en modo DENY-ALL y NO declaran
--   políticas para authenticated/anon. El único acceso es server-side vía
--   `service_role` (getSupabaseAdminClient, igual que lib/health.ts), que
--   bypassa RLS. Intencionalmente más estricto por la sensibilidad médica:
--   ningún usuario logueado de otra empresa puede leerlas por la API REST.
--
-- PK uuid (patrón canónico actual del repo: core/erp/dilesa/cxp/gobierno).
-- DDL puro: el seed del Retatrutide va por separado (datos personales que no
-- deben correr en preview branches).

-- ── 1) Catálogo de compuestos ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS health.protocolo_compuestos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         text NOT NULL,
  clase          text NOT NULL CHECK (clase IN ('peptido', 'suplemento', 'oral', 'otro')),
  via            text CHECK (via IN ('subcutanea', 'intramuscular', 'oral', 'topica', 'nasal')),
  unidad_dosis   text,
  dosis_objetivo numeric,
  frecuencia     text,
  procedencia    text,
  estado         text NOT NULL DEFAULT 'activo'
                   CHECK (estado IN ('activo', 'pausado', 'suspendido', 'completado')),
  fecha_inicio   date,
  fecha_fin      date,
  color          text,
  notas          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE health.protocolo_compuestos IS
  'Catálogo de compuestos que Beto se administra (péptidos, suplementos, orales). Iniciativa salud-protocolo.';

DROP TRIGGER IF EXISTS trg_protocolo_compuestos_updated_at ON health.protocolo_compuestos;
CREATE TRIGGER trg_protocolo_compuestos_updated_at
  BEFORE UPDATE ON health.protocolo_compuestos
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

-- ── 2) Bitácora de tomas (cada administración real) ─────────────────
CREATE TABLE IF NOT EXISTS health.protocolo_tomas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compuesto_id uuid NOT NULL REFERENCES health.protocolo_compuestos (id) ON DELETE CASCADE,
  fecha        timestamptz NOT NULL,
  dosis        numeric NOT NULL,
  unidad       text,
  sitio        text,
  nota         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE health.protocolo_tomas IS
  'Cada administración real de un compuesto (la bitácora). dosis = dosis real aplicada (ground-truth de titración); sitio = rotación de inyección (null para orales).';

CREATE INDEX IF NOT EXISTS idx_protocolo_tomas_compuesto_fecha
  ON health.protocolo_tomas (compuesto_id, fecha DESC);

-- ── 3) Efectos (escalas 0–5 + nota, correlacionables) ───────────────
CREATE TABLE IF NOT EXISTS health.protocolo_efectos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha      timestamptz NOT NULL,
  toma_id    uuid REFERENCES health.protocolo_tomas (id) ON DELETE SET NULL,
  apetito    smallint CHECK (apetito BETWEEN 0 AND 5),
  nausea     smallint CHECK (nausea BETWEEN 0 AND 5),
  energia    smallint CHECK (energia BETWEEN 0 AND 5),
  gi         smallint CHECK (gi BETWEEN 0 AND 5),
  nota       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE health.protocolo_efectos IS
  'Cómo cae un compuesto: escalas 0–5 (apetito/energía: 0 bajo → 5 alto; náusea/GI: 0 nada → 5 severo) + nota. toma_id opcional liga el efecto a una administración.';

CREATE INDEX IF NOT EXISTS idx_protocolo_efectos_fecha ON health.protocolo_efectos (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_protocolo_efectos_toma ON health.protocolo_efectos (toma_id);

-- ── 4) Seguridad: RLS deny-all + grants solo a service_role ─────────
ALTER TABLE health.protocolo_compuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.protocolo_tomas ENABLE ROW LEVEL SECURITY;
ALTER TABLE health.protocolo_efectos ENABLE ROW LEVEL SECURITY;

-- Sin políticas para authenticated/anon → deny-all por la API REST.
-- El acceso real es server-side con service_role (BYPASSRLS).
REVOKE ALL ON health.protocolo_compuestos FROM PUBLIC, anon, authenticator, authenticated;
REVOKE ALL ON health.protocolo_tomas FROM PUBLIC, anon, authenticator, authenticated;
REVOKE ALL ON health.protocolo_efectos FROM PUBLIC, anon, authenticator, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON health.protocolo_compuestos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON health.protocolo_tomas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON health.protocolo_efectos TO service_role;

NOTIFY pgrst, 'reload schema';
