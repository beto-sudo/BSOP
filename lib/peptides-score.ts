import type { Vendor, Test } from './peptides';

// Score de vendor (iniciativa sanren-peptides) — qué tan conveniente/seguro es
// comprarle. Transparente y explicable, no caja negra: la UI muestra el desglose.
//
// Pesos (ajustables — Beto puede pedir recalibrarlos):
//   resultados/calidad 40 · precio 25 · evidencia (# COAs) 20 · endotoxina 15.
// `estado` actúa como MULTIPLICADOR (removido/warning hunden el total), porque
// un vendor removido no es comprable por más buenos que sean sus números.

export type VendorScore = {
  total: number; // 0-100 (ya con el multiplicador de estado)
  calidad: number; // sub-score de pureza 0-100
  evidencia: number; // sub-score por # de COAs 0-100
  precio: number | null; // sub-score de precio 0-100 (null si el vendor no tiene precio)
  endotoxina: number; // sub-score de seguridad 0-100
  nCoas: number;
  avgPurity: number | null;
  pctAlta: number; // fracción de COAs ≥99%
  endotoxinaFlag: boolean; // se detectó un valor de endotoxina alto
};

export const SCORE_WEIGHTS = { calidad: 0.4, precio: 0.25, evidencia: 0.2, endotoxina: 0.15 };
const ESTADO_MULT: Record<Vendor['estado'], number> = { activo: 1, warning: 0.75, removido: 0.4 };
const ENDO_ALTA_EU = 50; // umbral grueso (EU) para marcar endotoxina de riesgo

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

// Normaliza un código para el match blando vendor↔COA: mayúsculas, token antes
// de "/" o espacio (ej. "BFF/AMO" → "BFF", "GYC peptides" → "GYC").
export function normCode(s: string | null | undefined): string {
  return (s ?? '')
    .toUpperCase()
    .split(/[/\s]/)[0]
    .replace(/[^A-Z0-9]/g, '');
}

// Extrae el primer número del texto de endotoxina (">2300 EU" → 2300, "<0.5" → 0.5).
function endoValue(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export function scoreVendor(
  vendor: Vendor,
  vendorTests: Test[],
  ctx: { minPrice: number; maxPrice: number }
): VendorScore {
  const purs = vendorTests.map((t) => t.purity_pct).filter((p): p is number => p != null);
  const nCoas = vendorTests.length;
  const avgPurity = purs.length ? purs.reduce((a, b) => a + b, 0) / purs.length : null;
  const pctAlta = purs.length ? purs.filter((p) => p >= 99).length / purs.length : 0;

  // Pureza: 97% → 0, 99.7% → 100; mezcla promedio (70%) con consistencia ≥99% (30%).
  const purityScore = avgPurity == null ? 0 : clamp(((avgPurity - 97) / (99.7 - 97)) * 100);
  const calidad = avgPurity == null ? 0 : clamp(0.7 * purityScore + 0.3 * (pctAlta * 100));

  // Evidencia: log-escalado, ~30 COAs ≈ 100 (rendimientos decrecientes).
  const evidencia = clamp((Math.log10(nCoas + 1) / Math.log10(31)) * 100);

  // Precio: relativo al set (más barato = mejor). 50 neutral si hay precio pero sin rango.
  let precio: number | null = null;
  if (vendor.precio_mg != null && ctx.maxPrice > ctx.minPrice) {
    precio = clamp(((ctx.maxPrice - vendor.precio_mg) / (ctx.maxPrice - ctx.minPrice)) * 100);
  } else if (vendor.precio_mg != null) {
    precio = 50;
  }

  // Endotoxina: flag de seguridad si algún batch viene alto → 0; limpio probado → 100;
  // no probado → 60 (incierto, ni premia ni castiga fuerte).
  const endoVals = vendorTests
    .map((t) => endoValue(t.endotoxin))
    .filter((v): v is number => v != null);
  const endotoxinaFlag = endoVals.some((v) => v > ENDO_ALTA_EU);
  const endotoxina = endotoxinaFlag ? 0 : endoVals.length ? 100 : 60;

  const base =
    SCORE_WEIGHTS.calidad * calidad +
    SCORE_WEIGHTS.precio * (precio ?? 50) +
    SCORE_WEIGHTS.evidencia * evidencia +
    SCORE_WEIGHTS.endotoxina * endotoxina;
  const total = Math.round(base * ESTADO_MULT[vendor.estado]);

  return {
    total,
    calidad: Math.round(calidad),
    evidencia: Math.round(evidencia),
    precio: precio == null ? null : Math.round(precio),
    endotoxina: Math.round(endotoxina),
    nCoas,
    avgPurity: avgPurity == null ? null : Math.round(avgPurity * 100) / 100,
    pctAlta,
    endotoxinaFlag,
  };
}

// Agrupa COAs por código normalizado y puntúa todos los vendors.
export function computeVendorScores(vendors: Vendor[], tests: Test[]): Map<string, VendorScore> {
  const byCode = new Map<string, Test[]>();
  for (const t of tests) {
    const k = normCode(t.vendor_codigo);
    if (!k) continue;
    const arr = byCode.get(k) ?? [];
    arr.push(t);
    byCode.set(k, arr);
  }
  const prices = vendors.map((v) => v.precio_mg).filter((p): p is number => p != null);
  const ctx = {
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
  };
  const out = new Map<string, VendorScore>();
  for (const v of vendors) {
    out.set(v.codigo, scoreVendor(v, byCode.get(normCode(v.codigo)) ?? [], ctx));
  }
  return out;
}
