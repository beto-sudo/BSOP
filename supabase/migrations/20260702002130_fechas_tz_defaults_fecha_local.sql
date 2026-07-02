-- ╭─ 20260702002130_fechas_tz_defaults_fecha_local ─╮
-- Iniciativa fechas-tz S4b (ADR-054): CURRENT_DATE es el dia calendario UTC —
-- a partir de las ~18:00/19:00 hora de Matamoros un INSERT que dependa del
-- default graba "manana". Cambia SOLO el DEFAULT de 17 columnas `date`
-- (introspeccion de prod 2026-07-01: column_default = CURRENT_DATE) al dia
-- local real. No toca datos existentes ni tipos; INSERTs con fecha explicita
-- no cambian. Incluye tablas de pagos/cobranza → gate financiero, OK verbal
-- de Beto en chat (2026-07-01).
--
-- Timestamp generado con `npm run db:new` (anti-colisión multi-sesión:
-- estrictamente mayor que toda migración local + de PRs abiertos).

BEGIN;

ALTER TABLE dilesa.construccion_tareas_terminadas
  ALTER COLUMN fecha_terminada SET DEFAULT (now() AT TIME ZONE 'America/Matamoros')::date;
ALTER TABLE dilesa.recepcion_obra
  ALTER COLUMN fecha_recepcion SET DEFAULT (now() AT TIME ZONE 'America/Matamoros')::date;
ALTER TABLE dilesa.recepcion_visitas
  ALTER COLUMN fecha_visita SET DEFAULT (now() AT TIME ZONE 'America/Matamoros')::date;

ALTER TABLE erp.activos_mantenimiento
  ALTER COLUMN fecha SET DEFAULT (now() AT TIME ZONE 'America/Matamoros')::date;
ALTER TABLE erp.cortes_caja
  ALTER COLUMN fecha_operativa SET DEFAULT (now() AT TIME ZONE 'America/Matamoros')::date;
ALTER TABLE erp.cuenta_saldos
  ALTER COLUMN fecha SET DEFAULT (now() AT TIME ZONE 'America/Matamoros')::date;
ALTER TABLE erp.cxc_pagos
  ALTER COLUMN fecha SET DEFAULT (now() AT TIME ZONE 'America/Matamoros')::date;
ALTER TABLE erp.gastos
  ALTER COLUMN fecha SET DEFAULT (now() AT TIME ZONE 'America/Matamoros')::date;
ALTER TABLE erp.inventario_levantamientos
  ALTER COLUMN fecha_programada SET DEFAULT (now() AT TIME ZONE 'America/Matamoros')::date;
ALTER TABLE erp.movimientos_bancarios
  ALTER COLUMN fecha SET DEFAULT (now() AT TIME ZONE 'America/Matamoros')::date;
ALTER TABLE erp.pagos
  ALTER COLUMN fecha_pago SET DEFAULT (now() AT TIME ZONE 'America/Matamoros')::date;
ALTER TABLE erp.productos_precios
  ALTER COLUMN fecha_inicio SET DEFAULT (now() AT TIME ZONE 'America/Matamoros')::date;
ALTER TABLE erp.recepciones
  ALTER COLUMN fecha_recepcion SET DEFAULT (now() AT TIME ZONE 'America/Matamoros')::date;
ALTER TABLE erp.taller_servicio
  ALTER COLUMN fecha_entrada SET DEFAULT (now() AT TIME ZONE 'America/Matamoros')::date;
ALTER TABLE erp.ventas_autos
  ALTER COLUMN fecha_venta SET DEFAULT (now() AT TIME ZONE 'America/Matamoros')::date;
ALTER TABLE erp.ventas_inmobiliarias
  ALTER COLUMN fecha_venta SET DEFAULT (now() AT TIME ZONE 'America/Matamoros')::date;
ALTER TABLE erp.ventas_tickets
  ALTER COLUMN fecha SET DEFAULT (now() AT TIME ZONE 'America/Matamoros')::date;

-- Recarga el cache de PostgREST (cambian defaults expuestos por el schema):
NOTIFY pgrst, 'reload schema';

COMMIT;
