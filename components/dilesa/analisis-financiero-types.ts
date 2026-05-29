/**
 * Tipos y constantes del análisis financiero de anteproyectos DILESA
 * (Sprint 4B). Vive fuera de `'use server'` porque las server actions
 * solo pueden exportar funciones async (no const/type).
 *
 * Convención de naming en `dilesa.proyectos`:
 *   - `*_referencia` = valor del proyecto comparable histórico
 *   - `*_proyecto`   = valor estimado del proyecto actual
 *   - columnas existentes sin sufijo (`costo_urbanizacion`,
 *     `costo_construccion`, `costo_comercializacion`, `costo_mo`,
 *     `costo_terreno`) representan implícitamente el lado proyecto.
 */

export const ANALISIS_NUMERIC_FIELDS = [
  'valor_comercial_referencia',
  'valor_comercial_proyecto',
  'costo_urbanizacion_referencia',
  'costo_urbanizacion',
  'costo_materiales_referencia',
  'costo_materiales_proyecto',
  'costo_mo_referencia',
  'costo_mo',
  'registro_ruv_referencia',
  'registro_ruv_proyecto',
  'seguro_calidad_referencia',
  'seguro_calidad_proyecto',
  'costo_comercializacion_referencia',
  'costo_comercializacion',
  'costo_terreno',
  'valor_predio',
  'presupuesto_estimado',
  'area_m2',
  'area_vendible_m2',
  'areas_verdes_m2',
  'area_vialidades_m2',
  'tamano_lote_promedio',
] as const;

export type AnalisisNumericField = (typeof ANALISIS_NUMERIC_FIELDS)[number];

export const ANALISIS_INT_FIELDS = ['lotes_proyectados'] as const;
export type AnalisisIntField = (typeof ANALISIS_INT_FIELDS)[number];

export type AnalisisCampo = AnalisisNumericField | AnalisisIntField;

/**
 * Filas del comparativo Referencia vs Proyecto. El orden importa —
 * matchea la vista Coda. `proyecto` siendo string mapea a una
 * columna sin sufijo (ej. `costo_urbanizacion`).
 */
export const ANALISIS_FILAS_COSTOS: ReadonlyArray<{
  label: string;
  referencia: AnalisisNumericField;
  proyecto: AnalisisNumericField;
}> = [
  {
    label: 'Valor comercial',
    referencia: 'valor_comercial_referencia',
    proyecto: 'valor_comercial_proyecto',
  },
  {
    label: 'Urbanización',
    referencia: 'costo_urbanizacion_referencia',
    proyecto: 'costo_urbanizacion',
  },
  {
    label: 'Materiales',
    referencia: 'costo_materiales_referencia',
    proyecto: 'costo_materiales_proyecto',
  },
  { label: 'Mano de obra', referencia: 'costo_mo_referencia', proyecto: 'costo_mo' },
  {
    label: 'Registro RUV',
    referencia: 'registro_ruv_referencia',
    proyecto: 'registro_ruv_proyecto',
  },
  {
    label: 'Seguro de calidad',
    referencia: 'seguro_calidad_referencia',
    proyecto: 'seguro_calidad_proyecto',
  },
  {
    label: 'Comercialización',
    referencia: 'costo_comercializacion_referencia',
    proyecto: 'costo_comercializacion',
  },
];

/**
 * Snapshot mínimo de columnas que el componente necesita. Subset de
 * `dilesa.proyectos`. Lo expone el componente padre vía prop.
 */
export type AnalisisFinancieroSnapshot = {
  id: string;
  // Ficha física
  area_m2: number | null;
  area_vendible_m2: number | null;
  areas_verdes_m2: number | null;
  area_vialidades_m2: number | null;
  lotes_proyectados: number | null;
  tamano_lote_promedio: number | null;
  clasificacion_inmobiliaria: string | null;
  // Capital
  costo_terreno: number | null;
  valor_predio: number | null;
  infraestructura_cabecera_necesaria: boolean;
  prototipos_referencia: string[];
  presupuesto_estimado: number | null;
  // Comparativo Referencia
  valor_comercial_referencia: number | null;
  costo_urbanizacion_referencia: number | null;
  costo_materiales_referencia: number | null;
  costo_mo_referencia: number | null;
  registro_ruv_referencia: number | null;
  seguro_calidad_referencia: number | null;
  costo_comercializacion_referencia: number | null;
  // Comparativo Proyecto (algunos reutilizan columnas sin sufijo)
  valor_comercial_proyecto: number | null;
  costo_urbanizacion: number | null;
  costo_materiales_proyecto: number | null;
  costo_mo: number | null;
  registro_ruv_proyecto: number | null;
  seguro_calidad_proyecto: number | null;
  costo_comercializacion: number | null;
};

/**
 * Derivados client-side: aprovechamiento, % verdes, costo total
 * referencia, costo total proyecto, margen utilidad, utilidad
 * proyecto, precio por m² aprovechable. Exportado para reuso en
 * tests + PDF (Sprint 4C).
 */
export type AnalisisDerivados = {
  aprovechamiento: number | null;
  pctVerdes: number | null;
  precioM2Aprovechable: number | null;
  costoTotalReferencia: number | null;
  costoTotalProyecto: number | null;
  delta: number | null;
  margenUtilidad: number | null;
  utilidadProyecto: number | null;
};

const SUM = (...xs: Array<number | null | undefined>) => {
  let any = false;
  let acc = 0;
  for (const x of xs) {
    if (x != null && Number.isFinite(x)) {
      acc += x;
      any = true;
    }
  }
  return any ? acc : null;
};

export function deriveAnalisisFinanciero(s: AnalisisFinancieroSnapshot): AnalisisDerivados {
  const aprovechamiento = s.area_m2 && s.area_vendible_m2 ? s.area_vendible_m2 / s.area_m2 : null;
  const pctVerdes = s.area_m2 && s.areas_verdes_m2 ? s.areas_verdes_m2 / s.area_m2 : null;

  const baseTerreno = s.valor_predio ?? s.costo_terreno;
  const precioM2Aprovechable =
    baseTerreno != null && s.area_vendible_m2 && s.area_vendible_m2 > 0
      ? baseTerreno / s.area_vendible_m2
      : null;

  const costoTotalReferencia = SUM(
    s.costo_urbanizacion_referencia,
    s.costo_materiales_referencia,
    s.costo_mo_referencia,
    s.registro_ruv_referencia,
    s.seguro_calidad_referencia,
    s.costo_comercializacion_referencia
  );

  const costoTotalProyecto = SUM(
    s.costo_urbanizacion,
    s.costo_materiales_proyecto,
    s.costo_mo,
    s.registro_ruv_proyecto,
    s.seguro_calidad_proyecto,
    s.costo_comercializacion
  );

  const delta =
    costoTotalReferencia != null && costoTotalProyecto != null
      ? costoTotalProyecto - costoTotalReferencia
      : null;

  // Utilidad proyecto = valor comercial proyecto - (costo total
  // proyecto + costo terreno/valor predio). Si falta input, null.
  const inversionTotal = SUM(costoTotalProyecto, baseTerreno);
  const utilidadProyecto =
    s.valor_comercial_proyecto != null && inversionTotal != null
      ? s.valor_comercial_proyecto - inversionTotal
      : null;
  const margenUtilidad =
    utilidadProyecto != null && s.valor_comercial_proyecto && s.valor_comercial_proyecto > 0
      ? utilidadProyecto / s.valor_comercial_proyecto
      : null;

  return {
    aprovechamiento,
    pctVerdes,
    precioM2Aprovechable,
    costoTotalReferencia,
    costoTotalProyecto,
    delta,
    margenUtilidad,
    utilidadProyecto,
  };
}
