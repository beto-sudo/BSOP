-- ============================================================================
-- Iniciativa: dilesa-construccion · Sprint 1 — Schema base
-- ============================================================================
-- Crea las 8 tablas centrales del módulo Construcción DILESA + extensiones a
-- erp.personas y dilesa.productos. ADR-032.
--
-- Patrón estándar BSOP:
--   - PK uuid + DEFAULT gen_random_uuid()
--   - empresa_id NOT NULL → core.empresas
--   - created_at/updated_at via core.fn_set_updated_at()
--   - deleted_at para soft-delete
--   - RLS habilitado con core.fn_has_empresa() + core.fn_is_admin()
--
-- IMPORTANTE: esta migración NO importa data — solo crea estructura. El import
-- desde Coda se hace en Sprint 2 (scripts/import_dilesa_construccion_*.ts).
-- ============================================================================

-- ── 1. Extender erp.personas.tipo con 'contratista' ──────────────────────────
-- Los contratistas viven en erp.personas (decisión ADR-032 D2) con tipo
-- 'contratista'. Los datos específicos DILESA (REPSE, retención, KPIs) en
-- el satélite dilesa.contratistas_datos.

DO $$
BEGIN
  ALTER TABLE erp.personas DROP CONSTRAINT personas_tipo_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE erp.personas
  ADD CONSTRAINT personas_tipo_check
  CHECK (tipo IN ('empleado', 'proveedor', 'cliente', 'accionista', 'contratista', 'general'));

COMMENT ON COLUMN erp.personas.tipo IS
  'Clasificación primaria: empleado, proveedor, cliente, accionista, contratista, general. '
  'Una persona puede vincularse a múltiples roles vía tablas de vínculo.';

-- ── 2. Extender dilesa.productos con planos JSONB ────────────────────────────
-- Los 14 planos del prototipo (Plano Arquitectónico Planta Baja, Plano
-- Ejecutivo Acabados, etc.) viven como JSONB en lugar de 14 columnas.
-- Decisión ADR-032 D7.

ALTER TABLE dilesa.productos
  ADD COLUMN IF NOT EXISTS planos JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN dilesa.productos.planos IS
  'Planos del prototipo: { arq_planta_baja: url, arq_planta_alta: url, '
  'ej_desplantes: url, ej_acabados: url, ej_carpinteria: url, ej_canceleria: url, '
  'ej_herreria: url, ej_detalles: url, ej_plafones: url, arq_cortes: url, '
  'arq_elevaciones: url, arq_detalles_constructivos: url, ing_estructural: url, '
  'ing_electrica: url, ing_hidraulica: url, ing_sanitaria: url, ing_gas: url }. '
  'Permite agregar planos nuevos sin migración.';

-- ── 3. Catálogos: etapas y tareas de construcción ───────────────────────────

CREATE TABLE dilesa.etapas_construccion (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  nombre       text NOT NULL,
  orden        integer NOT NULL,
  dias_estimados integer DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  CONSTRAINT etapas_construccion_empresa_nombre_uk UNIQUE (empresa_id, nombre)
);

COMMENT ON TABLE dilesa.etapas_construccion IS
  'Catálogo de etapas del proceso de construcción (PRELIMINARES, CIMENTACION, '
  'ALBAÑILERIA, etc.). El orden define la secuencia visual; el avance no se '
  'calcula por etapa sino por tareas terminadas (ADR-032 D3).';

ALTER TABLE dilesa.etapas_construccion ENABLE ROW LEVEL SECURITY;
CREATE POLICY etapas_construccion_select ON dilesa.etapas_construccion FOR SELECT
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));
CREATE POLICY etapas_construccion_modify ON dilesa.etapas_construccion FOR ALL
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER tg_etapas_construccion_updated_at BEFORE UPDATE ON dilesa.etapas_construccion
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

CREATE TABLE dilesa.tareas_construccion (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  nombre       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  CONSTRAINT tareas_construccion_empresa_nombre_uk UNIQUE (empresa_id, nombre)
);

COMMENT ON TABLE dilesa.tareas_construccion IS
  'Diccionario de tareas posibles (~500 entradas migradas desde Coda). Cada '
  'plantilla de prototipo selecciona un subset y asigna porcentaje de costo, '
  'tiempo estimado y etapa.';

ALTER TABLE dilesa.tareas_construccion ENABLE ROW LEVEL SECURITY;
CREATE POLICY tareas_construccion_select ON dilesa.tareas_construccion FOR SELECT
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));
CREATE POLICY tareas_construccion_modify ON dilesa.tareas_construccion FOR ALL
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER tg_tareas_construccion_updated_at BEFORE UPDATE ON dilesa.tareas_construccion
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

-- ── 4. Plantilla de tareas por prototipo (N:M producto × tarea × etapa) ─────

CREATE TABLE dilesa.plantilla_tareas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  producto_id         uuid NOT NULL REFERENCES dilesa.productos(id) ON DELETE CASCADE,
  tarea_id            uuid NOT NULL REFERENCES dilesa.tareas_construccion(id) ON DELETE RESTRICT,
  etapa_id            uuid NOT NULL REFERENCES dilesa.etapas_construccion(id) ON DELETE RESTRICT,
  porcentaje_costo    numeric(7,4) NOT NULL DEFAULT 0,  -- 0.2100% = 0.0021
  costo_mo_plantilla  numeric(14,2) NOT NULL DEFAULT 0,
  tiempo_dias         numeric(6,3) NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  CONSTRAINT plantilla_tareas_uk UNIQUE (producto_id, tarea_id, etapa_id)
);

COMMENT ON TABLE dilesa.plantilla_tareas IS
  'Receta de cada prototipo: qué tareas, en qué etapa, con qué % de costo y '
  'tiempo estimado. Suma de porcentaje_costo por producto debe ser ~100%. '
  'Fuente para el cálculo de avance (ADR-032 D3).';

ALTER TABLE dilesa.plantilla_tareas ENABLE ROW LEVEL SECURITY;
CREATE POLICY plantilla_tareas_select ON dilesa.plantilla_tareas FOR SELECT
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));
CREATE POLICY plantilla_tareas_modify ON dilesa.plantilla_tareas FOR ALL
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER tg_plantilla_tareas_updated_at BEFORE UPDATE ON dilesa.plantilla_tareas
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

CREATE INDEX plantilla_tareas_producto_idx ON dilesa.plantilla_tareas (producto_id) WHERE deleted_at IS NULL;
CREATE INDEX plantilla_tareas_etapa_idx ON dilesa.plantilla_tareas (etapa_id) WHERE deleted_at IS NULL;

-- ── 5. Satélite contratistas — datos específicos DILESA ──────────────────────
-- FK 1:1 con erp.personas (donde tipo='contratista').

CREATE TABLE dilesa.contratistas_datos (
  persona_id            uuid PRIMARY KEY REFERENCES erp.personas(id) ON DELETE CASCADE,
  empresa_id            uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  abreviacion           text,                    -- ej. 'MAYA', 'ROCA'
  persona_fisica_o_moral text CHECK (persona_fisica_o_moral IN ('Persona Física','Persona Moral')),
  representante_legal   text,
  repse                 text,                    -- registro REPSE STPS
  registro_patronal     text,                    -- IMSS
  retencion_pct         numeric(5,2) DEFAULT 0,  -- ej. 5.00 = 5% retención
  domicilio             text,                    -- blob por ahora
  activo                boolean NOT NULL DEFAULT true,
  notas                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

COMMENT ON TABLE dilesa.contratistas_datos IS
  'Satélite 1:1 con erp.personas (donde tipo=contratista). Datos específicos '
  'DILESA: REPSE, retención, abreviación interna, etc. KPIs (efectividad, '
  'días sin avance, etc.) son derivados vía vistas, no se almacenan aquí.';

ALTER TABLE dilesa.contratistas_datos ENABLE ROW LEVEL SECURITY;
CREATE POLICY contratistas_datos_select ON dilesa.contratistas_datos FOR SELECT
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));
CREATE POLICY contratistas_datos_modify ON dilesa.contratistas_datos FOR ALL
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER tg_contratistas_datos_updated_at BEFORE UPDATE ON dilesa.contratistas_datos
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

-- ── 6. Contratos de construcción + N:M con lotes ────────────────────────────

CREATE TABLE dilesa.contratos_construccion (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  codigo              text NOT NULL,  -- ej. '2026/2-DIE-ANA-CONTRATO#273'
  fecha_contrato      date NOT NULL,
  contratista_id      uuid NOT NULL REFERENCES erp.personas(id) ON DELETE RESTRICT,
  proyecto_id         uuid REFERENCES dilesa.proyectos(id) ON DELETE RESTRICT,
  valor_total         numeric(14,2) NOT NULL DEFAULT 0,
  fianzas_url         text,
  notas               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  CONSTRAINT contratos_construccion_codigo_uk UNIQUE (empresa_id, codigo)
);

COMMENT ON TABLE dilesa.contratos_construccion IS
  'Cabecera de contrato con un contratista. 1 contrato puede cubrir N lotes '
  '(ver tabla N:M contrato_lotes). En Coda esto es la columna CSV "ID '
  'Construcción"; en BSOP es JOIN limpio.';

ALTER TABLE dilesa.contratos_construccion ENABLE ROW LEVEL SECURITY;
CREATE POLICY contratos_construccion_select ON dilesa.contratos_construccion FOR SELECT
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));
CREATE POLICY contratos_construccion_modify ON dilesa.contratos_construccion FOR ALL
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER tg_contratos_construccion_updated_at BEFORE UPDATE ON dilesa.contratos_construccion
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

CREATE INDEX contratos_construccion_contratista_idx ON dilesa.contratos_construccion (contratista_id) WHERE deleted_at IS NULL;

-- ── 7. Tabla pivot central: construccion (1 fila por arranque) ──────────────

CREATE TABLE dilesa.construccion (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                  uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  codigo                      text NOT NULL,  -- 'M13-L1-LDS-RMA-MAYA'
  unidad_id                   uuid NOT NULL REFERENCES dilesa.unidades(id) ON DELETE RESTRICT,
  producto_id                 uuid NOT NULL REFERENCES dilesa.productos(id) ON DELETE RESTRICT,
  contratista_id              uuid NOT NULL REFERENCES erp.personas(id) ON DELETE RESTRICT,
  supervisor_persona_id       uuid REFERENCES erp.personas(id) ON DELETE SET NULL,

  -- Fechas críticas
  fecha_arranque              date,
  fecha_compromiso_terminar   date,
  fecha_terminada             date,
  fecha_seguro_calidad        date,
  fecha_extraccion            date,
  fecha_paquete_ruv           date,
  fecha_dtu                   date,

  -- Identificadores RUV/INFONAVIT
  cuv                         text,  -- Clave Única de Vivienda
  frente_ruv                  text,

  -- Métricas pre-calculadas (cacheadas por el trigger)
  avance_pct                  numeric(6,2) NOT NULL DEFAULT 0,
  mo_ejecutado                numeric(14,2) NOT NULL DEFAULT 0,
  m2_construccion             numeric(8,2),
  precio_mo_x_m2              numeric(10,2),
  valor_contrato_mo           numeric(14,2),

  estado                      text NOT NULL DEFAULT 'arrancada'
                              CHECK (estado IN ('arrancada','en_progreso','terminada','dtu','seguro_calidad','extraida','cancelada')),
  notas                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  deleted_at                  timestamptz,

  CONSTRAINT construccion_codigo_uk UNIQUE (empresa_id, codigo),
  -- Una unidad solo puede tener 1 construcción activa a la vez (no contemplado:
  -- cancelar + re-arrancar; ese flujo se manejará vía estado='cancelada' +
  -- deleted_at).
  CONSTRAINT construccion_unidad_uk UNIQUE (unidad_id) DEFERRABLE INITIALLY DEFERRED
);

COMMENT ON TABLE dilesa.construccion IS
  'Pivot central del módulo. 1 fila por arranque de construcción = (unidad × '
  'prototipo × contratista). Reemplaza "Construcción por Lote" de Coda (47 '
  'cols, muchas calculadas). Aquí solo campos físicos; los derivados (días '
  'sin avance, efectividad, etc.) son vistas SQL. El avance_pct es '
  'pre-calculado por trigger desde tareas_terminadas.';

ALTER TABLE dilesa.construccion ENABLE ROW LEVEL SECURITY;
CREATE POLICY construccion_select ON dilesa.construccion FOR SELECT
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));
CREATE POLICY construccion_modify ON dilesa.construccion FOR ALL
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER tg_construccion_updated_at BEFORE UPDATE ON dilesa.construccion
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

CREATE INDEX construccion_unidad_idx ON dilesa.construccion (unidad_id) WHERE deleted_at IS NULL;
CREATE INDEX construccion_contratista_idx ON dilesa.construccion (contratista_id) WHERE deleted_at IS NULL;
CREATE INDEX construccion_producto_idx ON dilesa.construccion (producto_id) WHERE deleted_at IS NULL;
CREATE INDEX construccion_estado_idx ON dilesa.construccion (estado) WHERE deleted_at IS NULL;

-- ── 8. N:M contrato × lotes (construcciones) ────────────────────────────────

CREATE TABLE dilesa.contrato_lotes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  contrato_id         uuid NOT NULL REFERENCES dilesa.contratos_construccion(id) ON DELETE CASCADE,
  construccion_id     uuid NOT NULL REFERENCES dilesa.construccion(id) ON DELETE CASCADE,
  monto_lote          numeric(14,2),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  CONSTRAINT contrato_lotes_uk UNIQUE (contrato_id, construccion_id)
);

COMMENT ON TABLE dilesa.contrato_lotes IS
  'N:M entre contratos_construccion y construccion. Reemplaza la columna CSV '
  '"ID Construcción" del Coda. Una construcción puede tener varios contratos '
  '(ej. obra extra) y un contrato puede cubrir varios lotes.';

ALTER TABLE dilesa.contrato_lotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY contrato_lotes_select ON dilesa.contrato_lotes FOR SELECT
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));
CREATE POLICY contrato_lotes_modify ON dilesa.contrato_lotes FOR ALL
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER tg_contrato_lotes_updated_at BEFORE UPDATE ON dilesa.contrato_lotes
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

CREATE INDEX contrato_lotes_construccion_idx ON dilesa.contrato_lotes (construccion_id) WHERE deleted_at IS NULL;

-- ── 9. Log append-only de tareas terminadas ─────────────────────────────────

CREATE TABLE dilesa.construccion_tareas_terminadas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,
  construccion_id     uuid NOT NULL REFERENCES dilesa.construccion(id) ON DELETE CASCADE,
  plantilla_tarea_id  uuid NOT NULL REFERENCES dilesa.plantilla_tareas(id) ON DELETE RESTRICT,
  fecha_terminada     date NOT NULL DEFAULT CURRENT_DATE,
  tiempo_real_dias    numeric(6,3),
  mano_obra_pagada    numeric(14,2),
  revisado_por_persona_id uuid REFERENCES erp.personas(id) ON DELETE SET NULL,
  fecha_pagada        date,
  notas               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  -- Cada tarea de la plantilla puede aparecer 1 vez por construcción
  CONSTRAINT construccion_tareas_terminadas_uk UNIQUE (construccion_id, plantilla_tarea_id)
);

COMMENT ON TABLE dilesa.construccion_tareas_terminadas IS
  'Log append-only de tareas terminadas. Append una fila por cada tarea '
  'que el supervisor cierra. El trigger tg_construccion_avance recalcula '
  'avance_pct en la construccion correspondiente y dispara "20% → '
  'disponible" cuando aplique.';

ALTER TABLE dilesa.construccion_tareas_terminadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY ctt_select ON dilesa.construccion_tareas_terminadas FOR SELECT
  USING (deleted_at IS NULL AND (core.fn_has_empresa(empresa_id) OR core.fn_is_admin()));
CREATE POLICY ctt_modify ON dilesa.construccion_tareas_terminadas FOR ALL
  USING (core.fn_has_empresa(empresa_id) OR core.fn_is_admin())
  WITH CHECK (core.fn_has_empresa(empresa_id) OR core.fn_is_admin());
CREATE TRIGGER tg_ctt_updated_at BEFORE UPDATE ON dilesa.construccion_tareas_terminadas
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

CREATE INDEX ctt_construccion_idx ON dilesa.construccion_tareas_terminadas (construccion_id) WHERE deleted_at IS NULL;
CREATE INDEX ctt_fecha_idx ON dilesa.construccion_tareas_terminadas (fecha_terminada DESC) WHERE deleted_at IS NULL;

-- ── 10. Función de cálculo de avance ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION dilesa.fn_calcular_avance_construccion(p_construccion_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(pt.porcentaje_costo * 100), 0)::numeric(6,2)
  FROM dilesa.construccion_tareas_terminadas ctt
  JOIN dilesa.plantilla_tareas pt ON pt.id = ctt.plantilla_tarea_id
  WHERE ctt.construccion_id = p_construccion_id
    AND ctt.deleted_at IS NULL
    AND pt.deleted_at IS NULL;
$$;

COMMENT ON FUNCTION dilesa.fn_calcular_avance_construccion(uuid) IS
  'Calcula avance % de una construcción como SUM(plantilla_tareas.porcentaje_costo) '
  'de las tareas terminadas. ADR-032 D3. plantilla_tareas.porcentaje_costo está '
  'en formato decimal (0.0021 = 0.21%); se multiplica por 100 para el output %.';

-- ── 11. Trigger: recalcular avance + disparar "20% → disponible" ─────────────

CREATE OR REPLACE FUNCTION dilesa.fn_tg_construccion_avance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_construccion_id uuid := COALESCE(NEW.construccion_id, OLD.construccion_id);
  v_avance_nuevo    numeric;
  v_avance_anterior numeric;
  v_unidad_id       uuid;
  v_producto_id     uuid;
BEGIN
  -- Snapshot del avance ANTES de recalcular (para detectar cruce del 20%).
  SELECT avance_pct, unidad_id, producto_id
    INTO v_avance_anterior, v_unidad_id, v_producto_id
  FROM dilesa.construccion
  WHERE id = v_construccion_id;

  -- Recalcular avance y cachearlo
  v_avance_nuevo := dilesa.fn_calcular_avance_construccion(v_construccion_id);

  UPDATE dilesa.construccion
  SET avance_pct = v_avance_nuevo
  WHERE id = v_construccion_id;

  -- Trigger "20% → en_construccion (disponible para venta)". Idempotente:
  -- solo dispara si la unidad sigue en planeada (no toca asignada/vendida/etc).
  -- Los estados válidos del CHECK son: planeada, lote_urbanizado, en_construccion,
  -- terminada, asignada, vendida, escriturada, entregada. "Disponible para
  -- venta" en términos del módulo Ventas = estado IN ('en_construccion',
  -- 'terminada', 'planeada') AND no tiene venta activa.
  IF v_avance_nuevo >= 20 AND COALESCE(v_avance_anterior, 0) < 20 THEN
    UPDATE dilesa.unidades
    SET estado = 'en_construccion',
        producto_id = COALESCE(producto_id, v_producto_id)
    WHERE id = v_unidad_id
      AND estado IN ('planeada', 'lote_urbanizado')
      AND deleted_at IS NULL;
  END IF;

  -- Trigger 100% → terminada (cuando todas las tareas están cerradas).
  IF v_avance_nuevo >= 100 AND COALESCE(v_avance_anterior, 0) < 100 THEN
    UPDATE dilesa.unidades
    SET estado = 'terminada'
    WHERE id = v_unidad_id
      AND estado = 'en_construccion'  -- no tocar si ya fue asignada/vendida
      AND deleted_at IS NULL;
  END IF;

  -- Trigger inverso: si bajó de ≥20 a <20 (improbable pero posible si se borra
  -- una tarea terminada), volver a planeada. Solo si sigue en construcción y no
  -- fue asignada/vendida.
  IF v_avance_nuevo < 20 AND COALESCE(v_avance_anterior, 0) >= 20 THEN
    UPDATE dilesa.unidades
    SET estado = 'planeada'
    WHERE id = v_unidad_id
      AND estado = 'en_construccion'
      AND deleted_at IS NULL;
  END IF;

  RETURN NULL;
END $$;

COMMENT ON FUNCTION dilesa.fn_tg_construccion_avance() IS
  'Trigger function: recalcula avance_pct de construccion + dispara cambio '
  'de estado en dilesa.unidades cuando cruza el umbral 20%. ADR-032 D4. '
  'Idempotente: solo actualiza unidades en estado planeada/disponible.';

CREATE TRIGGER tg_construccion_avance
AFTER INSERT OR UPDATE OR DELETE ON dilesa.construccion_tareas_terminadas
FOR EACH ROW EXECUTE FUNCTION dilesa.fn_tg_construccion_avance();

-- ── 12. PostgREST reload ─────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
