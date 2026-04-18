-- Sprint 4A — Add indexes to unindexed foreign keys (52 total).
-- Source: Supabase performance advisor `unindexed_foreign_keys`.
-- See docs/AUDIT_SUPABASE_2026-04-17.md §3.2 and docs/ACTION_PLAN_2026-04-17.md Sprint 4.
--
-- NOTE: We use CREATE INDEX (not CONCURRENTLY) because supabase migrations
-- run inside a transaction, and CREATE INDEX CONCURRENTLY cannot run in a
-- transaction block. CREATE INDEX takes an ACCESS EXCLUSIVE lock but is
-- non-blocking for pure SELECT traffic while building on small tables.
-- All target tables here are small enough that the brief write-lock is
-- negligible.

-- ── core ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_permisos_rol_modulo_id
  ON core.permisos_rol (modulo_id);
CREATE INDEX IF NOT EXISTS idx_permisos_usuario_excepcion_empresa_id
  ON core.permisos_usuario_excepcion (empresa_id);
CREATE INDEX IF NOT EXISTS idx_permisos_usuario_excepcion_modulo_id
  ON core.permisos_usuario_excepcion (modulo_id);
CREATE INDEX IF NOT EXISTS idx_roles_empresa_id
  ON core.roles (empresa_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_empresas_empresa_id
  ON core.usuarios_empresas (empresa_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_empresas_rol_id
  ON core.usuarios_empresas (rol_id);

-- ── erp ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_activos_responsable_id
  ON erp.activos (responsable_id);
CREATE INDEX IF NOT EXISTS idx_activos_mantenimiento_proveedor_id
  ON erp.activos_mantenimiento (proveedor_id);
CREATE INDEX IF NOT EXISTS idx_adjuntos_uploaded_by
  ON erp.adjuntos (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_almacenes_responsable_id
  ON erp.almacenes (responsable_id);
CREATE INDEX IF NOT EXISTS idx_aprobaciones_aprobador_id
  ON erp.aprobaciones (aprobador_id);
CREATE INDEX IF NOT EXISTS idx_cajas_responsable_id
  ON erp.cajas (responsable_id);
CREATE INDEX IF NOT EXISTS idx_citas_cliente_id
  ON erp.citas (cliente_id);
CREATE INDEX IF NOT EXISTS idx_citas_creado_por
  ON erp.citas (creado_por);
CREATE INDEX IF NOT EXISTS idx_citas_responsable_id
  ON erp.citas (responsable_id);
CREATE INDEX IF NOT EXISTS idx_cobranza_cliente_id
  ON erp.cobranza (cliente_id);
CREATE INDEX IF NOT EXISTS idx_conciliaciones_creado_por
  ON erp.conciliaciones (creado_por);
CREATE INDEX IF NOT EXISTS idx_departamentos_padre_id
  ON erp.departamentos (padre_id);
CREATE INDEX IF NOT EXISTS idx_documentos_creado_por
  ON erp.documentos (creado_por);
CREATE INDEX IF NOT EXISTS idx_empleados_puesto_id
  ON erp.empleados (puesto_id);
CREATE INDEX IF NOT EXISTS idx_empleados_reemplaza_a
  ON erp.empleados (reemplaza_a);
CREATE INDEX IF NOT EXISTS idx_facturas_persona_id
  ON erp.facturas (persona_id);
CREATE INDEX IF NOT EXISTS idx_gastos_creado_por
  ON erp.gastos (creado_por);
CREATE INDEX IF NOT EXISTS idx_juntas_creado_por
  ON erp.juntas (creado_por);
CREATE INDEX IF NOT EXISTS idx_juntas_asistencia_persona_id
  ON erp.juntas_asistencia (persona_id);
CREATE INDEX IF NOT EXISTS idx_juntas_notas_creado_por
  ON erp.juntas_notas (creado_por);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_realizado_por
  ON erp.movimientos_caja (realizado_por);
CREATE INDEX IF NOT EXISTS idx_movimientos_inventario_created_by
  ON erp.movimientos_inventario (created_by);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_requisicion_id
  ON erp.ordenes_compra (requisicion_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_detalle_producto_id
  ON erp.ordenes_compra_detalle (producto_id);
CREATE INDEX IF NOT EXISTS idx_pagos_recibio_id
  ON erp.pagos (recibio_id);
CREATE INDEX IF NOT EXISTS idx_productos_parent_id
  ON erp.productos (parent_id);
CREATE INDEX IF NOT EXISTS idx_recepciones_recibe_id
  ON erp.recepciones (recibe_id);
CREATE INDEX IF NOT EXISTS idx_recepciones_detalle_oc_detalle_id
  ON erp.recepciones_detalle (oc_detalle_id);
CREATE INDEX IF NOT EXISTS idx_recepciones_detalle_producto_id
  ON erp.recepciones_detalle (producto_id);
CREATE INDEX IF NOT EXISTS idx_requisiciones_departamento_id
  ON erp.requisiciones (departamento_id);
CREATE INDEX IF NOT EXISTS idx_requisiciones_detalle_producto_id
  ON erp.requisiciones_detalle (producto_id);
CREATE INDEX IF NOT EXISTS idx_taller_servicio_tecnico_id
  ON erp.taller_servicio (tecnico_id);
CREATE INDEX IF NOT EXISTS idx_task_updates_creado_por
  ON erp.task_updates (creado_por);
CREATE INDEX IF NOT EXISTS idx_tasks_asignado_a
  ON erp.tasks (asignado_a);
CREATE INDEX IF NOT EXISTS idx_tasks_asignado_por
  ON erp.tasks (asignado_por);
CREATE INDEX IF NOT EXISTS idx_tasks_completado_por
  ON erp.tasks (completado_por);
CREATE INDEX IF NOT EXISTS idx_tasks_creado_por
  ON erp.tasks (creado_por);
CREATE INDEX IF NOT EXISTS idx_ventas_autos_vendedor_id
  ON erp.ventas_autos (vendedor_id);
CREATE INDEX IF NOT EXISTS idx_ventas_inmobiliarias_vendedor_id
  ON erp.ventas_inmobiliarias (vendedor_id);
CREATE INDEX IF NOT EXISTS idx_ventas_refacciones_detalle_producto_id
  ON erp.ventas_refacciones_detalle (producto_id);
CREATE INDEX IF NOT EXISTS idx_ventas_tickets_vendedor_id
  ON erp.ventas_tickets (vendedor_id);

-- ── public ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_expense_splits_expense_id
  ON public.expense_splits (expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_participant_id
  ON public.expense_splits (participant_id);
CREATE INDEX IF NOT EXISTS idx_trip_expenses_paid_by
  ON public.trip_expenses (paid_by);

-- ── rdb (archive) ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_archive_2026_04_17_proveedor_id
  ON rdb.ordenes_compra_archive_2026_04_17 (proveedor_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_archive_2026_04_17_requisicion_id
  ON rdb.ordenes_compra_archive_2026_04_17 (requisicion_id);
