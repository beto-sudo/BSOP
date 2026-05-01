-- Sprint 2 — Catálogos de puestos y departamentos para import CONTPAQi
--
-- Iniciativa: import-empleados-contpaqi.
-- Sprint 1 (#381) ya aplicó el schema delta. Este sprint puebla los catálogos
-- erp.departamentos y erp.puestos con los valores del Excel CONTPAQi que NO
-- existen aún en DB (con match case-insensitive y sin tildes).
--
-- Decisiones aplicadas al normalizar los nombres del Excel:
--   - Title Case en español ("de/del/la/y/..." en minúscula).
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
-- Idempotencia: usa NOT EXISTS contra match exact por nombre + empresa_id. Si la
-- migración corre dos veces, no duplica.

BEGIN;

-- ============================================================
-- DILESA departamentos (4)
-- ============================================================
INSERT INTO erp.departamentos (empresa_id, nombre)
SELECT 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid, 'Compras'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.departamentos
  WHERE empresa_id = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid AND nombre = 'Compras'
);

INSERT INTO erp.departamentos (empresa_id, nombre)
SELECT 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid, 'Evap'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.departamentos
  WHERE empresa_id = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid AND nombre = 'Evap'
);

INSERT INTO erp.departamentos (empresa_id, nombre)
SELECT 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid, 'Mantenimiento'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.departamentos
  WHERE empresa_id = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid AND nombre = 'Mantenimiento'
);

INSERT INTO erp.departamentos (empresa_id, nombre)
SELECT 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid, 'Mercadotecnia'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.departamentos
  WHERE empresa_id = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid AND nombre = 'Mercadotecnia'
);

-- ============================================================
-- DILESA puestos (14)
-- ============================================================
INSERT INTO erp.puestos (empresa_id, nombre)
SELECT 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid, 'Auxiliar Administrativo'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.puestos
  WHERE empresa_id = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid AND nombre = 'Auxiliar Administrativo'
);

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid, 'Auxiliar de Compras'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.puestos
  WHERE empresa_id = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid AND nombre = 'Auxiliar de Compras'
);

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid, 'Ayudante General'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.puestos
  WHERE empresa_id = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid AND nombre = 'Ayudante General'
);

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid, 'Ayudante de Albañil'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.puestos
  WHERE empresa_id = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid AND nombre = 'Ayudante de Albañil'
);

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid, 'Gerente Administrativo'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.puestos
  WHERE empresa_id = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid AND nombre = 'Gerente Administrativo'
);

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid, 'Gerente de Mantenimiento'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.puestos
  WHERE empresa_id = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid AND nombre = 'Gerente de Mantenimiento'
);

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid, 'Gerente de Maquinaria Pesada'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.puestos
  WHERE empresa_id = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid AND nombre = 'Gerente de Maquinaria Pesada'
);

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid, 'Gestor de Trámites'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.puestos
  WHERE empresa_id = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid AND nombre = 'Gestor de Trámites'
);

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid, 'Guardia de Seguridad'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.puestos
  WHERE empresa_id = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid AND nombre = 'Guardia de Seguridad'
);

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid, 'Instructor Deportivo'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.puestos
  WHERE empresa_id = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid AND nombre = 'Instructor Deportivo'
);

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid, 'Intendencia'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.puestos
  WHERE empresa_id = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid AND nombre = 'Intendencia'
);

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid, 'Mantenimiento de Terreno'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.puestos
  WHERE empresa_id = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid AND nombre = 'Mantenimiento de Terreno'
);

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid, 'Oficial Albañil'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.puestos
  WHERE empresa_id = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid AND nombre = 'Oficial Albañil'
);

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid, 'Operador de Maquinaria Pesada'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.puestos
  WHERE empresa_id = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479'::uuid AND nombre = 'Operador de Maquinaria Pesada'
);

-- ============================================================
-- RDB puestos (7)
-- ============================================================
INSERT INTO erp.puestos (empresa_id, nombre)
SELECT 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid, 'Auxiliar Administrativo'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.puestos
  WHERE empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid AND nombre = 'Auxiliar Administrativo'
);

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid, 'Coordinador Deportivo y Eventos'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.puestos
  WHERE empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid AND nombre = 'Coordinador Deportivo y Eventos'
);

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid, 'Gerente General'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.puestos
  WHERE empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid AND nombre = 'Gerente General'
);

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid, 'Hostess'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.puestos
  WHERE empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid AND nombre = 'Hostess'
);

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid, 'Instructor Deportivo'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.puestos
  WHERE empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid AND nombre = 'Instructor Deportivo'
);

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid, 'Mantenimiento'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.puestos
  WHERE empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid AND nombre = 'Mantenimiento'
);

INSERT INTO erp.puestos (empresa_id, nombre)
SELECT 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid, 'Mesero'
WHERE NOT EXISTS (
  SELECT 1 FROM erp.puestos
  WHERE empresa_id = 'e52ac307-9373-4115-b65e-1178f0c4e1aa'::uuid AND nombre = 'Mesero'
);

NOTIFY pgrst, 'reload schema';

COMMIT;
