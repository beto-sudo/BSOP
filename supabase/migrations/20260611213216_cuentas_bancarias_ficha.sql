-- ╭─ 20260611213216_cuentas_bancarias_ficha ─╮
-- Iniciativa: conciliacion-bancaria · Fase A — ficha completa de cuentas
-- bancarias DILESA + alta de Afirme + snapshots baseline al 31-may-2026.
-- Fuente: estados de cuenta de mayo 2026 (Afirme, BBVA MN, Monex).
-- Ver docs/planning/conciliacion-bancaria.md
--
-- 1. Columnas de ficha en erp.cuentas_bancarias (datos operativos que hoy no
--    tienen dónde vivir: número de cliente, contrato, sucursal, contacto...).
-- 2. moneda como text plano ('MXN'|'USD'): el catálogo de monedas que
--    moneda_id esperaba nunca existió; el heurístico por nombre se reemplaza
--    por esta columna (la UI cae al heurístico si viene null).
-- 3. UPDATE de las 4 cuentas DILESA con los datos reales de los estados.
-- 4. INSERT de la cuenta Afirme (no estaba dada de alta).
-- 5. Snapshots de saldo al corte 31-may-2026 en erp.cuenta_saldos como
--    baseline de conciliación (anteriores a las capturas de junio, así que
--    NO pisan el "saldo actual" de v_cuenta_saldo_actual).

BEGIN;

-- ── 1+2. Columnas de ficha ───────────────────────────────────────────────────

-- `tipo` ya existe con CHECK ('cheques','ahorro','inversion','credito') —
-- es la clase operativa de la cuenta. El nombre comercial del producto
-- bancario ("Maestra Pyme", "Líder PYME") va en la columna nueva `producto`.
ALTER TABLE erp.cuentas_bancarias
  ADD COLUMN IF NOT EXISTS producto       text,
  ADD COLUMN IF NOT EXISTS numero_cliente text,
  ADD COLUMN IF NOT EXISTS contrato       text,
  ADD COLUMN IF NOT EXISTS sucursal       text,
  ADD COLUMN IF NOT EXISTS telefono       text,
  ADD COLUMN IF NOT EXISTS contacto       text,
  ADD COLUMN IF NOT EXISTS titular        text,
  ADD COLUMN IF NOT EXISTS moneda         text,
  ADD COLUMN IF NOT EXISTS notas          text;

-- CHECK suave: solo monedas que el módulo sabe manejar (NULL permitido — las
-- cuentas que se den de alta sin moneda caen al heurístico por nombre).
ALTER TABLE erp.cuentas_bancarias
  DROP CONSTRAINT IF EXISTS cuentas_bancarias_moneda_check;
ALTER TABLE erp.cuentas_bancarias
  ADD CONSTRAINT cuentas_bancarias_moneda_check
  CHECK (moneda IS NULL OR moneda IN ('MXN', 'USD'));

-- ── 3. Ficha de las 4 cuentas existentes (datos de los estados de mayo) ─────
-- Scoped a DILESA por empresa (JOIN, robusto a Preview sin datos).

UPDATE erp.cuentas_bancarias cb
SET tipo           = 'cheques',
    producto       = 'Maestra Pyme',
    numero_cuenta  = '0141502492',
    clabe          = '012068001415024927',
    numero_cliente = '49331625',
    sucursal       = '0832 Empresas Saltillo',
    telefono       = '411-1911',
    titular        = 'Desarrollo Inmobiliario Los Encinos SA de CV',
    moneda         = 'MXN',
    notas          = 'Cuenta operativa principal (SPEI a proveedores, recibe Infonavit/puentes).',
    updated_at     = now()
FROM core.empresas e
WHERE cb.empresa_id = e.id AND e.nombre ILIKE '%dilesa%'
  AND cb.nombre = 'BBVA Bancomer';

UPDATE erp.cuentas_bancarias cb
SET tipo       = 'cheques',
    titular    = 'Desarrollo Inmobiliario Los Encinos SA de CV',
    moneda     = 'USD',
    notas      = 'Ficha pendiente: falta estado de cuenta (número, CLABE, cliente).',
    updated_at = now()
FROM core.empresas e
WHERE cb.empresa_id = e.id AND e.nombre ILIKE '%dilesa%'
  AND cb.nombre = 'BBVA Bancomer Dólares';

UPDATE erp.cuentas_bancarias cb
SET tipo       = 'inversion',
    titular    = 'Desarrollo Inmobiliario Los Encinos SA de CV',
    moneda     = 'MXN',
    notas      = 'Casa de bolsa. Ficha pendiente: falta estado de cuenta (contrato, cliente).',
    updated_at = now()
FROM core.empresas e
WHERE cb.empresa_id = e.id AND e.nombre ILIKE '%dilesa%'
  AND cb.nombre = 'Casa de Bolsa Finamex';

UPDATE erp.cuentas_bancarias cb
SET tipo           = 'inversion',
    producto       = 'Persona moral + divisas',
    clabe          = '112075000037310071',
    numero_cliente = '4975587',
    contrato       = '3731007',
    sucursal       = 'Piedras Negras',
    telefono       = '878-795-1920',
    contacto       = 'Brenda Guadalupe Ponce Martínez (asesora)',
    titular        = 'Desarrollo Inmobiliario Los Encinos SA de CV',
    moneda         = 'MXN',
    notas          = 'Tesorería de inversión: el saldo opera en reporto overnight (vista + posición en reporto). El estado de cuenta reporta ambos por separado.',
    updated_at     = now()
FROM core.empresas e
WHERE cb.empresa_id = e.id AND e.nombre ILIKE '%dilesa%'
  AND cb.nombre = 'Monex Grupo Financiero';

-- ── 4. Alta de Afirme ────────────────────────────────────────────────────────

INSERT INTO erp.cuentas_bancarias
  (empresa_id, nombre, banco, tipo, producto, numero_cuenta, clabe, numero_cliente,
   sucursal, telefono, titular, moneda, notas, activo)
SELECT e.id, 'Afirme', 'Banca Afirme', 'cheques', 'Líder PYME', '011391019454',
       '062075113910194542', '6560119',
       'Piedras Negras (Blvd E. Mendoza Berrueto 2612)', '81-8318-3990',
       'Desarrollo Inmobiliario Los Encinos SA de CV', 'MXN',
       'Cuenta puente: recibe traspasos OTECA y depósitos con cheque, barre a BBVA. Saldo mínimo requerido $2,500. CFDI de comisiones sale a RFC genérico XAXX010101000 — pedir corrección al banco.',
       true
FROM core.empresas e
WHERE e.nombre ILIKE '%dilesa%'
  AND NOT EXISTS (
    SELECT 1 FROM erp.cuentas_bancarias cb
    WHERE cb.empresa_id = e.id AND cb.nombre = 'Afirme'
  );

-- ── 5. Snapshots baseline al corte 31-may-2026 ───────────────────────────────
-- Saldos al corte de los 3 estados de cuenta recibidos. Monex = vista
-- ($1,000,057.66) + posición en reporto ($117,013,570.19). Idempotente por
-- (cuenta, fecha); capturado_por NULL = carga por migración.

INSERT INTO erp.cuenta_saldos (empresa_id, cuenta_id, fecha, saldo, notas)
SELECT cb.empresa_id, cb.id, DATE '2026-05-31', x.saldo, x.notas
FROM (VALUES
  ('Afirme',                 9535.60::numeric,      'Baseline estado de cuenta mayo 2026.'),
  ('BBVA Bancomer',          2049803.23::numeric,   'Baseline estado de cuenta mayo 2026.'),
  ('Monex Grupo Financiero', 118013627.85::numeric, 'Baseline estado de cuenta mayo 2026: vista $1,000,057.66 + reporto $117,013,570.19 (BANOB 21-4X venc. 01-jun).')
) AS x (cuenta_nombre, saldo, notas)
JOIN core.empresas e ON e.nombre ILIKE '%dilesa%'
JOIN erp.cuentas_bancarias cb ON cb.empresa_id = e.id AND cb.nombre = x.cuenta_nombre
WHERE NOT EXISTS (
  SELECT 1 FROM erp.cuenta_saldos cs
  WHERE cs.cuenta_id = cb.id AND cs.fecha = DATE '2026-05-31'
);

NOTIFY pgrst, 'reload schema';

COMMIT;
