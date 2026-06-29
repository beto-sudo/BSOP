-- CxP — auto-enlace de proveedor por RFC del emisor (iniciativa `cxp`).
--
-- Problema: facturas de egreso quedaban con `proveedor_id` NULL aunque el
-- proveedor SÍ existía en el catálogo. El importador de XML matcheaba el emisor
-- con `.eq('rfc', …).maybeSingle()` SIN filtrar por empresa; para RFCs que viven
-- como persona en dos empresas del portafolio (p. ej. HOME DEPOT, IMSS, RIPSA en
-- DILESA *y* en RDB) la consulta devolvía 2 filas → error silencioso → proveedor
-- NULL → el botón "Programar pago" nunca aparecía (requiere proveedor enlazado).
--
-- Esta migración deja un backstop a nivel DB que cubre CUALQUIER vía de alta
-- (importador, RPC, seeds), más el backfill de las facturas ya afectadas y el
-- alta de los 2 proveedores que aún no estaban en el catálogo.

BEGIN;

-- ── 1. Función + trigger: auto-enlace por RFC dentro de la misma empresa ──────
-- Solo actúa cuando falta el proveedor (no pisa un enlace explícito) y hay RFC
-- de emisor. Determinista ante personas duplicadas intra-empresa: la activa más
-- antigua. Espejo de la lógica del importador (route upload-xml).
CREATE OR REPLACE FUNCTION erp.fn_cxp_factura_autolink_proveedor()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_persona_id uuid;
BEGIN
  IF NEW.flujo = 'egreso'
     AND NEW.proveedor_id IS NULL
     AND NEW.emisor_rfc IS NOT NULL
     AND btrim(NEW.emisor_rfc) <> ''
  THEN
    SELECT p.id INTO v_persona_id
    FROM erp.personas p
    WHERE p.empresa_id = NEW.empresa_id
      AND p.deleted_at IS NULL
      AND upper(btrim(p.rfc)) = upper(btrim(NEW.emisor_rfc))
    ORDER BY p.created_at ASC
    LIMIT 1;

    IF v_persona_id IS NOT NULL THEN
      NEW.proveedor_id := v_persona_id;
      -- `persona_id` se mantiene en espejo de `proveedor_id` (consistente con
      -- erp.cxp_factura_alta, que inserta ambos con el mismo valor).
      NEW.persona_id := v_persona_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cxp_factura_autolink_proveedor ON erp.facturas;
CREATE TRIGGER trg_cxp_factura_autolink_proveedor
  BEFORE INSERT OR UPDATE OF emisor_rfc, proveedor_id, empresa_id ON erp.facturas
  FOR EACH ROW
  EXECUTE FUNCTION erp.fn_cxp_factura_autolink_proveedor();

-- ── 2. Alta de los 2 proveedores faltantes (no existían en ninguna empresa) ──
-- Personas morales (RFC de 12 caracteres). Idempotente: solo inserta si no hay
-- ya una persona con ese RFC en DILESA. Robusto a Preview/shadow: si no existe
-- la empresa 'dilesa' (DB sin datos de prod) el SELECT no produce filas.
INSERT INTO erp.personas (empresa_id, nombre, rfc, tipo, tipo_persona, activo)
SELECT e.id, v.nombre, v.rfc, 'general', 'moral', true
FROM core.empresas e
CROSS JOIN (
  VALUES
    ('AUTO SERVICIOS DE PIEDRAS NEGRAS', 'ASP931118M58'),
    ('SOPORTE DE SUPERVISION EN CONSTRUCCION', 'SSC090624KW1')
) AS v(nombre, rfc)
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.personas p
    WHERE p.empresa_id = e.id
      AND upper(btrim(p.rfc)) = upper(btrim(v.rfc))
      AND p.deleted_at IS NULL
  );

-- ── 3. Backfill: enlazar las facturas de egreso con proveedor NULL cuyo RFC ya
-- matchea una persona en la misma empresa (incluye las 2 recién creadas). ──────
UPDATE erp.facturas f
SET proveedor_id = sub.persona_id,
    persona_id   = sub.persona_id
FROM (
  SELECT f2.id AS factura_id,
         (
           SELECT p.id
           FROM erp.personas p
           WHERE p.empresa_id = f2.empresa_id
             AND p.deleted_at IS NULL
             AND upper(btrim(p.rfc)) = upper(btrim(f2.emisor_rfc))
           ORDER BY p.created_at ASC
           LIMIT 1
         ) AS persona_id
  FROM erp.facturas f2
  WHERE f2.flujo = 'egreso'
    AND f2.proveedor_id IS NULL
    AND f2.cancelada_at IS NULL
    AND f2.emisor_rfc IS NOT NULL
) sub
WHERE f.id = sub.factura_id
  AND sub.persona_id IS NOT NULL;

-- Recarga el cache de PostgREST (nueva función + cambios en datos de embeds).
NOTIFY pgrst, 'reload schema';

COMMIT;
