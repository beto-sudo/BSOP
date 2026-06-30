import type { ReciboVista } from '@/lib/sanren-servicios';

/**
 * Analítica pura del módulo SANREN → Servicios (vista por servicio).
 *
 * Todo aquí es determinista y sin dependencias de React/DOM para poder
 * testearlo aislado (mantiene los thresholds de coverage). La UI
 * (`servicios-view.tsx`) formatea; este módulo solo calcula.
 *
 * Las funciones reciben un set de recibos **ya filtrado** (por servicio y por
 * los filtros de la barra) — las "sumatorias según filtros" salen de aquí.
 */

const yyyymm = (periodo: string): string => periodo.slice(0, 7);

/** Suma defensiva de un campo numérico que puede venir null. */
function sumField(recibos: ReciboVista[], pick: (r: ReciboVista) => number | null): number {
  return recibos.reduce((acc, r) => acc + (pick(r) ?? 0), 0);
}

export interface ServicioKpiSet {
  count: number;
  gasto: number;
  pendientes: number;
  /** [periodoMin, periodoMax] en `yyyy-mm`, o null si no hay recibos. */
  rango: [string, string] | null;
  /** Consumo total del periodo (kWh / m³ según servicio). null si nadie reporta. */
  consumoTotal: number | null;
  /** Unidad de consumo dominante (kWh, m³…). */
  consumoUnidad: string | null;
  /** gasto / consumoTotal — costo unitario promedio del rango. */
  costoUnitarioProm: number | null;
  /** Consumo promedio por recibo con lectura. */
  consumoPromMensual: number | null;
  /** Periodo con mayor consumo (detección de pico). */
  mesPico: { periodo: string; consumo: number } | null;
  /** Solo Luz con paneles: generación total del rango. */
  generacionTotal: number | null;
  /** Solo Luz: kWh a favor en el banco de energía (recibo más reciente). */
  bancoEnergia: number | null;
}

/**
 * KPIs de un servicio (o del set completo si es la vista "Todos").
 * `recibos` debe venir ya filtrado.
 */
export function computeServicioKpis(recibos: ReciboVista[]): ServicioKpiSet {
  const count = recibos.length;
  const gasto = sumField(recibos, (r) => r.monto);
  const pendientes = recibos.filter((r) => !r.pagado).length;

  const meses = recibos.map((r) => yyyymm(r.periodo)).sort();
  const rango: [string, string] | null = meses.length ? [meses[0], meses[meses.length - 1]] : null;

  const conConsumo = recibos.filter((r) => r.consumo_periodo != null);
  const consumoTotal = conConsumo.length ? sumField(conConsumo, (r) => r.consumo_periodo) : null;
  const consumoUnidad = recibos.find((r) => r.unidad_consumo)?.unidad_consumo ?? null;
  const costoUnitarioProm = consumoTotal != null && consumoTotal > 0 ? gasto / consumoTotal : null;
  const consumoPromMensual =
    consumoTotal != null && conConsumo.length > 0 ? consumoTotal / conConsumo.length : null;

  let mesPico: { periodo: string; consumo: number } | null = null;
  for (const r of conConsumo) {
    const c = r.consumo_periodo as number;
    if (!mesPico || c > mesPico.consumo) mesPico = { periodo: yyyymm(r.periodo), consumo: c };
  }

  const conProduccion = recibos.filter((r) => r.tiene_produccion && r.produccion_periodo != null);
  const generacionTotal = conProduccion.length
    ? sumField(conProduccion, (r) => r.produccion_periodo)
    : null;

  // Banco de energía: el del recibo de luz más reciente que lo reporte.
  let bancoEnergia: number | null = null;
  const conBanco = recibos
    .filter((r) => r.extraccion?.energia_acumulada_favor != null)
    .sort((a, b) => b.periodo.localeCompare(a.periodo));
  if (conBanco.length > 0) {
    bancoEnergia = conBanco[0].extraccion?.energia_acumulada_favor ?? null;
  }

  return {
    count,
    gasto,
    pendientes,
    rango,
    consumoTotal,
    consumoUnidad,
    costoUnitarioProm,
    consumoPromMensual,
    mesPico,
    generacionTotal,
    bancoEnergia,
  };
}

export interface Comparativos {
  ultimoPeriodo: string | null;
  gastoUltimo: number | null;
  /** Mismo mes, año anterior. */
  gastoMismoMesAnioPrevio: number | null;
  deltaGastoPct: number | null;
  /** Total móvil de los 12 meses más recientes presentes. */
  total12m: number;
  /** Total de los 12 meses previos a esa ventana. */
  totalPrev12m: number;
  delta12mPct: number | null;
}

function mesAnioPrevio(periodo: string): string {
  const [y, m] = periodo.split('-');
  return `${Number(y) - 1}-${m}`;
}

/** Comparativos año-vs-año del set (ya filtrado por servicio). */
export function computeComparativos(recibos: ReciboVista[]): Comparativos {
  const porMes = new Map<string, number>();
  for (const r of recibos) {
    if (r.monto == null) continue;
    const mes = yyyymm(r.periodo);
    porMes.set(mes, (porMes.get(mes) ?? 0) + r.monto);
  }
  const meses = Array.from(porMes.keys()).sort();
  if (meses.length === 0) {
    return {
      ultimoPeriodo: null,
      gastoUltimo: null,
      gastoMismoMesAnioPrevio: null,
      deltaGastoPct: null,
      total12m: 0,
      totalPrev12m: 0,
      delta12mPct: null,
    };
  }

  const ultimoPeriodo = meses[meses.length - 1];
  const gastoUltimo = porMes.get(ultimoPeriodo) ?? null;
  const prevKey = mesAnioPrevio(ultimoPeriodo);
  const gastoMismoMesAnioPrevio = porMes.has(prevKey) ? (porMes.get(prevKey) as number) : null;
  const deltaGastoPct =
    gastoUltimo != null && gastoMismoMesAnioPrevio != null && gastoMismoMesAnioPrevio > 0
      ? (gastoUltimo - gastoMismoMesAnioPrevio) / gastoMismoMesAnioPrevio
      : null;

  // Ventanas de 12 meses sobre los meses presentes (no calendario estricto).
  const ult12 = meses.slice(-12);
  const prev12 = meses.slice(-24, -12);
  const total12m = ult12.reduce((a, m) => a + (porMes.get(m) ?? 0), 0);
  const totalPrev12m = prev12.reduce((a, m) => a + (porMes.get(m) ?? 0), 0);
  const delta12mPct = totalPrev12m > 0 ? (total12m - totalPrev12m) / totalPrev12m : null;

  return {
    ultimoPeriodo,
    gastoUltimo,
    gastoMismoMesAnioPrevio,
    deltaGastoPct,
    total12m,
    totalPrev12m,
    delta12mPct,
  };
}

export interface Anomalia {
  /** Promedio de consumo de los recibos previos del mismo servicio. */
  baseline: number;
  /** Exceso relativo sobre el baseline (0.4 = +40%). */
  exceso: number;
}

/**
 * Detecta recibos con consumo anómalo (posible fuga / uso excesivo).
 *
 * Por servicio, recorre los recibos en orden cronológico y compara cada
 * consumo contra el promedio de los `ventana` recibos previos del mismo
 * servicio. Si excede `umbral` (por defecto +40%), lo marca. Necesita al
 * menos `minPrevios` lecturas previas para no disparar con ruido inicial.
 *
 * Devuelve un Map indexado por id de recibo (solo los marcados).
 */
export function computeAnomalias(
  recibos: ReciboVista[],
  opts: { ventana?: number; umbral?: number; minPrevios?: number } = {}
): Map<string, Anomalia> {
  const ventana = opts.ventana ?? 3;
  const umbral = opts.umbral ?? 0.4;
  const minPrevios = opts.minPrevios ?? 2;
  const out = new Map<string, Anomalia>();

  const porServicio = new Map<string, ReciboVista[]>();
  for (const r of recibos) {
    if (r.consumo_periodo == null) continue;
    const arr = porServicio.get(r.servicio_tipo) ?? [];
    arr.push(r);
    porServicio.set(r.servicio_tipo, arr);
  }

  for (const arr of porServicio.values()) {
    const cron = [...arr].sort((a, b) => a.periodo.localeCompare(b.periodo));
    for (let i = 0; i < cron.length; i++) {
      const previos = cron
        .slice(Math.max(0, i - ventana), i)
        .map((r) => r.consumo_periodo as number);
      if (previos.length < minPrevios) continue;
      const baseline = previos.reduce((a, c) => a + c, 0) / previos.length;
      if (baseline <= 0) continue;
      const actual = cron[i].consumo_periodo as number;
      const exceso = (actual - baseline) / baseline;
      if (exceso >= umbral) out.set(cron[i].id, { baseline, exceso });
    }
  }

  return out;
}

/** Avanza `n` meses un periodo `yyyy-mm` (maneja el salto de año). */
export function addMeses(periodo: string, n: number): string {
  const [y, m] = periodo.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** Mes calendario siguiente a un periodo `yyyy-mm`. */
export function addMes(periodo: string): string {
  return addMeses(periodo, 1);
}

/** Meses entre dos periodos `yyyy-mm` (b − a). */
function mesesEntre(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

/**
 * Cadencia (en meses) entre recibos consecutivos: la moda de los huecos. Luz es
 * bimestral → 2; Agua/Gas mensual → 1. Robusto a un hueco suelto (recibo
 * estimado, corrección). Default 1 con <2 datos.
 */
function inferStep(serie: { periodo: string }[]): number {
  if (serie.length < 2) return 1;
  const counts = new Map<number, number>();
  for (let i = 1; i < serie.length; i++) {
    const g = mesesEntre(serie[i - 1].periodo, serie[i].periodo);
    if (g > 0) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  let best = 1;
  let bestC = 0;
  for (const [g, c] of counts) {
    if (c > bestC || (c === bestC && g < best)) {
      best = g;
      bestC = c;
    }
  }
  return best;
}

/** Serie mensual {periodo, valor} de un campo, sumando por mes (orden asc). */
export function serieMensual(
  recibos: ReciboVista[],
  pick: (r: ReciboVista) => number | null
): { periodo: string; valor: number }[] {
  const map = new Map<string, number>();
  for (const r of recibos) {
    const v = pick(r);
    if (v == null) continue;
    map.set(yyyymm(r.periodo), (map.get(yyyymm(r.periodo)) ?? 0) + v);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([periodo, valor]) => ({ periodo, valor }));
}

export interface Pronostico {
  /** Periodo `yyyy-mm` pronosticado (el mes siguiente al último con dato). */
  periodo: string;
  valor: number;
  /** Cómo se estimó: estacional (años previos), tendencia (meses recientes) o ambos. */
  base: 'estacional+tendencia' | 'estacional' | 'tendencia';
}

const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Factor de tendencia anual: cuánto corre el consumo de los últimos 12 meses
 * vs. los 12 previos. Clamp [0.7, 1.4] y solo se aplica con ventanas
 * comparables (≥3 datos cada una) para no inflar con historia incompleta.
 */
function factorTendencia(serie: { periodo: string; valor: number }[], ultimo: string): number {
  const recientes: number[] = [];
  const previos: number[] = [];
  for (const s of serie) {
    const mb = mesesEntre(s.periodo, ultimo); // ≥0 = en o antes del último
    if (mb >= 0 && mb <= 11) recientes.push(s.valor);
    else if (mb >= 12 && mb <= 23) previos.push(s.valor);
  }
  if (recientes.length < 3 || previos.length < 3) return 1;
  const sumPrev = previos.reduce((a, b) => a + b, 0);
  if (sumPrev <= 0) return 1;
  const ratio = recientes.reduce((a, b) => a + b, 0) / sumPrev;
  return Math.min(1.4, Math.max(0.7, ratio));
}

/**
 * Pronóstico del próximo periodo para un campo (consumo, producción, monto…).
 *
 * El próximo periodo se calcula con la **cadencia real** del servicio (Luz es
 * bimestral → +2 meses; Agua/Gas → +1). Dos modelos:
 *  - **estacional**: si hay recibos del mismo mes en años anteriores ("lo que
 *    sucedió en años anteriores"), toma su promedio y lo escala por el factor de
 *    tendencia anual ("lo que se ha venido consumiendo"). Captura el patrón
 *    estacional (p. ej. el pico de agosto) sin ignorar la tendencia.
 *  - **tendencia**: si no hay historia del mismo mes, promedia los últimos
 *    `recientes` recibos.
 *
 * Devuelve null si no hay datos. `recibos` debe venir ya filtrado por servicio.
 */
export function computePronostico(
  recibos: ReciboVista[],
  pick: (r: ReciboVista) => number | null,
  opts: { recientes?: number } = {}
): Pronostico | null {
  const recientes = opts.recientes ?? 3;
  const serie = serieMensual(recibos, pick);
  if (serie.length === 0) return null;

  const ultimo = serie[serie.length - 1].periodo;
  const next = addMeses(ultimo, inferStep(serie));
  const nextMM = next.slice(5, 7);

  const mismosMeses = serie.filter((s) => s.periodo.slice(5, 7) === nextMM).map((s) => s.valor);

  let valor: number;
  let base: Pronostico['base'];
  if (mismosMeses.length > 0) {
    valor = avg(mismosMeses) * factorTendencia(serie, ultimo);
    base = 'estacional+tendencia';
  } else {
    const ultimosN = serie.slice(-recientes).map((s) => s.valor);
    if (ultimosN.length === 0) return null;
    valor = avg(ultimosN);
    base = 'tendencia';
  }

  return { periodo: next, valor: Math.max(0, Math.round(valor)), base };
}
