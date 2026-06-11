-- ╭─ 20260611174917_cxc_abono_institucion_detona_fase12 ─╮
-- El dinero es el evento; la fase es la consecuencia (diseño de Beto,
-- 2026-06-11, post-cutover de ventas).
--
-- En Coda, al detonarse un crédito el equipo capturaba el depósito a mano
-- en "Depositos Clientes" Y palomeaba la fase. En BSOP eso eran dos
-- capturas en dos módulos (Cobranza + pantalla F12 de ventas) con riesgo
-- de que una se olvidara: la pantalla F12 solo guarda monto_detonado en
-- la venta y NO registra el abono en CxC, así que la cuadratura (Valor
-- Real Venta Dilesa = depósitos − cheque + pagaré) quedaba coja para
-- siempre en ventas nuevas (caso Luna Heredia, 2026-06-11).
--
-- Ahora: Cobranza registra el abono de la institución (un solo registro,
-- un solo lugar) y la venta avanza sola a Detonada (12):
--   - Trigger AFTER INSERT en erp.cxc_pago_aplicaciones.
--   - Condiciones: pago.fuente='institucion' (no soft-deleted), cargo de
--     origen venta_dilesa, venta activa en fase 11 (Escriturada).
--   - Efectos: fila en venta_fases (Detonada, fecha del pago, registrado
--     por quien capturó el abono) + fase_actual/posicion + monto_detonado
--     /fecha_detonacion + copia del comprobante del pago al expediente de
--     la venta (rol imagen_detonacion, mismo archivo en Storage).
--   - Si la venta ya va en fase ≥ 12: solo completa monto_detonado/fecha
--     si están vacíos (no toca la fase).
--   - Si la venta va en fase < 11 (depósito anticipado): no hace nada —
--     la pantalla F12 queda como respaldo manual (mismo patrón que F8
--     magic-link y F16 encuesta).
--
-- FAIL-OPEN: cualquier error del auto-cierre se degrada a WARNING y el
-- registro del abono procede — el flujo de dinero de Cobranza nunca se
-- bloquea por esta automatización.
--
-- La cancelación de un pago (cxc_pago_cancelar) NO revierte la fase:
-- regresar fases es flujo manual de Dirección con bitácora.

BEGIN;

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

  -- Venta ya detonada (o más allá): solo completar datos faltantes.
  IF COALESCE(v_venta.fase_posicion, 0) >= 12 THEN
    UPDATE dilesa.ventas
    SET fecha_detonacion = COALESCE(fecha_detonacion, v_pago.fecha),
        monto_detonado = COALESCE(monto_detonado, v_pago.monto_total),
        updated_at = now()
    WHERE id = v_venta.id
      AND (fecha_detonacion IS NULL OR monto_detonado IS NULL);
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

  -- Comprobante del abono → expediente de la venta (rol imagen_detonacion,
  -- misma URL de Storage; no duplica el archivo).
  IF v_pago.comprobante_adjunto_id IS NOT NULL THEN
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
      );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'fn_detonar_venta_desde_cxc fallo (pago %, cargo %): %',
    NEW.pago_id, NEW.cargo_id, SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION dilesa.fn_detonar_venta_desde_cxc() IS
  'Abono CxC de institución aplicado a cargo de una venta en F11 → cierra Detonada (12) + datos + comprobante al expediente. Fail-open: nunca bloquea el registro del pago.';

DROP TRIGGER IF EXISTS trg_detonar_venta_desde_cxc ON erp.cxc_pago_aplicaciones;
CREATE TRIGGER trg_detonar_venta_desde_cxc
  AFTER INSERT ON erp.cxc_pago_aplicaciones
  FOR EACH ROW EXECUTE FUNCTION dilesa.fn_detonar_venta_desde_cxc();

COMMIT;
