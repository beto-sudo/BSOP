-- ╭────────────────────────────────────────────────────────────────────╮
-- │  20260610225834_dilesa_fase16_conformidad_encuestas                 │
-- │                                                                     │
-- │  Iniciativa dilesa-ventas-expediente · S5 final — Fase 16.          │
-- │                                                                     │
-- │  Beto (2026-06-10): "Comisión Pagada" nunca se habilitó como fase   │
-- │  (las comisiones son un proceso mensual del vendedor, no un evento  │
-- │  de la operación — irán en una pantalla aparte). La posición 16 se  │
-- │  convierte en "Conformidad del Cliente": encuesta posventa          │
-- │  automatizada (envío D+2 de la entrega, 2 recordatorios diarios,    │
-- │  luego pasa a Atención a Clientes).                                 │
-- │                                                                     │
-- │  1. dilesa.venta_encuestas — 1:1 con la venta; estado del ciclo de  │
-- │     envío + respuestas (NPS, calidad vivienda, atención, comentario)│
-- │  2. Trigger: al cerrar F15 (Entregada) se programa la encuesta      │
-- │     automáticamente para fecha + 2 días.                            │
-- │  3. Renombra el módulo RBAC fase16 y el catálogo de fases.          │
-- │     La fila histórica de venta_fases "Comisión Pagada" (1, Coda     │
-- │     jul-2024) se queda intacta — es historia; el pipeline matchea   │
-- │     por posición.                                                   │
-- ╰────────────────────────────────────────────────────────────────────╯

BEGIN;

-- ── 1. Tabla de encuestas ────────────────────────────────────────────
CREATE TABLE dilesa.venta_encuestas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES core.empresas(id),
  venta_id        uuid NOT NULL UNIQUE REFERENCES dilesa.ventas(id),
  -- Ciclo de envío automático (cron diario dilesa-encuestas):
  --   programada → enviada (intentos 1..3) → atencion_clientes
  --   y termina en respondida (cliente) / manual (AC) / sin_respuesta (AC).
  estado          text NOT NULL DEFAULT 'programada'
                  CHECK (estado IN ('programada','enviada','respondida','atencion_clientes','manual','sin_respuesta')),
  programada_para date NOT NULL,
  intentos        integer NOT NULL DEFAULT 0,
  ultimo_envio_at timestamptz,
  -- Respuestas (encuesta de 4 puntos):
  canal           text CHECK (canal IN ('email','whatsapp','manual')),
  nps             integer CHECK (nps BETWEEN 0 AND 10),
  calif_vivienda  integer CHECK (calif_vivienda BETWEEN 1 AND 5),
  calif_proceso   integer CHECK (calif_proceso BETWEEN 1 AND 5),
  comentario      text,
  respondida_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dilesa_venta_encuestas_pendientes_idx
  ON dilesa.venta_encuestas(estado, programada_para)
  WHERE estado IN ('programada','enviada');

ALTER TABLE dilesa.venta_encuestas ENABLE ROW LEVEL SECURITY;
CREATE POLICY venta_encuestas_select ON dilesa.venta_encuestas
  FOR SELECT TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE POLICY venta_encuestas_write ON dilesa.venta_encuestas
  FOR ALL TO authenticated
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());

CREATE TRIGGER dilesa_venta_encuestas_updated_at
  BEFORE UPDATE ON dilesa.venta_encuestas
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.venta_encuestas IS
  'Encuesta de conformidad posventa (Fase 16). 1:1 con la venta; el cron dilesa-encuestas gestiona el ciclo de envío (D+2 de la entrega, 2 recordatorios, luego Atención a Clientes). NPS 0-10 + calidad vivienda 1-5 + atención 1-5 + comentario.';

GRANT SELECT, INSERT, UPDATE ON dilesa.venta_encuestas TO authenticated;
GRANT ALL ON dilesa.venta_encuestas TO service_role;

-- ── 2. Programación automática al cerrar F15 (Entregada) ────────────
CREATE OR REPLACE FUNCTION dilesa.fn_programar_encuesta_posventa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = dilesa, public
AS $fn$
BEGIN
  IF NEW.posicion = 15 THEN
    INSERT INTO dilesa.venta_encuestas (empresa_id, venta_id, programada_para)
    VALUES (NEW.empresa_id, NEW.venta_id, COALESCE(NEW.fecha, CURRENT_DATE) + 2)
    ON CONFLICT (venta_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_programar_encuesta_posventa
  AFTER INSERT ON dilesa.venta_fases
  FOR EACH ROW EXECUTE FUNCTION dilesa.fn_programar_encuesta_posventa();

-- ── 3. Renombrar fase 16 (módulo RBAC + catálogo) ────────────────────
UPDATE core.modulos
SET slug = 'dilesa.ventas.fase16_conformidad',
    nombre = 'Ventas · 16 Conformidad del Cliente'
WHERE slug = 'dilesa.ventas.fase16_comision_pagada';

UPDATE dilesa.venta_fase_catalogo
SET nombre = 'Conformidad del Cliente',
    rol = 'Atención a Clientes',
    descripcion = 'Encuesta de conformidad posventa: envío automático D+2 de la entrega, respuesta del cliente cierra la fase.',
    updated_at = now()
WHERE posicion = 16 AND deleted_at IS NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
