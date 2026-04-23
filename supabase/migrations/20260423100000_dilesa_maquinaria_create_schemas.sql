-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-0 — Foundation: schemas dilesa + maquinaria
-- ════════════════════════════════════════════════════════════════════════════
--
-- Crea los schemas `dilesa` (dominio inmobiliario de Dilesa) y `maquinaria`
-- (departamento de maquinaria pesada — propio + servicios externos).
--
-- Ver supabase/adr/001_dilesa_schema.md para el layout completo y el orden
-- de sprints. Este sprint es estructura pura: no carga datos.

CREATE SCHEMA IF NOT EXISTS dilesa;
CREATE SCHEMA IF NOT EXISTS maquinaria;

-- USAGE para que los roles de Supabase puedan resolver objetos. El acceso
-- real lo controla RLS en cada tabla.
GRANT USAGE ON SCHEMA dilesa     TO authenticated, service_role, anon;
GRANT USAGE ON SCHEMA maquinaria TO authenticated, service_role, anon;

-- Default privileges: cualquier tabla creada en estos schemas por el owner
-- (postgres) queda accesible a authenticated y service_role. RLS sigue
-- gobernando las filas visibles; anon queda sin acceso a datos por default.
ALTER DEFAULT PRIVILEGES IN SCHEMA dilesa
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA dilesa
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA maquinaria
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA maquinaria
  GRANT ALL ON TABLES TO service_role;

COMMENT ON SCHEMA dilesa IS
  'Dilesa real-estate domain (terrenos, proyectos, lotes, viviendas, comercial, RUV). See supabase/adr/001_dilesa_schema.md';
COMMENT ON SCHEMA maquinaria IS
  'Heavy machinery rental/ops (Dilesa internal use + external clients). See ADR-001.';
