-- ╭─ 20260624233040_oc_folio_secuencial ─╮
-- Folio secuencial OC-{año}-{NNNN} para órdenes de compra (DILESA).
--
-- Iniciativa `dilesa-compras-operacion` · Sprint 2. Hoy el folio se genera en el
-- cliente con `Date.now().toString(36)` → "OC-LXY8Z3K": ilegible en un documento
-- que va al proveedor y al SAT, y no secuencial/auditable. Este trigger asigna un
-- consecutivo legible por (empresa, año), atómico — mismo patrón probado que el
-- folio LEV-{año}-{NNNN} de `erp.inventario_levantamientos` (advisory lock por
-- empresa+año + MAX(consecutivo)+1).
--
-- Convive con lo existente sin tocarlo:
--   - Solo asigna cuando `codigo` viene NULL/''. RDB SIEMPRE manda su propio folio
--     (`generarFolio('OC')` en su server action) → el trigger lo respeta y NO toca
--     RDB. DILESA dejará de mandar `codigo` (cliente) → obtiene el secuencial.
--   - Las OC viejas (`OC-<base36>`) no matchean el patrón `OC-{año}-%`, así que el
--     consecutivo del año arranca limpio en 0001 sin colisionar.
--   - El UNIQUE (empresa_id, codigo) ya existente sigue garantizando unicidad.
--
-- NO toca montos, estados, permisos ni `erp.v_partida_control`. Solo numeración.

BEGIN;

CREATE OR REPLACE FUNCTION erp.fn_oc_asignar_folio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = erp, pg_catalog AS $$
DECLARE
  v_year int;
  v_next int;
  v_lock_key bigint;
BEGIN
  -- Respeta un folio explícito (RDB, imports, backfills): no lo pisa.
  IF NEW.codigo IS NOT NULL AND NEW.codigo <> '' THEN
    RETURN NEW;
  END IF;

  v_year := EXTRACT(YEAR FROM COALESCE(NEW.created_at, now()))::int;
  -- Advisory lock por (empresa, año) para evitar race en el consecutivo.
  v_lock_key := ('x' || substr(md5(NEW.empresa_id::text || '-' || v_year::text), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(
           CAST(NULLIF(regexp_replace(codigo, '^OC-' || v_year || '-', ''), '') AS int)
         ), 0) + 1
    INTO v_next
  FROM erp.ordenes_compra
  WHERE empresa_id = NEW.empresa_id
    AND codigo LIKE 'OC-' || v_year || '-%';

  NEW.codigo := 'OC-' || v_year || '-' || lpad(v_next::text, 4, '0');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_oc_folio ON erp.ordenes_compra;
CREATE TRIGGER trg_oc_folio
BEFORE INSERT ON erp.ordenes_compra
FOR EACH ROW EXECUTE FUNCTION erp.fn_oc_asignar_folio();

COMMIT;
