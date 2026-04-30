/**
 * salario-minimo-zona.ts
 *
 * Devuelve el salario mínimo diario aplicable según la zona geográfica
 * (Zona Libre de Frontera Norte vs. resto del país) y el año vigente.
 *
 * Fuente: CONASAMI (Comisión Nacional de los Salarios Mínimos).
 *
 *   - General (resto del país): $248.93/día (valor que ya usaba el
 *     comentario en `<EmpleadoFiniquitoModule>` previo a este helper).
 *   - Zona Libre Frontera Norte (43 municipios fronterizos):
 *     $374.89/día (valor que ya usaba `SALARIO_MINIMO_DIARIO_ZLFN_2026`
 *     antes de este helper).
 *
 * ⚠️  Estos valores se mantienen idénticos a los del código previo
 * para NO introducir cambios silenciosos en el cálculo de finiquitos.
 * Si cambia la resolución de CONASAMI, actualizar
 * `SALARIO_MINIMO_POR_ANIO` en un PR explícito de constantes.
 *
 * El helper expone una API estable para que `<EmpleadoFiniquitoModule>`
 * arranque con el SM correcto según el municipio fiscal de la empresa
 * (`core.empresas.domicilio_municipio` / `domicilio_estado`).
 *
 * NOTA: Si en el futuro la empresa lo necesita custom (ej. ANSA/COAGAN
 * en municipio fuera de la lista canónica), el campo en el panel sigue
 * siendo editable — el helper sólo provee el default. Por eso no se
 * mueve a tabla en DB todavía (ver decisiones registradas en
 * `docs/planning/finiquito-mejoras.md`).
 */

export type ZonaSalarioMinimo = 'frontera' | 'general';

export interface SalarioMinimoResult {
  valor: number;
  zona: ZonaSalarioMinimo;
  anio: number;
  fuente: string;
}

/**
 * Tabla de salarios mínimos diarios por año.
 * Mantener ordenada por año descendente para que el lookup encuentre
 * primero el más reciente. Agregar entrada nueva cada enero.
 */
const SALARIO_MINIMO_POR_ANIO: Record<number, { general: number; frontera: number }> = {
  2026: { general: 248.93, frontera: 374.89 },
};

const ANIO_DEFAULT = 2026;

/**
 * Lista canónica de municipios que conforman la Zona Libre de Frontera
 * Norte según el decreto vigente (43 municipios en 6 estados). Se compara
 * en mayúsculas, sin acentos, sin trim, para tolerar variantes
 * ortográficas en `core.empresas.domicilio_municipio`.
 */
const MUNICIPIOS_ZLFN_RAW: Record<string, string[]> = {
  'BAJA CALIFORNIA': [
    'Ensenada',
    'Mexicali',
    'Playas de Rosarito',
    'Tecate',
    'Tijuana',
    'San Quintin',
    'San Felipe',
  ],
  SONORA: [
    'San Luis Rio Colorado',
    'Puerto Penasco',
    'General Plutarco Elias Calles',
    'Caborca',
    'Altar',
    'Saric',
    'Nogales',
    'Santa Cruz',
    'Cananea',
    'Naco',
    'Agua Prieta',
  ],
  CHIHUAHUA: [
    'Janos',
    'Ascension',
    'Juarez',
    'Praxedis G. Guerrero',
    'Guadalupe',
    'Coyame del Sotol',
    'Ojinaga',
    'Manuel Benavides',
  ],
  COAHUILA: [
    'Ocampo',
    'Acuna',
    'Zaragoza',
    'Jimenez',
    'Piedras Negras',
    'Nava',
    'Guerrero',
    'Hidalgo',
  ],
  'NUEVO LEON': ['Anahuac'],
  TAMAULIPAS: [
    'Nuevo Laredo',
    'Guerrero',
    'Mier',
    'Miguel Aleman',
    'Camargo',
    'Gustavo Diaz Ordaz',
    'Reynosa',
    'Rio Bravo',
    'Valle Hermoso',
    'Matamoros',
  ],
};

/** Normaliza string para comparación: uppercase, sin acentos, sin espacios. */
function normalize(s: string | null | undefined): string {
  if (!s) return '';
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

const ZLFN_INDEX: Set<string> = (() => {
  const idx = new Set<string>();
  for (const [estado, municipios] of Object.entries(MUNICIPIOS_ZLFN_RAW)) {
    const eNorm = normalize(estado);
    for (const m of municipios) {
      idx.add(`${eNorm}|${normalize(m)}`);
    }
  }
  return idx;
})();

/**
 * Devuelve true si el municipio + estado están dentro de la Zona Libre
 * de Frontera Norte. Tolera variantes ortográficas básicas (acentos,
 * mayúsculas, espacios).
 */
export function esMunicipioFrontera(
  municipio: string | null | undefined,
  estado: string | null | undefined
): boolean {
  const mNorm = normalize(municipio);
  const eNorm = normalize(estado);
  if (!mNorm || !eNorm) return false;
  return ZLFN_INDEX.has(`${eNorm}|${mNorm}`);
}

export interface GetSalarioMinimoZonaInput {
  municipio: string | null | undefined;
  estado: string | null | undefined;
  anio?: number;
}

/**
 * Devuelve el salario mínimo diario aplicable según la ubicación fiscal
 * de la empresa y el año (default = año en curso o el más reciente
 * conocido en la tabla).
 *
 * Si no se puede determinar la zona (datos faltantes), asume "general"
 * — más conservador para el cálculo de la prima de antigüedad (un tope
 * más bajo no incrementa indebidamente el monto).
 */
export function getSalarioMinimoZona(input: GetSalarioMinimoZonaInput): SalarioMinimoResult {
  const anio = input.anio ?? ANIO_DEFAULT;
  const tabla = SALARIO_MINIMO_POR_ANIO[anio] ?? SALARIO_MINIMO_POR_ANIO[ANIO_DEFAULT];

  const esFrontera = esMunicipioFrontera(input.municipio, input.estado);
  const zona: ZonaSalarioMinimo = esFrontera ? 'frontera' : 'general';
  const valor = esFrontera ? tabla.frontera : tabla.general;

  return {
    valor,
    zona,
    anio,
    fuente: `CONASAMI ${anio}`,
  };
}

/** Etiqueta humana para mostrar en UI. */
export function labelZona(zona: ZonaSalarioMinimo): string {
  return zona === 'frontera' ? 'Zona Libre Frontera Norte' : 'Zona General';
}
