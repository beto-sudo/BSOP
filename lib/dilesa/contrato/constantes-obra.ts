/**
 * Constantes hardcoded para el Contrato de Servicios a Precios Unitarios
 * y Tiempo Determinado (contrato de obra DILESA ↔ contratista).
 *
 * ⚠️ OJO: estos datos NO coinciden con los del Contrato de Promesa de
 * Compraventa (ver `constantes.ts`). En el contrato de obra:
 *   - El representante de DILESA es ADALBERTO SANTOS DE LOS SANTOS
 *     (en compraventa firma Norberto Gutiérrez Infante).
 *   - La escritura constitutiva citada es la 177 (compraventa cita la 167).
 * Se replican tal cual del documento vivo en Coda (canvas-KMlO5KM81i,
 * "Contrato de Construcción", último generado). Si hay que reconciliar
 * cuál escritura/representante es el vigente, es decisión legal de Beto.
 *
 * TODO(post-v1): mover EL_CLIENTE_OBRA a columnas de `core.empresas`
 * (representante_legal_obra, escritura_*) cuando se modele el
 * representante por tipo de contrato.
 */

/** "EL CLIENTE" — DILESA, parte contratante en el contrato de obra. */
export const EL_CLIENTE_OBRA = {
  razonSocial: 'DESARROLLO INMOBILIARIO LOS ENCINOS S.A. DE C.V.',
  representante: 'ADALBERTO SANTOS DE LOS SANTOS',
  rfc: 'DIE030904866',
  // Escritura constitutiva de la sociedad
  escrituraConstitutiva: {
    numero: '177',
    libro: '31',
    volumen: 'X',
    notario: 'Lic. Raúl P. García Elizondo',
    numeroNotaria: '16',
    ciudad: 'Saltillo, Coahuila',
  },
  // Escritura que acredita el poder del representante legal
  poderRepresentante: {
    numero: '72',
    notario: 'Lic. Jesús Mario Flores Farías',
    numeroNotaria: '10',
    ciudad: 'Piedras Negras, Coahuila',
  },
  domicilio:
    'Magnolias Núm. 2440 Lomas del Valle Residencial, C.P. 26093, Piedras Negras, Coahuila',
  // Almacén de materiales (cláusula SEXTA)
  almacen:
    'Libramiento Venustiano Carranza 2567, Fraccionamiento Lomas de la Villa, Piedras Negras, Coahuila',
  emailCompras: 'compras@dilesa.mx',
} as const;

/** Parámetros económicos/operativos fijos del contrato de obra. */
export const PARAMETROS_OBRA = {
  /** % de cada estimación retenido como fondo de garantía (cláusula SÉPTIMA b). */
  retencionFondoGarantiaPct: 5,
  /** Pena convencional diaria por atraso, en % (cláusula DÉCIMA QUINTA a). */
  penaConvencionalDiariaPct: 0.1,
  /** Días naturales para iniciar tras la firma (cláusula OCTAVA a). */
  diasNaturalesParaIniciar: 15,
  /** % de avance mínimo de efectividad para arranques subsecuentes (cláusula OCTAVA a). */
  efectividadMinimaPct: 80,
  /** Días naturales de anticipación para solicitar material (cláusula SEXTA). */
  diasAnticipacionMaterial: 7,
  /** Tope de penas acumuladas que dispara rescisión, en % del contrato (cláusula DÉCIMA QUINTA a). */
  topePenasRescisionPct: 10,
} as const;

/** Jurisdicción competente (cláusula DÉCIMA SÉPTIMA). */
export const JURISDICCION_OBRA = {
  estado: 'Coahuila',
  ciudad: 'Piedras Negras, Coahuila',
} as const;

/**
 * Testigos fijos que firman los contratos de obra.
 * TODO(post-v1): tabla `dilesa.contrato_testigos` si llegan a variar.
 */
export const TESTIGOS_OBRA = [
  { nombre: 'ARQ. FRANCISCO ALEJANDRO RIVERA BARRERA' },
  { nombre: 'LIC. NELCY ELIZABETH MARTÍNEZ DÍAZ' },
] as const;
