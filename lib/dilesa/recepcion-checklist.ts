/**
 * Catálogo del checklist de RECEPCIÓN DE OBRA al contratista (DILESA).
 *
 * Digitaliza el formato en papel "CHECK LIST PRE-ENTREGA VIVIENDA" de DILESA
 * (Atención a Clientes / EVAP recibe la unidad al contratista). Organizado por
 * ubicación física para el recorrido. Plano TS (sin React) para poder importarse
 * desde server actions, el drawer cliente y futuros PDF/reportes.
 *
 * Las respuestas se persisten como snapshot inmutable en
 * `dilesa.recepcion_obra.checklist` (jsonb) — ver migración 20260616020032.
 * La identidad de cada ítem es su `clave` (estable); la `etiqueta` puede
 * reescribirse sin perder histórico.
 *
 * Iniciativa dilesa-atencion-clientes (Sprint 1, S1b).
 */

/** Label humano canónico de la marca `dilesa.tareas_construccion.hito_recepcion`. */
export const HITO_RECEPCION_LABEL: Record<string, string> = {
  checklist: 'Checklist de Recepción a Contratista',
  recepcion_final: 'Control de Calidad — Recepción de Vivienda Terminada',
};

export type RecepcionChecklistItem = {
  /** Clave estable (sobrevive a cambios de etiqueta). */
  clave: string;
  etiqueta: string;
};

export type RecepcionChecklistSeccion = {
  clave: string;
  titulo: string;
  /** Si la sección puede no aplicar (ej. Planta Alta en prototipos de 1 planta). */
  opcional?: boolean;
  items: readonly RecepcionChecklistItem[];
};

/** Estado por ítem en el recorrido de recepción. */
export type RecepcionItemEstado = 'cumple' | 'observacion' | 'na';

/** Forma de cada respuesta persistida en `recepcion_obra.checklist`. */
export type RecepcionChecklistRespuesta = {
  clave: string;
  estado: RecepcionItemEstado;
  /** Observación o ubicación del daño (texto libre del formato original). */
  nota?: string;
};

export const RECEPCION_ITEM_ESTADO_LABEL: Record<RecepcionItemEstado, string> = {
  cumple: 'Cumple',
  observacion: 'Con observación',
  na: 'No aplica',
};

export const RECEPCION_CHECKLIST: readonly RecepcionChecklistSeccion[] = [
  {
    clave: 'exterior',
    titulo: 'Exterior',
    items: [
      { clave: 'ext_banqueta', etiqueta: 'Banqueta, zinc, accesos libres sin daño' },
      { clave: 'ext_acometida', etiqueta: 'Acometida eléctrica, pruebas y número oficial' },
      { clave: 'ext_toma_agua', etiqueta: 'Toma de agua domiciliaria y pruebas' },
      { clave: 'ext_muros', etiqueta: 'Muros sin daño' },
      { clave: 'ext_pintura', etiqueta: 'Pintura exterior uniforme' },
      { clave: 'ext_sellado', etiqueta: 'Sellado exterior en ventanas' },
      { clave: 'ext_cristales', etiqueta: 'Cristales de ventanas limpios' },
      {
        clave: 'ext_impermeabilizacion',
        etiqueta: 'Impermeabilización sin marcas ni humedad y/o insulación',
      },
      { clave: 'ext_limpieza', etiqueta: 'Limpieza exterior' },
    ],
  },
  {
    clave: 'interior_pb',
    titulo: 'Interior · Planta Baja',
    items: [
      { clave: 'pb_puertas', etiqueta: 'Funcionamiento de puertas y chapas' },
      { clave: 'pb_yeso_muros', etiqueta: 'Acabado de interiores y de yeso en muros' },
      { clave: 'pb_yeso_cielos', etiqueta: 'Acabado de interiores y de yeso en cielos' },
      { clave: 'pb_pintura_marcos', etiqueta: 'Pintura en marcos' },
      { clave: 'pb_zoclos', etiqueta: 'Colocación de zoclos y boquilla' },
      { clave: 'pb_pisos', etiqueta: 'Pisos cerámicos y boquilla' },
      { clave: 'pb_centro_carga', etiqueta: "Centro de carga y break's" },
      { clave: 'pb_contactos', etiqueta: 'Rosetas, contactos y apagadores' },
      { clave: 'pb_sanitario', etiqueta: 'Equipamiento sanitario con accesorios y pruebas' },
      { clave: 'pb_lavabos', etiqueta: 'Lavabos, llaves y accesorios (pruebas)' },
      { clave: 'pb_regadera', etiqueta: 'Regadera, coladera y accesorios (pruebas)' },
      { clave: 'pb_canceleria', etiqueta: 'Cancelería y protecciones de ventanas' },
      { clave: 'pb_limpieza', etiqueta: 'Limpieza interior' },
    ],
  },
  {
    clave: 'interior_pa',
    titulo: 'Interior · Planta Alta',
    opcional: true,
    items: [
      { clave: 'pa_puertas', etiqueta: 'Funcionamiento de puertas y chapas' },
      { clave: 'pa_yeso_muros', etiqueta: 'Acabado de interiores y de yeso en muros' },
      { clave: 'pa_yeso_cielos', etiqueta: 'Acabado de interiores y de yeso en cielos' },
      { clave: 'pa_pintura_marcos', etiqueta: 'Pintura en marcos' },
      { clave: 'pa_zoclos', etiqueta: 'Colocación de zoclos y boquilla' },
      { clave: 'pa_pisos', etiqueta: 'Pisos cerámicos y boquilla' },
      { clave: 'pa_centro_carga', etiqueta: "Centro de carga y break's" },
      { clave: 'pa_contactos', etiqueta: 'Rosetas, contactos y apagadores' },
      { clave: 'pa_lavadora', etiqueta: 'Revisión de preparación de lavadora con pruebas' },
      { clave: 'pa_sanitario', etiqueta: 'Equipamiento sanitario con accesorios y pruebas' },
      { clave: 'pa_lavabos', etiqueta: 'Lavabos, llaves y accesorios (pruebas)' },
      { clave: 'pa_regadera', etiqueta: 'Regadera, coladera y accesorios (pruebas)' },
      { clave: 'pa_canceleria', etiqueta: 'Cancelería y protecciones de ventanas' },
      { clave: 'pa_limpieza', etiqueta: 'Limpieza interior' },
    ],
  },
  {
    clave: 'azotea',
    titulo: 'Planta Azotea',
    items: [
      { clave: 'azt_pretiles', etiqueta: 'Pretiles, diamantes, base de tinaco' },
      { clave: 'azt_tinaco', etiqueta: 'Tinaco, accesorios y pruebas' },
      {
        clave: 'azt_impermeabilizacion',
        etiqueta: 'Insulación y/o impermeabilización en azotea con acabado',
      },
      { clave: 'azt_flashing', etiqueta: 'Flashing, filetes y pintura' },
    ],
  },
  {
    clave: 'patio_servicio',
    titulo: 'Patio de servicio o exterior',
    items: [
      { clave: 'pat_lavadero', etiqueta: 'Lavadero con tomas' },
      { clave: 'pat_boiler', etiqueta: 'Preparación de boiler con pruebas' },
      { clave: 'pat_gas', etiqueta: 'Tubería de gas con pruebas' },
      { clave: 'pat_rosetas_ext', etiqueta: 'Rosetas exteriores y pruebas eléctricas' },
      { clave: 'pat_hidrosanitarias', etiqueta: 'Pruebas hidrosanitarias a municipal' },
    ],
  },
] as const;

/** Total de ítems no opcionales (para el contador de avance del recorrido). */
export const RECEPCION_CHECKLIST_TOTAL_ITEMS = RECEPCION_CHECKLIST.reduce(
  (acc, s) => acc + s.items.length,
  0
);
