-- ╭─ 20260702182440_rdb_pos_schema ─╮
-- rdb-pos-propio · S1 — Schema del POS propio de RDB (ADR-056).
-- Tablas pos_*, guards de estado, trigger de inventario, RPCs idempotentes,
-- vista canónica y RLS. DDL aditivo; sin datos.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- 1) Catálogo: flag "va a cocina" (todo el club vende por el POS; solo lo
--    preparable aparece en el KDS). NULL en producto = hereda de la categoría.
-- -----------------------------------------------------------------------------
ALTER TABLE erp.categorias_producto
  ADD COLUMN IF NOT EXISTS va_a_cocina boolean NOT NULL DEFAULT false;
ALTER TABLE erp.productos
  ADD COLUMN IF NOT EXISTS va_a_cocina boolean;

COMMENT ON COLUMN erp.categorias_producto.va_a_cocina IS
  'POS RDB (ADR-056): items de esta categoría se envían al KDS de cocina.';
COMMENT ON COLUMN erp.productos.va_a_cocina IS
  'POS RDB (ADR-056): override por producto; NULL hereda de la categoría.';

-- -----------------------------------------------------------------------------
-- 2) Tablas
-- -----------------------------------------------------------------------------

-- Estaciones: punto de captura físico (mostrador, tablet de cancha, kds).
CREATE TABLE rdb.pos_estaciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES core.empresas(id),
  nombre        text NOT NULL,
  tipo          text NOT NULL CHECK (tipo IN ('mostrador', 'tablet', 'kds')),
  auth_user_id  uuid, -- cuenta Supabase de dispositivo ligada a la estación
  activa        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, nombre)
);

-- Operadores POS: PIN corto por empleado para atribución en tablets compartidas.
CREATE TABLE rdb.pos_operadores (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       uuid NOT NULL REFERENCES core.empresas(id),
  empleado_id      uuid NOT NULL REFERENCES erp.empleados(id),
  pin_hash         text NOT NULL, -- extensions.crypt(pin, gen_salt('bf'))
  puede_autorizar  boolean NOT NULL DEFAULT false, -- descuentos/mermas/cancelaciones
  activo           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, empleado_id)
);

-- Cuentas: la unidad de venta (mostrador pay-as-you-go o mesa/cancha abierta).
CREATE TABLE rdb.pos_cuentas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL REFERENCES core.empresas(id),
  estacion_id        uuid NOT NULL REFERENCES rdb.pos_estaciones(id),
  ubicacion          text, -- 'Tiendita', 'Pádel 3', 'Cancha Tenis 1'…
  tipo_venta         text NOT NULL DEFAULT 'normal'
                     CHECK (tipo_venta IN ('normal', 'empleado', 'cortesia')),
  estado             text NOT NULL DEFAULT 'abierta'
                     CHECK (estado IN ('abierta', 'en_cobro', 'pagada', 'cancelada')),
  cliente_nombre     text,
  playtomic_folio    text, -- referencia P-XXXXXX para conciliación
  cuenta_origen_id   uuid REFERENCES rdb.pos_cuentas(id), -- corrección post-cierre
  abierta_por        uuid NOT NULL REFERENCES erp.empleados(id),
  -- Totales server-side (mantenidos por trigger; el cliente solo muestra):
  subtotal           numeric NOT NULL DEFAULT 0,
  descuento_total    numeric NOT NULL DEFAULT 0,
  total              numeric NOT NULL DEFAULT 0,
  cancel_razon       text,
  client_action_id   uuid NOT NULL UNIQUE, -- idempotencia de apertura
  abierta_at         timestamptz NOT NULL DEFAULT now(),
  cerrada_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Rondas: momentos de captura dentro de una cuenta. Inmutables.
CREATE TABLE rdb.pos_rondas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid NOT NULL REFERENCES core.empresas(id),
  cuenta_id         uuid NOT NULL REFERENCES rdb.pos_cuentas(id),
  numero            integer NOT NULL,
  capturada_por     uuid NOT NULL REFERENCES erp.empleados(id),
  estacion_id       uuid NOT NULL REFERENCES rdb.pos_estaciones(id),
  client_action_id  uuid NOT NULL UNIQUE, -- idempotencia: el doble-tap no duplica
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cuenta_id, numero)
);

-- Items: líneas con snapshot de catálogo (precio congelado al capturar).
CREATE TABLE rdb.pos_items (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id               uuid NOT NULL REFERENCES core.empresas(id),
  cuenta_id                uuid NOT NULL REFERENCES rdb.pos_cuentas(id),
  ronda_id                 uuid NOT NULL REFERENCES rdb.pos_rondas(id),
  producto_id              uuid NOT NULL REFERENCES erp.productos(id),
  -- Snapshot (el cambio de catálogo no altera cuentas abiertas):
  producto_nombre          text NOT NULL,
  categoria_id             uuid,
  categoria_nombre         text,
  precio_unitario          numeric NOT NULL,
  va_a_cocina              boolean NOT NULL DEFAULT false,
  cantidad                 numeric NOT NULL CHECK (cantidad > 0),
  descuento_pct            numeric NOT NULL DEFAULT 0
                           CHECK (descuento_pct >= 0 AND descuento_pct <= 100),
  descuento_razon          text,
  descuento_autorizado_por uuid REFERENCES erp.empleados(id),
  estado                   text NOT NULL DEFAULT 'capturado'
                           CHECK (estado IN ('capturado', 'en_cocina', 'listo',
                                             'entregado', 'void', 'void_merma')),
  void_razon               text,
  void_por                 uuid REFERENCES erp.empleados(id),
  notas                    text,
  enviado_cocina_at        timestamptz,
  listo_at                 timestamptz,
  entregado_at             timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Pagos: INMUTABLES (corregir = fila de reversa). El dinero pertenece al corte
-- donde se cobra.
CREATE TABLE rdb.pos_pagos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid NOT NULL REFERENCES core.empresas(id),
  cuenta_id         uuid NOT NULL REFERENCES rdb.pos_cuentas(id),
  corte_id          uuid NOT NULL REFERENCES erp.cortes_caja(id),
  metodo            text NOT NULL
                    CHECK (metodo IN ('efectivo', 'tarjeta', 'transferencia', 'cortesia')),
  monto             numeric NOT NULL CHECK (monto >= 0),
  propina           numeric NOT NULL DEFAULT 0 CHECK (propina >= 0),
  recibido          numeric,  -- efectivo entregado por el cliente
  cambio            numeric,  -- calculado server-side
  referencia        text,     -- últimos 4 / referencia de transferencia
  reversa_de        uuid REFERENCES rdb.pos_pagos(id),
  registrado_por    uuid NOT NULL REFERENCES erp.empleados(id),
  client_action_id  uuid NOT NULL UNIQUE,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Eventos: audit trail append-only (ADR-023 aplicado al POS).
CREATE TABLE rdb.pos_eventos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid NOT NULL REFERENCES core.empresas(id),
  cuenta_id             uuid REFERENCES rdb.pos_cuentas(id),
  item_id               uuid REFERENCES rdb.pos_items(id),
  pago_id               uuid REFERENCES rdb.pos_pagos(id),
  evento                text NOT NULL,
  actor_empleado_id     uuid REFERENCES erp.empleados(id),
  actor_empleado_nombre text, -- snapshot
  actor_auth_uid        uuid, -- sesión de dispositivo/usuario
  estacion_id           uuid REFERENCES rdb.pos_estaciones(id),
  autorizado_por        uuid REFERENCES erp.empleados(id),
  datos_antes           jsonb,
  datos_despues         jsonb,
  razon                 text,
  client_action_id      uuid, -- punto único de idempotencia de RPCs
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX pos_eventos_client_action_uq
  ON rdb.pos_eventos (client_action_id) WHERE client_action_id IS NOT NULL;

-- Índices operativos
CREATE INDEX pos_cuentas_abiertas_idx ON rdb.pos_cuentas (empresa_id, estado, abierta_at);
CREATE INDEX pos_items_cuenta_idx     ON rdb.pos_items (cuenta_id);
CREATE INDEX pos_items_kds_idx        ON rdb.pos_items (empresa_id, estado)
  WHERE estado IN ('capturado', 'en_cocina', 'listo');
CREATE INDEX pos_pagos_corte_idx      ON rdb.pos_pagos (corte_id);
CREATE INDEX pos_pagos_cuenta_idx     ON rdb.pos_pagos (cuenta_id);
CREATE INDEX pos_eventos_cuenta_idx   ON rdb.pos_eventos (cuenta_id, created_at);
CREATE INDEX pos_rondas_cuenta_idx    ON rdb.pos_rondas (cuenta_id);

-- -----------------------------------------------------------------------------
-- 3) Guards de integridad
-- -----------------------------------------------------------------------------

-- Cuentas: máquina de estados; reabrir pagada/cancelada está prohibido.
CREATE OR REPLACE FUNCTION rdb.fn_trg_pos_cuentas_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'rdb', 'public'
AS $$
BEGIN
  IF OLD.estado IN ('pagada', 'cancelada') THEN
    RAISE EXCEPTION 'POS: cuenta % está % y es inmutable (crear cuenta ligada via cuenta_origen_id)',
      OLD.id, OLD.estado;
  END IF;
  IF NEW.estado <> OLD.estado AND NOT (
       (OLD.estado = 'abierta'  AND NEW.estado IN ('en_cobro', 'pagada', 'cancelada'))
    OR (OLD.estado = 'en_cobro' AND NEW.estado IN ('abierta', 'pagada', 'cancelada'))
  ) THEN
    RAISE EXCEPTION 'POS: transición de cuenta inválida % → %', OLD.estado, NEW.estado;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pos_cuentas_guard
  BEFORE UPDATE ON rdb.pos_cuentas
  FOR EACH ROW EXECUTE FUNCTION rdb.fn_trg_pos_cuentas_guard();

-- Items: transiciones válidas; lo enviado a cocina no se edita (void + relíneo).
CREATE OR REPLACE FUNCTION rdb.fn_trg_pos_items_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'rdb', 'public'
AS $$
BEGIN
  -- Campos de captura solo mutan mientras el item está 'capturado'.
  IF OLD.estado <> 'capturado' AND (
       NEW.cantidad        IS DISTINCT FROM OLD.cantidad
    OR NEW.precio_unitario IS DISTINCT FROM OLD.precio_unitario
    OR NEW.producto_id     IS DISTINCT FROM OLD.producto_id
    OR NEW.descuento_pct   IS DISTINCT FROM OLD.descuento_pct
  ) THEN
    RAISE EXCEPTION 'POS: item % ya salió de captura (%); se corrige con void + línea nueva',
      OLD.id, OLD.estado;
  END IF;

  IF NEW.estado <> OLD.estado THEN
    IF NOT (
         (OLD.estado = 'capturado' AND NEW.estado IN ('en_cocina', 'entregado', 'void'))
      OR (OLD.estado = 'en_cocina' AND NEW.estado IN ('listo', 'void_merma'))
      OR (OLD.estado = 'listo'     AND NEW.estado IN ('entregado', 'void_merma'))
      OR (OLD.estado = 'entregado' AND NEW.estado IN ('void_merma'))
    ) THEN
      RAISE EXCEPTION 'POS: transición de item inválida % → %', OLD.estado, NEW.estado;
    END IF;
    -- 'capturado' → 'entregado' directo solo para items que no van a cocina.
    IF OLD.estado = 'capturado' AND NEW.estado = 'entregado' AND NEW.va_a_cocina THEN
      RAISE EXCEPTION 'POS: item % va a cocina; debe pasar por el KDS', OLD.id;
    END IF;
    IF NEW.estado IN ('void', 'void_merma') AND (NEW.void_razon IS NULL OR NEW.void_por IS NULL) THEN
      RAISE EXCEPTION 'POS: void requiere razón y empleado (void_razon, void_por)';
    END IF;
    NEW.enviado_cocina_at := COALESCE(NEW.enviado_cocina_at,
      CASE WHEN NEW.estado = 'en_cocina' THEN now() END);
    NEW.listo_at     := COALESCE(NEW.listo_at,     CASE WHEN NEW.estado = 'listo'     THEN now() END);
    NEW.entregado_at := COALESCE(NEW.entregado_at, CASE WHEN NEW.estado = 'entregado' THEN now() END);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pos_items_guard
  BEFORE UPDATE ON rdb.pos_items
  FOR EACH ROW EXECUTE FUNCTION rdb.fn_trg_pos_items_guard();

-- Pagos y eventos: append-only duro.
CREATE OR REPLACE FUNCTION rdb.fn_trg_pos_append_only()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'pg_catalog'
AS $$
BEGIN
  RAISE EXCEPTION 'POS: % es append-only (corregir = fila de reversa/evento nuevo)', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER trg_pos_pagos_append_only
  BEFORE UPDATE OR DELETE ON rdb.pos_pagos
  FOR EACH ROW EXECUTE FUNCTION rdb.fn_trg_pos_append_only();
CREATE TRIGGER trg_pos_eventos_append_only
  BEFORE UPDATE OR DELETE ON rdb.pos_eventos
  FOR EACH ROW EXECUTE FUNCTION rdb.fn_trg_pos_append_only();

-- Totales de la cuenta: server-side siempre (void/void_merma no se cobran).
CREATE OR REPLACE FUNCTION rdb.fn_pos_recalcular_cuenta(p_cuenta_id uuid)
RETURNS void LANGUAGE sql
SET search_path TO 'pg_catalog', 'rdb', 'public'
AS $$
  UPDATE rdb.pos_cuentas c SET
    subtotal = COALESCE(t.subtotal, 0),
    descuento_total = COALESCE(t.descuento, 0),
    total = COALESCE(t.subtotal, 0) - COALESCE(t.descuento, 0),
    updated_at = now()
  FROM (
    SELECT
      SUM(cantidad * precio_unitario) AS subtotal,
      SUM(cantidad * precio_unitario * descuento_pct / 100.0) AS descuento
    FROM rdb.pos_items
    WHERE cuenta_id = p_cuenta_id AND estado NOT IN ('void', 'void_merma')
  ) t
  WHERE c.id = p_cuenta_id;
$$;

CREATE OR REPLACE FUNCTION rdb.fn_trg_pos_items_totales()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'rdb', 'public'
AS $$
BEGIN
  PERFORM rdb.fn_pos_recalcular_cuenta(COALESCE(NEW.cuenta_id, OLD.cuenta_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_pos_items_totales
  AFTER INSERT OR UPDATE OR DELETE ON rdb.pos_items
  FOR EACH ROW EXECUTE FUNCTION rdb.fn_trg_pos_items_totales();

-- -----------------------------------------------------------------------------
-- 4) Inventario por evento de línea (espejo de fn_trg_waitry_to_movimientos).
--    Salida existe ⟺ estado IN ('entregado','void_merma'). Idempotente por item.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp.fn_trg_pos_to_movimientos()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'erp', 'rdb', 'public'
AS $$
DECLARE
  v_almacen_id     uuid;
  v_receta_rows    integer;
  r_insumo         RECORD;
  v_factor         numeric;
  v_parent_id      uuid;
  v_factor_consumo numeric;
  v_nota           text;
BEGIN
  SELECT id INTO v_almacen_id
  FROM erp.almacenes WHERE empresa_id = NEW.empresa_id LIMIT 1;
  IF v_almacen_id IS NULL THEN RETURN NEW; END IF;

  -- Idempotencia: recalcular desde cero para este item.
  DELETE FROM erp.movimientos_inventario
  WHERE referencia_tipo = 'venta_pos' AND referencia_id = NEW.id;

  IF NEW.estado NOT IN ('entregado', 'void_merma') THEN
    RETURN NEW; -- capturado/en_cocina/listo/void: sin salida.
  END IF;

  v_nota := 'Venta POS cuenta ' || NEW.cuenta_id ||
            CASE WHEN NEW.estado = 'void_merma'
                 THEN ' (merma: ' || COALESCE(NEW.void_razon, 's/r') || ')'
                 ELSE '' END;

  SELECT COUNT(*) INTO v_receta_rows
  FROM erp.producto_receta
  WHERE producto_venta_id = NEW.producto_id AND empresa_id = NEW.empresa_id;

  IF v_receta_rows > 0 THEN
    FOR r_insumo IN
      SELECT insumo_id, cantidad, unidad
      FROM erp.producto_receta
      WHERE producto_venta_id = NEW.producto_id AND empresa_id = NEW.empresa_id
    LOOP
      v_factor := erp.fn_factor_receta_a_stock(r_insumo.insumo_id, r_insumo.unidad);
      IF v_factor IS NULL THEN CONTINUE; END IF; -- sin conversión conocida: no descontar
      INSERT INTO erp.movimientos_inventario
        (empresa_id, producto_id, almacen_id, tipo_movimiento, cantidad,
         referencia_tipo, referencia_id, notas, created_at)
      VALUES
        (NEW.empresa_id, r_insumo.insumo_id, v_almacen_id, 'salida',
         NEW.cantidad * r_insumo.cantidad * v_factor, 'venta_pos', NEW.id, v_nota, now());
    END LOOP;
    RETURN NEW;
  END IF;

  -- Fallback legacy (sin receta): parent_id + factor_consumo, como Waitry.
  SELECT parent_id, factor_consumo INTO v_parent_id, v_factor_consumo
  FROM erp.productos WHERE id = NEW.producto_id;

  INSERT INTO erp.movimientos_inventario
    (empresa_id, producto_id, almacen_id, tipo_movimiento, cantidad,
     referencia_tipo, referencia_id, notas, created_at)
  VALUES
    (NEW.empresa_id, COALESCE(v_parent_id, NEW.producto_id), v_almacen_id, 'salida',
     NEW.cantidad * COALESCE(v_factor_consumo, 1.0), 'venta_pos', NEW.id, v_nota, now());

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pos_items_movimientos
  AFTER INSERT OR UPDATE OF estado ON rdb.pos_items
  FOR EACH ROW EXECUTE FUNCTION erp.fn_trg_pos_to_movimientos();

-- -----------------------------------------------------------------------------
-- 5) RPCs — única vía de escritura (SECURITY DEFINER; RLS de escritura deny-all)
-- -----------------------------------------------------------------------------

-- Resuelve el PIN al empleado real. Lanza excepción si no matchea.
CREATE OR REPLACE FUNCTION rdb.fn_pos_resolver_operador(p_empresa_id uuid, p_pin text)
RETURNS uuid LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'rdb', 'extensions', 'public'
AS $$
DECLARE
  v_empleado_id uuid;
BEGIN
  SELECT o.empleado_id INTO v_empleado_id
  FROM rdb.pos_operadores o
  WHERE o.empresa_id = p_empresa_id
    AND o.activo
    AND o.pin_hash = extensions.crypt(p_pin, o.pin_hash)
  LIMIT 1;
  IF v_empleado_id IS NULL THEN
    RAISE EXCEPTION 'POS: PIN inválido';
  END IF;
  RETURN v_empleado_id;
END;
$$;

-- Igual pero exige permiso de autorizador (descuentos, mermas, cancelaciones).
CREATE OR REPLACE FUNCTION rdb.fn_pos_resolver_autorizador(p_empresa_id uuid, p_pin text)
RETURNS uuid LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'rdb', 'extensions', 'public'
AS $$
DECLARE
  v_empleado_id uuid;
BEGIN
  SELECT o.empleado_id INTO v_empleado_id
  FROM rdb.pos_operadores o
  WHERE o.empresa_id = p_empresa_id
    AND o.activo AND o.puede_autorizar
    AND o.pin_hash = extensions.crypt(p_pin, o.pin_hash)
  LIMIT 1;
  IF v_empleado_id IS NULL THEN
    RAISE EXCEPTION 'POS: PIN de autorizador inválido';
  END IF;
  RETURN v_empleado_id;
END;
$$;

-- Idempotencia central: TRUE si la acción ya se procesó (el caller regresa no-op).
CREATE OR REPLACE FUNCTION rdb.fn_pos_accion_ya_procesada(p_client_action_id uuid)
RETURNS boolean LANGUAGE sql STABLE
SET search_path TO 'pg_catalog', 'rdb'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM rdb.pos_eventos WHERE client_action_id = p_client_action_id
  );
$$;

-- Log de evento (uso interno de las RPCs).
CREATE OR REPLACE FUNCTION rdb.fn_pos_log_evento(
  p_empresa_id uuid, p_evento text, p_actor uuid, p_estacion uuid,
  p_cuenta uuid DEFAULT NULL, p_item uuid DEFAULT NULL, p_pago uuid DEFAULT NULL,
  p_antes jsonb DEFAULT NULL, p_despues jsonb DEFAULT NULL,
  p_razon text DEFAULT NULL, p_autorizado_por uuid DEFAULT NULL,
  p_client_action_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'rdb', 'erp', 'public'
AS $$
DECLARE
  v_id uuid;
  v_nombre text;
BEGIN
  SELECT TRIM(CONCAT_WS(' ', p.nombre, p.apellido_paterno, p.apellido_materno))
    INTO v_nombre
  FROM erp.empleados e JOIN erp.personas p ON p.id = e.persona_id
  WHERE e.id = p_actor;

  INSERT INTO rdb.pos_eventos
    (empresa_id, evento, actor_empleado_id, actor_empleado_nombre, actor_auth_uid,
     estacion_id, cuenta_id, item_id, pago_id, datos_antes, datos_despues,
     razon, autorizado_por, client_action_id)
  VALUES
    (p_empresa_id, p_evento, p_actor, v_nombre, auth.uid(),
     p_estacion, p_cuenta, p_item, p_pago, p_antes, p_despues,
     p_razon, p_autorizado_por, p_client_action_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Abrir cuenta.
CREATE OR REPLACE FUNCTION rdb.fn_pos_abrir_cuenta(
  p_estacion_id uuid, p_pin text, p_client_action_id uuid,
  p_ubicacion text DEFAULT NULL, p_tipo_venta text DEFAULT 'normal',
  p_cliente_nombre text DEFAULT NULL, p_playtomic_folio text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'rdb', 'erp', 'public'
AS $$
DECLARE
  v_empresa_id uuid;
  v_empleado   uuid;
  v_cuenta     uuid;
BEGIN
  SELECT empresa_id INTO v_empresa_id FROM rdb.pos_estaciones
  WHERE id = p_estacion_id AND activa;
  IF v_empresa_id IS NULL THEN RAISE EXCEPTION 'POS: estación inválida o inactiva'; END IF;

  -- Idempotencia: mismo tap devuelve la cuenta original.
  SELECT id INTO v_cuenta FROM rdb.pos_cuentas WHERE client_action_id = p_client_action_id;
  IF v_cuenta IS NOT NULL THEN RETURN v_cuenta; END IF;

  v_empleado := rdb.fn_pos_resolver_operador(v_empresa_id, p_pin);

  INSERT INTO rdb.pos_cuentas
    (empresa_id, estacion_id, ubicacion, tipo_venta, cliente_nombre,
     playtomic_folio, abierta_por, client_action_id)
  VALUES
    (v_empresa_id, p_estacion_id, p_ubicacion, p_tipo_venta, p_cliente_nombre,
     p_playtomic_folio, v_empleado, p_client_action_id)
  RETURNING id INTO v_cuenta;

  PERFORM rdb.fn_pos_log_evento(v_empresa_id, 'cuenta_abierta', v_empleado,
    p_estacion_id, v_cuenta, NULL, NULL, NULL,
    jsonb_build_object('ubicacion', p_ubicacion, 'tipo_venta', p_tipo_venta));
  RETURN v_cuenta;
END;
$$;

-- Agregar ronda de items. p_items: [{producto_id, cantidad, descuento_pct?,
-- descuento_razon?, notas?}]. Descuento > umbral exige PIN de autorizador.
CREATE OR REPLACE FUNCTION rdb.fn_pos_agregar_ronda(
  p_cuenta_id uuid, p_pin text, p_client_action_id uuid, p_items jsonb,
  p_pin_autorizador text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'rdb', 'erp', 'public'
AS $$
DECLARE
  v_c           rdb.pos_cuentas%ROWTYPE;
  v_empleado    uuid;
  v_autorizador uuid;
  v_ronda       uuid;
  v_numero      integer;
  r_item        RECORD;
  v_prod        RECORD;
  v_precio      numeric;
  v_estado_ini  text;
  v_umbral      numeric := 15; -- % de descuento que exige autorizador
BEGIN
  SELECT id INTO v_ronda FROM rdb.pos_rondas WHERE client_action_id = p_client_action_id;
  IF v_ronda IS NOT NULL THEN RETURN v_ronda; END IF;

  SELECT * INTO v_c FROM rdb.pos_cuentas WHERE id = p_cuenta_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'POS: cuenta inexistente'; END IF;
  IF v_c.estado <> 'abierta' THEN
    RAISE EXCEPTION 'POS: la cuenta está % — no admite rondas', v_c.estado;
  END IF;

  v_empleado := rdb.fn_pos_resolver_operador(v_c.empresa_id, p_pin);

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_items)
      AS x(producto_id uuid, cantidad numeric, descuento_pct numeric)
    WHERE COALESCE(x.descuento_pct, 0) > v_umbral
  ) THEN
    IF p_pin_autorizador IS NULL THEN
      RAISE EXCEPTION 'POS: descuento > %%% requiere PIN de autorizador', v_umbral;
    END IF;
    v_autorizador := rdb.fn_pos_resolver_autorizador(v_c.empresa_id, p_pin_autorizador);
  END IF;

  SELECT COALESCE(MAX(numero), 0) + 1 INTO v_numero
  FROM rdb.pos_rondas WHERE cuenta_id = p_cuenta_id;

  INSERT INTO rdb.pos_rondas
    (empresa_id, cuenta_id, numero, capturada_por, estacion_id, client_action_id)
  VALUES
    (v_c.empresa_id, p_cuenta_id, v_numero, v_empleado, v_c.estacion_id, p_client_action_id)
  RETURNING id INTO v_ronda;

  FOR r_item IN
    SELECT * FROM jsonb_to_recordset(p_items)
      AS x(producto_id uuid, cantidad numeric, descuento_pct numeric,
           descuento_razon text, notas text)
  LOOP
    SELECT p.id, p.nombre, p.categoria_id, c.nombre AS categoria_nombre,
           COALESCE(p.va_a_cocina, c.va_a_cocina, false) AS va_a_cocina
      INTO v_prod
    FROM erp.productos p
    LEFT JOIN erp.categorias_producto c ON c.id = p.categoria_id
    WHERE p.id = r_item.producto_id
      AND p.empresa_id = v_c.empresa_id AND p.activo AND p.deleted_at IS NULL;
    IF v_prod.id IS NULL THEN
      RAISE EXCEPTION 'POS: producto % inexistente/inactivo en la empresa', r_item.producto_id;
    END IF;

    SELECT precio_venta INTO v_precio
    FROM erp.productos_precios
    WHERE producto_id = r_item.producto_id AND empresa_id = v_c.empresa_id AND vigente
    ORDER BY fecha_inicio DESC LIMIT 1;
    IF v_precio IS NULL THEN
      RAISE EXCEPTION 'POS: producto % sin precio vigente', v_prod.nombre;
    END IF;

    v_estado_ini := CASE WHEN v_prod.va_a_cocina THEN 'capturado' ELSE 'entregado' END;

    INSERT INTO rdb.pos_items
      (empresa_id, cuenta_id, ronda_id, producto_id, producto_nombre,
       categoria_id, categoria_nombre, precio_unitario, va_a_cocina, cantidad,
       descuento_pct, descuento_razon, descuento_autorizado_por, estado, notas,
       entregado_at)
    VALUES
      (v_c.empresa_id, p_cuenta_id, v_ronda, v_prod.id, v_prod.nombre,
       v_prod.categoria_id, v_prod.categoria_nombre, v_precio, v_prod.va_a_cocina,
       r_item.cantidad, COALESCE(r_item.descuento_pct, 0), r_item.descuento_razon,
       CASE WHEN COALESCE(r_item.descuento_pct, 0) > v_umbral THEN v_autorizador END,
       v_estado_ini, r_item.notas,
       CASE WHEN v_estado_ini = 'entregado' THEN now() END);
  END LOOP;

  PERFORM rdb.fn_pos_log_evento(v_c.empresa_id, 'ronda_agregada', v_empleado,
    v_c.estacion_id, p_cuenta_id, NULL, NULL, NULL,
    jsonb_build_object('ronda', v_numero, 'items', jsonb_array_length(p_items)),
    NULL, v_autorizador, p_client_action_id);
  RETURN v_ronda;
END;
$$;

-- Enviar a cocina lo capturado de una cuenta (aparece en el KDS).
CREATE OR REPLACE FUNCTION rdb.fn_pos_enviar_cocina(
  p_cuenta_id uuid, p_pin text, p_client_action_id uuid
) RETURNS integer LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'rdb', 'public'
AS $$
DECLARE
  v_c        rdb.pos_cuentas%ROWTYPE;
  v_empleado uuid;
  v_n        integer;
BEGIN
  IF rdb.fn_pos_accion_ya_procesada(p_client_action_id) THEN RETURN 0; END IF;
  SELECT * INTO v_c FROM rdb.pos_cuentas WHERE id = p_cuenta_id;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'POS: cuenta inexistente'; END IF;
  v_empleado := rdb.fn_pos_resolver_operador(v_c.empresa_id, p_pin);

  UPDATE rdb.pos_items SET estado = 'en_cocina'
  WHERE cuenta_id = p_cuenta_id AND estado = 'capturado' AND va_a_cocina;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  PERFORM rdb.fn_pos_log_evento(v_c.empresa_id, 'enviado_cocina', v_empleado,
    v_c.estacion_id, p_cuenta_id, NULL, NULL, NULL,
    jsonb_build_object('items', v_n), NULL, NULL, p_client_action_id);
  RETURN v_n;
END;
$$;

-- KDS: cocina avanza el item (ack → listo) y el capturista marca entregado.
CREATE OR REPLACE FUNCTION rdb.fn_pos_kds_marcar(
  p_item_id uuid, p_nuevo_estado text, p_client_action_id uuid
) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'rdb', 'public'
AS $$
DECLARE
  v_item rdb.pos_items%ROWTYPE;
BEGIN
  IF p_nuevo_estado NOT IN ('en_cocina', 'listo', 'entregado') THEN
    RAISE EXCEPTION 'POS: estado KDS inválido %', p_nuevo_estado;
  END IF;
  IF rdb.fn_pos_accion_ya_procesada(p_client_action_id) THEN RETURN; END IF;
  SELECT * INTO v_item FROM rdb.pos_items WHERE id = p_item_id;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'POS: item inexistente'; END IF;

  UPDATE rdb.pos_items SET estado = p_nuevo_estado WHERE id = p_item_id;

  PERFORM rdb.fn_pos_log_evento(v_item.empresa_id, 'kds_' || p_nuevo_estado, NULL,
    NULL, v_item.cuenta_id, p_item_id, NULL,
    jsonb_build_object('estado', v_item.estado),
    jsonb_build_object('estado', p_nuevo_estado), NULL, NULL, p_client_action_id);
END;
$$;

-- Void de item: pre-cocina libre con razón; post-cocina = merma con autorizador.
CREATE OR REPLACE FUNCTION rdb.fn_pos_void_item(
  p_item_id uuid, p_pin text, p_razon text, p_client_action_id uuid,
  p_pin_autorizador text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'rdb', 'public'
AS $$
DECLARE
  v_item        rdb.pos_items%ROWTYPE;
  v_empleado    uuid;
  v_autorizador uuid;
  v_destino     text;
BEGIN
  IF rdb.fn_pos_accion_ya_procesada(p_client_action_id) THEN RETURN; END IF;
  SELECT * INTO v_item FROM rdb.pos_items WHERE id = p_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'POS: item inexistente'; END IF;
  IF v_item.estado IN ('void', 'void_merma') THEN RETURN; END IF;

  v_empleado := rdb.fn_pos_resolver_operador(v_item.empresa_id, p_pin);
  v_destino  := CASE WHEN v_item.estado = 'capturado' THEN 'void' ELSE 'void_merma' END;

  IF v_destino = 'void_merma' THEN
    IF p_pin_autorizador IS NULL THEN
      RAISE EXCEPTION 'POS: void post-cocina (merma) requiere PIN de autorizador';
    END IF;
    v_autorizador := rdb.fn_pos_resolver_autorizador(v_item.empresa_id, p_pin_autorizador);
  END IF;

  UPDATE rdb.pos_items
  SET estado = v_destino, void_razon = p_razon, void_por = v_empleado
  WHERE id = p_item_id;

  PERFORM rdb.fn_pos_log_evento(v_item.empresa_id, v_destino, v_empleado,
    NULL, v_item.cuenta_id, p_item_id, NULL,
    jsonb_build_object('estado', v_item.estado, 'producto', v_item.producto_nombre,
                       'cantidad', v_item.cantidad),
    jsonb_build_object('estado', v_destino), p_razon, v_autorizador, p_client_action_id);
END;
$$;

-- Cobrar: pagos contra el corte activo; suma ≥ total ⇒ cuenta pagada.
-- p_pagos: [{metodo, monto, propina?, recibido?, referencia?}]
CREATE OR REPLACE FUNCTION rdb.fn_pos_cobrar(
  p_cuenta_id uuid, p_pin text, p_client_action_id uuid, p_pagos jsonb
) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'rdb', 'erp', 'public'
AS $$
DECLARE
  v_c         rdb.pos_cuentas%ROWTYPE;
  v_empleado  uuid;
  v_corte_id  uuid;
  r_pago      RECORD;
  v_aplicado  numeric := 0;
  v_pendiente integer;
BEGIN
  IF rdb.fn_pos_accion_ya_procesada(p_client_action_id) THEN RETURN; END IF;
  SELECT * INTO v_c FROM rdb.pos_cuentas WHERE id = p_cuenta_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'POS: cuenta inexistente'; END IF;
  IF v_c.estado NOT IN ('abierta', 'en_cobro') THEN
    RAISE EXCEPTION 'POS: la cuenta está %', v_c.estado;
  END IF;

  v_empleado := rdb.fn_pos_resolver_operador(v_c.empresa_id, p_pin);

  -- Items de cocina sin entregar no se cobran a ciegas.
  SELECT COUNT(*) INTO v_pendiente FROM rdb.pos_items
  WHERE cuenta_id = p_cuenta_id AND estado IN ('capturado', 'en_cocina', 'listo');
  IF v_pendiente > 0 THEN
    RAISE EXCEPTION 'POS: % item(s) sin entregar; entrégalos o hazles void antes de cobrar', v_pendiente;
  END IF;

  SELECT id INTO v_corte_id FROM erp.cortes_caja
  WHERE empresa_id = v_c.empresa_id AND estado = 'abierto'
  ORDER BY abierto_at DESC LIMIT 1;
  IF v_corte_id IS NULL THEN
    RAISE EXCEPTION 'POS: no hay corte de caja abierto; abre el corte primero';
  END IF;

  FOR r_pago IN
    SELECT * FROM jsonb_to_recordset(p_pagos)
      AS x(metodo text, monto numeric, propina numeric, recibido numeric, referencia text)
  LOOP
    INSERT INTO rdb.pos_pagos
      (empresa_id, cuenta_id, corte_id, metodo, monto, propina, recibido, cambio,
       referencia, registrado_por, client_action_id)
    VALUES
      (v_c.empresa_id, p_cuenta_id, v_corte_id, r_pago.metodo, r_pago.monto,
       COALESCE(r_pago.propina, 0), r_pago.recibido,
       CASE WHEN r_pago.recibido IS NOT NULL
            THEN r_pago.recibido - r_pago.monto - COALESCE(r_pago.propina, 0) END,
       r_pago.referencia, v_empleado, gen_random_uuid());
  END LOOP;

  -- Total cubierto (incluye pagos previos no reversados) ⇒ pagada.
  SELECT COALESCE(SUM(monto), 0) INTO v_aplicado
  FROM rdb.pos_pagos
  WHERE cuenta_id = p_cuenta_id AND reversa_de IS NULL;

  IF v_aplicado < v_c.total THEN
    RAISE EXCEPTION 'POS: pago insuficiente (aplicado % de %)', v_aplicado, v_c.total;
  END IF;

  UPDATE rdb.pos_cuentas
  SET estado = 'pagada', cerrada_at = now()
  WHERE id = p_cuenta_id;

  PERFORM rdb.fn_pos_log_evento(v_c.empresa_id, 'cuenta_pagada', v_empleado,
    v_c.estacion_id, p_cuenta_id, NULL, NULL,
    NULL, jsonb_build_object('total', v_c.total, 'aplicado', v_aplicado,
                             'corte_id', v_corte_id),
    NULL, NULL, p_client_action_id);
END;
$$;

-- Cancelar cuenta sin pagos (con pagos es reembolso: proceso aparte, no v1).
CREATE OR REPLACE FUNCTION rdb.fn_pos_cancelar_cuenta(
  p_cuenta_id uuid, p_pin text, p_razon text, p_client_action_id uuid,
  p_pin_autorizador text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'rdb', 'public'
AS $$
DECLARE
  v_c           rdb.pos_cuentas%ROWTYPE;
  v_empleado    uuid;
  v_autorizador uuid;
BEGIN
  IF rdb.fn_pos_accion_ya_procesada(p_client_action_id) THEN RETURN; END IF;
  SELECT * INTO v_c FROM rdb.pos_cuentas WHERE id = p_cuenta_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'POS: cuenta inexistente'; END IF;
  IF v_c.estado NOT IN ('abierta', 'en_cobro') THEN
    RAISE EXCEPTION 'POS: la cuenta está %', v_c.estado;
  END IF;
  IF EXISTS (SELECT 1 FROM rdb.pos_pagos WHERE cuenta_id = p_cuenta_id AND reversa_de IS NULL) THEN
    RAISE EXCEPTION 'POS: la cuenta tiene pagos; una cancelación así es reembolso (proceso aparte)';
  END IF;

  v_empleado := rdb.fn_pos_resolver_operador(v_c.empresa_id, p_pin);
  -- Con items ya preparados, cancelar implica merma ⇒ autorizador.
  IF EXISTS (SELECT 1 FROM rdb.pos_items WHERE cuenta_id = p_cuenta_id
             AND estado IN ('en_cocina', 'listo', 'entregado')) THEN
    IF p_pin_autorizador IS NULL THEN
      RAISE EXCEPTION 'POS: cancelar con items preparados requiere PIN de autorizador';
    END IF;
    v_autorizador := rdb.fn_pos_resolver_autorizador(v_c.empresa_id, p_pin_autorizador);
    UPDATE rdb.pos_items
    SET estado = 'void_merma', void_razon = p_razon, void_por = v_empleado
    WHERE cuenta_id = p_cuenta_id AND estado IN ('en_cocina', 'listo', 'entregado');
  END IF;

  UPDATE rdb.pos_items
  SET estado = 'void', void_razon = p_razon, void_por = v_empleado
  WHERE cuenta_id = p_cuenta_id AND estado = 'capturado';

  UPDATE rdb.pos_cuentas
  SET estado = 'cancelada', cancel_razon = p_razon, cerrada_at = now()
  WHERE id = p_cuenta_id;

  PERFORM rdb.fn_pos_log_evento(v_c.empresa_id, 'cuenta_cancelada', v_empleado,
    v_c.estacion_id, p_cuenta_id, NULL, NULL, NULL, NULL,
    p_razon, v_autorizador, p_client_action_id);
END;
$$;

-- Permisos de ejecución: solo authenticated/service_role (nunca anon/PUBLIC).
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'rdb.fn_pos_resolver_operador(uuid, text)',
    'rdb.fn_pos_resolver_autorizador(uuid, text)',
    'rdb.fn_pos_accion_ya_procesada(uuid)',
    'rdb.fn_pos_log_evento(uuid, text, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, text, uuid, uuid)',
    'rdb.fn_pos_recalcular_cuenta(uuid)',
    'rdb.fn_pos_abrir_cuenta(uuid, text, uuid, text, text, text, text)',
    'rdb.fn_pos_agregar_ronda(uuid, text, uuid, jsonb, text)',
    'rdb.fn_pos_enviar_cocina(uuid, text, uuid)',
    'rdb.fn_pos_kds_marcar(uuid, text, uuid)',
    'rdb.fn_pos_void_item(uuid, text, text, uuid, text)',
    'rdb.fn_pos_cobrar(uuid, text, uuid, jsonb)',
    'rdb.fn_pos_cancelar_cuenta(uuid, text, text, uuid, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;

-- Los helpers internos no se exponen a authenticated.
REVOKE EXECUTE ON FUNCTION rdb.fn_pos_resolver_operador(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION rdb.fn_pos_resolver_autorizador(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION rdb.fn_pos_log_evento(uuid, text, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb, text, uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION rdb.fn_pos_recalcular_cuenta(uuid) FROM authenticated;

-- -----------------------------------------------------------------------------
-- 6) Vista canónica de ventas (nadie lee tablas crudas — ADR-056)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW rdb.v_ventas_canonicas AS
SELECT
  'waitry'::text            AS source,
  w.order_id                AS venta_ref,
  w."timestamp"             AS fecha,
  w.corte_id,
  w.table_name              AS ubicacion,
  w.total_amount            AS total,
  COALESCE(p.propina, 0)    AS propina,
  w.status                  AS estado
FROM rdb.v_waitry_pedidos w
LEFT JOIN LATERAL (
  SELECT SUM(tip) AS propina FROM rdb.waitry_pagos WHERE order_id = w.order_id
) p ON true
UNION ALL
SELECT
  'pos'::text               AS source,
  c.id::text                AS venta_ref,
  COALESCE(c.cerrada_at, c.abierta_at) AS fecha,
  pg.corte_id,
  c.ubicacion,
  c.total,
  COALESCE(pg.propina, 0)   AS propina,
  c.estado
FROM rdb.pos_cuentas c
LEFT JOIN LATERAL (
  SELECT MIN(corte_id::text)::uuid AS corte_id, SUM(propina) AS propina
  FROM rdb.pos_pagos WHERE cuenta_id = c.id AND reversa_de IS NULL
) pg ON true
WHERE c.estado = 'pagada';

-- -----------------------------------------------------------------------------
-- 7) RLS: lectura empresa-scoped (set-membership + InitPlan); escritura deny-all
--    (solo RPCs SECURITY DEFINER y service_role).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  pred text := '(empresa_id IN (SELECT core.fn_current_empresa_ids()) OR (SELECT core.fn_is_admin()))';
BEGIN
  FOREACH t IN ARRAY ARRAY['pos_estaciones', 'pos_operadores', 'pos_cuentas',
                           'pos_rondas', 'pos_items', 'pos_pagos', 'pos_eventos'] LOOP
    EXECUTE format('ALTER TABLE rdb.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I_select ON rdb.%I FOR SELECT TO authenticated USING %s',
                   t, t, pred);
    EXECUTE format('GRANT SELECT ON rdb.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON rdb.%I TO service_role', t);
  END LOOP;
END $$;

-- El hash del PIN jamás viaja al cliente.
REVOKE SELECT (pin_hash) ON rdb.pos_operadores FROM authenticated;

GRANT SELECT ON rdb.v_ventas_canonicas TO authenticated;
GRANT SELECT ON rdb.v_ventas_canonicas TO service_role;

-- -----------------------------------------------------------------------------
-- 8) Realtime para el KDS (items y cuentas)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE rdb.pos_items;
  ALTER PUBLICATION supabase_realtime ADD TABLE rdb.pos_cuentas;
EXCEPTION WHEN undefined_object OR duplicate_object THEN
  NULL; -- publication ausente (shadow) o tablas ya agregadas
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
