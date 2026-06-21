-- ╭─ 20260621211906_sanren_servicios_schema ─╮
-- SANREN → Servicios: schema `sanren` para el control de recibos de servicios
-- de la casa (Luz/Gas/Agua, extensible). 3 tablas + 1 vista derivada.
-- Iniciativa `sanren-servicios` · Sprint 1 (docs/planning/sanren-servicios.md).
--
-- Modelo:
--   propiedades — la casa (y futuras propiedades).
--   servicios   — catálogo de servicios contratados por propiedad (extensible:
--                 luz/gas/agua/internet/predial/… como texto, sin enum).
--   recibos     — un row por recibo (periodo, monto, lecturas, pagado, adjuntos).
--   v_recibos   — deriva consumo/producción del periodo, costo unitario, saldo
--                 neto (solar/net metering) y Δ mes-a-mes con LAG por servicio,
--                 replicando las fórmulas que hoy hace Coda.
--
-- SEGURIDAD: igual que peptides / health.protocolo_* — datos personales.
--   RLS DENY-ALL en las 3 tablas + grants solo a service_role. La app
--   lee/escribe server-side (service_role BYPASSRLS). La vista es
--   security_invoker para que respete la RLS del caller (defensa en profundidad).
--
-- NOTA: las columnas *_adjunto_id quedan nullable sin FK formal; el Sprint 2
-- las puebla al migrar los PDFs/comprobantes de Coda al bucket `adjuntos`
-- (link blando a erp.adjuntos — cross-schema FK no se embebe en supabase-js).
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión).

BEGIN;

CREATE SCHEMA IF NOT EXISTS sanren;

-- 1) Propiedades ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sanren.propiedades (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL UNIQUE,
  tipo       text,                       -- casa / departamento / local / ...
  direccion  text,
  activo     boolean NOT NULL DEFAULT true,
  notas      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE sanren.propiedades IS 'Propiedades de la familia (casa principal y futuras). Iniciativa sanren-servicios.';

DROP TRIGGER IF EXISTS trg_sanren_propiedades_updated_at ON sanren.propiedades;
CREATE TRIGGER trg_sanren_propiedades_updated_at
  BEFORE UPDATE ON sanren.propiedades
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

-- 2) Servicios (catálogo por propiedad) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS sanren.servicios (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  propiedad_id     uuid NOT NULL REFERENCES sanren.propiedades (id) ON DELETE RESTRICT,
  tipo             text NOT NULL,         -- luz / gas / agua / internet / ... (libre, extensible)
  proveedor        text,                  -- CFE / Conagas / SIMAS / ...
  numero_cuenta    text,
  numero_medidor   text,
  unidad_consumo   text,                  -- kWh / m³ / ...
  tiene_produccion boolean NOT NULL DEFAULT false,  -- net metering (solar)
  domiciliado      boolean NOT NULL DEFAULT false,
  activo           boolean NOT NULL DEFAULT true,
  notas            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (propiedad_id, tipo)             -- un servicio de cada tipo por propiedad
);
COMMENT ON TABLE sanren.servicios IS 'Servicios contratados por propiedad (catálogo extensible por texto). Iniciativa sanren-servicios.';
CREATE INDEX IF NOT EXISTS idx_sanren_servicios_propiedad ON sanren.servicios (propiedad_id);

DROP TRIGGER IF EXISTS trg_sanren_servicios_updated_at ON sanren.servicios;
CREATE TRIGGER trg_sanren_servicios_updated_at
  BEFORE UPDATE ON sanren.servicios
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

-- 3) Recibos ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sanren.recibos (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id            uuid NOT NULL REFERENCES sanren.servicios (id) ON DELETE RESTRICT,
  periodo                date NOT NULL,   -- primer día del mes del recibo
  fecha_recibo           date NOT NULL,
  monto                  numeric,         -- MXN; NULL si aún sin monto
  moneda                 text NOT NULL DEFAULT 'MXN',
  folio                  text,
  lectura_consumo        numeric,
  lectura_produccion     numeric,
  pagado                 boolean NOT NULL DEFAULT false,
  fecha_pago             date,
  metodo_pago            text,
  recibo_adjunto_id      uuid,            -- link blando a erp.adjuntos (poblado en S2)
  comprobante_adjunto_id uuid,
  notas                  text,
  coda_row_id            text UNIQUE,     -- idempotencia del import
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
  -- NO se fuerza un recibo por servicio/mes: un proveedor puede facturar dos
  -- veces en un mes (p.ej. SIMAS en dic-2024, folios 305238 y 300111). La
  -- idempotencia del import la da coda_row_id; la captura manual no se bloquea.
);
COMMENT ON TABLE sanren.recibos IS 'Recibos de servicios (≥1 por servicio/mes posible). Derivaciones en sanren.v_recibos. Iniciativa sanren-servicios.';
CREATE INDEX IF NOT EXISTS idx_sanren_recibos_servicio_periodo ON sanren.recibos (servicio_id, periodo);
CREATE INDEX IF NOT EXISTS idx_sanren_recibos_periodo ON sanren.recibos (periodo);

DROP TRIGGER IF EXISTS trg_sanren_recibos_updated_at ON sanren.recibos;
CREATE TRIGGER trg_sanren_recibos_updated_at
  BEFORE UPDATE ON sanren.recibos
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

-- 4) Vista derivada ───────────────────────────────────────────────────────────
-- Reconstruye las fórmulas Coda: consumo/producción del periodo (lectura −
-- lectura anterior por servicio), costo unitario, saldo neto (consumo −
-- producción, negativo = excedente solar) y Δ del monto vs el recibo anterior.
-- El primer recibo de cada serie queda con consumo/producción NULL (no hay
-- lectura anterior) — correcto, no es 0.
CREATE OR REPLACE VIEW sanren.v_recibos
WITH (security_invoker = on) AS
WITH base AS (
  SELECT
    r.id,
    r.servicio_id,
    r.periodo,
    r.fecha_recibo,
    r.monto,
    r.moneda,
    r.folio,
    r.lectura_consumo,
    r.lectura_produccion,
    r.pagado,
    r.fecha_pago,
    r.metodo_pago,
    r.recibo_adjunto_id,
    r.comprobante_adjunto_id,
    r.notas,
    r.coda_row_id,
    s.propiedad_id,
    s.tipo            AS servicio_tipo,
    s.proveedor,
    s.unidad_consumo,
    s.tiene_produccion,
    p.nombre          AS propiedad_nombre,
    LAG(r.lectura_consumo) OVER w    AS lectura_consumo_anterior,
    LAG(r.lectura_produccion) OVER w AS lectura_produccion_anterior,
    LAG(r.monto) OVER w              AS monto_anterior
  FROM sanren.recibos r
  JOIN sanren.servicios s ON s.id = r.servicio_id
  JOIN sanren.propiedades p ON p.id = s.propiedad_id
  WINDOW w AS (PARTITION BY r.servicio_id ORDER BY r.periodo, r.fecha_recibo)
)
SELECT
  b.*,
  (b.lectura_consumo - b.lectura_consumo_anterior)       AS consumo_periodo,
  (b.lectura_produccion - b.lectura_produccion_anterior) AS produccion_periodo,
  CASE
    WHEN (b.lectura_consumo - b.lectura_consumo_anterior) > 0
      THEN b.monto / (b.lectura_consumo - b.lectura_consumo_anterior)
  END                                                    AS costo_unitario,
  (
    (b.lectura_consumo - b.lectura_consumo_anterior)
    - COALESCE(b.lectura_produccion - b.lectura_produccion_anterior, 0)
  )                                                      AS saldo_neto,
  (b.monto - b.monto_anterior)                           AS delta_monto_mom
FROM base b;
COMMENT ON VIEW sanren.v_recibos IS 'Recibos con derivaciones (consumo/producción del periodo, costo unitario, saldo neto solar, Δ MoM). Reemplaza las fórmulas Coda. Iniciativa sanren-servicios.';

-- Seguridad: RLS deny-all + grants solo a service_role ────────────────────────
ALTER TABLE sanren.propiedades ENABLE ROW LEVEL SECURITY;
ALTER TABLE sanren.servicios   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sanren.recibos     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA sanren FROM PUBLIC, anon, authenticated, authenticator;
GRANT USAGE ON SCHEMA sanren TO service_role;

REVOKE ALL ON sanren.propiedades, sanren.servicios, sanren.recibos FROM PUBLIC, anon, authenticator, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sanren.propiedades, sanren.servicios, sanren.recibos TO service_role;

REVOKE ALL ON sanren.v_recibos FROM PUBLIC, anon, authenticator, authenticated;
GRANT SELECT ON sanren.v_recibos TO service_role;

-- Exponer schema a PostgREST (valor vivo verificado en prod 2026-06-21 + append sanren)
ALTER ROLE authenticator
  SET pgrst.db_schemas = 'public, graphql_public, core, erp, rdb, playtomic, dilesa, maquinaria, health, peptides, sanren';

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

COMMIT;
