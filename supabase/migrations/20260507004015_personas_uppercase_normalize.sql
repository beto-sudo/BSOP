-- Normaliza a MAYÚSCULAS los nombres y razones sociales de TODAS las
-- personas del repo (proveedores, empleados, accionistas, etc.) y agrega
-- triggers BEFORE INSERT/UPDATE para que cualquier captura futura quede
-- automáticamente en MAYÚSCULAS — sin importar el path (UI, scripts,
-- MCP, importadores).
--
-- Convención mexicana: razón social formal y nombres en CSF/CFDi/escrituras
-- siempre van en MAYÚSCULAS. Mantener la base alineada con cómo aparece
-- en facturas y declaraciones evita drift visual al hacer cross-check
-- contable.
--
-- Decisión de Beto el 2026-05-06: revertir el title-case que aplicamos
-- a los proveedores DILESA y dejar TODO parejo en MAYÚSCULAS, incluyendo
-- personas físicas (empleados, accionistas, etc.).
--
-- Riesgo: bajo. El UPDATE solo cambia capitalización; los datos siguen
-- siendo legibles y los RFC ya estaban en mayúsculas. Reversible vía
-- backup PITR si fuese necesario.

-- ─── 1. Bulk UPDATE — normalizar lo existente ──────────────────────────

UPDATE erp.personas
SET
  nombre = upper(nombre),
  apellido_paterno = upper(apellido_paterno),
  apellido_materno = upper(apellido_materno)
WHERE
  nombre <> upper(nombre)
  OR apellido_paterno <> upper(apellido_paterno)
  OR apellido_materno <> upper(apellido_materno);

UPDATE erp.personas_datos_fiscales
SET
  razon_social = upper(razon_social),
  nombre_comercial = upper(nombre_comercial)
WHERE
  razon_social <> upper(razon_social)
  OR nombre_comercial <> upper(nombre_comercial);

-- ─── 2. Trigger normalizador para futuras capturas ─────────────────────

CREATE OR REPLACE FUNCTION erp.fn_personas_uppercase_normalize()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.nombre := upper(NEW.nombre);
  NEW.apellido_paterno := upper(NEW.apellido_paterno);
  NEW.apellido_materno := upper(NEW.apellido_materno);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_personas_uppercase_normalize ON erp.personas;

CREATE TRIGGER trg_personas_uppercase_normalize
  BEFORE INSERT OR UPDATE OF nombre, apellido_paterno, apellido_materno
  ON erp.personas
  FOR EACH ROW
  EXECUTE FUNCTION erp.fn_personas_uppercase_normalize();

CREATE OR REPLACE FUNCTION erp.fn_personas_datos_fiscales_uppercase_normalize()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.razon_social := upper(NEW.razon_social);
  NEW.nombre_comercial := upper(NEW.nombre_comercial);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_personas_datos_fiscales_uppercase_normalize
  ON erp.personas_datos_fiscales;

CREATE TRIGGER trg_personas_datos_fiscales_uppercase_normalize
  BEFORE INSERT OR UPDATE OF razon_social, nombre_comercial
  ON erp.personas_datos_fiscales
  FOR EACH ROW
  EXECUTE FUNCTION erp.fn_personas_datos_fiscales_uppercase_normalize();

COMMENT ON FUNCTION erp.fn_personas_uppercase_normalize() IS
  'Normaliza nombre/apellido_paterno/apellido_materno a MAYÚSCULAS antes de INSERT/UPDATE. Convención mexicana: razón social y nombres en SAT/CFDi siempre van en mayúsculas. Aplica a todas las personas (proveedores, empleados, accionistas).';

COMMENT ON FUNCTION erp.fn_personas_datos_fiscales_uppercase_normalize() IS
  'Normaliza razon_social y nombre_comercial a MAYÚSCULAS antes de INSERT/UPDATE. Espejo del trigger en erp.personas para los campos del CSF.';

NOTIFY pgrst, 'reload schema';
