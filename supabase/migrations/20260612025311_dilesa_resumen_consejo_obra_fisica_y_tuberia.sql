-- Fix post-cierre de dilesa-resumen-consejo: paridad real con las fórmulas Coda
-- en "en construcción" / "parque disponible" + saneo de la tubería de ventas.
-- Diagnóstico completo en docs/planning/dilesa-resumen-consejo.md (Bitácora
-- 2026-06-11). Decisiones de Beto 2026-06-11:
--   (a) Parque disponible = casas físicas no comprometidas (excluye
--       asignada/vendida/escriturada/entregada), no "lotes de vivienda sin
--       vender" (inflaba anteproyectos: Ampliación 354 / Delicias 163 sin un
--       solo ladrillo).
--   (b) TODAS las ventas en fase "Entregada" son operaciones ya terminadas
--       (el cutover real de ventas fue 2026-06-10, no 2026-05-23) → avanzar a
--       "Operación Terminada" para que la tubería refleje solo el flujo vivo.
--
-- 4 bloques:
--   1. dilesa.v_proyecto_avances — "Casas en Construcción" cuenta OBRA FÍSICA
--      activa (dilesa.construccion en_progreso), como la fórmula Coda
--      `[ID Construcción].Filter(Arranque.IsNotBlank() AND Estatus!="Terminada")`.
--      Antes contaba unidades.estado='en_construccion', que pierde la casa en
--      obra cuando se asigna a cliente (preventa: estado pasa a 'asignada') —
--      por eso Avances decía 11 y Contratistas 12. Parque disponible pasa a
--      "obra arrancada alguna vez, no comprometida, no demo" (Coda filtraba
--      arrancada + sin escriturar + Demo=false; Beto pidió además excluir
--      asignada/vendida). lotes_residenciales suma 'habitacional' (tipo_lote
--      con que se cargaron Ampliación/Delicias desde el plano — mostraban
--      "Lotes 0" con parque 354/163).
--   2. dilesa.v_inventario_prototipo — misma corrección de "en construcción"
--      (obra física activa por prototipo).
--   3. Data-fix tubería: Entregada (1,089) + Comision Pagada (1, fase legacy
--      fuera de catálogo) → Operación Terminada (posición 17), replicando el
--      flujo nativo de marcarFase (INSERT venta_fases + sync fase_actual);
--      grafía 'Solicitud de Dictaminacion' → 'Solicitud de Dictaminación'
--      (4 ventas que el correo no agrupaba con el catálogo); 5 ventas activas
--      con fase_actual NULL pero unidad ligada → fase coherente con su unidad
--      (4 entregadas → Operación Terminada; 1 asignada → Asignada).
--      Quedan 45 ventas activas sin fase NI unidad (residuo de migración Coda,
--      valor $0) — se revisan aparte, el correo las hace visibles como fila
--      "Sin fase" desde este PR.
--
-- Robustez Preview: los INSERT/UPDATE derivan de filas existentes (sin FKs
-- literales) → no-op en branch vacío.

BEGIN;

-- ── 1. v_proyecto_avances ────────────────────────────────────────────────────
-- Idéntica a 20260608011252 salvo: CTE obra_unidad nueva, agregados
-- en_obra_activa / parque_fisico, 'habitacional' en residenciales,
-- casas_en_construccion y parque_disponible re-fuenteados.

CREATE OR REPLACE VIEW dilesa.v_proyecto_avances WITH (security_invoker = on) AS
WITH obra_unidad AS (
  -- Resumen de obra física por unidad: activa = alguna construcción en
  -- progreso; arrancada = alguna construcción con fecha de arranque (la casa
  -- existe físicamente, en obra o ya construida).
  SELECT
    c.unidad_id,
    bool_or(c.estado = 'en_progreso') AS en_obra_activa,
    bool_or(c.fecha_arranque IS NOT NULL) AS arrancada
  FROM dilesa.construccion c
  WHERE c.deleted_at IS NULL
  GROUP BY c.unidad_id
), u AS (
  SELECT
    unidades.proyecto_id,
    count(*) AS total,
    count(*) FILTER (WHERE unidades.estado = ANY (ARRAY['terminada'::text, 'asignada'::text, 'vendida'::text, 'escriturada'::text, 'entregada'::text])) AS construidas,
    count(*) FILTER (WHERE unidades.estado = ANY (ARRAY['vendida'::text, 'escriturada'::text, 'entregada'::text, 'asignada'::text])) AS vendidas,
    count(*) FILTER (WHERE unidades.estado <> 'planeada'::text) AS con_avance_urb,
    -- Solo CASAS terminadas en inventario (con producto): un lote urbanizado
    -- terminado (sin casa) no es una casa terminada.
    count(*) FILTER (WHERE unidades.estado = 'terminada'::text AND unidades.producto_id IS NOT NULL) AS terminadas,
    -- OBRA FÍSICA activa (paridad Coda): construcción en progreso, sin
    -- importar el estado comercial de la unidad (una casa asignada en
    -- preventa sigue en obra hasta que la construcción termina).
    count(*) FILTER (WHERE COALESCE(ou.en_obra_activa, false)) AS en_construccion,
    count(*) FILTER (WHERE unidades.estado = 'escriturada'::text) AS escrituradas,
    count(*) FILTER (WHERE unidades.estado = 'asignada'::text) AS asignadas,
    count(*) FILTER (WHERE unidades.estado = 'entregada'::text) AS entregadas,
    count(*) FILTER (WHERE unidades.estado = ANY (ARRAY['vendida'::text, 'escriturada'::text, 'entregada'::text])) AS formalizadas,
    count(*) FILTER (WHERE unidades.es_muestra) AS muestra,
    count(*) FILTER (WHERE unidades.estado = 'terminada'::text AND NOT unidades.es_muestra) AS disponible_venta,
    count(*) FILTER (WHERE unidades.tipo_lote = 'Comercial'::text) AS comerciales,
    -- 'habitacional': tipo con que la carga de plano registra los lotes de
    -- anteproyectos (Ampliación LDE / Delicias) — es vivienda.
    count(*) FILTER (WHERE unidades.tipo_lote = ANY (ARRAY['Interes Social'::text, 'Residencial Medio'::text, 'Residencial'::text, 'habitacional'::text])) AS residenciales,
    avg(unidades.area_m2) AS lote_promedio_m2,
    avg(unidades.precio) FILTER (WHERE (unidades.estado = ANY (ARRAY['vendida'::text, 'escriturada'::text, 'entregada'::text])) AND unidades.precio IS NOT NULL) AS ticket_promedio,
    sum(unidades.precio) FILTER (WHERE (unidades.estado = ANY (ARRAY['vendida'::text, 'escriturada'::text, 'entregada'::text])) AND unidades.precio IS NOT NULL) AS ventas_totales,
    -- VIVIENDA ACTIVA: base para avance de construcción/ventas y estado
    -- sugerido. Excluye no-vivienda (comercial / donación municipal / área
    -- verde / equipamiento) y unidades ya liberadas al portafolio (activo_id).
    count(*) FILTER (
      WHERE unidades.activo_id IS NULL
        AND lower(coalesce(unidades.tipo_lote, '')) !~ '(comercial|municipal|donaci|area verde|equipamiento)'
    ) AS viv_total,
    -- CONSTRUIDA = producto final formalizado (vendida/escriturada/entregada,
    -- sea casa o lote vendido como lote) O casa terminada en inventario
    -- (terminada CON producto). Excluye lotes urbanizados sin vender
    -- ('terminada' sin producto) y 'asignada' (preventa, puede no estar
    -- construida).
    count(*) FILTER (
      WHERE unidades.activo_id IS NULL
        AND lower(coalesce(unidades.tipo_lote, '')) !~ '(comercial|municipal|donaci|area verde|equipamiento)'
        AND (
          unidades.estado = ANY (ARRAY['vendida'::text, 'escriturada'::text, 'entregada'::text])
          OR (unidades.estado = 'terminada'::text AND unidades.producto_id IS NOT NULL)
        )
    ) AS viv_construidas,
    count(*) FILTER (
      WHERE unidades.activo_id IS NULL
        AND lower(coalesce(unidades.tipo_lote, '')) !~ '(comercial|municipal|donaci|area verde|equipamiento)'
        AND unidades.estado = ANY (ARRAY['vendida'::text, 'escriturada'::text, 'entregada'::text, 'asignada'::text])
    ) AS viv_vendidas,
    -- PARQUE DISPONIBLE físico (fórmula Coda + decisión Beto 2026-06-11):
    -- casas con obra arrancada alguna vez (existen físicamente: en obra o
    -- terminadas), NO comprometidas con cliente (excluye asignada/vendida/
    -- escriturada/entregada) y que no son casa muestra.
    count(*) FILTER (
      WHERE COALESCE(ou.arrancada, false)
        AND (unidades.estado IS NULL OR unidades.estado <> ALL (ARRAY['asignada'::text, 'vendida'::text, 'escriturada'::text, 'entregada'::text]))
        AND NOT unidades.es_muestra
    ) AS parque_fisico
  FROM dilesa.unidades unidades
  LEFT JOIN obra_unidad ou ON ou.unidad_id = unidades.id
  WHERE unidades.deleted_at IS NULL
  GROUP BY unidades.proyecto_id
)
SELECT
  p.id AS proyecto_id,
  p.empresa_id,
  COALESCE(u.total, 0::bigint) AS lotes_total,
  COALESCE(u.construidas, 0::bigint) AS lotes_construidos,
  COALESCE(u.vendidas, 0::bigint) AS lotes_vendidos,
  COALESCE(u.con_avance_urb, 0::bigint) AS lotes_urbanizados,
  COALESCE(u.terminadas, 0::bigint) AS casas_terminadas,
  COALESCE(u.en_construccion, 0::bigint) AS casas_en_construccion,
  COALESCE(u.escrituradas, 0::bigint) AS casas_escrituradas,
  CASE WHEN u.total > 0 THEN round(100.0 * u.con_avance_urb::numeric / u.total::numeric, 2) ELSE NULL::numeric END AS avance_urb_pct,
  -- Avance de construcción = casas terminadas / total lotes vivienda activa.
  CASE WHEN u.viv_total > 0 THEN round(100.0 * u.viv_construidas::numeric / u.viv_total::numeric, 2) ELSE NULL::numeric END AS avance_const_pct,
  CASE WHEN u.viv_total > 0 THEN round(100.0 * u.viv_vendidas::numeric / u.viv_total::numeric, 2) ELSE NULL::numeric END AS avance_vts_pct,
  COALESCE(u.parque_fisico, 0::bigint) AS parque_disponible,
  u.ticket_promedio,
  COALESCE(u.ventas_totales, 0::numeric) AS ventas_totales,
  -- Estado sugerido: completado cuando la VIVIENDA activa está 100% construida
  -- y 100% vendida. Si el proyecto no tiene vivienda activa (anteproyecto, o
  -- todo liberado al portafolio) preserva el estado real.
  CASE
    WHEN u.viv_total IS NULL OR u.viv_total = 0 THEN p.estado
    WHEN u.viv_construidas = u.viv_total AND u.viv_vendidas = u.viv_total THEN 'completado'::text
    ELSE 'ejecutando'::text
  END AS estado_sugerido,
  p.estado AS estado_actual,
  p.tipo,
  COALESCE(u.asignadas, 0::bigint) AS casas_asignadas,
  COALESCE(u.entregadas, 0::bigint) AS casas_entregadas,
  COALESCE(u.muestra, 0::bigint) AS casas_muestra,
  COALESCE(u.formalizadas, 0::bigint) AS inventario_formalizado,
  COALESCE(u.disponible_venta, 0::bigint) AS inventario_disponible_venta,
  COALESCE(u.comerciales, 0::bigint) AS lotes_comerciales,
  COALESCE(u.residenciales, 0::bigint) AS lotes_residenciales,
  u.lote_promedio_m2 AS tamano_lote_promedio_m2,
  CASE
    WHEN p.area_residencial_m2 IS NULL OR p.area_residencial_m2 <= 0::numeric THEN NULL::numeric
    ELSE round(COALESCE(u.residenciales, 0::bigint)::numeric / (p.area_residencial_m2 / 10000.0), 2)
  END AS densidad_vivienda
FROM dilesa.proyectos p
LEFT JOIN u ON u.proyecto_id = p.id
WHERE p.deleted_at IS NULL;

-- ── 2. v_inventario_prototipo ────────────────────────────────────────────────
-- "En construcción" = obra física activa por prototipo (misma paridad Coda).
-- en_inventario sigue siendo por estado (en_construccion+terminada+asignada):
-- es la existencia física no escriturada y ya cuadraba con Coda.

CREATE OR REPLACE VIEW dilesa.v_inventario_prototipo WITH (security_invoker = on) AS
WITH obra_unidad AS (
  SELECT c.unidad_id, bool_or(c.estado = 'en_progreso') AS en_obra_activa
  FROM dilesa.construccion c
  WHERE c.deleted_at IS NULL
  GROUP BY c.unidad_id
)
SELECT
  u.producto_id AS prototipo_id,
  u.empresa_id,
  COUNT(*) FILTER (WHERE COALESCE(ou.en_obra_activa, false))         AS inventario_construccion,
  COUNT(*) FILTER (WHERE u.estado = 'terminada')                      AS inventario_terminado,
  COUNT(*) FILTER (WHERE u.estado = 'asignada')                       AS inventario_asignado,
  COUNT(*) FILTER (WHERE u.estado IN ('en_construccion', 'terminada', 'asignada')) AS en_inventario,
  COUNT(*) FILTER (WHERE u.estado = 'terminada' AND NOT u.es_muestra) AS inventario_disponible
FROM dilesa.unidades u
LEFT JOIN obra_unidad ou ON ou.unidad_id = u.id
WHERE u.deleted_at IS NULL
  AND u.producto_id IS NOT NULL
GROUP BY u.producto_id, u.empresa_id;

-- ── 3. Data-fix tubería ──────────────────────────────────────────────────────

-- 3a. Operaciones históricas: Entregada + Comision Pagada (legacy) → Operación
-- Terminada. Replica marcarFase: INSERT en venta_fases (señal de fase cerrada,
-- fecha = hoy, que es cuando se cierra administrativamente) + sync del caché
-- fase_actual/fase_posicion. Sin fila para la fase 16 (Conformidad del
-- Cliente): no se registró ese hecho y no se fabrica.
INSERT INTO dilesa.venta_fases (empresa_id, venta_id, fase, posicion, fecha, notas)
SELECT v.empresa_id, v.id, 'Operación Terminada', 17, CURRENT_DATE,
       'Cierre administrativo de operación histórica (data-fix tubería resumen-consejo)'
FROM dilesa.ventas v
WHERE v.deleted_at IS NULL
  AND v.fase_actual IN ('Entregada', 'Comision Pagada')
  AND NOT EXISTS (
    SELECT 1 FROM dilesa.venta_fases vf
    WHERE vf.venta_id = v.id AND vf.fase = 'Operación Terminada' AND vf.deleted_at IS NULL
  );

UPDATE dilesa.ventas
SET fase_actual = 'Operación Terminada', fase_posicion = 17
WHERE deleted_at IS NULL
  AND fase_actual IN ('Entregada', 'Comision Pagada');

-- 3b. Grafía fuera de catálogo (sin tilde): el correo agrupa por nombre exacto
-- del catálogo y estas 4 ventas quedaban fuera del conteo de su fase.
UPDATE dilesa.ventas
SET fase_actual = 'Solicitud de Dictaminación'
WHERE deleted_at IS NULL
  AND fase_actual = 'Solicitud de Dictaminacion';

-- 3c. Ventas activas sin fase pero con unidad entregada → Operación Terminada
-- (mismo criterio que 3a: ya concluyeron).
INSERT INTO dilesa.venta_fases (empresa_id, venta_id, fase, posicion, fecha, notas)
SELECT v.empresa_id, v.id, 'Operación Terminada', 17, CURRENT_DATE,
       'Cierre administrativo: venta sin fase con unidad entregada (data-fix tubería resumen-consejo)'
FROM dilesa.ventas v
JOIN dilesa.unidades u ON u.id = v.unidad_id AND u.deleted_at IS NULL
WHERE v.deleted_at IS NULL AND v.estado = 'activa' AND v.fase_actual IS NULL
  AND u.estado = 'entregada'
  AND NOT EXISTS (
    SELECT 1 FROM dilesa.venta_fases vf
    WHERE vf.venta_id = v.id AND vf.fase = 'Operación Terminada' AND vf.deleted_at IS NULL
  );

UPDATE dilesa.ventas v
SET fase_actual = 'Operación Terminada', fase_posicion = 17
FROM dilesa.unidades u
WHERE u.id = v.unidad_id AND u.deleted_at IS NULL
  AND v.deleted_at IS NULL AND v.estado = 'activa' AND v.fase_actual IS NULL
  AND u.estado = 'entregada';

-- 3d. Venta activa sin fase con unidad asignada → Asignada (posición 2).
-- La fecha usa su última fase registrada (no CURRENT_DATE) para no inflar las
-- asignaciones del mes en curso en el correo al Consejo.
INSERT INTO dilesa.venta_fases (empresa_id, venta_id, fase, posicion, fecha, notas)
SELECT v.empresa_id, v.id, 'Asignada', 2,
       COALESCE(
         (SELECT max(vf.fecha) FROM dilesa.venta_fases vf
          WHERE vf.venta_id = v.id AND vf.deleted_at IS NULL),
         CURRENT_DATE
       ),
       'Sincronización de fase con unidad asignada (data-fix tubería resumen-consejo)'
FROM dilesa.ventas v
JOIN dilesa.unidades u ON u.id = v.unidad_id AND u.deleted_at IS NULL
WHERE v.deleted_at IS NULL AND v.estado = 'activa' AND v.fase_actual IS NULL
  AND u.estado = 'asignada'
  AND NOT EXISTS (
    SELECT 1 FROM dilesa.venta_fases vf
    WHERE vf.venta_id = v.id AND vf.fase = 'Asignada' AND vf.deleted_at IS NULL
  );

UPDATE dilesa.ventas v
SET fase_actual = 'Asignada', fase_posicion = 2
FROM dilesa.unidades u
WHERE u.id = v.unidad_id AND u.deleted_at IS NULL
  AND v.deleted_at IS NULL AND v.estado = 'activa' AND v.fase_actual IS NULL
  AND u.estado = 'asignada';

-- ── 4. Recargar PostgREST ────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;
