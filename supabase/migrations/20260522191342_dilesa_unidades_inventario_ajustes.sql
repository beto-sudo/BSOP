-- ════════════════════════════════════════════════════════════════════════════
-- Iniciativa dilesa-portafolio-activos · Sprint 3 — ajustes para Fase 3
-- (importación de Inventario → dilesa.unidades)
-- ════════════════════════════════════════════════════════════════════════════
--
-- El mapeo Coda → v2 (docs/planning/dilesa-portafolio-mapeo-coda.md §§ 4-5)
-- carga la tabla Inventario de Coda (1,590 lotes/casas) en dilesa.unidades.
-- `unidades` se diseñó delgada; tres ajustes, validados con Beto:
--
--   1. unidades — 8 columnas físicas del lote/casa (la tabla v2 base solo
--      tiene identificador/estado/area/precio/notas).
--   2. unidades.estado — el CHECK base era un placeholder genérico de 5
--      estados que nunca recibió datos; se reemplaza por el ciclo de vida
--      real del fraccionamiento (8 estados, obra + venta). La escrituración
--      va antes de la entrega.
--   3. activos.clave_interna — el schema base le puso UNIQUE NULLS NOT
--      DISTINCT; se corrige a UNIQUE normal (mismo fix que proyectos en
--      20260522131315). Landmine para activos futuros sin clave.

BEGIN;

-- ── 1) dilesa.unidades — campos físicos del lote/casa ────────────────────────
ALTER TABLE dilesa.unidades
  ADD COLUMN manzana            text,
  ADD COLUMN numero_lote        text,
  ADD COLUMN calle              text,
  ADD COLUMN numero_oficial     text,
  ADD COLUMN tipo_lote          text,
  ADD COLUMN es_esquina         boolean,
  ADD COLUMN tiene_frente_verde boolean,
  ADD COLUMN m2_construccion    numeric(14, 2);

COMMENT ON COLUMN dilesa.unidades.tipo_lote IS
  'Uso del lote desde Coda (Interés Social, Residencial Medio, Comercial, Área Verde, Equipamiento).';
COMMENT ON COLUMN dilesa.unidades.m2_construccion IS
  'M² de construcción; > 0 indica casa edificada sobre el lote.';

-- ── 2) dilesa.unidades.estado — ciclo de vida del fraccionamiento ────────────
-- El CHECK base (planeada/disponible/reservada/comprometida/cerrada) era un
-- placeholder genérico que nunca recibió datos. Se reemplaza por el ciclo
-- real: obra (planeada → lote_urbanizado → en_construccion → terminada) +
-- venta (asignada → vendida → escriturada → entregada). escriturada es la
-- desincorporación: la unidad deja de ser de DILESA, antes de la entrega.
ALTER TABLE dilesa.unidades DROP CONSTRAINT unidades_estado_check;
ALTER TABLE dilesa.unidades ADD CONSTRAINT unidades_estado_check CHECK (estado IN (
  'planeada', 'lote_urbanizado', 'en_construccion', 'terminada',
  'asignada', 'vendida', 'escriturada', 'entregada'
));

-- ── 3) dilesa.activos.clave_interna — fix UNIQUE NULLS NOT DISTINCT ──────────
-- Mismo error que proyectos.clave_interna (corregido en 20260522131315): la
-- clave es opcional; NULLS NOT DISTINCT trataría varios activos sin clave
-- como duplicados. UNIQUE normal: varios NULL OK, sin códigos repetidos por
-- empresa.
ALTER TABLE dilesa.activos DROP CONSTRAINT activos_clave_interna_empresa_uk;
ALTER TABLE dilesa.activos
  ADD CONSTRAINT activos_clave_interna_empresa_uk
  UNIQUE (empresa_id, clave_interna);

NOTIFY pgrst, 'reload schema';

COMMIT;
