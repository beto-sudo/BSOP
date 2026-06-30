/**
 * Desglose de fluidez de UNA venta fase por fase — iniciativa
 * dilesa-fluidez-pipeline, pestaña «Fluidez» del expediente.
 *
 * Reconstruye, desde el historial de fases de la venta (`venta_fases`) y la vara
 * por fase (`v_fase_vara`: meta de Dirección o mediana histórica), cuánto tardó
 * en cada fase recorrida y cómo va contra el objetivo. La fase en curso cuenta
 * su permanencia abierta (hoy − entrada). Solo fases 1–14 (las post-entrega se
 * excluyen del radar). Puro y testeable.
 */
import { bandaFluidez, type BandaFluidez } from './fluidez-venta';

export type FaseAlcanzada = { posicion: number; fase: string; fecha: string | null };
export type VaraRef = { vara: number | null; p90: number | null };

export type FaseVentaFluidez = {
  posicion: number;
  fase: string;
  alcanzada: boolean;
  /** La fase en curso (última alcanzada ≤ 14): su permanencia sigue corriendo. */
  enCurso: boolean;
  /** Días en la fase: tramo cerrado (entró→siguiente) o, si en curso, hoy−entrada. */
  dias: number | null;
  /** Vara de la fase (meta o mediana histórica): el objetivo. */
  vara: number | null;
  p90: number | null;
  banda: BandaFluidez | null;
};

export type ResumenFluidezVenta = {
  filas: FaseVentaFluidez[];
  /** Fases con dato (alcanzadas con días) dentro de su vara (banda verde). */
  enObjetivo: number;
  /** Fases medibles (alcanzadas con días). */
  medibles: number;
  /** Fases en rojo (crítica). */
  criticas: number;
  /** La fase en curso, si la hay (≤ 14). */
  actual: FaseVentaFluidez | null;
};

const MS_DIA = 86_400_000;

function diasEntre(desde: string, hastaMs: number): number {
  const d = Date.parse(`${desde.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d)) return 0;
  return Math.max(0, Math.floor((hastaMs - d) / MS_DIA));
}

/**
 * Arma el desglose de fluidez de la venta para las 14 fases del pipeline.
 * `faseActualPos` = posición de la fase vigente (la mayor alcanzada); su tramo
 * está abierto y se mide contra hoy.
 */
export function fluidezDeVenta(
  alcanzadas: readonly FaseAlcanzada[],
  varaPorFase: ReadonlyMap<number, VaraRef>,
  opts?: { hoy?: Date; faseActualPos?: number | null }
): ResumenFluidezVenta {
  const hoyMs = (() => {
    const h = opts?.hoy ?? new Date();
    return Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate());
  })();
  const faseActualPos = opts?.faseActualPos ?? null;

  // Fechas de entrada por posición (solo alcanzadas con fecha), para mirar la
  // "siguiente alcanzada" al medir el tramo cerrado.
  const fechaPorPos = new Map<number, string>();
  for (const f of alcanzadas) {
    if (f.fecha) fechaPorPos.set(f.posicion, f.fecha);
  }
  const posAlcanzadas = [...fechaPorPos.keys()].sort((a, b) => a - b);

  const filas: FaseVentaFluidez[] = [];
  for (let pos = 1; pos <= 14; pos++) {
    const fechaEntrada = fechaPorPos.get(pos) ?? null;
    const vref = varaPorFase.get(pos) ?? null;
    const fila: FaseVentaFluidez = {
      posicion: pos,
      fase: alcanzadas.find((f) => f.posicion === pos)?.fase ?? '',
      alcanzada: fechaEntrada != null,
      enCurso: false,
      dias: null,
      vara: vref?.vara ?? null,
      p90: vref?.p90 ?? null,
      banda: null,
    };

    if (fechaEntrada) {
      const siguiente = posAlcanzadas.find((p) => p > pos);
      if (siguiente != null) {
        // Tramo cerrado: hasta que entró a la siguiente fase alcanzada.
        const fechaSig = fechaPorPos.get(siguiente)!;
        fila.dias = diasEntre(fechaEntrada, Date.parse(`${fechaSig.slice(0, 10)}T00:00:00Z`));
      } else if (faseActualPos == null || pos === faseActualPos) {
        // Fase en curso: permanencia abierta contra hoy.
        fila.enCurso = true;
        fila.dias = diasEntre(fechaEntrada, hoyMs);
      }
      fila.banda = bandaFluidez(fila.dias, { mediana: fila.vara, p90: fila.p90 });
    }
    filas.push(fila);
  }

  const medibles = filas.filter((f) => f.dias != null && f.banda != null);
  return {
    filas,
    medibles: medibles.length,
    enObjetivo: medibles.filter((f) => f.banda === 'verde').length,
    criticas: medibles.filter((f) => f.banda === 'rojo').length,
    actual: filas.find((f) => f.enCurso) ?? null,
  };
}
