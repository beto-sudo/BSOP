-- Iniciativa dilesa-contratos-obra · Sprint Contratos→partidas · Fase 3 · ADR-042
-- Backfill: liga los contratos de obra históricos a su partida del presupuesto.
--
-- CONTEXTO. Hasta ADR-042 Fase 2, el alta de contrato no asignaba `partida_id`, así
-- que el comprometido de los contratos de obra no aparecía por partida en el Costeo
-- (solo en el KPI agregado "Contratado" por proyecto). De los 303 contratos DILESA,
-- 302 tenían `partida_id` NULL; pero 269 de ellos son `tipo='vivienda'`, que NO se
-- ligan a partidas de obra por diseño (se costean por lote/prototipo — ADR-042 deja
-- `partida_id` nullable para ellos). El backfill real son los **33 contratos de obra**
-- (urbanización/cabecera/tarea_menor). De esos 33, este script liga los **29** con
-- destino claro; los **4 restantes** quedan NULL (decisión de negocio de Beto, abajo).
--
-- MÉTODO DE MATCH (contrato → partida del MISMO proyecto, N:1 — ADR-042 §1):
--   - kw+monto  : keyword del frente (del código `OBRA-<proy>-<FRENTE>-<id>`) consistente
--                 Y `valor_total` = `presupuesto_aprobado` al centavo. Máxima confianza.
--   - kw-ancla  : keyword del frente; varios contratos del frente → la partida-concepto
--                 principal del frente (mayor presupuesto). El comprometido del frente
--                 queda agrupado en su partida ancla (p.ej. 6 contratos de electrificación
--                 LDLE → "Electrificación de lotes…"). Beto puede reasignar con <LigarPartida>.
--   - solo-monto: sin keyword (contratista, p.ej. ESTRELLA) pero `valor_total` cuadra al
--                 centavo con un concepto. Confiable (contrato y partida salieron del mismo Excel).
--
-- IDEMPOTENTE: solo toca filas con `partida_id IS NULL` de DILESA. Re-correrlo no re-liga.
-- SEGURO EN PREVIEW: el branch corre sin datos de prod (0 contratos) → 0 filas afectadas.
-- El JOIN a presupuesto_partidas valida que la partida pertenece al mismo proyecto del
-- contrato (defensa contra un UUID mal copiado).
--
-- Una vez ligado, el `valor_total` del contrato suma a `comprometido` de su partida en
-- `erp.v_partida_control` (cableado en ADR-042 Fase 0, migración 20260605190000), y el
-- Costeo lo muestra por renglón con su disponible (= aprobado − comprometido).

WITH mapeo(codigo, partida_id, metodo) AS (
  VALUES
    -- ── Lomas de los Encinos ───────────────────────────────────────────────
    ('OBRA-LDLE-AGUA_POTABLE_DRENAJE-B3', 'b8c347e2-a3de-42b5-9e1b-98cb6b13e1c7'::uuid, 'kw+monto'),   -- Instalación de red de drenaje sanitario (solo MO) 1era etapa
    ('OBRA-LDLE-AGUA_POTABLE_DRENAJE-G3', 'b8c347e2-a3de-42b5-9e1b-98cb6b13e1c7'::uuid, 'kw-ancla'),   -- Instalación de red de drenaje sanitario (solo MO) 1era etapa
    ('OBRA-LDLE-CORDON-C4',               '25fb4753-7d65-4697-9ebe-f462eaa74433'::uuid, 'kw+monto'),   -- Construcción de cordón guarnición (M.O.)
    ('OBRA-LDLE-ELECTRIFICACION-I4',      'ad0f503d-e1ad-4c67-ab93-22fc0419f483'::uuid, 'kw-ancla'),   -- Electrificación de lotes media y baja tensión y alumbrado público
    ('OBRA-LDLE-ELECTRIFICACION-C4',      'ad0f503d-e1ad-4c67-ab93-22fc0419f483'::uuid, 'kw-ancla'),   -- Electrificación de lotes media y baja tensión y alumbrado público
    ('OBRA-LDLE-ELECTRIFICACION-B81',     'ad0f503d-e1ad-4c67-ab93-22fc0419f483'::uuid, 'kw-ancla'),   -- Electrificación de lotes media y baja tensión y alumbrado público
    ('OBRA-LDLE-ELECTRIFICACION-C26',     'ad0f503d-e1ad-4c67-ab93-22fc0419f483'::uuid, 'kw-ancla'),   -- Electrificación de lotes media y baja tensión y alumbrado público
    ('OBRA-LDLE-ELECTRIFICACION-I65',     'ad0f503d-e1ad-4c67-ab93-22fc0419f483'::uuid, 'kw-ancla'),   -- Electrificación de lotes media y baja tensión y alumbrado público
    ('OBRA-LDLE-ELECTRIFICACION-C65',     'ad0f503d-e1ad-4c67-ab93-22fc0419f483'::uuid, 'kw-ancla'),   -- Electrificación de lotes media y baja tensión y alumbrado público
    ('OBRA-LDLE-MONOLITO-C4',             '6f285c58-6c04-400f-855b-380e34e49143'::uuid, 'kw-ancla'),   -- Entrada fraccionamiento (monolito y plaza)
    ('OBRA-LDLE-NOMENCLATURA-C5',         '562c0168-b6ef-4da9-8046-433092c0b291'::uuid, 'kw-ancla'),   -- Fabricación e instalación de nomenclaturas
    ('OBRA-LDLE-PAVIMENTACION-S4',        '579f92dd-1513-467d-9644-c974926a8ab1'::uuid, 'kw-ancla'),   -- Pavimentación
    ('OBRA-LDLE-PAVIMENTACION-C4',        '579f92dd-1513-467d-9644-c974926a8ab1'::uuid, 'kw-ancla'),   -- Pavimentación
    ('OBRA-LDLE-PAVIMENTACION-I4',        '579f92dd-1513-467d-9644-c974926a8ab1'::uuid, 'kw-ancla'),   -- Pavimentación
    ('OBRA-LDLE-PAVIMENTACION-O4',        '579f92dd-1513-467d-9644-c974926a8ab1'::uuid, 'kw-ancla'),   -- Pavimentación
    ('OBRA-LDLE-SIMAS-B6',                '54b4bf5e-bee7-4d1d-a427-254524c14022'::uuid, 'kw+monto'),   -- Derechos de interconexión agua potable
    -- ── Lomas del Sol ──────────────────────────────────────────────────────
    ('OBRA-LDS-BANQUETA-B3',              '76aa6e9d-b049-491d-b6d3-67da74c2611e'::uuid, 'kw-ancla'),   -- Banquetas excedentes de áreas verdes y municipales (MO y Materiales)
    ('OBRA-LDS-BANQUETA-K3',              '76aa6e9d-b049-491d-b6d3-67da74c2611e'::uuid, 'kw-ancla'),   -- Banquetas excedentes de áreas verdes y municipales (MO y Materiales)
    ('OBRA-LDS-BARDA-B3',                 'd61924b0-9270-4669-a5d0-28754e4833ba'::uuid, 'kw-ancla'),   -- Construcción de barda perimetral (Mano de Obra)
    ('OBRA-LDS-BARDA2-B3',                'd61924b0-9270-4669-a5d0-28754e4833ba'::uuid, 'kw-ancla'),   -- Construcción de barda perimetral (Mano de Obra)
    ('OBRA-LDS-CASETA-B3',                'a074ff39-2baf-41e6-8aed-b6db71232139'::uuid, 'kw+monto'),   -- Caseta de acceso
    ('OBRA-LDS-ELECTRIFICACION-C4',       '26b8cf99-a6df-4a2e-9e15-e04189d74c17'::uuid, 'kw+monto'),   -- Electrificación de lotes media y baja tensión y alumbrado público
    ('OBRA-LDS-ELECTRIFICACION-H4',       '26b8cf99-a6df-4a2e-9e15-e04189d74c17'::uuid, 'kw-ancla'),   -- Electrificación de lotes media y baja tensión y alumbrado público
    ('OBRA-LDS-ESTRELLA-B3',              'b5e0688e-ca8d-4a04-8683-e9d9c58a961f'::uuid, 'solo-monto'), -- Instalación de red de drenaje sanitario (solo MO)
    ('OBRA-LDS-ESTRELLA-G3',              'cae0688d-9990-428b-89f5-1eef0ad25ddd'::uuid, 'solo-monto'), -- Instalación de red de agua potable (solo MO)
    ('OBRA-LDS-ESTRELLA-L3',              '6921cfd9-52f3-43e1-ab8a-a90cf5f59507'::uuid, 'solo-monto'), -- Construcción de cordón guarnición (M.O.)
    ('OBRA-LDS-PAVIMENTACION-C4',         '5b20f274-fed5-4a61-89e2-f5a526d6aaba'::uuid, 'kw+monto'),   -- Pavimentación
    ('OBRA-LDS-PORTON-I4',                '28d075d4-1c2f-48c7-beb8-1ce8ee143a78'::uuid, 'kw-ancla'),   -- Control de acceso para porton y puerta peatonal
    ('OBRA-LDS-PORTON-C4',                '28d075d4-1c2f-48c7-beb8-1ce8ee143a78'::uuid, 'kw-ancla')    -- Control de acceso para porton y puerta peatonal
)
UPDATE dilesa.contratos_construccion c
SET partida_id = m.partida_id
FROM mapeo m
  JOIN erp.presupuesto_partidas pp ON pp.id = m.partida_id AND pp.deleted_at IS NULL
WHERE c.codigo = m.codigo
  AND c.empresa_id = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'
  AND c.proyecto_id = pp.proyecto_id   -- la partida es del mismo proyecto del contrato
  AND c.deleted_at IS NULL
  AND c.partida_id IS NULL;            -- idempotente: no re-liga lo ya ligado

-- ── 4 contratos SIN MATCH (NO se ligan aquí — decisión de Beto) ────────────
--   OBRA-LDLE-URBANIZACIÓN-C5  ($617,567)  frente genérico; sin concepto evidente.
--   OBRA-LDLE-VANDALIZADAS-C4  ($0)        reparación; al ser $0 no afecta el comprometido.
--   OBRA-LDS-ESTRELLA-P3       ($12,042)   sin concepto del proyecto que cuadre.
--   2026/1-DIE-MAYA-CAB#1      ($860,000)  Muro de contención (Lomas de las Delicias):
--     su proyecto solo tiene el catálogo seed sin montos → necesita capturar el
--     presupuesto de obra de Delicias antes de ligar (o ligar a una partida seed y
--     que el disponible quede negativo como alarma). Se liga con <LigarPartida> una
--     vez decidido el concepto destino.
