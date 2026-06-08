-- ╭─ 20260608214144_dilesa_empresa_datos_poliza ─╮
-- Datos del desarrollador DILESA para la Póliza de Garantía (Sprint 7h).
--
-- Beto confirmó los valores reales (antes NULL): registro Infonavit,
-- teléfono y email de contacto. También fija el representante/firmante de
-- la póliza como Adalberto Santos de los Santos (antes "C. Norberto
-- Gutiérrez Infante" en representante_legal).
--
-- OJO: representante_legal también lo consume RH (datos fiscales de la
-- empresa). Si en RH debe seguir siendo Norberto, separar en un campo
-- aparte para la póliza. Beto autorizó el cambio (2026-06-08).
--
-- Idempotente: UPDATE acotado por slug. En Preview (sin datos) afecta 0
-- filas; en prod actualiza la única fila DILESA.

BEGIN;

UPDATE core.empresas
SET
  registro_infonavit = '10160308',
  telefono = '(878) 791-1818',
  email_contacto = 'info@dilesa.mx',
  representante_legal = 'Adalberto Santos de los Santos'
WHERE slug = 'dilesa';

COMMIT;
