-- Smoke test S1 POS (shadow only). Ejercita el ciclo completo y valida
-- invariantes con ASSERT. Corre en transacción y hace ROLLBACK al final.
BEGIN;

DO $smoke$
DECLARE
  v_empresa   uuid;
  v_persona   uuid;
  v_empleado  uuid;
  v_persona2  uuid;
  v_empleado2 uuid; -- autorizador
  v_almacen   uuid;
  v_cat_coc   uuid;
  v_cat_no    uuid;
  v_prod_coc  uuid; -- va a cocina (con receta)
  v_insumo    uuid;
  v_prod_no   uuid; -- no cocina (renta cancha)
  v_estacion  uuid;
  v_corte     uuid;
  v_cuenta    uuid;
  v_cuenta2   uuid;
  v_ronda     uuid;
  v_ronda2    uuid;
  v_item_coc  uuid;
  v_item_no   uuid;
  v_action    uuid;
  v_n         integer;
  v_total     numeric;
  v_salidas   numeric;
  r_item      RECORD;
BEGIN
  -- ── Seed mínimo ──────────────────────────────────────────────────────────
  INSERT INTO core.empresas (nombre, slug) VALUES ('RDB-TEST', 'rdb-test')
    RETURNING id INTO v_empresa;
  INSERT INTO erp.personas (empresa_id, nombre, apellido_paterno)
    VALUES (v_empresa, 'Laisha', 'Test') RETURNING id INTO v_persona;
  INSERT INTO erp.empleados (empresa_id, persona_id) VALUES (v_empresa, v_persona)
    RETURNING id INTO v_empleado;
  INSERT INTO erp.personas (empresa_id, nombre, apellido_paterno)
    VALUES (v_empresa, 'Gerente', 'Test') RETURNING id INTO v_persona2;
  INSERT INTO erp.empleados (empresa_id, persona_id) VALUES (v_empresa, v_persona2)
    RETURNING id INTO v_empleado2;
  INSERT INTO erp.almacenes (empresa_id, nombre) VALUES (v_empresa, 'Central')
    RETURNING id INTO v_almacen;

  INSERT INTO erp.categorias_producto (empresa_id, nombre, va_a_cocina)
    VALUES (v_empresa, 'Cocina', true) RETURNING id INTO v_cat_coc;
  INSERT INTO erp.categorias_producto (empresa_id, nombre, va_a_cocina)
    VALUES (v_empresa, 'Canchas', false) RETURNING id INTO v_cat_no;

  INSERT INTO erp.productos (empresa_id, categoria_id, nombre, unidad)
    VALUES (v_empresa, v_cat_coc, 'Michelada', 'pieza') RETURNING id INTO v_prod_coc;
  INSERT INTO erp.productos (empresa_id, categoria_id, nombre, unidad, unidad_base, contenido)
    VALUES (v_empresa, v_cat_coc, 'Cerveza Botella', 'botella', 'ml', 355)
    RETURNING id INTO v_insumo;
  INSERT INTO erp.producto_receta (empresa_id, producto_venta_id, insumo_id, cantidad, unidad)
    VALUES (v_empresa, v_prod_coc, v_insumo, 355, 'ml');
  INSERT INTO erp.productos (empresa_id, categoria_id, nombre, unidad, inventariable)
    VALUES (v_empresa, v_cat_no, 'Renta Cancha Padel', 'servicio', false)
    RETURNING id INTO v_prod_no;

  INSERT INTO erp.productos_precios (empresa_id, producto_id, precio_venta)
    VALUES (v_empresa, v_prod_coc, 120), (v_empresa, v_prod_no, 200),
           (v_empresa, v_insumo, 60);

  INSERT INTO rdb.pos_estaciones (empresa_id, nombre, tipo)
    VALUES (v_empresa, 'Tiendita', 'mostrador') RETURNING id INTO v_estacion;
  INSERT INTO rdb.pos_operadores (empresa_id, empleado_id, pin_hash)
    VALUES (v_empresa, v_empleado, extensions.crypt('1234', extensions.gen_salt('bf')));
  INSERT INTO rdb.pos_operadores (empresa_id, empleado_id, pin_hash, puede_autorizar)
    VALUES (v_empresa, v_empleado2, extensions.crypt('9999', extensions.gen_salt('bf')), true);
  INSERT INTO erp.cortes_caja (empresa_id, estado) VALUES (v_empresa, 'abierto')
    RETURNING id INTO v_corte;

  -- ── 1) PIN inválido truena ───────────────────────────────────────────────
  BEGIN
    PERFORM rdb.fn_pos_abrir_cuenta(v_estacion, '0000', gen_random_uuid());
    RAISE EXCEPTION 'FALLO: PIN inválido no tronó';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO%' THEN RAISE; END IF;
  END;

  -- ── 2) Abrir cuenta + idempotencia de apertura ──────────────────────────
  v_action := gen_random_uuid();
  v_cuenta := rdb.fn_pos_abrir_cuenta(v_estacion, '1234', v_action, 'Tiendita');
  v_cuenta2 := rdb.fn_pos_abrir_cuenta(v_estacion, '1234', v_action, 'Tiendita');
  ASSERT v_cuenta = v_cuenta2, 'idempotencia de apertura falló (doble-tap creó 2 cuentas)';
  SELECT COUNT(*) INTO v_n FROM rdb.pos_cuentas WHERE empresa_id = v_empresa;
  ASSERT v_n = 1, 'debería existir exactamente 1 cuenta';

  -- ── 3) Ronda con item de cocina + item directo; idempotencia de ronda ───
  v_action := gen_random_uuid();
  v_ronda := rdb.fn_pos_agregar_ronda(v_cuenta, '1234', v_action, jsonb_build_array(
    jsonb_build_object('producto_id', v_prod_coc, 'cantidad', 2),
    jsonb_build_object('producto_id', v_prod_no, 'cantidad', 1)
  ));
  v_ronda2 := rdb.fn_pos_agregar_ronda(v_cuenta, '1234', v_action, jsonb_build_array(
    jsonb_build_object('producto_id', v_prod_coc, 'cantidad', 2)
  ));
  ASSERT v_ronda = v_ronda2, 'idempotencia de ronda falló';
  SELECT COUNT(*) INTO v_n FROM rdb.pos_items WHERE cuenta_id = v_cuenta;
  ASSERT v_n = 2, format('esperaba 2 items, hay %s', v_n);

  SELECT id INTO v_item_coc FROM rdb.pos_items WHERE cuenta_id = v_cuenta AND va_a_cocina;
  SELECT id INTO v_item_no  FROM rdb.pos_items WHERE cuenta_id = v_cuenta AND NOT va_a_cocina;

  -- Item no-cocina nace entregado y ya descontó… (renta no tiene receta:
  -- fallback legacy descuenta el producto mismo — es no-inventariable, el
  -- levantamiento lo ignora; documentado).
  ASSERT (SELECT estado FROM rdb.pos_items WHERE id = v_item_no) = 'entregado',
    'item sin cocina debe nacer entregado';
  ASSERT (SELECT estado FROM rdb.pos_items WHERE id = v_item_coc) = 'capturado',
    'item de cocina debe nacer capturado';

  -- Totales server-side: 2×120 + 1×200 = 440
  SELECT total INTO v_total FROM rdb.pos_cuentas WHERE id = v_cuenta;
  ASSERT v_total = 440, format('total esperado 440, es %s', v_total);

  -- ── 4) Cobrar con pendientes de cocina truena ────────────────────────────
  BEGIN
    PERFORM rdb.fn_pos_cobrar(v_cuenta, '1234', gen_random_uuid(),
      jsonb_build_array(jsonb_build_object('metodo', 'efectivo', 'monto', 440)));
    RAISE EXCEPTION 'FALLO: cobró con items sin entregar';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO%' THEN RAISE; END IF;
  END;

  -- ── 5) Flujo KDS: enviar → listo → entregado; inventario descuenta ──────
  PERFORM rdb.fn_pos_enviar_cocina(v_cuenta, '1234', gen_random_uuid());
  ASSERT (SELECT estado FROM rdb.pos_items WHERE id = v_item_coc) = 'en_cocina',
    'enviar_cocina no movió el item';
  PERFORM rdb.fn_pos_kds_marcar(v_item_coc, 'listo', gen_random_uuid());
  PERFORM rdb.fn_pos_kds_marcar(v_item_coc, 'entregado', gen_random_uuid());

  -- Receta: 2 micheladas × 355 ml = 2 botellas (unidad_base ml, contenido 355)
  SELECT COALESCE(SUM(cantidad), 0) INTO v_salidas
  FROM erp.movimientos_inventario
  WHERE referencia_tipo = 'venta_pos' AND referencia_id = v_item_coc
    AND producto_id = v_insumo;
  ASSERT v_salidas = 2, format('descuento por receta esperado 2 botellas, es %s', v_salidas);

  -- ── 6) Edición post-cocina bloqueada ─────────────────────────────────────
  BEGIN
    UPDATE rdb.pos_items SET cantidad = 5 WHERE id = v_item_coc;
    RAISE EXCEPTION 'FALLO: permitió editar item entregado';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO%' THEN RAISE; END IF;
  END;

  -- ── 7) Cobro exitoso (mixto, con propina y cambio) ───────────────────────
  PERFORM rdb.fn_pos_cobrar(v_cuenta, '1234', gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('metodo', 'tarjeta', 'monto', 240, 'propina', 30, 'referencia', '4242'),
    jsonb_build_object('metodo', 'efectivo', 'monto', 200, 'recibido', 500)
  ));
  ASSERT (SELECT estado FROM rdb.pos_cuentas WHERE id = v_cuenta) = 'pagada', 'cuenta no quedó pagada';
  ASSERT (SELECT cambio FROM rdb.pos_pagos WHERE cuenta_id = v_cuenta AND metodo = 'efectivo') = 300,
    'cambio mal calculado';
  ASSERT (SELECT COUNT(*) FROM rdb.pos_pagos WHERE cuenta_id = v_cuenta AND corte_id = v_corte) = 2,
    'pagos no quedaron ligados al corte activo';

  -- ── 8) Cuenta pagada es inmutable; pagos append-only ─────────────────────
  BEGIN
    UPDATE rdb.pos_cuentas SET ubicacion = 'X' WHERE id = v_cuenta;
    RAISE EXCEPTION 'FALLO: permitió mutar cuenta pagada';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO%' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM rdb.pos_pagos WHERE cuenta_id = v_cuenta;
    RAISE EXCEPTION 'FALLO: permitió borrar pago';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO%' THEN RAISE; END IF;
  END;

  -- ── 9) Void y cancelación con reversa de inventario ─────────────────────
  v_cuenta2 := rdb.fn_pos_abrir_cuenta(v_estacion, '1234', gen_random_uuid(), 'Pádel 1');
  PERFORM rdb.fn_pos_agregar_ronda(v_cuenta2, '1234', gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('producto_id', v_prod_coc, 'cantidad', 1)
  ));
  SELECT id INTO v_item_coc FROM rdb.pos_items WHERE cuenta_id = v_cuenta2;
  -- void pre-cocina: sin autorizador, sin salida de inventario
  PERFORM rdb.fn_pos_void_item(v_item_coc, '1234', 'cliente se arrepintió', gen_random_uuid());
  ASSERT (SELECT estado FROM rdb.pos_items WHERE id = v_item_coc) = 'void', 'void pre-cocina falló';
  ASSERT (SELECT COUNT(*) FROM erp.movimientos_inventario
          WHERE referencia_tipo = 'venta_pos' AND referencia_id = v_item_coc) = 0,
    'void no debe dejar salida de inventario';
  ASSERT (SELECT total FROM rdb.pos_cuentas WHERE id = v_cuenta2) = 0,
    'total no se recalculó tras void';
  PERFORM rdb.fn_pos_cancelar_cuenta(v_cuenta2, '1234', 'prueba', gen_random_uuid());
  ASSERT (SELECT estado FROM rdb.pos_cuentas WHERE id = v_cuenta2) = 'cancelada';

  -- ── 10) Merma post-cocina exige autorizador y CONSERVA la salida ─────────
  v_cuenta2 := rdb.fn_pos_abrir_cuenta(v_estacion, '1234', gen_random_uuid(), 'Pádel 2');
  PERFORM rdb.fn_pos_agregar_ronda(v_cuenta2, '1234', gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('producto_id', v_prod_coc, 'cantidad', 1)
  ));
  SELECT id INTO v_item_coc FROM rdb.pos_items WHERE cuenta_id = v_cuenta2;
  PERFORM rdb.fn_pos_enviar_cocina(v_cuenta2, '1234', gen_random_uuid());
  BEGIN
    PERFORM rdb.fn_pos_void_item(v_item_coc, '1234', 'se cayó', gen_random_uuid());
    RAISE EXCEPTION 'FALLO: merma sin autorizador pasó';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO%' THEN RAISE; END IF;
  END;
  PERFORM rdb.fn_pos_void_item(v_item_coc, '1234', 'se cayó', gen_random_uuid(), '9999');
  ASSERT (SELECT estado FROM rdb.pos_items WHERE id = v_item_coc) = 'void_merma';
  ASSERT (SELECT COUNT(*) FROM erp.movimientos_inventario
          WHERE referencia_tipo = 'venta_pos' AND referencia_id = v_item_coc) = 1,
    'merma debe conservar la salida de inventario';

  -- ── 11) Descuento > umbral exige autorizador ─────────────────────────────
  v_cuenta2 := rdb.fn_pos_abrir_cuenta(v_estacion, '1234', gen_random_uuid(), 'Pádel 3');
  BEGIN
    PERFORM rdb.fn_pos_agregar_ronda(v_cuenta2, '1234', gen_random_uuid(), jsonb_build_array(
      jsonb_build_object('producto_id', v_prod_no, 'cantidad', 1, 'descuento_pct', 50)
    ));
    RAISE EXCEPTION 'FALLO: descuento 50%% sin autorizador pasó';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO%' THEN RAISE; END IF;
  END;
  PERFORM rdb.fn_pos_agregar_ronda(v_cuenta2, '1234', gen_random_uuid(), jsonb_build_array(
    jsonb_build_object('producto_id', v_prod_no, 'cantidad', 1, 'descuento_pct', 50,
                       'descuento_razon', 'promo torneo')
  ), '9999');
  ASSERT (SELECT total FROM rdb.pos_cuentas WHERE id = v_cuenta2) = 100,
    'total con descuento 50% de 200 debe ser 100';

  -- ── 12) Vista canónica refleja la venta POS ──────────────────────────────
  SELECT COUNT(*) INTO v_n FROM rdb.v_ventas_canonicas
  WHERE source = 'pos' AND venta_ref = v_cuenta::text;
  ASSERT v_n = 1, 'la cuenta pagada debe aparecer en v_ventas_canonicas';

  -- ── 13) Audit trail poblado ──────────────────────────────────────────────
  SELECT COUNT(*) INTO v_n FROM rdb.pos_eventos WHERE empresa_id = v_empresa;
  ASSERT v_n >= 10, format('esperaba >=10 eventos de auditoría, hay %s', v_n);
  ASSERT (SELECT COUNT(*) FROM rdb.pos_eventos
          WHERE empresa_id = v_empresa AND evento = 'cuenta_pagada'
            AND UPPER(actor_empleado_nombre) = 'LAISHA TEST') = 1,
    'evento de cobro debe atribuirse a Laisha Test';

  RAISE NOTICE '✅ SMOKE TEST POS S1: los 13 bloques pasaron';
END;
$smoke$;

ROLLBACK;
