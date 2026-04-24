-- ════════════════════════════════════════════════════════════════════════════
-- Sprint dilesa-4a — dilesa.v_inventario_comercial
-- ════════════════════════════════════════════════════════════════════════════
--
-- Vista consolidada para el pipeline de ventas: una fila por unidad de
-- inventario con todos los joins necesarios ya resueltos.
--
-- security_invoker=on: respeta RLS de cada tabla origen, así un usuario solo
-- ve el inventario de las empresas a las que pertenece.
--
-- Columnas derivadas:
--   • precio_final: precio_promocional si se fijó manualmente; si no, aplica
--     la regla de la promoción vigente (descuento_pct o descuento_monto); si
--     no hay promoción, cae a precio_lista.
--   • dias_en_fase: now()::date - fecha que corresponde al estado_comercial
--     actual (disponibilidad/apartado/venta/escrituración/entrega). Para
--     'postventa' usa fecha_entrega; para 'cancelada' cae a updated_at.
--
-- Consumida por el UI de inventario y el futuro módulo comercial (dilesa-5).

CREATE OR REPLACE VIEW dilesa.v_inventario_comercial
WITH (security_invoker = on) AS
SELECT
  -- Identidad de la unidad
  inv.id,
  inv.empresa_id,
  inv.construccion_lote_id,
  inv.lote_id,
  inv.proyecto_id,
  inv.prototipo_id,
  inv.codigo_unidad,
  inv.fase_inventario_id,
  inv.estado_comercial,

  -- Precios base
  inv.precio_lista,
  inv.precio_promocional,
  inv.promocion_id,

  -- Apartado
  inv.cliente_apartado_id,
  inv.fecha_apartado,
  inv.monto_apartado,
  inv.fecha_vencimiento_apartado,

  -- Fechas del ciclo comercial
  inv.fecha_disponibilidad,
  inv.fecha_venta,
  inv.fecha_escrituracion,
  inv.fecha_entrega,

  inv.observaciones,

  -- Gestión
  inv.etapa,
  inv.decision_actual,
  inv.prioridad,
  inv.responsable_id,
  inv.fecha_ultima_revision,
  inv.siguiente_accion,

  inv.created_at,
  inv.updated_at,

  -- Proyecto
  p.nombre  AS proyecto_nombre,
  p.codigo  AS proyecto_codigo,

  -- Prototipo
  pr.nombre                     AS prototipo_nombre,
  pr.codigo                     AS prototipo_codigo,
  pr.superficie_construida_m2   AS prototipo_superficie_m2,
  pr.recamaras                  AS prototipo_recamaras,
  pr.banos                      AS prototipo_banos,

  -- Lote
  l.manzana        AS lote_manzana,
  l.numero_lote    AS lote_numero,
  l.superficie_m2  AS lote_superficie_m2,

  -- Construcción (fuente)
  cl.avance_pct            AS construccion_avance_pct,
  cl.etapa_construccion_id AS construccion_etapa_id,

  -- Fase de inventario (catálogo)
  fi.nombre AS fase_inventario_nombre,

  -- Promoción
  promo.nombre           AS promocion_nombre,
  promo.descuento_pct    AS promocion_descuento_pct,
  promo.descuento_monto  AS promocion_descuento_monto,

  -- Cliente apartado (datos básicos de contacto)
  CASE
    WHEN cli.id IS NULL THEN NULL
    ELSE TRIM(BOTH ' ' FROM CONCAT_WS(' ',
      cli.nombre, cli.apellido_paterno, cli.apellido_materno
    ))
  END                AS cliente_apartado_nombre,
  cli.telefono       AS cliente_apartado_telefono,

  -- Precio final: override manual → regla de promoción → precio_lista
  COALESCE(
    inv.precio_promocional,
    CASE
      WHEN promo.descuento_pct IS NOT NULL AND inv.precio_lista IS NOT NULL
        THEN ROUND(inv.precio_lista * (1 - promo.descuento_pct / 100.0), 2)
      WHEN promo.descuento_monto IS NOT NULL AND inv.precio_lista IS NOT NULL
        THEN GREATEST(inv.precio_lista - promo.descuento_monto, 0)
      ELSE inv.precio_lista
    END
  ) AS precio_final,

  -- Días en la fase actual (now - fecha del estado_comercial)
  CASE inv.estado_comercial
    WHEN 'disponible'  THEN (now()::date - inv.fecha_disponibilidad)
    WHEN 'apartada'    THEN (now()::date - inv.fecha_apartado)
    WHEN 'vendida'     THEN (now()::date - inv.fecha_venta)
    WHEN 'escriturada' THEN (now()::date - inv.fecha_escrituracion)
    WHEN 'entregada'   THEN (now()::date - inv.fecha_entrega)
    WHEN 'postventa'   THEN (now()::date - inv.fecha_entrega)
    WHEN 'cancelada'   THEN (now()::date - inv.updated_at::date)
    ELSE NULL
  END AS dias_en_fase

FROM dilesa.inventario_vivienda inv
JOIN dilesa.proyectos p
  ON p.id = inv.proyecto_id AND p.deleted_at IS NULL
JOIN dilesa.prototipos pr
  ON pr.id = inv.prototipo_id AND pr.deleted_at IS NULL
JOIN dilesa.lotes l
  ON l.id = inv.lote_id AND l.deleted_at IS NULL
JOIN dilesa.construccion_lote cl
  ON cl.id = inv.construccion_lote_id AND cl.deleted_at IS NULL
LEFT JOIN dilesa.promociones_ventas promo
  ON promo.id = inv.promocion_id AND promo.deleted_at IS NULL
LEFT JOIN erp.personas cli
  ON cli.id = inv.cliente_apartado_id AND cli.deleted_at IS NULL
LEFT JOIN dilesa.fases_inventario fi
  ON fi.id = inv.fase_inventario_id AND fi.deleted_at IS NULL
WHERE inv.deleted_at IS NULL;

COMMENT ON VIEW dilesa.v_inventario_comercial IS
  'Tablero consolidado del pipeline de ventas: inventario + proyecto + prototipo + lote + construcción + promoción + cliente apartado. precio_final = precio_promocional manual OR descuento de promo vigente OR precio_lista. dias_en_fase = now - fecha del estado_comercial. security_invoker=on respeta RLS.';
