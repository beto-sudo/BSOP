-- Sprint 4 — Apply del import CONTPAQi (DILESA + RDB)
--
-- Iniciativa: import-empleados-contpaqi.
-- Snapshot: contpaqi_export_2026-04-30
--
-- Contiene en una transacción:
--   1. UPDATEs de empleados ya existentes en DB (incluye 6 conflicts resueltos)
--   2. Soft-deletes de duplicados detectados en conflicts
--   3. INSERTs nuevos de empleados no presentes en DB
--   4. UPDATEs de bajas seleccionadas (4 bajas candidatas aprobadas)
--   5. Audit log en erp.empleados_import_log por cada acción
--
-- Conteos:
--   DILESA: 24 INSERT, 137 UPDATE, 0 conflict (no aplicados)
--   RDB: 19 INSERT, 1 UPDATE, 0 conflict (no aplicados)
--   Soft-deletes: 2
--   Bajas seleccionadas: 4
--
BEGIN;

-- UPDATE persona del empleado 6a16994b-7c67-44a6-902e-3e745be0c737 (código Excel 002)
UPDATE erp.personas p SET nombre = COALESCE('JUAN ANTONIO', p.nombre), apellido_paterno = COALESCE('NEVAREZ', p.apellido_paterno), apellido_materno = COALESCE('HERNANDEZ', p.apellido_materno), rfc = COALESCE('NEHJ750222C93', p.rfc), curp = COALESCE('NEHJ750222HCLVRN01', p.curp), nss = COALESCE('32927552979', p.nss), fecha_nacimiento = COALESCE('1975-02-22', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('MORELOS, CL', p.lugar_nacimiento), domicilio = COALESCE('ARTEAGA 100 CENTRO', p.domicilio), email = COALESCE('nevarezjuanantonio1@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '6a16994b-7c67-44a6-902e-3e745be0c737';

UPDATE erp.empleados SET numero_empleado = '002', fecha_ingreso = '2014-09-06', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32927552979', fecha_nacimiento = '1975-02-22', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Maquinaria' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Operador de Maquinaria Pesada' LIMIT 1), puesto_id) WHERE id = '6a16994b-7c67-44a6-902e-3e745be0c737';

-- Compensación vigente para empleado 6a16994b-7c67-44a6-902e-3e745be0c737
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '6a16994b-7c67-44a6-902e-3e745be0c737' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '6a16994b-7c67-44a6-902e-3e745be0c737', 440.87, 466.24, '01', 'Semanal', '2014-09-06', true);

-- Pago vigente para empleado 6a16994b-7c67-44a6-902e-3e745be0c737
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '6a16994b-7c67-44a6-902e-3e745be0c737' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '6a16994b-7c67-44a6-902e-3e745be0c737', '012', '1518512504', NULL, NULL, true, '2014-09-06');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '6a16994b-7c67-44a6-902e-3e745be0c737', (SELECT persona_id FROM erp.empleados WHERE id = '6a16994b-7c67-44a6-902e-3e745be0c737'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "002"}'::jsonb);

-- UPDATE persona del empleado 1527db3b-c09a-48f3-95db-0d9e9ee4f5fa (código Excel 003)
UPDATE erp.personas p SET nombre = COALESCE('GUSTAVO ADOLFO', p.nombre), apellido_paterno = COALESCE('VALDES', p.apellido_paterno), apellido_materno = COALESCE('RODRIGUEZ', p.apellido_materno), rfc = COALESCE('VARG700105HD7', p.rfc), curp = COALESCE('VARG700105HCLLDS02', p.curp), nss = COALESCE('32927041767', p.nss), fecha_nacimiento = COALESCE('1970-01-05', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('piedras negras, CL', p.lugar_nacimiento), domicilio = COALESCE('AVE TECNOLOGICO 903 DEPTO 10', p.domicilio), email = COALESCE('gustavo.vr@dilesa.mx', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '1527db3b-c09a-48f3-95db-0d9e9ee4f5fa';

UPDATE erp.empleados SET numero_empleado = '003', fecha_ingreso = '2014-09-01', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32927041767', fecha_nacimiento = '1970-01-05', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Maquinaria' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Gerente de Maquinaria Pesada' LIMIT 1), puesto_id) WHERE id = '1527db3b-c09a-48f3-95db-0d9e9ee4f5fa';

-- Compensación vigente para empleado 1527db3b-c09a-48f3-95db-0d9e9ee4f5fa
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '1527db3b-c09a-48f3-95db-0d9e9ee4f5fa' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '1527db3b-c09a-48f3-95db-0d9e9ee4f5fa', 440.87, 466.24, '01', 'Semanal', '2014-09-01', true);

-- Pago vigente para empleado 1527db3b-c09a-48f3-95db-0d9e9ee4f5fa
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '1527db3b-c09a-48f3-95db-0d9e9ee4f5fa' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '1527db3b-c09a-48f3-95db-0d9e9ee4f5fa', '012', '1518512512', NULL, NULL, true, '2014-09-01');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '1527db3b-c09a-48f3-95db-0d9e9ee4f5fa', (SELECT persona_id FROM erp.empleados WHERE id = '1527db3b-c09a-48f3-95db-0d9e9ee4f5fa'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "003"}'::jsonb);

-- UPDATE persona del empleado 5fa030a0-0c7c-4e32-b329-622c8ccd4a2f (código Excel 004)
UPDATE erp.personas p SET nombre = COALESCE('ERNESTO ALONSO', p.nombre), apellido_paterno = COALESCE('NAVARRO', p.apellido_paterno), apellido_materno = COALESCE('CORTEZ', p.apellido_materno), rfc = COALESCE('NACE860707KF8', p.rfc), curp = COALESCE('NACE860707MCLVRR02', p.curp), nss = COALESCE('32038617018', p.nss), fecha_nacimiento = COALESCE('1986-07-07', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('NAVA, CL', p.lugar_nacimiento), domicilio = COALESCE('PUERTAS CUATAS 200', p.domicilio), email = COALESCE('ale647999@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '5fa030a0-0c7c-4e32-b329-622c8ccd4a2f';

UPDATE erp.empleados SET numero_empleado = '004', fecha_ingreso = '2019-04-01', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32038617018', fecha_nacimiento = '1986-07-07', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Maquinaria' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Operador de Maquinaria Pesada' LIMIT 1), puesto_id) WHERE id = '5fa030a0-0c7c-4e32-b329-622c8ccd4a2f';

-- Compensación vigente para empleado 5fa030a0-0c7c-4e32-b329-622c8ccd4a2f
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '5fa030a0-0c7c-4e32-b329-622c8ccd4a2f' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '5fa030a0-0c7c-4e32-b329-622c8ccd4a2f', 440.87, 465.63, '01', 'Semanal', '2019-04-01', true);

-- Pago vigente para empleado 5fa030a0-0c7c-4e32-b329-622c8ccd4a2f
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '5fa030a0-0c7c-4e32-b329-622c8ccd4a2f' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '5fa030a0-0c7c-4e32-b329-622c8ccd4a2f', '012', '1518512520', NULL, NULL, true, '2019-04-01');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '5fa030a0-0c7c-4e32-b329-622c8ccd4a2f', (SELECT persona_id FROM erp.empleados WHERE id = '5fa030a0-0c7c-4e32-b329-622c8ccd4a2f'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "004"}'::jsonb);

-- UPDATE persona del empleado e445ff84-0f05-4faa-ae49-b34428203139 (código Excel 005)
UPDATE erp.personas p SET nombre = COALESCE('JOSE ALFREDO', p.nombre), apellido_paterno = COALESCE('RAMIREZ', p.apellido_paterno), apellido_materno = COALESCE('MORALES', p.apellido_materno), rfc = COALESCE('RAMA730409N62', p.rfc), curp = COALESCE('RAMA730409HCLMRL01', p.curp), nss = COALESCE('32917357421', p.nss), fecha_nacimiento = COALESCE('1973-04-09', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), email = COALESCE('alfredoramirezmorales73@outlook.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'e445ff84-0f05-4faa-ae49-b34428203139';

UPDATE erp.empleados SET numero_empleado = '005', fecha_ingreso = '2014-09-23', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32917357421', fecha_nacimiento = '1973-04-09', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Maquinaria' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Operador de Maquinaria Pesada' LIMIT 1), puesto_id) WHERE id = 'e445ff84-0f05-4faa-ae49-b34428203139';

-- Compensación vigente para empleado e445ff84-0f05-4faa-ae49-b34428203139
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'e445ff84-0f05-4faa-ae49-b34428203139' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'e445ff84-0f05-4faa-ae49-b34428203139', 440.87, 466.24, '01', 'Semanal', '2014-09-23', true);

-- Pago vigente para empleado e445ff84-0f05-4faa-ae49-b34428203139
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'e445ff84-0f05-4faa-ae49-b34428203139' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'e445ff84-0f05-4faa-ae49-b34428203139', '012', '1518512538', NULL, NULL, true, '2014-09-23');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'e445ff84-0f05-4faa-ae49-b34428203139', (SELECT persona_id FROM erp.empleados WHERE id = 'e445ff84-0f05-4faa-ae49-b34428203139'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "005"}'::jsonb);

-- UPDATE persona del empleado e7a67b3b-7185-4332-9602-bb5058f1fcc4 (código Excel 007)
UPDATE erp.personas p SET nombre = COALESCE('DOMINGO', p.nombre), apellido_paterno = COALESCE('GONZALEZ', p.apellido_paterno), apellido_materno = COALESCE('MARTINEZ', p.apellido_materno), rfc = COALESCE('GOMD650930EJA', p.rfc), curp = COALESCE('GOMD650930HCLNRM03', p.curp), nss = COALESCE('32856543106', p.nss), fecha_nacimiento = COALESCE('1965-09-30', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), domicilio = COALESCE('LIB PEREZ TREVIÑO 400', p.domicilio), email = COALESCE('domingogzz30@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'e7a67b3b-7185-4332-9602-bb5058f1fcc4';

UPDATE erp.empleados SET numero_empleado = '007', fecha_ingreso = '2016-12-01', fecha_baja = '2025-02-08', motivo_baja = 'Separación voluntaria', activo = false, nss = '32856543106', fecha_nacimiento = '1965-09-30', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Maquinaria' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Operador de Maquinaria Pesada' LIMIT 1), puesto_id) WHERE id = 'e7a67b3b-7185-4332-9602-bb5058f1fcc4';

-- Compensación vigente para empleado e7a67b3b-7185-4332-9602-bb5058f1fcc4
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'e7a67b3b-7185-4332-9602-bb5058f1fcc4' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'e7a67b3b-7185-4332-9602-bb5058f1fcc4', 419.88, 443.46, '01', 'Semanal', '2016-12-01', true);

-- Pago vigente para empleado e7a67b3b-7185-4332-9602-bb5058f1fcc4
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'e7a67b3b-7185-4332-9602-bb5058f1fcc4' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'e7a67b3b-7185-4332-9602-bb5058f1fcc4', '012', '1518512555', NULL, NULL, true, '2016-12-01');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'e7a67b3b-7185-4332-9602-bb5058f1fcc4', (SELECT persona_id FROM erp.empleados WHERE id = 'e7a67b3b-7185-4332-9602-bb5058f1fcc4'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "007"}'::jsonb);

-- UPDATE persona del empleado 18c810c3-98f2-4949-a824-f80dbe7cbbfe (código Excel 010)
UPDATE erp.personas p SET nombre = COALESCE('JOSE FIDENCIO', p.nombre), apellido_paterno = COALESCE('QUINTERO', p.apellido_paterno), apellido_materno = COALESCE('TORRES', p.apellido_materno), rfc = COALESCE('QUTF660107NA2', p.rfc), curp = COALESCE('QUTF660107HCLNRD04', p.curp), nss = COALESCE('32866640660', p.nss), fecha_nacimiento = COALESCE('1966-01-07', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), email = COALESCE('leaquintero06calvillo@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '18c810c3-98f2-4949-a824-f80dbe7cbbfe';

UPDATE erp.empleados SET numero_empleado = '010', fecha_ingreso = '2017-11-24', fecha_baja = '2026-01-19', motivo_baja = 'Separación voluntaria', activo = false, nss = '32866640660', fecha_nacimiento = '1966-01-07', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Maquinaria' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Operador de Maquinaria Pesada' LIMIT 1), puesto_id) WHERE id = '18c810c3-98f2-4949-a824-f80dbe7cbbfe';

-- Compensación vigente para empleado 18c810c3-98f2-4949-a824-f80dbe7cbbfe
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '18c810c3-98f2-4949-a824-f80dbe7cbbfe' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '18c810c3-98f2-4949-a824-f80dbe7cbbfe', 440.87, 465.63, '01', 'Semanal', '2017-11-24', true);

-- Pago vigente para empleado 18c810c3-98f2-4949-a824-f80dbe7cbbfe
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '18c810c3-98f2-4949-a824-f80dbe7cbbfe' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '18c810c3-98f2-4949-a824-f80dbe7cbbfe', '012', '1518512589', NULL, NULL, true, '2017-11-24');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '18c810c3-98f2-4949-a824-f80dbe7cbbfe', (SELECT persona_id FROM erp.empleados WHERE id = '18c810c3-98f2-4949-a824-f80dbe7cbbfe'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "010"}'::jsonb);

-- UPDATE persona del empleado a805340f-9d59-4593-9b54-e9ec2f54a468 (código Excel 011)
UPDATE erp.personas p SET nombre = COALESCE('JORGE CRISTIAN EDUARDO', p.nombre), apellido_paterno = COALESCE('VALDEZ', p.apellido_paterno), apellido_materno = COALESCE('MALDONADO', p.apellido_materno), rfc = COALESCE('VAMJ920521TZ5', p.rfc), curp = COALESCE('VAMJ920521HCLLLR02', p.curp), nss = COALESCE('320892244748', p.nss), fecha_nacimiento = COALESCE('1992-05-21', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), domicilio = COALESCE('DR GUILLERMO RIDDLE 613', p.domicilio), email = COALESCE('jorge._dilesa@hotmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'a805340f-9d59-4593-9b54-e9ec2f54a468';

UPDATE erp.empleados SET numero_empleado = '011', fecha_ingreso = '2015-08-03', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '320892244748', fecha_nacimiento = '1992-05-21', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Maquinaria' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Operador de Maquinaria Pesada' LIMIT 1), puesto_id) WHERE id = 'a805340f-9d59-4593-9b54-e9ec2f54a468';

-- Compensación vigente para empleado a805340f-9d59-4593-9b54-e9ec2f54a468
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'a805340f-9d59-4593-9b54-e9ec2f54a468' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'a805340f-9d59-4593-9b54-e9ec2f54a468', 440.87, 466.24, '01', 'Semanal', '2015-08-03', true);

-- Pago vigente para empleado a805340f-9d59-4593-9b54-e9ec2f54a468
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'a805340f-9d59-4593-9b54-e9ec2f54a468' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'a805340f-9d59-4593-9b54-e9ec2f54a468', '012', '1518689209', NULL, NULL, true, '2015-08-03');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'a805340f-9d59-4593-9b54-e9ec2f54a468', (SELECT persona_id FROM erp.empleados WHERE id = 'a805340f-9d59-4593-9b54-e9ec2f54a468'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "011"}'::jsonb);

-- UPDATE persona del empleado 684b33c6-42a1-472a-a747-a76d8900ba06 (código Excel 014)
UPDATE erp.personas p SET nombre = COALESCE('EDGAR DANIEL', p.nombre), apellido_paterno = COALESCE('PEÑA', p.apellido_paterno), apellido_materno = COALESCE('PALOMO', p.apellido_materno), rfc = COALESCE('PEPE761026595', p.rfc), curp = COALESCE('PEPE761026HNLXLD00', p.curp), nss = COALESCE('43947662151', p.nss), fecha_nacimiento = COALESCE('1976-10-26', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('NL', p.lugar_nacimiento), email = COALESCE('edgar.pp@dilesa.mx', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '684b33c6-42a1-472a-a747-a76d8900ba06';

UPDATE erp.empleados SET numero_empleado = '014', fecha_ingreso = '2016-06-21', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '43947662151', fecha_nacimiento = '1976-10-26', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ventas' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Gerente de Ventas' LIMIT 1), puesto_id) WHERE id = '684b33c6-42a1-472a-a747-a76d8900ba06';

-- Compensación vigente para empleado 684b33c6-42a1-472a-a747-a76d8900ba06
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '684b33c6-42a1-472a-a747-a76d8900ba06' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '684b33c6-42a1-472a-a747-a76d8900ba06', 440.87, 465.63, '01', 'Semanal', '2016-06-21', true);

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '684b33c6-42a1-472a-a747-a76d8900ba06', (SELECT persona_id FROM erp.empleados WHERE id = '684b33c6-42a1-472a-a747-a76d8900ba06'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "014"}'::jsonb);

-- UPDATE persona del empleado fe4ffdd5-8d59-4ef6-ac60-dab5d4bf2993 (código Excel 015)
UPDATE erp.personas p SET nombre = COALESCE('ROGELIO', p.nombre), apellido_paterno = COALESCE('PEÑA', p.apellido_paterno), apellido_materno = COALESCE('PALOMO', p.apellido_materno), rfc = COALESCE('PEPR6109253U9', p.rfc), curp = COALESCE('PEPR610925HNLXLG02', p.curp), nss = COALESCE('43846103430', p.nss), fecha_nacimiento = COALESCE('1961-09-25', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('NL', p.lugar_nacimiento), domicilio = COALESCE('CUMBRES DE LOS ANDES 225 CUMBRES', p.domicilio), email = COALESCE('rogelio.pp@dilesa.mx', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'fe4ffdd5-8d59-4ef6-ac60-dab5d4bf2993';

UPDATE erp.empleados SET numero_empleado = '015', fecha_ingreso = '2017-08-21', fecha_baja = '2024-05-31', motivo_baja = 'Separación voluntaria', activo = false, nss = '43846103430', fecha_nacimiento = '1961-09-25', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ventas' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Asesor de Ventas' LIMIT 1), puesto_id) WHERE id = 'fe4ffdd5-8d59-4ef6-ac60-dab5d4bf2993';

-- Compensación vigente para empleado fe4ffdd5-8d59-4ef6-ac60-dab5d4bf2993
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'fe4ffdd5-8d59-4ef6-ac60-dab5d4bf2993' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'fe4ffdd5-8d59-4ef6-ac60-dab5d4bf2993', 312.41, 329.96, '01', 'Semanal', '2017-08-21', true);

-- Pago vigente para empleado fe4ffdd5-8d59-4ef6-ac60-dab5d4bf2993
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'fe4ffdd5-8d59-4ef6-ac60-dab5d4bf2993' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'fe4ffdd5-8d59-4ef6-ac60-dab5d4bf2993', '012', '1518512627', NULL, NULL, true, '2017-08-21');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'fe4ffdd5-8d59-4ef6-ac60-dab5d4bf2993', (SELECT persona_id FROM erp.empleados WHERE id = 'fe4ffdd5-8d59-4ef6-ac60-dab5d4bf2993'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "015"}'::jsonb);

-- UPDATE persona del empleado b066af01-c7ad-43bd-b860-857dc38737c1 (código Excel 018)
UPDATE erp.personas p SET nombre = COALESCE('MARIA DE JESUS', p.nombre), apellido_paterno = COALESCE('TURRUBIATE', p.apellido_paterno), apellido_materno = COALESCE('ZAVALA', p.apellido_materno), rfc = COALESCE('TUZJ890806MH8', p.rfc), curp = COALESCE('TUZJ890806MCLRVS00', p.curp), nss = COALESCE('32078995175', p.nss), fecha_nacimiento = COALESCE('1989-08-06', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), domicilio = COALESCE('TTE GUSTAVO CAMPOS ARMENDARIZ 2916', p.domicilio), email = COALESCE('maria.tz@dilesa.mx', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'b066af01-c7ad-43bd-b860-857dc38737c1';

UPDATE erp.empleados SET numero_empleado = '018', fecha_ingreso = '2020-02-21', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32078995175', fecha_nacimiento = '1989-08-06', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ventas' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Asesor de Ventas' LIMIT 1), puesto_id) WHERE id = 'b066af01-c7ad-43bd-b860-857dc38737c1';

-- Compensación vigente para empleado b066af01-c7ad-43bd-b860-857dc38737c1
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'b066af01-c7ad-43bd-b860-857dc38737c1' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'b066af01-c7ad-43bd-b860-857dc38737c1', 440.87, 465.63, '01', 'Semanal', '2020-02-21', true);

-- Pago vigente para empleado b066af01-c7ad-43bd-b860-857dc38737c1
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'b066af01-c7ad-43bd-b860-857dc38737c1' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'b066af01-c7ad-43bd-b860-857dc38737c1', '012', '1560259945', NULL, NULL, true, '2020-02-21');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'b066af01-c7ad-43bd-b860-857dc38737c1', (SELECT persona_id FROM erp.empleados WHERE id = 'b066af01-c7ad-43bd-b860-857dc38737c1'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "018"}'::jsonb);

-- UPDATE persona del empleado 1c19e5df-6354-4a36-8b2a-fb8185c4a35b (código Excel 020)
UPDATE erp.personas p SET nombre = COALESCE('MONICA ALEJANDRA', p.nombre), apellido_paterno = COALESCE('BOLAÑOS', p.apellido_paterno), apellido_materno = COALESCE('VARGAS', p.apellido_materno), rfc = COALESCE('BOVM930510SG2', p.rfc), curp = COALESCE('BOVM930510MCLLRN03', p.curp), nss = COALESCE('32099304035', p.nss), fecha_nacimiento = COALESCE('1993-05-10', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), domicilio = COALESCE('BOULEVAR REPUBLICA SN PARQUE INDUSTRIAL', p.domicilio), email = COALESCE('monica.bola21@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '1c19e5df-6354-4a36-8b2a-fb8185c4a35b';

UPDATE erp.empleados SET numero_empleado = '020', fecha_ingreso = '2020-01-14', fecha_baja = '2026-02-27', motivo_baja = 'Separación voluntaria', activo = false, nss = '32099304035', fecha_nacimiento = '1993-05-10', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Compras' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Gerente de Compras' LIMIT 1), puesto_id) WHERE id = '1c19e5df-6354-4a36-8b2a-fb8185c4a35b';

-- Compensación vigente para empleado 1c19e5df-6354-4a36-8b2a-fb8185c4a35b
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '1c19e5df-6354-4a36-8b2a-fb8185c4a35b' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '1c19e5df-6354-4a36-8b2a-fb8185c4a35b', 440.87, 465.63, '01', 'Semanal', '2020-01-14', true);

-- Pago vigente para empleado 1c19e5df-6354-4a36-8b2a-fb8185c4a35b
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '1c19e5df-6354-4a36-8b2a-fb8185c4a35b' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '1c19e5df-6354-4a36-8b2a-fb8185c4a35b', '012', '1518512652', '0264', NULL, true, '2020-01-14');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '1c19e5df-6354-4a36-8b2a-fb8185c4a35b', (SELECT persona_id FROM erp.empleados WHERE id = '1c19e5df-6354-4a36-8b2a-fb8185c4a35b'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "020"}'::jsonb);

-- UPDATE persona del empleado 29433a1b-9ab2-4697-9ee7-b641d4ec81d2 (código Excel 022)
UPDATE erp.personas p SET nombre = COALESCE('JUANITA MARIBEL', p.nombre), apellido_paterno = COALESCE('DURAN', p.apellido_paterno), apellido_materno = COALESCE('SALINAS', p.apellido_materno), rfc = COALESCE('DUSJ720521T10', p.rfc), curp = COALESCE('DUSJ720521MCLRLN03', p.curp), nss = COALESCE('32907244993', p.nss), fecha_nacimiento = COALESCE('1972-05-21', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('U', p.estado_civil), lugar_nacimiento = COALESCE('piedras negras, CL', p.lugar_nacimiento), domicilio = COALESCE('PASEO DE LAS SIERRAS 875 REAL DEL NORTE', p.domicilio), telefono = COALESCE('8781111374', p.telefono), email = COALESCE('maribel.ds@dilesa.mx', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '29433a1b-9ab2-4697-9ee7-b641d4ec81d2';

UPDATE erp.empleados SET numero_empleado = '022', fecha_ingreso = '2020-02-11', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32907244993', fecha_nacimiento = '1972-05-21', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Administración' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Auxiliar Administrativo' LIMIT 1), puesto_id) WHERE id = '29433a1b-9ab2-4697-9ee7-b641d4ec81d2';

-- Compensación vigente para empleado 29433a1b-9ab2-4697-9ee7-b641d4ec81d2
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '29433a1b-9ab2-4697-9ee7-b641d4ec81d2' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '29433a1b-9ab2-4697-9ee7-b641d4ec81d2', 650.0, 686.51, '01', 'Semanal', '2020-02-11', true);

-- Pago vigente para empleado 29433a1b-9ab2-4697-9ee7-b641d4ec81d2
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '29433a1b-9ab2-4697-9ee7-b641d4ec81d2' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '29433a1b-9ab2-4697-9ee7-b641d4ec81d2', '012', '2640547379', '0264', NULL, true, '2020-02-11');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '29433a1b-9ab2-4697-9ee7-b641d4ec81d2', (SELECT persona_id FROM erp.empleados WHERE id = '29433a1b-9ab2-4697-9ee7-b641d4ec81d2'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "022"}'::jsonb);

-- UPDATE persona del empleado 909121ea-7ab3-4dad-8601-8b63001e2e7b (código Excel 025)
UPDATE erp.personas p SET nombre = COALESCE('FRANCISCO ALEJANDRO', p.nombre), apellido_paterno = COALESCE('RIVERA', p.apellido_paterno), apellido_materno = COALESCE('BARRERA', p.apellido_materno), rfc = COALESCE('RIBF650717TP4', p.rfc), curp = COALESCE('RIBF650717HCLVRR08', p.curp), nss = COALESCE('60876575105', p.nss), fecha_nacimiento = COALESCE('1965-07-17', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), email = COALESCE('francisco.rb@dilesa.mx', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '909121ea-7ab3-4dad-8601-8b63001e2e7b';

UPDATE erp.empleados SET numero_empleado = '025', fecha_ingreso = '2019-03-30', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '60876575105', fecha_nacimiento = '1965-07-17', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Construcción' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Gerente de Construcción' LIMIT 1), puesto_id) WHERE id = '909121ea-7ab3-4dad-8601-8b63001e2e7b';

-- Compensación vigente para empleado 909121ea-7ab3-4dad-8601-8b63001e2e7b
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '909121ea-7ab3-4dad-8601-8b63001e2e7b' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '909121ea-7ab3-4dad-8601-8b63001e2e7b', 440.87, 465.63, '01', 'Semanal', '2019-03-30', true);

-- Pago vigente para empleado 909121ea-7ab3-4dad-8601-8b63001e2e7b
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '909121ea-7ab3-4dad-8601-8b63001e2e7b' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '909121ea-7ab3-4dad-8601-8b63001e2e7b', '012', '1518512660', NULL, NULL, true, '2019-03-30');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '909121ea-7ab3-4dad-8601-8b63001e2e7b', (SELECT persona_id FROM erp.empleados WHERE id = '909121ea-7ab3-4dad-8601-8b63001e2e7b'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "025"}'::jsonb);

-- UPDATE persona del empleado affb7de1-ff11-4c4a-a05f-cc39ebf27a63 (código Excel 033)
UPDATE erp.personas p SET nombre = COALESCE('GILBERTO', p.nombre), apellido_paterno = COALESCE('ALONZO', p.apellido_paterno), apellido_materno = COALESCE('PORTALES', p.apellido_materno), rfc = COALESCE('AOPG680208RP3', p.rfc), curp = COALESCE('AOPG680208HCLLRL01', p.curp), nss = COALESCE('32826842687', p.nss), fecha_nacimiento = COALESCE('1968-02-08', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), domicilio = COALESCE('LEONA VICARIO 700', p.domicilio), email = COALESCE('galonzo140@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'affb7de1-ff11-4c4a-a05f-cc39ebf27a63';

UPDATE erp.empleados SET numero_empleado = '033', fecha_ingreso = '2021-07-15', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32826842687', fecha_nacimiento = '1968-02-08', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Maquinaria' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Operador de Maquinaria Pesada' LIMIT 1), puesto_id) WHERE id = 'affb7de1-ff11-4c4a-a05f-cc39ebf27a63';

-- Compensación vigente para empleado affb7de1-ff11-4c4a-a05f-cc39ebf27a63
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'affb7de1-ff11-4c4a-a05f-cc39ebf27a63' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'affb7de1-ff11-4c4a-a05f-cc39ebf27a63', 440.87, 465.03, '01', 'Semanal', '2021-07-15', true);

-- Pago vigente para empleado affb7de1-ff11-4c4a-a05f-cc39ebf27a63
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'affb7de1-ff11-4c4a-a05f-cc39ebf27a63' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'affb7de1-ff11-4c4a-a05f-cc39ebf27a63', '012', '1523369193', '0264', NULL, true, '2021-07-15');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'affb7de1-ff11-4c4a-a05f-cc39ebf27a63', (SELECT persona_id FROM erp.empleados WHERE id = 'affb7de1-ff11-4c4a-a05f-cc39ebf27a63'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "033"}'::jsonb);

-- UPDATE persona del empleado 0556105c-8b9f-4518-8ddc-8e3ea8bf59a0 (código Excel 034)
UPDATE erp.personas p SET nombre = COALESCE('LUIS GERARDO', p.nombre), apellido_paterno = COALESCE('ROBLES', p.apellido_paterno), apellido_materno = COALESCE('GALVAN', p.apellido_materno), rfc = COALESCE('ROGL8209026B3', p.rfc), curp = COALESCE('ROGL820902HCLBLS03', p.curp), nss = COALESCE('32978145327', p.nss), fecha_nacimiento = COALESCE('1982-09-02', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), email = COALESCE('lggalvan982@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '0556105c-8b9f-4518-8ddc-8e3ea8bf59a0';

UPDATE erp.empleados SET numero_empleado = '034', fecha_ingreso = '2020-11-18', fecha_baja = '2024-09-05', motivo_baja = 'Separación voluntaria', activo = false, nss = '32978145327', fecha_nacimiento = '1982-09-02', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Deportivo' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Oficial General' LIMIT 1), puesto_id) WHERE id = '0556105c-8b9f-4518-8ddc-8e3ea8bf59a0';

-- Compensación vigente para empleado 0556105c-8b9f-4518-8ddc-8e3ea8bf59a0
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '0556105c-8b9f-4518-8ddc-8e3ea8bf59a0' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '0556105c-8b9f-4518-8ddc-8e3ea8bf59a0', 374.89, 394.92, '01', 'Semanal', '2020-11-18', true);

-- Pago vigente para empleado 0556105c-8b9f-4518-8ddc-8e3ea8bf59a0
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '0556105c-8b9f-4518-8ddc-8e3ea8bf59a0' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '0556105c-8b9f-4518-8ddc-8e3ea8bf59a0', '012', '1525060491', NULL, NULL, true, '2020-11-18');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '0556105c-8b9f-4518-8ddc-8e3ea8bf59a0', (SELECT persona_id FROM erp.empleados WHERE id = '0556105c-8b9f-4518-8ddc-8e3ea8bf59a0'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "034"}'::jsonb);

-- UPDATE persona del empleado 028e6e9f-4c06-4b7c-a1c9-27e17fbcd899 (código Excel 035)
UPDATE erp.personas p SET nombre = COALESCE('JOSE GERARDO', p.nombre), apellido_paterno = COALESCE('GUTIERREZ', p.apellido_paterno), apellido_materno = COALESCE('RIVERA', p.apellido_materno), rfc = COALESCE('GURG9403243N5', p.rfc), curp = COALESCE('GURG940324HCLTVR02', p.curp), nss = COALESCE('32109433170', p.nss), fecha_nacimiento = COALESCE('1994-03-24', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('Piedras Negras, CL', p.lugar_nacimiento), domicilio = COALESCE('PINOS 104 LAS PALMAS', p.domicilio), email = COALESCE('jose.gr@dilesa.mx', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '028e6e9f-4c06-4b7c-a1c9-27e17fbcd899';

UPDATE erp.empleados SET numero_empleado = '035', fecha_ingreso = '2020-12-01', fecha_baja = '2025-01-02', motivo_baja = 'Separación voluntaria', activo = false, nss = '32109433170', fecha_nacimiento = '1994-03-24', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Construcción' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Supervisor de Obra' LIMIT 1), puesto_id) WHERE id = '028e6e9f-4c06-4b7c-a1c9-27e17fbcd899';

-- Compensación vigente para empleado 028e6e9f-4c06-4b7c-a1c9-27e17fbcd899
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '028e6e9f-4c06-4b7c-a1c9-27e17fbcd899' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '028e6e9f-4c06-4b7c-a1c9-27e17fbcd899', 466.67, 492.24, '01', 'Semanal', '2020-12-01', true);

-- Pago vigente para empleado 028e6e9f-4c06-4b7c-a1c9-27e17fbcd899
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '028e6e9f-4c06-4b7c-a1c9-27e17fbcd899' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '028e6e9f-4c06-4b7c-a1c9-27e17fbcd899', '012', '1528225165', '0264', NULL, true, '2020-12-01');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '028e6e9f-4c06-4b7c-a1c9-27e17fbcd899', (SELECT persona_id FROM erp.empleados WHERE id = '028e6e9f-4c06-4b7c-a1c9-27e17fbcd899'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'fuzzy_nombre_fecha', '{"match_metodo": "fuzzy_nombre_fecha", "codigo": "035"}'::jsonb);

-- UPDATE persona del empleado e45fdb97-f02c-4c40-a8a2-73d8a66dce3f (código Excel 039)
UPDATE erp.personas p SET nombre = COALESCE('NELCY ELIZABETH', p.nombre), apellido_paterno = COALESCE('MARTINEZ', p.apellido_paterno), apellido_materno = COALESCE('DIAZ', p.apellido_materno), rfc = COALESCE('MADN711111BX6', p.rfc), curp = COALESCE('MADN711111MCLRZL05', p.curp), nss = COALESCE('32907141124', p.nss), fecha_nacimiento = COALESCE('1971-11-11', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('MAR ADRIATICO 561 FRACC VILLAS DEL CARMEN', p.domicilio), email = COALESCE('nelcy.md@dilesa.mx', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'e45fdb97-f02c-4c40-a8a2-73d8a66dce3f';

UPDATE erp.empleados SET numero_empleado = '039', fecha_ingreso = '2021-02-16', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32907141124', fecha_nacimiento = '1971-11-11', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Administración' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Asistente Ejecutivo' LIMIT 1), puesto_id) WHERE id = 'e45fdb97-f02c-4c40-a8a2-73d8a66dce3f';

-- Compensación vigente para empleado e45fdb97-f02c-4c40-a8a2-73d8a66dce3f
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'e45fdb97-f02c-4c40-a8a2-73d8a66dce3f' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'e45fdb97-f02c-4c40-a8a2-73d8a66dce3f', 1119.96, 1182.86, '01', 'Semanal', '2021-02-16', true);

-- Pago vigente para empleado e45fdb97-f02c-4c40-a8a2-73d8a66dce3f
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'e45fdb97-f02c-4c40-a8a2-73d8a66dce3f' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'e45fdb97-f02c-4c40-a8a2-73d8a66dce3f', '012', '1257021224', NULL, NULL, true, '2021-02-16');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'e45fdb97-f02c-4c40-a8a2-73d8a66dce3f', (SELECT persona_id FROM erp.empleados WHERE id = 'e45fdb97-f02c-4c40-a8a2-73d8a66dce3f'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "039"}'::jsonb);

-- UPDATE persona del empleado bbc17fa4-d3ae-47f2-b1b0-faa4d03587e9 (código Excel 041)
UPDATE erp.personas p SET nombre = COALESCE('HUGO ARMANDO', p.nombre), apellido_paterno = COALESCE('VIRREY', p.apellido_paterno), apellido_materno = COALESCE('GARCIA', p.apellido_materno), rfc = COALESCE('VIGH760609UA2', p.rfc), curp = COALESCE('VIGH760609HCLRRG08', p.curp), nss = COALESCE('31947607433', p.nss), fecha_nacimiento = COALESCE('1976-06-09', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), domicilio = COALESCE('LA TROJE 3523 LOMA BONITA', p.domicilio), email = COALESCE('hugo.vg@dilesa.mx', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'bbc17fa4-d3ae-47f2-b1b0-faa4d03587e9';

UPDATE erp.empleados SET numero_empleado = '041', fecha_ingreso = '2022-02-15', fecha_baja = '2024-05-31', motivo_baja = 'Separación voluntaria', activo = false, nss = '31947607433', fecha_nacimiento = '1976-06-09', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ventas' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Asesor de Ventas' LIMIT 1), puesto_id) WHERE id = 'bbc17fa4-d3ae-47f2-b1b0-faa4d03587e9';

-- Compensación vigente para empleado bbc17fa4-d3ae-47f2-b1b0-faa4d03587e9
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'bbc17fa4-d3ae-47f2-b1b0-faa4d03587e9' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'bbc17fa4-d3ae-47f2-b1b0-faa4d03587e9', 312.41, 328.24, '01', 'Semanal', '2022-02-15', true);

-- Pago vigente para empleado bbc17fa4-d3ae-47f2-b1b0-faa4d03587e9
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'bbc17fa4-d3ae-47f2-b1b0-faa4d03587e9' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'bbc17fa4-d3ae-47f2-b1b0-faa4d03587e9', '012', '1206874002', NULL, NULL, true, '2022-02-15');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'bbc17fa4-d3ae-47f2-b1b0-faa4d03587e9', (SELECT persona_id FROM erp.empleados WHERE id = 'bbc17fa4-d3ae-47f2-b1b0-faa4d03587e9'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "041"}'::jsonb);

-- UPDATE persona del empleado 0af2aaa3-673b-4a75-965c-2f39468cdbd7 (código Excel 043)
UPDATE erp.personas p SET nombre = COALESCE('HECTOR ARMANDO', p.nombre), apellido_paterno = COALESCE('BRUNO', p.apellido_paterno), apellido_materno = COALESCE('LAURENCE', p.apellido_materno), rfc = COALESCE('BULH980313NCA', p.rfc), curp = COALESCE('BULH980313HCLRRC00', p.curp), nss = COALESCE('08199840870', p.nss), fecha_nacimiento = COALESCE('1998-03-13', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('Piedras Negras, CL', p.lugar_nacimiento), domicilio = COALESCE('MAGNOLIAS 128 COL GUILLEN', p.domicilio), telefono = COALESCE('8787707810', p.telefono), email = COALESCE('armando.bl@dilesa.mx', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '0af2aaa3-673b-4a75-965c-2f39468cdbd7';

UPDATE erp.empleados SET numero_empleado = '043', fecha_ingreso = '2021-03-22', fecha_baja = '2024-05-31', motivo_baja = 'Separación voluntaria', activo = false, nss = '08199840870', fecha_nacimiento = '1998-03-13', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Construcción' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Supervisor de Obra' LIMIT 1), puesto_id) WHERE id = '0af2aaa3-673b-4a75-965c-2f39468cdbd7';

-- Compensación vigente para empleado 0af2aaa3-673b-4a75-965c-2f39468cdbd7
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '0af2aaa3-673b-4a75-965c-2f39468cdbd7' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '0af2aaa3-673b-4a75-965c-2f39468cdbd7', 466.67, 490.96, '01', 'Semanal', '2021-03-22', true);

-- Pago vigente para empleado 0af2aaa3-673b-4a75-965c-2f39468cdbd7
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '0af2aaa3-673b-4a75-965c-2f39468cdbd7' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '0af2aaa3-673b-4a75-965c-2f39468cdbd7', '012', '1543298718', '0264', NULL, true, '2021-03-22');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '0af2aaa3-673b-4a75-965c-2f39468cdbd7', (SELECT persona_id FROM erp.empleados WHERE id = '0af2aaa3-673b-4a75-965c-2f39468cdbd7'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "043"}'::jsonb);

-- UPDATE persona del empleado 94bae1d5-e58f-4def-9997-8b0998e7ca65 (código Excel 048)
UPDATE erp.personas p SET nombre = COALESCE('JAVIER ALONSO', p.nombre), apellido_paterno = COALESCE('HERNANDEZ', p.apellido_paterno), apellido_materno = COALESCE('RAMIREZ', p.apellido_materno), rfc = COALESCE('HERJ930129N33', p.rfc), curp = COALESCE('HERJ930129HCLRMV06', p.curp), nss = COALESCE('32109329501', p.nss), fecha_nacimiento = COALESCE('1993-01-29', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('piedras negras, CL', p.lugar_nacimiento), domicilio = COALESCE('NEXTENGO 78', p.domicilio), email = COALESCE('javier.hr@dilesa.mx', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '94bae1d5-e58f-4def-9997-8b0998e7ca65';

UPDATE erp.empleados SET numero_empleado = '048', fecha_ingreso = '2021-06-28', fecha_baja = '2023-12-20', motivo_baja = 'Separación voluntaria', activo = false, nss = '32109329501', fecha_nacimiento = '1993-01-29', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Construcción' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Supervisor de Obra' LIMIT 1), puesto_id) WHERE id = '94bae1d5-e58f-4def-9997-8b0998e7ca65';

-- Compensación vigente para empleado 94bae1d5-e58f-4def-9997-8b0998e7ca65
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '94bae1d5-e58f-4def-9997-8b0998e7ca65' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '94bae1d5-e58f-4def-9997-8b0998e7ca65', 466.67, 490.96, '01', 'Semanal', '2021-06-28', true);

-- Pago vigente para empleado 94bae1d5-e58f-4def-9997-8b0998e7ca65
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '94bae1d5-e58f-4def-9997-8b0998e7ca65' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '94bae1d5-e58f-4def-9997-8b0998e7ca65', '012', '1558199937', NULL, NULL, true, '2021-06-28');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '94bae1d5-e58f-4def-9997-8b0998e7ca65', (SELECT persona_id FROM erp.empleados WHERE id = '94bae1d5-e58f-4def-9997-8b0998e7ca65'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "048"}'::jsonb);

-- UPDATE persona del empleado 129ec28e-d33f-4abf-85c3-0145d996f197 (código Excel 051)
UPDATE erp.personas p SET nombre = COALESCE('PEDRO', p.nombre), apellido_paterno = COALESCE('GODOY', p.apellido_paterno), apellido_materno = COALESCE('DUARTE', p.apellido_materno), rfc = COALESCE('GODP690105H16', p.rfc), curp = COALESCE('GODP690105HHGDRD05', p.curp), nss = COALESCE('12896916678', p.nss), fecha_nacimiento = COALESCE('1969-01-05', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('GUANAJUATO, HG', p.lugar_nacimiento), domicilio = COALESCE('blvd zodiaco and 3', p.domicilio), email = COALESCE('godygodot1976@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '129ec28e-d33f-4abf-85c3-0145d996f197';

UPDATE erp.empleados SET numero_empleado = '051', fecha_ingreso = '2020-08-01', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '12896916678', fecha_nacimiento = '1969-01-05', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Construcción' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Supervisor de Obra' LIMIT 1), puesto_id) WHERE id = '129ec28e-d33f-4abf-85c3-0145d996f197';

-- Compensación vigente para empleado 129ec28e-d33f-4abf-85c3-0145d996f197
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '129ec28e-d33f-4abf-85c3-0145d996f197' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '129ec28e-d33f-4abf-85c3-0145d996f197', 666.67, 704.11, '01', 'Semanal', '2020-08-01', true);

-- Pago vigente para empleado 129ec28e-d33f-4abf-85c3-0145d996f197
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '129ec28e-d33f-4abf-85c3-0145d996f197' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '129ec28e-d33f-4abf-85c3-0145d996f197', '012', '1564302432', '0264', NULL, true, '2020-08-01');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '129ec28e-d33f-4abf-85c3-0145d996f197', (SELECT persona_id FROM erp.empleados WHERE id = '129ec28e-d33f-4abf-85c3-0145d996f197'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'fuzzy_nombre_fecha', '{"match_metodo": "fuzzy_nombre_fecha", "codigo": "051"}'::jsonb);

-- UPDATE persona del empleado c30c096f-1f99-4c76-8016-074301468b45 (código Excel 052)
UPDATE erp.personas p SET nombre = COALESCE('BEATRIZ ADRIANA', p.nombre), apellido_paterno = COALESCE('URIBE', p.apellido_paterno), apellido_materno = COALESCE('VILLARREAL', p.apellido_materno), rfc = COALESCE('UIVB800825CC7', p.rfc), curp = COALESCE('UIVB800825MCLRLT12', p.curp), nss = COALESCE('32088002160', p.nss), fecha_nacimiento = COALESCE('1980-08-25', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), email = COALESCE('villarrealbeatriz53@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'c30c096f-1f99-4c76-8016-074301468b45';

UPDATE erp.empleados SET numero_empleado = '052', fecha_ingreso = '2021-08-16', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32088002160', fecha_nacimiento = '1980-08-25', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Evap' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Intendencia' LIMIT 1), puesto_id) WHERE id = 'c30c096f-1f99-4c76-8016-074301468b45';

-- Compensación vigente para empleado c30c096f-1f99-4c76-8016-074301468b45
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'c30c096f-1f99-4c76-8016-074301468b45' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c30c096f-1f99-4c76-8016-074301468b45', 440.87, 465.03, '01', 'Semanal', '2021-08-16', true);

-- Pago vigente para empleado c30c096f-1f99-4c76-8016-074301468b45
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'c30c096f-1f99-4c76-8016-074301468b45' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c30c096f-1f99-4c76-8016-074301468b45', '012', '1567168893', NULL, NULL, true, '2021-08-16');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c30c096f-1f99-4c76-8016-074301468b45', (SELECT persona_id FROM erp.empleados WHERE id = 'c30c096f-1f99-4c76-8016-074301468b45'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "052"}'::jsonb);

-- UPDATE persona del empleado c5e3233b-645e-471f-8116-255c768c9bb2 (código Excel 057)
UPDATE erp.personas p SET nombre = COALESCE('MARIA VERONICA', p.nombre), apellido_paterno = COALESCE('SILVA', p.apellido_paterno), apellido_materno = COALESCE('ROBLES', p.apellido_materno), rfc = COALESCE('SIRV890111E40', p.rfc), curp = COALESCE('SIRV890111MQTLBR07', p.curp), nss = COALESCE('32078952515', p.nss), fecha_nacimiento = COALESCE('1989-01-11', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('QT', p.lugar_nacimiento), email = COALESCE('veronica.sr@dilesa.mx', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'c5e3233b-645e-471f-8116-255c768c9bb2';

UPDATE erp.empleados SET numero_empleado = '057', fecha_ingreso = '2021-11-23', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32078952515', fecha_nacimiento = '1989-01-11', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ventas' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Asesor de Ventas' LIMIT 1), puesto_id) WHERE id = 'c5e3233b-645e-471f-8116-255c768c9bb2';

-- Compensación vigente para empleado c5e3233b-645e-471f-8116-255c768c9bb2
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'c5e3233b-645e-471f-8116-255c768c9bb2' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c5e3233b-645e-471f-8116-255c768c9bb2', 440.87, 465.03, '01', 'Semanal', '2021-11-23', true);

-- Pago vigente para empleado c5e3233b-645e-471f-8116-255c768c9bb2
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'c5e3233b-645e-471f-8116-255c768c9bb2' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c5e3233b-645e-471f-8116-255c768c9bb2', '012', '1514192055', '0264', NULL, true, '2021-11-23');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c5e3233b-645e-471f-8116-255c768c9bb2', (SELECT persona_id FROM erp.empleados WHERE id = 'c5e3233b-645e-471f-8116-255c768c9bb2'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "057"}'::jsonb);

-- UPDATE persona del empleado fa65cf83-a3b4-4b2f-98c8-bf0af8d502af (código Excel 059)
UPDATE erp.personas p SET nombre = COALESCE('MAYRA ALEJANDRA', p.nombre), apellido_paterno = COALESCE('CHAVARRIA', p.apellido_paterno), apellido_materno = COALESCE('VASQUEZ', p.apellido_materno), rfc = COALESCE('CAVM861206CF1', p.rfc), curp = COALESCE('CAVM861206MCLHSY02', p.curp), nss = COALESCE('32058604433', p.nss), fecha_nacimiento = COALESCE('1986-12-06', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), domicilio = COALESCE('BLVD INDEP OTE 1100', p.domicilio), email = COALESCE('mayrachavarria30@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'fa65cf83-a3b4-4b2f-98c8-bf0af8d502af';

UPDATE erp.empleados SET numero_empleado = '059', fecha_ingreso = '2021-12-06', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32058604433', fecha_nacimiento = '1986-12-06', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Compras' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Auxiliar de Compras' LIMIT 1), puesto_id) WHERE id = 'fa65cf83-a3b4-4b2f-98c8-bf0af8d502af';

-- Compensación vigente para empleado fa65cf83-a3b4-4b2f-98c8-bf0af8d502af
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'fa65cf83-a3b4-4b2f-98c8-bf0af8d502af' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'fa65cf83-a3b4-4b2f-98c8-bf0af8d502af', 440.87, 465.03, '01', 'Semanal', '2021-12-06', true);

-- Pago vigente para empleado fa65cf83-a3b4-4b2f-98c8-bf0af8d502af
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'fa65cf83-a3b4-4b2f-98c8-bf0af8d502af' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'fa65cf83-a3b4-4b2f-98c8-bf0af8d502af', '012', '1242059401', '0264', NULL, true, '2021-12-06');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'fa65cf83-a3b4-4b2f-98c8-bf0af8d502af', (SELECT persona_id FROM erp.empleados WHERE id = 'fa65cf83-a3b4-4b2f-98c8-bf0af8d502af'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'fuzzy_nombre_fecha', '{"match_metodo": "fuzzy_nombre_fecha", "codigo": "059"}'::jsonb);

-- UPDATE persona del empleado 3bea1a19-9af2-4731-b23b-d282b9233f88 (código Excel 061)
UPDATE erp.personas p SET nombre = COALESCE('JOSE YUNIEL', p.nombre), apellido_paterno = COALESCE('DELGADO', p.apellido_paterno), apellido_materno = COALESCE('ROCHA', p.apellido_materno), rfc = COALESCE('DERY841008RV1', p.rfc), curp = COALESCE('DERY841008HCLLCN09', p.curp), nss = COALESCE('32038415066', p.nss), fecha_nacimiento = COALESCE('1984-10-08', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), domicilio = COALESCE('MANUEL DOBLADO 106 ISSSSTE', p.domicilio), email = COALESCE('yuniel.dr@dilesa.mx', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '3bea1a19-9af2-4731-b23b-d282b9233f88';

UPDATE erp.empleados SET numero_empleado = '061', fecha_ingreso = '2022-01-14', fecha_baja = '2024-10-24', motivo_baja = 'Separación voluntaria', activo = false, nss = '32038415066', fecha_nacimiento = '1984-10-08', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ventas' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Gestor de Trámites' LIMIT 1), puesto_id) WHERE id = '3bea1a19-9af2-4731-b23b-d282b9233f88';

-- Compensación vigente para empleado 3bea1a19-9af2-4731-b23b-d282b9233f88
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '3bea1a19-9af2-4731-b23b-d282b9233f88' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '3bea1a19-9af2-4731-b23b-d282b9233f88', 374.89, 394.4, '01', 'Semanal', '2022-01-14', true);

-- Pago vigente para empleado 3bea1a19-9af2-4731-b23b-d282b9233f88
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '3bea1a19-9af2-4731-b23b-d282b9233f88' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '3bea1a19-9af2-4731-b23b-d282b9233f88', '012', '1530150193', '0264', NULL, true, '2022-01-14');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '3bea1a19-9af2-4731-b23b-d282b9233f88', (SELECT persona_id FROM erp.empleados WHERE id = '3bea1a19-9af2-4731-b23b-d282b9233f88'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "061"}'::jsonb);

-- UPDATE persona del empleado 77b15740-0bd0-4c2b-ab6a-43b713183638 (código Excel 062)
UPDATE erp.personas p SET nombre = COALESCE('JOSE AUGUSTO', p.nombre), apellido_paterno = COALESCE('GUTIERREZ', p.apellido_paterno), apellido_materno = COALESCE('RODRIGUEZ', p.apellido_materno), rfc = COALESCE('GURA791027JG8', p.rfc), curp = COALESCE('GURA791027HCLTDG01', p.curp), nss = COALESCE('32967945810', p.nss), fecha_nacimiento = COALESCE('1979-10-27', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), domicilio = COALESCE('MEZQUITE 205', p.domicilio), email = COALESCE('joseaugustogutierrez@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '77b15740-0bd0-4c2b-ab6a-43b713183638';

UPDATE erp.empleados SET numero_empleado = '062', fecha_ingreso = '2022-01-21', fecha_baja = '2024-06-07', motivo_baja = 'Separación voluntaria', activo = false, nss = '32967945810', fecha_nacimiento = '1979-10-27', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Gerente de Mantenimiento' LIMIT 1), puesto_id) WHERE id = '77b15740-0bd0-4c2b-ab6a-43b713183638';

-- Compensación vigente para empleado 77b15740-0bd0-4c2b-ab6a-43b713183638
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '77b15740-0bd0-4c2b-ab6a-43b713183638' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '77b15740-0bd0-4c2b-ab6a-43b713183638', 466.67, 490.96, '01', 'Semanal', '2022-01-21', true);

-- Pago vigente para empleado 77b15740-0bd0-4c2b-ab6a-43b713183638
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '77b15740-0bd0-4c2b-ab6a-43b713183638' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '77b15740-0bd0-4c2b-ab6a-43b713183638', '012', '1594846679', NULL, NULL, true, '2022-01-21');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '77b15740-0bd0-4c2b-ab6a-43b713183638', (SELECT persona_id FROM erp.empleados WHERE id = '77b15740-0bd0-4c2b-ab6a-43b713183638'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "062"}'::jsonb);

-- UPDATE persona del empleado cadd847f-68cf-4823-814c-9660e9d13aff (código Excel 066)
UPDATE erp.personas p SET nombre = COALESCE('ROLANDO', p.nombre), apellido_paterno = COALESCE('PRADO', p.apellido_paterno), apellido_materno = COALESCE('MARTINEZ', p.apellido_materno), rfc = COALESCE('PAMR6609039Z7', p.rfc), curp = COALESCE('PAMR660903HCLRRL01', p.curp), nss = COALESCE('32826631288', p.nss), fecha_nacimiento = COALESCE('1966-09-03', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), domicilio = COALESCE('TREINTA Y NUEVE 1010 AMPLIACION GUERRERO', p.domicilio), email = COALESCE('prado300821@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'cadd847f-68cf-4823-814c-9660e9d13aff';

UPDATE erp.empleados SET numero_empleado = '066', fecha_ingreso = '2022-03-14', fecha_baja = '2025-02-20', motivo_baja = 'Separación voluntaria', activo = false, nss = '32826631288', fecha_nacimiento = '1966-09-03', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Oficial General' LIMIT 1), puesto_id) WHERE id = 'cadd847f-68cf-4823-814c-9660e9d13aff';

-- Compensación vigente para empleado cadd847f-68cf-4823-814c-9660e9d13aff
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'cadd847f-68cf-4823-814c-9660e9d13aff' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'cadd847f-68cf-4823-814c-9660e9d13aff', 419.88, 441.74, '01', 'Semanal', '2022-03-14', true);

-- Pago vigente para empleado cadd847f-68cf-4823-814c-9660e9d13aff
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'cadd847f-68cf-4823-814c-9660e9d13aff' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'cadd847f-68cf-4823-814c-9660e9d13aff', '012', '1571961605', NULL, NULL, true, '2022-03-14');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'cadd847f-68cf-4823-814c-9660e9d13aff', (SELECT persona_id FROM erp.empleados WHERE id = 'cadd847f-68cf-4823-814c-9660e9d13aff'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "066"}'::jsonb);

-- UPDATE persona del empleado 6c0eacf8-02ee-4d73-a775-25ef7de84867 (código Excel 067)
UPDATE erp.personas p SET nombre = COALESCE('EDGAR RICARDO', p.nombre), apellido_paterno = COALESCE('AMAYA', p.apellido_paterno), apellido_materno = COALESCE('FLORES', p.apellido_materno), rfc = COALESCE('AAFE970313UY1', p.rfc), curp = COALESCE('AAFE970313HCLMLD04', p.curp), nss = COALESCE('66169756021', p.nss), fecha_nacimiento = COALESCE('1997-03-13', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), email = COALESCE('ricardo.af@dilesa.mx', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '6c0eacf8-02ee-4d73-a775-25ef7de84867';

UPDATE erp.empleados SET numero_empleado = '067', fecha_ingreso = '2022-04-08', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '66169756021', fecha_nacimiento = '1997-03-13', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mercadotecnia' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Líder de Mercadotecnia y Comunicación Organizacional' LIMIT 1), puesto_id) WHERE id = '6c0eacf8-02ee-4d73-a775-25ef7de84867';

-- Compensación vigente para empleado 6c0eacf8-02ee-4d73-a775-25ef7de84867
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '6c0eacf8-02ee-4d73-a775-25ef7de84867' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '6c0eacf8-02ee-4d73-a775-25ef7de84867', 733.33, 773.51, '01', 'Semanal', '2022-04-08', true);

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '6c0eacf8-02ee-4d73-a775-25ef7de84867', (SELECT persona_id FROM erp.empleados WHERE id = '6c0eacf8-02ee-4d73-a775-25ef7de84867'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "067"}'::jsonb);

-- UPDATE persona del empleado 0022e9bb-8641-4e54-9a3c-a88c1dbc3283 (código Excel 069)
UPDATE erp.personas p SET nombre = COALESCE('CIORI MICOL', p.nombre), apellido_paterno = COALESCE('HERNANDEZ', p.apellido_paterno), apellido_materno = COALESCE('ALMAGUER', p.apellido_materno), rfc = COALESCE('HEAC9403159F4', p.rfc), curp = COALESCE('HEAC940315MCLRLR06', p.curp), nss = COALESCE('75169494566', p.nss), fecha_nacimiento = COALESCE('1994-03-15', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), domicilio = COALESCE('COMERCIO 108', p.domicilio), email = COALESCE('ciori.mha@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '0022e9bb-8641-4e54-9a3c-a88c1dbc3283';

UPDATE erp.empleados SET numero_empleado = '069', fecha_ingreso = '2022-06-13', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '75169494566', fecha_nacimiento = '1994-03-15', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Evap' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Gerente de Mantenimiento' LIMIT 1), puesto_id) WHERE id = '0022e9bb-8641-4e54-9a3c-a88c1dbc3283';

-- Compensación vigente para empleado 0022e9bb-8641-4e54-9a3c-a88c1dbc3283
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '0022e9bb-8641-4e54-9a3c-a88c1dbc3283' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '0022e9bb-8641-4e54-9a3c-a88c1dbc3283', 833.33, 877.85, '01', 'Semanal', '2022-06-13', true);

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '0022e9bb-8641-4e54-9a3c-a88c1dbc3283', (SELECT persona_id FROM erp.empleados WHERE id = '0022e9bb-8641-4e54-9a3c-a88c1dbc3283'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "069"}'::jsonb);

-- UPDATE persona del empleado 56edc15e-88f5-4d45-8cbf-f910799fbfb6 (código Excel 073)
UPDATE erp.personas p SET nombre = COALESCE('LUIS ALFREDO', p.nombre), apellido_paterno = COALESCE('RAMIREZ', p.apellido_paterno), apellido_materno = COALESCE('RAMOS', p.apellido_materno), rfc = COALESCE('RARL911204PC4', p.rfc), curp = COALESCE('RARL911204HCLMMS03', p.curp), nss = COALESCE('32099121884', p.nss), fecha_nacimiento = COALESCE('1991-12-04', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), email = COALESCE('luisrms4horns@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '56edc15e-88f5-4d45-8cbf-f910799fbfb6';

UPDATE erp.empleados SET numero_empleado = '073', fecha_ingreso = '2022-07-12', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32099121884', fecha_nacimiento = '1991-12-04', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Evap' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Oficial General' LIMIT 1), puesto_id) WHERE id = '56edc15e-88f5-4d45-8cbf-f910799fbfb6';

-- Compensación vigente para empleado 56edc15e-88f5-4d45-8cbf-f910799fbfb6
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '56edc15e-88f5-4d45-8cbf-f910799fbfb6' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '56edc15e-88f5-4d45-8cbf-f910799fbfb6', 562.43, 592.48, '01', 'Semanal', '2022-07-12', true);

-- Pago vigente para empleado 56edc15e-88f5-4d45-8cbf-f910799fbfb6
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '56edc15e-88f5-4d45-8cbf-f910799fbfb6' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '56edc15e-88f5-4d45-8cbf-f910799fbfb6', '012', '1522891943', NULL, NULL, true, '2022-07-12');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '56edc15e-88f5-4d45-8cbf-f910799fbfb6', (SELECT persona_id FROM erp.empleados WHERE id = '56edc15e-88f5-4d45-8cbf-f910799fbfb6'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "073"}'::jsonb);

-- UPDATE persona del empleado 0314f5a0-d1e2-4967-a703-914c7717845b (código Excel 075)
UPDATE erp.personas p SET nombre = COALESCE('FERNANDO', p.nombre), apellido_paterno = COALESCE('VENEGAS', p.apellido_paterno), apellido_materno = COALESCE('REYNA', p.apellido_materno), rfc = COALESCE('VERF840827MHA', p.rfc), curp = COALESCE('VERF840827HCLNYR03', p.curp), nss = COALESCE('32028437583', p.nss), fecha_nacimiento = COALESCE('1984-08-27', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('piedras negras, CL', p.lugar_nacimiento), domicilio = COALESCE('AVE SAN MIGIEL 1139 SANTA TERESA III', p.domicilio), telefono = COALESCE('8787032085', p.telefono), email = COALESCE('fernando.vr@dilesa.mx', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '0314f5a0-d1e2-4967-a703-914c7717845b';

UPDATE erp.empleados SET numero_empleado = '075', fecha_ingreso = '2022-08-01', fecha_baja = '2024-05-31', motivo_baja = 'Separación voluntaria', activo = false, nss = '32028437583', fecha_nacimiento = '1984-08-27', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Construcción' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Gerente de Construcción' LIMIT 1), puesto_id) WHERE id = '0314f5a0-d1e2-4967-a703-914c7717845b';

-- Compensación vigente para empleado 0314f5a0-d1e2-4967-a703-914c7717845b
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '0314f5a0-d1e2-4967-a703-914c7717845b' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '0314f5a0-d1e2-4967-a703-914c7717845b', 833.33, 874.43, '01', 'Semanal', '2022-08-01', true);

-- Pago vigente para empleado 0314f5a0-d1e2-4967-a703-914c7717845b
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '0314f5a0-d1e2-4967-a703-914c7717845b' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '0314f5a0-d1e2-4967-a703-914c7717845b', '012', '1525939211', '0264', NULL, true, '2022-08-01');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '0314f5a0-d1e2-4967-a703-914c7717845b', (SELECT persona_id FROM erp.empleados WHERE id = '0314f5a0-d1e2-4967-a703-914c7717845b'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "075"}'::jsonb);

-- UPDATE persona del empleado 92d75b98-535b-47af-ba30-57342714fe0e (código Excel 077)
UPDATE erp.personas p SET nombre = COALESCE('ADRIANA BERENICE', p.nombre), apellido_paterno = COALESCE('BELTRAN', p.apellido_paterno), apellido_materno = COALESCE('TAPIA', p.apellido_materno), rfc = COALESCE('BETA9610294C9', p.rfc), curp = COALESCE('BETA961029MDFLPD02', p.curp), nss = COALESCE('62159678127', p.nss), fecha_nacimiento = COALESCE('1996-10-29', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('MC', p.lugar_nacimiento), email = COALESCE('adrianabeltran1996@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '92d75b98-535b-47af-ba30-57342714fe0e';

UPDATE erp.empleados SET numero_empleado = '077', fecha_ingreso = '2022-08-26', fecha_baja = '2024-05-31', motivo_baja = 'Separación voluntaria', activo = false, nss = '62159678127', fecha_nacimiento = '1996-10-29', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Auxiliar Administrativo' LIMIT 1), puesto_id) WHERE id = '92d75b98-535b-47af-ba30-57342714fe0e';

-- Compensación vigente para empleado 92d75b98-535b-47af-ba30-57342714fe0e
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '92d75b98-535b-47af-ba30-57342714fe0e' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '92d75b98-535b-47af-ba30-57342714fe0e', 316.67, 332.286602, '01', 'Semanal', '2022-08-26', true);

-- Pago vigente para empleado 92d75b98-535b-47af-ba30-57342714fe0e
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '92d75b98-535b-47af-ba30-57342714fe0e' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '92d75b98-535b-47af-ba30-57342714fe0e', '012', '1530922361', '0264', NULL, true, '2022-08-26');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '92d75b98-535b-47af-ba30-57342714fe0e', (SELECT persona_id FROM erp.empleados WHERE id = '92d75b98-535b-47af-ba30-57342714fe0e'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "077"}'::jsonb);

-- UPDATE persona del empleado d7ab0caf-1cc6-411a-8c75-32a6f8bc02c4 (código Excel 078)
UPDATE erp.personas p SET nombre = COALESCE('JOSE ANGEL', p.nombre), apellido_paterno = COALESCE('VASQUEZ', p.apellido_paterno), apellido_materno = COALESCE('CARDONA', p.apellido_materno), rfc = COALESCE('VACA810715SE4', p.rfc), curp = COALESCE('VXCA810715HCLSRN05', p.curp), nss = COALESCE('32978144775', p.nss), fecha_nacimiento = COALESCE('1981-07-15', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), domicilio = COALESCE('LUCIANO DE LA CERDA 135', p.domicilio), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'd7ab0caf-1cc6-411a-8c75-32a6f8bc02c4';

UPDATE erp.empleados SET numero_empleado = '078', fecha_ingreso = '2022-09-02', fecha_baja = '2024-05-31', motivo_baja = 'Separación voluntaria', activo = false, nss = '32978144775', fecha_nacimiento = '1981-07-15', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Deportivo' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento de Terreno' LIMIT 1), puesto_id) WHERE id = 'd7ab0caf-1cc6-411a-8c75-32a6f8bc02c4';

-- Compensación vigente para empleado d7ab0caf-1cc6-411a-8c75-32a6f8bc02c4
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'd7ab0caf-1cc6-411a-8c75-32a6f8bc02c4' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'd7ab0caf-1cc6-411a-8c75-32a6f8bc02c4', 360.0, 377.753424, '01', 'Semanal', '2022-09-02', true);

-- Pago vigente para empleado d7ab0caf-1cc6-411a-8c75-32a6f8bc02c4
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'd7ab0caf-1cc6-411a-8c75-32a6f8bc02c4' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'd7ab0caf-1cc6-411a-8c75-32a6f8bc02c4', '012', '1532556436', NULL, NULL, true, '2022-09-02');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'd7ab0caf-1cc6-411a-8c75-32a6f8bc02c4', (SELECT persona_id FROM erp.empleados WHERE id = 'd7ab0caf-1cc6-411a-8c75-32a6f8bc02c4'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "078"}'::jsonb);

-- UPDATE persona del empleado a5bacd6d-d344-45bc-8da1-be95a71864e4 (código Excel 079)
UPDATE erp.personas p SET nombre = COALESCE('MIGUEL ANGEL', p.nombre), apellido_paterno = COALESCE('GOMEZ', p.apellido_paterno), apellido_materno = COALESCE('MIRELES', p.apellido_materno), rfc = COALESCE('GOMM831102FXA', p.rfc), curp = COALESCE('GOMM831102HCLMRG07', p.curp), nss = COALESCE('32008311733', p.nss), fecha_nacimiento = COALESCE('1983-11-02', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), domicilio = COALESCE('GILBERTO MUÑOZ 1015', p.domicilio), email = COALESCE('azzenethdanielabrettany@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'a5bacd6d-d344-45bc-8da1-be95a71864e4';

UPDATE erp.empleados SET numero_empleado = '079', fecha_ingreso = '2022-09-09', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32008311733', fecha_nacimiento = '1983-11-02', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Compras' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Almacenista' LIMIT 1), puesto_id) WHERE id = 'a5bacd6d-d344-45bc-8da1-be95a71864e4';

-- Compensación vigente para empleado a5bacd6d-d344-45bc-8da1-be95a71864e4
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'a5bacd6d-d344-45bc-8da1-be95a71864e4' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'a5bacd6d-d344-45bc-8da1-be95a71864e4', 440.87, 464.42, '01', 'Semanal', '2022-09-09', true);

-- Pago vigente para empleado a5bacd6d-d344-45bc-8da1-be95a71864e4
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'a5bacd6d-d344-45bc-8da1-be95a71864e4' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'a5bacd6d-d344-45bc-8da1-be95a71864e4', '012', '1533228490', '0264', NULL, true, '2022-09-09');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'a5bacd6d-d344-45bc-8da1-be95a71864e4', (SELECT persona_id FROM erp.empleados WHERE id = 'a5bacd6d-d344-45bc-8da1-be95a71864e4'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "079"}'::jsonb);

-- UPDATE persona del empleado 81ba4350-f78c-4f30-970c-c7d14b26ea5c (código Excel 080)
UPDATE erp.personas p SET nombre = COALESCE('BRYANNA ALEXIA', p.nombre), apellido_paterno = COALESCE('RIVERA', p.apellido_paterno), apellido_materno = COALESCE('CASTAÑEDA', p.apellido_materno), rfc = COALESCE('RICB001026KY8', p.rfc), curp = COALESCE('RICB001026MNEVSRA6', p.curp), nss = COALESCE('02230037992', p.nss), fecha_nacimiento = COALESCE('2000-10-26', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('EAGLE PASS, NE', p.lugar_nacimiento), email = COALESCE('bryanna.rc@dilesa.mx', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '81ba4350-f78c-4f30-970c-c7d14b26ea5c';

UPDATE erp.empleados SET numero_empleado = '080', fecha_ingreso = '2023-02-03', fecha_baja = '2025-05-02', motivo_baja = 'Separación voluntaria', activo = false, nss = '02230037992', fecha_nacimiento = '2000-10-26', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Auxiliar de Proyectos' LIMIT 1), puesto_id) WHERE id = '81ba4350-f78c-4f30-970c-c7d14b26ea5c';

-- Compensación vigente para empleado 81ba4350-f78c-4f30-970c-c7d14b26ea5c
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '81ba4350-f78c-4f30-970c-c7d14b26ea5c' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '81ba4350-f78c-4f30-970c-c7d14b26ea5c', 500.0, 526.03, '01', 'Semanal', '2023-02-03', true);

-- Pago vigente para empleado 81ba4350-f78c-4f30-970c-c7d14b26ea5c
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '81ba4350-f78c-4f30-970c-c7d14b26ea5c' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '81ba4350-f78c-4f30-970c-c7d14b26ea5c', '012', '1557185222', NULL, NULL, true, '2023-02-03');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '81ba4350-f78c-4f30-970c-c7d14b26ea5c', (SELECT persona_id FROM erp.empleados WHERE id = '81ba4350-f78c-4f30-970c-c7d14b26ea5c'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "080"}'::jsonb);

-- UPDATE persona del empleado c495dc9b-1656-46e6-acca-164f1687bdd4 (código Excel 081)
UPDATE erp.personas p SET nombre = COALESCE('FRANCISCO HUMBERTO', p.nombre), apellido_paterno = COALESCE('HERNANDEZ', p.apellido_paterno), apellido_materno = COALESCE('DOMINGUEZ', p.apellido_materno), rfc = COALESCE('HEDF771202ID5', p.rfc), curp = COALESCE('HEDF771202HCLRMR04', p.curp), nss = COALESCE('32037703306', p.nss), fecha_nacimiento = COALESCE('1977-12-02', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), email = COALESCE('fhernand.1977@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'c495dc9b-1656-46e6-acca-164f1687bdd4';

UPDATE erp.empleados SET numero_empleado = '081', fecha_ingreso = '2023-03-01', fecha_baja = '2024-05-31', motivo_baja = 'Separación voluntaria', activo = false, nss = '32037703306', fecha_nacimiento = '1977-12-02', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Deportivo' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Coordinador Deportivo' LIMIT 1), puesto_id) WHERE id = 'c495dc9b-1656-46e6-acca-164f1687bdd4';

-- Compensación vigente para empleado c495dc9b-1656-46e6-acca-164f1687bdd4
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'c495dc9b-1656-46e6-acca-164f1687bdd4' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c495dc9b-1656-46e6-acca-164f1687bdd4', 666.67, 699.546876, '01', 'Semanal', '2023-03-01', true);

-- Pago vigente para empleado c495dc9b-1656-46e6-acca-164f1687bdd4
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'c495dc9b-1656-46e6-acca-164f1687bdd4' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c495dc9b-1656-46e6-acca-164f1687bdd4', '012', '1561493625', NULL, NULL, true, '2023-03-01');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c495dc9b-1656-46e6-acca-164f1687bdd4', (SELECT persona_id FROM erp.empleados WHERE id = 'c495dc9b-1656-46e6-acca-164f1687bdd4'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "081"}'::jsonb);

-- UPDATE persona del empleado fa5254d3-2da0-4ded-bc7c-8b59cfcebe24 (código Excel 084)
UPDATE erp.personas p SET nombre = COALESCE('LUIS MARTIN', p.nombre), apellido_paterno = COALESCE('HERNANDEZ', p.apellido_paterno), apellido_materno = COALESCE('JUANTOS', p.apellido_materno), rfc = COALESCE('HEJL870929831', p.rfc), curp = COALESCE('HEJL870929HCLRNS09', p.curp), nss = COALESCE('320487333677', p.nss), fecha_nacimiento = COALESCE('1987-09-29', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('LIB JOSE LOPEZ PORTILLO SN SAN JOAQUIN', p.domicilio), telefono = COALESCE('8781577020', p.telefono), email = COALESCE('luishdezjuantos@hotmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'fa5254d3-2da0-4ded-bc7c-8b59cfcebe24';

UPDATE erp.empleados SET numero_empleado = '084', fecha_ingreso = '2023-03-31', fecha_baja = '2024-09-13', motivo_baja = 'Separación voluntaria', activo = false, nss = '320487333677', fecha_nacimiento = '1987-09-29', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Técnico Especialista en Mantenimiento' LIMIT 1), puesto_id) WHERE id = 'fa5254d3-2da0-4ded-bc7c-8b59cfcebe24';

-- Compensación vigente para empleado fa5254d3-2da0-4ded-bc7c-8b59cfcebe24
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'fa5254d3-2da0-4ded-bc7c-8b59cfcebe24' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'fa5254d3-2da0-4ded-bc7c-8b59cfcebe24', 493.3, 517.627123, '01', 'Semanal', '2023-03-31', true);

-- Pago vigente para empleado fa5254d3-2da0-4ded-bc7c-8b59cfcebe24
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'fa5254d3-2da0-4ded-bc7c-8b59cfcebe24' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'fa5254d3-2da0-4ded-bc7c-8b59cfcebe24', '012', '1506355514', '0264', NULL, true, '2023-03-31');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'fa5254d3-2da0-4ded-bc7c-8b59cfcebe24', (SELECT persona_id FROM erp.empleados WHERE id = 'fa5254d3-2da0-4ded-bc7c-8b59cfcebe24'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "084"}'::jsonb);

-- UPDATE persona del empleado 24fb625e-e0c6-405c-a0c2-38222e9006ba (código Excel 086)
UPDATE erp.personas p SET nombre = COALESCE('JOSE ALBERTO', p.nombre), apellido_paterno = COALESCE('MEDINA', p.apellido_paterno), apellido_materno = COALESCE('OLIDEN', p.apellido_materno), rfc = COALESCE('MEOA660314MD5', p.rfc), curp = COALESCE('MEOA660314HCLDLL07', p.curp), nss = COALESCE('32816611332', p.nss), fecha_nacimiento = COALESCE('1966-03-14', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('U', p.estado_civil), lugar_nacimiento = COALESCE('piedras negras, CL', p.lugar_nacimiento), email = COALESCE('olidenjosealberto@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '24fb625e-e0c6-405c-a0c2-38222e9006ba';

UPDATE erp.empleados SET numero_empleado = '086', fecha_ingreso = '2023-04-03', fecha_baja = '2023-04-03', motivo_baja = 'Separación voluntaria', activo = false, nss = '32816611332', fecha_nacimiento = '1966-03-14', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '01', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Deportivo' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento de Terreno' LIMIT 1), puesto_id) WHERE id = '24fb625e-e0c6-405c-a0c2-38222e9006ba';

-- Pago vigente para empleado 24fb625e-e0c6-405c-a0c2-38222e9006ba
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '24fb625e-e0c6-405c-a0c2-38222e9006ba' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '24fb625e-e0c6-405c-a0c2-38222e9006ba', '012', '1567220205', '0264', NULL, true, '2023-04-03');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '24fb625e-e0c6-405c-a0c2-38222e9006ba', (SELECT persona_id FROM erp.empleados WHERE id = '24fb625e-e0c6-405c-a0c2-38222e9006ba'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "086"}'::jsonb);

-- UPDATE persona del empleado e146f673-ca55-4c7b-845b-7d731a6ee94b (código Excel 087)
UPDATE erp.personas p SET nombre = COALESCE('OMAR', p.nombre), apellido_paterno = COALESCE('RODRIGUEZ', p.apellido_paterno), apellido_materno = COALESCE('HURTADO', p.apellido_materno), rfc = COALESCE('ROHO911108QP7', p.rfc), curp = COALESCE('ROHO911108HCLDRM01', p.curp), nss = COALESCE('32089115425', p.nss), fecha_nacimiento = COALESCE('1991-11-08', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('p negras, CL', p.lugar_nacimiento), domicilio = COALESCE('ODESA 715', p.domicilio), telefono = COALESCE('8781355302', p.telefono), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'e146f673-ca55-4c7b-845b-7d731a6ee94b';

UPDATE erp.empleados SET numero_empleado = '087', fecha_ingreso = '2023-04-07', fecha_baja = '2024-05-31', motivo_baja = 'Separación voluntaria', activo = false, nss = '32089115425', fecha_nacimiento = '1991-11-08', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Deportivo' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento de Terreno' LIMIT 1), puesto_id) WHERE id = 'e146f673-ca55-4c7b-845b-7d731a6ee94b';

-- Compensación vigente para empleado e146f673-ca55-4c7b-845b-7d731a6ee94b
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'e146f673-ca55-4c7b-845b-7d731a6ee94b' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'e146f673-ca55-4c7b-845b-7d731a6ee94b', 360.0, 377.753424, '01', 'Semanal', '2023-04-07', true);

-- Pago vigente para empleado e146f673-ca55-4c7b-845b-7d731a6ee94b
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'e146f673-ca55-4c7b-845b-7d731a6ee94b' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'e146f673-ca55-4c7b-845b-7d731a6ee94b', '012', '1567599892', '0264', NULL, true, '2023-04-07');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'e146f673-ca55-4c7b-845b-7d731a6ee94b', (SELECT persona_id FROM erp.empleados WHERE id = 'e146f673-ca55-4c7b-845b-7d731a6ee94b'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "087"}'::jsonb);

-- UPDATE persona del empleado 4b2683d8-3c5d-48e3-b243-9580b2caafc3 (código Excel 089)
UPDATE erp.personas p SET nombre = COALESCE('ALEJANDRO MARCOS', p.nombre), apellido_paterno = COALESCE('JUAREZ', p.apellido_paterno), apellido_materno = COALESCE('ESCALONA', p.apellido_materno), rfc = COALESCE('JUEA710424HZ5', p.rfc), curp = COALESCE('JUEA710424HMCRSL05', p.curp), nss = COALESCE('32987111476', p.nss), fecha_nacimiento = COALESCE('1971-04-24', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('MEXICO, DF', p.lugar_nacimiento), domicilio = COALESCE('TEOTIHUACAN 1734  AMP LAZARO CARDENAS', p.domicilio), telefono = COALESCE('8781259433', p.telefono), email = COALESCE('amjuareze@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '4b2683d8-3c5d-48e3-b243-9580b2caafc3';

UPDATE erp.empleados SET numero_empleado = '089', fecha_ingreso = '2023-06-19', fecha_baja = '2024-07-02', motivo_baja = 'Separación voluntaria', activo = false, nss = '32987111476', fecha_nacimiento = '1971-04-24', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Construcción' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Gerente de Construcción' LIMIT 1), puesto_id) WHERE id = '4b2683d8-3c5d-48e3-b243-9580b2caafc3';

-- Compensación vigente para empleado 4b2683d8-3c5d-48e3-b243-9580b2caafc3
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '4b2683d8-3c5d-48e3-b243-9580b2caafc3' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '4b2683d8-3c5d-48e3-b243-9580b2caafc3', 833.33, 875.57, '01', 'Semanal', '2023-06-19', true);

-- Pago vigente para empleado 4b2683d8-3c5d-48e3-b243-9580b2caafc3
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '4b2683d8-3c5d-48e3-b243-9580b2caafc3' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '4b2683d8-3c5d-48e3-b243-9580b2caafc3', '012', '1545467893', '0264', NULL, true, '2023-06-19');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '4b2683d8-3c5d-48e3-b243-9580b2caafc3', (SELECT persona_id FROM erp.empleados WHERE id = '4b2683d8-3c5d-48e3-b243-9580b2caafc3'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "089"}'::jsonb);

-- UPDATE persona del empleado f73cc189-71f2-4c8e-a7b9-1ca44c495fd5 (código Excel 090)
UPDATE erp.personas p SET nombre = COALESCE('OMAR DE JESUS', p.nombre), apellido_paterno = COALESCE('PALACIOS', p.apellido_paterno), apellido_materno = COALESCE('JIMENEZ', p.apellido_materno), rfc = COALESCE('PAJO891214B69', p.rfc), curp = COALESCE('PAJO891214HCLLMM09', p.curp), nss = COALESCE('32088937969', p.nss), fecha_nacimiento = COALESCE('1989-12-14', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('CENTENARIO 1732 BRAVO', p.domicilio), telefono = COALESCE('8781156783', p.telefono), email = COALESCE('omario202@hotmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'f73cc189-71f2-4c8e-a7b9-1ca44c495fd5';

UPDATE erp.empleados SET numero_empleado = '090', fecha_ingreso = '2023-08-08', fecha_baja = '2024-09-06', motivo_baja = 'Ausentismo', activo = false, nss = '32088937969', fecha_nacimiento = '1989-12-14', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Deportivo' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Instructor Deportivo' LIMIT 1), puesto_id) WHERE id = 'f73cc189-71f2-4c8e-a7b9-1ca44c495fd5';

-- Compensación vigente para empleado f73cc189-71f2-4c8e-a7b9-1ca44c495fd5
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'f73cc189-71f2-4c8e-a7b9-1ca44c495fd5' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'f73cc189-71f2-4c8e-a7b9-1ca44c495fd5', 374.89, 393.38, '01', 'Semanal', '2023-08-08', true);

-- Pago vigente para empleado f73cc189-71f2-4c8e-a7b9-1ca44c495fd5
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'f73cc189-71f2-4c8e-a7b9-1ca44c495fd5' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'f73cc189-71f2-4c8e-a7b9-1ca44c495fd5', '012', '1573983488', '0264', NULL, true, '2023-08-08');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'f73cc189-71f2-4c8e-a7b9-1ca44c495fd5', (SELECT persona_id FROM erp.empleados WHERE id = 'f73cc189-71f2-4c8e-a7b9-1ca44c495fd5'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "090"}'::jsonb);

-- UPDATE persona del empleado 05710487-29a5-4fab-93fa-ce6c6bd28fc3 (código Excel 091)
UPDATE erp.personas p SET nombre = COALESCE('URIEL', p.nombre), apellido_materno = COALESCE('SOLIS', p.apellido_materno), rfc = COALESCE('SOUR841229414', p.rfc), curp = COALESCE('SOXU841229HSLLXR05', p.curp), nss = COALESCE('35018406708', p.nss), fecha_nacimiento = COALESCE('1984-12-29', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('SINALOA, SL', p.lugar_nacimiento), domicilio = COALESCE('BLVD PV RODRIGUEZ TRIANA 2143 VILLAS LA NERCED', p.domicilio), telefono = COALESCE('8781456131', p.telefono), email = COALESCE('perez9853e54@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '05710487-29a5-4fab-93fa-ce6c6bd28fc3';

UPDATE erp.empleados SET numero_empleado = '091', fecha_ingreso = '2023-08-15', fecha_baja = '2024-05-31', motivo_baja = 'Separación voluntaria', activo = false, nss = '35018406708', fecha_nacimiento = '1984-12-29', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Maquinaria' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Operador de Maquinaria Pesada' LIMIT 1), puesto_id) WHERE id = '05710487-29a5-4fab-93fa-ce6c6bd28fc3';

-- Compensación vigente para empleado 05710487-29a5-4fab-93fa-ce6c6bd28fc3
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '05710487-29a5-4fab-93fa-ce6c6bd28fc3' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '05710487-29a5-4fab-93fa-ce6c6bd28fc3', 312.41, 327.81652, '01', 'Semanal', '2023-08-15', true);

-- Pago vigente para empleado 05710487-29a5-4fab-93fa-ce6c6bd28fc3
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '05710487-29a5-4fab-93fa-ce6c6bd28fc3' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '05710487-29a5-4fab-93fa-ce6c6bd28fc3', '012', '1590094973', NULL, NULL, true, '2023-08-15');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '05710487-29a5-4fab-93fa-ce6c6bd28fc3', (SELECT persona_id FROM erp.empleados WHERE id = '05710487-29a5-4fab-93fa-ce6c6bd28fc3'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "091"}'::jsonb);

-- UPDATE persona del empleado 7c6651a5-f425-4366-8934-c7a73bc00e48 (código Excel 092)
UPDATE erp.personas p SET nombre = COALESCE('ANALI GUADALUPE', p.nombre), apellido_paterno = COALESCE('VARA', p.apellido_paterno), apellido_materno = COALESCE('CASAS', p.apellido_materno), rfc = COALESCE('VACA000104RF9', p.rfc), curp = COALESCE('VXCA000104MCLRSNA6', p.curp), nss = COALESCE('19160033205', p.nss), fecha_nacimiento = COALESCE('2000-01-04', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('MAR DEL NORTE 1950 VILLA DEL CARMEN', p.domicilio), telefono = COALESCE('8787887927', p.telefono), email = COALESCE('anali-guadalupe@hotmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '7c6651a5-f425-4366-8934-c7a73bc00e48';

UPDATE erp.empleados SET numero_empleado = '092', fecha_ingreso = '2023-08-22', fecha_baja = '2023-08-30', motivo_baja = 'Separación voluntaria', activo = false, nss = '19160033205', fecha_nacimiento = '2000-01-04', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '01', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Deportivo' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Hostess' LIMIT 1), puesto_id) WHERE id = '7c6651a5-f425-4366-8934-c7a73bc00e48';

-- Pago vigente para empleado 7c6651a5-f425-4366-8934-c7a73bc00e48
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '7c6651a5-f425-4366-8934-c7a73bc00e48' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '7c6651a5-f425-4366-8934-c7a73bc00e48', '012', '1590947100', '0264', NULL, true, '2023-08-22');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '7c6651a5-f425-4366-8934-c7a73bc00e48', (SELECT persona_id FROM erp.empleados WHERE id = '7c6651a5-f425-4366-8934-c7a73bc00e48'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'fuzzy_nombre_fecha', '{"match_metodo": "fuzzy_nombre_fecha", "codigo": "092"}'::jsonb);

-- UPDATE persona del empleado 62360117-c784-4ca8-927e-b9702d258776 (código Excel 093)
UPDATE erp.personas p SET nombre = COALESCE('JESUS HECTOR', p.nombre), apellido_paterno = COALESCE('SANCHEZ', p.apellido_paterno), apellido_materno = COALESCE('GARZA', p.apellido_materno), rfc = COALESCE('SAGJ600925AQ4', p.rfc), curp = COALESCE('SAGJ600925HCLNRS09', p.curp), nss = COALESCE('32856040731', p.nss), fecha_nacimiento = COALESCE('1960-09-25', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('BAHIA REAL 309 LAS PALMAS II', p.domicilio), telefono = COALESCE('8782094258', p.telefono), email = COALESCE('hector250960@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '62360117-c784-4ca8-927e-b9702d258776';

UPDATE erp.empleados SET numero_empleado = '093', fecha_ingreso = '2023-08-29', fecha_baja = '2024-07-12', motivo_baja = 'Separación voluntaria', activo = false, nss = '32856040731', fecha_nacimiento = '1960-09-25', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Construcción' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Supervisor de Obra' LIMIT 1), puesto_id) WHERE id = '62360117-c784-4ca8-927e-b9702d258776';

-- Compensación vigente para empleado 62360117-c784-4ca8-927e-b9702d258776
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '62360117-c784-4ca8-927e-b9702d258776' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '62360117-c784-4ca8-927e-b9702d258776', 466.67, 489.683863, '01', 'Semanal', '2023-08-29', true);

-- Pago vigente para empleado 62360117-c784-4ca8-927e-b9702d258776
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '62360117-c784-4ca8-927e-b9702d258776' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '62360117-c784-4ca8-927e-b9702d258776', '012', '1592921795', NULL, NULL, true, '2023-08-29');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '62360117-c784-4ca8-927e-b9702d258776', (SELECT persona_id FROM erp.empleados WHERE id = '62360117-c784-4ca8-927e-b9702d258776'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "093"}'::jsonb);

-- UPDATE persona del empleado ffebd5db-b871-48a8-8826-32d6d6844a97 (código Excel 094)
UPDATE erp.personas p SET nombre = COALESCE('JENNY DARIELA', p.nombre), apellido_paterno = COALESCE('VELASQUEZ', p.apellido_paterno), apellido_materno = COALESCE('MORALES', p.apellido_materno), rfc = COALESCE('VEMJ010306K74', p.rfc), curp = COALESCE('VEMJ010306MCLLRNA7', p.curp), nss = COALESCE('35160124752', p.nss), fecha_nacimiento = COALESCE('2001-03-06', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('AVE LOPEZ MATEOS 803', p.domicilio), telefono = COALESCE('8781025617', p.telefono), email = COALESCE('dariela.vm@dilesa.mx', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'ffebd5db-b871-48a8-8826-32d6d6844a97';

UPDATE erp.empleados SET numero_empleado = '094', fecha_ingreso = '2023-09-08', fecha_baja = '2024-09-06', motivo_baja = 'Ausentismo', activo = false, nss = '35160124752', fecha_nacimiento = '2001-03-06', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Deportivo' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Coordinador Deportivo' LIMIT 1), puesto_id) WHERE id = 'ffebd5db-b871-48a8-8826-32d6d6844a97';

-- Compensación vigente para empleado ffebd5db-b871-48a8-8826-32d6d6844a97
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'ffebd5db-b871-48a8-8826-32d6d6844a97' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'ffebd5db-b871-48a8-8826-32d6d6844a97', 374.89, 393.89, '01', 'Semanal', '2023-09-08', true);

-- Pago vigente para empleado ffebd5db-b871-48a8-8826-32d6d6844a97
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'ffebd5db-b871-48a8-8826-32d6d6844a97' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'ffebd5db-b871-48a8-8826-32d6d6844a97', '012', '1594672318', NULL, NULL, true, '2023-09-08');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'ffebd5db-b871-48a8-8826-32d6d6844a97', (SELECT persona_id FROM erp.empleados WHERE id = 'ffebd5db-b871-48a8-8826-32d6d6844a97'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "094"}'::jsonb);

-- UPDATE persona del empleado ef4360d3-6d34-4120-8b25-29d99c03c16b (código Excel 095)
UPDATE erp.personas p SET nombre = COALESCE('CRISTINA MAYELA', p.nombre), apellido_paterno = COALESCE('ZATARAIN', p.apellido_paterno), apellido_materno = COALESCE('CHACON', p.apellido_materno), rfc = COALESCE('ZACC971025T66', p.rfc), curp = COALESCE('ZACC971025MCLTHR08', p.curp), nss = COALESCE('72169715314', p.nss), fecha_nacimiento = COALESCE('1997-10-25', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), domicilio = COALESCE('VICENTE SUAREZ 503 GUILLEN', p.domicilio), telefono = COALESCE('8781478876', p.telefono), email = COALESCE('cristyzch97@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'ef4360d3-6d34-4120-8b25-29d99c03c16b';

UPDATE erp.empleados SET numero_empleado = '095', fecha_ingreso = '2023-09-08', fecha_baja = '2024-09-06', motivo_baja = 'Ausentismo', activo = false, nss = '72169715314', fecha_nacimiento = '1997-10-25', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Deportivo' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Hostess' LIMIT 1), puesto_id) WHERE id = 'ef4360d3-6d34-4120-8b25-29d99c03c16b';

-- Compensación vigente para empleado ef4360d3-6d34-4120-8b25-29d99c03c16b
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'ef4360d3-6d34-4120-8b25-29d99c03c16b' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'ef4360d3-6d34-4120-8b25-29d99c03c16b', 374.89, 393.89, '01', 'Semanal', '2023-09-08', true);

-- Pago vigente para empleado ef4360d3-6d34-4120-8b25-29d99c03c16b
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'ef4360d3-6d34-4120-8b25-29d99c03c16b' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'ef4360d3-6d34-4120-8b25-29d99c03c16b', '012', '1582300661', NULL, NULL, true, '2023-09-08');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'ef4360d3-6d34-4120-8b25-29d99c03c16b', (SELECT persona_id FROM erp.empleados WHERE id = 'ef4360d3-6d34-4120-8b25-29d99c03c16b'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "095"}'::jsonb);

-- UPDATE persona del empleado 5c5c8ecf-e9da-4840-8cea-d630881e5258 (código Excel 096)
UPDATE erp.personas p SET nombre = COALESCE('EDUARDO', p.nombre), apellido_paterno = COALESCE('VASQUEZ', p.apellido_paterno), apellido_materno = COALESCE('RAMIREZ', p.apellido_materno), rfc = COALESCE('VARE970114J99', p.rfc), curp = COALESCE('VARE970114HCLSMD04', p.curp), nss = COALESCE('03169761008', p.nss), fecha_nacimiento = COALESCE('1997-01-14', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('MANGLE 922 AÑO 2000', p.domicilio), telefono = COALESCE('8781000621', p.telefono), email = COALESCE('evr1401@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '5c5c8ecf-e9da-4840-8cea-d630881e5258';

UPDATE erp.empleados SET numero_empleado = '096', fecha_ingreso = '2023-10-06', fecha_baja = '2024-05-27', motivo_baja = 'Separación voluntaria', activo = false, nss = '03169761008', fecha_nacimiento = '1997-01-14', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Deportivo' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mesero' LIMIT 1), puesto_id) WHERE id = '5c5c8ecf-e9da-4840-8cea-d630881e5258';

-- Compensación vigente para empleado 5c5c8ecf-e9da-4840-8cea-d630881e5258
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '5c5c8ecf-e9da-4840-8cea-d630881e5258' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '5c5c8ecf-e9da-4840-8cea-d630881e5258', 400.0, 419.726027, '01', 'Semanal', '2023-10-06', true);

-- Pago vigente para empleado 5c5c8ecf-e9da-4840-8cea-d630881e5258
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '5c5c8ecf-e9da-4840-8cea-d630881e5258' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '5c5c8ecf-e9da-4840-8cea-d630881e5258', '012', '1510547987', '0264', NULL, true, '2023-10-06');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '5c5c8ecf-e9da-4840-8cea-d630881e5258', (SELECT persona_id FROM erp.empleados WHERE id = '5c5c8ecf-e9da-4840-8cea-d630881e5258'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "096"}'::jsonb);

-- UPDATE persona del empleado ee58f55a-c778-4704-93bb-cebc50a32a16 (código Excel 097)
UPDATE erp.personas p SET nombre = COALESCE('DENISSE', p.nombre), apellido_paterno = COALESCE('PAREDES', p.apellido_paterno), apellido_materno = COALESCE('ALVARADO', p.apellido_materno), rfc = COALESCE('PAAD971004FT5', p.rfc), curp = COALESCE('PAAD971004MTSRLN09', p.curp), nss = COALESCE('38159771567', p.nss), fecha_nacimiento = COALESCE('1997-10-04', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('TAMAULIPAS, TS', p.lugar_nacimiento), domicilio = COALESCE('JALISCO 3909 NUEVA VISTA HERMOSA', p.domicilio), telefono = COALESCE('8781340950', p.telefono), email = COALESCE('pdenisse88@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'ee58f55a-c778-4704-93bb-cebc50a32a16';

UPDATE erp.empleados SET numero_empleado = '097', fecha_ingreso = '2023-11-01', fecha_baja = '2023-11-01', motivo_baja = 'Separación voluntaria', activo = false, nss = '38159771567', fecha_nacimiento = '1997-10-04', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Deportivo' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Hostess' LIMIT 1), puesto_id) WHERE id = 'ee58f55a-c778-4704-93bb-cebc50a32a16';

-- Pago vigente para empleado ee58f55a-c778-4704-93bb-cebc50a32a16
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'ee58f55a-c778-4704-93bb-cebc50a32a16' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'ee58f55a-c778-4704-93bb-cebc50a32a16', '012', '1511850704', '0264', NULL, true, '2023-11-01');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'ee58f55a-c778-4704-93bb-cebc50a32a16', (SELECT persona_id FROM erp.empleados WHERE id = 'ee58f55a-c778-4704-93bb-cebc50a32a16'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "097"}'::jsonb);

-- UPDATE persona del empleado 3f328440-090a-4d17-a6a0-810ca3da96a0 (código Excel 099)
UPDATE erp.personas p SET nombre = COALESCE('NAHUM GUADALUPE', p.nombre), apellido_paterno = COALESCE('SOLIS', p.apellido_paterno), apellido_materno = COALESCE('CARRANZA', p.apellido_materno), rfc = COALESCE('SOCN971212V56', p.rfc), curp = COALESCE('SOCN971212HCHLRH07', p.curp), nss = COALESCE('17179769249', p.nss), fecha_nacimiento = COALESCE('1997-12-12', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('JUAREZ, CH', p.lugar_nacimiento), domicilio = COALESCE('J 769  EDUARDO GUERRA', p.domicilio), telefono = COALESCE('8711738703', p.telefono), email = COALESCE('nahumsolis12.nsc@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '3f328440-090a-4d17-a6a0-810ca3da96a0';

UPDATE erp.empleados SET numero_empleado = '099', fecha_ingreso = '2024-01-08', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '17179769249', fecha_nacimiento = '1997-12-12', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Gerente de Proyectos' LIMIT 1), puesto_id) WHERE id = '3f328440-090a-4d17-a6a0-810ca3da96a0';

-- Compensación vigente para empleado 3f328440-090a-4d17-a6a0-810ca3da96a0
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '3f328440-090a-4d17-a6a0-810ca3da96a0' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '3f328440-090a-4d17-a6a0-810ca3da96a0', 1666.66, 1753.42, '01', 'Semanal', '2024-01-08', true);

-- Pago vigente para empleado 3f328440-090a-4d17-a6a0-810ca3da96a0
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '3f328440-090a-4d17-a6a0-810ca3da96a0' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '3f328440-090a-4d17-a6a0-810ca3da96a0', '012', '1570510605', NULL, NULL, true, '2024-01-08');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '3f328440-090a-4d17-a6a0-810ca3da96a0', (SELECT persona_id FROM erp.empleados WHERE id = '3f328440-090a-4d17-a6a0-810ca3da96a0'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "099"}'::jsonb);

-- UPDATE persona del empleado fea229cb-3ca1-4680-a4ba-df4603e46dc8 (código Excel 101)
UPDATE erp.personas p SET nombre = COALESCE('SONIA ELIZABETH', p.nombre), apellido_paterno = COALESCE('VALADEZ', p.apellido_paterno), apellido_materno = COALESCE('GALVAN', p.apellido_materno), rfc = COALESCE('VAGS950616E61', p.rfc), curp = COALESCE('VAGS950616MCLLLN08', p.curp), nss = COALESCE('86169557559', p.nss), fecha_nacimiento = COALESCE('1995-06-16', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('piedras negras, CL', p.lugar_nacimiento), domicilio = COALESCE('PERU 207 ORIENTE COLONIA OBRERA', p.domicilio), telefono = COALESCE('87811148185', p.telefono), email = COALESCE('sonia_vg16@hotmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'fea229cb-3ca1-4680-a4ba-df4603e46dc8';

UPDATE erp.empleados SET numero_empleado = '101', fecha_ingreso = '2024-03-01', fecha_baja = '2026-01-16', motivo_baja = 'Separación voluntaria', activo = false, nss = '86169557559', fecha_nacimiento = '1995-06-16', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ventas' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Asesor de Ventas' LIMIT 1), puesto_id) WHERE id = 'fea229cb-3ca1-4680-a4ba-df4603e46dc8';

-- Compensación vigente para empleado fea229cb-3ca1-4680-a4ba-df4603e46dc8
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'fea229cb-3ca1-4680-a4ba-df4603e46dc8' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'fea229cb-3ca1-4680-a4ba-df4603e46dc8', 440.87, 463.22, '01', 'Semanal', '2024-03-01', true);

-- Pago vigente para empleado fea229cb-3ca1-4680-a4ba-df4603e46dc8
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'fea229cb-3ca1-4680-a4ba-df4603e46dc8' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'fea229cb-3ca1-4680-a4ba-df4603e46dc8', '012', '1557872852', NULL, NULL, true, '2024-03-01');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'fea229cb-3ca1-4680-a4ba-df4603e46dc8', (SELECT persona_id FROM erp.empleados WHERE id = 'fea229cb-3ca1-4680-a4ba-df4603e46dc8'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "101"}'::jsonb);

-- UPDATE persona del empleado ebc4103a-fb4e-4250-9ae9-8dad34d32b11 (código Excel 102)
UPDATE erp.personas p SET nombre = COALESCE('KIMBERLY', p.nombre), apellido_paterno = COALESCE('MARTINEZ', p.apellido_paterno), apellido_materno = COALESCE('MAGAÑA', p.apellido_materno), rfc = COALESCE('MAMK0104063U4', p.rfc), curp = COALESCE('MAMK010406MCLRGMA5', p.curp), nss = COALESCE('03160196527', p.nss), fecha_nacimiento = COALESCE('2001-04-06', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('piedras negras, CL', p.lugar_nacimiento), domicilio = COALESCE('MAR MEDITERRANEO 2006 VILLAS DEL CARMEN', p.domicilio), telefono = COALESCE('8781561240', p.telefono), email = COALESCE('mtzk4318@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'ebc4103a-fb4e-4250-9ae9-8dad34d32b11';

UPDATE erp.empleados SET numero_empleado = '102', fecha_ingreso = '2024-03-02', fecha_baja = '2024-05-11', motivo_baja = 'Separación voluntaria', activo = false, nss = '03160196527', fecha_nacimiento = '2001-04-06', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Deportivo' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Hostess' LIMIT 1), puesto_id) WHERE id = 'ebc4103a-fb4e-4250-9ae9-8dad34d32b11';

-- Compensación vigente para empleado ebc4103a-fb4e-4250-9ae9-8dad34d32b11
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'ebc4103a-fb4e-4250-9ae9-8dad34d32b11' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'ebc4103a-fb4e-4250-9ae9-8dad34d32b11', 374.89, 393.377726, '01', 'Semanal', '2024-03-02', true);

-- Pago vigente para empleado ebc4103a-fb4e-4250-9ae9-8dad34d32b11
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'ebc4103a-fb4e-4250-9ae9-8dad34d32b11' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'ebc4103a-fb4e-4250-9ae9-8dad34d32b11', '012', '1579569044', NULL, NULL, true, '2024-03-02');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'ebc4103a-fb4e-4250-9ae9-8dad34d32b11', (SELECT persona_id FROM erp.empleados WHERE id = 'ebc4103a-fb4e-4250-9ae9-8dad34d32b11'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "102"}'::jsonb);

-- UPDATE persona del empleado 5a300b02-c149-4012-ab65-d9d9f1b49860 (código Excel 103)
UPDATE erp.personas p SET nombre = COALESCE('LUIS ANTONIO', p.nombre), apellido_paterno = COALESCE('GRIEGO', p.apellido_paterno), apellido_materno = COALESCE('ROSALES', p.apellido_materno), rfc = COALESCE('GIRL9607292F4', p.rfc), curp = COALESCE('GIRL960729HCLRSS02', p.curp), nss = COALESCE('32139607918', p.nss), fecha_nacimiento = COALESCE('1996-07-29', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), domicilio = COALESCE('UNIDAD 1106 LOS MONTES', p.domicilio), telefono = COALESCE('8781654854', p.telefono), email = COALESCE('luis-1996-14@hotmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '5a300b02-c149-4012-ab65-d9d9f1b49860';

UPDATE erp.empleados SET numero_empleado = '103', fecha_ingreso = '2024-04-26', fecha_baja = '2024-09-06', motivo_baja = 'Ausentismo', activo = false, nss = '32139607918', fecha_nacimiento = '1996-07-29', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Deportivo' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento' LIMIT 1), puesto_id) WHERE id = '5a300b02-c149-4012-ab65-d9d9f1b49860';

-- Compensación vigente para empleado 5a300b02-c149-4012-ab65-d9d9f1b49860
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '5a300b02-c149-4012-ab65-d9d9f1b49860' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '5a300b02-c149-4012-ab65-d9d9f1b49860', 374.9, 393.388219, '01', 'Semanal', '2024-04-26', true);

-- Pago vigente para empleado 5a300b02-c149-4012-ab65-d9d9f1b49860
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '5a300b02-c149-4012-ab65-d9d9f1b49860' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '5a300b02-c149-4012-ab65-d9d9f1b49860', '012', '1505051934', NULL, NULL, true, '2024-04-26');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '5a300b02-c149-4012-ab65-d9d9f1b49860', (SELECT persona_id FROM erp.empleados WHERE id = '5a300b02-c149-4012-ab65-d9d9f1b49860'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'fuzzy_nombre_fecha', '{"match_metodo": "fuzzy_nombre_fecha", "codigo": "103"}'::jsonb);

-- UPDATE persona del empleado 558b6baa-6179-42de-872b-fca100c5fb41 (código Excel 104)
UPDATE erp.personas p SET nombre = COALESCE('NOE', p.nombre), apellido_paterno = COALESCE('MALDONADO', p.apellido_paterno), apellido_materno = COALESCE('GALVAN', p.apellido_materno), rfc = COALESCE('MAGN780430FK4', p.rfc), curp = COALESCE('MAGN780430HCLLLX00', p.curp), nss = COALESCE('32967844187', p.nss), fecha_nacimiento = COALESCE('1978-04-30', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PN, CL', p.lugar_nacimiento), domicilio = COALESCE('INDUSTRIAL SIN NUMERO LOMAS DEL NORTE', p.domicilio), telefono = COALESCE('8446595582', p.telefono), email = COALESCE('notiene@notiene', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '558b6baa-6179-42de-872b-fca100c5fb41';

UPDATE erp.empleados SET numero_empleado = '104', fecha_ingreso = '2024-05-07', fecha_baja = '2024-05-14', motivo_baja = 'Ausentismo', activo = false, nss = '32967844187', fecha_nacimiento = '1978-04-30', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Oficial General' LIMIT 1), puesto_id) WHERE id = '558b6baa-6179-42de-872b-fca100c5fb41';

-- Compensación vigente para empleado 558b6baa-6179-42de-872b-fca100c5fb41
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '558b6baa-6179-42de-872b-fca100c5fb41' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '558b6baa-6179-42de-872b-fca100c5fb41', 400.0, 419.726027, '01', 'Semanal', '2024-05-07', true);

-- Pago vigente para empleado 558b6baa-6179-42de-872b-fca100c5fb41
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '558b6baa-6179-42de-872b-fca100c5fb41' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '558b6baa-6179-42de-872b-fca100c5fb41', '012', '1576683269', NULL, NULL, true, '2024-05-07');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '558b6baa-6179-42de-872b-fca100c5fb41', (SELECT persona_id FROM erp.empleados WHERE id = '558b6baa-6179-42de-872b-fca100c5fb41'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'fuzzy_nombre_fecha', '{"match_metodo": "fuzzy_nombre_fecha", "codigo": "104"}'::jsonb);

-- UPDATE persona del empleado ae5b0d38-e30c-4faf-822b-0c413dfe8a48 (código Excel 105)
UPDATE erp.personas p SET nombre = COALESCE('JORGE LUIS', p.nombre), apellido_paterno = COALESCE('MARTINEZ', p.apellido_paterno), apellido_materno = COALESCE('GUAJARDO', p.apellido_materno), rfc = COALESCE('MAGJ87021424A', p.rfc), curp = COALESCE('MAGJ870214HCLRJR06', p.curp), nss = COALESCE('32068775017', p.nss), fecha_nacimiento = COALESCE('1987-02-14', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('piedras, CL', p.lugar_nacimiento), domicilio = COALESCE('CONIZA 1512', p.domicilio), telefono = COALESCE('8781233099', p.telefono), email = COALESCE('jlmg60@hotmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'ae5b0d38-e30c-4faf-822b-0c413dfe8a48';

UPDATE erp.empleados SET numero_empleado = '105', fecha_ingreso = '2024-05-07', fecha_baja = '2024-05-24', motivo_baja = 'Separación voluntaria', activo = false, nss = '32068775017', fecha_nacimiento = '1987-02-14', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ventas' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Asesor de Ventas' LIMIT 1), puesto_id) WHERE id = 'ae5b0d38-e30c-4faf-822b-0c413dfe8a48';

-- Compensación vigente para empleado ae5b0d38-e30c-4faf-822b-0c413dfe8a48
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'ae5b0d38-e30c-4faf-822b-0c413dfe8a48' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'ae5b0d38-e30c-4faf-822b-0c413dfe8a48', 374.89, 393.377726, '01', 'Semanal', '2024-05-07', true);

-- Pago vigente para empleado ae5b0d38-e30c-4faf-822b-0c413dfe8a48
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'ae5b0d38-e30c-4faf-822b-0c413dfe8a48' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'ae5b0d38-e30c-4faf-822b-0c413dfe8a48', '012', '1515833111', NULL, NULL, true, '2024-05-07');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'ae5b0d38-e30c-4faf-822b-0c413dfe8a48', (SELECT persona_id FROM erp.empleados WHERE id = 'ae5b0d38-e30c-4faf-822b-0c413dfe8a48'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "105"}'::jsonb);

-- UPDATE persona del empleado 42a4f418-c0d3-451f-82a0-daf659efb33b (código Excel 106)
UPDATE erp.personas p SET nombre = COALESCE('JESUS RICARDO', p.nombre), apellido_paterno = COALESCE('REYNA', p.apellido_paterno), apellido_materno = COALESCE('CASTRO', p.apellido_materno), rfc = COALESCE('RECJ910523BS3', p.rfc), curp = COALESCE('RECJ910523HCLYSS06', p.curp), nss = COALESCE('02169115231', p.nss), fecha_nacimiento = COALESCE('1991-05-23', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('pn, CL', p.lugar_nacimiento), domicilio = COALESCE('NOGAL 204', p.domicilio), telefono = COALESCE('8781586323', p.telefono), email = COALESCE('ricardoorc23@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '42a4f418-c0d3-451f-82a0-daf659efb33b';

UPDATE erp.empleados SET numero_empleado = '106', fecha_ingreso = '2024-05-07', fecha_baja = '2024-06-29', motivo_baja = 'Separación voluntaria', activo = false, nss = '02169115231', fecha_nacimiento = '1991-05-23', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ventas' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Asesor de Ventas' LIMIT 1), puesto_id) WHERE id = '42a4f418-c0d3-451f-82a0-daf659efb33b';

-- Compensación vigente para empleado 42a4f418-c0d3-451f-82a0-daf659efb33b
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '42a4f418-c0d3-451f-82a0-daf659efb33b' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '42a4f418-c0d3-451f-82a0-daf659efb33b', 374.89, 393.377726, '01', 'Semanal', '2024-05-07', true);

-- Pago vigente para empleado 42a4f418-c0d3-451f-82a0-daf659efb33b
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '42a4f418-c0d3-451f-82a0-daf659efb33b' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '42a4f418-c0d3-451f-82a0-daf659efb33b', '012', '1509922767', NULL, NULL, true, '2024-05-07');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '42a4f418-c0d3-451f-82a0-daf659efb33b', (SELECT persona_id FROM erp.empleados WHERE id = '42a4f418-c0d3-451f-82a0-daf659efb33b'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "106"}'::jsonb);

-- UPDATE persona del empleado dc0fe470-f48b-417e-ad0c-f4a31082acc4 (código Excel 107)
UPDATE erp.personas p SET nombre = COALESCE('LORENZO', p.nombre), apellido_paterno = COALESCE('DE LOS SANTOS', p.apellido_paterno), apellido_materno = COALESCE('GALVAN', p.apellido_materno), rfc = COALESCE('SAGL870923CZ4', p.rfc), curp = COALESCE('SAGL870923HCLNLR09', p.curp), nss = COALESCE('32038713429', p.nss), fecha_nacimiento = COALESCE('1987-09-23', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('PN, CL', p.lugar_nacimiento), domicilio = COALESCE('LIB JOSE LOPEZ PORTILLO SN', p.domicilio), telefono = COALESCE('8781115204', p.telefono), email = COALESCE('lorenzodelossantos384@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'dc0fe470-f48b-417e-ad0c-f4a31082acc4';

UPDATE erp.empleados SET numero_empleado = '107', fecha_ingreso = '2024-05-17', fecha_baja = '2024-06-28', motivo_baja = 'Separación voluntaria', activo = false, nss = '32038713429', fecha_nacimiento = '1987-09-23', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Oficial General' LIMIT 1), puesto_id) WHERE id = 'dc0fe470-f48b-417e-ad0c-f4a31082acc4';

-- Compensación vigente para empleado dc0fe470-f48b-417e-ad0c-f4a31082acc4
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'dc0fe470-f48b-417e-ad0c-f4a31082acc4' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'dc0fe470-f48b-417e-ad0c-f4a31082acc4', 433.33, 454.699698, '01', 'Semanal', '2024-05-17', true);

-- Pago vigente para empleado dc0fe470-f48b-417e-ad0c-f4a31082acc4
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'dc0fe470-f48b-417e-ad0c-f4a31082acc4' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'dc0fe470-f48b-417e-ad0c-f4a31082acc4', '012', '1595129645', '0264', NULL, true, '2024-05-17');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'dc0fe470-f48b-417e-ad0c-f4a31082acc4', (SELECT persona_id FROM erp.empleados WHERE id = 'dc0fe470-f48b-417e-ad0c-f4a31082acc4'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "107"}'::jsonb);

-- UPDATE persona del empleado 13959f12-c9a9-4c48-8701-7b616d08973a (código Excel 108)
UPDATE erp.personas p SET nombre = COALESCE('CELESTE BERENICE', p.nombre), apellido_paterno = COALESCE('CASTRO', p.apellido_paterno), apellido_materno = COALESCE('PEÑA', p.apellido_materno), rfc = COALESCE('CAPC910926QW6', p.rfc), curp = COALESCE('CAPC910926MCLSXL06', p.curp), nss = COALESCE('32109153646', p.nss), fecha_nacimiento = COALESCE('1991-09-26', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('pn, CL', p.lugar_nacimiento), domicilio = COALESCE('CUMBRES DE LOS ALPRES 319 FRACC LAS CUMBRES', p.domicilio), telefono = COALESCE('8781631476', p.telefono), email = COALESCE('celestecastro205@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '13959f12-c9a9-4c48-8701-7b616d08973a';

UPDATE erp.empleados SET numero_empleado = '108', fecha_ingreso = '2024-05-21', fecha_baja = '2024-07-01', motivo_baja = 'Separación voluntaria', activo = false, nss = '32109153646', fecha_nacimiento = '1991-09-26', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Deportivo' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Hostess' LIMIT 1), puesto_id) WHERE id = '13959f12-c9a9-4c48-8701-7b616d08973a';

-- Compensación vigente para empleado 13959f12-c9a9-4c48-8701-7b616d08973a
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '13959f12-c9a9-4c48-8701-7b616d08973a' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '13959f12-c9a9-4c48-8701-7b616d08973a', 374.89, 393.377726, '01', 'Semanal', '2024-05-21', true);

-- Pago vigente para empleado 13959f12-c9a9-4c48-8701-7b616d08973a
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '13959f12-c9a9-4c48-8701-7b616d08973a' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '13959f12-c9a9-4c48-8701-7b616d08973a', '012', '1579362576', NULL, NULL, true, '2024-05-21');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '13959f12-c9a9-4c48-8701-7b616d08973a', (SELECT persona_id FROM erp.empleados WHERE id = '13959f12-c9a9-4c48-8701-7b616d08973a'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "108"}'::jsonb);

-- UPDATE persona del empleado 9e64f060-41b0-4272-ae9c-8cfca980d2fc (código Excel 109)
UPDATE erp.personas p SET nombre = COALESCE('RUBEN', p.nombre), apellido_paterno = COALESCE('SAUCEDA', p.apellido_paterno), apellido_materno = COALESCE('MARTINEZ', p.apellido_materno), rfc = COALESCE('SAMR731015KCA', p.rfc), curp = COALESCE('SAMR731015HCLCRB01', p.curp), nss = COALESCE('32897327147', p.nss), fecha_nacimiento = COALESCE('1973-10-15', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('LAUREANO FLOES 818 HAIENDA LA LAJA', p.domicilio), telefono = COALESCE('9241096378', p.telefono), email = COALESCE('saucedaaruben@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '9e64f060-41b0-4272-ae9c-8cfca980d2fc';

UPDATE erp.empleados SET numero_empleado = '109', fecha_ingreso = '2024-05-29', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32897327147', fecha_nacimiento = '1973-10-15', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Administración' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Guardia de Seguridad' LIMIT 1), puesto_id) WHERE id = '9e64f060-41b0-4272-ae9c-8cfca980d2fc';

-- Compensación vigente para empleado 9e64f060-41b0-4272-ae9c-8cfca980d2fc
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '9e64f060-41b0-4272-ae9c-8cfca980d2fc' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '9e64f060-41b0-4272-ae9c-8cfca980d2fc', 440.87, 463.22, '01', 'Semanal', '2024-05-29', true);

-- Pago vigente para empleado 9e64f060-41b0-4272-ae9c-8cfca980d2fc
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '9e64f060-41b0-4272-ae9c-8cfca980d2fc' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '9e64f060-41b0-4272-ae9c-8cfca980d2fc', '012', '1544821322', NULL, NULL, true, '2024-05-29');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '9e64f060-41b0-4272-ae9c-8cfca980d2fc', (SELECT persona_id FROM erp.empleados WHERE id = '9e64f060-41b0-4272-ae9c-8cfca980d2fc'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "109"}'::jsonb);

-- UPDATE persona del empleado f5172434-9604-4e4e-9240-ddc4336e9f04 (código Excel 110)
UPDATE erp.personas p SET nombre = COALESCE('ARMANDO', p.nombre), apellido_paterno = COALESCE('ARCINIEGA', p.apellido_paterno), apellido_materno = COALESCE('ESCOBAR', p.apellido_materno), rfc = COALESCE('AIEA920630L54', p.rfc), curp = COALESCE('AIEA920630HCLRSR06', p.curp), nss = COALESCE('32109237944', p.nss), fecha_nacimiento = COALESCE('1992-06-30', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('pn, CL', p.lugar_nacimiento), domicilio = COALESCE('ALEJANDRO DE RODAS 3102 las cumbres', p.domicilio), telefono = COALESCE('8781093427', p.telefono), email = COALESCE('armandoarciniega.92@icloud.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'f5172434-9604-4e4e-9240-ddc4336e9f04';

UPDATE erp.empleados SET numero_empleado = '110', fecha_ingreso = '2024-05-31', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32109237944', fecha_nacimiento = '1992-06-30', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Administración' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Guardia de Seguridad' LIMIT 1), puesto_id) WHERE id = 'f5172434-9604-4e4e-9240-ddc4336e9f04';

-- Compensación vigente para empleado f5172434-9604-4e4e-9240-ddc4336e9f04
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'f5172434-9604-4e4e-9240-ddc4336e9f04' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'f5172434-9604-4e4e-9240-ddc4336e9f04', 440.87, 463.22, '01', 'Semanal', '2024-05-31', true);

-- Pago vigente para empleado f5172434-9604-4e4e-9240-ddc4336e9f04
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'f5172434-9604-4e4e-9240-ddc4336e9f04' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'f5172434-9604-4e4e-9240-ddc4336e9f04', '012', '2782591707', NULL, NULL, true, '2024-05-31');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'f5172434-9604-4e4e-9240-ddc4336e9f04', (SELECT persona_id FROM erp.empleados WHERE id = 'f5172434-9604-4e4e-9240-ddc4336e9f04'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "110"}'::jsonb);

-- UPDATE persona del empleado 97be1ead-68c4-4964-bea4-9053a4ab472e (código Excel 111)
UPDATE erp.personas p SET nombre = COALESCE('JOSHUA AGUSTIN', p.nombre), apellido_paterno = COALESCE('MARFILEÑO', p.apellido_paterno), apellido_materno = COALESCE('SOTERO', p.apellido_materno), rfc = COALESCE('MASJ980518CJ9', p.rfc), curp = COALESCE('MASJ980518HSPRTS06', p.curp), nss = COALESCE('08179856680', p.nss), fecha_nacimiento = COALESCE('1998-05-18', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('SAN LUIS POTOSI, SP', p.lugar_nacimiento), domicilio = COALESCE('BAGDAD 441 COLINIA OBISPADO', p.domicilio), telefono = COALESCE('4447196257', p.telefono), email = COALESCE('zenibaroke@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '97be1ead-68c4-4964-bea4-9053a4ab472e';

UPDATE erp.empleados SET numero_empleado = '111', fecha_ingreso = '2024-06-07', fecha_baja = '2024-08-06', motivo_baja = 'Separación voluntaria', activo = false, nss = '08179856680', fecha_nacimiento = '1998-05-18', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Deportivo' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mesero' LIMIT 1), puesto_id) WHERE id = '97be1ead-68c4-4964-bea4-9053a4ab472e';

-- Compensación vigente para empleado 97be1ead-68c4-4964-bea4-9053a4ab472e
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '97be1ead-68c4-4964-bea4-9053a4ab472e' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '97be1ead-68c4-4964-bea4-9053a4ab472e', 374.9, 393.388219, '01', 'Semanal', '2024-06-07', true);

-- Pago vigente para empleado 97be1ead-68c4-4964-bea4-9053a4ab472e
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '97be1ead-68c4-4964-bea4-9053a4ab472e' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '97be1ead-68c4-4964-bea4-9053a4ab472e', '012', '1518938310', NULL, NULL, true, '2024-06-07');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '97be1ead-68c4-4964-bea4-9053a4ab472e', (SELECT persona_id FROM erp.empleados WHERE id = '97be1ead-68c4-4964-bea4-9053a4ab472e'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "111"}'::jsonb);

-- UPDATE persona del empleado a6aa1043-53eb-48fd-9263-e2f678fdf06c (código Excel 113)
UPDATE erp.personas p SET nombre = COALESCE('ANGEL ANIBAL', p.nombre), apellido_paterno = COALESCE('PALACIOS', p.apellido_paterno), apellido_materno = COALESCE('JIMENEZ', p.apellido_materno), rfc = COALESCE('PAJA980105VB0', p.rfc), curp = COALESCE('PAJA980105HCLLMN04', p.curp), nss = COALESCE('02249883196', p.nss), fecha_nacimiento = COALESCE('1998-01-05', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('piedras negras, CL', p.lugar_nacimiento), domicilio = COALESCE('SANTO TOMAS 202 A', p.domicilio), telefono = COALESCE('8781558766', p.telefono), email = COALESCE('anibalonch98@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'a6aa1043-53eb-48fd-9263-e2f678fdf06c';

UPDATE erp.empleados SET numero_empleado = '113', fecha_ingreso = '2024-07-01', fecha_baja = '2024-09-06', motivo_baja = 'Ausentismo', activo = false, nss = '02249883196', fecha_nacimiento = '1998-01-05', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Deportivo' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Instructor Deportivo' LIMIT 1), puesto_id) WHERE id = 'a6aa1043-53eb-48fd-9263-e2f678fdf06c';

-- Compensación vigente para empleado a6aa1043-53eb-48fd-9263-e2f678fdf06c
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'a6aa1043-53eb-48fd-9263-e2f678fdf06c' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'a6aa1043-53eb-48fd-9263-e2f678fdf06c', 374.89, 393.377726, '01', 'Semanal', '2024-07-01', true);

-- Pago vigente para empleado a6aa1043-53eb-48fd-9263-e2f678fdf06c
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'a6aa1043-53eb-48fd-9263-e2f678fdf06c' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'a6aa1043-53eb-48fd-9263-e2f678fdf06c', '012', '1518770661', NULL, NULL, true, '2024-07-01');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'a6aa1043-53eb-48fd-9263-e2f678fdf06c', (SELECT persona_id FROM erp.empleados WHERE id = 'a6aa1043-53eb-48fd-9263-e2f678fdf06c'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "113"}'::jsonb);

-- UPDATE persona del empleado 43f52dd9-e116-4b42-95c9-48c31a731fdb (código Excel 114)
UPDATE erp.personas p SET nombre = COALESCE('ROSALINDA', p.nombre), apellido_paterno = COALESCE('RAMOS', p.apellido_paterno), apellido_materno = COALESCE('FERNANDEZ', p.apellido_materno), rfc = COALESCE('RAFR800910F9A', p.rfc), curp = COALESCE('RAFR800910MDGMRS03', p.curp), nss = COALESCE('60988016998', p.nss), fecha_nacimiento = COALESCE('1980-09-10', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('DURANGO, DG', p.lugar_nacimiento), domicilio = COALESCE('ZARAGOZA OTE 301 CENTRO', p.domicilio), telefono = COALESCE('8781553340', p.telefono), email = COALESCE('rosyramosrdz@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '43f52dd9-e116-4b42-95c9-48c31a731fdb';

UPDATE erp.empleados SET numero_empleado = '114', fecha_ingreso = '2024-07-05', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '60988016998', fecha_nacimiento = '1980-09-10', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ventas' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Asesor de Ventas' LIMIT 1), puesto_id) WHERE id = '43f52dd9-e116-4b42-95c9-48c31a731fdb';

-- Compensación vigente para empleado 43f52dd9-e116-4b42-95c9-48c31a731fdb
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '43f52dd9-e116-4b42-95c9-48c31a731fdb' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '43f52dd9-e116-4b42-95c9-48c31a731fdb', 440.87, 463.22, '01', 'Semanal', '2024-07-05', true);

-- Pago vigente para empleado 43f52dd9-e116-4b42-95c9-48c31a731fdb
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '43f52dd9-e116-4b42-95c9-48c31a731fdb' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '43f52dd9-e116-4b42-95c9-48c31a731fdb', '012', '1527272946', '1527272946', NULL, true, '2024-07-05');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '43f52dd9-e116-4b42-95c9-48c31a731fdb', (SELECT persona_id FROM erp.empleados WHERE id = '43f52dd9-e116-4b42-95c9-48c31a731fdb'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "114"}'::jsonb);

-- UPDATE persona del empleado 2f4d862f-ae0c-4ee0-93ff-89b77ffaf6ad (código Excel 115)
UPDATE erp.personas p SET nombre = COALESCE('EMANUEL', p.nombre), apellido_paterno = COALESCE('MONTELONGO', p.apellido_paterno), apellido_materno = COALESCE('PADILLA', p.apellido_materno), rfc = COALESCE('MOPE930212479', p.rfc), curp = COALESCE('MOPE930212HCLNDM09', p.curp), nss = COALESCE('32129380823', p.nss), fecha_nacimiento = COALESCE('1993-02-12', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('ORIZABA 410 CUMBRES', p.domicilio), telefono = COALESCE('8781152467', p.telefono), email = COALESCE('emamontelongo57@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '2f4d862f-ae0c-4ee0-93ff-89b77ffaf6ad';

UPDATE erp.empleados SET numero_empleado = '115', fecha_ingreso = '2024-07-10', fecha_baja = '2025-07-24', motivo_baja = 'Separación voluntaria', activo = false, nss = '32129380823', fecha_nacimiento = '1993-02-12', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento de Terreno' LIMIT 1), puesto_id) WHERE id = '2f4d862f-ae0c-4ee0-93ff-89b77ffaf6ad';

-- Compensación vigente para empleado 2f4d862f-ae0c-4ee0-93ff-89b77ffaf6ad
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '2f4d862f-ae0c-4ee0-93ff-89b77ffaf6ad' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '2f4d862f-ae0c-4ee0-93ff-89b77ffaf6ad', 419.88, 440.58641, '01', 'Semanal', '2024-07-10', true);

-- Pago vigente para empleado 2f4d862f-ae0c-4ee0-93ff-89b77ffaf6ad
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '2f4d862f-ae0c-4ee0-93ff-89b77ffaf6ad' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '2f4d862f-ae0c-4ee0-93ff-89b77ffaf6ad', '012', '1508148146', NULL, NULL, true, '2024-07-10');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '2f4d862f-ae0c-4ee0-93ff-89b77ffaf6ad', (SELECT persona_id FROM erp.empleados WHERE id = '2f4d862f-ae0c-4ee0-93ff-89b77ffaf6ad'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'fuzzy_nombre_fecha', '{"match_metodo": "fuzzy_nombre_fecha", "codigo": "115"}'::jsonb);

-- UPDATE persona del empleado 39e7423d-ca79-4c3c-bd69-fc1e84a03fa8 (código Excel 117)
UPDATE erp.personas p SET nombre = COALESCE('SONIA CECILIA', p.nombre), apellido_paterno = COALESCE('ESPARZA', p.apellido_paterno), apellido_materno = COALESCE('VELOZ', p.apellido_materno), rfc = COALESCE('EAVS990125M27', p.rfc), curp = COALESCE('EAVS990125MCLSLN08', p.curp), nss = COALESCE('75169973213', p.nss), fecha_nacimiento = COALESCE('1999-01-25', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('RIO COLORADO 207 NUEVA AMERICANA', p.domicilio), telefono = COALESCE('8781145712', p.telefono), email = COALESCE('sonia_esparza1@hotmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '39e7423d-ca79-4c3c-bd69-fc1e84a03fa8';

UPDATE erp.empleados SET numero_empleado = '117', fecha_ingreso = '2024-07-23', fecha_baja = '2024-09-06', motivo_baja = 'Ausentismo', activo = false, nss = '75169973213', fecha_nacimiento = '1999-01-25', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Deportivo' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Auxiliar Administrativo' LIMIT 1), puesto_id) WHERE id = '39e7423d-ca79-4c3c-bd69-fc1e84a03fa8';

-- Compensación vigente para empleado 39e7423d-ca79-4c3c-bd69-fc1e84a03fa8
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '39e7423d-ca79-4c3c-bd69-fc1e84a03fa8' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '39e7423d-ca79-4c3c-bd69-fc1e84a03fa8', 590.0, 619.1, '01', 'Semanal', '2024-07-23', true);

-- Pago vigente para empleado 39e7423d-ca79-4c3c-bd69-fc1e84a03fa8
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '39e7423d-ca79-4c3c-bd69-fc1e84a03fa8' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '39e7423d-ca79-4c3c-bd69-fc1e84a03fa8', '012', '1549998159', NULL, NULL, true, '2024-07-23');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '39e7423d-ca79-4c3c-bd69-fc1e84a03fa8', (SELECT persona_id FROM erp.empleados WHERE id = '39e7423d-ca79-4c3c-bd69-fc1e84a03fa8'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "117"}'::jsonb);

-- UPDATE persona del empleado 91064d2a-5039-4d33-9248-7f1a9723e99a (código Excel 119)
UPDATE erp.personas p SET nombre = COALESCE('LESLIE CRISTAL', p.nombre), apellido_paterno = COALESCE('MARTINEZ', p.apellido_paterno), apellido_materno = COALESCE('GALLEGOS', p.apellido_materno), rfc = COALESCE('MAGL021024C2A', p.rfc), curp = COALESCE('MAGL021024MCLRLSA2', p.curp), nss = COALESCE('25220265166', p.nss), fecha_nacimiento = COALESCE('2002-10-24', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('MANUEL PERES TREVIÑO 1410 PRESIDENTES IV', p.domicilio), telefono = COALESCE('8787909347', p.telefono), email = COALESCE('leslie.232457@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '91064d2a-5039-4d33-9248-7f1a9723e99a';

UPDATE erp.empleados SET numero_empleado = '119', fecha_ingreso = '2024-08-09', fecha_baja = '2024-09-06', motivo_baja = 'Ausentismo', activo = false, nss = '25220265166', fecha_nacimiento = '2002-10-24', tipo_contrato = '01', horario = 'Matutino', umf = '789', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Deportivo' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mesero' LIMIT 1), puesto_id) WHERE id = '91064d2a-5039-4d33-9248-7f1a9723e99a';

-- Compensación vigente para empleado 91064d2a-5039-4d33-9248-7f1a9723e99a
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '91064d2a-5039-4d33-9248-7f1a9723e99a' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '91064d2a-5039-4d33-9248-7f1a9723e99a', 500.0, 524.657534, '01', 'Semanal', '2024-08-09', true);

-- Pago vigente para empleado 91064d2a-5039-4d33-9248-7f1a9723e99a
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '91064d2a-5039-4d33-9248-7f1a9723e99a' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '91064d2a-5039-4d33-9248-7f1a9723e99a', '012', '1524023732', NULL, NULL, true, '2024-08-09');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '91064d2a-5039-4d33-9248-7f1a9723e99a', (SELECT persona_id FROM erp.empleados WHERE id = '91064d2a-5039-4d33-9248-7f1a9723e99a'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'fuzzy_nombre_fecha', '{"match_metodo": "fuzzy_nombre_fecha", "codigo": "119"}'::jsonb);

-- UPDATE persona del empleado 94c79283-2981-45dd-8043-61a994b3ff04 (código Excel 121)
UPDATE erp.personas p SET nombre = COALESCE('ANDREA MONSERRAT', p.nombre), apellido_paterno = COALESCE('MORUA', p.apellido_paterno), apellido_materno = COALESCE('DOMINGUEZ', p.apellido_materno), rfc = COALESCE('MODA0110016B3', p.rfc), curp = COALESCE('MODA011001MCLRMNA4', p.curp), nss = COALESCE('10170130818', p.nss), fecha_nacimiento = COALESCE('2001-10-01', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('VENUSTIANO CARRANZA 3320 HIDALGO', p.domicilio), telefono = COALESCE('8781594826', p.telefono), email = COALESCE('moruaandrea99@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '94c79283-2981-45dd-8043-61a994b3ff04';

UPDATE erp.empleados SET numero_empleado = '121', fecha_ingreso = '2024-08-30', fecha_baja = '2024-10-30', motivo_baja = 'Separación voluntaria', activo = false, nss = '10170130818', fecha_nacimiento = '2001-10-01', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ventas' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Hostess' LIMIT 1), puesto_id) WHERE id = '94c79283-2981-45dd-8043-61a994b3ff04';

-- Compensación vigente para empleado 94c79283-2981-45dd-8043-61a994b3ff04
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '94c79283-2981-45dd-8043-61a994b3ff04' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '94c79283-2981-45dd-8043-61a994b3ff04', 500.0, 524.657534, '01', 'Semanal', '2024-08-30', true);

-- Pago vigente para empleado 94c79283-2981-45dd-8043-61a994b3ff04
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '94c79283-2981-45dd-8043-61a994b3ff04' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '94c79283-2981-45dd-8043-61a994b3ff04', '012', '1568053443', NULL, NULL, true, '2024-08-30');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '94c79283-2981-45dd-8043-61a994b3ff04', (SELECT persona_id FROM erp.empleados WHERE id = '94c79283-2981-45dd-8043-61a994b3ff04'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "121"}'::jsonb);

-- UPDATE persona del empleado 96595c0a-9adb-4354-809c-6bd7bdad56de (código Excel 122)
UPDATE erp.personas p SET nombre = COALESCE('JUAN ANTONIO', p.nombre), apellido_paterno = COALESCE('GALLARDO', p.apellido_paterno), apellido_materno = COALESCE('ESPARZA', p.apellido_materno), rfc = COALESCE('GAEJ950813JD5', p.rfc), curp = COALESCE('GAEJ950813HCLLSN01', p.curp), nss = COALESCE('32129552033', p.nss), fecha_nacimiento = COALESCE('1995-08-13', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('COLIMA 408 CUMBRES', p.domicilio), telefono = COALESCE('8781222421', p.telefono), email = COALESCE('tonig8581@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '96595c0a-9adb-4354-809c-6bd7bdad56de';

UPDATE erp.empleados SET numero_empleado = '122', fecha_ingreso = '2024-09-13', fecha_baja = '2025-02-06', motivo_baja = NULL, activo = true, nss = '32129552033', fecha_nacimiento = '1995-08-13', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Evap' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Oficial General' LIMIT 1), puesto_id) WHERE id = '96595c0a-9adb-4354-809c-6bd7bdad56de';

-- Compensación vigente para empleado 96595c0a-9adb-4354-809c-6bd7bdad56de
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '96595c0a-9adb-4354-809c-6bd7bdad56de' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '96595c0a-9adb-4354-809c-6bd7bdad56de', 440.87, 463.22, '01', 'Semanal', '2024-09-13', true);

-- Pago vigente para empleado 96595c0a-9adb-4354-809c-6bd7bdad56de
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '96595c0a-9adb-4354-809c-6bd7bdad56de' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '96595c0a-9adb-4354-809c-6bd7bdad56de', '012', '1520876865', NULL, NULL, true, '2024-09-13');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '96595c0a-9adb-4354-809c-6bd7bdad56de', (SELECT persona_id FROM erp.empleados WHERE id = '96595c0a-9adb-4354-809c-6bd7bdad56de'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "122"}'::jsonb);

-- UPDATE persona del empleado 298e5efb-1d2b-46fa-9b87-b9db7d1fcc3c (código Excel 123)
UPDATE erp.personas p SET nombre = COALESCE('JESUS FERNANDO', p.nombre), apellido_paterno = COALESCE('VARGAS', p.apellido_paterno), apellido_materno = COALESCE('ALVAREZ', p.apellido_materno), rfc = COALESCE('VAAJ930724GG0', p.rfc), curp = COALESCE('VAAJ930724HCLRLS04', p.curp), nss = COALESCE('32119302902', p.nss), fecha_nacimiento = COALESCE('1993-07-24', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('FUNDADORES 119 DON ANTONIO', p.domicilio), telefono = COALESCE('8781659647', p.telefono), email = COALESCE('ferydevany@outlook.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '298e5efb-1d2b-46fa-9b87-b9db7d1fcc3c';

UPDATE erp.empleados SET numero_empleado = '123', fecha_ingreso = '2024-09-11', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32119302902', fecha_nacimiento = '1993-07-24', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Maquinaria' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Operador de Maquinaria Pesada' LIMIT 1), puesto_id) WHERE id = '298e5efb-1d2b-46fa-9b87-b9db7d1fcc3c';

-- Compensación vigente para empleado 298e5efb-1d2b-46fa-9b87-b9db7d1fcc3c
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '298e5efb-1d2b-46fa-9b87-b9db7d1fcc3c' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '298e5efb-1d2b-46fa-9b87-b9db7d1fcc3c', 440.87, 463.22, '01', 'Semanal', '2024-09-11', true);

-- Pago vigente para empleado 298e5efb-1d2b-46fa-9b87-b9db7d1fcc3c
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '298e5efb-1d2b-46fa-9b87-b9db7d1fcc3c' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '298e5efb-1d2b-46fa-9b87-b9db7d1fcc3c', '012', '1526813160', NULL, NULL, true, '2024-09-11');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '298e5efb-1d2b-46fa-9b87-b9db7d1fcc3c', (SELECT persona_id FROM erp.empleados WHERE id = '298e5efb-1d2b-46fa-9b87-b9db7d1fcc3c'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "123"}'::jsonb);

-- UPDATE persona del empleado 178aa57c-6ba5-4c5e-963a-fecef3d987fc (código Excel 125)
UPDATE erp.personas p SET nombre = COALESCE('JULIAN ALEJANDRO', p.nombre), apellido_paterno = COALESCE('MONTALVO', p.apellido_paterno), apellido_materno = COALESCE('MARIN', p.apellido_materno), rfc = COALESCE('MOMJ900702JI1', p.rfc), curp = COALESCE('MOMJ900702HCLNRL05', p.curp), nss = COALESCE('9079072162', p.nss), fecha_nacimiento = COALESCE('1990-07-02', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('piedras negras, CL', p.lugar_nacimiento), domicilio = COALESCE('blvd poza rica 1075 resendiz fierro', p.domicilio), telefono = COALESCE('8781045984', p.telefono), email = COALESCE('montalvoalejandro092@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '178aa57c-6ba5-4c5e-963a-fecef3d987fc';

UPDATE erp.empleados SET numero_empleado = '125', fecha_ingreso = '2024-09-26', fecha_baja = '2025-01-03', motivo_baja = 'Separación voluntaria', activo = false, nss = '9079072162', fecha_nacimiento = '1990-07-02', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = '178aa57c-6ba5-4c5e-963a-fecef3d987fc';

-- Compensación vigente para empleado 178aa57c-6ba5-4c5e-963a-fecef3d987fc
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '178aa57c-6ba5-4c5e-963a-fecef3d987fc' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '178aa57c-6ba5-4c5e-963a-fecef3d987fc', 433.33, 454.699698, '01', 'Semanal', '2024-09-26', true);

-- Pago vigente para empleado 178aa57c-6ba5-4c5e-963a-fecef3d987fc
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '178aa57c-6ba5-4c5e-963a-fecef3d987fc' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '178aa57c-6ba5-4c5e-963a-fecef3d987fc', '012', '1527898004', NULL, NULL, true, '2024-09-26');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '178aa57c-6ba5-4c5e-963a-fecef3d987fc', (SELECT persona_id FROM erp.empleados WHERE id = '178aa57c-6ba5-4c5e-963a-fecef3d987fc'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "125"}'::jsonb);

-- UPDATE persona del empleado cab0fe0b-0a40-4538-9a71-76febdd70662 (código Excel 126)
UPDATE erp.personas p SET nombre = COALESCE('JOSE LUIS', p.nombre), apellido_paterno = COALESCE('GONZALEZ', p.apellido_paterno), apellido_materno = COALESCE('VILLEGAS', p.apellido_materno), rfc = COALESCE('GOVL610820KF7', p.rfc), curp = COALESCE('GOVL610820HCLNLS03', p.curp), nss = COALESCE('32806126481', p.nss), fecha_nacimiento = COALESCE('1961-08-20', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('SANTO TOMAS 206 JUAREZ', p.domicilio), telefono = COALESCE('8781468880', p.telefono), email = COALESCE('jlgzzvg@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'cab0fe0b-0a40-4538-9a71-76febdd70662';

UPDATE erp.empleados SET numero_empleado = '126', fecha_ingreso = '2024-10-21', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32806126481', fecha_nacimiento = '1961-08-20', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Jefe de Cuadrilla' LIMIT 1), puesto_id) WHERE id = 'cab0fe0b-0a40-4538-9a71-76febdd70662';

-- Compensación vigente para empleado cab0fe0b-0a40-4538-9a71-76febdd70662
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'cab0fe0b-0a40-4538-9a71-76febdd70662' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'cab0fe0b-0a40-4538-9a71-76febdd70662', 750.0, 788.01, '01', 'Semanal', '2024-10-21', true);

-- Pago vigente para empleado cab0fe0b-0a40-4538-9a71-76febdd70662
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'cab0fe0b-0a40-4538-9a71-76febdd70662' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'cab0fe0b-0a40-4538-9a71-76febdd70662', '012', '1529217720', NULL, NULL, true, '2024-10-21');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'cab0fe0b-0a40-4538-9a71-76febdd70662', (SELECT persona_id FROM erp.empleados WHERE id = 'cab0fe0b-0a40-4538-9a71-76febdd70662'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "126"}'::jsonb);

-- UPDATE persona del empleado 36492800-6dfd-4f95-9387-d5de5561bbad (código Excel 127)
UPDATE erp.personas p SET nombre = COALESCE('DIEGO', p.nombre), apellido_paterno = COALESCE('DOMINGUEZ', p.apellido_paterno), apellido_materno = COALESCE('SILVERIO', p.apellido_materno), rfc = COALESCE('DOSD881226UT5', p.rfc), curp = COALESCE('DOSD881226HPLMLG02', p.curp), nss = COALESCE('65098823597', p.nss), fecha_nacimiento = COALESCE('1988-12-26', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PUEBLA, PL', p.lugar_nacimiento), domicilio = COALESCE('TEPIC 745 CENTRO', p.domicilio), telefono = COALESCE('8781573998', p.telefono), email = COALESCE('dmzsilveriodiego@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '36492800-6dfd-4f95-9387-d5de5561bbad';

UPDATE erp.empleados SET numero_empleado = '127', fecha_ingreso = '2024-10-21', fecha_baja = '2025-01-16', motivo_baja = NULL, activo = true, nss = '65098823597', fecha_nacimiento = '1988-12-26', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = '36492800-6dfd-4f95-9387-d5de5561bbad';

-- Compensación vigente para empleado 36492800-6dfd-4f95-9387-d5de5561bbad
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '36492800-6dfd-4f95-9387-d5de5561bbad' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '36492800-6dfd-4f95-9387-d5de5561bbad', 440.87, 463.22, '01', 'Semanal', '2024-10-21', true);

-- Pago vigente para empleado 36492800-6dfd-4f95-9387-d5de5561bbad
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '36492800-6dfd-4f95-9387-d5de5561bbad' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '36492800-6dfd-4f95-9387-d5de5561bbad', '012', '1529971850', NULL, NULL, true, '2024-10-21');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '36492800-6dfd-4f95-9387-d5de5561bbad', (SELECT persona_id FROM erp.empleados WHERE id = '36492800-6dfd-4f95-9387-d5de5561bbad'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "127"}'::jsonb);

-- UPDATE persona del empleado 01cb81bb-0a8e-4341-948a-c7b54e8b4465 (código Excel 128)
UPDATE erp.personas p SET nombre = COALESCE('ALBERTO ALEJANDRO', p.nombre), apellido_paterno = COALESCE('FLORES', p.apellido_paterno), apellido_materno = COALESCE('RANGEL', p.apellido_materno), rfc = COALESCE('FORA941009PR6', p.rfc), curp = COALESCE('FORA941009HCLLNL00', p.curp), nss = COALESCE('32959460018', p.nss), fecha_nacimiento = COALESCE('1994-10-09', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('JULIO TORRI 1286 FRACC REAL DEL NORTE', p.domicilio), telefono = COALESCE('8781555794', p.telefono), email = COALESCE('aafr2806@hotmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '01cb81bb-0a8e-4341-948a-c7b54e8b4465';

UPDATE erp.empleados SET numero_empleado = '128', fecha_ingreso = '2024-10-25', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32959460018', fecha_nacimiento = '1994-10-09', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ventas' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Gestor de Trámites' LIMIT 1), puesto_id) WHERE id = '01cb81bb-0a8e-4341-948a-c7b54e8b4465';

-- Compensación vigente para empleado 01cb81bb-0a8e-4341-948a-c7b54e8b4465
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '01cb81bb-0a8e-4341-948a-c7b54e8b4465' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '01cb81bb-0a8e-4341-948a-c7b54e8b4465', 441.5, 463.88, '01', 'Semanal', '2024-10-25', true);

-- Pago vigente para empleado 01cb81bb-0a8e-4341-948a-c7b54e8b4465
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '01cb81bb-0a8e-4341-948a-c7b54e8b4465' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '01cb81bb-0a8e-4341-948a-c7b54e8b4465', '012', '1508144879', NULL, NULL, true, '2024-10-25');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '01cb81bb-0a8e-4341-948a-c7b54e8b4465', (SELECT persona_id FROM erp.empleados WHERE id = '01cb81bb-0a8e-4341-948a-c7b54e8b4465'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "128"}'::jsonb);

-- UPDATE persona del empleado bb4bda53-7c8a-480a-aafb-3921ad9335a0 (código Excel 130)
UPDATE erp.personas p SET nombre = COALESCE('LORENA DANIELA', p.nombre), apellido_paterno = COALESCE('DURAN', p.apellido_paterno), apellido_materno = COALESCE('SILVA', p.apellido_materno), rfc = COALESCE('DUSL011017NL3', p.rfc), curp = COALESCE('DUSL011017MMNRLRA6', p.curp), nss = COALESCE('08240120348', p.nss), fecha_nacimiento = COALESCE('2001-10-17', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('MICHOACAN, MN', p.lugar_nacimiento), domicilio = COALESCE('GALEANA 1408 MUNDO NUEVO', p.domicilio), email = COALESCE('dduraaan8@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'bb4bda53-7c8a-480a-aafb-3921ad9335a0';

UPDATE erp.empleados SET numero_empleado = '130', fecha_ingreso = '2024-11-01', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '08240120348', fecha_nacimiento = '2001-10-17', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ventas' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Hostess' LIMIT 1), puesto_id) WHERE id = 'bb4bda53-7c8a-480a-aafb-3921ad9335a0';

-- Compensación vigente para empleado bb4bda53-7c8a-480a-aafb-3921ad9335a0
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'bb4bda53-7c8a-480a-aafb-3921ad9335a0' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'bb4bda53-7c8a-480a-aafb-3921ad9335a0', 440.87, 463.22, '01', 'Semanal', '2024-11-01', true);

-- Pago vigente para empleado bb4bda53-7c8a-480a-aafb-3921ad9335a0
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'bb4bda53-7c8a-480a-aafb-3921ad9335a0' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'bb4bda53-7c8a-480a-aafb-3921ad9335a0', '012', '1595975227', NULL, NULL, true, '2024-11-01');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'bb4bda53-7c8a-480a-aafb-3921ad9335a0', (SELECT persona_id FROM erp.empleados WHERE id = 'bb4bda53-7c8a-480a-aafb-3921ad9335a0'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "130"}'::jsonb);

-- UPDATE persona del empleado e65d86e0-49f9-440f-987b-639df36b55f3 (código Excel 132)
UPDATE erp.personas p SET nombre = COALESCE('JOSUE HERCULANO', p.nombre), apellido_paterno = COALESCE('GONZALEZ', p.apellido_paterno), apellido_materno = COALESCE('TOVAR', p.apellido_materno), rfc = COALESCE('GOTJ860813E26', p.rfc), curp = COALESCE('GOTJ860813HCLNVS01', p.curp), nss = COALESCE('32038505940', p.nss), fecha_nacimiento = COALESCE('1986-08-13', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('EL GUANTE 608 VILLA DEL CARMEN', p.domicilio), telefono = COALESCE('8781550949', p.telefono), email = COALESCE('josueenrike@hotmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'e65d86e0-49f9-440f-987b-639df36b55f3';

UPDATE erp.empleados SET numero_empleado = '132', fecha_ingreso = '2024-11-29', fecha_baja = '2025-01-10', motivo_baja = 'Separación voluntaria', activo = false, nss = '32038505940', fecha_nacimiento = '1986-08-13', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Oficial General' LIMIT 1), puesto_id) WHERE id = 'e65d86e0-49f9-440f-987b-639df36b55f3';

-- Compensación vigente para empleado e65d86e0-49f9-440f-987b-639df36b55f3
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'e65d86e0-49f9-440f-987b-639df36b55f3' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'e65d86e0-49f9-440f-987b-639df36b55f3', 433.33, 454.699698, '01', 'Semanal', '2024-11-29', true);

-- Pago vigente para empleado e65d86e0-49f9-440f-987b-639df36b55f3
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'e65d86e0-49f9-440f-987b-639df36b55f3' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'e65d86e0-49f9-440f-987b-639df36b55f3', '012', '1554469623', NULL, NULL, true, '2024-11-29');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'e65d86e0-49f9-440f-987b-639df36b55f3', (SELECT persona_id FROM erp.empleados WHERE id = 'e65d86e0-49f9-440f-987b-639df36b55f3'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "132"}'::jsonb);

-- UPDATE persona del empleado 9e185061-776b-4768-aa7f-412cdf6b4ffa (código Excel 133)
UPDATE erp.personas p SET nombre = COALESCE('HECTOR MANUEL', p.nombre), apellido_paterno = COALESCE('CORTEZ', p.apellido_paterno), apellido_materno = COALESCE('MURILLO', p.apellido_materno), rfc = COALESCE('COMH9110109Q6', p.rfc), curp = COALESCE('COMH911010HCLRRC07', p.curp), nss = COALESCE('32109147911', p.nss), fecha_nacimiento = COALESCE('1991-10-10', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('OBREGON 404 FRANCISCO VILLA', p.domicilio), telefono = COALESCE('8781438682', p.telefono), email = COALESCE('jei.cor911010@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '9e185061-776b-4768-aa7f-412cdf6b4ffa';

UPDATE erp.empleados SET numero_empleado = '133', fecha_ingreso = '2024-12-09', fecha_baja = '2025-01-09', motivo_baja = 'Abandono de empleo', activo = false, nss = '32109147911', fecha_nacimiento = '1991-10-10', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Oficial General' LIMIT 1), puesto_id) WHERE id = '9e185061-776b-4768-aa7f-412cdf6b4ffa';

-- Compensación vigente para empleado 9e185061-776b-4768-aa7f-412cdf6b4ffa
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '9e185061-776b-4768-aa7f-412cdf6b4ffa' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '9e185061-776b-4768-aa7f-412cdf6b4ffa', 433.33, 454.699698, '01', 'Semanal', '2024-12-09', true);

-- Pago vigente para empleado 9e185061-776b-4768-aa7f-412cdf6b4ffa
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '9e185061-776b-4768-aa7f-412cdf6b4ffa' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '9e185061-776b-4768-aa7f-412cdf6b4ffa', '012', '1532928576', NULL, NULL, true, '2024-12-09');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '9e185061-776b-4768-aa7f-412cdf6b4ffa', (SELECT persona_id FROM erp.empleados WHERE id = '9e185061-776b-4768-aa7f-412cdf6b4ffa'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'fuzzy_nombre_fecha', '{"match_metodo": "fuzzy_nombre_fecha", "codigo": "133"}'::jsonb);

-- UPDATE persona del empleado 38b6612a-be3a-4b6a-9dc1-55e9d8bd38d4 (código Excel 134)
UPDATE erp.personas p SET nombre = COALESCE('MARTIN GETRUDIS', p.nombre), apellido_paterno = COALESCE('ESTRADA', p.apellido_paterno), apellido_materno = COALESCE('RODRIGUEZ', p.apellido_materno), rfc = COALESCE('EARM880206NT2', p.rfc), curp = COALESCE('EARM880206HCLSDR01', p.curp), nss = COALESCE('32088805158', p.nss), fecha_nacimiento = COALESCE('1988-02-06', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('JALISCO 3015F VISTA HERMOSA', p.domicilio), telefono = COALESCE('8781169344', p.telefono), email = COALESCE('bandalosalvaje.estrada@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '38b6612a-be3a-4b6a-9dc1-55e9d8bd38d4';

UPDATE erp.empleados SET numero_empleado = '134', fecha_ingreso = '2025-01-08', fecha_baja = '2026-02-27', motivo_baja = 'Separación voluntaria', activo = false, nss = '32088805158', fecha_nacimiento = '1988-02-06', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Evap' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Oficial General' LIMIT 1), puesto_id) WHERE id = '38b6612a-be3a-4b6a-9dc1-55e9d8bd38d4';

-- Compensación vigente para empleado 38b6612a-be3a-4b6a-9dc1-55e9d8bd38d4
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '38b6612a-be3a-4b6a-9dc1-55e9d8bd38d4' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '38b6612a-be3a-4b6a-9dc1-55e9d8bd38d4', 440.87, 462.61, '01', 'Semanal', '2025-01-08', true);

-- Pago vigente para empleado 38b6612a-be3a-4b6a-9dc1-55e9d8bd38d4
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '38b6612a-be3a-4b6a-9dc1-55e9d8bd38d4' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '38b6612a-be3a-4b6a-9dc1-55e9d8bd38d4', '012', '1534679620', NULL, NULL, true, '2025-01-08');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '38b6612a-be3a-4b6a-9dc1-55e9d8bd38d4', (SELECT persona_id FROM erp.empleados WHERE id = '38b6612a-be3a-4b6a-9dc1-55e9d8bd38d4'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "134"}'::jsonb);

-- UPDATE persona del empleado 49491189-a52e-4016-a134-20cc87af4b1d (código Excel 135)
UPDATE erp.personas p SET nombre = COALESCE('JESUS MANUEL', p.nombre), apellido_paterno = COALESCE('RAMIREZ', p.apellido_paterno), apellido_materno = COALESCE('MARTINEZ', p.apellido_materno), rfc = COALESCE('RAMJ680415CR2', p.rfc), curp = COALESCE('RAMJ680415HCLMRS07', p.curp), nss = COALESCE('32906870772', p.nss), fecha_nacimiento = COALESCE('1968-04-15', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('CATARINO RIOS 822', p.domicilio), telefono = COALESCE('8781008409', p.telefono), email = COALESCE('ramirezmartinezj...l291@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '49491189-a52e-4016-a134-20cc87af4b1d';

UPDATE erp.empleados SET numero_empleado = '135', fecha_ingreso = '2025-01-10', fecha_baja = '2025-01-30', motivo_baja = 'Separación voluntaria', activo = false, nss = '32906870772', fecha_nacimiento = '1968-04-15', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Construcción' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Oficial Albañil' LIMIT 1), puesto_id) WHERE id = '49491189-a52e-4016-a134-20cc87af4b1d';

-- Compensación vigente para empleado 49491189-a52e-4016-a134-20cc87af4b1d
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '49491189-a52e-4016-a134-20cc87af4b1d' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '49491189-a52e-4016-a134-20cc87af4b1d', 750.0, 786.986301, '01', 'Semanal', '2025-01-10', true);

-- Pago vigente para empleado 49491189-a52e-4016-a134-20cc87af4b1d
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '49491189-a52e-4016-a134-20cc87af4b1d' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '49491189-a52e-4016-a134-20cc87af4b1d', '012', '1534942816', NULL, NULL, true, '2025-01-10');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '49491189-a52e-4016-a134-20cc87af4b1d', (SELECT persona_id FROM erp.empleados WHERE id = '49491189-a52e-4016-a134-20cc87af4b1d'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "135"}'::jsonb);

-- UPDATE persona del empleado c8c07af5-e1e5-4442-bd6b-bd783be72151 (código Excel 136)
UPDATE erp.personas p SET nombre = COALESCE('JUAN MOISES', p.nombre), apellido_paterno = COALESCE('SOTO', p.apellido_paterno), apellido_materno = COALESCE('FLORES', p.apellido_materno), rfc = COALESCE('SOFJ010624LL3', p.rfc), curp = COALESCE('SOFJ010624HCLTLNA4', p.curp), nss = COALESCE('62170157630', p.nss), fecha_nacimiento = COALESCE('2001-06-24', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('BENECIO LOPEZ PADILLA 1408 LOS GOBERNADORES', p.domicilio), telefono = COALESCE('8782093634', p.telefono), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'c8c07af5-e1e5-4442-bd6b-bd783be72151';

UPDATE erp.empleados SET numero_empleado = '136', fecha_ingreso = '2025-01-10', fecha_baja = '2025-03-07', motivo_baja = 'Separación voluntaria', activo = false, nss = '62170157630', fecha_nacimiento = '2001-06-24', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Construcción' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = 'c8c07af5-e1e5-4442-bd6b-bd783be72151';

-- Compensación vigente para empleado c8c07af5-e1e5-4442-bd6b-bd783be72151
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'c8c07af5-e1e5-4442-bd6b-bd783be72151' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c8c07af5-e1e5-4442-bd6b-bd783be72151', 419.88, 440.58641, '01', 'Semanal', '2025-01-10', true);

-- Pago vigente para empleado c8c07af5-e1e5-4442-bd6b-bd783be72151
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'c8c07af5-e1e5-4442-bd6b-bd783be72151' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c8c07af5-e1e5-4442-bd6b-bd783be72151', '012', '1534945017', NULL, NULL, true, '2025-01-10');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c8c07af5-e1e5-4442-bd6b-bd783be72151', (SELECT persona_id FROM erp.empleados WHERE id = 'c8c07af5-e1e5-4442-bd6b-bd783be72151'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "136"}'::jsonb);

-- UPDATE persona del empleado c3d7cd19-fec2-4e37-bd11-84ce7c7eccae (código Excel 137)
UPDATE erp.personas p SET nombre = COALESCE('BENJAMIN', p.nombre), apellido_paterno = COALESCE('LOPEZ', p.apellido_paterno), apellido_materno = COALESCE('MARTINEZ', p.apellido_materno), rfc = COALESCE('LOMB751018BN4', p.rfc), curp = COALESCE('LOMB751018HCLPRN06', p.curp), nss = COALESCE('32917547450', p.nss), fecha_nacimiento = COALESCE('1975-10-18', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('piedras negras, CL', p.lugar_nacimiento), domicilio = COALESCE('MACLOVIO HERRERA 210 LAZARO CARDENAS', p.domicilio), telefono = COALESCE('8781007496', p.telefono), email = COALESCE('benjy_lomar@hotmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'c3d7cd19-fec2-4e37-bd11-84ce7c7eccae';

UPDATE erp.empleados SET numero_empleado = '137', fecha_ingreso = '2025-01-17', fecha_baja = '2025-04-18', motivo_baja = 'Separación voluntaria', activo = false, nss = '32917547450', fecha_nacimiento = '1975-10-18', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Compras' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Almacenista' LIMIT 1), puesto_id) WHERE id = 'c3d7cd19-fec2-4e37-bd11-84ce7c7eccae';

-- Compensación vigente para empleado c3d7cd19-fec2-4e37-bd11-84ce7c7eccae
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'c3d7cd19-fec2-4e37-bd11-84ce7c7eccae' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c3d7cd19-fec2-4e37-bd11-84ce7c7eccae', 419.88, 440.58641, '01', 'Semanal', '2025-01-17', true);

-- Pago vigente para empleado c3d7cd19-fec2-4e37-bd11-84ce7c7eccae
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'c3d7cd19-fec2-4e37-bd11-84ce7c7eccae' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c3d7cd19-fec2-4e37-bd11-84ce7c7eccae', '012', '1578186424', NULL, NULL, true, '2025-01-17');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c3d7cd19-fec2-4e37-bd11-84ce7c7eccae', (SELECT persona_id FROM erp.empleados WHERE id = 'c3d7cd19-fec2-4e37-bd11-84ce7c7eccae'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "137"}'::jsonb);

-- UPDATE persona del empleado 525f6586-eecd-4e85-b095-368872100a6d (código Excel 138)
UPDATE erp.personas p SET nombre = COALESCE('MARIO', p.nombre), apellido_paterno = COALESCE('VAZQUEZ', p.apellido_paterno), apellido_materno = COALESCE('MARTINEZ', p.apellido_materno), rfc = COALESCE('VAMM7201152N6', p.rfc), curp = COALESCE('VAMM720115HGTZRR08', p.curp), nss = COALESCE('92887227467', p.nss), fecha_nacimiento = COALESCE('1972-01-15', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('GUANAJUATO, GT', p.lugar_nacimiento), domicilio = COALESCE('PRIMERO DE MAYO 405 EJIDO PIEDRAS NEGRAS', p.domicilio), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '525f6586-eecd-4e85-b095-368872100a6d';

UPDATE erp.empleados SET numero_empleado = '138', fecha_ingreso = '2025-02-14', fecha_baja = '2025-03-06', motivo_baja = 'Separación voluntaria', activo = false, nss = '92887227467', fecha_nacimiento = '1972-01-15', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Construcción' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Oficial Albañil' LIMIT 1), puesto_id) WHERE id = '525f6586-eecd-4e85-b095-368872100a6d';

-- Compensación vigente para empleado 525f6586-eecd-4e85-b095-368872100a6d
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '525f6586-eecd-4e85-b095-368872100a6d' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '525f6586-eecd-4e85-b095-368872100a6d', 419.88, 440.58641, '01', 'Semanal', '2025-02-14', true);

-- Pago vigente para empleado 525f6586-eecd-4e85-b095-368872100a6d
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '525f6586-eecd-4e85-b095-368872100a6d' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '525f6586-eecd-4e85-b095-368872100a6d', '012', '1538262563', NULL, NULL, true, '2025-02-14');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '525f6586-eecd-4e85-b095-368872100a6d', (SELECT persona_id FROM erp.empleados WHERE id = '525f6586-eecd-4e85-b095-368872100a6d'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "138"}'::jsonb);

-- UPDATE persona del empleado aa87424a-77b7-4fed-b1ef-ed7984f9e90a (código Excel 139)
UPDATE erp.personas p SET nombre = COALESCE('JESUS LORENZO', p.nombre), apellido_paterno = COALESCE('BANDA', p.apellido_paterno), apellido_materno = COALESCE('ALONSO', p.apellido_materno), rfc = COALESCE('BAAJ0007211I2', p.rfc), curp = COALESCE('BAAJ000721HCLNLSA9', p.curp), nss = COALESCE('17170071876', p.nss), fecha_nacimiento = COALESCE('2000-07-21', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('CARRANZA 908 FRANCISCO VILLA', p.domicilio), telefono = COALESCE('8781531214', p.telefono), email = COALESCE('lorenzohonda.70@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'aa87424a-77b7-4fed-b1ef-ed7984f9e90a';

UPDATE erp.empleados SET numero_empleado = '139', fecha_ingreso = '2025-02-27', fecha_baja = '2025-03-28', motivo_baja = 'Término de contrato', activo = false, nss = '17170071876', fecha_nacimiento = '2000-07-21', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = 'aa87424a-77b7-4fed-b1ef-ed7984f9e90a';

-- Compensación vigente para empleado aa87424a-77b7-4fed-b1ef-ed7984f9e90a
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'aa87424a-77b7-4fed-b1ef-ed7984f9e90a' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'aa87424a-77b7-4fed-b1ef-ed7984f9e90a', 419.88, 440.58641, '01', 'Semanal', '2025-02-27', true);

-- Pago vigente para empleado aa87424a-77b7-4fed-b1ef-ed7984f9e90a
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'aa87424a-77b7-4fed-b1ef-ed7984f9e90a' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'aa87424a-77b7-4fed-b1ef-ed7984f9e90a', '012', '1529154105', NULL, NULL, true, '2025-02-27');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'aa87424a-77b7-4fed-b1ef-ed7984f9e90a', (SELECT persona_id FROM erp.empleados WHERE id = 'aa87424a-77b7-4fed-b1ef-ed7984f9e90a'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "139"}'::jsonb);

-- UPDATE persona del empleado 85a81ac4-1c66-42ac-8bd1-3d33c2b2c75c (código Excel 140)
UPDATE erp.personas p SET nombre = COALESCE('CARLOS ALFREDO', p.nombre), apellido_paterno = COALESCE('ZAMORA', p.apellido_paterno), apellido_materno = COALESCE('DE LA CRUZ', p.apellido_materno), rfc = COALESCE('ZACC0106283D7', p.rfc), curp = COALESCE('ZACC010628HCLMRRA7', p.curp), nss = COALESCE('50170189893', p.nss), fecha_nacimiento = COALESCE('2001-06-28', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('GUSTAVO EZPINOZA 1512 LOS GOBERNADORES', p.domicilio), telefono = COALESCE('8781452523', p.telefono), email = COALESCE('zamoraalfredo470@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '85a81ac4-1c66-42ac-8bd1-3d33c2b2c75c';

UPDATE erp.empleados SET numero_empleado = '140', fecha_ingreso = '2025-02-27', fecha_baja = '2025-03-28', motivo_baja = 'Término de contrato', activo = false, nss = '50170189893', fecha_nacimiento = '2001-06-28', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = '85a81ac4-1c66-42ac-8bd1-3d33c2b2c75c';

-- Compensación vigente para empleado 85a81ac4-1c66-42ac-8bd1-3d33c2b2c75c
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '85a81ac4-1c66-42ac-8bd1-3d33c2b2c75c' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '85a81ac4-1c66-42ac-8bd1-3d33c2b2c75c', 419.88, 440.58641, '01', 'Semanal', '2025-02-27', true);

-- Pago vigente para empleado 85a81ac4-1c66-42ac-8bd1-3d33c2b2c75c
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '85a81ac4-1c66-42ac-8bd1-3d33c2b2c75c' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '85a81ac4-1c66-42ac-8bd1-3d33c2b2c75c', '012', '1518108392', NULL, NULL, true, '2025-02-27');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '85a81ac4-1c66-42ac-8bd1-3d33c2b2c75c', (SELECT persona_id FROM erp.empleados WHERE id = '85a81ac4-1c66-42ac-8bd1-3d33c2b2c75c'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "140"}'::jsonb);

-- UPDATE persona del empleado f17cac99-aa66-45f9-b890-a9259a1b7162 (código Excel 141)
UPDATE erp.personas p SET nombre = COALESCE('MARTIN', p.nombre), apellido_paterno = COALESCE('RODRIGUEZ', p.apellido_paterno), apellido_materno = COALESCE('OLIVARES', p.apellido_materno), rfc = COALESCE('ROOM890724IEA', p.rfc), curp = COALESCE('ROOM890724HCLDLR00', p.curp), nss = COALESCE('32058915250', p.nss), fecha_nacimiento = COALESCE('1989-07-24', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('piedras negras, CL', p.lugar_nacimiento), domicilio = COALESCE('el capricho 2226 villa del carmen', p.domicilio), email = COALESCE('rodriguezolivaresmartin7@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'f17cac99-aa66-45f9-b890-a9259a1b7162';

UPDATE erp.empleados SET numero_empleado = '141', fecha_ingreso = '2025-02-27', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32058915250', fecha_nacimiento = '1989-07-24', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Maquinaria' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Operador de Maquinaria Pesada' LIMIT 1), puesto_id) WHERE id = 'f17cac99-aa66-45f9-b890-a9259a1b7162';

-- Compensación vigente para empleado f17cac99-aa66-45f9-b890-a9259a1b7162
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'f17cac99-aa66-45f9-b890-a9259a1b7162' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'f17cac99-aa66-45f9-b890-a9259a1b7162', 440.87, 463.22, '01', 'Semanal', '2025-02-27', true);

-- Pago vigente para empleado f17cac99-aa66-45f9-b890-a9259a1b7162
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'f17cac99-aa66-45f9-b890-a9259a1b7162' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'f17cac99-aa66-45f9-b890-a9259a1b7162', '012', '1539049745', NULL, NULL, true, '2025-02-27');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'f17cac99-aa66-45f9-b890-a9259a1b7162', (SELECT persona_id FROM erp.empleados WHERE id = 'f17cac99-aa66-45f9-b890-a9259a1b7162'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "141"}'::jsonb);

-- UPDATE persona del empleado 4ffe2fa8-d643-479e-a9a6-1249995ec0f1 (código Excel 142)
UPDATE erp.personas p SET nombre = COALESCE('SAMUEL RAMIRO', p.nombre), apellido_paterno = COALESCE('VICENTE', p.apellido_paterno), apellido_materno = COALESCE('RAMIREZ', p.apellido_materno), rfc = COALESCE('VIRS900918AD5', p.rfc), curp = COALESCE('VIRS900918HVZCMM08', p.curp), nss = COALESCE('02259019053', p.nss), fecha_nacimiento = COALESCE('1990-09-18', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('MICHOACAN, MN', p.lugar_nacimiento), domicilio = COALESCE('MOCANERO 721 AÑO 2000', p.domicilio), email = COALESCE('saramvi08@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '4ffe2fa8-d643-479e-a9a6-1249995ec0f1';

UPDATE erp.empleados SET numero_empleado = '142', fecha_ingreso = '2025-03-10', fecha_baja = '2026-02-16', motivo_baja = 'Separación voluntaria', activo = false, nss = '02259019053', fecha_nacimiento = '1990-09-18', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = '4ffe2fa8-d643-479e-a9a6-1249995ec0f1';

-- Compensación vigente para empleado 4ffe2fa8-d643-479e-a9a6-1249995ec0f1
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '4ffe2fa8-d643-479e-a9a6-1249995ec0f1' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '4ffe2fa8-d643-479e-a9a6-1249995ec0f1', 440.87, 462.61, '01', 'Semanal', '2025-03-10', true);

-- Pago vigente para empleado 4ffe2fa8-d643-479e-a9a6-1249995ec0f1
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '4ffe2fa8-d643-479e-a9a6-1249995ec0f1' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '4ffe2fa8-d643-479e-a9a6-1249995ec0f1', '012', '1539805241', NULL, NULL, true, '2025-03-10');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '4ffe2fa8-d643-479e-a9a6-1249995ec0f1', (SELECT persona_id FROM erp.empleados WHERE id = '4ffe2fa8-d643-479e-a9a6-1249995ec0f1'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "142"}'::jsonb);

-- UPDATE persona del empleado 09e55306-5d8a-46f5-b1f6-ee835f29e37d (código Excel 143)
UPDATE erp.personas p SET nombre = COALESCE('ALDO ENRIQUE', p.nombre), apellido_paterno = COALESCE('ANGUIANO', p.apellido_paterno), apellido_materno = COALESCE('BARRIENTOS', p.apellido_materno), rfc = COALESCE('AUBA960709R84', p.rfc), curp = COALESCE('AUBA960709HCLNRL09', p.curp), nss = COALESCE('02259630529', p.nss), fecha_nacimiento = COALESCE('1996-07-09', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('SAN ANTONIO 504 VILLA DEL CARMEN', p.domicilio), telefono = COALESCE('8787024942', p.telefono), email = COALESCE('aldoanguianoeb@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '09e55306-5d8a-46f5-b1f6-ee835f29e37d';

UPDATE erp.empleados SET numero_empleado = '143', fecha_ingreso = '2025-03-21', fecha_baja = '2026-03-19', motivo_baja = 'Separación voluntaria', activo = false, nss = '02259630529', fecha_nacimiento = '1996-07-09', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Construcción' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Supervisor de Obra' LIMIT 1), puesto_id) WHERE id = '09e55306-5d8a-46f5-b1f6-ee835f29e37d';

-- Compensación vigente para empleado 09e55306-5d8a-46f5-b1f6-ee835f29e37d
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '09e55306-5d8a-46f5-b1f6-ee835f29e37d' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '09e55306-5d8a-46f5-b1f6-ee835f29e37d', 666.67, 699.546876, '01', 'Semanal', '2025-03-21', true);

-- Pago vigente para empleado 09e55306-5d8a-46f5-b1f6-ee835f29e37d
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '09e55306-5d8a-46f5-b1f6-ee835f29e37d' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '09e55306-5d8a-46f5-b1f6-ee835f29e37d', '012', '1540796394', NULL, NULL, true, '2025-03-21');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '09e55306-5d8a-46f5-b1f6-ee835f29e37d', (SELECT persona_id FROM erp.empleados WHERE id = '09e55306-5d8a-46f5-b1f6-ee835f29e37d'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "143"}'::jsonb);

-- UPDATE persona del empleado 45e1d5a1-64d7-49dc-82e6-3058a92a1a4e (código Excel 147)
UPDATE erp.personas p SET nombre = COALESCE('VICTOR ALFONSO', p.nombre), apellido_paterno = COALESCE('MARIANO', p.apellido_paterno), apellido_materno = COALESCE('AGUILAR', p.apellido_materno), rfc = COALESCE('MAAV9804181N9', p.rfc), curp = COALESCE('MAAV980418HVZRGC10', p.curp), nss = COALESCE('03169871260', p.nss), fecha_nacimiento = COALESCE('1998-04-18', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('TUXPAN VERACRUZ, VZ', p.lugar_nacimiento), domicilio = COALESCE('CAMINO A MARAVILLAS 25 VILLA DE FUENTE', p.domicilio), telefono = COALESCE('8781372344', p.telefono), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '45e1d5a1-64d7-49dc-82e6-3058a92a1a4e';

UPDATE erp.empleados SET numero_empleado = '147', fecha_ingreso = '2025-04-14', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '03169871260', fecha_nacimiento = '1998-04-18', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = '45e1d5a1-64d7-49dc-82e6-3058a92a1a4e';

-- Compensación vigente para empleado 45e1d5a1-64d7-49dc-82e6-3058a92a1a4e
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '45e1d5a1-64d7-49dc-82e6-3058a92a1a4e' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '45e1d5a1-64d7-49dc-82e6-3058a92a1a4e', 440.87, 463.22, '01', 'Semanal', '2025-04-14', true);

-- Pago vigente para empleado 45e1d5a1-64d7-49dc-82e6-3058a92a1a4e
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '45e1d5a1-64d7-49dc-82e6-3058a92a1a4e' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '45e1d5a1-64d7-49dc-82e6-3058a92a1a4e', '012', '1542366098', NULL, NULL, true, '2025-04-14');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '45e1d5a1-64d7-49dc-82e6-3058a92a1a4e', (SELECT persona_id FROM erp.empleados WHERE id = '45e1d5a1-64d7-49dc-82e6-3058a92a1a4e'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "147"}'::jsonb);

-- UPDATE persona del empleado 57e123bf-8152-4ab8-96ce-20081ef68239 (código Excel 148)
UPDATE erp.personas p SET nombre = COALESCE('NALA', p.nombre), apellido_paterno = COALESCE('GOMEZ', p.apellido_paterno), apellido_materno = COALESCE('FLORES', p.apellido_materno), rfc = COALESCE('GOFN941026RS0', p.rfc), curp = COALESCE('GOFN941026MCLMLL05', p.curp), nss = COALESCE('68169401202', p.nss), fecha_nacimiento = COALESCE('1994-10-26', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('ORIZABA 326 CUMBRES', p.domicilio), telefono = COALESCE('8781659090', p.telefono), email = COALESCE('arq.nalagf7@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '57e123bf-8152-4ab8-96ce-20081ef68239';

UPDATE erp.empleados SET numero_empleado = '148', fecha_ingreso = '2025-04-21', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '68169401202', fecha_nacimiento = '1994-10-26', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Auxiliar de Proyectos' LIMIT 1), puesto_id) WHERE id = '57e123bf-8152-4ab8-96ce-20081ef68239';

-- Compensación vigente para empleado 57e123bf-8152-4ab8-96ce-20081ef68239
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '57e123bf-8152-4ab8-96ce-20081ef68239' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '57e123bf-8152-4ab8-96ce-20081ef68239', 500.0, 525.34, '01', 'Semanal', '2025-04-21', true);

-- Pago vigente para empleado 57e123bf-8152-4ab8-96ce-20081ef68239
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '57e123bf-8152-4ab8-96ce-20081ef68239' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '57e123bf-8152-4ab8-96ce-20081ef68239', '012', '1542820691', NULL, NULL, true, '2025-04-21');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '57e123bf-8152-4ab8-96ce-20081ef68239', (SELECT persona_id FROM erp.empleados WHERE id = '57e123bf-8152-4ab8-96ce-20081ef68239'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "148"}'::jsonb);

-- UPDATE persona del empleado 47682c5a-ca13-4e7d-9f64-5bd1f8cde0d6 (código Excel 150)
UPDATE erp.personas p SET nombre = COALESCE('JONATHAN KRISTOFF', p.nombre), apellido_paterno = COALESCE('CORONA', p.apellido_paterno), apellido_materno = COALESCE('GUEDEA', p.apellido_materno), rfc = COALESCE('COGJ010719SJ7', p.rfc), curp = COALESCE('COGJ010719HCLRDNA0', p.curp), nss = COALESCE('17170152338', p.nss), fecha_nacimiento = COALESCE('2001-07-19', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('MANANTIAL AGUA VERDE 1065 EL MANANTIAL', p.domicilio), email = COALESCE('jonathancorona23c@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '47682c5a-ca13-4e7d-9f64-5bd1f8cde0d6';

UPDATE erp.empleados SET numero_empleado = '150', fecha_ingreso = '2025-04-25', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '17170152338', fecha_nacimiento = '2001-07-19', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = '47682c5a-ca13-4e7d-9f64-5bd1f8cde0d6';

-- Compensación vigente para empleado 47682c5a-ca13-4e7d-9f64-5bd1f8cde0d6
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '47682c5a-ca13-4e7d-9f64-5bd1f8cde0d6' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '47682c5a-ca13-4e7d-9f64-5bd1f8cde0d6', 440.87, 463.22, '01', 'Semanal', '2025-04-25', true);

-- Pago vigente para empleado 47682c5a-ca13-4e7d-9f64-5bd1f8cde0d6
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '47682c5a-ca13-4e7d-9f64-5bd1f8cde0d6' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '47682c5a-ca13-4e7d-9f64-5bd1f8cde0d6', '012', '1542947538', NULL, NULL, true, '2025-04-25');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '47682c5a-ca13-4e7d-9f64-5bd1f8cde0d6', (SELECT persona_id FROM erp.empleados WHERE id = '47682c5a-ca13-4e7d-9f64-5bd1f8cde0d6'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "150"}'::jsonb);

-- UPDATE persona del empleado 6b3aa6f2-5ec5-4d46-af6d-c8c30e83a474 (código Excel 153)
UPDATE erp.personas p SET nombre = COALESCE('CRISTOBAL', p.nombre), apellido_paterno = COALESCE('GUIA', p.apellido_paterno), apellido_materno = COALESCE('ROSAS', p.apellido_materno), rfc = COALESCE('GURC700811BB5', p.rfc), curp = COALESCE('GURC700811HGTXSR04', p.curp), nss = COALESCE('32927040736', p.nss), fecha_nacimiento = COALESCE('1970-08-11', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('GUANAJUATO, GT', p.lugar_nacimiento), domicilio = COALESCE('ELSA HERNANDEZ 103 LAZARO CARDENAS', p.domicilio), email = COALESCE('cristobalguiarosas519@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '6b3aa6f2-5ec5-4d46-af6d-c8c30e83a474';

UPDATE erp.empleados SET numero_empleado = '153', fecha_ingreso = '2025-05-09', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32927040736', fecha_nacimiento = '1970-08-11', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Construcción' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Oficial Albañil' LIMIT 1), puesto_id) WHERE id = '6b3aa6f2-5ec5-4d46-af6d-c8c30e83a474';

-- Compensación vigente para empleado 6b3aa6f2-5ec5-4d46-af6d-c8c30e83a474
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '6b3aa6f2-5ec5-4d46-af6d-c8c30e83a474' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '6b3aa6f2-5ec5-4d46-af6d-c8c30e83a474', 440.87, 462.61, '01', 'Semanal', '2025-05-09', true);

-- Pago vigente para empleado 6b3aa6f2-5ec5-4d46-af6d-c8c30e83a474
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '6b3aa6f2-5ec5-4d46-af6d-c8c30e83a474' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '6b3aa6f2-5ec5-4d46-af6d-c8c30e83a474', '012', '1544324694', NULL, NULL, true, '2025-05-09');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '6b3aa6f2-5ec5-4d46-af6d-c8c30e83a474', (SELECT persona_id FROM erp.empleados WHERE id = '6b3aa6f2-5ec5-4d46-af6d-c8c30e83a474'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "153"}'::jsonb);

-- UPDATE persona del empleado 0094e13f-5545-487e-bd5c-0f22f19e956e (código Excel 154)
UPDATE erp.personas p SET nombre = COALESCE('YAIR FERNANDO', p.nombre), apellido_paterno = COALESCE('DURON', p.apellido_paterno), apellido_materno = COALESCE('DE LA CRUZ', p.apellido_materno), rfc = COALESCE('DUCY0001039V1', p.rfc), curp = COALESCE('DUCY000103HCLRRRA2', p.curp), nss = COALESCE('17170047249', p.nss), fecha_nacimiento = COALESCE('2000-01-03', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('TILO 927 AÑO 2000', p.domicilio), telefono = COALESCE('8781058058', p.telefono), email = COALESCE('yairduron36@icloud.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '0094e13f-5545-487e-bd5c-0f22f19e956e';

UPDATE erp.empleados SET numero_empleado = '154', fecha_ingreso = '2025-05-16', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '17170047249', fecha_nacimiento = '2000-01-03', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = '0094e13f-5545-487e-bd5c-0f22f19e956e';

-- Compensación vigente para empleado 0094e13f-5545-487e-bd5c-0f22f19e956e
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '0094e13f-5545-487e-bd5c-0f22f19e956e' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '0094e13f-5545-487e-bd5c-0f22f19e956e', 440.87, 462.61, '01', 'Semanal', '2025-05-16', true);

-- Pago vigente para empleado 0094e13f-5545-487e-bd5c-0f22f19e956e
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '0094e13f-5545-487e-bd5c-0f22f19e956e' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '0094e13f-5545-487e-bd5c-0f22f19e956e', '012', '1544923080', NULL, NULL, true, '2025-05-16');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '0094e13f-5545-487e-bd5c-0f22f19e956e', (SELECT persona_id FROM erp.empleados WHERE id = '0094e13f-5545-487e-bd5c-0f22f19e956e'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "154"}'::jsonb);

-- UPDATE persona del empleado cae1af4c-468e-42d0-8902-d162e1440212 (código Excel 155)
UPDATE erp.personas p SET nombre = COALESCE('WILFREDO', p.nombre), apellido_paterno = COALESCE('MORALES', p.apellido_paterno), apellido_materno = COALESCE('BARRIENTOS', p.apellido_materno), rfc = COALESCE('MOBW9102015P1', p.rfc), curp = COALESCE('MOBW910201HCLRRL07', p.curp), nss = COALESCE('32079102375', p.nss), fecha_nacimiento = COALESCE('1991-02-01', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('MIGUEL HIDALGO 908 LAS MALVINAS', p.domicilio), email = COALESCE('willmorales.b@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'cae1af4c-468e-42d0-8902-d162e1440212';

UPDATE erp.empleados SET numero_empleado = '155', fecha_ingreso = '2025-05-16', fecha_baja = '2025-07-05', motivo_baja = 'Separación voluntaria', activo = false, nss = '32079102375', fecha_nacimiento = '1991-02-01', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento' LIMIT 1), puesto_id) WHERE id = 'cae1af4c-468e-42d0-8902-d162e1440212';

-- Compensación vigente para empleado cae1af4c-468e-42d0-8902-d162e1440212
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'cae1af4c-468e-42d0-8902-d162e1440212' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'cae1af4c-468e-42d0-8902-d162e1440212', 419.88, 440.58641, '01', 'Semanal', '2025-05-16', true);

-- Pago vigente para empleado cae1af4c-468e-42d0-8902-d162e1440212
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'cae1af4c-468e-42d0-8902-d162e1440212' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'cae1af4c-468e-42d0-8902-d162e1440212', '012', '1548090960', NULL, NULL, true, '2025-05-16');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'cae1af4c-468e-42d0-8902-d162e1440212', (SELECT persona_id FROM erp.empleados WHERE id = 'cae1af4c-468e-42d0-8902-d162e1440212'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "155"}'::jsonb);

-- UPDATE persona del empleado 5cd36e05-d68d-4837-96e0-2614098c455d (código Excel 156)
UPDATE erp.personas p SET nombre = COALESCE('LEONARDO EMMANUEL', p.nombre), apellido_paterno = COALESCE('RODRIGUEZ', p.apellido_paterno), apellido_materno = COALESCE('VALDEZ', p.apellido_materno), rfc = COALESCE('ROVL9411057X2', p.rfc), curp = COALESCE('ROVL941105HCLDLN04', p.curp), nss = COALESCE('32109423544', p.nss), fecha_nacimiento = COALESCE('1994-11-05', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('JILVERTO FARIAS 209 VALLE ESCONDIDO', p.domicilio), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '5cd36e05-d68d-4837-96e0-2614098c455d';

UPDATE erp.empleados SET numero_empleado = '156', fecha_ingreso = '2025-05-26', fecha_baja = '2025-08-01', motivo_baja = 'Separación voluntaria', activo = false, nss = '32109423544', fecha_nacimiento = '1994-11-05', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Construcción' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante de Albañil' LIMIT 1), puesto_id) WHERE id = '5cd36e05-d68d-4837-96e0-2614098c455d';

-- Compensación vigente para empleado 5cd36e05-d68d-4837-96e0-2614098c455d
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '5cd36e05-d68d-4837-96e0-2614098c455d' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '5cd36e05-d68d-4837-96e0-2614098c455d', 419.88, 440.58641, '01', 'Semanal', '2025-05-26', true);

-- Pago vigente para empleado 5cd36e05-d68d-4837-96e0-2614098c455d
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '5cd36e05-d68d-4837-96e0-2614098c455d' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '5cd36e05-d68d-4837-96e0-2614098c455d', '012', '1545517437', NULL, NULL, true, '2025-05-26');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '5cd36e05-d68d-4837-96e0-2614098c455d', (SELECT persona_id FROM erp.empleados WHERE id = '5cd36e05-d68d-4837-96e0-2614098c455d'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "156"}'::jsonb);

-- UPDATE persona del empleado d6357ed8-6ed4-442c-b39e-ea4c1fd37019 (código Excel 157)
UPDATE erp.personas p SET nombre = COALESCE('ANTONIO', p.nombre), apellido_paterno = COALESCE('HERNANDEZ', p.apellido_paterno), apellido_materno = COALESCE('FLORES', p.apellido_materno), rfc = COALESCE('HEFA760206K83', p.rfc), curp = COALESCE('HEFA760206HCLRLN05', p.curp), nss = COALESCE('32947541499', p.nss), fecha_nacimiento = COALESCE('1976-02-06', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('FRANCISCO I MADERO PTE 101 CENTRO', p.domicilio), telefono = COALESCE('8781223501', p.telefono), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'd6357ed8-6ed4-442c-b39e-ea4c1fd37019';

UPDATE erp.empleados SET numero_empleado = '157', fecha_ingreso = '2025-06-06', fecha_baja = '2025-09-19', motivo_baja = 'Separación voluntaria', activo = false, nss = '32947541499', fecha_nacimiento = '1976-02-06', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = 'd6357ed8-6ed4-442c-b39e-ea4c1fd37019';

-- Compensación vigente para empleado d6357ed8-6ed4-442c-b39e-ea4c1fd37019
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'd6357ed8-6ed4-442c-b39e-ea4c1fd37019' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'd6357ed8-6ed4-442c-b39e-ea4c1fd37019', 419.88, 440.58641, '01', 'Semanal', '2025-06-06', true);

-- Pago vigente para empleado d6357ed8-6ed4-442c-b39e-ea4c1fd37019
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'd6357ed8-6ed4-442c-b39e-ea4c1fd37019' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'd6357ed8-6ed4-442c-b39e-ea4c1fd37019', '012', '1546022491', NULL, NULL, true, '2025-06-06');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'd6357ed8-6ed4-442c-b39e-ea4c1fd37019', (SELECT persona_id FROM erp.empleados WHERE id = 'd6357ed8-6ed4-442c-b39e-ea4c1fd37019'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "157"}'::jsonb);

-- UPDATE persona del empleado c3d1b225-b4da-4276-b6e1-ba26abce691f (código Excel 158)
UPDATE erp.personas p SET nombre = COALESCE('ARTURO', p.nombre), apellido_paterno = COALESCE('BRAVO', p.apellido_paterno), apellido_materno = COALESCE('DE LOS SANTOS', p.apellido_materno), rfc = COALESCE('BASA691119724', p.rfc), curp = COALESCE('BASA691119HCLRNR01', p.curp), nss = COALESCE('32866641510', p.nss), fecha_nacimiento = COALESCE('1969-11-19', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('ABASOLO 500', p.domicilio), telefono = COALESCE('8781225598', p.telefono), email = COALESCE('arturobravode1969@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'c3d1b225-b4da-4276-b6e1-ba26abce691f';

UPDATE erp.empleados SET numero_empleado = '158', fecha_ingreso = '2025-06-30', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32866641510', fecha_nacimiento = '1969-11-19', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Maquinaria' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Operador de Maquinaria Pesada' LIMIT 1), puesto_id) WHERE id = 'c3d1b225-b4da-4276-b6e1-ba26abce691f';

-- Compensación vigente para empleado c3d1b225-b4da-4276-b6e1-ba26abce691f
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'c3d1b225-b4da-4276-b6e1-ba26abce691f' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c3d1b225-b4da-4276-b6e1-ba26abce691f', 440.87, 462.61, '01', 'Semanal', '2025-06-30', true);

-- Pago vigente para empleado c3d1b225-b4da-4276-b6e1-ba26abce691f
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'c3d1b225-b4da-4276-b6e1-ba26abce691f' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c3d1b225-b4da-4276-b6e1-ba26abce691f', '012', '1547832101', NULL, NULL, true, '2025-06-30');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c3d1b225-b4da-4276-b6e1-ba26abce691f', (SELECT persona_id FROM erp.empleados WHERE id = 'c3d1b225-b4da-4276-b6e1-ba26abce691f'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "158"}'::jsonb);

-- UPDATE persona del empleado c0876911-8dbb-4fb9-8a76-69973c9e5ff5 (código Excel 159)
UPDATE erp.personas p SET nombre = COALESCE('HECTOR ALBERTO', p.nombre), apellido_paterno = COALESCE('IBARRA', p.apellido_paterno), apellido_materno = COALESCE('HERNANDEZ', p.apellido_materno), rfc = COALESCE('IAHH871120F81', p.rfc), curp = COALESCE('IAHH871120HCLBRC04', p.curp), nss = COALESCE('32058712194', p.nss), fecha_nacimiento = COALESCE('1987-11-20', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('BOULEVARD REPUBLICA SIN NUM LOTE 3', p.domicilio), email = COALESCE('ibarrahernandezhector819@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'c0876911-8dbb-4fb9-8a76-69973c9e5ff5';

UPDATE erp.empleados SET numero_empleado = '159', fecha_ingreso = '2025-07-02', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32058712194', fecha_nacimiento = '1987-11-20', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Maquinaria' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Operador de Maquinaria Pesada' LIMIT 1), puesto_id) WHERE id = 'c0876911-8dbb-4fb9-8a76-69973c9e5ff5';

-- Compensación vigente para empleado c0876911-8dbb-4fb9-8a76-69973c9e5ff5
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'c0876911-8dbb-4fb9-8a76-69973c9e5ff5' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c0876911-8dbb-4fb9-8a76-69973c9e5ff5', 440.87, 462.61, '01', 'Semanal', '2025-07-02', true);

-- Pago vigente para empleado c0876911-8dbb-4fb9-8a76-69973c9e5ff5
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'c0876911-8dbb-4fb9-8a76-69973c9e5ff5' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c0876911-8dbb-4fb9-8a76-69973c9e5ff5', '012', '1548108200', NULL, NULL, true, '2025-07-02');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c0876911-8dbb-4fb9-8a76-69973c9e5ff5', (SELECT persona_id FROM erp.empleados WHERE id = 'c0876911-8dbb-4fb9-8a76-69973c9e5ff5'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "159"}'::jsonb);

-- UPDATE persona del empleado c6a2b4af-23b4-4716-91c8-200aa4b71b7a (código Excel 160)
UPDATE erp.personas p SET nombre = COALESCE('NESTOR CRISTOBAL', p.nombre), apellido_paterno = COALESCE('LOPEZ', p.apellido_paterno), apellido_materno = COALESCE('MARTINEZ', p.apellido_materno), rfc = COALESCE('LOMN0008292A1', p.rfc), curp = COALESCE('LOMN000829HCLPRSA6', p.curp), nss = COALESCE('75160065340', p.nss), fecha_nacimiento = COALESCE('2000-08-29', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('ACONCAGUA 411 CUMBRES', p.domicilio), telefono = COALESCE('8781169704', p.telefono), email = COALESCE('cristoregio49@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'c6a2b4af-23b4-4716-91c8-200aa4b71b7a';

UPDATE erp.empleados SET numero_empleado = '160', fecha_ingreso = '2025-07-04', fecha_baja = '2025-07-24', motivo_baja = 'Separación voluntaria', activo = false, nss = '75160065340', fecha_nacimiento = '2000-08-29', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = 'c6a2b4af-23b4-4716-91c8-200aa4b71b7a';

-- Compensación vigente para empleado c6a2b4af-23b4-4716-91c8-200aa4b71b7a
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'c6a2b4af-23b4-4716-91c8-200aa4b71b7a' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c6a2b4af-23b4-4716-91c8-200aa4b71b7a', 419.88, 440.58641, '01', 'Semanal', '2025-07-04', true);

-- Pago vigente para empleado c6a2b4af-23b4-4716-91c8-200aa4b71b7a
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'c6a2b4af-23b4-4716-91c8-200aa4b71b7a' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c6a2b4af-23b4-4716-91c8-200aa4b71b7a', '012', '1537082753', NULL, NULL, true, '2025-07-04');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c6a2b4af-23b4-4716-91c8-200aa4b71b7a', (SELECT persona_id FROM erp.empleados WHERE id = 'c6a2b4af-23b4-4716-91c8-200aa4b71b7a'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "160"}'::jsonb);

-- UPDATE persona del empleado 2bc68ac4-3087-451e-92c8-0091a539e17c (código Excel 161)
UPDATE erp.personas p SET nombre = COALESCE('LUIS ABAD', p.nombre), apellido_paterno = COALESCE('VAZQUEZ', p.apellido_paterno), apellido_materno = COALESCE('VILLEGAS', p.apellido_materno), rfc = COALESCE('VAVL930104AC8', p.rfc), curp = COALESCE('VAVL930104HCLZLS08', p.curp), nss = COALESCE('32099302476', p.nss), fecha_nacimiento = COALESCE('1993-01-04', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('POPOCATEPETL 116 CUMBRES', p.domicilio), telefono = COALESCE('8781149366', p.telefono), email = COALESCE('av0520128@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '2bc68ac4-3087-451e-92c8-0091a539e17c';

UPDATE erp.empleados SET numero_empleado = '161', fecha_ingreso = '2025-07-07', fecha_baja = '2025-07-25', motivo_baja = 'Separación voluntaria', activo = false, nss = '32099302476', fecha_nacimiento = '1993-01-04', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Compras' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Almacenista' LIMIT 1), puesto_id) WHERE id = '2bc68ac4-3087-451e-92c8-0091a539e17c';

-- Compensación vigente para empleado 2bc68ac4-3087-451e-92c8-0091a539e17c
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '2bc68ac4-3087-451e-92c8-0091a539e17c' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '2bc68ac4-3087-451e-92c8-0091a539e17c', 419.88, 440.58641, '01', 'Semanal', '2025-07-07', true);

-- Pago vigente para empleado 2bc68ac4-3087-451e-92c8-0091a539e17c
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '2bc68ac4-3087-451e-92c8-0091a539e17c' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '2bc68ac4-3087-451e-92c8-0091a539e17c', '012', '1548345154', NULL, NULL, true, '2025-07-07');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '2bc68ac4-3087-451e-92c8-0091a539e17c', (SELECT persona_id FROM erp.empleados WHERE id = '2bc68ac4-3087-451e-92c8-0091a539e17c'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "161"}'::jsonb);

-- UPDATE persona del empleado fa121c58-e5bd-48be-ae84-dc370e67540d (código Excel 162)
UPDATE erp.personas p SET nombre = COALESCE('JORGE MANUEL', p.nombre), apellido_paterno = COALESCE('RAMIREZ', p.apellido_paterno), apellido_materno = COALESCE('ZAMBRANO', p.apellido_materno), rfc = COALESCE('RAZJ9310014D8', p.rfc), curp = COALESCE('RAZJ931001HPLMMR03', p.curp), nss = COALESCE('6199336493', p.nss), fecha_nacimiento = COALESCE('1993-10-01', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PUEBLA, PL', p.lugar_nacimiento), domicilio = COALESCE('CALLE 34 PONIENTE SN ACATZINGO PUEBLA', p.domicilio), telefono = COALESCE('2491743838', p.telefono), email = COALESCE('jorgeramirz569@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'fa121c58-e5bd-48be-ae84-dc370e67540d';

UPDATE erp.empleados SET numero_empleado = '162', fecha_ingreso = '2025-07-15', fecha_baja = '2025-07-28', motivo_baja = 'Separación voluntaria', activo = false, nss = '6199336493', fecha_nacimiento = '1993-10-01', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = 'fa121c58-e5bd-48be-ae84-dc370e67540d';

-- Compensación vigente para empleado fa121c58-e5bd-48be-ae84-dc370e67540d
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'fa121c58-e5bd-48be-ae84-dc370e67540d' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'fa121c58-e5bd-48be-ae84-dc370e67540d', 419.88, 440.58641, '01', 'Semanal', '2025-07-15', true);

-- Pago vigente para empleado fa121c58-e5bd-48be-ae84-dc370e67540d
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'fa121c58-e5bd-48be-ae84-dc370e67540d' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'fa121c58-e5bd-48be-ae84-dc370e67540d', '012', '1597720834', NULL, NULL, true, '2025-07-15');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'fa121c58-e5bd-48be-ae84-dc370e67540d', (SELECT persona_id FROM erp.empleados WHERE id = 'fa121c58-e5bd-48be-ae84-dc370e67540d'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "162"}'::jsonb);

-- UPDATE persona del empleado ec84a37f-2bd8-4da2-8fad-615996c2ccb3 (código Excel 163)
UPDATE erp.personas p SET nombre = COALESCE('JOSE CRISTHIAN', p.nombre), apellido_paterno = COALESCE('CONTRERAS', p.apellido_paterno), apellido_materno = COALESCE('ZAMBRANO', p.apellido_materno), rfc = COALESCE('COZC041130KG9', p.rfc), curp = COALESCE('COZC041130HPLNMRA7', p.curp), nss = COALESCE('49220423971', p.nss), fecha_nacimiento = COALESCE('2004-11-30', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('puebla, PL', p.lugar_nacimiento), domicilio = COALESCE('QUETZALCOATL 2210 VALLE DEL NORTE', p.domicilio), telefono = COALESCE('2491742106', p.telefono), email = COALESCE('josecristhianzambrano301@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'ec84a37f-2bd8-4da2-8fad-615996c2ccb3';

UPDATE erp.empleados SET numero_empleado = '163', fecha_ingreso = '2025-07-16', fecha_baja = '2025-07-28', motivo_baja = 'Separación voluntaria', activo = false, nss = '49220423971', fecha_nacimiento = '2004-11-30', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = 'ec84a37f-2bd8-4da2-8fad-615996c2ccb3';

-- Compensación vigente para empleado ec84a37f-2bd8-4da2-8fad-615996c2ccb3
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'ec84a37f-2bd8-4da2-8fad-615996c2ccb3' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'ec84a37f-2bd8-4da2-8fad-615996c2ccb3', 419.88, 440.58641, '01', 'Semanal', '2025-07-16', true);

-- Pago vigente para empleado ec84a37f-2bd8-4da2-8fad-615996c2ccb3
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'ec84a37f-2bd8-4da2-8fad-615996c2ccb3' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'ec84a37f-2bd8-4da2-8fad-615996c2ccb3', '012', '1500717799', NULL, NULL, true, '2025-07-16');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'ec84a37f-2bd8-4da2-8fad-615996c2ccb3', (SELECT persona_id FROM erp.empleados WHERE id = 'ec84a37f-2bd8-4da2-8fad-615996c2ccb3'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'fuzzy_nombre_fecha', '{"match_metodo": "fuzzy_nombre_fecha", "codigo": "163"}'::jsonb);

-- UPDATE persona del empleado 1b852f3b-6ff2-4696-82fd-cb5d41d646bf (código Excel 164)
UPDATE erp.personas p SET nombre = COALESCE('JOSE RODOLFO', p.nombre), apellido_paterno = COALESCE('RINCON', p.apellido_paterno), apellido_materno = COALESCE('MADRIGAL', p.apellido_materno), rfc = COALESCE('RIMR970823M94', p.rfc), curp = COALESCE('RIMR970823HCLNDD04', p.curp), nss = COALESCE('26149768470', p.nss), fecha_nacimiento = COALESCE('1997-08-23', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('LAUREANO FLORES 616 LOMAS DE LA VILLA', p.domicilio), telefono = COALESCE('87891147748', p.telefono), email = COALESCE('rinconjose23.08.97@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '1b852f3b-6ff2-4696-82fd-cb5d41d646bf';

UPDATE erp.empleados SET numero_empleado = '164', fecha_ingreso = '2025-07-18', fecha_baja = '2025-09-19', motivo_baja = 'Separación voluntaria', activo = false, nss = '26149768470', fecha_nacimiento = '1997-08-23', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento de Terreno' LIMIT 1), puesto_id) WHERE id = '1b852f3b-6ff2-4696-82fd-cb5d41d646bf';

-- Compensación vigente para empleado 1b852f3b-6ff2-4696-82fd-cb5d41d646bf
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '1b852f3b-6ff2-4696-82fd-cb5d41d646bf' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '1b852f3b-6ff2-4696-82fd-cb5d41d646bf', 419.88, 440.58641, '01', 'Semanal', '2025-07-18', true);

-- Pago vigente para empleado 1b852f3b-6ff2-4696-82fd-cb5d41d646bf
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '1b852f3b-6ff2-4696-82fd-cb5d41d646bf' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '1b852f3b-6ff2-4696-82fd-cb5d41d646bf', '012', '1526104036', NULL, NULL, true, '2025-07-18');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '1b852f3b-6ff2-4696-82fd-cb5d41d646bf', (SELECT persona_id FROM erp.empleados WHERE id = '1b852f3b-6ff2-4696-82fd-cb5d41d646bf'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "164"}'::jsonb);

-- UPDATE persona del empleado e801ef47-6b4e-4377-b34e-64e6415a6162 (código Excel 165)
UPDATE erp.personas p SET nombre = COALESCE('JOSE ROBERTO', p.nombre), apellido_paterno = COALESCE('TORRES', p.apellido_paterno), apellido_materno = COALESCE('HERNANDEZ', p.apellido_materno), rfc = COALESCE('TOHR010117NM3', p.rfc), curp = COALESCE('TOHR010117HCLRRBA5', p.curp), nss = COALESCE('68160126576', p.nss), fecha_nacimiento = COALESCE('2001-01-17', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('CALLE SIN NOMBRE SN EJIDO VILLA DE FUENTE', p.domicilio), email = COALESCE('jt481032@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'e801ef47-6b4e-4377-b34e-64e6415a6162';

UPDATE erp.empleados SET numero_empleado = '165', fecha_ingreso = '2025-07-23', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '68160126576', fecha_nacimiento = '2001-01-17', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = 'e801ef47-6b4e-4377-b34e-64e6415a6162';

-- Compensación vigente para empleado e801ef47-6b4e-4377-b34e-64e6415a6162
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'e801ef47-6b4e-4377-b34e-64e6415a6162' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'e801ef47-6b4e-4377-b34e-64e6415a6162', 440.87, 462.61, '01', 'Semanal', '2025-07-23', true);

-- Pago vigente para empleado e801ef47-6b4e-4377-b34e-64e6415a6162
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'e801ef47-6b4e-4377-b34e-64e6415a6162' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'e801ef47-6b4e-4377-b34e-64e6415a6162', '012', '1519743857', NULL, NULL, true, '2025-07-23');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'e801ef47-6b4e-4377-b34e-64e6415a6162', (SELECT persona_id FROM erp.empleados WHERE id = 'e801ef47-6b4e-4377-b34e-64e6415a6162'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "165"}'::jsonb);

-- UPDATE persona del empleado 9d822886-521c-41fd-86bb-d7f64b16815b (código Excel 166)
UPDATE erp.personas p SET nombre = COALESCE('ELISEO', p.nombre), apellido_paterno = COALESCE('FERNANDEZ', p.apellido_paterno), apellido_materno = COALESCE('GUAJARDO', p.apellido_materno), rfc = COALESCE('FEGE9508028V2', p.rfc), curp = COALESCE('FEGE950802HCLRJL04', p.curp), nss = COALESCE('68169517437', p.nss), fecha_nacimiento = COALESCE('1995-08-02', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('BAHIA DEL SOL 305 LAS PALMAS II', p.domicilio), telefono = COALESCE('8781552817', p.telefono), email = COALESCE('eliseo.95@hotmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '9d822886-521c-41fd-86bb-d7f64b16815b';

UPDATE erp.empleados SET numero_empleado = '166', fecha_ingreso = '2025-07-23', fecha_baja = '2025-10-25', motivo_baja = 'Separación voluntaria', activo = false, nss = '68169517437', fecha_nacimiento = '1995-08-02', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = '9d822886-521c-41fd-86bb-d7f64b16815b';

-- Compensación vigente para empleado 9d822886-521c-41fd-86bb-d7f64b16815b
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '9d822886-521c-41fd-86bb-d7f64b16815b' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '9d822886-521c-41fd-86bb-d7f64b16815b', 419.88, 440.58641, '01', 'Semanal', '2025-07-23', true);

-- Pago vigente para empleado 9d822886-521c-41fd-86bb-d7f64b16815b
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '9d822886-521c-41fd-86bb-d7f64b16815b' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '9d822886-521c-41fd-86bb-d7f64b16815b', '012', '1560829366', NULL, NULL, true, '2025-07-23');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '9d822886-521c-41fd-86bb-d7f64b16815b', (SELECT persona_id FROM erp.empleados WHERE id = '9d822886-521c-41fd-86bb-d7f64b16815b'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "166"}'::jsonb);

-- UPDATE persona del empleado ed8f39fb-3860-4cdb-b3c9-52fd09a1c6e5 (código Excel 168)
UPDATE erp.personas p SET nombre = COALESCE('EDUARDO', p.nombre), apellido_paterno = COALESCE('RAMON', p.apellido_paterno), apellido_materno = COALESCE('MORALES', p.apellido_materno), rfc = COALESCE('RAME960518CP5', p.rfc), curp = COALESCE('RAME960518HCLMRD06', p.curp), nss = COALESCE('03149629440', p.nss), fecha_nacimiento = COALESCE('1996-05-18', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('PINOS 211 LAS PALMAS 1', p.domicilio), telefono = COALESCE('8781360626', p.telefono), email = COALESCE('edduardo18@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'ed8f39fb-3860-4cdb-b3c9-52fd09a1c6e5';

UPDATE erp.empleados SET numero_empleado = '168', fecha_ingreso = '2025-07-25', fecha_baja = '2025-10-31', motivo_baja = 'Separación voluntaria', activo = false, nss = '03149629440', fecha_nacimiento = '1996-05-18', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = 'ed8f39fb-3860-4cdb-b3c9-52fd09a1c6e5';

-- Compensación vigente para empleado ed8f39fb-3860-4cdb-b3c9-52fd09a1c6e5
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'ed8f39fb-3860-4cdb-b3c9-52fd09a1c6e5' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'ed8f39fb-3860-4cdb-b3c9-52fd09a1c6e5', 419.88, 440.58641, '01', 'Semanal', '2025-07-25', true);

-- Pago vigente para empleado ed8f39fb-3860-4cdb-b3c9-52fd09a1c6e5
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'ed8f39fb-3860-4cdb-b3c9-52fd09a1c6e5' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'ed8f39fb-3860-4cdb-b3c9-52fd09a1c6e5', '012', '1515929727', NULL, NULL, true, '2025-07-25');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'ed8f39fb-3860-4cdb-b3c9-52fd09a1c6e5', (SELECT persona_id FROM erp.empleados WHERE id = 'ed8f39fb-3860-4cdb-b3c9-52fd09a1c6e5'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "168"}'::jsonb);

-- UPDATE persona del empleado 77cc4a2c-796f-4de5-b629-0f63ac94c105 (código Excel 170)
UPDATE erp.personas p SET nombre = COALESCE('LUIS BERNARDO', p.nombre), apellido_paterno = COALESCE('ALVAREZ', p.apellido_paterno), apellido_materno = COALESCE('TORRES', p.apellido_materno), rfc = COALESCE('AATL750416B27', p.rfc), curp = COALESCE('AATL750416HSPLRS05', p.curp), nss = COALESCE('09087503547', p.nss), fecha_nacimiento = COALESCE('1975-04-16', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('SAN LUIS POTOSI, SP', p.lugar_nacimiento), domicilio = COALESCE('CALLE SIERRA FRIA 83 LAURO VILLAR', p.domicilio), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '77cc4a2c-796f-4de5-b629-0f63ac94c105';

UPDATE erp.empleados SET numero_empleado = '170', fecha_ingreso = '2025-08-01', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '09087503547', fecha_nacimiento = '1975-04-16', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Construcción' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = '77cc4a2c-796f-4de5-b629-0f63ac94c105';

-- Compensación vigente para empleado 77cc4a2c-796f-4de5-b629-0f63ac94c105
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '77cc4a2c-796f-4de5-b629-0f63ac94c105' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '77cc4a2c-796f-4de5-b629-0f63ac94c105', 440.87, 462.61, '01', 'Semanal', '2025-08-01', true);

-- Pago vigente para empleado 77cc4a2c-796f-4de5-b629-0f63ac94c105
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '77cc4a2c-796f-4de5-b629-0f63ac94c105' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '77cc4a2c-796f-4de5-b629-0f63ac94c105', '012', '1550532161', NULL, NULL, true, '2025-08-01');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '77cc4a2c-796f-4de5-b629-0f63ac94c105', (SELECT persona_id FROM erp.empleados WHERE id = '77cc4a2c-796f-4de5-b629-0f63ac94c105'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "170"}'::jsonb);

-- UPDATE persona del empleado 7bbd3566-38f7-4c77-a428-1f5dc41e0db9 (código Excel 171)
UPDATE erp.personas p SET nombre = COALESCE('JESUS MARTIN', p.nombre), apellido_paterno = COALESCE('MARTINEZ', p.apellido_paterno), apellido_materno = COALESCE('DAVILA', p.apellido_materno), rfc = COALESCE('MADJ931204RB5', p.rfc), curp = COALESCE('MADJ931204HCLRVS05', p.curp), nss = COALESCE('32109308299', p.nss), fecha_nacimiento = COALESCE('1993-12-04', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('MEXICO 1405 PARQUE INDUSTRIAL AMISTAD', p.domicilio), telefono = COALESCE('8663926479', p.telefono), email = COALESCE('martinezdavila61@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '7bbd3566-38f7-4c77-a428-1f5dc41e0db9';

UPDATE erp.empleados SET numero_empleado = '171', fecha_ingreso = '2025-08-05', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32109308299', fecha_nacimiento = '1993-12-04', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Maquinaria' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Operador de Maquinaria Pesada' LIMIT 1), puesto_id) WHERE id = '7bbd3566-38f7-4c77-a428-1f5dc41e0db9';

-- Compensación vigente para empleado 7bbd3566-38f7-4c77-a428-1f5dc41e0db9
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '7bbd3566-38f7-4c77-a428-1f5dc41e0db9' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '7bbd3566-38f7-4c77-a428-1f5dc41e0db9', 440.87, 462.61, '01', 'Semanal', '2025-08-05', true);

-- Pago vigente para empleado 7bbd3566-38f7-4c77-a428-1f5dc41e0db9
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '7bbd3566-38f7-4c77-a428-1f5dc41e0db9' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '7bbd3566-38f7-4c77-a428-1f5dc41e0db9', '012', '1550894612', NULL, NULL, true, '2025-08-05');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '7bbd3566-38f7-4c77-a428-1f5dc41e0db9', (SELECT persona_id FROM erp.empleados WHERE id = '7bbd3566-38f7-4c77-a428-1f5dc41e0db9'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "171"}'::jsonb);

-- UPDATE persona del empleado b7890e0b-0f63-4c34-af4f-23da33986530 (código Excel 172)
UPDATE erp.personas p SET nombre = COALESCE('IVAN', p.nombre), apellido_paterno = COALESCE('ALDABA', p.apellido_paterno), apellido_materno = COALESCE('ORTIZ', p.apellido_materno), rfc = COALESCE('AAOI981207SKA', p.rfc), curp = COALESCE('AAOI981207HCLLRV04', p.curp), nss = COALESCE('27169864538', p.nss), fecha_nacimiento = COALESCE('1998-12-07', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('BOCANEGRA 221 VENUSTIANO CARRANZA', p.domicilio), telefono = COALESCE('8787854620', p.telefono), email = COALESCE('aldabaivan29@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'b7890e0b-0f63-4c34-af4f-23da33986530';

UPDATE erp.empleados SET numero_empleado = '172', fecha_ingreso = '2025-08-23', fecha_baja = '2025-12-01', motivo_baja = 'Separación voluntaria', activo = false, nss = '27169864538', fecha_nacimiento = '1998-12-07', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = 'b7890e0b-0f63-4c34-af4f-23da33986530';

-- Compensación vigente para empleado b7890e0b-0f63-4c34-af4f-23da33986530
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'b7890e0b-0f63-4c34-af4f-23da33986530' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'b7890e0b-0f63-4c34-af4f-23da33986530', 419.88, 440.58641, '01', 'Semanal', '2025-08-23', true);

-- Pago vigente para empleado b7890e0b-0f63-4c34-af4f-23da33986530
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'b7890e0b-0f63-4c34-af4f-23da33986530' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'b7890e0b-0f63-4c34-af4f-23da33986530', '012', '1573636867', NULL, NULL, true, '2025-08-23');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'b7890e0b-0f63-4c34-af4f-23da33986530', (SELECT persona_id FROM erp.empleados WHERE id = 'b7890e0b-0f63-4c34-af4f-23da33986530'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "172"}'::jsonb);

-- UPDATE persona del empleado 20ebdee6-8247-4106-bb10-4685d521dac5 (código Excel 173)
UPDATE erp.personas p SET nombre = COALESCE('ROLANDO ALEXIS', p.nombre), apellido_paterno = COALESCE('RODRIGUEZ', p.apellido_paterno), apellido_materno = COALESCE('CHAVARRIA', p.apellido_materno), rfc = COALESCE('ROCR951201MZ6', p.rfc), curp = COALESCE('ROCR951201HCLDHL03', p.curp), nss = COALESCE('32129537547', p.nss), fecha_nacimiento = COALESCE('1995-12-01', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('LIB CARLOS SALINAS DE GORTARI 198 PARQUE INDUSTRIAL AEROPUER', p.domicilio), telefono = COALESCE('8787009793', p.telefono), email = COALESCE('alexis19952501@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '20ebdee6-8247-4106-bb10-4685d521dac5';

UPDATE erp.empleados SET numero_empleado = '173', fecha_ingreso = '2025-08-25', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32129537547', fecha_nacimiento = '1995-12-01', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = '20ebdee6-8247-4106-bb10-4685d521dac5';

-- Compensación vigente para empleado 20ebdee6-8247-4106-bb10-4685d521dac5
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '20ebdee6-8247-4106-bb10-4685d521dac5' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '20ebdee6-8247-4106-bb10-4685d521dac5', 440.87, 462.61, '01', 'Semanal', '2025-08-25', true);

-- Pago vigente para empleado 20ebdee6-8247-4106-bb10-4685d521dac5
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '20ebdee6-8247-4106-bb10-4685d521dac5' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '20ebdee6-8247-4106-bb10-4685d521dac5', '012', '1506714466', NULL, NULL, true, '2025-08-25');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '20ebdee6-8247-4106-bb10-4685d521dac5', (SELECT persona_id FROM erp.empleados WHERE id = '20ebdee6-8247-4106-bb10-4685d521dac5'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'fuzzy_nombre_fecha', '{"match_metodo": "fuzzy_nombre_fecha", "codigo": "173"}'::jsonb);

-- UPDATE persona del empleado 844d9262-2194-4156-89e1-0694d3578504 (código Excel 174)
UPDATE erp.personas p SET nombre = COALESCE('BERNARDINO HERVEY', p.nombre), apellido_paterno = COALESCE('PALACIOS', p.apellido_paterno), apellido_materno = COALESCE('HERNANDEZ', p.apellido_materno), rfc = COALESCE('PAHB920108U23', p.rfc), curp = COALESCE('PAHB920108HCLLRR03', p.curp), nss = COALESCE('32109225147', p.nss), fecha_nacimiento = COALESCE('1992-01-08', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('NEXTENGO 78 SANTA CRUZ ACAYUCAN AZCAPOTZALCO', p.domicilio), telefono = COALESCE('8781395670', p.telefono), email = COALESCE('hervey.palacios@icloud.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '844d9262-2194-4156-89e1-0694d3578504';

UPDATE erp.empleados SET numero_empleado = '174', fecha_ingreso = '2025-09-02', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32109225147', fecha_nacimiento = '1992-01-08', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Maquinaria' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Operador de Torton' LIMIT 1), puesto_id) WHERE id = '844d9262-2194-4156-89e1-0694d3578504';

-- Compensación vigente para empleado 844d9262-2194-4156-89e1-0694d3578504
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '844d9262-2194-4156-89e1-0694d3578504' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '844d9262-2194-4156-89e1-0694d3578504', 440.87, 462.61, '01', 'Semanal', '2025-09-02', true);

-- Pago vigente para empleado 844d9262-2194-4156-89e1-0694d3578504
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '844d9262-2194-4156-89e1-0694d3578504' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '844d9262-2194-4156-89e1-0694d3578504', '012', '1560620249', NULL, NULL, true, '2025-09-02');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '844d9262-2194-4156-89e1-0694d3578504', (SELECT persona_id FROM erp.empleados WHERE id = '844d9262-2194-4156-89e1-0694d3578504'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "174"}'::jsonb);

-- UPDATE persona del empleado 16713a1d-d697-4099-844c-b1ed677941fa (código Excel 176)
UPDATE erp.personas p SET nombre = COALESCE('LUIS ANTONIO', p.nombre), apellido_paterno = COALESCE('GARANZUAY', p.apellido_paterno), apellido_materno = COALESCE('CONTRERAS', p.apellido_materno), rfc = COALESCE('GACL7501176V8', p.rfc), curp = COALESCE('GACL750117HCLRNS03', p.curp), nss = COALESCE('32917526553', p.nss), fecha_nacimiento = COALESCE('1975-01-17', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('PODER JUDICIAL 1005 BUROCRATA', p.domicilio), telefono = COALESCE('8781084063', p.telefono), email = COALESCE('luisgaranzuay75@hmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '16713a1d-d697-4099-844c-b1ed677941fa';

UPDATE erp.empleados SET numero_empleado = '176', fecha_ingreso = '2025-09-26', fecha_baja = '2025-12-05', motivo_baja = 'Separación voluntaria', activo = false, nss = '32917526553', fecha_nacimiento = '1975-01-17', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Compras' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Almacenista' LIMIT 1), puesto_id) WHERE id = '16713a1d-d697-4099-844c-b1ed677941fa';

-- Compensación vigente para empleado 16713a1d-d697-4099-844c-b1ed677941fa
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '16713a1d-d697-4099-844c-b1ed677941fa' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '16713a1d-d697-4099-844c-b1ed677941fa', 419.88, 440.58641, '01', 'Semanal', '2025-09-26', true);

-- Pago vigente para empleado 16713a1d-d697-4099-844c-b1ed677941fa
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '16713a1d-d697-4099-844c-b1ed677941fa' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '16713a1d-d697-4099-844c-b1ed677941fa', '012', '1555767361', NULL, NULL, true, '2025-09-26');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '16713a1d-d697-4099-844c-b1ed677941fa', (SELECT persona_id FROM erp.empleados WHERE id = '16713a1d-d697-4099-844c-b1ed677941fa'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "176"}'::jsonb);

-- UPDATE persona del empleado a6687e51-9d67-4bb9-9a7b-5cadb02770c5 (código Excel 177)
UPDATE erp.personas p SET nombre = COALESCE('ALEXIS', p.nombre), apellido_paterno = COALESCE('CASTELLANOS', p.apellido_paterno), apellido_materno = COALESCE('SARABIA', p.apellido_materno), rfc = COALESCE('CASA930915FU4', p.rfc), curp = COALESCE('CASA930915HCLSRL05', p.curp), nss = COALESCE('32139335122', p.nss), fecha_nacimiento = COALESCE('1993-09-15', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('GUATEMALA 100 GUADALUPE MONCLOVA', p.domicilio), telefono = COALESCE('8781372391', p.telefono), email = COALESCE('castellanossarabia@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'a6687e51-9d67-4bb9-9a7b-5cadb02770c5';

UPDATE erp.empleados SET numero_empleado = '177', fecha_ingreso = '2025-09-26', fecha_baja = '2025-10-25', motivo_baja = 'Separación voluntaria', activo = false, nss = '32139335122', fecha_nacimiento = '1993-09-15', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = 'a6687e51-9d67-4bb9-9a7b-5cadb02770c5';

-- Compensación vigente para empleado a6687e51-9d67-4bb9-9a7b-5cadb02770c5
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'a6687e51-9d67-4bb9-9a7b-5cadb02770c5' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'a6687e51-9d67-4bb9-9a7b-5cadb02770c5', 419.88, 440.58641, '01', 'Semanal', '2025-09-26', true);

-- Pago vigente para empleado a6687e51-9d67-4bb9-9a7b-5cadb02770c5
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'a6687e51-9d67-4bb9-9a7b-5cadb02770c5' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'a6687e51-9d67-4bb9-9a7b-5cadb02770c5', '012', '1591836572', NULL, NULL, true, '2025-09-26');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'a6687e51-9d67-4bb9-9a7b-5cadb02770c5', (SELECT persona_id FROM erp.empleados WHERE id = 'a6687e51-9d67-4bb9-9a7b-5cadb02770c5'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "177"}'::jsonb);

-- UPDATE persona del empleado 94423929-1e79-40a1-bad9-53b208ea7798 (código Excel 178)
UPDATE erp.personas p SET nombre = COALESCE('GUMARO', p.nombre), apellido_paterno = COALESCE('CASTAÑEDA', p.apellido_paterno), apellido_materno = COALESCE('RUIZ', p.apellido_materno), rfc = COALESCE('CARG951027GWA', p.rfc), curp = COALESCE('CARG951027HCLSZM09', p.curp), nss = COALESCE('32139597713', p.nss), fecha_nacimiento = COALESCE('1995-10-27', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('CARPES 830 AÑO 2000', p.domicilio), telefono = COALESCE('8781573607', p.telefono), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '94423929-1e79-40a1-bad9-53b208ea7798';

UPDATE erp.empleados SET numero_empleado = '178', fecha_ingreso = '2025-10-03', fecha_baja = '2026-01-05', motivo_baja = 'Separación voluntaria', activo = false, nss = '32139597713', fecha_nacimiento = '1995-10-27', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = '94423929-1e79-40a1-bad9-53b208ea7798';

-- Compensación vigente para empleado 94423929-1e79-40a1-bad9-53b208ea7798
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '94423929-1e79-40a1-bad9-53b208ea7798' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '94423929-1e79-40a1-bad9-53b208ea7798', 440.87, 462.61, '01', 'Semanal', '2025-10-03', true);

-- Pago vigente para empleado 94423929-1e79-40a1-bad9-53b208ea7798
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '94423929-1e79-40a1-bad9-53b208ea7798' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '94423929-1e79-40a1-bad9-53b208ea7798', '012', '1555911337', NULL, NULL, true, '2025-10-03');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '94423929-1e79-40a1-bad9-53b208ea7798', (SELECT persona_id FROM erp.empleados WHERE id = '94423929-1e79-40a1-bad9-53b208ea7798'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "178"}'::jsonb);

-- UPDATE persona del empleado 949a08c7-f0d1-4225-95b7-56a1be7f12ff (código Excel 179)
UPDATE erp.personas p SET nombre = COALESCE('MARIO JOSUE', p.nombre), apellido_paterno = COALESCE('ARZOLA', p.apellido_paterno), apellido_materno = COALESCE('SAENZ', p.apellido_materno), rfc = COALESCE('AOSM8705268DA', p.rfc), curp = COALESCE('AOSM870526HDGRNR00', p.curp), nss = COALESCE('09088734828', p.nss), fecha_nacimiento = COALESCE('1987-05-26', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('DURANGO, DG', p.lugar_nacimiento), domicilio = COALESCE('VICENTE SUAREZ 200 LAZARO CARDENAS', p.domicilio), telefono = COALESCE('8781487440', p.telefono), email = COALESCE('arzolaj874@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '949a08c7-f0d1-4225-95b7-56a1be7f12ff';

UPDATE erp.empleados SET numero_empleado = '179', fecha_ingreso = '2025-10-04', fecha_baja = '2026-01-05', motivo_baja = 'Separación voluntaria', activo = false, nss = '09088734828', fecha_nacimiento = '1987-05-26', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = '949a08c7-f0d1-4225-95b7-56a1be7f12ff';

-- Compensación vigente para empleado 949a08c7-f0d1-4225-95b7-56a1be7f12ff
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '949a08c7-f0d1-4225-95b7-56a1be7f12ff' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '949a08c7-f0d1-4225-95b7-56a1be7f12ff', 440.87, 462.61, '01', 'Semanal', '2025-10-04', true);

-- Pago vigente para empleado 949a08c7-f0d1-4225-95b7-56a1be7f12ff
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '949a08c7-f0d1-4225-95b7-56a1be7f12ff' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '949a08c7-f0d1-4225-95b7-56a1be7f12ff', '012', '1556002306', NULL, NULL, true, '2025-10-04');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '949a08c7-f0d1-4225-95b7-56a1be7f12ff', (SELECT persona_id FROM erp.empleados WHERE id = '949a08c7-f0d1-4225-95b7-56a1be7f12ff'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "179"}'::jsonb);

-- UPDATE persona del empleado 5675c778-a781-4742-974c-23e809d76d28 (código Excel 180)
UPDATE erp.personas p SET nombre = COALESCE('OLIVER', p.nombre), apellido_paterno = COALESCE('MARTINEZ', p.apellido_paterno), apellido_materno = COALESCE('GONZALEZ', p.apellido_materno), rfc = COALESCE('MAGO980920EB6', p.rfc), curp = COALESCE('MAGO980920HCLRNL03', p.curp), nss = COALESCE('02169817265', p.nss), fecha_nacimiento = COALESCE('1998-09-20', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('ALMEZ 910 AMPLIACION AÑO 2000', p.domicilio), telefono = COALESCE('87824904089', p.telefono), email = COALESCE('olivermtz98@hotmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '5675c778-a781-4742-974c-23e809d76d28';

UPDATE erp.empleados SET numero_empleado = '180', fecha_ingreso = '2025-10-10', fecha_baja = '2026-01-05', motivo_baja = 'Separación voluntaria', activo = false, nss = '02169817265', fecha_nacimiento = '1998-09-20', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = '5675c778-a781-4742-974c-23e809d76d28';

-- Compensación vigente para empleado 5675c778-a781-4742-974c-23e809d76d28
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '5675c778-a781-4742-974c-23e809d76d28' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '5675c778-a781-4742-974c-23e809d76d28', 440.87, 462.61, '01', 'Semanal', '2025-10-10', true);

-- Pago vigente para empleado 5675c778-a781-4742-974c-23e809d76d28
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '5675c778-a781-4742-974c-23e809d76d28' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '5675c778-a781-4742-974c-23e809d76d28', '012', '1502949608', NULL, NULL, true, '2025-10-10');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '5675c778-a781-4742-974c-23e809d76d28', (SELECT persona_id FROM erp.empleados WHERE id = '5675c778-a781-4742-974c-23e809d76d28'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "180"}'::jsonb);

-- UPDATE persona del empleado 4e90358c-30bc-494e-b142-0f532e530a68 (código Excel 181)
UPDATE erp.personas p SET nombre = COALESCE('JOSE LUIS', p.nombre), apellido_paterno = COALESCE('CABALLERO', p.apellido_paterno), apellido_materno = COALESCE('CHINCHILLA', p.apellido_materno), rfc = COALESCE('CACL971112AJ9', p.rfc), curp = COALESCE('CACL971112HNEBHS08', p.curp), nss = COALESCE('03239728078', p.nss), fecha_nacimiento = COALESCE('1997-11-12', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('HONDUREÑO, NE', p.lugar_nacimiento), domicilio = COALESCE('SANTO TOMAS NORTE 220 JUAREZ', p.domicilio), telefono = COALESCE('8781336760', p.telefono), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '4e90358c-30bc-494e-b142-0f532e530a68';

UPDATE erp.empleados SET numero_empleado = '181', fecha_ingreso = '2025-10-18', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '03239728078', fecha_nacimiento = '1997-11-12', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = '4e90358c-30bc-494e-b142-0f532e530a68';

-- Compensación vigente para empleado 4e90358c-30bc-494e-b142-0f532e530a68
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '4e90358c-30bc-494e-b142-0f532e530a68' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '4e90358c-30bc-494e-b142-0f532e530a68', 440.87, 462.61, '01', 'Semanal', '2025-10-18', true);

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '4e90358c-30bc-494e-b142-0f532e530a68', (SELECT persona_id FROM erp.empleados WHERE id = '4e90358c-30bc-494e-b142-0f532e530a68'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "181"}'::jsonb);

-- UPDATE persona del empleado c1f73f66-e6bb-4e4e-8bda-3357ce4ce4d9 (código Excel 182)
UPDATE erp.personas p SET nombre = COALESCE('NORBERTO', p.nombre), apellido_paterno = COALESCE('GUTIERREZ', p.apellido_paterno), apellido_materno = COALESCE('INFANTE', p.apellido_materno), rfc = COALESCE('GUIN980718M51', p.rfc), curp = COALESCE('GUIN980718HCLTNR01', p.curp), nss = COALESCE('88169834459', p.nss), fecha_nacimiento = COALESCE('1998-07-18', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('PROL BRAVO 107 VILLA DE FUENTE', p.domicilio), telefono = COALESCE('8781140230', p.telefono), email = COALESCE('norberto_gtz1998@hotmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'c1f73f66-e6bb-4e4e-8bda-3357ce4ce4d9';

UPDATE erp.empleados SET numero_empleado = '182', fecha_ingreso = '2025-10-23', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '88169834459', fecha_nacimiento = '1998-07-18', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Administración' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Gerente Administrativo' LIMIT 1), puesto_id) WHERE id = 'c1f73f66-e6bb-4e4e-8bda-3357ce4ce4d9';

-- Compensación vigente para empleado c1f73f66-e6bb-4e4e-8bda-3357ce4ce4d9
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'c1f73f66-e6bb-4e4e-8bda-3357ce4ce4d9' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c1f73f66-e6bb-4e4e-8bda-3357ce4ce4d9', 774.67, 812.872904, '01', 'Semanal', '2025-10-23', true);

-- Pago vigente para empleado c1f73f66-e6bb-4e4e-8bda-3357ce4ce4d9
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'c1f73f66-e6bb-4e4e-8bda-3357ce4ce4d9' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c1f73f66-e6bb-4e4e-8bda-3357ce4ce4d9', '012', '1553427646', NULL, NULL, true, '2025-10-23');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c1f73f66-e6bb-4e4e-8bda-3357ce4ce4d9', (SELECT persona_id FROM erp.empleados WHERE id = 'c1f73f66-e6bb-4e4e-8bda-3357ce4ce4d9'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "182"}'::jsonb);

-- UPDATE persona del empleado 47722707-02d6-4c04-9334-91372486f068 (código Excel 183)
UPDATE erp.personas p SET nombre = COALESCE('IVAN ORLANDO', p.nombre), apellido_paterno = COALESCE('OCURA', p.apellido_paterno), apellido_materno = COALESCE('MARQUEZ', p.apellido_materno), rfc = COALESCE('OUMI950418UK7', p.rfc), curp = COALESCE('OUMI950418HCLCRV00', p.curp), nss = COALESCE('32139587870', p.nss), fecha_nacimiento = COALESCE('1995-04-18', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('IGNACIO TORRES 408 TIRO UNO Y MEDIO', p.domicilio), telefono = COALESCE('8781118482', p.telefono), email = COALESCE('ocuraorlando@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '47722707-02d6-4c04-9334-91372486f068';

UPDATE erp.empleados SET numero_empleado = '183', fecha_ingreso = '2025-10-31', fecha_baja = '2026-02-11', motivo_baja = 'Separación voluntaria', activo = false, nss = '32139587870', fecha_nacimiento = '1995-04-18', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Evap' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = '47722707-02d6-4c04-9334-91372486f068';

-- Compensación vigente para empleado 47722707-02d6-4c04-9334-91372486f068
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '47722707-02d6-4c04-9334-91372486f068' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '47722707-02d6-4c04-9334-91372486f068', 440.87, 462.61, '01', 'Semanal', '2025-10-31', true);

-- Pago vigente para empleado 47722707-02d6-4c04-9334-91372486f068
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '47722707-02d6-4c04-9334-91372486f068' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '47722707-02d6-4c04-9334-91372486f068', '012', '1573792994', NULL, NULL, true, '2025-10-31');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '47722707-02d6-4c04-9334-91372486f068', (SELECT persona_id FROM erp.empleados WHERE id = '47722707-02d6-4c04-9334-91372486f068'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "183"}'::jsonb);

-- UPDATE persona del empleado 84c02d72-43c1-465d-9ea5-723aafcd18d5 (código Excel 187)
UPDATE erp.personas p SET nombre = COALESCE('MANASES', p.nombre), apellido_paterno = COALESCE('ALFARO', p.apellido_paterno), apellido_materno = COALESCE('CARRIZALEZ', p.apellido_materno), rfc = COALESCE('AACM0211247R3', p.rfc), curp = COALESCE('AACM021124HCLLRNA1', p.curp), nss = COALESCE('35180297398', p.nss), fecha_nacimiento = COALESCE('2002-11-24', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('ABASOLO 104 EJIDO VILLA DE FUENTE', p.domicilio), telefono = COALESCE('8783196109', p.telefono), email = COALESCE('alfaromanases5@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '84c02d72-43c1-465d-9ea5-723aafcd18d5';

UPDATE erp.empleados SET numero_empleado = '187', fecha_ingreso = '2025-12-05', fecha_baja = '2026-04-24', motivo_baja = 'Separación voluntaria', activo = false, nss = '35180297398', fecha_nacimiento = '2002-11-24', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = '84c02d72-43c1-465d-9ea5-723aafcd18d5';

-- Compensación vigente para empleado 84c02d72-43c1-465d-9ea5-723aafcd18d5
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '84c02d72-43c1-465d-9ea5-723aafcd18d5' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '84c02d72-43c1-465d-9ea5-723aafcd18d5', 440.87, 462.61, '01', 'Semanal', '2025-12-05', true);

-- Pago vigente para empleado 84c02d72-43c1-465d-9ea5-723aafcd18d5
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '84c02d72-43c1-465d-9ea5-723aafcd18d5' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '84c02d72-43c1-465d-9ea5-723aafcd18d5', '012', '1506632817', NULL, NULL, true, '2025-12-05');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '84c02d72-43c1-465d-9ea5-723aafcd18d5', (SELECT persona_id FROM erp.empleados WHERE id = '84c02d72-43c1-465d-9ea5-723aafcd18d5'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "187"}'::jsonb);

-- UPDATE persona del empleado 884d6bf8-13e2-445d-bda1-c6b7a1d0cfa8 (código Excel 188)
UPDATE erp.personas p SET nombre = COALESCE('JOSE MANUEL', p.nombre), apellido_paterno = COALESCE('CALDERON', p.apellido_paterno), apellido_materno = COALESCE('ESTRADA', p.apellido_materno), rfc = COALESCE('CAEM971213P36', p.rfc), curp = COALESCE('CAEM971213HCLLSN06', p.curp), nss = COALESCE('19159711100', p.nss), fecha_nacimiento = COALESCE('1997-12-13', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS COAHUILA, CL', p.lugar_nacimiento), domicilio = COALESCE('PUERTO ARTURO 703 BRAVO', p.domicilio), telefono = COALESCE('8781573773', p.telefono), email = COALESCE('josemcaestrada97@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '884d6bf8-13e2-445d-bda1-c6b7a1d0cfa8';

UPDATE erp.empleados SET numero_empleado = '188', fecha_ingreso = '2025-12-05', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '19159711100', fecha_nacimiento = '1997-12-13', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Evap' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = '884d6bf8-13e2-445d-bda1-c6b7a1d0cfa8';

-- Compensación vigente para empleado 884d6bf8-13e2-445d-bda1-c6b7a1d0cfa8
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '884d6bf8-13e2-445d-bda1-c6b7a1d0cfa8' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '884d6bf8-13e2-445d-bda1-c6b7a1d0cfa8', 440.87, 462.61, '01', 'Semanal', '2025-12-05', true);

-- Pago vigente para empleado 884d6bf8-13e2-445d-bda1-c6b7a1d0cfa8
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '884d6bf8-13e2-445d-bda1-c6b7a1d0cfa8' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '884d6bf8-13e2-445d-bda1-c6b7a1d0cfa8', '012', '1502312608', NULL, NULL, true, '2025-12-05');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '884d6bf8-13e2-445d-bda1-c6b7a1d0cfa8', (SELECT persona_id FROM erp.empleados WHERE id = '884d6bf8-13e2-445d-bda1-c6b7a1d0cfa8'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "188"}'::jsonb);

-- UPDATE persona del empleado 0f470262-8643-4886-a3f7-9a44779c7aba (código Excel 190)
UPDATE erp.personas p SET nombre = COALESCE('LUIS FERNANDO', p.nombre), apellido_paterno = COALESCE('MARTINEZ', p.apellido_paterno), apellido_materno = COALESCE('LOPEZ', p.apellido_materno), rfc = COALESCE('MALL010528H95', p.rfc), curp = COALESCE('MALL010528HCLRPSA6', p.curp), nss = COALESCE('88160150269', p.nss), fecha_nacimiento = COALESCE('2001-05-28', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('PARAISO 17 BOSQUES DE RIO ESCONDIDO', p.domicilio), telefono = COALESCE('8781592733', p.telefono), email = COALESCE('luismtz0101@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '0f470262-8643-4886-a3f7-9a44779c7aba';

UPDATE erp.empleados SET numero_empleado = '190', fecha_ingreso = '2026-01-07', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '88160150269', fecha_nacimiento = '2001-05-28', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Compras' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Almacenista' LIMIT 1), puesto_id) WHERE id = '0f470262-8643-4886-a3f7-9a44779c7aba';

-- Compensación vigente para empleado 0f470262-8643-4886-a3f7-9a44779c7aba
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '0f470262-8643-4886-a3f7-9a44779c7aba' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '0f470262-8643-4886-a3f7-9a44779c7aba', 440.87, 462.611534, '01', 'Semanal', '2026-01-07', true);

-- Pago vigente para empleado 0f470262-8643-4886-a3f7-9a44779c7aba
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '0f470262-8643-4886-a3f7-9a44779c7aba' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '0f470262-8643-4886-a3f7-9a44779c7aba', '012', '1562421889', NULL, NULL, true, '2026-01-07');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '0f470262-8643-4886-a3f7-9a44779c7aba', (SELECT persona_id FROM erp.empleados WHERE id = '0f470262-8643-4886-a3f7-9a44779c7aba'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "190"}'::jsonb);

-- UPDATE persona del empleado 703c886a-c051-4976-a405-55f255ddeb0b (código Excel 191)
UPDATE erp.personas p SET nombre = COALESCE('TOMAS', p.nombre), apellido_paterno = COALESCE('IGLESIAS', p.apellido_paterno), apellido_materno = COALESCE('DE LOS SANTOS', p.apellido_materno), rfc = COALESCE('IEST871031MF5', p.rfc), curp = COALESCE('IEST871031HVZGNM06', p.curp), nss = COALESCE('02178767535', p.nss), fecha_nacimiento = COALESCE('1987-10-31', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('VERACRUZ, VZ', p.lugar_nacimiento), domicilio = COALESCE('TARAY 1125 ACOTOS 1', p.domicilio), telefono = COALESCE('8781387246', p.telefono), email = COALESCE('tsantos_85@hotmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '703c886a-c051-4976-a405-55f255ddeb0b';

UPDATE erp.empleados SET numero_empleado = '191', fecha_ingreso = '2026-01-09', fecha_baja = '2026-02-14', motivo_baja = 'Separación voluntaria', activo = false, nss = '02178767535', fecha_nacimiento = '1987-10-31', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Supervisor de Urbanización' LIMIT 1), puesto_id) WHERE id = '703c886a-c051-4976-a405-55f255ddeb0b';

-- Compensación vigente para empleado 703c886a-c051-4976-a405-55f255ddeb0b
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '703c886a-c051-4976-a405-55f255ddeb0b' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '703c886a-c051-4976-a405-55f255ddeb0b', 666.67, 699.546876, '01', 'Semanal', '2026-01-09', true);

-- Pago vigente para empleado 703c886a-c051-4976-a405-55f255ddeb0b
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '703c886a-c051-4976-a405-55f255ddeb0b' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '703c886a-c051-4976-a405-55f255ddeb0b', '012', '1594937284', NULL, NULL, true, '2026-01-09');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '703c886a-c051-4976-a405-55f255ddeb0b', (SELECT persona_id FROM erp.empleados WHERE id = '703c886a-c051-4976-a405-55f255ddeb0b'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "191"}'::jsonb);

-- UPDATE persona del empleado 87ab7e1e-f029-4371-8f57-4df94d329ccf (código Excel 194)
UPDATE erp.personas p SET nombre = COALESCE('LUIS ANTONIO', p.nombre), apellido_paterno = COALESCE('VAZQUEZ', p.apellido_paterno), apellido_materno = COALESCE('CORTEZ', p.apellido_materno), rfc = COALESCE('VACL99121418A', p.rfc), curp = COALESCE('VACL991214HCLZRS09', p.curp), nss = COALESCE('49169928980', p.nss), fecha_nacimiento = COALESCE('1999-12-14', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('SENECIO 1703 ACOROS', p.domicilio), telefono = COALESCE('8781363004', p.telefono), email = COALESCE('ellocofeo95@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '87ab7e1e-f029-4371-8f57-4df94d329ccf';

UPDATE erp.empleados SET numero_empleado = '194', fecha_ingreso = '2026-01-19', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '49169928980', fecha_nacimiento = '1999-12-14', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ventas' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Asesor de Ventas' LIMIT 1), puesto_id) WHERE id = '87ab7e1e-f029-4371-8f57-4df94d329ccf';

-- Compensación vigente para empleado 87ab7e1e-f029-4371-8f57-4df94d329ccf
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '87ab7e1e-f029-4371-8f57-4df94d329ccf' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '87ab7e1e-f029-4371-8f57-4df94d329ccf', 440.87, 462.611534, '01', 'Semanal', '2026-01-19', true);

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '87ab7e1e-f029-4371-8f57-4df94d329ccf', (SELECT persona_id FROM erp.empleados WHERE id = '87ab7e1e-f029-4371-8f57-4df94d329ccf'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "194"}'::jsonb);

-- UPDATE persona del empleado d810053f-3e43-4eff-9b57-0f97e0b0097d (código Excel 196)
UPDATE erp.personas p SET nombre = COALESCE('NALLELY', p.nombre), apellido_paterno = COALESCE('RIVAS', p.apellido_paterno), apellido_materno = COALESCE('LOPEZ', p.apellido_materno), rfc = COALESCE('RILN910805FX9', p.rfc), curp = COALESCE('RILN910805MDGVPL07', p.curp), nss = COALESCE('32139112711', p.nss), fecha_nacimiento = COALESCE('1991-08-05', p.fecha_nacimiento), sexo = COALESCE('F', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('DURANGO, DG', p.lugar_nacimiento), domicilio = COALESCE('DANIEL FARIAS 418 BUENA VISTA', p.domicilio), telefono = COALESCE('8781439976', p.telefono), email = COALESCE('nallely.rivas.lopez@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'd810053f-3e43-4eff-9b57-0f97e0b0097d';

UPDATE erp.empleados SET numero_empleado = '196', fecha_ingreso = '2026-01-23', fecha_baja = '2026-02-07', motivo_baja = 'Separación voluntaria', activo = false, nss = '32139112711', fecha_nacimiento = '1991-08-05', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ventas' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Asesor de Ventas' LIMIT 1), puesto_id) WHERE id = 'd810053f-3e43-4eff-9b57-0f97e0b0097d';

-- Compensación vigente para empleado d810053f-3e43-4eff-9b57-0f97e0b0097d
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'd810053f-3e43-4eff-9b57-0f97e0b0097d' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'd810053f-3e43-4eff-9b57-0f97e0b0097d', 440.87, 462.611534, '01', 'Semanal', '2026-01-23', true);

-- Pago vigente para empleado d810053f-3e43-4eff-9b57-0f97e0b0097d
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'd810053f-3e43-4eff-9b57-0f97e0b0097d' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'd810053f-3e43-4eff-9b57-0f97e0b0097d', '012', '1563788443', NULL, NULL, true, '2026-01-23');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'd810053f-3e43-4eff-9b57-0f97e0b0097d', (SELECT persona_id FROM erp.empleados WHERE id = 'd810053f-3e43-4eff-9b57-0f97e0b0097d'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "196"}'::jsonb);

-- UPDATE persona del empleado 12c620de-1bc3-4d4b-8cf1-aee022ea0ee3 (código Excel 197)
UPDATE erp.personas p SET nombre = COALESCE('ALDO', p.nombre), apellido_paterno = COALESCE('JIMENEZ', p.apellido_paterno), apellido_materno = COALESCE('SAUZA', p.apellido_materno), rfc = COALESCE('JISA950616NFA', p.rfc), curp = COALESCE('JISA950616HCLMZL04', p.curp), nss = COALESCE('60139509362', p.nss), fecha_nacimiento = COALESCE('1995-06-16', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('MAR MEDITERRANEO 505 VILLA DEL CARMEN', p.domicilio), telefono = COALESCE('8781560280', p.telefono), email = COALESCE('ajsauzaaya@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '12c620de-1bc3-4d4b-8cf1-aee022ea0ee3';

UPDATE erp.empleados SET numero_empleado = '197', fecha_ingreso = '2026-01-23', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '60139509362', fecha_nacimiento = '1995-06-16', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ventas' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Asesor de Ventas' LIMIT 1), puesto_id) WHERE id = '12c620de-1bc3-4d4b-8cf1-aee022ea0ee3';

-- Compensación vigente para empleado 12c620de-1bc3-4d4b-8cf1-aee022ea0ee3
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '12c620de-1bc3-4d4b-8cf1-aee022ea0ee3' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '12c620de-1bc3-4d4b-8cf1-aee022ea0ee3', 440.87, 462.611534, '01', 'Semanal', '2026-01-23', true);

-- Pago vigente para empleado 12c620de-1bc3-4d4b-8cf1-aee022ea0ee3
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '12c620de-1bc3-4d4b-8cf1-aee022ea0ee3' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '12c620de-1bc3-4d4b-8cf1-aee022ea0ee3', '012', '1563791172', NULL, NULL, true, '2026-01-23');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '12c620de-1bc3-4d4b-8cf1-aee022ea0ee3', (SELECT persona_id FROM erp.empleados WHERE id = '12c620de-1bc3-4d4b-8cf1-aee022ea0ee3'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "197"}'::jsonb);

-- UPDATE persona del empleado c9e8a973-ed88-43b9-988f-779c641b4a9a (código Excel 198)
UPDATE erp.personas p SET nombre = COALESCE('ALAN JOB', p.nombre), apellido_paterno = COALESCE('MARTINEZ', p.apellido_paterno), apellido_materno = COALESCE('FLORES', p.apellido_materno), rfc = COALESCE('MAFA870514QH3', p.rfc), curp = COALESCE('MAFA870514HCLRLL07', p.curp), nss = COALESCE('32068712333', p.nss), fecha_nacimiento = COALESCE('1987-05-14', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('PIEDRAS NEGRAS, CL', p.lugar_nacimiento), domicilio = COALESCE('BLVD FCO COSS 745 ZONA CENTRO', p.domicilio), telefono = COALESCE('8781399036', p.telefono), email = COALESCE('alan1987job@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'c9e8a973-ed88-43b9-988f-779c641b4a9a';

UPDATE erp.empleados SET numero_empleado = '198', fecha_ingreso = '2026-01-23', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32068712333', fecha_nacimiento = '1987-05-14', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Maquinaria' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Operador de Maquinaria Pesada' LIMIT 1), puesto_id) WHERE id = 'c9e8a973-ed88-43b9-988f-779c641b4a9a';

-- Compensación vigente para empleado c9e8a973-ed88-43b9-988f-779c641b4a9a
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'c9e8a973-ed88-43b9-988f-779c641b4a9a' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c9e8a973-ed88-43b9-988f-779c641b4a9a', 440.87, 462.611534, '01', 'Semanal', '2026-01-23', true);

-- Pago vigente para empleado c9e8a973-ed88-43b9-988f-779c641b4a9a
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'c9e8a973-ed88-43b9-988f-779c641b4a9a' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c9e8a973-ed88-43b9-988f-779c641b4a9a', '012', '1573616315', NULL, NULL, true, '2026-01-23');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'c9e8a973-ed88-43b9-988f-779c641b4a9a', (SELECT persona_id FROM erp.empleados WHERE id = 'c9e8a973-ed88-43b9-988f-779c641b4a9a'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "198"}'::jsonb);

-- UPDATE persona del empleado 402b766e-63bf-4f51-9421-36f4d63c6ae4 (código Excel 300)
UPDATE erp.personas p SET nombre = COALESCE('ROGELIO', p.nombre), apellido_paterno = COALESCE('ESQUIVEL', p.apellido_paterno), apellido_materno = COALESCE('ARELLANO', p.apellido_materno), rfc = COALESCE('EUAR900617P21', p.rfc), curp = COALESCE('EUAR900617HCLSRG05', p.curp), nss = COALESCE('32089073517', p.nss), fecha_nacimiento = COALESCE('1990-06-17', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '402b766e-63bf-4f51-9421-36f4d63c6ae4';

UPDATE erp.empleados SET numero_empleado = '300', fecha_ingreso = '2022-01-01', fecha_baja = '2022-05-24', motivo_baja = 'Ausentismo', activo = false, nss = '32089073517', fecha_nacimiento = '1990-06-17', tipo_contrato = '01', horario = 'Matutino', umf = '0', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE(NULL, departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Gestor de Trámites' LIMIT 1), puesto_id) WHERE id = '402b766e-63bf-4f51-9421-36f4d63c6ae4';

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '402b766e-63bf-4f51-9421-36f4d63c6ae4', (SELECT persona_id FROM erp.empleados WHERE id = '402b766e-63bf-4f51-9421-36f4d63c6ae4'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'fuzzy_nombre_fecha', '{"match_metodo": "fuzzy_nombre_fecha", "codigo": "300"}'::jsonb);

-- UPDATE persona del empleado fa5fe25e-1ce6-4980-a695-82fd37f98ed5 (código Excel 301)
UPDATE erp.personas p SET nombre = COALESCE('ERIKA GUADALUPE', p.nombre), apellido_paterno = COALESCE('DE LEON', p.apellido_paterno), apellido_materno = COALESCE('RODRIGUEZ', p.apellido_materno), rfc = COALESCE('LERE971006MP2', p.rfc), curp = COALESCE('LERE971006HCLNDR06', p.curp), nss = COALESCE('19169743887', p.nss), fecha_nacimiento = COALESCE('1997-10-06', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'fa5fe25e-1ce6-4980-a695-82fd37f98ed5';

UPDATE erp.empleados SET numero_empleado = '301', fecha_ingreso = '2022-01-01', fecha_baja = '2022-05-24', motivo_baja = 'Ausentismo', activo = false, nss = '19169743887', fecha_nacimiento = '1997-10-06', tipo_contrato = '01', horario = 'Matutino', umf = '0', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '01', departamento_id = COALESCE(NULL, departamento_id), puesto_id = COALESCE(NULL, puesto_id) WHERE id = 'fa5fe25e-1ce6-4980-a695-82fd37f98ed5';

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'fa5fe25e-1ce6-4980-a695-82fd37f98ed5', (SELECT persona_id FROM erp.empleados WHERE id = 'fa5fe25e-1ce6-4980-a695-82fd37f98ed5'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "301"}'::jsonb);

-- UPDATE persona del empleado 92cfa85d-5c08-4da7-9fdf-ee5b34a8d67c (código Excel 303)
UPDATE erp.personas p SET nombre = COALESCE('ROBERTO CARLOS', p.nombre), apellido_paterno = COALESCE('REYES', p.apellido_paterno), apellido_materno = COALESCE('ZUÑIGA', p.apellido_materno), rfc = COALESCE('REZR931114GL4', p.rfc), curp = COALESCE('REZR931114HCLYXB08', p.curp), nss = COALESCE('32109352982', p.nss), fecha_nacimiento = COALESCE('1993-11-14', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '92cfa85d-5c08-4da7-9fdf-ee5b34a8d67c';

UPDATE erp.empleados SET numero_empleado = '303', fecha_ingreso = '2022-01-01', fecha_baja = '2022-01-01', motivo_baja = 'Ausentismo', activo = false, nss = '32109352982', fecha_nacimiento = '1993-11-14', tipo_contrato = '01', horario = 'Matutino', umf = '0', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '01', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Compras' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Almacenista' LIMIT 1), puesto_id) WHERE id = '92cfa85d-5c08-4da7-9fdf-ee5b34a8d67c';

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '92cfa85d-5c08-4da7-9fdf-ee5b34a8d67c', (SELECT persona_id FROM erp.empleados WHERE id = '92cfa85d-5c08-4da7-9fdf-ee5b34a8d67c'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "303"}'::jsonb);

-- UPDATE persona del empleado 474aaf1d-7733-4633-8e2e-ad1d34afc0c7 (código Excel 304)
UPDATE erp.personas p SET nombre = COALESCE('ROGELIO HUMBERTO', p.nombre), apellido_paterno = COALESCE('REYNA', p.apellido_paterno), apellido_materno = COALESCE('CASTRO', p.apellido_materno), rfc = COALESCE('RECR940330MV1', p.rfc), curp = COALESCE('RECR940330HCLYSG00', p.curp), nss = COALESCE('32119421272', p.nss), fecha_nacimiento = COALESCE('1994-03-30', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '474aaf1d-7733-4633-8e2e-ad1d34afc0c7';

UPDATE erp.empleados SET numero_empleado = '304', fecha_ingreso = '2022-01-01', fecha_baja = '2023-01-01', motivo_baja = 'Ausentismo', activo = false, nss = '32119421272', fecha_nacimiento = '1994-03-30', tipo_contrato = '01', horario = 'Matutino', umf = '0', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '01', departamento_id = COALESCE(NULL, departamento_id), puesto_id = COALESCE(NULL, puesto_id) WHERE id = '474aaf1d-7733-4633-8e2e-ad1d34afc0c7';

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '474aaf1d-7733-4633-8e2e-ad1d34afc0c7', (SELECT persona_id FROM erp.empleados WHERE id = '474aaf1d-7733-4633-8e2e-ad1d34afc0c7'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "304"}'::jsonb);

-- UPDATE persona del empleado df00f30e-7ca5-43cb-9f60-f427e5160fd6 (código Excel 305)
UPDATE erp.personas p SET nombre = COALESCE('JOEL ARNOLDO', p.nombre), apellido_paterno = COALESCE('VASQUEZ', p.apellido_paterno), apellido_materno = COALESCE('RAMIREZ', p.apellido_materno), rfc = COALESCE('VARJ900906B9A', p.rfc), curp = COALESCE('VARJ900906HCLSML00', p.curp), nss = COALESCE('32079070739', p.nss), fecha_nacimiento = COALESCE('1990-09-06', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'df00f30e-7ca5-43cb-9f60-f427e5160fd6';

UPDATE erp.empleados SET numero_empleado = '305', fecha_ingreso = '2022-01-01', fecha_baja = '2022-02-01', motivo_baja = 'Ausentismo', activo = false, nss = '32079070739', fecha_nacimiento = '1990-09-06', tipo_contrato = '01', horario = 'Matutino', umf = '0', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '01', departamento_id = COALESCE(NULL, departamento_id), puesto_id = COALESCE(NULL, puesto_id) WHERE id = 'df00f30e-7ca5-43cb-9f60-f427e5160fd6';

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'df00f30e-7ca5-43cb-9f60-f427e5160fd6', (SELECT persona_id FROM erp.empleados WHERE id = 'df00f30e-7ca5-43cb-9f60-f427e5160fd6'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "305"}'::jsonb);

-- UPDATE persona del empleado 56e57d8f-b8d0-4db4-9365-bd198e9d4589 (código Excel 306)
UPDATE erp.personas p SET nombre = COALESCE('JOSE IGNACIO', p.nombre), apellido_paterno = COALESCE('VALDEZ', p.apellido_paterno), apellido_materno = COALESCE('MATAMOROS', p.apellido_materno), rfc = COALESCE('VAMI660201I46', p.rfc), curp = COALESCE('VAMI660201HCLLTG00', p.curp), nss = COALESCE('4382662367', p.nss), fecha_nacimiento = COALESCE('1966-02-01', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '56e57d8f-b8d0-4db4-9365-bd198e9d4589';

UPDATE erp.empleados SET numero_empleado = '306', fecha_ingreso = '2022-01-01', fecha_baja = '2023-01-01', motivo_baja = 'Ausentismo', activo = false, nss = '4382662367', fecha_nacimiento = '1966-02-01', tipo_contrato = '01', horario = 'Matutino', umf = '0', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '01', departamento_id = COALESCE(NULL, departamento_id), puesto_id = COALESCE(NULL, puesto_id) WHERE id = '56e57d8f-b8d0-4db4-9365-bd198e9d4589';

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '56e57d8f-b8d0-4db4-9365-bd198e9d4589', (SELECT persona_id FROM erp.empleados WHERE id = '56e57d8f-b8d0-4db4-9365-bd198e9d4589'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "306"}'::jsonb);

-- UPDATE persona del empleado fe289ff4-a214-4943-bb24-8dba74ff23fa (código Excel 307)
UPDATE erp.personas p SET nombre = COALESCE('KARLA LIZBETH', p.nombre), apellido_paterno = COALESCE('GONZALEZ', p.apellido_paterno), apellido_materno = COALESCE('SAUCEDO', p.apellido_materno), rfc = COALESCE('GOSK9903164L6', p.rfc), curp = COALESCE('GOSK990316MCLNCR18', p.curp), nss = COALESCE('04139937223', p.nss), fecha_nacimiento = COALESCE('1999-03-16', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'fe289ff4-a214-4943-bb24-8dba74ff23fa';

UPDATE erp.empleados SET numero_empleado = '307', fecha_ingreso = '2022-01-01', fecha_baja = '2021-05-24', motivo_baja = 'Ausentismo', activo = false, nss = '04139937223', fecha_nacimiento = '1999-03-16', tipo_contrato = '01', horario = 'Matutino', umf = '0', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '01', departamento_id = COALESCE(NULL, departamento_id), puesto_id = COALESCE(NULL, puesto_id) WHERE id = 'fe289ff4-a214-4943-bb24-8dba74ff23fa';

-- Compensación vigente para empleado fe289ff4-a214-4943-bb24-8dba74ff23fa
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'fe289ff4-a214-4943-bb24-8dba74ff23fa' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'fe289ff4-a214-4943-bb24-8dba74ff23fa', 100.0, 105.068493, '01', 'Semanal', '2022-01-01', true);

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'fe289ff4-a214-4943-bb24-8dba74ff23fa', (SELECT persona_id FROM erp.empleados WHERE id = 'fe289ff4-a214-4943-bb24-8dba74ff23fa'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "307"}'::jsonb);

-- UPDATE persona del empleado 7c4b6ac1-95c0-4bcf-b4f2-5bfb83146f44 (código Excel 006)
UPDATE erp.personas p SET nombre = COALESCE('JESUS ANTONIO', p.nombre), apellido_paterno = COALESCE('HERNANDEZ', p.apellido_paterno), apellido_materno = COALESCE('AVALOS', p.apellido_materno), rfc = COALESCE('HEAJ800102U44', p.rfc), curp = COALESCE('HEAJ800102HCLRVS09', p.curp), nss = COALESCE('32008013552', p.nss), fecha_nacimiento = COALESCE('1980-01-02', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), domicilio = COALESCE('BOULEVARD LOS FUNDADORES 4875', p.domicilio), email = COALESCE('jesusantonio.dilesa@hotmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '7c4b6ac1-95c0-4bcf-b4f2-5bfb83146f44';

UPDATE erp.empleados SET numero_empleado = '006', fecha_ingreso = '2015-04-24', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '32008013552', fecha_nacimiento = '1980-01-02', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Maquinaria' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Operador de Maquinaria Pesada' LIMIT 1), puesto_id) WHERE id = '7c4b6ac1-95c0-4bcf-b4f2-5bfb83146f44';

-- Compensación vigente para empleado 7c4b6ac1-95c0-4bcf-b4f2-5bfb83146f44
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '7c4b6ac1-95c0-4bcf-b4f2-5bfb83146f44' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '7c4b6ac1-95c0-4bcf-b4f2-5bfb83146f44', 440.87, 466.24, '01', 'Semanal', '2015-04-24', true);

-- Pago vigente para empleado 7c4b6ac1-95c0-4bcf-b4f2-5bfb83146f44
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '7c4b6ac1-95c0-4bcf-b4f2-5bfb83146f44' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '7c4b6ac1-95c0-4bcf-b4f2-5bfb83146f44', '012', '1518512548', NULL, NULL, true, '2015-04-24');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '7c4b6ac1-95c0-4bcf-b4f2-5bfb83146f44', (SELECT persona_id FROM erp.empleados WHERE id = '7c4b6ac1-95c0-4bcf-b4f2-5bfb83146f44'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'conflict_resolution', '{"match_metodo": "conflict_resolution", "codigo": "006"}'::jsonb);

-- UPDATE persona del empleado accacabd-b0ca-4595-a02f-d164c1417ee5 (código Excel 082)
UPDATE erp.personas p SET nombre = COALESCE('PEDRO', p.nombre), apellido_paterno = COALESCE('MOLINA', p.apellido_paterno), apellido_materno = COALESCE('TAPIA', p.apellido_materno), rfc = COALESCE('MOTP680629TS5', p.rfc), curp = COALESCE('MOTP680629HSPLPD01', p.curp), nss = COALESCE('41876817655', p.nss), fecha_nacimiento = COALESCE('1968-06-29', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('San Luis Potosi, SP', p.lugar_nacimiento), domicilio = COALESCE('OLIVERIO MTZ DE HOYOS 1138 FRACC LOMAS DE LA VILLA', p.domicilio), email = COALESCE('barcenasmary7103@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'accacabd-b0ca-4595-a02f-d164c1417ee5';

UPDATE erp.empleados SET numero_empleado = '082', fecha_ingreso = '2023-03-10', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '41876817655', fecha_nacimiento = '1968-06-29', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Compras' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Almacenista' LIMIT 1), puesto_id) WHERE id = 'accacabd-b0ca-4595-a02f-d164c1417ee5';

-- Compensación vigente para empleado accacabd-b0ca-4595-a02f-d164c1417ee5
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'accacabd-b0ca-4595-a02f-d164c1417ee5' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'accacabd-b0ca-4595-a02f-d164c1417ee5', 440.87, 464.42, '01', 'Semanal', '2023-03-10', true);

-- Pago vigente para empleado accacabd-b0ca-4595-a02f-d164c1417ee5
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'accacabd-b0ca-4595-a02f-d164c1417ee5' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'accacabd-b0ca-4595-a02f-d164c1417ee5', '012', '2851353756', '0264', NULL, true, '2023-03-10');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'accacabd-b0ca-4595-a02f-d164c1417ee5', (SELECT persona_id FROM erp.empleados WHERE id = 'accacabd-b0ca-4595-a02f-d164c1417ee5'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'conflict_resolution', '{"match_metodo": "conflict_resolution", "codigo": "082"}'::jsonb);

-- UPDATE persona del empleado 63f2cf3c-194e-42f1-930d-62d8b2dbb754 (código Excel 085)
UPDATE erp.personas p SET nombre = COALESCE('JUAN MANUEL', p.nombre), apellido_paterno = COALESCE('PADILLA', p.apellido_paterno), apellido_materno = COALESCE('RODRIGUEZ', p.apellido_materno), rfc = COALESCE('PARJ790801P78', p.rfc), curp = COALESCE('PARJ790801HCLDDN05', p.curp), nss = COALESCE('32957941159', p.nss), fecha_nacimiento = COALESCE('1979-08-01', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('C', p.estado_civil), lugar_nacimiento = COALESCE('piedras, CL', p.lugar_nacimiento), email = COALESCE('padillajuan73783@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '63f2cf3c-194e-42f1-930d-62d8b2dbb754';

UPDATE erp.empleados SET numero_empleado = '085', fecha_ingreso = '2023-03-31', fecha_baja = '2024-05-31', motivo_baja = 'Separación voluntaria', activo = false, nss = '32957941159', fecha_nacimiento = '1979-08-01', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Maquinaria' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Operador de Maquinaria Pesada' LIMIT 1), puesto_id) WHERE id = '63f2cf3c-194e-42f1-930d-62d8b2dbb754';

-- Compensación vigente para empleado 63f2cf3c-194e-42f1-930d-62d8b2dbb754
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '63f2cf3c-194e-42f1-930d-62d8b2dbb754' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '63f2cf3c-194e-42f1-930d-62d8b2dbb754', 350.0, 367.260273, '01', 'Semanal', '2023-03-31', true);

-- Pago vigente para empleado 63f2cf3c-194e-42f1-930d-62d8b2dbb754
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '63f2cf3c-194e-42f1-930d-62d8b2dbb754' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '63f2cf3c-194e-42f1-930d-62d8b2dbb754', '012', '1566956585', '0264', NULL, true, '2023-03-31');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '63f2cf3c-194e-42f1-930d-62d8b2dbb754', (SELECT persona_id FROM erp.empleados WHERE id = '63f2cf3c-194e-42f1-930d-62d8b2dbb754'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'conflict_resolution', '{"match_metodo": "conflict_resolution", "codigo": "085"}'::jsonb);

-- UPDATE persona del empleado f568a232-e01a-4b16-8986-ea84a2604257 (código Excel 098)
UPDATE erp.personas p SET nombre = COALESCE('JAVIER', p.nombre), apellido_paterno = COALESCE('BARBOSA', p.apellido_paterno), apellido_materno = COALESCE('GONZALEZ', p.apellido_materno), rfc = COALESCE('BAGJ620831TU6', p.rfc), curp = COALESCE('BAGJ620831HCLRNV18', p.curp), nss = COALESCE('32816271053', p.nss), fecha_nacimiento = COALESCE('1962-08-31', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), lugar_nacimiento = COALESCE('CL', p.lugar_nacimiento), email = COALESCE('javierbarbosa3162@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'f568a232-e01a-4b16-8986-ea84a2604257';

UPDATE erp.empleados SET numero_empleado = '098', fecha_ingreso = '2002-01-01', fecha_baja = '2024-05-31', motivo_baja = 'Separación voluntaria', activo = false, nss = '32816271053', fecha_nacimiento = '1962-08-31', tipo_contrato = '01', horario = 'Matutino', umf = '0', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Maquinaria' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento' LIMIT 1), puesto_id) WHERE id = 'f568a232-e01a-4b16-8986-ea84a2604257';

-- Compensación vigente para empleado f568a232-e01a-4b16-8986-ea84a2604257
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'f568a232-e01a-4b16-8986-ea84a2604257' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'f568a232-e01a-4b16-8986-ea84a2604257', 374.89, 393.38, '01', 'Semanal', '2002-01-01', true);

-- Pago vigente para empleado f568a232-e01a-4b16-8986-ea84a2604257
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'f568a232-e01a-4b16-8986-ea84a2604257' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'f568a232-e01a-4b16-8986-ea84a2604257', '012', '1518512490', NULL, NULL, true, '2002-01-01');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'f568a232-e01a-4b16-8986-ea84a2604257', (SELECT persona_id FROM erp.empleados WHERE id = 'f568a232-e01a-4b16-8986-ea84a2604257'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'conflict_resolution', '{"match_metodo": "conflict_resolution", "codigo": "098"}'::jsonb);

-- UPDATE persona del empleado e21901be-dca8-4e3c-93a2-3bf5ddacbdf7 (código Excel 131)
UPDATE erp.personas p SET nombre = COALESCE('ADRIAN', p.nombre), apellido_paterno = COALESCE('HERNANDEZ', p.apellido_paterno), apellido_materno = COALESCE('ZAPATA', p.apellido_materno), rfc = COALESCE('HEZA921024PC5', p.rfc), curp = COALESCE('HEZA921024HCLRPD01', p.curp), nss = COALESCE('32109280779', p.nss), fecha_nacimiento = COALESCE('1992-10-24', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('piedras negras, CL', p.lugar_nacimiento), domicilio = COALESCE('SIN NOMBRE 113 PERIODISTAS', p.domicilio), telefono = COALESCE('8781450378', p.telefono), email = COALESCE('adrianhernandz794@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = 'e21901be-dca8-4e3c-93a2-3bf5ddacbdf7';

UPDATE erp.empleados SET numero_empleado = '131', fecha_ingreso = '2024-11-20', fecha_baja = '2025-01-16', motivo_baja = 'Reingreso (ciclo anterior)', activo = false, nss = '32109280779', fecha_nacimiento = '1992-10-24', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Oficial General' LIMIT 1), puesto_id) WHERE id = 'e21901be-dca8-4e3c-93a2-3bf5ddacbdf7';

-- Compensación vigente para empleado e21901be-dca8-4e3c-93a2-3bf5ddacbdf7
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'e21901be-dca8-4e3c-93a2-3bf5ddacbdf7' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'e21901be-dca8-4e3c-93a2-3bf5ddacbdf7', 440.87, 463.22, '01', 'Semanal', '2024-11-20', true);

-- Pago vigente para empleado e21901be-dca8-4e3c-93a2-3bf5ddacbdf7
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = 'e21901be-dca8-4e3c-93a2-3bf5ddacbdf7' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'e21901be-dca8-4e3c-93a2-3bf5ddacbdf7', '012', '1523330828', NULL, NULL, true, '2024-11-20');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'e21901be-dca8-4e3c-93a2-3bf5ddacbdf7', (SELECT persona_id FROM erp.empleados WHERE id = 'e21901be-dca8-4e3c-93a2-3bf5ddacbdf7'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'conflict_resolution', '{"match_metodo": "conflict_resolution", "codigo": "131"}'::jsonb);

-- UPDATE persona del empleado 89709bc2-6a66-4922-a48c-17fd9d687ad4 (código Excel 169)
UPDATE erp.personas p SET nombre = COALESCE('CESAR', p.nombre), apellido_paterno = COALESCE('GONZALEZ', p.apellido_paterno), apellido_materno = COALESCE('VALLES', p.apellido_materno), rfc = COALESCE('GOVC751001F21', p.rfc), curp = COALESCE('GOVC751001HSLNLS00', p.curp), nss = COALESCE('02247578707', p.nss), fecha_nacimiento = COALESCE('1975-10-01', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), estado_civil = COALESCE('S', p.estado_civil), lugar_nacimiento = COALESCE('SINALOA, SL', p.lugar_nacimiento), domicilio = COALESCE('CALINITA SIN NUMERO VALLE DEL PEDREGAL MEXICALI', p.domicilio), telefono = COALESCE('8110609758', p.telefono), email = COALESCE('gonzalezcesarv1975@gmail.com', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '89709bc2-6a66-4922-a48c-17fd9d687ad4';

UPDATE erp.empleados SET numero_empleado = '169', fecha_ingreso = '2025-07-30', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '02247578707', fecha_nacimiento = '1975-10-01', tipo_contrato = '01', horario = 'Matutino', umf = '79', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1), puesto_id) WHERE id = '89709bc2-6a66-4922-a48c-17fd9d687ad4';

-- Compensación vigente para empleado 89709bc2-6a66-4922-a48c-17fd9d687ad4
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '89709bc2-6a66-4922-a48c-17fd9d687ad4' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '89709bc2-6a66-4922-a48c-17fd9d687ad4', 440.87, 462.61, '01', 'Semanal', '2025-07-30', true);

-- Pago vigente para empleado 89709bc2-6a66-4922-a48c-17fd9d687ad4
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '89709bc2-6a66-4922-a48c-17fd9d687ad4' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '89709bc2-6a66-4922-a48c-17fd9d687ad4', '012', '1570553730', NULL, NULL, true, '2025-07-30');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '89709bc2-6a66-4922-a48c-17fd9d687ad4', (SELECT persona_id FROM erp.empleados WHERE id = '89709bc2-6a66-4922-a48c-17fd9d687ad4'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'conflict_resolution', '{"match_metodo": "conflict_resolution", "codigo": "169"}'::jsonb);

-- UPDATE persona del empleado 11b1a575-c3b2-4728-ba12-e749c597eed5 (código Excel 005)
UPDATE erp.personas p SET nombre = COALESCE('JUAN PABLO', p.nombre), apellido_paterno = COALESCE('HERNANDEZ', p.apellido_paterno), apellido_materno = COALESCE('MARTINEZ', p.apellido_materno), rfc = COALESCE('HEMJ800729T82', p.rfc), curp = COALESCE('HEMJ800729HGTRRN00', p.curp), nss = COALESCE('12998089119', p.nss), fecha_nacimiento = COALESCE('1980-07-29', p.fecha_nacimiento), sexo = COALESCE('M', p.sexo), lugar_nacimiento = COALESCE('GT', p.lugar_nacimiento), email = COALESCE('pablo.hm@dilesa.mx', p.email), tipo = COALESCE('empleado', p.tipo), tipo_persona = COALESCE('fisica', p.tipo_persona)
FROM erp.empleados e WHERE p.id = e.persona_id AND e.id = '11b1a575-c3b2-4728-ba12-e749c597eed5';

UPDATE erp.empleados SET numero_empleado = '005', fecha_ingreso = '2024-06-19', fecha_baja = NULL, motivo_baja = NULL, activo = true, nss = '12998089119', fecha_nacimiento = '1980-07-29', tipo_contrato = '01', horario = 'Matutino', umf = '0', zona_salario = 'C', regimen_imss = '02', tipo_prestacion = 'De_Ley', sindicalizado = 'C', metodo_pago_sat = '28', departamento_id = COALESCE((SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Deportivo' LIMIT 1), departamento_id), puesto_id = COALESCE((SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Gerente General' LIMIT 1), puesto_id) WHERE id = '11b1a575-c3b2-4728-ba12-e749c597eed5';

-- Compensación vigente para empleado 11b1a575-c3b2-4728-ba12-e749c597eed5
UPDATE erp.empleados_compensacion SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '11b1a575-c3b2-4728-ba12-e749c597eed5' AND vigente = true;
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) VALUES ((SELECT id FROM core.empresas WHERE slug = 'rdb'), '11b1a575-c3b2-4728-ba12-e749c597eed5', 1206.66, 1267.82, '01', 'Semanal', '2024-06-19', true);

-- Pago vigente para empleado 11b1a575-c3b2-4728-ba12-e749c597eed5
UPDATE erp.empleados_pago SET vigente = false, fecha_fin = '2026-04-30'
WHERE empleado_id = '11b1a575-c3b2-4728-ba12-e749c597eed5' AND vigente = true;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) VALUES ((SELECT id FROM core.empresas WHERE slug = 'rdb'), '11b1a575-c3b2-4728-ba12-e749c597eed5', '012', '1541914008', NULL, NULL, true, '2024-06-19');

INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'rdb'), '11b1a575-c3b2-4728-ba12-e749c597eed5', (SELECT persona_id FROM erp.empleados WHERE id = '11b1a575-c3b2-4728-ba12-e749c597eed5'), '2026-04-30', 'contpaqi_export_2026-04-30', 'update', 'rfc', '{"match_metodo": "rfc", "codigo": "005"}'::jsonb);

-- SOFT-DELETE empleado 6c06e78e-b4c0-4ccc-bb57-98c2d26453db: Duplicado de empleado 7c4b6ac1-95c0-4bcf-b4f2-5bfb83146f44 (conflict_resolution código 006)
UPDATE erp.empleados SET deleted_at = now() WHERE id = '6c06e78e-b4c0-4ccc-bb57-98c2d26453db';
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '6c06e78e-b4c0-4ccc-bb57-98c2d26453db', (SELECT persona_id FROM erp.empleados WHERE id = '6c06e78e-b4c0-4ccc-bb57-98c2d26453db'), '2026-04-30', 'contpaqi_export_2026-04-30', 'skip', '{"motivo":"Duplicado de empleado 7c4b6ac1-95c0-4bcf-b4f2-5bfb83146f44 (conflict_resolution código 006)"}'::jsonb);

-- SOFT-DELETE empleado 49f0d070-3205-4a8e-928e-6bf7b207c79c: Duplicado de empleado 63f2cf3c-194e-42f1-930d-62d8b2dbb754 (conflict_resolution código 085)
UPDATE erp.empleados SET deleted_at = now() WHERE id = '49f0d070-3205-4a8e-928e-6bf7b207c79c';
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '49f0d070-3205-4a8e-928e-6bf7b207c79c', (SELECT persona_id FROM erp.empleados WHERE id = '49f0d070-3205-4a8e-928e-6bf7b207c79c'), '2026-04-30', 'contpaqi_export_2026-04-30', 'skip', '{"motivo":"Duplicado de empleado 63f2cf3c-194e-42f1-930d-62d8b2dbb754 (conflict_resolution código 085)"}'::jsonb);

-- INSERT empleado código 083: Samaniego Flores Misael
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('Misael', 'Samaniego', 'Flores', 'SAFM810828G51', 'SAFM810828HCLMLS06', '32968170129', '1981-08-28', 'M', 'C', 'piedras negras, CL', 'JACARANDAS 115 A LAS FUENTES', '8781657173', 'mesac.samaniego@gmail.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '083', '2023-03-21', '2023-03-21', 'Separación voluntaria', false, '32968170129', '1981-08-28', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Técnico Especialista en Mantenimiento' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, '012', '1564835633', '0264', NULL, true, '2023-03-21' FROM ne;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "Misael", "apellido_paterno": "Samaniego", "apellido_materno": "Flores", "rfc": "SAFM810828G51", "curp": "SAFM810828HCLMLS06", "nss": "32968170129", "fecha_nacimiento": "1981-08-28", "sexo": "M", "estado_civil": "C", "lugar_nacimiento": "piedras negras, CL", "domicilio": "JACARANDAS 115 A LAS FUENTES", "telefono": "8781657173", "email": "mesac.samaniego@gmail.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "083", "fecha_ingreso": "2023-03-21", "fecha_baja": "2023-03-21", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '083' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 088: QUIROZ ROCHA RAYMUNDO
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('RAYMUNDO', 'QUIROZ', 'ROCHA', 'QURR530316SV6', 'QURR530316HCLRCY04', '32755312033', '1953-03-16', 'M', 'C', 'PIEDRA NEGRAS, CL', 'RIO BRAVO 513', NULL, NULL, 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '088', '2023-04-14', NULL, NULL, true, '32755312033', '1953-03-16', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Evap' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Intendencia' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, 440.87, 464.42, '01', 'Semanal', '2023-04-14', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, '012', '1568539566', '0264', NULL, true, '2023-04-14' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '088' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "RAYMUNDO", "apellido_paterno": "QUIROZ", "apellido_materno": "ROCHA", "rfc": "QURR530316SV6", "curp": "QURR530316HCLRCY04", "nss": "32755312033", "fecha_nacimiento": "1953-03-16", "sexo": "M", "estado_civil": "C", "lugar_nacimiento": "PIEDRA NEGRAS, CL", "domicilio": "RIO BRAVO 513", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "088", "fecha_ingreso": "2023-04-14", "activo": true, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '088' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 100: MARIN SANTOS ROXANA SALOME
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('ROXANA SALOME', 'MARIN', 'SANTOS', 'MASR9512213R8', 'MASR951221M', '05169595914', '1995-12-21', 'F', 'V', 'PIEDRAS NEGRAS, CL', 'LOS PINOS 121  PALMAS', '8781480171', 'roxanasalome1995@icloud.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '100', '2024-02-10', '2024-02-10', 'Ausentismo', false, '05169595914', '1995-12-21', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Deportivo' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Hostess' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, 374.89, 393.377726, '01', 'Semanal', '2024-02-10', true FROM ne;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "ROXANA SALOME", "apellido_paterno": "MARIN", "apellido_materno": "SANTOS", "rfc": "MASR9512213R8", "curp": "MASR951221M", "nss": "05169595914", "fecha_nacimiento": "1995-12-21", "sexo": "F", "estado_civil": "V", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "LOS PINOS 121  PALMAS", "telefono": "8781480171", "email": "roxanasalome1995@icloud.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "100", "fecha_ingreso": "2024-02-10", "fecha_baja": "2024-02-10", "motivo_baja": "Ausentismo", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '100' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 112: HERNANDEZ MARTINEZ JUAN PABLO
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('JUAN PABLO', 'HERNANDEZ', 'MARTINEZ', 'HEMJ800729T82', 'HEMJ800729HGTRRN00', '12998089119', '1980-07-29', 'M', 'C', 'GUANAJUATO, GT', 'BOULEVARD ADOLFO LOPEZ MATEOS 1317 COLONIA EL COECILLO', '8781166035', 'majestic003@live.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '112', '2024-06-19', '2024-09-06', 'Ausentismo', false, '12998089119', '1980-07-29', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Deportivo' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Gerente General Deportivo' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, 1206.66, 1266.17, '01', 'Semanal', '2024-06-19', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, '012', '1541914008', NULL, NULL, true, '2024-06-19' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '112' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "JUAN PABLO", "apellido_paterno": "HERNANDEZ", "apellido_materno": "MARTINEZ", "rfc": "HEMJ800729T82", "curp": "HEMJ800729HGTRRN00", "nss": "12998089119", "fecha_nacimiento": "1980-07-29", "sexo": "M", "estado_civil": "C", "lugar_nacimiento": "GUANAJUATO, GT", "domicilio": "BOULEVARD ADOLFO LOPEZ MATEOS 1317 COLONIA EL COECILLO", "telefono": "8781166035", "email": "majestic003@live.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "112", "fecha_ingreso": "2024-06-19", "fecha_baja": "2024-09-06", "motivo_baja": "Ausentismo", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '112' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 116: GARCIA VELAZQUEZ CESAR
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('CESAR', 'GARCIA', 'VELAZQUEZ', 'GAVC770105TP2', 'GAVC770105HMNRLS06', '53117702307', '1977-01-05', 'M', 'S', 'MICHOACAN, MN', 'GENERAL SERGIO SANCHEZ GARCIA 2902', '8781161493', 'notiene@no tiene', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '116', '2024-07-19', '2024-09-06', 'Ausentismo', false, '53117702307', '1977-01-05', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Deportivo' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, 433.33, 454.699698, '01', 'Semanal', '2024-07-19', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, '012', '1522170867', NULL, NULL, true, '2024-07-19' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '116' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "CESAR", "apellido_paterno": "GARCIA", "apellido_materno": "VELAZQUEZ", "rfc": "GAVC770105TP2", "curp": "GAVC770105HMNRLS06", "nss": "53117702307", "fecha_nacimiento": "1977-01-05", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "MICHOACAN, MN", "domicilio": "GENERAL SERGIO SANCHEZ GARCIA 2902", "telefono": "8781161493", "email": "notiene@no tiene", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "116", "fecha_ingreso": "2024-07-19", "fecha_baja": "2024-09-06", "motivo_baja": "Ausentismo", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '116' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 118: TOTO ALFONSO JUAN JOSE
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('JUAN JOSE', 'TOTO', 'ALFONSO', 'TOAJ971112UP0', 'TOAJ971112HVZTLN03', '35149731453', '1997-11-12', 'M', 'C', 'VERACRUZ, VZ', 'DEL PARQUE 1025 REAL DEL NORTE', '8781585179', 'totojuan168@gmail.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '118', '2024-07-29', '2024-09-06', 'Ausentismo', false, '35149731453', '1997-11-12', '01', 'Matutino', '9', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Deportivo' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mesero' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, 374.9, 393.388219, '01', 'Semanal', '2024-07-29', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, '012', '1571869228', NULL, NULL, true, '2024-07-29' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '118' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "JUAN JOSE", "apellido_paterno": "TOTO", "apellido_materno": "ALFONSO", "rfc": "TOAJ971112UP0", "curp": "TOAJ971112HVZTLN03", "nss": "35149731453", "fecha_nacimiento": "1997-11-12", "sexo": "M", "estado_civil": "C", "lugar_nacimiento": "VERACRUZ, VZ", "domicilio": "DEL PARQUE 1025 REAL DEL NORTE", "telefono": "8781585179", "email": "totojuan168@gmail.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "118", "fecha_ingreso": "2024-07-29", "fecha_baja": "2024-09-06", "motivo_baja": "Ausentismo", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "9", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '118' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 120: HUERVO JUAREZ AUSENCIO
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('AUSENCIO', 'HUERVO', 'JUAREZ', 'HUJA77121894A', 'HUJA771218HVZRRS03', '67947770821', '1977-12-18', 'M', 'S', 'veracruz, VZ', 'NIÑOS HEROES 12 CUAUHTEMOC', '8787029404', 'notiene@notienes.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '120', '2024-08-27', '2024-09-20', 'Separación voluntaria', false, '67947770821', '1977-12-18', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento de Terreno' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, 433.33, 454.699698, '01', 'Semanal', '2024-08-27', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, '012', '1536414438', NULL, NULL, true, '2024-08-27' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '120' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "AUSENCIO", "apellido_paterno": "HUERVO", "apellido_materno": "JUAREZ", "rfc": "HUJA77121894A", "curp": "HUJA771218HVZRRS03", "nss": "67947770821", "fecha_nacimiento": "1977-12-18", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "veracruz, VZ", "domicilio": "NIÑOS HEROES 12 CUAUHTEMOC", "telefono": "8787029404", "email": "notiene@notienes.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "120", "fecha_ingreso": "2024-08-27", "fecha_baja": "2024-09-20", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '120' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 124: BARBOZA CHAVEZ CRISTIAN ELIU
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('CRISTIAN ELIU', 'BARBOZA', 'CHAVEZ', 'BACC910919SV8', 'BACC910919HCLRHR03', '32079146588', '1991-09-19', 'M', 'S', 'PIEDRAS NEGRAS, CL', 'CALLE EMILIO CARRANZA 239 B NORTE', '5580244520', NULL, 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '124', '2024-09-20', '2024-10-25', 'Separación voluntaria', false, '32079146588', '1991-09-19', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Oficial General' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, 433.33, 454.699698, '01', 'Semanal', '2024-09-20', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, '012', '1527268850', NULL, NULL, true, '2024-09-20' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '124' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "CRISTIAN ELIU", "apellido_paterno": "BARBOZA", "apellido_materno": "CHAVEZ", "rfc": "BACC910919SV8", "curp": "BACC910919HCLRHR03", "nss": "32079146588", "fecha_nacimiento": "1991-09-19", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "CALLE EMILIO CARRANZA 239 B NORTE", "telefono": "5580244520", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "124", "fecha_ingreso": "2024-09-20", "fecha_baja": "2024-10-25", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '124' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 129: MORALES ROMERO ALVARO
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('ALVARO', 'MORALES', 'ROMERO', 'MORA740322UA5', 'MORA740322HDFRML02', '32947440478', '1974-03-22', 'M', 'S', 'MEXICO DF, DF', 'GALEANA 909 CENTRO', '8781594234', NULL, 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '129', '2024-10-24', '2024-11-01', 'Separación voluntaria', false, '32947440478', '1974-03-22', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Mantenimiento' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Técnico Especialista en Mantenimiento' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, 500.0, 524.657534, '01', 'Semanal', '2024-10-24', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, '012', '1529431995', NULL, NULL, true, '2024-10-24' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '129' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "ALVARO", "apellido_paterno": "MORALES", "apellido_materno": "ROMERO", "rfc": "MORA740322UA5", "curp": "MORA740322HDFRML02", "nss": "32947440478", "fecha_nacimiento": "1974-03-22", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "MEXICO DF, DF", "domicilio": "GALEANA 909 CENTRO", "telefono": "8781594234", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "129", "fecha_ingreso": "2024-10-24", "fecha_baja": "2024-11-01", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '129' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 144: GARCIA MARES JESUS EDUARDO
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('JESUS EDUARDO', 'GARCIA', 'MARES', 'GAMJ950430K69', 'GAMJ950430HCLRRS05', '32119515370', '1995-04-30', 'M', 'S', 'PIEDRAS NEGRAS, CL', 'CEIBA 1005 LOS ALAMITOS', '8781141534', 'arqjesusgama@hotmail.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '144', '2025-03-21', '2026-03-25', 'Separación voluntaria', false, '32119515370', '1995-04-30', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Construcción' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Supervisor de Obra' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, 666.67, 700.46, '01', 'Semanal', '2025-03-21', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, '012', '1124159705', NULL, NULL, true, '2025-03-21' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '144' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "JESUS EDUARDO", "apellido_paterno": "GARCIA", "apellido_materno": "MARES", "rfc": "GAMJ950430K69", "curp": "GAMJ950430HCLRRS05", "nss": "32119515370", "fecha_nacimiento": "1995-04-30", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "CEIBA 1005 LOS ALAMITOS", "telefono": "8781141534", "email": "arqjesusgama@hotmail.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "144", "fecha_ingreso": "2025-03-21", "fecha_baja": "2026-03-25", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '144' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 145: MARTINEZ MARTINEZ JOSE IGNACIO
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('JOSE IGNACIO', 'MARTINEZ', 'MARTINEZ', 'MAMI850128P28', 'MAMI850128HCLRRG06', '32008505763', '1985-01-28', 'M', 'S', 'PIEDRAS NEGRAS, CL', 'LIB REPUBLICA Y ENTRONQ CARRET 57 LOTE SN PARQUE INDUSTRIAL', '8782090718', NULL, 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '145', '2025-03-28', '2025-04-04', 'Separación voluntaria', false, '32008505763', '1985-01-28', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, 419.88, 440.58641, '01', 'Semanal', '2025-03-28', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, '012', '1586772717', NULL, NULL, true, '2025-03-28' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '145' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "JOSE IGNACIO", "apellido_paterno": "MARTINEZ", "apellido_materno": "MARTINEZ", "rfc": "MAMI850128P28", "curp": "MAMI850128HCLRRG06", "nss": "32008505763", "fecha_nacimiento": "1985-01-28", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "LIB REPUBLICA Y ENTRONQ CARRET 57 LOTE SN PARQUE INDUSTRIAL", "telefono": "8782090718", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "145", "fecha_ingreso": "2025-03-28", "fecha_baja": "2025-04-04", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '145' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 146: DIAZ ESCOBEDO EDUARDO
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('EDUARDO', 'DIAZ', 'ESCOBEDO', 'DIEE811013270', 'DIEE811013HCLZSD01', '32018116502', '1981-10-13', 'M', 'S', 'PIEDRAS NEGRAS, CL', 'MAR MUERTO 728 AMPLIACION AÑO 2000', '8781081717', NULL, 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '146', '2025-04-04', '2025-05-12', 'Separación voluntaria', false, '32018116502', '1981-10-13', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, 419.88, 440.58641, '01', 'Semanal', '2025-04-04', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, '012', '1592924833', NULL, NULL, true, '2025-04-04' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '146' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "EDUARDO", "apellido_paterno": "DIAZ", "apellido_materno": "ESCOBEDO", "rfc": "DIEE811013270", "curp": "DIEE811013HCLZSD01", "nss": "32018116502", "fecha_nacimiento": "1981-10-13", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "MAR MUERTO 728 AMPLIACION AÑO 2000", "telefono": "8781081717", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "146", "fecha_ingreso": "2025-04-04", "fecha_baja": "2025-05-12", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '146' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 149: TELLO ALVAREZ ULISES ALEJANDRO
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('ULISES ALEJANDRO', 'TELLO', 'ALVAREZ', 'TEAU000513IR9', 'TEAU000513HCLLLLA7', '03150094088', '2000-05-13', 'M', 'S', 'PIEDRAS NEGRAS, CL', 'C 9 415 VENUSTIANO CARRANZA', '8781656628', 'alejandrotello1025@gmail.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '149', '2025-04-29', '2025-07-02', 'Separación voluntaria', false, '03150094088', '2000-05-13', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Compras' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Almacenista' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, 419.88, 440.58641, '01', 'Semanal', '2025-04-29', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, '012', '1543266615', NULL, NULL, true, '2025-04-29' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '149' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "ULISES ALEJANDRO", "apellido_paterno": "TELLO", "apellido_materno": "ALVAREZ", "rfc": "TEAU000513IR9", "curp": "TEAU000513HCLLLLA7", "nss": "03150094088", "fecha_nacimiento": "2000-05-13", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "C 9 415 VENUSTIANO CARRANZA", "telefono": "8781656628", "email": "alejandrotello1025@gmail.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "149", "fecha_ingreso": "2025-04-29", "fecha_baja": "2025-07-02", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '149' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 151: ALVARADO DE LA CRUZ RAFAEL
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('RAFAEL', 'ALVARADO', 'DE LA CRUZ', 'AACR680914FD9', 'AACR680914HCLLRF07', '02246815027', '1968-09-14', 'M', 'S', 'PIEDRAS ENGRAS, CL', 'SIERRA DE LA ENCANTADA 819 LOS MONTES', '8781468983', 'rrafaell1468@gmail.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '151', '2025-04-29', '2025-05-02', 'Ausentismo', false, '02246815027', '1968-09-14', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Construcción' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Oficial General' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, 419.88, 440.58641, '01', 'Semanal', '2025-04-29', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, '012', '1520862484', NULL, NULL, true, '2025-04-29' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '151' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "RAFAEL", "apellido_paterno": "ALVARADO", "apellido_materno": "DE LA CRUZ", "rfc": "AACR680914FD9", "curp": "AACR680914HCLLRF07", "nss": "02246815027", "fecha_nacimiento": "1968-09-14", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS ENGRAS, CL", "domicilio": "SIERRA DE LA ENCANTADA 819 LOS MONTES", "telefono": "8781468983", "email": "rrafaell1468@gmail.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "151", "fecha_ingreso": "2025-04-29", "fecha_baja": "2025-05-02", "motivo_baja": "Ausentismo", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '151' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 152: VARGAS GARZA PABLO
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('PABLO', 'VARGAS', 'GARZA', 'VAGP870305P72', 'VAGP870305HCLRRB06', '32048708211', '1987-03-05', 'M', 'S', 'PIEDRAS NEGRAS, CL', 'LIB JOSE LOPEZ PORTILLO SN SAN JOAQUIN', '8781538765', 'jc3853927@gmail.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '152', '2025-04-25', '2025-05-09', 'Separación voluntaria', false, '32048708211', '1987-03-05', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, 419.88, 440.58641, '01', 'Semanal', '2025-04-25', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, '012', '1565885099', NULL, NULL, true, '2025-04-25' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '152' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "PABLO", "apellido_paterno": "VARGAS", "apellido_materno": "GARZA", "rfc": "VAGP870305P72", "curp": "VAGP870305HCLRRB06", "nss": "32048708211", "fecha_nacimiento": "1987-03-05", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "LIB JOSE LOPEZ PORTILLO SN SAN JOAQUIN", "telefono": "8781538765", "email": "jc3853927@gmail.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "152", "fecha_ingreso": "2025-04-25", "fecha_baja": "2025-05-09", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '152' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 175: MALDONADO RODRIGUEZ JESUS
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('JESUS', 'MALDONADO', 'RODRIGUEZ', 'MARJ750120E10', 'MARJ750120HCLLDS07', '32917543921', '1975-01-20', 'M', 'S', 'PIEDRAS NEGRAS, CL', 'CARRETERA A CD ACUÑA SN', '8781116437', 'jesusmaldonado75@gmail.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '175', '2025-09-02', '2025-09-05', 'Separación voluntaria', false, '32917543921', '1975-01-20', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Maquinaria' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Operador de Maquinaria Pesada' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, 419.88, 440.58641, '01', 'Semanal', '2025-09-02', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, '012', '1512425439', NULL, NULL, true, '2025-09-02' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '175' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "JESUS", "apellido_paterno": "MALDONADO", "apellido_materno": "RODRIGUEZ", "rfc": "MARJ750120E10", "curp": "MARJ750120HCLLDS07", "nss": "32917543921", "fecha_nacimiento": "1975-01-20", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "CARRETERA A CD ACUÑA SN", "telefono": "8781116437", "email": "jesusmaldonado75@gmail.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "175", "fecha_ingreso": "2025-09-02", "fecha_baja": "2025-09-05", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '175' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 184: GAYTAN OROCIO PEDRO
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('PEDRO', 'GAYTAN', 'OROCIO', 'GAOP850702MU2', 'GAOP850702HCLYRD08', '32008501184', '1985-07-02', 'M', 'S', 'PIEDRAS NEGRAS, CL', 'MANGLE 821 AÑO 2000', '8781338655', NULL, 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '184', '2025-11-07', '2026-01-05', 'Separación voluntaria', false, '32008501184', '1985-07-02', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Evap' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, 440.87, 462.61, '01', 'Semanal', '2025-11-07', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, '012', '1502488030', NULL, NULL, true, '2025-11-07' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '184' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "PEDRO", "apellido_paterno": "GAYTAN", "apellido_materno": "OROCIO", "rfc": "GAOP850702MU2", "curp": "GAOP850702HCLYRD08", "nss": "32008501184", "fecha_nacimiento": "1985-07-02", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "MANGLE 821 AÑO 2000", "telefono": "8781338655", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "184", "fecha_ingreso": "2025-11-07", "fecha_baja": "2026-01-05", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '184' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 185: ALVARADO CARRIZALES MARIO ALBERTO
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('MARIO ALBERTO', 'ALVARADO', 'CARRIZALES', 'AACM950924JA0', 'AACM950924HTSLRR01', '26169598484', '1995-09-24', 'M', 'S', 'tamaulipas, TS', 'JACARANDA 200 M FRACCIONAMIENTO ARBOLEDAS', '8781364021', NULL, 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '185', '2025-11-19', '2025-11-19', 'Ausentismo', false, '26169598484', '1995-09-24', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, 419.88, 440.58641, '01', 'Semanal', '2025-11-19', true FROM ne;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "MARIO ALBERTO", "apellido_paterno": "ALVARADO", "apellido_materno": "CARRIZALES", "rfc": "AACM950924JA0", "curp": "AACM950924HTSLRR01", "nss": "26169598484", "fecha_nacimiento": "1995-09-24", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "tamaulipas, TS", "domicilio": "JACARANDA 200 M FRACCIONAMIENTO ARBOLEDAS", "telefono": "8781364021", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "185", "fecha_ingreso": "2025-11-19", "fecha_baja": "2025-11-19", "motivo_baja": "Ausentismo", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '185' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 186: PEREZ ORTIZ YEISON MANUEL
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('YEISON MANUEL', 'PEREZ', 'ORTIZ', 'PEOY030213FT9', 'PEOY030213HNERRSA1', '03230304093', '2003-02-13', 'M', 'C', 'HONDURAS, NE', 'ABASOLO 408 CENTRO', '8781559729', NULL, 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '186', '2025-11-26', '2026-02-28', 'Separación voluntaria', false, '03230304093', '2003-02-13', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, 440.87, 462.61, '01', 'Semanal', '2025-11-26', true FROM ne;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "YEISON MANUEL", "apellido_paterno": "PEREZ", "apellido_materno": "ORTIZ", "rfc": "PEOY030213FT9", "curp": "PEOY030213HNERRSA1", "nss": "03230304093", "fecha_nacimiento": "2003-02-13", "sexo": "M", "estado_civil": "C", "lugar_nacimiento": "HONDURAS, NE", "domicilio": "ABASOLO 408 CENTRO", "telefono": "8781559729", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "186", "fecha_ingreso": "2025-11-26", "fecha_baja": "2026-02-28", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '186' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 189: FLORES JOAQUIN CARLOS ENRIQUE
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('CARLOS ENRIQUE', 'FLORES', 'JOAQUIN', 'FOJC020615K4A', 'FOJC020615HCLLQRA1', '10200274859', '2002-06-15', 'M', 'S', 'PIEDRAS NEGRAS, CL', 'DR PEDRO MARTINEZ 478 LOS DOCTORES', '8782107476', 'carlosenriquefloresjoaquin63@gmail.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '189', '2026-01-06', '2026-03-07', 'Separación voluntaria', false, '10200274859', '2002-06-15', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, 440.87, 462.611534, '01', 'Semanal', '2026-01-06', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, '012', '1529971911', NULL, NULL, true, '2026-01-06' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '189' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "CARLOS ENRIQUE", "apellido_paterno": "FLORES", "apellido_materno": "JOAQUIN", "rfc": "FOJC020615K4A", "curp": "FOJC020615HCLLQRA1", "nss": "10200274859", "fecha_nacimiento": "2002-06-15", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "DR PEDRO MARTINEZ 478 LOS DOCTORES", "telefono": "8782107476", "email": "carlosenriquefloresjoaquin63@gmail.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "189", "fecha_ingreso": "2026-01-06", "fecha_baja": "2026-03-07", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '189' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 192: TELLO DE LA O JESUS RIGOBERTO
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('JESUS RIGOBERTO', 'TELLO', 'DE LA O', 'TEOJ9608083Z7', 'TEOJ960808HCLLXS09', '08159678807', '1996-08-08', 'M', 'S', 'PIEDRAS NEGRAS, CL', 'SIERRA HERMOSA 223 LOS MONTES', '8661597855', 'tellojesus493@gmail.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '192', '2026-01-13', '2026-03-19', 'Separación voluntaria', false, '08159678807', '1996-08-08', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Evap' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, 440.87, 462.611534, '01', 'Semanal', '2026-01-13', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, '012', '1505488252', NULL, NULL, true, '2026-01-13' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '192' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "JESUS RIGOBERTO", "apellido_paterno": "TELLO", "apellido_materno": "DE LA O", "rfc": "TEOJ9608083Z7", "curp": "TEOJ960808HCLLXS09", "nss": "08159678807", "fecha_nacimiento": "1996-08-08", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "SIERRA HERMOSA 223 LOS MONTES", "telefono": "8661597855", "email": "tellojesus493@gmail.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "192", "fecha_ingreso": "2026-01-13", "fecha_baja": "2026-03-19", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '192' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 193: ZENDEJAS ALMENDAREZ JUAN UVALDO
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('JUAN UVALDO', 'ZENDEJAS', 'ALMENDAREZ', 'ZEAJ9302089J5', 'ZEAJ930208HCLNLN06', '32049300133', '1993-02-08', 'M', 'S', 'PIEDRAS NEGRAS, CL', 'INDUSTRIAL 1004 BRAVO', '8781401844', 'juvaldozendejas@gmail.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '193', '2026-01-12', '2026-02-12', 'Separación voluntaria', false, '32049300133', '1993-02-08', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, 440.87, 462.611534, '01', 'Semanal', '2026-01-12', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, '012', '1562724519', NULL, NULL, true, '2026-01-12' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '193' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "JUAN UVALDO", "apellido_paterno": "ZENDEJAS", "apellido_materno": "ALMENDAREZ", "rfc": "ZEAJ9302089J5", "curp": "ZEAJ930208HCLNLN06", "nss": "32049300133", "fecha_nacimiento": "1993-02-08", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "INDUSTRIAL 1004 BRAVO", "telefono": "8781401844", "email": "juvaldozendejas@gmail.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "193", "fecha_ingreso": "2026-01-12", "fecha_baja": "2026-02-12", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '193' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 195: CONTRERAS GONZALEZ VICTOR OMAR
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('VICTOR OMAR', 'CONTRERAS', 'GONZALEZ', 'COGV981102RQ9', 'COGV981102HCLNNC03', '26159837009', '1998-11-02', 'M', 'S', 'PIEDRAS NEGRAS, CL', 'CASA BLANCA SIN NUMERO', '8781161675', NULL, 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '195', '2026-01-21', '2026-01-28', 'Separación voluntaria', false, '26159837009', '1998-11-02', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Proyectos' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, 440.87, 462.611534, '01', 'Semanal', '2026-01-21', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, '012', '1563559914', NULL, NULL, true, '2026-01-21' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '195' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "VICTOR OMAR", "apellido_paterno": "CONTRERAS", "apellido_materno": "GONZALEZ", "rfc": "COGV981102RQ9", "curp": "COGV981102HCLNNC03", "nss": "26159837009", "fecha_nacimiento": "1998-11-02", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "CASA BLANCA SIN NUMERO", "telefono": "8781161675", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "195", "fecha_ingreso": "2026-01-21", "fecha_baja": "2026-01-28", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '195' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 199: SOSA OROZCO JUAN FRANCISCO
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('JUAN FRANCISCO', 'SOSA', 'OROZCO', 'SOOJ981016C99', 'SOOJ981016HCLSRN00', '27159871386', '1998-10-16', 'M', 'S', 'PIEDRAS NEGRAS, CL', 'GARCIA SN CURVA DE JUAN SANCHEZ', '8120233264', 'franciscoorosco1698@gmail.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'dilesa'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '199', '2026-03-20', NULL, NULL, true, '27159871386', '1998-10-16', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'dilesa'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Evap' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND nombre = 'Ayudante General' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), ne.id, 440.87, 462.611534, '01', 'Semanal', '2026-03-20', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, '012', '1545987425', NULL, NULL, true, '2026-03-20' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '199' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'dilesa'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "JUAN FRANCISCO", "apellido_paterno": "SOSA", "apellido_materno": "OROZCO", "rfc": "SOOJ981016C99", "curp": "SOOJ981016HCLSRN00", "nss": "27159871386", "fecha_nacimiento": "1998-10-16", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "GARCIA SN CURVA DE JUAN SANCHEZ", "telefono": "8120233264", "email": "franciscoorosco1698@gmail.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "199", "fecha_ingreso": "2026-03-20", "activo": true, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'dilesa') AND e.numero_empleado = '199' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 001: PALACIOS JIMENEZ OMAR DE JESUS
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('OMAR DE JESUS', 'PALACIOS', 'JIMENEZ', 'PAJO891214B69', 'PAJO891214HCLLMM09', '32088937969', '1989-12-14', 'M', 'S', 'PIEDRAS NEGRAS, CL', 'CENTENARIO 1732 BRAVO', '8781156783', NULL, 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'rdb'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '001', '2023-08-08', '2025-05-22', 'Separación voluntaria', false, '32088937969', '1989-12-14', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'rdb'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Deportivo' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Instructor Deportivo' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), ne.id, 419.88, 441.16, '01', 'Semanal', '2023-08-08', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, '012', '1573983488', NULL, NULL, true, '2023-08-08' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '001' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "OMAR DE JESUS", "apellido_paterno": "PALACIOS", "apellido_materno": "JIMENEZ", "rfc": "PAJO891214B69", "curp": "PAJO891214HCLLMM09", "nss": "32088937969", "fecha_nacimiento": "1989-12-14", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "CENTENARIO 1732 BRAVO", "telefono": "8781156783", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "001", "fecha_ingreso": "2023-08-08", "fecha_baja": "2025-05-22", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '001' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 002: VELASQUEZ MORALES JENNY DARIELA
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('JENNY DARIELA', 'VELASQUEZ', 'MORALES', 'VEMJ010306K74', 'VEMJ010306MCLLRNA7', '35160124752', '2001-03-06', 'F', 'S', 'PIEDRAS NEGRAS, CL', 'AVE LOPEZ MATEOS 803', '8781025617', 'dariela.vm@dilesa.mx', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'rdb'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '002', '2023-09-08', '2025-01-09', 'Separación voluntaria', false, '35160124752', '2001-03-06', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'rdb'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Deportivo' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Coordinador Deportivo y Eventos' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), ne.id, 419.88, 441.16, '01', 'Semanal', '2023-09-08', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, '012', '1594672318', NULL, NULL, true, '2023-09-08' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '002' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "JENNY DARIELA", "apellido_paterno": "VELASQUEZ", "apellido_materno": "MORALES", "rfc": "VEMJ010306K74", "curp": "VEMJ010306MCLLRNA7", "nss": "35160124752", "fecha_nacimiento": "2001-03-06", "sexo": "F", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "AVE LOPEZ MATEOS 803", "telefono": "8781025617", "email": "dariela.vm@dilesa.mx", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "002", "fecha_ingreso": "2023-09-08", "fecha_baja": "2025-01-09", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '002' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 003: ZATARAIN CHACON CRISTINA MAYELA
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('CRISTINA MAYELA', 'ZATARAIN', 'CHACON', 'ZACC971025T66', 'ZACC971025MCLTHR08', '72169715314', '1997-10-25', 'F', 'S', 'PIEDRAS NEGRAS, CL', 'VICENTE SUAREZ 503 GUILLEN', NULL, NULL, 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'rdb'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '003', '2023-09-08', '2024-09-18', 'Separación voluntaria', false, '72169715314', '1997-10-25', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'rdb'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Deportivo' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Hostess' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), ne.id, 374.9, 393.9, '01', 'Semanal', '2023-09-08', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, '012', '1582300661', NULL, NULL, true, '2023-09-08' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '003' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "CRISTINA MAYELA", "apellido_paterno": "ZATARAIN", "apellido_materno": "CHACON", "rfc": "ZACC971025T66", "curp": "ZACC971025MCLTHR08", "nss": "72169715314", "fecha_nacimiento": "1997-10-25", "sexo": "F", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "VICENTE SUAREZ 503 GUILLEN", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "003", "fecha_ingreso": "2023-09-08", "fecha_baja": "2024-09-18", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '003' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 004: GRIEGO ROSALES LUIS ANTONIO
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('LUIS ANTONIO', 'GRIEGO', 'ROSALES', 'GIRL9607292F4', 'GIRL960729HCLRSS02', '32139607918', '1996-07-29', 'M', NULL, 'CL', NULL, NULL, NULL, 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'rdb'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '004', '2024-04-26', '2024-10-11', 'Separación voluntaria', false, '32139607918', '1996-07-29', '01', 'Matutino', '0', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'rdb'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Deportivo' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Mantenimiento' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), ne.id, 374.9, 393.388219, '01', 'Semanal', '2024-04-26', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, '012', '1505051934', NULL, NULL, true, '2024-04-26' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '004' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "LUIS ANTONIO", "apellido_paterno": "GRIEGO", "apellido_materno": "ROSALES", "rfc": "GIRL9607292F4", "curp": "GIRL960729HCLRSS02", "nss": "32139607918", "fecha_nacimiento": "1996-07-29", "sexo": "M", "lugar_nacimiento": "CL", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "004", "fecha_ingreso": "2024-04-26", "fecha_baja": "2024-10-11", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "0", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '004' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 006: PALACIOS JIMENEZ ANGEL ANIBAL
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('ANGEL ANIBAL', 'PALACIOS', 'JIMENEZ', 'PAJA980105VB0', 'PAJA980105HCLLMN04', '02249883196', '1998-01-05', 'M', NULL, 'CL', NULL, NULL, 'anibalonch98@gmail.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'rdb'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '006', '2024-07-01', '2025-10-30', 'Separación voluntaria', false, '02249883196', '1998-01-05', '01', 'Matutino', '0', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'rdb'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Deportivo' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Instructor Deportivo' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), ne.id, 419.88, 441.16, '01', 'Semanal', '2024-07-01', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, '012', '1518770661', NULL, NULL, true, '2024-07-01' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '006' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "ANGEL ANIBAL", "apellido_paterno": "PALACIOS", "apellido_materno": "JIMENEZ", "rfc": "PAJA980105VB0", "curp": "PAJA980105HCLLMN04", "nss": "02249883196", "fecha_nacimiento": "1998-01-05", "sexo": "M", "lugar_nacimiento": "CL", "email": "anibalonch98@gmail.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "006", "fecha_ingreso": "2024-07-01", "fecha_baja": "2025-10-30", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "0", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '006' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 007: GARCIA VELAZQUEZ CESAR
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('CESAR', 'GARCIA', 'VELAZQUEZ', 'GAVC770105TP2', 'GAVC770105HMNRLS06', '53117702307', '1977-01-05', 'M', NULL, 'MN', NULL, NULL, NULL, 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'rdb'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '007', '2024-07-19', '2024-11-15', 'Separación voluntaria', false, '53117702307', '1977-01-05', '01', 'Matutino', '0', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'rdb'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Deportivo' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Mantenimiento' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), ne.id, 500.0, 524.66, '01', 'Semanal', '2024-07-19', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, '012', '1522170867', NULL, NULL, true, '2024-07-19' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '007' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "CESAR", "apellido_paterno": "GARCIA", "apellido_materno": "VELAZQUEZ", "rfc": "GAVC770105TP2", "curp": "GAVC770105HMNRLS06", "nss": "53117702307", "fecha_nacimiento": "1977-01-05", "sexo": "M", "lugar_nacimiento": "MN", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "007", "fecha_ingreso": "2024-07-19", "fecha_baja": "2024-11-15", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "0", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '007' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 008: ESPARZA VELOZ SONIA CECILIA
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('SONIA CECILIA', 'ESPARZA', 'VELOZ', 'EAVS990125M27', 'EAVS990125MCLSLN08', '75169973213', '1999-01-25', 'F', NULL, 'CL', NULL, NULL, 'sonia_esparza1@hotmail.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'rdb'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '008', '2024-07-23', '2024-10-03', 'Separación voluntaria', false, '75169973213', '1999-01-25', '01', 'Matutino', '0', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'rdb'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Deportivo' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Auxiliar Administrativo' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), ne.id, 590.0, 619.09589, '01', 'Semanal', '2024-07-23', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, '012', '1549998159', NULL, NULL, true, '2024-07-23' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '008' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "SONIA CECILIA", "apellido_paterno": "ESPARZA", "apellido_materno": "VELOZ", "rfc": "EAVS990125M27", "curp": "EAVS990125MCLSLN08", "nss": "75169973213", "fecha_nacimiento": "1999-01-25", "sexo": "F", "lugar_nacimiento": "CL", "email": "sonia_esparza1@hotmail.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "008", "fecha_ingreso": "2024-07-23", "fecha_baja": "2024-10-03", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "0", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '008' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 009: TOTO ALFONSO JUAN JOSE
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('JUAN JOSE', 'TOTO', 'ALFONSO', 'TOAJ971112UP0', 'TOAJ971112HVZTLN03', '35149731453', '1997-11-12', 'M', 'S', 'VERACRUZ, VZ', 'RIO SAN ISIDRO 903 LOMAS DE LA VILLA', '8781468946', NULL, 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'rdb'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '009', '2024-07-29', '2024-11-15', 'Separación voluntaria', false, '35149731453', '1997-11-12', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'rdb'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Deportivo' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Mesero' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), ne.id, 374.9, 393.388219, '01', 'Semanal', '2024-07-29', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, '012', '1571869228', NULL, NULL, true, '2024-07-29' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '009' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "JUAN JOSE", "apellido_paterno": "TOTO", "apellido_materno": "ALFONSO", "rfc": "TOAJ971112UP0", "curp": "TOAJ971112HVZTLN03", "nss": "35149731453", "fecha_nacimiento": "1997-11-12", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "VERACRUZ, VZ", "domicilio": "RIO SAN ISIDRO 903 LOMAS DE LA VILLA", "telefono": "8781468946", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "009", "fecha_ingreso": "2024-07-29", "fecha_baja": "2024-11-15", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '009' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 010: MARTINEZ GALLEGOS LESLIE CRISTAL
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('LESLIE CRISTAL', 'MARTINEZ', 'GALLEGOS', 'MAGL021024C2A', 'MAGL021024MCLRLSA2', '25220265166', '2002-10-24', 'F', NULL, 'CL', NULL, NULL, 'leslie.232457@gmail.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'rdb'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '010', '2024-08-16', NULL, NULL, true, '25220265166', '2002-10-24', '01', 'Matutino', '0', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'rdb'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Deportivo' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Mesero' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), ne.id, 500.0, 525.34, '01', 'Semanal', '2024-08-16', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, '012', '1524023732', NULL, NULL, true, '2024-08-16' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '010' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "LESLIE CRISTAL", "apellido_paterno": "MARTINEZ", "apellido_materno": "GALLEGOS", "rfc": "MAGL021024C2A", "curp": "MAGL021024MCLRLSA2", "nss": "25220265166", "fecha_nacimiento": "2002-10-24", "sexo": "F", "lugar_nacimiento": "CL", "email": "leslie.232457@gmail.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "010", "fecha_ingreso": "2024-08-16", "activo": true, "tipo_contrato": "01", "horario": "Matutino", "umf": "0", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '010' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 011: TORRES FALCON VICTOR MANUEL
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('VICTOR MANUEL', 'TORRES', 'FALCON', 'TOFV930201HUA', 'TOFV930201HCLRLC03', '32119392499', '1993-02-01', 'M', 'S', 'PIEDRAS NEGRAS, CL', 'ARTICULO 123 110 AMPLIACION LAZARO CARDENAS', '8781155822', 'ikeredder527@gmail.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'rdb'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '011', '2024-08-27', NULL, NULL, true, '32119392499', '1993-02-01', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'rdb'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Deportivo' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Mesero' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), ne.id, 440.87, 463.22, '01', 'Semanal', '2024-08-27', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, '012', '1525894681', NULL, NULL, true, '2024-08-27' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '011' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "VICTOR MANUEL", "apellido_paterno": "TORRES", "apellido_materno": "FALCON", "rfc": "TOFV930201HUA", "curp": "TOFV930201HCLRLC03", "nss": "32119392499", "fecha_nacimiento": "1993-02-01", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "ARTICULO 123 110 AMPLIACION LAZARO CARDENAS", "telefono": "8781155822", "email": "ikeredder527@gmail.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "011", "fecha_ingreso": "2024-08-27", "activo": true, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '011' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 012: BONILLA FERNANDEZ ESTEFANIA JANETH
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('ESTEFANIA JANETH', 'BONILLA', 'FERNANDEZ', 'BOFE921019VA3', 'BOFE921019MDFNRS01', '45109201975', '1992-10-19', 'F', 'S', 'MEXICO, DF', 'CALLE TEPETLAPA ANDADOR 18 EDIFICIO D ALIANZA POPULAR REVOLU', '5512306482', 'e.bonillaf@universidaddelclaustro.edu.mx', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'rdb'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '012', '2024-09-18', '2025-02-21', 'Separación voluntaria', false, '45109201975', '1992-10-19', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'rdb'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Deportivo' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Auxiliar Administrativo' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), ne.id, 450.0, 472.19178, '01', 'Semanal', '2024-09-18', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, '012', '1585653657', NULL, NULL, true, '2024-09-18' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '012' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "ESTEFANIA JANETH", "apellido_paterno": "BONILLA", "apellido_materno": "FERNANDEZ", "rfc": "BOFE921019VA3", "curp": "BOFE921019MDFNRS01", "nss": "45109201975", "fecha_nacimiento": "1992-10-19", "sexo": "F", "estado_civil": "S", "lugar_nacimiento": "MEXICO, DF", "domicilio": "CALLE TEPETLAPA ANDADOR 18 EDIFICIO D ALIANZA POPULAR REVOLU", "telefono": "5512306482", "email": "e.bonillaf@universidaddelclaustro.edu.mx", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "012", "fecha_ingreso": "2024-09-18", "fecha_baja": "2025-02-21", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '012' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 013: RUEDA RAMIREZ RAMIRO
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('RAMIRO', 'RUEDA', 'RAMIREZ', 'RURR9207088MA', 'RURR920708HCLDMM05', '32099211842', '1992-07-08', 'M', 'S', 'PIEDRAS NEGRAS, CL', '7 A 207 BUENOS AIRES', '8781004730', 'ramrueda23@gmail.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'rdb'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '013', '2024-10-11', '2024-11-04', 'Separación voluntaria', false, '32099211842', '1992-07-08', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'rdb'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Deportivo' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Mantenimiento' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), ne.id, 433.33, 454.699698, '01', 'Semanal', '2024-10-11', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, '012', '1528912141', NULL, NULL, true, '2024-10-11' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '013' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "RAMIRO", "apellido_paterno": "RUEDA", "apellido_materno": "RAMIREZ", "rfc": "RURR9207088MA", "curp": "RURR920708HCLDMM05", "nss": "32099211842", "fecha_nacimiento": "1992-07-08", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "7 A 207 BUENOS AIRES", "telefono": "8781004730", "email": "ramrueda23@gmail.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "013", "fecha_ingreso": "2024-10-11", "fecha_baja": "2024-11-04", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '013' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 014: ZARAGOZA RANGEL JORGE
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('JORGE', 'ZARAGOZA', 'RANGEL', 'ZARJ021210RN9', 'ZARJ021210HCLRNRA7', '08170249505', '2002-12-10', 'M', 'S', 'PIEDRAS NEGRAS, CL', 'BAHIA ESCONDIDA 330 FRACC LAS PALMAS', '8781170598', 'david_cisneros26083@gmail.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'rdb'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '014', '2024-11-16', '2025-01-30', 'Separación voluntaria', false, '08170249505', '2002-12-10', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'rdb'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Deportivo' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Mantenimiento' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), ne.id, 500.0, 524.657534, '01', 'Semanal', '2024-11-16', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, '012', '1531551312', NULL, NULL, true, '2024-11-16' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '014' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "JORGE", "apellido_paterno": "ZARAGOZA", "apellido_materno": "RANGEL", "rfc": "ZARJ021210RN9", "curp": "ZARJ021210HCLRNRA7", "nss": "08170249505", "fecha_nacimiento": "2002-12-10", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "BAHIA ESCONDIDA 330 FRACC LAS PALMAS", "telefono": "8781170598", "email": "david_cisneros26083@gmail.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "014", "fecha_ingreso": "2024-11-16", "fecha_baja": "2025-01-30", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '014' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 015: CISNEROS VILLA DAVID MISAEL
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('DAVID MISAEL', 'CISNEROS', 'VILLA', 'CIVD990909A57', 'CIVD990909HCLSLV07', '02209913322', '1999-09-09', 'M', 'S', 'PIEDRAS NEGRAS, CL', 'NUEVE 1299 AMPLIAION HIDALGO', NULL, 'david_cisneros26083@hotmail.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'rdb'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '015', '2024-11-15', '2024-12-09', 'Separación voluntaria', false, '02209913322', '1999-09-09', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'rdb'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Deportivo' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Mesero' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), ne.id, 374.9, 393.388219, '01', 'Semanal', '2024-11-15', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, '012', '1531664556', NULL, NULL, true, '2024-11-15' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '015' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "DAVID MISAEL", "apellido_paterno": "CISNEROS", "apellido_materno": "VILLA", "rfc": "CIVD990909A57", "curp": "CIVD990909HCLSLV07", "nss": "02209913322", "fecha_nacimiento": "1999-09-09", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "NUEVE 1299 AMPLIAION HIDALGO", "email": "david_cisneros26083@hotmail.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "015", "fecha_ingreso": "2024-11-15", "fecha_baja": "2024-12-09", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '015' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 016: MARTINEZ NORIEGA ISMAEL
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('ISMAEL', 'MARTINEZ', 'NORIEGA', 'MANI951024C99', 'MANI951024HCLRRS02', '32129553825', '1995-10-24', 'M', 'S', 'PIEDRAS NEGRAS, CL', 'HIDALGO 605 CENTRO', '8781333008', 'im7070376@gmail.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'rdb'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '016', '2025-02-04', '2025-06-16', 'Separación voluntaria', false, '32129553825', '1995-10-24', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'rdb'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Deportivo' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Mantenimiento' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), ne.id, 500.0, 524.657534, '01', 'Semanal', '2025-02-04', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, '012', '1566376520', NULL, NULL, true, '2025-02-04' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '016' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "ISMAEL", "apellido_paterno": "MARTINEZ", "apellido_materno": "NORIEGA", "rfc": "MANI951024C99", "curp": "MANI951024HCLRRS02", "nss": "32129553825", "fecha_nacimiento": "1995-10-24", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "HIDALGO 605 CENTRO", "telefono": "8781333008", "email": "im7070376@gmail.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "016", "fecha_ingreso": "2025-02-04", "fecha_baja": "2025-06-16", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '016' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 017: COVARRUBIAS VAZQUEZ LUIS MARIO
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('LUIS MARIO', 'COVARRUBIAS', 'VAZQUEZ', 'COVL9212318D7', 'COVL921231HCLVZS00', '32119292905', '1992-12-31', 'M', 'S', 'PIEDRAS NEGRAS, CL', 'JOSE CLEMENTE OROZCO 1310', '8781437628', 'luis.mario.92@hotmail.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'rdb'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '017', '2025-02-24', '2025-04-04', 'Separación voluntaria', false, '32119292905', '1992-12-31', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'rdb'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Deportivo' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Hostess' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), ne.id, 419.88, 440.58641, '01', 'Semanal', '2025-02-24', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, '012', '1578575851', NULL, NULL, true, '2025-02-24' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '017' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "LUIS MARIO", "apellido_paterno": "COVARRUBIAS", "apellido_materno": "VAZQUEZ", "rfc": "COVL9212318D7", "curp": "COVL921231HCLVZS00", "nss": "32119292905", "fecha_nacimiento": "1992-12-31", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "JOSE CLEMENTE OROZCO 1310", "telefono": "8781437628", "email": "luis.mario.92@hotmail.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "017", "fecha_ingreso": "2025-02-24", "fecha_baja": "2025-04-04", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '017' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 018: MENDEZ LEYVA VALERIA
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('VALERIA', 'MENDEZ', 'LEYVA', 'MELV030921F53', 'MELV030921MCLNYLA9', '27180340344', '2003-09-21', 'F', 'S', 'PIEDRAS NEGRAS, CL', 'OLMO 1625 ACOROS 1', '8781485278', 'mendezvaleria989@gmail.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'rdb'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '018', '2025-02-26', '2026-01-30', 'Separación voluntaria', false, '27180340344', '2003-09-21', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'rdb'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Deportivo' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Hostess' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), ne.id, 440.87, 462.61, '01', 'Semanal', '2025-02-26', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, '012', '1525941712', NULL, NULL, true, '2025-02-26' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '018' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "VALERIA", "apellido_paterno": "MENDEZ", "apellido_materno": "LEYVA", "rfc": "MELV030921F53", "curp": "MELV030921MCLNYLA9", "nss": "27180340344", "fecha_nacimiento": "2003-09-21", "sexo": "F", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "OLMO 1625 ACOROS 1", "telefono": "8781485278", "email": "mendezvaleria989@gmail.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "018", "fecha_ingreso": "2025-02-26", "fecha_baja": "2026-01-30", "motivo_baja": "Separación voluntaria", "activo": false, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '018' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 019: ARRIAGA MENDOZA JOEL ANTONIO
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('JOEL ANTONIO', 'ARRIAGA', 'MENDOZA', 'AIMJ980118M37', 'AIMJ980118HCLRNL03', '17159868078', '1998-01-18', 'M', 'S', 'PIEDRAS NEGRAS, CL', 'MANUEL PEREZ TREVIÑO SN LOMAS DEL NORTE', '8782113601', 'arriagamendozajoelantonio@gmail.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'rdb'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '019', '2025-07-04', NULL, NULL, true, '17159868078', '1998-01-18', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'rdb'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Deportivo' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Mantenimiento' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), ne.id, 500.0, 524.657534, '01', 'Semanal', '2025-07-04', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, '012', '1548406913', NULL, NULL, true, '2025-07-04' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '019' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "JOEL ANTONIO", "apellido_paterno": "ARRIAGA", "apellido_materno": "MENDOZA", "rfc": "AIMJ980118M37", "curp": "AIMJ980118HCLRNL03", "nss": "17159868078", "fecha_nacimiento": "1998-01-18", "sexo": "M", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "MANUEL PEREZ TREVIÑO SN LOMAS DEL NORTE", "telefono": "8782113601", "email": "arriagamendozajoelantonio@gmail.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "019", "fecha_ingreso": "2025-07-04", "activo": true, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '019' ORDER BY e.created_at DESC LIMIT 1;

-- INSERT empleado código 020: MARTINEZ MARTINEZ LAISHA MICHEL
WITH np AS (
  INSERT INTO erp.personas (nombre, apellido_paterno, apellido_materno, rfc, curp, nss, fecha_nacimiento, sexo, estado_civil, lugar_nacimiento, domicilio, telefono, email, tipo, tipo_persona, empresa_id)
  VALUES ('LAISHA MICHEL', 'MARTINEZ', 'MARTINEZ', 'MAML030920NK1', 'MAML030920MCLRRSA4', '88180352341', '2003-09-20', 'F', 'S', 'PIEDRAS NEGRAS, CL', 'CALLE 801 AÑO 2000', '8781572891', 'laishamartinez76@gmail.com', 'empleado', 'fisica', (SELECT id FROM core.empresas WHERE slug = 'rdb'))
  RETURNING id
), ne AS (
  INSERT INTO erp.empleados (numero_empleado, fecha_ingreso, fecha_baja, motivo_baja, activo, nss, fecha_nacimiento, tipo_contrato, horario, umf, zona_salario, regimen_imss, tipo_prestacion, sindicalizado, metodo_pago_sat, empresa_id, persona_id, departamento_id, puesto_id)
  SELECT '020', '2026-02-13', NULL, NULL, true, '88180352341', '2003-09-20', '01', 'Matutino', '79', 'C', '02', 'De_Ley', 'C', '28', (SELECT id FROM core.empresas WHERE slug = 'rdb'), np.id, (SELECT id FROM erp.departamentos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Deportivo' LIMIT 1), (SELECT id FROM erp.puestos WHERE empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND nombre = 'Hostess' LIMIT 1) FROM np
  RETURNING id, persona_id
)
INSERT INTO erp.empleados_compensacion (empresa_id, empleado_id, sueldo_diario, sdi, tipo_contrato, frecuencia_pago, fecha_inicio, vigente) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), ne.id, 440.87, 462.611534, '01', 'Semanal', '2026-02-13', true FROM ne;
INSERT INTO erp.empleados_pago (empresa_id, empleado_id, banco_codigo, numero_cuenta, sucursal, clabe, vigente, fecha_inicio) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, '012', '1514057919', NULL, NULL, true, '2026-02-13' FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '020' ORDER BY e.created_at DESC LIMIT 1;
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, match_metodo, diff) SELECT (SELECT id FROM core.empresas WHERE slug = 'rdb'), e.id, e.persona_id, '2026-04-30', 'contpaqi_export_2026-04-30', 'insert', NULL, '{"nombre": "LAISHA MICHEL", "apellido_paterno": "MARTINEZ", "apellido_materno": "MARTINEZ", "rfc": "MAML030920NK1", "curp": "MAML030920MCLRRSA4", "nss": "88180352341", "fecha_nacimiento": "2003-09-20", "sexo": "F", "estado_civil": "S", "lugar_nacimiento": "PIEDRAS NEGRAS, CL", "domicilio": "CALLE 801 AÑO 2000", "telefono": "8781572891", "email": "laishamartinez76@gmail.com", "tipo": "empleado", "tipo_persona": "fisica", "numero_empleado": "020", "fecha_ingreso": "2026-02-13", "activo": true, "tipo_contrato": "01", "horario": "Matutino", "umf": "79", "zona_salario": "C", "regimen_imss": "02", "tipo_prestacion": "De_Ley", "sindicalizado": "C", "metodo_pago_sat": "28"}'::jsonb FROM erp.empleados e WHERE e.empresa_id = (SELECT id FROM core.empresas WHERE slug = 'rdb') AND e.numero_empleado = '020' ORDER BY e.created_at DESC LIMIT 1;

-- BAJA seleccionada empleado 129ec28e-d33f-4abf-85c3-0145d996f197: Godoy Duarte Pedro
UPDATE erp.empleados SET activo = false, fecha_baja = '2026-04-30', motivo_baja = 'No presente en snapshot CONTPAQi 2026-04-30' WHERE id = '129ec28e-d33f-4abf-85c3-0145d996f197';
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '129ec28e-d33f-4abf-85c3-0145d996f197', (SELECT persona_id FROM erp.empleados WHERE id = '129ec28e-d33f-4abf-85c3-0145d996f197'), '2026-04-30', 'contpaqi_export_2026-04-30', 'baja', '{"motivo":"No presente en snapshot CONTPAQi 2026-04-30"}'::jsonb);

-- BAJA seleccionada empleado 79c9cc9c-bc5a-48cc-a320-ce6600519522: Arriaga Mendoza Joel Antonio
UPDATE erp.empleados SET activo = false, fecha_baja = '2026-04-30', motivo_baja = 'No presente en snapshot CONTPAQi 2026-04-30' WHERE id = '79c9cc9c-bc5a-48cc-a320-ce6600519522';
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '79c9cc9c-bc5a-48cc-a320-ce6600519522', (SELECT persona_id FROM erp.empleados WHERE id = '79c9cc9c-bc5a-48cc-a320-ce6600519522'), '2026-04-30', 'contpaqi_export_2026-04-30', 'baja', '{"motivo":"No presente en snapshot CONTPAQi 2026-04-30"}'::jsonb);

-- BAJA seleccionada empleado 91064d2a-5039-4d33-9248-7f1a9723e99a: Martinez Gallegos Leslie Cristal
UPDATE erp.empleados SET activo = false, fecha_baja = '2026-04-30', motivo_baja = 'No presente en snapshot CONTPAQi 2026-04-30' WHERE id = '91064d2a-5039-4d33-9248-7f1a9723e99a';
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), '91064d2a-5039-4d33-9248-7f1a9723e99a', (SELECT persona_id FROM erp.empleados WHERE id = '91064d2a-5039-4d33-9248-7f1a9723e99a'), '2026-04-30', 'contpaqi_export_2026-04-30', 'baja', '{"motivo":"No presente en snapshot CONTPAQi 2026-04-30"}'::jsonb);

-- BAJA seleccionada empleado f64b48b1-1593-427e-ba21-261580c89b3f: Rodríguez Llamas Pattsy
UPDATE erp.empleados SET activo = false, fecha_baja = '2026-04-30', motivo_baja = 'No presente en snapshot CONTPAQi 2026-04-30' WHERE id = 'f64b48b1-1593-427e-ba21-261580c89b3f';
INSERT INTO erp.empleados_import_log (empresa_id, empleado_id, persona_id, snapshot_fecha, origen, accion, diff)
VALUES ((SELECT id FROM core.empresas WHERE slug = 'dilesa'), 'f64b48b1-1593-427e-ba21-261580c89b3f', (SELECT persona_id FROM erp.empleados WHERE id = 'f64b48b1-1593-427e-ba21-261580c89b3f'), '2026-04-30', 'contpaqi_export_2026-04-30', 'baja', '{"motivo":"No presente en snapshot CONTPAQi 2026-04-30"}'::jsonb);

NOTIFY pgrst, 'reload schema';

COMMIT;
