-- Sprint 2 — Catálogos de puestos y departamentos para import CONTPAQi
--
-- Iniciativa: import-empleados-contpaqi.
-- Sprint 1 (#381) ya aplicó el schema delta. Este sprint puebla los catálogos
-- erp.departamentos y erp.puestos con los valores del Excel CONTPAQi que NO
-- existen aún en DB (con match case-insensitive y sin tildes).
--
-- Decisiones aplicadas al normalizar los nombres del Excel:
--   - Title Case en español (de/del/la/y/... en minúscula).
--   - Correcciones ortográficas en CONTPAQi reflejadas al normalizar:
--       Mercadoctenia → Mercadotecnia (depto)
--       Tecnico Especializado en Mantenimiento → Técnico Especialista en Mantenimiento (puesto, match con DB)
--       Lider de Mercadoctenia y Comunicacion → Líder de Mercadotecnia y Comunicación Organizacional (puesto, match con DB)
--       Gestor de Tramites → Gestor de Trámites
--       Supervisor de Urbanizacion → Supervisor de Urbanización (match DB)
--       Gerente de Construccion → Gerente de Construcción (match DB)
--   - 'Rincon del Bosque' (depto Excel) se mapea al depto 'Deportivo' que ya existe
--     en DILESA y RDB en DB. No se crea entrada nueva.
--
-- Filas a insertar:
--   DILESA: 4 departamentos + 14 puestos = 18
--   RDB: 0 departamentos + 7 puestos = 7
--   TOTAL: 25
--
-- Empresas se resuelven por slug (no UUID hardcodeado) para que la migración
-- corra limpia en Supabase Preview (que genera DBs vacías desde las migraciones)
-- igual que en prod. Si una empresa no existe en la DB target (caso preview),
-- el SELECT devuelve 0 filas y el INSERT no ejecuta — sin FK violation.
--
-- Idempotencia: NOT EXISTS por (empresa_id, nombre). Re-aplicar no duplica.

BEGIN;

-- ============================================================
-- DILESA (dilesa) departamentos (4)
-- ============================================================
INSERT INTO erp.departamentos (empresa_id, nombre)
SELECT e.id, 'Compras'
FROM core.empresas e
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.departamentos d
    WHERE d.empresa_id = e.id AND d.nombre = 'Compras'
  );

INSERT INTO erp.departamentos (empresa_id, nombre)
SELECT e.id, 'Evap'
FROM core.empresas e
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.departamentos d
    WHERE d.empresa_id = e.id AND d.nombre = 'Evap'
  );

INSERT INTO erp.departamentos (empresa_id, nombre)
SELECT e.id, 'Mantenimiento'
FROM core.empresas e
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.departamentos d
    WHERE d.empresa_id = e.id AND d.nombre = 'Mantenimiento'
  );

INSERT INTO erp.departamentos (empresa_id, nombre)
SELECT e.id, 'Mercadotecnia'
FROM core.empresas e
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.departamentos d
    WHERE d.empresa_id = e.id AND d.nombre = 'Mercadotecnia'
  );

-- ============================================================
-- DILESA (dilesa) puestos (14)
-- ============================================================
INSERT INTO erp.puestos (empresa_id, nombre)
SELECT e.id, 'Auxiliar Administrativo'
FROM core.empresas e
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.puestos p
    WHERE p.empresa_id = e.id AND p.nombre = 'Auxiliar Administrativo'
  );

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT e.id, 'Auxiliar de Compras'
FROM core.empresas e
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.puestos p
    WHERE p.empresa_id = e.id AND p.nombre = 'Auxiliar de Compras'
  );

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT e.id, 'Ayudante General'
FROM core.empresas e
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.puestos p
    WHERE p.empresa_id = e.id AND p.nombre = 'Ayudante General'
  );

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT e.id, 'Ayudante de Albañil'
FROM core.empresas e
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.puestos p
    WHERE p.empresa_id = e.id AND p.nombre = 'Ayudante de Albañil'
  );

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT e.id, 'Gerente Administrativo'
FROM core.empresas e
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.puestos p
    WHERE p.empresa_id = e.id AND p.nombre = 'Gerente Administrativo'
  );

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT e.id, 'Gerente de Mantenimiento'
FROM core.empresas e
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.puestos p
    WHERE p.empresa_id = e.id AND p.nombre = 'Gerente de Mantenimiento'
  );

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT e.id, 'Gerente de Maquinaria Pesada'
FROM core.empresas e
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.puestos p
    WHERE p.empresa_id = e.id AND p.nombre = 'Gerente de Maquinaria Pesada'
  );

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT e.id, 'Gestor de Trámites'
FROM core.empresas e
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.puestos p
    WHERE p.empresa_id = e.id AND p.nombre = 'Gestor de Trámites'
  );

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT e.id, 'Guardia de Seguridad'
FROM core.empresas e
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.puestos p
    WHERE p.empresa_id = e.id AND p.nombre = 'Guardia de Seguridad'
  );

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT e.id, 'Instructor Deportivo'
FROM core.empresas e
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.puestos p
    WHERE p.empresa_id = e.id AND p.nombre = 'Instructor Deportivo'
  );

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT e.id, 'Intendencia'
FROM core.empresas e
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.puestos p
    WHERE p.empresa_id = e.id AND p.nombre = 'Intendencia'
  );

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT e.id, 'Mantenimiento de Terreno'
FROM core.empresas e
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.puestos p
    WHERE p.empresa_id = e.id AND p.nombre = 'Mantenimiento de Terreno'
  );

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT e.id, 'Oficial Albañil'
FROM core.empresas e
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.puestos p
    WHERE p.empresa_id = e.id AND p.nombre = 'Oficial Albañil'
  );

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT e.id, 'Operador de Maquinaria Pesada'
FROM core.empresas e
WHERE e.slug = 'dilesa'
  AND NOT EXISTS (
    SELECT 1 FROM erp.puestos p
    WHERE p.empresa_id = e.id AND p.nombre = 'Operador de Maquinaria Pesada'
  );

-- ============================================================
-- RDB (rdb) puestos (7)
-- ============================================================
INSERT INTO erp.puestos (empresa_id, nombre)
SELECT e.id, 'Auxiliar Administrativo'
FROM core.empresas e
WHERE e.slug = 'rdb'
  AND NOT EXISTS (
    SELECT 1 FROM erp.puestos p
    WHERE p.empresa_id = e.id AND p.nombre = 'Auxiliar Administrativo'
  );

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT e.id, 'Coordinador Deportivo y Eventos'
FROM core.empresas e
WHERE e.slug = 'rdb'
  AND NOT EXISTS (
    SELECT 1 FROM erp.puestos p
    WHERE p.empresa_id = e.id AND p.nombre = 'Coordinador Deportivo y Eventos'
  );

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT e.id, 'Gerente General'
FROM core.empresas e
WHERE e.slug = 'rdb'
  AND NOT EXISTS (
    SELECT 1 FROM erp.puestos p
    WHERE p.empresa_id = e.id AND p.nombre = 'Gerente General'
  );

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT e.id, 'Hostess'
FROM core.empresas e
WHERE e.slug = 'rdb'
  AND NOT EXISTS (
    SELECT 1 FROM erp.puestos p
    WHERE p.empresa_id = e.id AND p.nombre = 'Hostess'
  );

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT e.id, 'Instructor Deportivo'
FROM core.empresas e
WHERE e.slug = 'rdb'
  AND NOT EXISTS (
    SELECT 1 FROM erp.puestos p
    WHERE p.empresa_id = e.id AND p.nombre = 'Instructor Deportivo'
  );

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT e.id, 'Mantenimiento'
FROM core.empresas e
WHERE e.slug = 'rdb'
  AND NOT EXISTS (
    SELECT 1 FROM erp.puestos p
    WHERE p.empresa_id = e.id AND p.nombre = 'Mantenimiento'
  );

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT e.id, 'Mesero'
FROM core.empresas e
WHERE e.slug = 'rdb'
  AND NOT EXISTS (
    SELECT 1 FROM erp.puestos p
    WHERE p.empresa_id = e.id AND p.nombre = 'Mesero'
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
