-- Sprint 3 PR B — revoke anonymous SELECT access from every erp.* table.
--
-- Context
-- -------
-- The migration `20260414000016_erp_grants_rls.sql` generated 5 policies
-- per erp table in a loop, including `erp_<table>_anon_select` — a SELECT
-- policy FOR `anon` USING (true). With 50 operational tables in `erp`
-- that's 50 policies letting unauthenticated callers list every row.
--
-- BSOP has no feature that reads erp via anon. Confirmed by grep:
--   * Edge functions (waitry-webhook, sync-cortes, playtomic-sync) all
--     use SUPABASE_SERVICE_ROLE_KEY — they bypass RLS entirely.
--   * No client-side code creates an anon client against erp (the only
--     `.schema('erp')` calls go through the cookie-authenticated browser
--     client).
--   * The public `/compartir/[token]` page queries only public.* tables.
--
-- So dropping these is safe: no legitimate traffic loses access.
-- Authenticated SELECT policies (the separate `erp_<table>_select`
-- entries) stay in place; PRs C and D will tighten those next, replacing
-- their `USING (true)` with empresa scoping via core.fn_has_empresa.

-- 50 drops, one per table:
DROP POLICY IF EXISTS erp_activos_anon_select                       ON erp.activos;
DROP POLICY IF EXISTS erp_activos_mantenimiento_anon_select         ON erp.activos_mantenimiento;
DROP POLICY IF EXISTS erp_adjuntos_anon_select                      ON erp.adjuntos;
DROP POLICY IF EXISTS erp_almacenes_anon_select                     ON erp.almacenes;
DROP POLICY IF EXISTS erp_aprobaciones_anon_select                  ON erp.aprobaciones;
DROP POLICY IF EXISTS erp_cajas_anon_select                         ON erp.cajas;
DROP POLICY IF EXISTS erp_citas_anon_select                         ON erp.citas;
DROP POLICY IF EXISTS erp_clientes_anon_select                      ON erp.clientes;
DROP POLICY IF EXISTS erp_cobranza_anon_select                      ON erp.cobranza;
DROP POLICY IF EXISTS erp_conciliaciones_anon_select                ON erp.conciliaciones;
DROP POLICY IF EXISTS erp_contratos_anon_select                     ON erp.contratos;
DROP POLICY IF EXISTS erp_corte_conteo_denominaciones_anon_select   ON erp.corte_conteo_denominaciones;
DROP POLICY IF EXISTS erp_cortes_caja_anon_select                   ON erp.cortes_caja;
DROP POLICY IF EXISTS erp_cuentas_bancarias_anon_select             ON erp.cuentas_bancarias;
DROP POLICY IF EXISTS erp_departamentos_anon_select                 ON erp.departamentos;
DROP POLICY IF EXISTS erp_documentos_anon_select                    ON erp.documentos;
DROP POLICY IF EXISTS erp_empleados_anon_select                     ON erp.empleados;
DROP POLICY IF EXISTS erp_empleados_compensacion_anon_select        ON erp.empleados_compensacion;
DROP POLICY IF EXISTS erp_facturas_anon_select                      ON erp.facturas;
DROP POLICY IF EXISTS erp_gastos_anon_select                        ON erp.gastos;
DROP POLICY IF EXISTS erp_inventario_anon_select                    ON erp.inventario;
DROP POLICY IF EXISTS erp_juntas_anon_select                        ON erp.juntas;
DROP POLICY IF EXISTS erp_juntas_asistencia_anon_select             ON erp.juntas_asistencia;
DROP POLICY IF EXISTS erp_juntas_notas_anon_select                  ON erp.juntas_notas;
DROP POLICY IF EXISTS erp_lotes_anon_select                         ON erp.lotes;
DROP POLICY IF EXISTS erp_movimientos_bancarios_anon_select         ON erp.movimientos_bancarios;
DROP POLICY IF EXISTS erp_movimientos_caja_anon_select              ON erp.movimientos_caja;
DROP POLICY IF EXISTS erp_movimientos_inventario_anon_select        ON erp.movimientos_inventario;
DROP POLICY IF EXISTS erp_ordenes_compra_anon_select                ON erp.ordenes_compra;
DROP POLICY IF EXISTS erp_ordenes_compra_detalle_anon_select        ON erp.ordenes_compra_detalle;
DROP POLICY IF EXISTS erp_pagos_anon_select                         ON erp.pagos;
DROP POLICY IF EXISTS erp_pagos_provisionales_anon_select           ON erp.pagos_provisionales;
DROP POLICY IF EXISTS erp_personas_anon_select                      ON erp.personas;
DROP POLICY IF EXISTS erp_productos_anon_select                     ON erp.productos;
DROP POLICY IF EXISTS erp_productos_precios_anon_select             ON erp.productos_precios;
DROP POLICY IF EXISTS erp_proveedores_anon_select                   ON erp.proveedores;
DROP POLICY IF EXISTS erp_proyectos_anon_select                     ON erp.proyectos;
DROP POLICY IF EXISTS erp_puestos_anon_select                       ON erp.puestos;
DROP POLICY IF EXISTS erp_recepciones_anon_select                   ON erp.recepciones;
DROP POLICY IF EXISTS erp_recepciones_detalle_anon_select           ON erp.recepciones_detalle;
DROP POLICY IF EXISTS erp_requisiciones_anon_select                 ON erp.requisiciones;
DROP POLICY IF EXISTS erp_requisiciones_detalle_anon_select         ON erp.requisiciones_detalle;
DROP POLICY IF EXISTS erp_taller_servicio_anon_select               ON erp.taller_servicio;
DROP POLICY IF EXISTS erp_tasks_anon_select                         ON erp.tasks;
DROP POLICY IF EXISTS erp_turnos_anon_select                        ON erp.turnos;
DROP POLICY IF EXISTS erp_vehiculos_anon_select                     ON erp.vehiculos;
DROP POLICY IF EXISTS erp_ventas_autos_anon_select                  ON erp.ventas_autos;
DROP POLICY IF EXISTS erp_ventas_inmobiliarias_anon_select          ON erp.ventas_inmobiliarias;
DROP POLICY IF EXISTS erp_ventas_refacciones_detalle_anon_select    ON erp.ventas_refacciones_detalle;
DROP POLICY IF EXISTS erp_ventas_tickets_anon_select                ON erp.ventas_tickets;

-- Belt-and-suspenders: revoke the underlying SELECT grant too so a
-- future accidental policy can't silently re-open anon access.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'erp' LOOP
    EXECUTE format('REVOKE SELECT ON erp.%I FROM anon;', t.tablename);
  END LOOP;
END $$;
