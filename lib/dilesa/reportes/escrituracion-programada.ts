/**
 * Motor del reporte «Escrituración programada» (DILESA · Ventas) — ADR-047.
 *
 * Las firmas agendadas (fase 10: `fecha_firma_programada`) que aún NO han
 * escriturado — qué se va a escriturar y cuándo. Agrupa por fecha y ordena
 * cronológicamente. Pura y testeable; la comparten la vista y el PDF.
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
};

export type EscrituracionProgramadaResult = {
  /** Firmas agendadas pendientes, ordenadas por fecha/hora ascendente. */
  firmas: FirmaProgramadaRow[];
  /** Agrupado por fecha de firma, ascendente. */
  porFecha: Array<{ fecha: string; firmas: number; monto: number }>;
  totalFirmas: number;
  totalMonto: number;
};

/**
 * Construye el reporte. Solo cuenta ventas con `fecha_firma_programada` que aún
 * NO han escriturado (las ya escrituradas cumplieron) y no están desasignadas.
 */
export function construirEscrituracionProgramada(
  rows: readonly VentaReporteRow[],
  filtros: FiltrosEscrituracionProgramada
): EscrituracionProgramadaResult {
  const filtradas = rows.filter((r) => {
    if (r.estado === 'desasignada') return false;
    if (!r.fechaFirmaProgramada) return false; // solo agendadas
    if (r.numeroEscritura) return false; // ya escrituró → cumplida
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
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora ?? '').localeCompare(b.hora ?? ''));

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
    totalMonto: firmas.reduce((acc, f) => acc + f.monto, 0),
  };
}
