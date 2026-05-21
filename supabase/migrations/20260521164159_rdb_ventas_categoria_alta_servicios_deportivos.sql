-- MIGRATION: rdb-ventas-por-categoria Sprint 2 — alta de servicios deportivos en el catálogo
--
-- CONTEXTO:
--   El tab "Por categoría" (Sprint 1) dejaba ~24.7% del importe en "Sin
--   categoría": servicios deportivos de alto ticket (torneos, academias,
--   uso de cancha con coach) que se cobran en el POS Waitry pero no
--   estaban dados de alta en erp.productos.
--
-- ALCANCE:
--   1. 3 categorías nuevas en erp.categorias_producto (RDB): Torneos,
--      Academias, Uso de cancha (orden 91-93, después de "Servicios").
--   2. 19 productos en erp.productos con codigo = product_id de Waitry.
--      La vista rdb.v_waitry_productos_categoria (Sprint 1) los resuelve
--      automáticamente vía el JOIN codigo = product_id.
--
--   NOTA — product_id reusado: Waitry reutiliza product_id entre
--   productos (ej. 1298687 factura "Torneo Pádel Open" y "Torneo Master
--   Class"). Por eso se da de alta 1 producto por product_id distinto,
--   no por nombre; el nombre de catálogo es representativo. Todos los IDs
--   reusados agrupan productos de la misma familia → la categoría
--   resultante es correcta. El mapping estable lo resolverá la iniciativa
--   rdb-waitry-catalog-sync.
--
--   tipo='servicio', inventariable=false, clasificacion default
--   ('inventariable') — replica el patrón de los 21 servicios ya
--   existentes en la categoría "Servicios".
--
--   Lista de las 19 altas revisada y aprobada explícitamente por Beto
--   (2026-05-21) antes de aplicar.
--
-- ROBUSTEZ:
--   Los INSERT se condicionan a que la empresa RDB exista en core.empresas
--   (JOIN) y a que la categoría / codigo no estén ya presentes (NOT
--   EXISTS). Así la migración es idempotente y no-op en branches sin los
--   datos de producción (ej. Supabase Preview), donde core.empresas está
--   vacía y un INSERT directo violaría la FK empresa_id.

-- 1. Categorías nuevas — solo si la empresa RDB existe y aún no están.
INSERT INTO erp.categorias_producto (empresa_id, nombre, color, orden)
SELECT e.id, v.nombre, v.color, v.orden
FROM (VALUES
  ('Torneos',       '#e11d48', 91),
  ('Academias',     '#ea580c', 92),
  ('Uso de cancha', '#0d9488', 93)
) AS v(nombre, color, orden)
JOIN core.empresas e ON e.id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
WHERE NOT EXISTS (
  SELECT 1 FROM erp.categorias_producto c
  WHERE c.empresa_id = e.id AND c.nombre = v.nombre
);

-- 2. Productos-servicio — codigo = product_id de Waitry. Solo si la
--    empresa existe y el codigo aún no está en su catálogo.
INSERT INTO erp.productos (empresa_id, categoria_id, codigo, nombre, tipo, unidad, inventariable, activo)
SELECT e.id, c.id, v.codigo, v.nombre, 'servicio', 'pieza', false, true
FROM (VALUES
  ('1298687', 'Torneo Pádel Open',                   'Torneos'),
  ('1364566', 'Torneo Tenis Open',                   'Torneos'),
  ('1298690', 'Rey de la Cancha',                    'Torneos'),
  ('1402244', 'Torneo del amor y la amistad',        'Torneos'),
  ('1298688', 'Reina de la Cancha',                  'Torneos'),
  ('1298704', 'Torneo Tenis Open (2da categoría)',   'Torneos'),
  ('1364565', 'Minitenis Tenis Open (con playera)',  'Torneos'),
  ('1441142', 'Torneo del día de las madres',        'Torneos'),
  ('1364567', 'Minitenis Tenis Open',                'Torneos'),
  ('1363790', 'Torneo Master Class',                 'Torneos'),
  ('1298709', 'Academia Tenis',                      'Academias'),
  ('1298695', 'Clase privada (Carlos)',              'Academias'),
  ('1436058', 'Clínica especializada',               'Academias'),
  ('1298705', 'Clase particular (Aníbal)',           'Academias'),
  ('1298701', 'Uso de cancha con coach',             'Uso de cancha'),
  ('1298713', 'Uso de cancha con coach (Aníbal)',    'Uso de cancha'),
  ('1298712', 'Uso de cancha con coach PREMIUM',     'Uso de cancha'),
  ('1298700', 'Uso de cancha con coach PREMIUM (Omar)', 'Uso de cancha'),
  ('1435704', 'Uso de cancha con coach PREMIUM (Hugo)', 'Uso de cancha')
) AS v(codigo, nombre, categoria)
JOIN core.empresas e ON e.id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
JOIN erp.categorias_producto c ON c.empresa_id = e.id AND c.nombre = v.categoria
WHERE NOT EXISTS (
  SELECT 1 FROM erp.productos p
  WHERE p.empresa_id = e.id AND p.codigo = v.codigo
);

-- Verificación inline — estricta solo donde la empresa RDB existe
-- (producción). En branches sin datos la migración es no-op y pasa igual.
DO $$
DECLARE
  v_empresa_existe boolean;
  v_cats  integer;
  v_prods integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM core.empresas
    WHERE id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
  ) INTO v_empresa_existe;

  IF NOT v_empresa_existe THEN
    RAISE NOTICE 'Empresa RDB ausente (branch sin datos de producción) — migración no-op.';
    RETURN;
  END IF;

  SELECT count(*) INTO v_cats
  FROM erp.categorias_producto
  WHERE empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
    AND nombre IN ('Torneos', 'Academias', 'Uso de cancha');

  SELECT count(*) INTO v_prods
  FROM erp.productos p
  JOIN erp.categorias_producto c ON c.id = p.categoria_id
  WHERE c.empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid
    AND c.nombre IN ('Torneos', 'Academias', 'Uso de cancha');

  IF v_cats <> 3 THEN
    RAISE EXCEPTION 'Esperaba 3 categorías nuevas, hay %', v_cats;
  END IF;
  IF v_prods <> 19 THEN
    RAISE EXCEPTION 'Esperaba 19 productos en las categorías nuevas, hay %', v_prods;
  END IF;

  RAISE NOTICE 'Sprint 2 OK: % categorías nuevas, % productos-servicio dados de alta', v_cats, v_prods;
END;
$$;
