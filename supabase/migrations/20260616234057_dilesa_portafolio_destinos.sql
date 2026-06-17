-- ╭─ 20260616234057_dilesa_portafolio_destinos ─╮
-- Iniciativa dilesa-portafolio-destinos · Sprint 1.
--
-- El portafolio pasa a ser el marcador canónico de "fuera del programa de venta
-- de vivienda normal". Una unidad liberada al portafolio toma un DESTINO de un
-- catálogo extensible (Demo/Show House, Arrendamiento, Oficina, Bodega, Venta,
-- …) en vez del CHECK fijo de `activos.modalidad` (5 valores). El catálogo es
-- administrable sin migración; sus flags `cuenta_renta`/`cuenta_venta`
-- alimentarán el futuro módulo de arrendamiento.
--
-- Esta migración: (1) crea el catálogo `dilesa.portafolio_destinos` con RLS
-- empresa-scoped (mismo patrón que `dilesa.activos`), (2) lo siembra para DILESA
-- (8 destinos, robusto a Preview sin datos: JOIN a core.empresas + NOT EXISTS),
-- (3) agrega `dilesa.activos.destino_id` FK y (4) backfillea desde `modalidad`.
-- `modalidad` se conserva (derivada) hasta un sprint de limpieza.
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión).

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1) Catálogo de destinos del portafolio
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS dilesa.portafolio_destinos (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id   uuid        NOT NULL REFERENCES core.empresas (id),
  slug         text        NOT NULL,
  label        text        NOT NULL,
  -- Flags de clasificación comercial (los lee el futuro módulo de arrendamiento
  -- y los reportes por destino). Un destino puede ser ambos (renta o venta).
  cuenta_renta boolean     NOT NULL DEFAULT false,
  cuenta_venta boolean     NOT NULL DEFAULT false,
  orden        integer     NOT NULL DEFAULT 100,
  activo       boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  CONSTRAINT portafolio_destinos_empresa_slug_uniq UNIQUE (empresa_id, slug)
);

COMMENT ON TABLE dilesa.portafolio_destinos IS
  'Catálogo extensible de destinos de un activo del portafolio (Demo/Show House, Arrendamiento, Oficina, Bodega, Venta, …). Reemplaza el CHECK fijo de dilesa.activos.modalidad. Administrable sin migración.';
COMMENT ON COLUMN dilesa.portafolio_destinos.cuenta_renta IS
  'true = el destino implica arrendamiento (lo consumirá el módulo de arrendamiento).';
COMMENT ON COLUMN dilesa.portafolio_destinos.cuenta_venta IS
  'true = el destino implica venta (fuera del programa de vivienda normal).';

CREATE INDEX IF NOT EXISTS idx_portafolio_destinos_empresa
  ON dilesa.portafolio_destinos (empresa_id) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.portafolio_destinos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portafolio_destinos_select ON dilesa.portafolio_destinos;
CREATE POLICY portafolio_destinos_select ON dilesa.portafolio_destinos
  FOR SELECT USING (
    deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  );

DROP POLICY IF EXISTS portafolio_destinos_write ON dilesa.portafolio_destinos;
CREATE POLICY portafolio_destinos_write ON dilesa.portafolio_destinos
  FOR ALL USING (
    core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
  ) WITH CHECK (
    core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON dilesa.portafolio_destinos TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) Seed de destinos para DILESA (idempotente + robusto a Preview)
--    JOIN a core.empresas → si la empresa no existe (Preview sin datos), inserta
--    0 filas sin tumbar. NOT EXISTS → re-correr no duplica.
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO dilesa.portafolio_destinos
  (empresa_id, slug, label, cuenta_renta, cuenta_venta, orden)
SELECT e.id, d.slug, d.label, d.cuenta_renta, d.cuenta_venta, d.orden
FROM core.empresas e
CROSS JOIN (VALUES
  ('demo',          'Demo / Show House',          false, false, 10),
  ('arrendamiento', 'Arrendamiento',              true,  false, 20),
  ('oficina',       'Oficina propia',             false, false, 30),
  ('bodega',        'Bodega propia',              false, false, 40),
  ('venta',         'Venta (fuera de programa)',  false, true,  50),
  ('renta_venta',   'Renta o venta',              true,  true,  60),
  ('uso_propio',    'Uso propio (otro)',          false, false, 70),
  ('sin_definir',   'Sin definir',                false, false, 99)
) AS d(slug, label, cuenta_renta, cuenta_venta, orden)
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM dilesa.portafolio_destinos pd
    WHERE pd.empresa_id = e.id AND pd.slug = d.slug
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 3) Columna destino_id en activos + backfill desde modalidad legacy
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE dilesa.activos
  ADD COLUMN IF NOT EXISTS destino_id uuid REFERENCES dilesa.portafolio_destinos (id);

COMMENT ON COLUMN dilesa.activos.destino_id IS
  'Destino del activo en el portafolio (FK a portafolio_destinos). Fuente de verdad nueva; `modalidad` queda como legacy derivado hasta el sprint de limpieza.';

CREATE INDEX IF NOT EXISTS idx_activos_destino ON dilesa.activos (destino_id);

-- Mapeo 1:1 modalidad → slug del catálogo (renta→arrendamiento; el resto, mismo
-- slug). Solo activos sin destino aún, dentro de su misma empresa.
UPDATE dilesa.activos a
SET destino_id = pd.id, updated_at = now()
FROM dilesa.portafolio_destinos pd
WHERE a.destino_id IS NULL
  AND a.modalidad IS NOT NULL
  AND pd.empresa_id = a.empresa_id
  AND pd.slug = CASE a.modalidad
                  WHEN 'renta' THEN 'arrendamiento'
                  ELSE a.modalidad
                END;

NOTIFY pgrst, 'reload schema';

COMMIT;
