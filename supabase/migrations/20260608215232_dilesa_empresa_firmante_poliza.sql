-- ╭─ 20260608215232_dilesa_empresa_firmante_poliza ─╮
-- Separa el firmante de la Póliza de Garantía del representante legal
-- administrativo/fiscal (Sprint 7h).
--
-- Beto: el representante legal para asuntos administrativos/fiscales sigue
-- siendo Norberto Gutiérrez Infante; SOLO la Póliza de Garantía la firma él
-- (Adalberto Santos de los Santos). La migración previa (20260608214144)
-- había puesto Adalberto en representante_legal — aquí lo restauramos y
-- movemos Adalberto a un campo dedicado `firmante_poliza`.
--
-- core.empresas.firmante_poliza: firmante de la Póliza de Garantía. NULL →
-- el PDF cae a representante_legal (otras empresas).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + UPDATE acotado por slug.
-- (Toca solo una columna nueva + datos → no requiere reload de PostgREST.)

BEGIN;

ALTER TABLE core.empresas
  ADD COLUMN IF NOT EXISTS firmante_poliza text;

COMMENT ON COLUMN core.empresas.firmante_poliza IS
  'Firmante de la Póliza de Garantía de vivienda. Si NULL, el PDF usa representante_legal. Permite que la póliza la firme una persona distinta al representante legal administrativo.';

UPDATE core.empresas
SET
  firmante_poliza = 'Adalberto Santos de los Santos',
  representante_legal = 'C. Norberto Gutiérrez Infante'
WHERE slug = 'dilesa';

NOTIFY pgrst, 'reload schema';

COMMIT;
