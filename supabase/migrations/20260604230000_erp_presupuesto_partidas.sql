-- ╭──────────────────────────────────────────────────────────────────╮
-- │  20260604230000_erp_presupuesto_partidas                           │
-- │                                                                    │
-- │  Sprint 1 de `dilesa-compras` (ADR-040). Modelo CANÓNICO único de  │
-- │  partidas de presupuesto, en `erp` para que el binding crítico     │
-- │  línea-de-compra → partida sea intra-schema.                       │
-- │                                                                    │
-- │  FASE ADITIVA (este archivo) — no destructiva:                     │
-- │    1. erp.presupuesto_partidas (superset de obra_presupuesto +     │
-- │       del futuro checklist proyecto_presupuesto_partidas).         │
-- │    2. Copia las 128 partidas de dilesa.obra_presupuesto            │
-- │       (preserva id; concepto_id por match exacto y único).         │
-- │    3. partida_id (FK) en requisiciones_detalle, ordenes_compra_    │
-- │       detalle y facturas → el binding de compras.                  │
-- │    4. Vista erp.v_partida_control — 3 capas comprometido/ejercido/ │
-- │       pagado + disponible, derivadas de las compras ligadas.       │
-- │                                                                    │
-- │  dilesa.obra_presupuesto NO se toca aquí (sigue viva). El          │
-- │  re-apunte de costeo + su retiro van en pasos posteriores, tras    │
-- │  validar en preview. proyecto_presupuesto_partidas (checklist) se  │
-- │  absorbe en Sprint 4.                                              │
-- ╰──────────────────────────────────────────────────────────────────╯

BEGIN;

-- ─── 1. Tabla canónica ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS erp.presupuesto_partidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas (id),
  -- Referencia al proyecto (cross-schema: metadata de solo lectura, bajo volumen).
  -- Nullable para gasto sin proyecto / empresas sin módulo de proyectos.
  proyecto_id uuid REFERENCES dilesa.proyectos (id),

  -- Clasificación
  concepto_id uuid REFERENCES erp.conceptos_compra (id),
  concepto_texto text,
  etapa text,
  tipo_insumo text CHECK (
    tipo_insumo IS NULL OR tipo_insumo IN ('mano_obra', 'material', 'maquinaria', 'derechos', 'tramite', 'servicio')
  ),
  orden integer NOT NULL DEFAULT 0,

  -- Presupuesto (montos planeados)
  presupuesto_previo numeric,
  presupuesto_aprobado numeric,
  monto_estimado numeric,

  -- Ejercido real capturado a mano (de obra_presupuesto). Histórico/fallback;
  -- las 3 capas vivas se derivan de las compras en erp.v_partida_control.
  gasto_real_subtotal numeric,
  gasto_real_iva numeric,
  gasto_real_total numeric,
  gasto_real_iva_tasa numeric,

  -- Ciclo de vida de la partida
  estado text NOT NULL DEFAULT 'planeada' CHECK (
    estado IN ('preliminar', 'autorizada', 'planeada', 'en_ejercicio', 'cerrada', 'cancelada')
  ),
  fuente text,

  -- Referencias
  proveedor_persona_id uuid REFERENCES erp.personas (id),
  proveedor_texto text,
  contrato_id uuid REFERENCES dilesa.contratos_construccion (id),
  tarea_origen_id uuid,
  factura_ref text,
  fecha_compromiso date,

  -- Autorización (flujo del checklist)
  autorizado_at timestamptz,
  autorizado_por uuid,

  notas text,
  source_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

COMMENT ON TABLE erp.presupuesto_partidas IS
  'Modelo canónico de partidas de presupuesto (obra + futuro checklist). Vive en erp para binding intra-schema con líneas de compra. proyecto_id es cross-schema a dilesa.proyectos (metadata). ADR-040.';
COMMENT ON COLUMN erp.presupuesto_partidas.concepto_id IS
  'Clasificación al catálogo erp.conceptos_compra. Nullable: se puebla gradual (el match al migrar obra fue ~37%).';
COMMENT ON COLUMN erp.presupuesto_partidas.gasto_real_total IS
  'Gasto real capturado a mano (de obra_presupuesto). Las 3 capas vivas (comprometido/ejercido/pagado) se derivan de compras en v_partida_control.';

CREATE INDEX IF NOT EXISTS presupuesto_partidas_proyecto_idx ON erp.presupuesto_partidas (proyecto_id);
CREATE INDEX IF NOT EXISTS presupuesto_partidas_concepto_idx ON erp.presupuesto_partidas (concepto_id);
CREATE INDEX IF NOT EXISTS presupuesto_partidas_empresa_idx ON erp.presupuesto_partidas (empresa_id);

-- ─── 2. RLS (replica obra_presupuesto: miembros leen y escriben) ──────

ALTER TABLE erp.presupuesto_partidas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='erp' AND tablename='presupuesto_partidas' AND policyname='presupuesto_partidas_select') THEN
    CREATE POLICY presupuesto_partidas_select ON erp.presupuesto_partidas FOR SELECT TO authenticated
      USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='erp' AND tablename='presupuesto_partidas' AND policyname='presupuesto_partidas_modify') THEN
    CREATE POLICY presupuesto_partidas_modify ON erp.presupuesto_partidas FOR ALL TO authenticated
      USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
      WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON erp.presupuesto_partidas TO authenticated;

-- ─── 3. Copia de datos desde obra_presupuesto (preserva id) ──────────
-- concepto_id solo si el nombre matchea EXACTO y es ÚNICO en el catálogo
-- (los nombres duplicados como "Movimiento de terracerías…" quedan null
-- para clasificar a mano; evita duplicar filas en el JOIN).

INSERT INTO erp.presupuesto_partidas (
  id, empresa_id, proyecto_id, concepto_id, concepto_texto, etapa, orden,
  presupuesto_previo, presupuesto_aprobado,
  gasto_real_subtotal, gasto_real_iva, gasto_real_total, gasto_real_iva_tasa,
  proveedor_persona_id, proveedor_texto, contrato_id, factura_ref, fecha_compromiso,
  estado, fuente, notas, source_ref, created_at, updated_at, deleted_at
)
SELECT
  op.id, op.empresa_id, op.proyecto_id,
  cat.id, op.concepto, op.etapa, op.orden,
  op.presupuesto_previo, op.presupuesto_actualizado,
  op.gasto_real_subtotal, op.gasto_real_iva, op.gasto_real_total, op.gasto_real_iva_tasa,
  op.proveedor_persona_id, op.proveedor_texto, op.contrato_id, op.factura_ref, op.fecha_compromiso,
  'en_ejercicio', 'obra_resumen', op.notas, op.source_ref, op.created_at, op.updated_at, op.deleted_at
FROM dilesa.obra_presupuesto op
LEFT JOIN (
  SELECT empresa_id, lower(trim(nombre)) AS n, (array_agg(id))[1] AS id
  FROM erp.conceptos_compra
  WHERE nivel = 'concepto'
  GROUP BY empresa_id, lower(trim(nombre))
  HAVING count(*) = 1
) cat ON cat.empresa_id = op.empresa_id AND cat.n = lower(trim(op.concepto))
ON CONFLICT (id) DO NOTHING;

-- ─── 4. Binding de compras: partida_id en líneas + facturas ──────────

ALTER TABLE erp.requisiciones_detalle
  ADD COLUMN IF NOT EXISTS partida_id uuid REFERENCES erp.presupuesto_partidas (id);
ALTER TABLE erp.ordenes_compra_detalle
  ADD COLUMN IF NOT EXISTS partida_id uuid REFERENCES erp.presupuesto_partidas (id);
ALTER TABLE erp.facturas
  ADD COLUMN IF NOT EXISTS partida_id uuid REFERENCES erp.presupuesto_partidas (id);

COMMENT ON COLUMN erp.ordenes_compra_detalle.partida_id IS
  'Liga la línea de OC a su partida de presupuesto (erp.presupuesto_partidas). Nullable = gasto sin presupuesto. ADR-040.';
COMMENT ON COLUMN erp.facturas.partida_id IS
  'Liga la factura a su partida de presupuesto (cabecera; v1 = 1 factura → 1 partida). Alimenta la capa "pagado". ADR-040.';

CREATE INDEX IF NOT EXISTS ocd_partida_idx ON erp.ordenes_compra_detalle (partida_id);
CREATE INDEX IF NOT EXISTS reqd_partida_idx ON erp.requisiciones_detalle (partida_id);
CREATE INDEX IF NOT EXISTS facturas_partida_idx ON erp.facturas (partida_id);

-- ─── 5. Vista de control — 3 capas + disponible ──────────────────────
-- comprometido = OC activas ligadas · ejercido = recibido · pagado =
-- aplicaciones de pago de facturas ligadas. gasto_real_manual aparte
-- (captura histórica de obra). security_invoker respeta RLS del consumidor.

CREATE OR REPLACE VIEW erp.v_partida_control
WITH (security_invoker = on) AS
SELECT
  pp.id AS partida_id,
  pp.empresa_id,
  pp.proyecto_id,
  pp.concepto_id,
  pp.concepto_texto,
  pp.etapa,
  pp.estado,
  pp.presupuesto_aprobado,
  COALESCE(comp.comprometido, 0) AS comprometido,
  COALESCE(ej.ejercido, 0) AS ejercido,
  COALESCE(pg.pagado, 0) AS pagado,
  pp.gasto_real_total AS gasto_real_manual,
  COALESCE(pp.presupuesto_aprobado, 0) - COALESCE(comp.comprometido, 0) AS disponible
FROM erp.presupuesto_partidas pp
LEFT JOIN LATERAL (
  SELECT SUM(ocd.cantidad * COALESCE(ocd.precio_real, ocd.precio_unitario, 0)) AS comprometido
  FROM erp.ordenes_compra_detalle ocd
  JOIN erp.ordenes_compra oc ON oc.id = ocd.orden_compra_id
  WHERE ocd.partida_id = pp.id
    AND oc.estado IN ('enviada', 'parcial', 'cerrada')
) comp ON true
LEFT JOIN LATERAL (
  SELECT SUM(ocd.cantidad_recibida * COALESCE(ocd.precio_real, ocd.precio_unitario, 0)) AS ejercido
  FROM erp.ordenes_compra_detalle ocd
  WHERE ocd.partida_id = pp.id
) ej ON true
LEFT JOIN LATERAL (
  SELECT SUM(app.monto_aplicado) AS pagado
  FROM erp.cxp_pago_aplicaciones app
  JOIN erp.facturas f ON f.id = app.factura_id
  WHERE f.partida_id = pp.id
) pg ON true
WHERE pp.deleted_at IS NULL;

COMMENT ON VIEW erp.v_partida_control IS
  'Control presupuestal 3 capas por partida: comprometido (OC activas) / ejercido (recibido) / pagado (aplicaciones de pago) + disponible. gasto_real_manual es la captura histórica de obra. ADR-040.';

NOTIFY pgrst, 'reload schema';

COMMIT;
