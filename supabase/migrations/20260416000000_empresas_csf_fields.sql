-- Add CSF (Constancia de Situación Fiscal) fields to core.empresas
ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS rfc TEXT;
ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS razon_social TEXT;
ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS regimen_capital TEXT;
ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS nombre_comercial TEXT;
ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS fecha_inicio_operaciones DATE;
ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS estatus_sat TEXT;
ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS id_cif TEXT;
ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS regimen_fiscal TEXT;
ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS domicilio_cp TEXT;
ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS domicilio_calle TEXT;
ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS domicilio_numero_ext TEXT;
ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS domicilio_numero_int TEXT;
ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS domicilio_colonia TEXT;
ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS domicilio_localidad TEXT;
ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS domicilio_municipio TEXT;
ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS domicilio_estado TEXT;
ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS actividades_economicas JSONB;
ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS obligaciones_fiscales JSONB;
ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS csf_fecha_emision DATE;
ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS csf_url TEXT;

-- Add UNIQUE constraint on rfc (ignore if already exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'empresas_rfc_key'
  ) THEN
    ALTER TABLE core.empresas ADD CONSTRAINT empresas_rfc_key UNIQUE (rfc);
  END IF;
END $$;

-- Seed ANSA data from CSF
UPDATE core.empresas SET
  rfc = 'ANO8509243H3',
  razon_social = 'AUTOS DEL NORTE',
  regimen_capital = 'SOCIEDAD ANONIMA DE CAPITAL VARIABLE',
  nombre_comercial = NULL,
  fecha_inicio_operaciones = '1958-12-01',
  estatus_sat = 'ACTIVO',
  id_cif = '14110980997',
  regimen_fiscal = 'Régimen General de Ley Personas Morales',
  domicilio_cp = '26000',
  domicilio_calle = 'CALLE HIDALGO NORTE',
  domicilio_numero_ext = '100',
  domicilio_numero_int = NULL,
  domicilio_colonia = 'PIEDRAS NEGRAS CENTRO',
  domicilio_localidad = 'PIEDRAS NEGRAS',
  domicilio_municipio = 'PIEDRAS NEGRAS',
  domicilio_estado = 'COAHUILA DE ZARAGOZA',
  actividades_economicas = '[
    {"orden":1,"actividad":"Comercio al por menor de automóviles y camionetas nuevos cuya propulsión sea a través de baterías eléctricas recargable","porcentaje":"90%","fecha_inicio":"09/04/1999","fecha_fin":null},
    {"orden":2,"actividad":"Reparación mecánica en general de automóviles y camiones","porcentaje":"2%","fecha_inicio":"24/05/2023","fecha_fin":null},
    {"orden":3,"actividad":"Comercio al por menor de automóviles y camionetas usados y comercio integrado de automóviles y camiones usados y a la compra venta y consignación de automóviles y camionetas","porcentaje":"1%","fecha_inicio":"24/05/2023","fecha_fin":null},
    {"orden":4,"actividad":"Comercio al por menor de partes y refacciones nuevas para automóviles camionetas y camiones","porcentaje":"1%","fecha_inicio":"24/05/2023","fecha_fin":null},
    {"orden":5,"actividad":"Comercio al por menor de llantas y cámaras corbatas válvulas de cámara y tapones para automóviles camionetas y camiones de motor","porcentaje":"1%","fecha_inicio":"24/05/2023","fecha_fin":null},
    {"orden":6,"actividad":"Comercio al por menor de aceites y grasas lubricantes de uso industrial aditivos y similares para vehículos de motor","porcentaje":"1%","fecha_inicio":"24/05/2023","fecha_fin":null},
    {"orden":7,"actividad":"Alineación y balanceo de automóviles y camiones","porcentaje":"1%","fecha_inicio":"24/05/2023","fecha_fin":null},
    {"orden":8,"actividad":"Hojalatería y pintura de automóviles y camiones","porcentaje":"1%","fecha_inicio":"24/05/2023","fecha_fin":null},
    {"orden":9,"actividad":"Instalación de cristales y otras reparaciones a la carrocería de automóviles y camiones","porcentaje":"1%","fecha_inicio":"24/05/2023","fecha_fin":null},
    {"orden":10,"actividad":"Lavado y lubricado de automóviles y camiones","porcentaje":"1%","fecha_inicio":"24/05/2023","fecha_fin":null}
  ]'::jsonb,
  obligaciones_fiscales = '[
    {"descripcion":"Entero de retenciones mensuales de ISR por sueldos y salarios","vencimiento":"A más tardar el día 17 del mes inmediato posterior al periodo que corresponda.","fecha_inicio":"31/03/2002","fecha_fin":null},
    {"descripcion":"Declaración informativa anual de pagos y retenciones de servicios profesionales. Personas Morales. Impuesto Sobre la Renta","vencimiento":"A más tardar el 15 de febrero del año siguiente","fecha_inicio":"31/03/2002","fecha_fin":null},
    {"descripcion":"Declaración informativa anual de retenciones de ISR por arrendamiento de inmuebles","vencimiento":"A más tardar el 15 de febrero del año siguiente","fecha_inicio":"31/03/2002","fecha_fin":null},
    {"descripcion":"Pago definitivo mensual de IVA","vencimiento":"A más tardar el día 17 del mes inmediato posterior al periodo que corresponda.","fecha_inicio":"31/03/2002","fecha_fin":null},
    {"descripcion":"Declaración informativa de IVA con la anual de ISR","vencimiento":"Conjuntamente con la declaración anual del ejercicio.","fecha_inicio":"31/03/2002","fecha_fin":null},
    {"descripcion":"Pago provisional mensual de ISR personas morales régimen general","vencimiento":"A más tardar el día 17 del mes inmediato posterior al periodo que corresponda.","fecha_inicio":"31/03/2002","fecha_fin":null},
    {"descripcion":"Declaración anual de ISR del ejercicio Personas morales","vencimiento":"Dentro de los tres meses siguientes al cierre del ejercicio.","fecha_inicio":"31/03/2002","fecha_fin":null},
    {"descripcion":"Declaración de proveedores de IVA","vencimiento":"A más tardar el último día del mes inmediato posterior al periodo que corresponda.","fecha_inicio":"01/09/2006","fecha_fin":null}
  ]'::jsonb,
  csf_fecha_emision = '2026-04-01'
WHERE slug = 'ansa';

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
