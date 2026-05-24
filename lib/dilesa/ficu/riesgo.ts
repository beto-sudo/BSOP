/**
 * Evaluación de Riesgo (EBR) para el FICU DILESA.
 *
 * Sustenta el cálculo de riesgo del Formato de Identificación de
 * Clientes que exige el Art. 18 frac. I de LFPIORPI (Enfoque Basado
 * en Riesgo). La metodología es 5 criterios × 20% c/u, cada uno con
 * 3 niveles:
 *
 *   - Bajo   = 1/3 del peso = 6.67%
 *   - Medio  = 2/3 del peso = 13.33%
 *   - Alto   = 3/3 del peso = 20.00%
 *
 * Clasificación final del cliente:
 *   - Bajo   : score < 40%   (todos Bajo, o 4 Bajo + 1 Medio)
 *   - Medio  : score 40 – 66 %
 *   - Alto   : score > 66 %
 *
 * Las asignaciones Bajo/Medio/Alto siguen GAFI Recomendación 22
 * (DNFBPs / Real Estate) + Reglas de Carácter General LFPIORPI.
 *
 * Cambio importante vs. la versión histórica de Coda:
 *   - "Forma de Pago: Crédito hipotecario" → Bajo (era Alto, técnicamente
 *     incorrecto: el banco interpone KYC + recursos rastreables).
 *
 * UMA 2026 ≈ $113.14 — umbrales:
 *   - Identificación (3,210 UMAs) ≈ $363,179
 *   - Aviso a UIF (8,025 UMAs)    ≈ $907,949
 */

export type Nivel = 'Bajo' | 'Medio' | 'Alto';

export type CriterioRiesgo = {
  nombre: string;
  nivel: Nivel;
  porcentaje: number; // % aportado al score
};

export type EvaluacionRiesgo = {
  criterios: CriterioRiesgo[];
  scoreTotal: number; // suma de porcentajes
  clasificacion: Nivel;
};

const PESO_CRITERIO = 20; // %
const FACTOR_NIVEL: Record<Nivel, number> = {
  Bajo: 1 / 3,
  Medio: 2 / 3,
  Alto: 1,
};

function porcentaje(nivel: Nivel): number {
  // Redondeo a 2 decimales para evitar 6.666666...% en el render.
  return Math.round(PESO_CRITERIO * FACTOR_NIVEL[nivel] * 100) / 100;
}

// ── Asignación de niveles por criterio ──────────────────────────────

/** Personalidad: PF mexicana → Bajo; PF extranjera residente → Medio; PM/otros → Alto. */
export function nivelPersonalidad(
  tipoPersona: string | null | undefined,
  nacionalidad: string | null | undefined
): Nivel {
  const tp = (tipoPersona ?? '').toUpperCase();
  if (tp.includes('MORAL') || tp.includes('FIDEICOMISO')) return 'Alto';
  const esMexicana = (nacionalidad ?? '').toUpperCase().includes('MEX');
  if (esMexicana) return 'Bajo';
  return 'Medio';
}

/**
 * Nacionalidad: Mexicana → Bajo; otra no listada → Medio;
 * país GAFI alto riesgo → Alto.
 * Lista GAFI "Call for Action" + "Increased Monitoring" — fuente:
 * https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions.html
 * Actualizar cuando GAFI publique nueva lista (suele ser 3 veces/año).
 */
export const GAFI_ALTO_RIESGO_2026 = new Set([
  // Call for Action (sanción)
  'COREA DEL NORTE',
  'IRÁN',
  'MYANMAR',
  // Increased Monitoring (selección — los más relevantes para LATAM)
  'CUBA',
  'VENEZUELA',
  'NICARAGUA',
  'HAITÍ',
  'SIRIA',
  'YEMEN',
  'NIGERIA',
  'SUDÁN',
  'SUDÁN DEL SUR',
  'LÍBANO',
]);

export function nivelNacionalidad(nacionalidad: string | null | undefined): Nivel {
  const nac = (nacionalidad ?? '').toUpperCase().trim();
  if (!nac) return 'Medio'; // sin dato → medio defensivamente
  if (nac.includes('MEX')) return 'Bajo';
  if (GAFI_ALTO_RIESGO_2026.has(nac)) return 'Alto';
  return 'Medio';
}

/** PEP: no PEP → Bajo; familiar/asociado → Medio; PEP directo → Alto. */
export function nivelPEP(esPep: boolean | null | undefined, pepFamiliar?: boolean | null): Nivel {
  if (esPep) return 'Alto';
  if (pepFamiliar) return 'Medio';
  return 'Bajo';
}

/**
 * Forma de pago — el corazón del EBR para inmobiliario.
 *  - Crédito hipotecario / Infonavit / Fovissste     → Bajo
 *  - Recursos propios (transferencia, cheque)         → Medio
 *  - Efectivo significativo (uso de efectivo ≥ UMAs)  → Alto
 */
const UMA_2026 = 113.14;
export const UMBRAL_IDENTIFICACION_MXN = Math.round(3210 * UMA_2026); // ≈ $363,179
export const UMBRAL_AVISO_UIF_MXN = Math.round(8025 * UMA_2026); // ≈ $907,949

export function nivelFormaPago(
  formaPago: string | null | undefined,
  usoEfectivo: string | null | undefined,
  montoEfectivoMxn?: number | null
): Nivel {
  const fp = (formaPago ?? '').toUpperCase();
  const ue = (usoEfectivo ?? '').toUpperCase();

  if (
    fp.includes('INFONAVIT') ||
    fp.includes('FOVISSSTE') ||
    fp.includes('HIPOTECARIO') ||
    fp.includes('CRÉDITO') ||
    fp.includes('CREDITO')
  ) {
    return 'Bajo';
  }

  if (
    ue.includes('USO DE EFECTIVO') &&
    !ue.includes('SIN') &&
    (montoEfectivoMxn == null || montoEfectivoMxn >= UMBRAL_IDENTIFICACION_MXN)
  ) {
    return 'Alto';
  }

  return 'Medio';
}

/**
 * Uso de Efectivo:
 *   - $0 / < 1,605 UMAs    → Bajo
 *   - 1,605 – 3,210 UMAs   → Medio
 *   - ≥ 3,210 UMAs         → Alto
 * Si no hay monto explícito, derivamos del texto (SIN USO DE EFECTIVO=Bajo).
 */
export const UMBRAL_EFECTIVO_MEDIO_MXN = Math.round(1605 * UMA_2026); // ≈ $181,590

export function nivelUsoEfectivo(
  usoEfectivo: string | null | undefined,
  montoMxn?: number | null
): Nivel {
  if (typeof montoMxn === 'number') {
    if (montoMxn >= UMBRAL_IDENTIFICACION_MXN) return 'Alto';
    if (montoMxn >= UMBRAL_EFECTIVO_MEDIO_MXN) return 'Medio';
    return 'Bajo';
  }
  const ue = (usoEfectivo ?? '').toUpperCase();
  if (!ue || ue.includes('SIN') || ue === 'NO') return 'Bajo';
  return 'Medio';
}

// ── Evaluación completa ─────────────────────────────────────────────

export type EntradasRiesgo = {
  tipoPersona: string | null | undefined;
  nacionalidad: string | null | undefined;
  esPep: boolean | null | undefined;
  pepFamiliar?: boolean | null;
  formaPago: string | null | undefined;
  usoEfectivo: string | null | undefined;
  montoEfectivoMxn?: number | null;
};

export function evaluarRiesgo(entradas: EntradasRiesgo): EvaluacionRiesgo {
  const niveles: Array<[string, Nivel]> = [
    ['Personalidad', nivelPersonalidad(entradas.tipoPersona, entradas.nacionalidad)],
    ['Nacionalidad', nivelNacionalidad(entradas.nacionalidad)],
    ['Persona Políticamente Expuesta', nivelPEP(entradas.esPep, entradas.pepFamiliar)],
    [
      'Forma de Pago',
      nivelFormaPago(entradas.formaPago, entradas.usoEfectivo, entradas.montoEfectivoMxn),
    ],
    ['Uso de Efectivo', nivelUsoEfectivo(entradas.usoEfectivo, entradas.montoEfectivoMxn)],
  ];

  const criterios: CriterioRiesgo[] = niveles.map(([nombre, nivel]) => ({
    nombre,
    nivel,
    porcentaje: porcentaje(nivel),
  }));

  const scoreTotal = Math.round(criterios.reduce((s, c) => s + c.porcentaje, 0) * 100) / 100;

  let clasificacion: Nivel = 'Bajo';
  if (scoreTotal > 66) clasificacion = 'Alto';
  else if (scoreTotal >= 40) clasificacion = 'Medio';

  return { criterios, scoreTotal, clasificacion };
}
