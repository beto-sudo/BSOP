/**
 * Configuración de los campos del form de alta/edición de activos del portafolio
 * (iniciativa `dilesa-portafolio-expediente`). Vive en `.ts` plano porque lo
 * consumen el client component (`<ActivoCaptureDrawer>`) y se usa para construir
 * los jsonb que reciben las RPCs `fn_alta_activo`/`fn_actualizar_activo`.
 *
 * El master es común a todos los tipos; cada tipo agrega los campos de su
 * satélite. Hoy hay form rico para terreno/espectacular/lote/local; los demás
 * tipos se crean con solo el master (su satélite queda mínimo, editable después).
 */

export type ActivoFieldType = 'text' | 'number' | 'textarea' | 'checkbox' | 'select' | 'date';

export type ActivoFieldDef = {
  key: string;
  label: string;
  type: ActivoFieldType;
  options?: readonly { value: string; label: string }[];
  placeholder?: string;
  /** Agrupa el campo en una sección del form. */
  section: string;
};

export const TIPOS_ACTIVO = [
  { value: 'terreno', label: 'Terreno' },
  { value: 'espectacular', label: 'Espectacular' },
  { value: 'lote', label: 'Lote' },
  { value: 'local', label: 'Local' },
  { value: 'casa', label: 'Casa' },
  { value: 'departamento', label: 'Departamento' },
  { value: 'edificio', label: 'Edificio' },
  { value: 'nave', label: 'Nave industrial' },
  { value: 'plaza', label: 'Plaza' },
  { value: 'unipolar', label: 'Unipolar' },
  { value: 'infraestructura', label: 'Infraestructura' },
] as const;

export const ESTADOS_ACTIVO = [
  { value: 'prospecto', label: 'Prospecto (en evaluación)' },
  { value: 'adquirido', label: 'Adquirido' },
  { value: 'operando', label: 'Operando' },
  { value: 'en_intervencion', label: 'En intervención' },
  { value: 'desincorporado', label: 'Desincorporado' },
  { value: 'descartado', label: 'Descartado' },
] as const;

/** Campos del master `dilesa.activos`, comunes a todo tipo. */
export const MASTER_FIELDS: readonly ActivoFieldDef[] = [
  { key: 'nombre', label: 'Nombre', type: 'text', section: 'Identificación' },
  {
    key: 'estado',
    label: 'Estado',
    type: 'select',
    options: ESTADOS_ACTIVO,
    section: 'Identificación',
  },
  { key: 'clave_interna', label: 'Clave interna', type: 'text', section: 'Identificación' },
  {
    key: 'etiqueta',
    label: 'Etiqueta / identificador',
    type: 'text',
    placeholder: 'p.ej. Demo Prototipo A, Renta COINS',
    section: 'Identificación',
  },
  {
    key: 'zona',
    label: 'Zona / fraccionamiento',
    type: 'text',
    placeholder: 'p.ej. Lomas del Sol',
    section: 'Ubicación',
  },
  { key: 'municipio', label: 'Municipio', type: 'text', section: 'Ubicación' },
  { key: 'estado_geo', label: 'Estado', type: 'text', section: 'Ubicación' },
  {
    key: 'direccion_referencia',
    label: 'Dirección / referencia',
    type: 'text',
    section: 'Ubicación',
  },
  { key: 'latitud', label: 'Latitud', type: 'number', section: 'Ubicación' },
  { key: 'longitud', label: 'Longitud', type: 'number', section: 'Ubicación' },
  { key: 'area_m2', label: 'Área (m²)', type: 'number', section: 'Valor y situación legal' },
  {
    key: 'valor_estimado',
    label: 'Valor estimado (MXN)',
    type: 'number',
    section: 'Valor y situación legal',
  },
  {
    key: 'situacion_legal',
    label: 'Situación legal',
    type: 'text',
    section: 'Valor y situación legal',
  },
  {
    key: 'numero_escritura',
    label: 'Número de escritura',
    type: 'text',
    section: 'Valor y situación legal',
  },
  {
    key: 'clave_catastral',
    label: 'Clave catastral',
    type: 'text',
    section: 'Valor y situación legal',
  },
  { key: 'notas', label: 'Notas', type: 'textarea', section: 'Notas' },
];

/** Campos del satélite por tipo. Tipos sin entrada → solo master. */
export const SATELITE_FIELDS: Record<string, readonly ActivoFieldDef[]> = {
  terreno: [
    { key: 'uso_suelo', label: 'Uso de suelo', type: 'text', section: 'Terreno' },
    { key: 'zonificacion', label: 'Zonificación', type: 'text', section: 'Terreno' },
    { key: 'tipo_terreno', label: 'Tipo de terreno', type: 'text', section: 'Terreno' },
    {
      key: 'areas_afectacion_m2',
      label: 'Áreas de afectación (m²)',
      type: 'number',
      section: 'Terreno',
    },
    {
      key: 'factibilidad_agua',
      label: 'Factibilidad de agua',
      type: 'checkbox',
      section: 'Factibilidades',
    },
    {
      key: 'factibilidad_drenaje',
      label: 'Factibilidad de drenaje',
      type: 'checkbox',
      section: 'Factibilidades',
    },
    {
      key: 'factibilidad_electricidad',
      label: 'Factibilidad de electricidad',
      type: 'checkbox',
      section: 'Factibilidades',
    },
    {
      key: 'factibilidad_vialidad',
      label: 'Factibilidad de vialidad',
      type: 'checkbox',
      section: 'Factibilidades',
    },
    { key: 'objetivo', label: 'Objetivo', type: 'text', section: 'Evaluación de compra' },
    { key: 'zona_sector', label: 'Zona / sector', type: 'text', section: 'Evaluación de compra' },
    {
      key: 'propietario_nombre',
      label: 'Propietario',
      type: 'text',
      section: 'Evaluación de compra',
    },
    {
      key: 'propietario_telefono',
      label: 'Tel. propietario',
      type: 'text',
      section: 'Evaluación de compra',
    },
    { key: 'corredor_nombre', label: 'Corredor', type: 'text', section: 'Evaluación de compra' },
    {
      key: 'corredor_telefono',
      label: 'Tel. corredor',
      type: 'text',
      section: 'Evaluación de compra',
    },
    {
      key: 'precio_solicitado_m2',
      label: 'Precio solicitado / m²',
      type: 'number',
      section: 'Evaluación de compra',
    },
    {
      key: 'precio_ofertado_m2',
      label: 'Precio ofertado / m²',
      type: 'number',
      section: 'Evaluación de compra',
    },
    {
      key: 'valor_objetivo_compra',
      label: 'Valor objetivo de compra',
      type: 'number',
      section: 'Evaluación de compra',
    },
    { key: 'origen', label: 'Origen', type: 'text', section: 'Evaluación de compra' },
    {
      key: 'estatus_propiedad',
      label: 'Estatus de propiedad',
      type: 'text',
      section: 'Evaluación de compra',
    },
    { key: 'etapa', label: 'Etapa', type: 'text', section: 'Evaluación de compra' },
    { key: 'prioridad', label: 'Prioridad', type: 'text', section: 'Evaluación de compra' },
    { key: 'responsable', label: 'Responsable', type: 'text', section: 'Evaluación de compra' },
    {
      key: 'siguiente_accion',
      label: 'Siguiente acción',
      type: 'text',
      section: 'Evaluación de compra',
    },
  ],
  espectacular: [
    { key: 'vialidad', label: 'Vialidad / ubicación', type: 'text', section: 'Espectacular' },
    { key: 'caras', label: 'Número de caras', type: 'number', section: 'Espectacular' },
    { key: 'orientacion', label: 'Orientación', type: 'text', section: 'Espectacular' },
    { key: 'ancho_m', label: 'Ancho (m)', type: 'number', section: 'Espectacular' },
    { key: 'alto_m', label: 'Alto (m)', type: 'number', section: 'Espectacular' },
    { key: 'iluminado', label: 'Iluminado', type: 'checkbox', section: 'Espectacular' },
    {
      key: 'trafico_estimado_diario',
      label: 'Tráfico estimado diario',
      type: 'number',
      section: 'Espectacular',
    },
    { key: 'anunciante_actual', label: 'Anunciante actual', type: 'text', section: 'Espectacular' },
    { key: 'renta_mensual', label: 'Renta mensual (MXN)', type: 'number', section: 'Espectacular' },
  ],
  lote: [
    { key: 'manzana', label: 'Manzana', type: 'text', section: 'Lote' },
    { key: 'numero_lote', label: 'Número de lote', type: 'text', section: 'Lote' },
    { key: 'condicion', label: 'Condición', type: 'text', section: 'Lote' },
    { key: 'frente_m', label: 'Frente (m)', type: 'number', section: 'Lote' },
    { key: 'fondo_m', label: 'Fondo (m)', type: 'number', section: 'Lote' },
  ],
  local: [
    { key: 'm2_rentable', label: 'm² rentable', type: 'number', section: 'Local' },
    { key: 'frente_m', label: 'Frente (m)', type: 'number', section: 'Local' },
    { key: 'planta', label: 'Planta', type: 'text', section: 'Local' },
    { key: 'giro_permitido', label: 'Giro permitido', type: 'text', section: 'Local' },
    { key: 'banos', label: 'Baños', type: 'number', section: 'Local' },
    { key: 'tiene_bodega', label: 'Tiene bodega', type: 'checkbox', section: 'Local' },
    { key: 'estado_obra', label: 'Estado de obra', type: 'text', section: 'Local' },
  ],
};

export function getSateliteFields(tipo: string): readonly ActivoFieldDef[] {
  return SATELITE_FIELDS[tipo] ?? [];
}

/** Agrupa una lista de campos por su `section`, preservando el orden de aparición. */
export function groupBySection(fields: readonly ActivoFieldDef[]): [string, ActivoFieldDef[]][] {
  const map = new Map<string, ActivoFieldDef[]>();
  for (const f of fields) {
    const arr = map.get(f.section) ?? [];
    arr.push(f);
    map.set(f.section, arr);
  }
  return [...map.entries()];
}
