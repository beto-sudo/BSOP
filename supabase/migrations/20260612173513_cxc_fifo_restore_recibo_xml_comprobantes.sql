-- ╭─ 20260612173513_cxc_fifo_restore_recibo_xml_comprobantes ─╮
-- Tres arreglos al ciclo del abono CxC (caso Ahumada Castillo + enganche
-- exentado, chat 2026-06-12):
--
-- 1. RESTAURA el FIFO sin fuente en erp.cxc_pago_registrar.
--    20260601180854_erp_cxc_fifo_sin_fuente decidió que `fuente` es SOLO
--    etiqueta de reportería, nunca barrera del cálculo (un abono baja el
--    saldo TOTAL de la venta). 20260601201000_fix_cxc_pago_movimiento_tipo
--    se basó en la versión anterior del RPC y reintrodujo por accidente
--    `AND fuente_esperada = p_fuente`. Efecto de la regresión: en ventas
--    con enganche exentado (el crédito lo cubre — Infonavit deposita el
--    valor completo), el abono de institución dejaba el cargo de enganche
--    pendiente para siempre + saldo a favor fantasma del mismo monto.
--    Esta versión = la del fix (movimiento bancario tipo 'abono' + audit
--    log) CON el FIFO sin fuente. Las dos decisiones, fusionadas.
--
-- 2. UNIQUE parcial sobre uuid_sat: el recibo de caja (CFDI de CONTPAQi)
--    ahora se adjunta en XML al registrar el abono y sus datos se extraen
--    en lugar de capturarse a mano (decisión Beto 2026-06-12). El folio
--    fiscal no puede registrarse dos veces. Verificado 2026-06-12: cero
--    duplicados vivos en prod.
--
-- 3. Comprobantes → expediente, de verdad. fn_detonar_venta_desde_cxc
--    copiaba el comprobante del abono SOLO si cxc_pagos.comprobante_
--    adjunto_id venía seteado al momento de aplicar — pero el drawer sube
--    el comprobante DESPUÉS de crear el pago (deferred upload, ADR-022),
--    así que en el camino real nunca se copiaba nada. Además copiaba a lo
--    más UNO (NOT EXISTS por rol), insuficiente con coacreditados
--    (Infonavit Unamos = 2 depósitos, 2 comprobantes). Ahora: helper
--    fn_copiar_comprobante_detonacion con dedupe por adjunto de origen
--    (N comprobantes) + trigger AFTER UPDATE OF comprobante_adjunto_id
--    que cubre el deferred upload.
--
-- La pantalla F12 manual queda solo-Dirección (cambio de UI en el mismo
-- PR); el camino normal sigue siendo: abono de institución en Cobranza →
-- la fase se cierra sola (20260611174917).

BEGIN;

-- ─── 1. cxc_pago_registrar — FIFO sin fuente restaurado ────────────────

CREATE OR REPLACE FUNCTION erp.cxc_pago_registrar(
  p_empresa_id uuid,
  p_persona_id uuid,
  p_origen_id uuid,
  p_monto numeric,
  p_fecha date DEFAULT CURRENT_DATE,
  p_fuente text DEFAULT 'cliente',
  p_forma_pago text DEFAULT NULL,
  p_referencia text DEFAULT NULL,
  p_cuenta_bancaria_id uuid DEFAULT NULL,
  p_uuid_sat text DEFAULT NULL,
  p_comprobante_adjunto_id uuid DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_auto_aplicar boolean DEFAULT true
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = erp, public
AS $$
DECLARE
  v_pago_id uuid;
  v_restante numeric(14, 2);
  v_aplicar numeric(14, 2);
  c record;
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto del abono debe ser > 0';
  END IF;

  INSERT INTO erp.cxc_pagos (
    empresa_id, persona_id, origen_tipo, origen_id, fecha, monto_total,
    fuente, forma_pago, referencia, cuenta_bancaria_id, uuid_sat,
    comprobante_adjunto_id, notas
  ) VALUES (
    p_empresa_id, p_persona_id, 'venta_dilesa', p_origen_id, p_fecha, p_monto,
    p_fuente, p_forma_pago, p_referencia, p_cuenta_bancaria_id, p_uuid_sat,
    p_comprobante_adjunto_id, p_notas
  ) RETURNING id INTO v_pago_id;

  -- Auto-aplicación FIFO a los cargos abiertos de ESA venta, del más
  -- viejo al más nuevo, SIN separar por fuente (20260601180854): la
  -- fuente es etiqueta de reportería; un abono baja el saldo total.
  -- Cubre el enganche exentado: si la institución deposita el valor
  -- completo, su abono salda también el cargo del enganche.
  IF p_auto_aplicar THEN
    v_restante := p_monto;
    FOR c IN
      SELECT id, saldo
        FROM erp.cxc_cargos
       WHERE origen_tipo = 'venta_dilesa'
         AND origen_id = p_origen_id
         AND estado <> 'cancelado'
         AND deleted_at IS NULL
         AND saldo > 0
       ORDER BY fecha_vencimiento ASC NULLS LAST, numero ASC
    LOOP
      EXIT WHEN v_restante <= 0;
      v_aplicar := LEAST(v_restante, c.saldo);
      INSERT INTO erp.cxc_pago_aplicaciones (empresa_id, pago_id, cargo_id, monto_aplicado)
      VALUES (p_empresa_id, v_pago_id, c.id, v_aplicar);
      v_restante := v_restante - v_aplicar;
    END LOOP;
  END IF;

  -- Movimiento bancario (gancho de tesorería, ADR-037 D4). Solo si se
  -- conoce la cuenta donde cayó el abono. tipo='abono' = dinero que entra
  -- (el CHECK de la columna solo permite 'cargo'/'abono').
  IF p_cuenta_bancaria_id IS NOT NULL THEN
    INSERT INTO erp.movimientos_bancarios (
      empresa_id, cuenta_id, tipo, monto, fecha, descripcion, referencia,
      referencia_tipo, referencia_id, conciliado
    ) VALUES (
      p_empresa_id, p_cuenta_bancaria_id, 'abono', p_monto, p_fecha,
      'Abono CxC', p_referencia, 'cxc_pago', v_pago_id, false
    );
  END IF;

  INSERT INTO core.audit_log (empresa_id, usuario_id, accion, tabla, registro_id, datos_nuevos)
  VALUES (p_empresa_id, auth.uid(), 'cxc_pago_registrado', 'erp.cxc_pagos', v_pago_id,
    jsonb_build_object('monto', p_monto, 'fuente', p_fuente, 'origen_id', p_origen_id,
      'auto_aplicar', p_auto_aplicar, 'uuid_sat', p_uuid_sat));

  RETURN v_pago_id;
END;
$$;

COMMENT ON FUNCTION erp.cxc_pago_registrar IS
  'Registra un abono CxC y lo auto-aplica FIFO a los cargos abiertos de la venta SIN filtrar por fuente (fuente = etiqueta de reportería, 20260601180854). Emite movimiento bancario si hay cuenta. uuid_sat = folio fiscal del recibo de caja (CFDI).';

-- ─── 2. Folio fiscal único por empresa (recibos vivos) ─────────────────

CREATE UNIQUE INDEX IF NOT EXISTS cxc_pagos_empresa_uuid_sat_uk
  ON erp.cxc_pagos (empresa_id, uuid_sat)
  WHERE uuid_sat IS NOT NULL AND deleted_at IS NULL;

COMMENT ON INDEX erp.cxc_pagos_empresa_uuid_sat_uk IS
  'Un recibo de caja (folio fiscal SAT) no puede registrarse dos veces como abono vivo.';

-- ─── 3. Copia de comprobantes al expediente (N, con dedupe) ────────────

CREATE OR REPLACE FUNCTION dilesa.fn_copiar_comprobante_detonacion(p_pago_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = dilesa, erp, public
AS $$
DECLARE
  v_pago erp.cxc_pagos%ROWTYPE;
  v_venta dilesa.ventas%ROWTYPE;
BEGIN
  SELECT * INTO v_pago
  FROM erp.cxc_pagos
  WHERE id = p_pago_id AND deleted_at IS NULL;
  IF NOT FOUND
     OR v_pago.fuente <> 'institucion'
     OR v_pago.comprobante_adjunto_id IS NULL
     OR v_pago.origen_tipo <> 'venta_dilesa'
     OR v_pago.origen_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_venta
  FROM dilesa.ventas
  WHERE id = v_pago.origen_id AND deleted_at IS NULL;
  -- Solo ventas ya detonadas: antes de F12 el comprobante vive en el
  -- abono; al detonarse, fn_detonar_venta_desde_cxc llama este helper.
  IF NOT FOUND OR COALESCE(v_venta.fase_posicion, 0) < 12 THEN
    RETURN;
  END IF;

  -- Dedupe por adjunto de ORIGEN (no por rol): con coacreditados hay 2+
  -- depósitos → 2+ comprobantes, todos van al expediente; el mismo
  -- comprobante no se copia dos veces. Misma URL de Storage (no duplica
  -- el archivo).
  INSERT INTO erp.adjuntos
    (empresa_id, entidad_tipo, entidad_id, uploaded_by, nombre, url,
     tipo_mime, tamano_bytes, metadata, rol)
  SELECT a.empresa_id, 'venta', v_venta.id, a.uploaded_by, a.nombre, a.url,
         a.tipo_mime, a.tamano_bytes,
         COALESCE(a.metadata, '{}'::jsonb) || jsonb_build_object(
           'auto', 'detonacion_cxc',
           'copiado_de_adjunto_id', a.id,
           'cxc_pago_id', v_pago.id
         ),
         'imagen_detonacion'
  FROM erp.adjuntos a
  WHERE a.id = v_pago.comprobante_adjunto_id
    AND NOT EXISTS (
      SELECT 1 FROM erp.adjuntos x
      WHERE x.entidad_tipo = 'venta'
        AND x.entidad_id = v_venta.id
        AND x.rol = 'imagen_detonacion'
        AND x.metadata->>'copiado_de_adjunto_id' = a.id::text
    );
END;
$$;

COMMENT ON FUNCTION dilesa.fn_copiar_comprobante_detonacion(uuid) IS
  'Copia el comprobante de un abono de institución al expediente de su venta detonada (rol imagen_detonacion). N comprobantes con dedupe por adjunto de origen (coacreditados = varios depósitos).';

-- ─── 4. fn_detonar_venta_desde_cxc v2 — usa el helper ──────────────────

CREATE OR REPLACE FUNCTION dilesa.fn_detonar_venta_desde_cxc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = dilesa, erp, public
AS $$
DECLARE
  v_pago erp.cxc_pagos%ROWTYPE;
  v_cargo erp.cxc_cargos%ROWTYPE;
  v_venta dilesa.ventas%ROWTYPE;
BEGIN
  SELECT * INTO v_pago
  FROM erp.cxc_pagos
  WHERE id = NEW.pago_id AND deleted_at IS NULL;
  IF NOT FOUND OR v_pago.fuente <> 'institucion' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_cargo
  FROM erp.cxc_cargos
  WHERE id = NEW.cargo_id AND deleted_at IS NULL;
  IF NOT FOUND OR v_cargo.origen_tipo <> 'venta_dilesa' OR v_cargo.origen_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_venta
  FROM dilesa.ventas
  WHERE id = v_cargo.origen_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Venta ya detonada (o más allá): completar datos faltantes y copiar
  -- el comprobante si existe (2º depósito de coacreditados).
  IF COALESCE(v_venta.fase_posicion, 0) >= 12 THEN
    UPDATE dilesa.ventas
    SET fecha_detonacion = COALESCE(fecha_detonacion, v_pago.fecha),
        monto_detonado = COALESCE(monto_detonado, v_pago.monto_total),
        updated_at = now()
    WHERE id = v_venta.id
      AND (fecha_detonacion IS NULL OR monto_detonado IS NULL);
    PERFORM dilesa.fn_copiar_comprobante_detonacion(v_pago.id);
    RETURN NEW;
  END IF;

  -- Solo se detona desde Escriturada (11) — mismo enforcement que la
  -- pantalla F12. Depósitos más tempranos no avanzan la fase.
  IF COALESCE(v_venta.fase_posicion, 0) <> 11 THEN
    RETURN NEW;
  END IF;

  -- Cierra F12 (idempotente: el partial unique venta_fases_uk protege la
  -- carrera; el NOT EXISTS evita el error en el camino normal — p.ej. un
  -- pago aplicado a varios cargos de la misma venta dispara N veces).
  INSERT INTO dilesa.venta_fases
    (empresa_id, venta_id, fase, posicion, fecha, registrado_por, notas)
  SELECT v_venta.empresa_id, v_venta.id, 'Detonada', 12, v_pago.fecha,
         v_pago.registrado_por,
         'Cierre automático: abono de institución registrado en Cobranza'
  WHERE NOT EXISTS (
    SELECT 1 FROM dilesa.venta_fases
    WHERE venta_id = v_venta.id AND fase = 'Detonada' AND deleted_at IS NULL
  );

  UPDATE dilesa.ventas
  SET fase_actual = 'Detonada',
      fase_posicion = 12,
      fecha_detonacion = v_pago.fecha,
      monto_detonado = v_pago.monto_total,
      updated_at = now()
  WHERE id = v_venta.id AND fase_posicion = 11;

  -- Comprobante del abono → expediente (si ya está seteado; el deferred
  -- upload del drawer lo setea después y lo cubre el trigger de UPDATE).
  PERFORM dilesa.fn_copiar_comprobante_detonacion(v_pago.id);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_detonar_venta_desde_cxc fallo (pago %, cargo %): %',
    NEW.pago_id, NEW.cargo_id, SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION dilesa.fn_detonar_venta_desde_cxc() IS
  'Abono CxC de institución aplicado a cargo de una venta en F11 → cierra Detonada (12) + datos + comprobante(s) al expediente vía fn_copiar_comprobante_detonacion. Fail-open: nunca bloquea el registro del pago.';

-- ─── 5. Deferred upload: comprobante seteado después del registro ──────

CREATE OR REPLACE FUNCTION dilesa.fn_comprobante_cxc_actualizado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = dilesa, erp, public
AS $$
BEGIN
  IF NEW.comprobante_adjunto_id IS NOT NULL AND NEW.fuente = 'institucion' THEN
    PERFORM dilesa.fn_copiar_comprobante_detonacion(NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_comprobante_cxc_actualizado fallo (pago %): %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION dilesa.fn_comprobante_cxc_actualizado() IS
  'Al setearse el comprobante de un abono de institución (deferred upload del drawer), lo copia al expediente de la venta si ya está detonada. Fail-open.';

DROP TRIGGER IF EXISTS trg_comprobante_cxc_actualizado ON erp.cxc_pagos;
CREATE TRIGGER trg_comprobante_cxc_actualizado
  AFTER UPDATE OF comprobante_adjunto_id ON erp.cxc_pagos
  FOR EACH ROW
  WHEN (NEW.comprobante_adjunto_id IS DISTINCT FROM OLD.comprobante_adjunto_id)
  EXECUTE FUNCTION dilesa.fn_comprobante_cxc_actualizado();

NOTIFY pgrst, 'reload schema';

COMMIT;
