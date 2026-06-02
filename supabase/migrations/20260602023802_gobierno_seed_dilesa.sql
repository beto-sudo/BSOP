-- ============================================================================
-- gobierno-corporativo · Sprint 4a — seed DILESA (datos del Reglamento ago-2021
-- + headers de las 35 actas del índice "1 RESUMEN ACTAS.xlsx").
--
-- Solo data (sin DDL). Guardado por slug='dilesa' (INSERT…SELECT FROM
-- core.empresas) → no-op en Preview branches sin datos de prod. Idempotente vía
-- NOT EXISTS / ON CONFLICT. Todo editable después en los tabs de gobierno.
--
-- Pendiente de completar por Beto en la UI: día exacto del reglamento, consejo
-- actual + quién ostenta hoy el voto de CHC. Los PDFs y los acuerdos/votos se
-- cargan en Sprints 4b/4c.
-- ============================================================================
BEGIN;

-- ── 1) Cuadro accionario (3 socios al 33.33%) ────────────────────────────────
INSERT INTO core.empresa_socios (empresa_id, nombre, familia, tipo, socio_empresa_id, porcentaje, orden, activo)
SELECT e.id, v.nombre, v.familia, 'entidad', v.socio_empresa_id, v.porcentaje, v.orden, true
FROM core.empresas e
CROSS JOIN (
  VALUES
    ('Nigropetense Inmobiliaria S.A.', 'Santos de los Santos', (SELECT id FROM core.empresas WHERE slug = 'nigeno'), 33.3333::numeric, 1),
    ('Inmobiliaria CHC', 'Chavarría Cruz', NULL::uuid, 33.3333::numeric, 2),
    ('Gesan Inmobiliaria del Bravo, SA de CV', 'Santos Diego', NULL::uuid, 33.3334::numeric, 3)
) AS v(nombre, familia, socio_empresa_id, porcentaje, orden)
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM core.empresa_socios s WHERE s.empresa_id = e.id AND s.nombre = v.nombre
  );

-- ── 2) Config de gobierno ────────────────────────────────────────────────────
INSERT INTO core.gobierno_config (
  empresa_id, reglamento_fecha, mandato_meses_default, consejo_max_miembros,
  consejo_sesiones_por_anio, dividendo_anual_monto, dividendo_moneda,
  tanto_aplica, tanto_orden_prelacion, notas
)
SELECT e.id, DATE '2021-08-01', 36, 8, 12, 12000000, 'MXN', true,
  '1) Otros accionistas de la sociedad de quien quiere vender; 2) accionistas de las otras dos sociedades propietarias; 3) la sociedad misma (DILESA). No se puede vender a no-accionistas.',
  'Sembrado del Reglamento de Gobierno DILESA (ago-2021). Día exacto del reglamento por confirmar.'
FROM core.empresas e
WHERE e.slug = 'dilesa'
ON CONFLICT (empresa_id) DO NOTHING;

-- ── 3) Mayorías por decisión ─────────────────────────────────────────────────
INSERT INTO core.gobierno_mayorias (empresa_id, tipo_decision, organo, quorum_pct, umbral_pct, orden, notas)
SELECT e.id, v.tipo_decision, v.organo, v.quorum_pct, v.umbral_pct, v.orden, v.notas
FROM core.empresas e
CROSS JOIN (
  VALUES
    ('Decisiones del consejo (general)', 'consejo', NULL::numeric, 66.67::numeric, 1, 'Reglamento 2.4.6: consenso; si no, mayoría por representación accionaria = 2 de 3 consejeros con voto.'),
    ('Cese de consejero', 'consejo', NULL::numeric, 60.00::numeric, 2, 'Reglamento 5.2.4: ≥60% de las acciones.'),
    ('Nombramiento de consejero independiente', 'asamblea', NULL::numeric, 51.00::numeric, 3, 'Reglamento 5.1.4.2: visto bueno de ≥51% de la propiedad.'),
    ('Escisión de la sociedad', 'asamblea', NULL::numeric, 66.67::numeric, 4, 'Reglamento 1.1.5: basta que 2 de 3 sociedades lo deseen.')
) AS v(tipo_decision, organo, quorum_pct, umbral_pct, orden, notas)
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM core.gobierno_mayorias m WHERE m.empresa_id = e.id AND m.tipo_decision = v.tipo_decision
  );

-- ── 4) Consejeros: baseline explícito del Reglamento ─────────────────────────
-- Vitalicios del consejo (3.2.2) + Comité Directivo (10.3.2). El resto del
-- consejo actual + voto de CHC los completa Beto en la UI.
INSERT INTO core.gobierno_consejeros (empresa_id, organo, socio_id, nombre, cargo, ostenta_voto, vitalicio, activo, notas)
SELECT e.id, v.organo,
  (SELECT id FROM core.empresa_socios s WHERE s.empresa_id = e.id AND s.nombre = v.socio_nombre),
  v.nombre, v.cargo, v.ostenta_voto, v.vitalicio, true, v.notas
FROM core.empresas e
CROSS JOIN (
  VALUES
    ('consejo', 'Gesan Inmobiliaria del Bravo, SA de CV', 'Gerardo Santos Benavides', 'propietario', true, true, 'Consejero fundador vitalicio (Reglamento 3.2.2).'),
    ('consejo', 'Nigropetense Inmobiliaria S.A.', 'Urbano Santos Benavides', 'propietario', true, true, 'Consejero fundador vitalicio (Reglamento 3.2.2).'),
    ('comite_directivo', 'Inmobiliaria CHC', 'Alejandra Chavarría Cruz', 'miembro', false, false, 'Comité Directivo (Reglamento 10.3.2).'),
    ('comite_directivo', 'Gesan Inmobiliaria del Bravo, SA de CV', 'Michelle Santos Diego', 'miembro', false, false, 'Comité Directivo (Reglamento 10.3.2).'),
    ('comite_directivo', 'Nigropetense Inmobiliaria S.A.', 'Adalberto Santos de los Santos', 'miembro', false, false, 'Comité Directivo (Reglamento 10.3.2).')
) AS v(organo, socio_nombre, nombre, cargo, ostenta_voto, vitalicio, notas)
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM core.gobierno_consejeros c
    WHERE c.empresa_id = e.id AND c.nombre = v.nombre AND c.organo = v.organo
  );

-- ── 5) Headers de las 35 actas (índice "1 RESUMEN ACTAS.xlsx") ────────────────
-- Fecha = serial Excel (epoch 1899-12-30). tipo: RESULTADOS → ordinaria; resto →
-- extraordinaria. estado: protocolizadas (1,31,32,34) → protocolizada; resto →
-- firmada. PDFs y acuerdos/votos se cargan en 4b/4c.
INSERT INTO core.gobierno_actas (empresa_id, folio, tipo, fecha, asunto, protocolizada, estado)
SELECT e.id,
  v.folio,
  CASE WHEN v.concepto ILIKE '%RESULTADOS%' THEN 'ordinaria' ELSE 'extraordinaria' END,
  DATE '1899-12-30' + v.serial,
  v.concepto,
  v.protocolizada,
  CASE WHEN v.protocolizada THEN 'protocolizada' ELSE 'firmada' END
FROM core.empresas e
CROSS JOIN (
  VALUES
    ('1', 'Apertura', 37868, true),
    ('2', 'Incremento de capital', 38076, false),
    ('3', 'Resultados 2003', 38107, false),
    ('4', 'Resultados 2003', 38103, false),
    ('5', 'Resultados 2004', 38467, false),
    ('6', 'Resultados 2005', 38831, false),
    ('7', 'Resultados 2006', 39195, false),
    ('8', 'Venta acciones Nigropetense Inmobiliaria', 39300, false),
    ('9', 'Resultados 2007', 39562, false),
    ('10', 'Resultados 2008', 39927, false),
    ('11', 'Resultados 2009', 40269, false),
    ('12', 'Venta acciones Gesan Inmobiliaria', 40576, false),
    ('13', 'Resultados 2010', 40665, false),
    ('14', 'Resultados 2011', 41029, false),
    ('15', 'Resultados 2012', 41394, false),
    ('16', 'Administrador Adalberto', 41442, false),
    ('17', 'Venta de acciones CHC Inmobiliaria', 41529, false),
    ('18', 'Aumento de capital', 41618, false),
    ('19', 'Aumento de capital', 42129, false),
    ('20', 'Administrador único Adalberto', 42251, false),
    ('21', 'Resultados 2013', 42255, false),
    ('22', 'Resultados 2014', 42256, false),
    ('23', 'Revaluación de inventario', 42369, false),
    ('24', 'Resultados 2015', 42623, false),
    ('25', 'Consejo de Administración', 42898, false),
    ('26', 'Resultados 2016', 42830, false),
    ('27', 'Resultados 2017', 43192, false),
    ('28', 'Resultados 2018', 43592, false),
    ('29', 'Resultados 2019', 43929, false),
    ('30', 'Resultados 2020', 44314, false),
    ('31', 'Modificación de objeto social', 44398, true),
    ('32', 'Consejo de Administración', 44410, true),
    ('33', 'Resultados 2021', 44678, false),
    ('34', 'Otorgamiento de poderes consejo', 44750, true),
    ('35', 'Resultados 2022', 45049, false)
) AS v(folio, concepto, serial, protocolizada)
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM core.gobierno_actas a WHERE a.empresa_id = e.id AND a.folio = v.folio
  );

COMMIT;
