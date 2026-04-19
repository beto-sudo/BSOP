/**
 * calcular-finiquito.ts
 *
 * Funciones puras para calcular el finiquito o liquidación de un empleado
 * según la Ley Federal del Trabajo de México (LFT).
 *
 * Referencias legales principales:
 *   - Art. 76 LFT (vacaciones, reforma 2023 "Vacaciones Dignas"):
 *       Año 1: 12 días · Año 2: 14 · Año 3: 16 · Año 4: 18 · Año 5: 20
 *       De Año 6 a 10: 22 · Año 11-15: 24 · Año 16-20: 26 · etc. (+2 por cada 5 años)
 *   - Art. 80 LFT: Prima vacacional — 25% mínimo sobre salario de vacaciones.
 *   - Art. 87 LFT: Aguinaldo — mínimo 15 días antes del 20 de diciembre.
 *   - Art. 162 LFT: Prima de antigüedad — 12 días por año con tope de 2× salario
 *     mínimo diario. Se paga si:
 *       a) El trabajador renuncia con 15 o más años de antigüedad, O
 *       b) El patrón lo separa sin causa justificada, O
 *       c) Terminación por causas no imputables al trabajador, O
 *       d) Muerte del trabajador.
 *   - Art. 50 LFT: Indemnización por despido injustificado — 3 meses de salario
 *     + 20 días por año trabajado (a elección del trabajador en vez de
 *     reinstalación, Art. 49).
 *   - Art. 48 LFT: Salarios caídos (si el despido es injustificado, se deben
 *     hasta por 12 meses + 2% mensual después) — NO se incluyen en el cálculo
 *     automático porque dependen de juicio laboral.
 *
 * ⚠️  IMPORTANTE: Este cálculo es una aproximación para tener un punto de
 *    partida en el finiquito. El cálculo final debe ser revisado por
 *    contador/abogado laboral antes de pagarse. La ley puede haber cambiado
 *    desde la última revisión de este archivo. No sustituye asesoría
 *    profesional.
 */

export type CausaTerminacion =
  /** Renuncia voluntaria del trabajador (Art. 51 LFT). */
  | 'renuncia'
  /** Mutuo consentimiento (Art. 53-I LFT). */
  | 'mutuo_consentimiento'
  /** Terminación de contrato por tiempo/obra determinada (Art. 37/53-III). */
  | 'termino_contrato'
  /** Rescisión SIN responsabilidad para el patrón (Art. 47 — falta grave). */
  | 'despido_justificado'
  /** Rescisión CON responsabilidad para el patrón (despido injustificado). */
  | 'despido_injustificado'
  /** Muerte del trabajador (Art. 53-IV). */
  | 'muerte'
  /** Incapacidad permanente (Art. 53-V). */
  | 'incapacidad';

export interface FiniquitoInput {
  /** Fecha de ingreso (ISO YYYY-MM-DD). */
  fechaIngreso: string;
  /** Fecha efectiva de terminación (ISO YYYY-MM-DD). */
  fechaBaja: string;
  /** Salario diario integrado o mensual/30. Usa el que corresponda a LFT (SDI para primas, diario para días trabajados). */
  sueldoDiario: number;
  /** Salario diario integrado (SDI) — preferente para primas si está disponible. */
  sdi?: number | null;
  /** Salario mínimo diario vigente en la zona (para tope de prima de antigüedad, Art. 162-II). */
  salarioMinimoDiario: number;
  /** Causa de la terminación. */
  causa: CausaTerminacion;
  /** Días trabajados del periodo corriente aún no pagados. */
  diasPendientesPago?: number;
  /** Días de vacaciones ya tomadas del año en curso (no las del derecho histórico). */
  diasVacacionesTomadasAnioActual?: number;
  /** Si el trabajador ya cobró el aguinaldo del año anterior. Default true. */
  aguinaldoAnteriorCobrado?: boolean;
  /** Días mínimos de aguinaldo por año según política (LFT mínimo = 15). */
  diasAguinaldoPorAnio?: number;
}

export interface FiniquitoConcepto {
  concepto: string;
  dias?: number;
  tasa?: number;
  monto: number;
  nota?: string;
}

export interface FiniquitoCalculado {
  fechaIngreso: string;
  fechaBaja: string;
  antiguedad: {
    anios: number;
    meses: number;
    dias: number;
    totalDias: number;
  };
  sueldoDiario: number;
  sdi: number;
  causa: CausaTerminacion;
  conceptos: FiniquitoConcepto[];
  totalFiniquito: number;
  totalIndemnizacion: number;
  totalGeneral: number;
  notas: string[];
}

// ─── Utilidades de fecha ────────────────────────────────────────────────────

function parseDate(iso: string): Date {
  // Usar medianoche local para evitar corrimiento por TZ al restar fechas.
  return new Date(`${iso.slice(0, 10)}T00:00:00`);
}

function daysBetween(a: Date, b: Date): number {
  const msDay = 1000 * 60 * 60 * 24;
  return Math.floor((b.getTime() - a.getTime()) / msDay);
}

function diffYearsMonthsDays(start: Date, end: Date) {
  let y = end.getFullYear() - start.getFullYear();
  let m = end.getMonth() - start.getMonth();
  let d = end.getDate() - start.getDate();
  if (d < 0) {
    m -= 1;
    // días del mes previo del end
    const prevMonthEnd = new Date(end.getFullYear(), end.getMonth(), 0);
    d += prevMonthEnd.getDate();
  }
  if (m < 0) {
    y -= 1;
    m += 12;
  }
  return { anios: y, meses: m, dias: d };
}

// ─── LFT tablas ─────────────────────────────────────────────────────────────

/**
 * Tabla de días de vacaciones por año de antigüedad completo según Art. 76
 * LFT (vigente desde la reforma "Vacaciones Dignas" del 1-ene-2023).
 *
 * Se aplica al número de años CUMPLIDOS. Ejemplo: 4 años y 11 meses → 4
 * años cumplidos → 18 días.
 */
export function diasVacacionesPorAntiguedad(aniosCumplidos: number): number {
  if (aniosCumplidos < 1) return 0;
  if (aniosCumplidos === 1) return 12;
  if (aniosCumplidos === 2) return 14;
  if (aniosCumplidos === 3) return 16;
  if (aniosCumplidos === 4) return 18;
  if (aniosCumplidos === 5) return 20;
  if (aniosCumplidos <= 10) return 22;
  if (aniosCumplidos <= 15) return 24;
  if (aniosCumplidos <= 20) return 26;
  if (aniosCumplidos <= 25) return 28;
  if (aniosCumplidos <= 30) return 30;
  if (aniosCumplidos <= 35) return 32;
  return 34;
}

// ─── Cálculo principal ──────────────────────────────────────────────────────

export function calcularFiniquito(input: FiniquitoInput): FiniquitoCalculado {
  const start = parseDate(input.fechaIngreso);
  const end = parseDate(input.fechaBaja);

  // Antigüedad en años, meses, días cumplidos.
  const antig = diffYearsMonthsDays(start, end);
  const totalDias = daysBetween(start, end);

  const sueldoDiario = input.sueldoDiario;
  // SDI sólo si es > sueldo diario (no tiene sentido que sea menor);
  // si no se proveyó, usar sueldoDiario como fallback.
  const sdi = input.sdi && input.sdi > 0 ? input.sdi : sueldoDiario;

  const diasAguinaldoPorAnio = input.diasAguinaldoPorAnio ?? 15;

  const conceptos: FiniquitoConcepto[] = [];
  const notas: string[] = [];

  // 1) Días trabajados no pagados
  const diasPend = input.diasPendientesPago ?? 0;
  if (diasPend > 0) {
    conceptos.push({
      concepto: 'Días trabajados pendientes de pago',
      dias: diasPend,
      tasa: sueldoDiario,
      monto: redondear(diasPend * sueldoDiario),
    });
  }

  // 2) Aguinaldo proporcional (Art. 87). Proporción sobre el año en curso:
  //    (días trabajados en el año / 365) × diasAguinaldoPorAnio × sueldoDiario.
  const diasTrabajadosAnio = diasTrabajadosEnAnio(start, end);
  const aguinaldoDias = (diasTrabajadosAnio / 365) * diasAguinaldoPorAnio;
  const aguinaldoMonto = aguinaldoDias * sueldoDiario;
  conceptos.push({
    concepto: 'Aguinaldo proporcional (Art. 87 LFT)',
    dias: round2(aguinaldoDias),
    tasa: sueldoDiario,
    monto: redondear(aguinaldoMonto),
    nota: `${diasAguinaldoPorAnio} días/año · ${diasTrabajadosAnio} días del año corriente`,
  });

  // 3) Vacaciones pendientes del último periodo (no históricas — se asume que
  //    ejercicios anteriores ya fueron tomadas o prescritas; Art. 81: prescribe
  //    al año). Aplica proporción sobre el año en curso también.
  const aniosCumplidos = antig.anios;
  const vacsAnuales = diasVacacionesPorAntiguedad(Math.max(aniosCumplidos, 1));
  const vacsProp = (diasTrabajadosAnio / 365) * vacsAnuales;
  const vacsTomadas = input.diasVacacionesTomadasAnioActual ?? 0;
  const vacsPendientes = Math.max(0, vacsProp - vacsTomadas);
  const vacsMonto = vacsPendientes * sueldoDiario;
  conceptos.push({
    concepto: 'Vacaciones pendientes (Art. 76 LFT)',
    dias: round2(vacsPendientes),
    tasa: sueldoDiario,
    monto: redondear(vacsMonto),
    nota: `${vacsAnuales} días/año · proporcional al último periodo`,
  });

  // 4) Prima vacacional 25% (Art. 80).
  const primaVacMonto = vacsMonto * 0.25;
  conceptos.push({
    concepto: 'Prima vacacional 25% (Art. 80 LFT)',
    tasa: 0.25,
    monto: redondear(primaVacMonto),
    nota: `25% sobre vacaciones pendientes`,
  });

  // 5) Prima de antigüedad (Art. 162). Aplica según causa.
  const aplicaPrimaAntiguedad = evaluarPrimaAntiguedad(input.causa, antig.anios);
  if (aplicaPrimaAntiguedad) {
    // 12 días por año, tope del salario diario igual a 2× salario mínimo.
    const sueldoTope = Math.min(sueldoDiario, 2 * input.salarioMinimoDiario);
    const primaAntigDias = 12 * (antig.anios + antig.meses / 12 + antig.dias / 365);
    const primaAntigMonto = primaAntigDias * sueldoTope;
    conceptos.push({
      concepto: 'Prima de antigüedad (Art. 162 LFT)',
      dias: round2(primaAntigDias),
      tasa: sueldoTope,
      monto: redondear(primaAntigMonto),
      nota:
        sueldoTope < sueldoDiario
          ? `Tope 2× salario mínimo = ${sueldoTope.toFixed(2)}`
          : '12 días × año antigüedad',
    });
  } else if (input.causa === 'renuncia' && antig.anios < 15) {
    notas.push(
      'Prima de antigüedad NO aplica: el Art. 162 LFT solo la otorga por renuncia con 15+ años.'
    );
  }

  // 6) Indemnización Constitucional — solo en despido injustificado (Art. 50).
  //    3 meses de salario (90 días) + 20 días por cada año de servicio.
  //    Esto es INDEPENDIENTE del finiquito — conceptualmente va aparte.
  const indemnizacionConceptos: FiniquitoConcepto[] = [];
  if (input.causa === 'despido_injustificado') {
    const tresMeses = 90 * sueldoDiario;
    indemnizacionConceptos.push({
      concepto: 'Indemnización 3 meses (Art. 50-III LFT)',
      dias: 90,
      tasa: sueldoDiario,
      monto: redondear(tresMeses),
    });
    const veinteDiasAno = antig.anios + antig.meses / 12 + antig.dias / 365;
    const veinteDiasTotal = 20 * veinteDiasAno;
    indemnizacionConceptos.push({
      concepto: '20 días por año de servicio (Art. 50-II LFT)',
      dias: round2(veinteDiasTotal),
      tasa: sueldoDiario,
      monto: redondear(veinteDiasTotal * sueldoDiario),
    });
    notas.push(
      'Indemnización constitucional se paga solo si el despido es declarado INJUSTIFICADO. Los salarios caídos (Art. 48) no se calculan aquí.'
    );
  }

  const totalFiniquito = conceptos.reduce((s, c) => s + c.monto, 0);
  const totalIndemnizacion = indemnizacionConceptos.reduce((s, c) => s + c.monto, 0);

  return {
    fechaIngreso: input.fechaIngreso,
    fechaBaja: input.fechaBaja,
    antiguedad: {
      ...antig,
      totalDias,
    },
    sueldoDiario,
    sdi,
    causa: input.causa,
    conceptos: [...conceptos, ...indemnizacionConceptos],
    totalFiniquito: redondear(totalFiniquito),
    totalIndemnizacion: redondear(totalIndemnizacion),
    totalGeneral: redondear(totalFiniquito + totalIndemnizacion),
    notas,
  };
}

// ─── Helpers internos ───────────────────────────────────────────────────────

function evaluarPrimaAntiguedad(causa: CausaTerminacion, anios: number): boolean {
  switch (causa) {
    case 'renuncia':
      return anios >= 15;
    case 'despido_justificado':
      return false; // No aplica
    case 'despido_injustificado':
    case 'mutuo_consentimiento':
    case 'termino_contrato':
    case 'incapacidad':
    case 'muerte':
      return true;
    default:
      return false;
  }
}

/**
 * Días trabajados durante el año calendario en curso (1-ene hasta fecha_baja
 * O desde fecha_ingreso si ingresó este año, lo que sea más reciente).
 */
function diasTrabajadosEnAnio(start: Date, end: Date): number {
  const anioBaja = end.getFullYear();
  const inicioAnio = new Date(anioBaja, 0, 1);
  const desde = start > inicioAnio ? start : inicioAnio;
  return Math.max(0, daysBetween(desde, end) + 1); // +1 para incluir el día de baja
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Labels humanos ─────────────────────────────────────────────────────────

export const CAUSA_LABELS: Record<CausaTerminacion, string> = {
  renuncia: 'Renuncia voluntaria del trabajador',
  mutuo_consentimiento: 'Mutuo consentimiento de las partes',
  termino_contrato: 'Terminación por vencimiento de contrato',
  despido_justificado: 'Rescisión sin responsabilidad para el patrón (Art. 47)',
  despido_injustificado: 'Despido injustificado (Art. 47/50)',
  muerte: 'Muerte del trabajador',
  incapacidad: 'Incapacidad física/mental permanente',
};

export function formatMoneda(n: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(n);
}
