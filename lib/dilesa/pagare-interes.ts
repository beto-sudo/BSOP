/**
 * Motor de intereses ordinarios del pagaré de crédito directo (Fase 10).
 *
 * El plan de pagos captura SOLO capital (la suma debe igualar el monto del
 * crédito — esa es la suerte principal del pagaré). El interés ordinario,
 * cuando la tasa es > 0, se calcula aquí y se desglosa por parcialidad:
 *
 *   interés_k = saldo_insoluto_k × (tasa_anual/100) × días_k / 360
 *
 * donde saldo_insoluto_k es el capital aún no pagado al inicio del periodo k
 * y días_k son los días naturales entre el vencimiento anterior (o la fecha
 * de suscripción para la primera parcialidad) y el vencimiento k. Año
 * comercial de 360 días — convención mercantil mexicana.
 *
 * Mismo motor para la preview de la UI (fase 10) y el PDF del pagaré: si
 * cambia la convención (p. ej. base 365), se cambia en UN lugar y ambos
 * quedan alineados.
 */

export type ParcialidadCapital = {
  /** Fecha de vencimiento ISO `YYYY-MM-DD`. */
  fecha: string;
  /** Abono a capital de la parcialidad. */
  monto: number;
};

export type ParcialidadDesglosada = {
  num: number;
  fecha: string;
  capital: number;
  /** Días naturales del periodo que genera el interés. */
  dias: number;
  /** Saldo insoluto sobre el que se calculó el interés del periodo. */
  saldoInsoluto: number;
  interes: number;
  /** capital + interés. */
  pago: number;
};

export type DesglosePagare = {
  parcialidades: ParcialidadDesglosada[];
  totalCapital: number;
  totalInteres: number;
  /** totalCapital + totalInteres. */
  totalPagar: number;
};

const MS_DIA = 86_400_000;

/** Días naturales entre dos fechas ISO (UTC-safe, sin DST). */
function diasEntre(desdeIso: string, hastaIso: string): number {
  const [y1, m1, d1] = desdeIso.split('-').map(Number);
  const [y2, m2, d2] = hastaIso.split('-').map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 0;
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / MS_DIA);
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Desglosa el plan de pagos de capital en parcialidades con interés ordinario.
 *
 * - Las parcialidades se procesan en orden cronológico (se ordenan por fecha
 *   de forma estable) y se renumeran 1..n.
 * - Tasa 0 (o sin fecha de suscripción) → interés 0 en todas las filas; el
 *   desglose sigue siendo útil para totales.
 * - Filas sin fecha o con fecha anterior al inicio del periodo no generan
 *   interés (días = 0) — la validación del form impide capturarlas, esto es
 *   solo defensivo.
 * - El interés se redondea a centavos por parcialidad; los totales suman las
 *   filas ya redondeadas, de modo que el total SIEMPRE cuadra con la tabla.
 */
export function desglosarPagare(
  plan: ParcialidadCapital[],
  tasaAnualPct: number,
  fechaSuscripcion: string | null
): DesglosePagare {
  const ordenadas = plan
    .map((p, i) => ({ ...p, _i: i }))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a._i - b._i));

  const tasa = Number.isFinite(tasaAnualPct) && tasaAnualPct > 0 ? tasaAnualPct : 0;
  const totalCapital = round2(ordenadas.reduce((s, p) => s + (Number(p.monto) || 0), 0));

  let saldo = totalCapital;
  let inicioPeriodo = fechaSuscripcion;
  const parcialidades: ParcialidadDesglosada[] = ordenadas.map((p, idx) => {
    const capital = round2(Number(p.monto) || 0);
    const dias =
      tasa > 0 && inicioPeriodo && p.fecha ? Math.max(0, diasEntre(inicioPeriodo, p.fecha)) : 0;
    const saldoInsoluto = round2(saldo);
    const interes = round2(saldoInsoluto * (tasa / 100) * (dias / 360));
    saldo = round2(saldo - capital);
    if (p.fecha) inicioPeriodo = p.fecha;
    return {
      num: idx + 1,
      fecha: p.fecha,
      capital,
      dias,
      saldoInsoluto,
      interes,
      pago: round2(capital + interes),
    };
  });

  const totalInteres = round2(parcialidades.reduce((s, p) => s + p.interes, 0));
  return {
    parcialidades,
    totalCapital,
    totalInteres,
    totalPagar: round2(totalCapital + totalInteres),
  };
}
