-- ============================================================
-- RDB · Cambio de hostess: Caja Leslie → Caja Elda + baja Laisha
-- ------------------------------------------------------------
-- Contexto: se dieron de baja las usuarias Leslie y Laisha. Entra
-- Elda como nueva hostess. El saldo en efectivo de Caja Leslie pasa
-- a una Caja Elda nueva (preservando el historial de cada quien);
-- Caja Laisha se retira y se cierra en cero (su efectivo se maneja
-- administrativamente aparte, NO va a Elda).
--
-- Mecánica del saldo en RDB: no hay columna "saldo". El efectivo que
-- arrastra una caja es el `efectivo_contado` del último corte CERRADO
-- de ese `caja_nombre`, que se hereda como `efectivo_inicial` en la
-- siguiente apertura (ver app/rdb/cortes/actions.ts → abrirCaja).
-- Por eso el traspaso se hace con cortes 'cerrado' + movimientos de
-- caja (doble partida auditable: salida en la vieja = entrada en Elda).
--
-- Montos confirmados por Beto (último cierre de cada caja):
--   Caja Leslie  = $3,043.00  → entra a Caja Elda
--   Caja Laisha  = $3,066.00  → retiro (manejo aparte), Caja en cero
--
-- Los cortes se insertan con estado='cerrado': el trigger
-- erp.handle_sc_corte_on_open() solo actúa sobre aperturas
-- ('abierto'), así que NO barre pedidos huérfanos aquí.
--
-- Idempotente y robusto a Preview/shadow: si la empresa RDB no existe
-- (DB fresca de CI) el bloque hace early-return → no-op. Pura DML, sin
-- DDL → no cambia SCHEMA_REF.md ni types.
-- ============================================================

BEGIN;

DO $mig$
DECLARE
  v_empresa      uuid := 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid; -- RDB
  v_corte_elda   uuid;
  v_corte_leslie uuid;
  v_corte_laisha uuid;
BEGIN
  -- Solo aplica en entornos con la empresa RDB (producción).
  IF NOT EXISTS (SELECT 1 FROM core.empresas WHERE id = v_empresa) THEN
    RAISE NOTICE 'Empresa RDB ausente (shadow/preview): skip.';
    RETURN;
  END IF;

  -- ── 1. Alta de Caja Elda ───────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM erp.cajas
    WHERE empresa_id = v_empresa AND nombre = 'Caja Elda'
  ) THEN
    INSERT INTO erp.cajas (empresa_id, nombre, activo)
    VALUES (v_empresa, 'Caja Elda', true);
  END IF;

  -- ── 2. Retiro de cajas de hostess salientes ────────────────
  UPDATE erp.cajas
     SET activo = false, updated_at = now()
   WHERE empresa_id = v_empresa
     AND nombre IN ('Caja Leslie', 'Caja Laisha')
     AND activo = true;

  -- ── 3a. Entrada del saldo a Caja Elda ($3,043) ─────────────
  IF NOT EXISTS (
    SELECT 1 FROM erp.cortes_caja
    WHERE empresa_id = v_empresa
      AND caja_nombre = 'Caja Elda'
      AND corte_nombre = 'Traspaso saldo inicial (alta hostess)'
  ) THEN
    INSERT INTO erp.cortes_caja (
      empresa_id, caja_nombre, corte_nombre, tipo, estado,
      efectivo_inicial, efectivo_contado, total_efectivo,
      fecha_operativa, abierto_at, cerrado_at, observaciones
    ) VALUES (
      v_empresa, 'Caja Elda', 'Traspaso saldo inicial (alta hostess)',
      'especial', 'cerrado', 0, 3043, 0,
      CURRENT_DATE, now(), now(),
      'Saldo inicial recibido de Caja Leslie por cambio de hostess (Leslie -> Elda).'
    )
    RETURNING id INTO v_corte_elda;

    INSERT INTO erp.movimientos_caja (
      empresa_id, corte_id, tipo, tipo_detalle, monto, concepto, realizado_por_nombre
    ) VALUES (
      v_empresa, v_corte_elda, 'entrada', 'traspaso', 3043,
      'Traspaso de saldo Caja Leslie por cambio de hostess',
      'Ajuste administrativo (migracion)'
    );
  END IF;

  -- ── 3b. Salida de Caja Leslie -> queda en cero ($3,043) ────
  IF NOT EXISTS (
    SELECT 1 FROM erp.cortes_caja
    WHERE empresa_id = v_empresa
      AND caja_nombre = 'Caja Leslie'
      AND corte_nombre = 'Cierre por baja (traspaso a Caja Elda)'
  ) THEN
    INSERT INTO erp.cortes_caja (
      empresa_id, caja_nombre, corte_nombre, tipo, estado,
      efectivo_inicial, efectivo_contado, total_efectivo,
      fecha_operativa, abierto_at, cerrado_at, observaciones
    ) VALUES (
      v_empresa, 'Caja Leslie', 'Cierre por baja (traspaso a Caja Elda)',
      'especial', 'cerrado', 3043, 0, 0,
      CURRENT_DATE, now(), now(),
      'Traspaso de saldo a Caja Elda; caja en cero por baja de hostess.'
    )
    RETURNING id INTO v_corte_leslie;

    INSERT INTO erp.movimientos_caja (
      empresa_id, corte_id, tipo, tipo_detalle, monto, concepto, realizado_por_nombre
    ) VALUES (
      v_empresa, v_corte_leslie, 'salida', 'traspaso', 3043,
      'Traspaso de saldo a Caja Elda por baja de hostess',
      'Ajuste administrativo (migracion)'
    );
  END IF;

  -- ── 3c. Salida de Caja Laisha -> retiro, manejo aparte ($3,066) ──
  IF NOT EXISTS (
    SELECT 1 FROM erp.cortes_caja
    WHERE empresa_id = v_empresa
      AND caja_nombre = 'Caja Laisha'
      AND corte_nombre = 'Cierre por baja de hostess (retiro de efectivo)'
  ) THEN
    INSERT INTO erp.cortes_caja (
      empresa_id, caja_nombre, corte_nombre, tipo, estado,
      efectivo_inicial, efectivo_contado, total_efectivo,
      fecha_operativa, abierto_at, cerrado_at, observaciones
    ) VALUES (
      v_empresa, 'Caja Laisha', 'Cierre por baja de hostess (retiro de efectivo)',
      'especial', 'cerrado', 3066, 0, 0,
      CURRENT_DATE, now(), now(),
      'Retiro de saldo por baja de hostess; manejo administrativo aparte. Caja en cero.'
    )
    RETURNING id INTO v_corte_laisha;

    INSERT INTO erp.movimientos_caja (
      empresa_id, corte_id, tipo, tipo_detalle, monto, concepto, realizado_por_nombre
    ) VALUES (
      v_empresa, v_corte_laisha, 'salida', 'retiro', 3066,
      'Retiro de saldo por baja de hostess (manejo administrativo aparte)',
      'Ajuste administrativo (migracion)'
    );
  END IF;
END $mig$;

COMMIT;
