-- Flag por-junta para enviar la minuta al consejo al terminar.
-- Default true: por regla operativa, todas las juntas se envían al consejo
-- salvo que el usuario explícitamente desmarque el checkbox en el detalle.
-- El destinatario concreto (consejo@dilesa.mx) se resuelve en la ruta
-- /api/juntas/terminar al momento de enviar el correo.

ALTER TABLE erp.juntas
  ADD COLUMN IF NOT EXISTS enviar_a_consejo BOOLEAN NOT NULL DEFAULT TRUE;

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
