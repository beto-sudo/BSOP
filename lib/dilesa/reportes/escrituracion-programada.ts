/**
 * Motor del reporte «Escrituración programada» (DILESA · Ventas) — ADR-047.
 *
 * La agenda de firmas: ventas con `fecha_firma_programada` (capturada en fase 10),
 * con su estado (pendiente de escriturar vs. ya escriturada). Ordenadas por fecha
 * descendente (lo más reciente/próximo arriba). Pura y testeable; la comparten la
 * vista y el PDF.
 *
 * Decisión (2026-06-20): se muestran TODAS las agendadas, no solo las pendientes
 * — en la práctica el flujo avanza rápido de fase 10 a escriturada, así que filtrar
 * a "pendientes" dejaba el reporte vacío. El estado por fila distingue cuáles
 * siguen pendientes; las futuras pendientes destacan arriba cuando existan.
 */
import type { VentaReporteRow } from './ventas-data';

export type FiltrosEscrituracionProgramada = {
  /** Inicio del rango `YYYY-MM-DD` (vacío = sin límite). */
  desde: string;
  hasta: string;
  proyecto: string;
};

export const FILTROS_ESCRITURACION_PROGRAMADA_VACIOS: FiltrosEscrituracionProgramada = {
  desde: '',
  hasta: '',
  proyecto: '',
};

export type FirmaProgramadaRow = {
  id: string;
  cliente: string;
  proyectoNombre: string;
  unidadIdentificador: string | null;
  vendedor: string | null;
  fecha: string;
  hora: string | null;
  monto: number;
  /** ¿Ya escrituró? (tiene número de escritura) */
  escriturada: boolean;
};

export type EscrituracionProgramadaResult = {
  /** Firmas agendadas, ordenadas por fecha/hora descendente. */
  firmas: FirmaProgramadaRow[];
  /** Agrupado por fecha de firma, ascendente. */
  porFecha: Array<{ fecha: string; firmas: number; monto: number }>;
  totalFirmas: number;
  /** Agendadas que aún no escrituran. */
  totalPendientes: number;
  totalMonto: number;
};

/** Construye el reporte. Toma las ventas no desasignadas con fecha de firma agendada. */
export function construirEscrituracionProgramada(
  rows: readonly VentaReporteRow[],
  filtros: FiltrosEscrituracionProgramada
): EscrituracionProgramadaResult {
  const filtradas = rows.filter((r) => {
    if (r.estado === 'desasignada') return false;
    if (!r.fechaFirmaProgramada) return false; // solo agendadas
    if (filtros.desde && r.fechaFirmaProgramada < filtros.desde) return false;
    if (filtros.hasta && r.fechaFirmaProgramada > filtros.hasta) return false;
    if (filtros.proyecto && r.proyectoId !== filtros.proyecto) return false;
    return true;
  });

  const firmas: FirmaProgramadaRow[] = filtradas
    .map((r) => ({
      id: r.id,
      cliente: r.cliente,
      proyectoNombre: r.proyectoNombre,
      unidadIdentificador: r.unidadIdentificador,
      vendedor: r.vendedor,
      fecha: r.fechaFirmaProgramada!,
      hora: r.horaFirmaProgramada,
      monto: r.precio ?? 0,
      escriturada: !!r.numeroEscritura,
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.hora ?? '').localeCompare(a.hora ?? ''));

  const fechaMap = new Map<string, { firmas: number; monto: number }>();
  for (const f of firmas) {
    const cur = fechaMap.get(f.fecha) ?? { firmas: 0, monto: 0 };
    cur.firmas += 1;
    cur.monto += f.monto;
    fechaMap.set(f.fecha, cur);
  }
  const porFecha = [...fechaMap.entries()]
    .map(([fecha, v]) => ({ fecha, firmas: v.firmas, monto: v.monto }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  return {
    firmas,
    porFecha,
    totalFirmas: firmas.length,
    totalPendientes: firmas.filter((f) => !f.escriturada).length,
    totalMonto: firmas.reduce((acc, f) => acc + f.monto, 0),
  };
}
