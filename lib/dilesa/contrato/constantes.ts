/**
 * Constantes hardcoded para el Contrato de Promesa de Compraventa
 * DILESA (Sprint 7b). Cada bloque tiene un TODO con dónde debería
 * vivir cuando lo migremos a DB.
 *
 * Mantener este archivo como única fuente de verdad mientras los
 * datos no estén en DB. Cuando se migren, borrar el bloque
 * correspondiente y leer desde Supabase.
 */

// TODO(sprint-7c): mover a `core.empresas.representante_legal` +
// columna con CURP/RFC/dirección/INE del representante.
export const REPRESENTANTE_DILESA = {
  nombre: 'LC NORBERTO GUTIERREZ INFANTE',
  curp: 'GUIN980718HCLTNR01',
  rfc: 'GUIN980718M51',
  nacionalidad: 'mexicano por nacimiento',
  estadoCivil: 'soltero',
  profesion: 'profesionista',
  edad: 'mayor de edad',
  domicilio: {
    calle: 'Olímpica',
    numero: '206',
    colonia: 'Colinas',
    cp: '26089',
    ciudad: 'Piedras Negras, Coahuila',
  },
  ine: {
    numero: 'IDMEX1738991608 06341063634439807187H2612317MEX',
    autoridad: 'Instituto Nacional Electoral',
  },
};

// TODO(sprint-7c): mover a `erp.cuentas_bancarias` con tipo = 'principal_inmobiliaria'.
export const CUENTA_DILESA = {
  banco: 'BBVA BANCOMER',
  numeroCuenta: '0141502492',
  clabe: '012075001415024923',
  titular: 'DESARROLLO INMOBILIARIO LOS ENCINOS S.A. DE C.V.',
};

// TODO(sprint-7c): mover a `core.empresas.escritura_constitutiva` (JSONB que ya existe)
// y `core.empresas.escritura_modificacion` (nueva columna o array).
export const ESCRITURAS_CONSTITUTIVAS_DILESA = {
  constitutiva: {
    numero: '167',
    fecha: '04 de septiembre del 2003',
    notario: '16',
    distritoNotarial: 'Saltillo',
    fme: '2299',
  },
  modificacion: {
    numero: '35',
    fecha: '28 de Abril del 2020',
    notario: '3',
    distritoNotarial: 'Piedras Negras',
    fme: '2299',
  },
  rfc: 'DIE030904866',
};

// TODO(sprint-7c): mover a `dilesa.proyectos.escritura_madre` (JSONB).
// Cada proyecto tiene 1 escritura madre del terreno; los lotes derivan.
// Hoy todos los proyectos usan esta misma escritura (Lomas de los Encinos).
export const ESCRITURA_MADRE_DEFAULT = {
  numero: '303',
  fecha: '01 de Diciembre del año 2022 dos mil veintidós',
  notario: {
    nombre: 'Lic. GUILLERMO NICOLAS LOPEZ ELIZONDO',
    numeroNotaria: '25',
    ciudad: 'Piedras Negras, Coahuila',
  },
  registroPublico: {
    ciudad: 'Piedras Negras, Coahuila',
    entrada: '41982/2023',
    fecha: '27 de FEBRERO del año 2023 dos mil veintitrés',
  },
};

// TODO(sprint-7c): tabla `dilesa.venta_testigos` para capturar testigos
// por venta. Por ahora son los 2 fijos que firman todos los contratos.
export const TESTIGOS_DEFAULT = [
  { nombre: 'EDGAR DANIEL PEÑA PALOMO' },
  { nombre: 'NELCY ELIZABETH MARTÍNEZ DÍAZ' },
];

// Tribunal competente — fijo por ahora, todos los contratos DILESA.
export const TRIBUNAL_COMPETENTE = {
  distrito: 'Distrito Río Grande',
  ciudad: 'Piedras Negras, Coahuila',
};
