-- ╭─ 20260701222450_dilesa_descuento_valor_base ─╮
-- Descuento al valor base en la asignación (Fase 1): catálogo de motivos,
-- columnas en dilesa.ventas con gate Dirección (trigger + erp.fn_es_direccion),
-- y parámetro p_descuento_valor_base en fn_calcular_precio_venta que pega al
-- valor comercial ANTES de las derivaciones. Caso canónico: reasignación
-- forzada por problema ZCU respetando el valor con el que el cliente asignó.

BEGIN;

-- ─── 1. Catálogo de motivos ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dilesa.descuento_motivos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES core.empresas(id) ON DELETE RESTRICT,

  -- `nombre` es la etiqueta que se IMPRIME en la solicitud de asignación
  -- junto al monto — redactarla pensando en el documento del cliente.
  nombre      text NOT NULL,
  descripcion text,

  activa      boolean NOT NULL DEFAULT true,
  orden       integer NOT NULL DEFAULT 0,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,

  CONSTRAINT descuento_motivos_nombre_uk UNIQUE (empresa_id, nombre)
);

CREATE INDEX IF NOT EXISTS dilesa_descuento_motivos_empresa_idx
  ON dilesa.descuento_motivos(empresa_id) WHERE deleted_at IS NULL;

ALTER TABLE dilesa.descuento_motivos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS descuento_motivos_select ON dilesa.descuento_motivos;
CREATE POLICY descuento_motivos_select ON dilesa.descuento_motivos
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      core.fn_has_empresa(empresa_id) OR core.fn_is_admin()
    )
  );

-- Escritura del catálogo: solo Dirección (o admin, incluido en fn_es_direccion).
DROP POLICY IF EXISTS descuento_motivos_write ON dilesa.descuento_motivos;
CREATE POLICY descuento_motivos_write ON dilesa.descuento_motivos
  FOR ALL TO authenticated
  USING (erp.fn_es_direccion(empresa_id))
  WITH CHECK (erp.fn_es_direccion(empresa_id));

DROP TRIGGER IF EXISTS dilesa_descuento_motivos_updated_at ON dilesa.descuento_motivos;
CREATE TRIGGER dilesa_descuento_motivos_updated_at
  BEFORE UPDATE ON dilesa.descuento_motivos
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

COMMENT ON TABLE dilesa.descuento_motivos IS
  'Catálogo de motivos de descuento al valor base en la asignación (Fase 1). `nombre` se imprime como etiqueta en la solicitud de asignación. Gestionado por Dirección.';

-- Seed: motivos de arranque. JOIN a core.empresas + NOT EXISTS para ser
-- robusto en Preview branches sin datos de prod.
INSERT INTO dilesa.descuento_motivos (empresa_id, nombre, descripcion, orden)
SELECT e.id, m.nombre, m.descripcion, m.orden
FROM core.empresas e
CROSS JOIN (
  VALUES
    ('Precio respetado de asignación anterior',
     'Reasignación donde se honra el valor base con el que el cliente asignó originalmente.', 1),
    ('Reasignación por problema ZCU',
     'Desasignación forzada por límites de la Zona de Contención Urbana; se respeta el valor pactado.', 2),
    ('Reasignación forzada por DILESA',
     'Desasignación por causa atribuible a DILESA distinta de ZCU.', 3),
    ('Descuento comercial autorizado por Dirección',
     'Concesión comercial puntual autorizada por Dirección.', 4)
) AS m(nombre, descripcion, orden)
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM dilesa.descuento_motivos dm
    WHERE dm.empresa_id = e.id AND dm.nombre = m.nombre
  );

-- ─── 2. Columnas en dilesa.ventas ────────────────────────────────────────────

ALTER TABLE dilesa.ventas
  ADD COLUMN IF NOT EXISTS descuento_valor_base numeric,
  ADD COLUMN IF NOT EXISTS descuento_valor_base_motivo_id uuid
    REFERENCES dilesa.descuento_motivos(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS descuento_valor_base_detalle text,
  ADD COLUMN IF NOT EXISTS descuento_valor_base_autorizado_por uuid
    REFERENCES core.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS descuento_valor_base_autorizado_at timestamptz,
  ADD COLUMN IF NOT EXISTS venta_origen_id uuid
    REFERENCES dilesa.ventas(id) ON DELETE SET NULL;

-- Descuento > 0 exige motivo de catálogo + detalle. (La autorización la
-- exige el trigger, no el CHECK, porque necesita contexto de sesión.)
ALTER TABLE dilesa.ventas
  DROP CONSTRAINT IF EXISTS ventas_descuento_valor_base_check;
ALTER TABLE dilesa.ventas
  ADD CONSTRAINT ventas_descuento_valor_base_check CHECK (
    descuento_valor_base IS NULL
    OR descuento_valor_base = 0
    OR (
      descuento_valor_base > 0
      AND descuento_valor_base_motivo_id IS NOT NULL
      AND descuento_valor_base_detalle IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS dilesa_ventas_venta_origen_idx
  ON dilesa.ventas(venta_origen_id) WHERE venta_origen_id IS NOT NULL;

COMMENT ON COLUMN dilesa.ventas.descuento_valor_base IS
  'Descuento al valor base (valor comercial de lista) aplicado al asignar. Pega ANTES de las derivaciones (frente verde/esquina/crédito/1-2-6%). Requiere motivo + autorización Dirección.';
COMMENT ON COLUMN dilesa.ventas.venta_origen_id IS
  'Venta anterior (desasignada/expirada) cuyo valor base se respeta en esta asignación. Opcional; hace el descuento verificable contra su desglose congelado.';

-- ─── 3. Trigger guard: solo Dirección mueve el descuento ────────────────────
-- Dispara únicamente cuando el descuento (o su motivo) CAMBIA, para no
-- estorbar los updates normales de la venta (fases, cuadratura, crons).
-- Sesiones sin auth.uid() (service role, psql de mantenimiento, backfills)
-- pasan — el gate protege el camino del browser, que es por donde captura
-- la operación.

CREATE OR REPLACE FUNCTION dilesa.fn_guard_descuento_valor_base()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = dilesa, erp, core, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.descuento_valor_base IS NOT DISTINCT FROM OLD.descuento_valor_base
     AND NEW.descuento_valor_base_motivo_id IS NOT DISTINCT FROM OLD.descuento_valor_base_motivo_id
  THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.descuento_valor_base, 0) = 0
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.descuento_valor_base, 0) = 0)
  THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW; -- service role / mantenimiento sin sesión de usuario
  END IF;

  IF NOT erp.fn_es_direccion(NEW.empresa_id) THEN
    RAISE EXCEPTION 'Solo Dirección puede capturar o modificar el descuento al valor base';
  END IF;

  -- Sella la autorización server-side (no confiamos en lo que mande el form).
  IF COALESCE(NEW.descuento_valor_base, 0) > 0 THEN
    NEW.descuento_valor_base_autorizado_por := auth.uid();
    NEW.descuento_valor_base_autorizado_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dilesa_ventas_guard_descuento_valor_base ON dilesa.ventas;
CREATE TRIGGER dilesa_ventas_guard_descuento_valor_base
  BEFORE INSERT OR UPDATE ON dilesa.ventas
  FOR EACH ROW EXECUTE FUNCTION dilesa.fn_guard_descuento_valor_base();

COMMENT ON FUNCTION dilesa.fn_guard_descuento_valor_base IS
  'Gate Dirección del descuento al valor base: solo erp.fn_es_direccion puede setearlo/moverlo desde una sesión de usuario, y la autorización (quién/cuándo) se sella server-side.';

-- ─── 4. fn_calcular_precio_venta: parámetro p_descuento_valor_base ──────────
-- Redefinida DESDE LA VERSIÓN VIVA en prod (pg_get_functiondef, 2026-07-01;
-- idéntica a 20260623155819). DROP explícito: agregar un parámetro con
-- DEFAULT vía CREATE OR REPLACE crearía un OVERLOAD y las llamadas PostgREST
-- con menos argumentos se volverían ambiguas.

DROP FUNCTION IF EXISTS dilesa.fn_calcular_precio_venta(uuid, uuid, numeric, numeric, numeric, numeric);

CREATE OR REPLACE FUNCTION dilesa.fn_calcular_precio_venta(
  p_unidad_id uuid,
  p_tipo_credito_id uuid DEFAULT NULL::uuid,
  p_monto_credito_titular numeric DEFAULT 0,
  p_monto_credito_cotitular numeric DEFAULT 0,
  p_productos_adicionales numeric DEFAULT 0,
  p_sobreprecio_gastos_escrituracion numeric DEFAULT 0,
  p_descuento_valor_base numeric DEFAULT 0  -- « NUEVO »
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_unidad record;
  v_proyecto record;
  v_producto record;
  v_tipo_credito record;
  v_valor_comercial numeric(14,2);
  v_valor_comercial_lista numeric(14,2);  -- « NUEVO »
  v_descuento_valor_base numeric(14,2);   -- « NUEVO »
  v_metros_excedentes numeric(8,2);
  v_valor_excedente_terreno numeric(14,2);
  v_valor_frente_verde numeric(14,2);
  v_valor_esquina numeric(14,2);
  v_pct_esquina numeric(5,4);
  v_valor_venta_futuro numeric(14,2);
  v_costo_credito_adicional numeric(14,2);
  v_zcu_exento boolean := false;
  v_productos_adicionales numeric(14,2);
  v_sobreprecio_gastos_escrituracion numeric(14,2);
  v_precio_venta_total numeric(14,2);
  v_apoyo_infonavit numeric(14,2);
  v_pago_directo numeric(14,2);
BEGIN
  -- Cargar unidad
  SELECT id, empresa_id, proyecto_id, producto_id, area_m2, es_esquina,
         tiene_frente_verde, valor_venta_futuro_snapshot, identificador,
         problema_zcu
  INTO v_unidad
  FROM dilesa.unidades
  WHERE id = p_unidad_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'unidad no encontrada');
  END IF;

  -- Cargar proyecto
  SELECT id, precio_m2_excedente, tamano_lote_promedio, clasificacion_inmobiliaria
  INTO v_proyecto
  FROM dilesa.proyectos
  WHERE id = v_unidad.proyecto_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'proyecto no encontrado');
  END IF;

  -- Cargar producto (prototipo) — puede ser NULL en unidades sin asignar
  v_valor_comercial := 0;
  IF v_unidad.producto_id IS NOT NULL THEN
    SELECT valor_comercial_referencia INTO v_producto
    FROM dilesa.productos
    WHERE id = v_unidad.producto_id AND deleted_at IS NULL;
    v_valor_comercial := COALESCE(v_producto.valor_comercial_referencia, 0);
  END IF;

  -- « NUEVO » Descuento al valor base (autorización Dirección): pega DIRECTO
  -- al valor comercial ANTES de las derivaciones — frente verde, esquina,
  -- costo de crédito y los % de enganche/ISAI/gastos se calculan sobre el
  -- neto. Caso canónico: reasignación forzada (ZCU) respetando el valor con
  -- el que el cliente asignó originalmente.
  v_valor_comercial_lista := v_valor_comercial;
  v_descuento_valor_base := LEAST(
    GREATEST(0, COALESCE(p_descuento_valor_base, 0)),
    v_valor_comercial
  );
  v_valor_comercial := v_valor_comercial - v_descuento_valor_base;

  -- Tipo de crédito (opcional). Si la unidad tiene problema ZCU, el costo
  -- adicional del crédito NO se traslada al precio (FOVISSSTE no financia
  -- ese sobreprecio en casas ZCU); el apoyo Infonavit sí se respeta.
  v_costo_credito_adicional := 0;
  v_apoyo_infonavit := 0;
  IF p_tipo_credito_id IS NOT NULL THEN
    SELECT costo_venta_adicional_pct, apoyo_infonavit_monto INTO v_tipo_credito
    FROM dilesa.tipos_credito
    WHERE id = p_tipo_credito_id AND deleted_at IS NULL;
    IF FOUND THEN
      IF COALESCE(v_unidad.problema_zcu, false)
         AND COALESCE(v_tipo_credito.costo_venta_adicional_pct, 0) > 0 THEN
        v_zcu_exento := true;
      ELSE
        v_costo_credito_adicional := v_valor_comercial * COALESCE(v_tipo_credito.costo_venta_adicional_pct, 0);
      END IF;
      v_apoyo_infonavit := COALESCE(v_tipo_credito.apoyo_infonavit_monto, 0);
    END IF;
  END IF;

  -- Metros excedentes (si la unidad es mayor al lote promedio)
  v_metros_excedentes := 0;
  v_valor_excedente_terreno := 0;
  IF v_unidad.area_m2 IS NOT NULL AND v_proyecto.tamano_lote_promedio IS NOT NULL THEN
    v_metros_excedentes := GREATEST(0, v_unidad.area_m2 - v_proyecto.tamano_lote_promedio);
    v_valor_excedente_terreno := v_metros_excedentes * COALESCE(v_proyecto.precio_m2_excedente, 0);
  END IF;

  -- Frente verde: +2% si aplica (parejo para todos los proyectos por ahora)
  v_valor_frente_verde := CASE WHEN COALESCE(v_unidad.tiene_frente_verde, false)
    THEN v_valor_comercial * 0.02
    ELSE 0
  END;

  -- Esquina: % depende de la clasificación del proyecto
  v_pct_esquina := CASE v_proyecto.clasificacion_inmobiliaria
    WHEN 'interes_social' THEN 0.15
    WHEN 'residencial_medio' THEN 0.032
    WHEN 'residencial_alto' THEN 0.032
    ELSE 0
  END;
  v_valor_esquina := CASE WHEN COALESCE(v_unidad.es_esquina, false)
    THEN v_valor_comercial * v_pct_esquina
    ELSE 0
  END;

  -- Valor venta futuro: snapshot manual (eventualmente del módulo obra)
  v_valor_venta_futuro := COALESCE(v_unidad.valor_venta_futuro_snapshot, 0);

  -- Productos adicionales (productos reales del paquete: closets/upgrades).
  v_productos_adicionales := GREATEST(0, COALESCE(p_productos_adicionales, 0));
  -- Sobreprecio para gastos de escrituración (lo absorbe el crédito).
  v_sobreprecio_gastos_escrituracion := GREATEST(0, COALESCE(p_sobreprecio_gastos_escrituracion, 0));

  -- Precio de venta total
  v_precio_venta_total := v_valor_comercial
    + v_valor_excedente_terreno
    + v_valor_frente_verde
    + v_valor_esquina
    + v_valor_venta_futuro
    + v_costo_credito_adicional
    + v_productos_adicionales
    + v_sobreprecio_gastos_escrituracion;

  -- Pago directo del cliente (después de créditos y apoyo)
  v_pago_directo := v_precio_venta_total
    - COALESCE(p_monto_credito_titular, 0)
    - COALESCE(p_monto_credito_cotitular, 0)
    - v_apoyo_infonavit;

  RETURN jsonb_build_object(
    'unidad_id', v_unidad.id,
    'identificador', v_unidad.identificador,
    'valor_comercial', v_valor_comercial,
    'valor_comercial_lista', v_valor_comercial_lista,  -- « NUEVO »
    'descuento_valor_base', v_descuento_valor_base,    -- « NUEVO »
    'metros_excedentes', v_metros_excedentes,
    'valor_excedente_terreno', v_valor_excedente_terreno,
    'valor_frente_verde', v_valor_frente_verde,
    'valor_esquina', v_valor_esquina,
    'pct_esquina_aplicado', v_pct_esquina,
    'valor_venta_futuro', v_valor_venta_futuro,
    'costo_credito_adicional', v_costo_credito_adicional,
    'zcu_exento', v_zcu_exento,
    'productos_adicionales', v_productos_adicionales,
    'sobreprecio_gastos_escrituracion', v_sobreprecio_gastos_escrituracion,
    'precio_venta_total', v_precio_venta_total,
    'apoyo_infonavit', v_apoyo_infonavit,
    'monto_credito_titular', COALESCE(p_monto_credito_titular, 0),
    'monto_credito_cotitular', COALESCE(p_monto_credito_cotitular, 0),
    'pago_directo', v_pago_directo,
    'enganche_1pct', v_precio_venta_total * 0.01,
    'isai_2pct', v_precio_venta_total * 0.02,
    'gastos_notariales_6pct', v_precio_venta_total * 0.06
  );
END;
$function$;

REVOKE ALL ON FUNCTION dilesa.fn_calcular_precio_venta FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION dilesa.fn_calcular_precio_venta TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
