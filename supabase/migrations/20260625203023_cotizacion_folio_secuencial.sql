-- ╭─ 20260625203023_cotizacion_folio_secuencial ─╮
-- Folio secuencial RFQ-{año}-{NNNN} para cotizaciones (DILESA).
--
-- Iniciativa `dilesa-compras-operacion` · Sprint 5c (pulido del flujo). Hoy el
-- folio de la RFQ se genera en el cliente con `Date.now().toString(36)` →
-- "RFQ-MQSADDFP": ilegible para el proveedor y no secuencial/auditable. Este
-- trigger asigna un consecutivo legible por (empresa, año), atómico — gemelo del
-- folio OC-{año}-{NNNN} de `erp.ordenes_compra` (migración 20260624233040) y del
-- LEV-{año}-{NNNN} de `erp.inventario_levantamientos`.
--
-- Convive con lo existente sin tocarlo:
--   - Solo asigna cuando `codigo` viene NULL/''. Si algún flujo manda su propio
--     folio (imports, backfills), el trigger lo respeta y NO lo pisa. DILESA deja
--     de mandar `codigo` desde el cliente (requisiciones + cotizaciones modules)
--     → obtiene el secuencial.
--   - Las RFQ viejas (`RFQ-<base36>`) no matchean el patrón `RFQ-{año}-%`, así que
--     el consecutivo del año arranca limpio en 0001 sin colisionar.
--   - El UNIQUE (empresa_id, codigo) ya existente sigue garantizando unicidad.
--   - Lock con salt 'rfq' distinto al de OC → no contiende con la numeración de OC
--     de la misma empresa/año.
--
-- NO toca montos, estados, permisos ni `erp.v_partida_control`. Solo numeración.

BEGIN;

CREATE OR REPLACE FUNCTION erp.fn_cotizacion_asignar_folio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = erp, pg_catalog AS $$
DECLARE
  v_year int;
  v_next int;
  v_lock_key bigint;
BEGIN
  -- Respeta un folio explícito (imports, backfills): no lo pisa.
  IF NEW.codigo IS NOT NULL AND NEW.codigo <> '' THEN
    RETURN NEW;
  END IF;

  v_year := EXTRACT(YEAR FROM COALESCE(NEW.created_at, now()))::int;
  -- Advisory lock por (empresa, año) con salt 'rfq' para evitar race en el
  -- consecutivo y no contender con el folio de OC de la misma empresa/año.
  v_lock_key := ('x' || substr(md5(NEW.empresa_id::text || '-rfq-' || v_year::text), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(
           CAST(NULLIF(regexp_replace(codigo, '^RFQ-' || v_year || '-', ''), '') AS int)
         ), 0) + 1
    INTO v_next
  FROM erp.cotizaciones
  WHERE empresa_id = NEW.empresa_id
    AND codigo LIKE 'RFQ-' || v_year || '-%';

  NEW.codigo := 'RFQ-' || v_year || '-' || lpad(v_next::text, 4, '0');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cotizacion_folio ON erp.cotizaciones;
CREATE TRIGGER trg_cotizacion_folio
BEFORE INSERT ON erp.cotizaciones
FOR EACH ROW EXECUTE FUNCTION erp.fn_cotizacion_asignar_folio();

COMMIT;
