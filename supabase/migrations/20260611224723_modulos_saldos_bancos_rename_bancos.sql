-- ╭─ 20260611224723_modulos_saldos_bancos_rename_bancos ─╮
-- Renombra los módulos de Saldos Bancos a "Bancos" en la pantalla de Accesos
-- (decisión de Beto 2026-06-11): el módulo ya cubre ficha + saldos + estados
-- de cuenta + conciliación, "Saldos Bancos" se quedó corto. Solo cambia
-- core.modulos.nombre — slugs, URLs y permisos quedan intactos.

BEGIN;

UPDATE core.modulos SET nombre = 'Bancos'
WHERE slug = 'dilesa.saldos-bancos' AND nombre = 'Saldos Bancos';

UPDATE core.modulos SET nombre = 'Bancos · Saldos'
WHERE slug = 'dilesa.saldos-bancos.saldos' AND nombre = 'Saldos Bancos · Saldos';

UPDATE core.modulos SET nombre = 'Bancos · Estados de cuenta'
WHERE slug = 'dilesa.saldos-bancos.estados' AND nombre = 'Saldos Bancos · Estados de cuenta';

NOTIFY pgrst, 'reload schema';

COMMIT;
