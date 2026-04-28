/**
 * Mapping `CsfExtraccion` (lib/proveedores/extract-csf.ts) ⇄ `core.empresas`.
 *
 * El extractor CSF se reutiliza directamente desde proveedores (decisión
 * cerrada en `docs/planning/empresas-csf-config.md`). Este módulo encapsula
 * la traducción entre el shape "neutro" del extractor y el shape de
 * `core.empresas`, que tiene nombres ligeramente distintos (ej.
 * `domicilio_num_ext` → `domicilio_numero_ext`) y formato propio de
 * `actividades_economicas` y `obligaciones_fiscales`.
 *
 * Funciones puras — no tocan DB. Las consume el endpoint en `/api/empresas`.
 */

import type { CsfExtraccion, CsfUpdatableField } from '@/lib/proveedores/extract-csf';

// ─── Shape de actividades / obligaciones en core.empresas (jsonb) ───────────

/**
 * Forma de cada elemento de `core.empresas.actividades_economicas` (jsonb).
 * Coincide con lo que se cargó manualmente para ANSA/RDB/DILESA/COAGAN al
 * inicio. Las fechas se serializan como string YYYY-MM-DD para conservar el
 * formato del SAT.
 */
export type EmpresaActividadEconomica = {
  orden: number;
  actividad: string;
  porcentaje: string;
  fecha_inicio: string;
  fecha_fin: string | null;
};

/**
 * Forma de cada elemento de `core.empresas.obligaciones_fiscales` (jsonb).
 * Compatible con el shape pre-existente: incluye `vencimiento` (texto libre
 * del SAT). El extractor no provee `vencimiento` directamente — se deja como
 * cadena vacía cuando la CSF no lo expone explícitamente; el operador puede
 * editarlo a mano si hace falta.
 */
export type EmpresaObligacionFiscal = {
  descripcion: string;
  vencimiento: string;
  fecha_inicio: string;
  fecha_fin: string | null;
};

// ─── Mapeo de keys de extracción a columnas de core.empresas ────────────────

/**
 * Para cada `CsfUpdatableField` definido por el extractor, indica cómo se
 * proyecta sobre `core.empresas`. Algunos campos no aplican a empresas (los
 * típicos de personas físicas: `nombre`, `apellido_paterno`, etc.) — esos se
 * mapean a `null` (= ignorar).
 *
 * El export sirve también a la UI del diff: la columna `column` se usa para
 * leer el valor actual de la empresa al renderizar el diff side-by-side.
 */
export type EmpresaFieldMapping = {
  /** Columna en `core.empresas`. `null` si el campo no aplica. */
  column: keyof EmpresaCsfUpdate | null;
  /** Cómo extraer el valor del shape del extractor para esa columna. */
  extract: (extraccion: CsfExtraccion) => unknown;
};

export const EMPRESA_FIELD_MAP: Record<CsfUpdatableField, EmpresaFieldMapping> = {
  // Identidad — para morales solo se lee razón social. CURP solo si es física.
  tipo_persona: { column: null, extract: () => null },
  rfc: { column: 'rfc', extract: (e) => e.rfc },
  curp: { column: 'curp', extract: (e) => e.curp },
  nombre: { column: null, extract: () => null },
  apellido_paterno: { column: null, extract: () => null },
  apellido_materno: { column: null, extract: () => null },
  razon_social: { column: 'razon_social', extract: (e) => e.razon_social },
  nombre_comercial: {
    column: 'nombre_comercial',
    extract: (e) => e.nombre_comercial,
  },

  // Régimen fiscal: empresas usa string libre derivado de
  // `regimen_fiscal_nombre`. La lista completa de regímenes adicionales no
  // se persiste a v1 (sería una columna nueva). El código y nombre del
  // régimen principal sí.
  regimen_fiscal_codigo: { column: null, extract: () => null },
  regimen_fiscal_nombre: {
    column: 'regimen_fiscal',
    extract: (e) => e.regimen_fiscal_nombre,
  },
  regimenes_adicionales: { column: null, extract: () => null },

  // Domicilio — rename de `num_ext`/`num_int` a `numero_ext`/`numero_int`.
  domicilio_calle: {
    column: 'domicilio_calle',
    extract: (e) => e.domicilio_calle,
  },
  domicilio_num_ext: {
    column: 'domicilio_numero_ext',
    extract: (e) => e.domicilio_num_ext,
  },
  domicilio_num_int: {
    column: 'domicilio_numero_int',
    extract: (e) => e.domicilio_num_int,
  },
  domicilio_colonia: {
    column: 'domicilio_colonia',
    extract: (e) => e.domicilio_colonia,
  },
  domicilio_cp: { column: 'domicilio_cp', extract: (e) => e.domicilio_cp },
  domicilio_municipio: {
    column: 'domicilio_municipio',
    extract: (e) => e.domicilio_municipio,
  },
  domicilio_estado: {
    column: 'domicilio_estado',
    extract: (e) => e.domicilio_estado,
  },

  obligaciones: {
    column: 'obligaciones_fiscales',
    extract: (e) => extractObligacionesParaEmpresa(e),
  },

  fecha_inicio_operaciones: {
    column: 'fecha_inicio_operaciones',
    extract: (e) => e.fecha_inicio_operaciones,
  },
  fecha_emision: {
    column: 'csf_fecha_emision',
    extract: (e) => e.fecha_emision,
  },
};

/**
 * Campos extra del extractor que no son `CsfUpdatableField` pero sí relevantes
 * para empresas (extendidos en Sprint 1). Se aplican siempre que estén
 * presentes en la extracción y aceptados por el operador.
 */
export const EMPRESA_EXTRA_FIELDS = [
  'id_cif',
  'estatus_sat',
  'regimen_capital',
  'actividades_economicas',
] as const;

export type EmpresaExtraField = (typeof EMPRESA_EXTRA_FIELDS)[number];

/**
 * Conjunto canónico de keys que el modal de diff puede ofrecer al operador
 * en el flujo de update. Es la unión de los `CsfUpdatableField` que sí mapean
 * a una columna real + los `EmpresaExtraField`.
 */
export const EMPRESA_DIFFABLE_FIELDS: ReadonlyArray<CsfUpdatableField | EmpresaExtraField> = [
  // CsfUpdatableField que sí aplican a empresas
  'rfc',
  'curp',
  'razon_social',
  'nombre_comercial',
  'regimen_fiscal_nombre',
  'domicilio_calle',
  'domicilio_num_ext',
  'domicilio_num_int',
  'domicilio_colonia',
  'domicilio_cp',
  'domicilio_municipio',
  'domicilio_estado',
  'obligaciones',
  'fecha_inicio_operaciones',
  'fecha_emision',
  // Extras
  'id_cif',
  'estatus_sat',
  'regimen_capital',
  'actividades_economicas',
];

// ─── Tipo de update parcial sobre core.empresas ─────────────────────────────

/**
 * Subset de columnas de `core.empresas` que pueden modificarse por el flujo
 * de CSF. Otros campos (branding, slug, activa) viven fuera de este flujo.
 */
export type EmpresaCsfUpdate = {
  rfc?: string | null;
  curp?: string | null;
  razon_social?: string | null;
  regimen_capital?: string | null;
  nombre_comercial?: string | null;
  fecha_inicio_operaciones?: string | null;
  estatus_sat?: string | null;
  id_cif?: string | null;
  regimen_fiscal?: string | null;
  domicilio_cp?: string | null;
  domicilio_calle?: string | null;
  domicilio_numero_ext?: string | null;
  domicilio_numero_int?: string | null;
  domicilio_colonia?: string | null;
  domicilio_localidad?: string | null;
  domicilio_municipio?: string | null;
  domicilio_estado?: string | null;
  actividades_economicas?: EmpresaActividadEconomica[] | null;
  obligaciones_fiscales?: EmpresaObligacionFiscal[] | null;
  csf_fecha_emision?: string | null;
};

/**
 * Tipo del INSERT inicial para `core.empresas` durante alta nueva. Toma el
 * subset CSF + los campos requeridos del alta (slug, nombre, tipo_contribuyente).
 */
export type EmpresaCsfInsert = EmpresaCsfUpdate & {
  slug: string;
  nombre: string;
  tipo_contribuyente: 'persona_moral' | 'persona_fisica';
};

// ─── Helpers internos ───────────────────────────────────────────────────────

function extractObligacionesParaEmpresa(extraccion: CsfExtraccion): EmpresaObligacionFiscal[] {
  return extraccion.obligaciones.map((o) => ({
    descripcion: o.descripcion,
    vencimiento: '', // El extractor no expone vencimiento. Operador puede editarlo a mano.
    fecha_inicio: o.fecha_inicio ?? '',
    fecha_fin: o.fecha_fin,
  }));
}

function extractActividadesParaEmpresa(extraccion: CsfExtraccion): EmpresaActividadEconomica[] {
  return extraccion.actividades_economicas.map((a) => ({
    orden: a.orden,
    actividad: a.actividad,
    porcentaje: a.porcentaje ?? '',
    fecha_inicio: a.fecha_inicio ?? '',
    fecha_fin: a.fecha_fin,
  }));
}

// ─── Builders ───────────────────────────────────────────────────────────────

/**
 * Construye el row de INSERT para `core.empresas` a partir de la extracción
 * más los campos requeridos del alta (slug, nombre, tipo_contribuyente).
 * Usado por `POST /api/empresas/create-with-csf`.
 */
export function buildEmpresaInsertFromExtraccion(args: {
  extraccion: CsfExtraccion;
  slug: string;
  nombre: string;
  tipo_contribuyente?: 'persona_moral' | 'persona_fisica';
}): EmpresaCsfInsert {
  const { extraccion, slug, nombre, tipo_contribuyente } = args;
  const tipoContribuyente =
    tipo_contribuyente ??
    (extraccion.tipo_persona === 'fisica' ? 'persona_fisica' : 'persona_moral');

  return {
    slug,
    nombre,
    tipo_contribuyente: tipoContribuyente,
    rfc: extraccion.rfc.trim().toUpperCase(),
    curp: extraccion.curp,
    razon_social: extraccion.razon_social,
    regimen_capital: extraccion.regimen_capital,
    nombre_comercial: extraccion.nombre_comercial,
    fecha_inicio_operaciones: extraccion.fecha_inicio_operaciones,
    estatus_sat: extraccion.estatus_sat,
    id_cif: extraccion.id_cif,
    regimen_fiscal: extraccion.regimen_fiscal_nombre,
    domicilio_cp: extraccion.domicilio_cp,
    domicilio_calle: extraccion.domicilio_calle,
    domicilio_numero_ext: extraccion.domicilio_num_ext,
    domicilio_numero_int: extraccion.domicilio_num_int,
    domicilio_colonia: extraccion.domicilio_colonia,
    domicilio_municipio: extraccion.domicilio_municipio,
    domicilio_estado: extraccion.domicilio_estado,
    actividades_economicas: extractActividadesParaEmpresa(extraccion),
    obligaciones_fiscales: extractObligacionesParaEmpresa(extraccion),
    csf_fecha_emision: extraccion.fecha_emision,
  };
}

/**
 * Construye el patch para UPDATE sobre `core.empresas` a partir de los campos
 * aceptados por el operador. Se aplica selectivamente — solo los campos
 * presentes en `accepted_fields`.
 *
 * Acepta tanto keys de `CsfUpdatableField` (provienen del extractor neutro)
 * como `EmpresaExtraField` (extras específicos de empresa). Si la lista está
 * vacía, devuelve un objeto vacío — el caller decide qué hacer (típicamente
 * solo archiva el PDF y termina).
 */
export function buildEmpresaUpdateFromAccepted(args: {
  extraccion: CsfExtraccion;
  accepted: ReadonlyArray<CsfUpdatableField | EmpresaExtraField>;
}): EmpresaCsfUpdate {
  const { extraccion, accepted } = args;
  const update: EmpresaCsfUpdate = {};

  for (const key of accepted) {
    // Extras específicos de empresa
    if (key === 'id_cif') {
      update.id_cif = extraccion.id_cif;
      continue;
    }
    if (key === 'estatus_sat') {
      update.estatus_sat = extraccion.estatus_sat;
      continue;
    }
    if (key === 'regimen_capital') {
      update.regimen_capital = extraccion.regimen_capital;
      continue;
    }
    if (key === 'actividades_economicas') {
      update.actividades_economicas = extractActividadesParaEmpresa(extraccion);
      continue;
    }

    // Campos del extractor neutro
    const mapping = EMPRESA_FIELD_MAP[key];
    if (!mapping || !mapping.column) continue;
    const value = mapping.extract(extraccion);
    (update as Record<string, unknown>)[mapping.column] = value;
  }

  // Normalizaciones finales
  if (typeof update.rfc === 'string') {
    update.rfc = update.rfc.trim().toUpperCase();
  }

  return update;
}
