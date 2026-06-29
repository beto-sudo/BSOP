/**
 * Motor del reporte «Detonaciones / Depósitos» (DILESA · Ventas) — ADR-047.
 *
 * Lista los DEPÓSITOS recibidos (cobranza de ventas) cuya fecha cae en el rango,
 * con desglose por mes y por origen (cliente vs institución). La «detonación»
 * contable = el abono de institución que libera el crédito y cierra la fase 12;
 * el reporte la marca como subconjunto `fuente='institucion'`. Pura y testeable;
 * la comparten la vista, el PDF y el CSV.
 */
import type { DepositoReporteRow, FuenteDeposito } from './detonaciones-data';

export type FiltrosDetonaciones = {
  /** Inicio del rango `YYYY-MM-DD` (vacío = sin límite inferior). */
  desde: string;
  /** Fin del rango `YYYY-MM-DD` (vacío = sin límite superior). */
  hasta: string;
  /** Origen del depósito: '' = todos. */
  fuente: '' | FuenteDeposito;
  proyecto: string;
};

export const FILTROS_DETONACIONES_VACIOS: FiltrosDetonaciones = {
  desde: '',
  hasta: '',
  fuente: '',
  proyecto: '',
};

export type DetonacionMesRow = {
  mes: string;
  /** Conteo de depósitos del mes. */
  depositos: number;
  monto: number;
  montoCliente: number;
  montoInstitucion: number;
};

export type DetonacionesResult = {
  /** Depósitos ligados a una venta, en el rango, ordenados por fecha desc. */
  depositos: DepositoReporteRow[];
  /** Depósitos sin venta ligada (a vigilar en el cuadre), fecha desc. */
  sinLigar: DepositoReporteRow[];
  /** Desglose por mes, ascendente. */
  porMes: DetonacionMesRow[];
  totalDepositos: number;
  totalMonto: number;
  totalCliente: number;
  totalInstitucion: number;
  /** Depósitos de institución (las «detonaciones» propiamente). */
  detonaciones: number;
};

function enRango(fecha: string, desde: string, hasta: string): boolean {
  if (desde && fecha < desde) return false;
  if (hasta && fecha > hasta) return false;
  return true;
}

/** Construye el reporte de depósitos/detonaciones a partir de las filas normalizadas. */
export function construirDetonaciones(
  rows: readonly DepositoReporteRow[],
  filtros: FiltrosDetonaciones
): DetonacionesResult {
  // Rango + origen aplican a todo; el filtro de proyecto solo aplica a los
  // ligados (un depósito sin venta no tiene proyecto y quedaría siempre fuera).
  const enRangoYFuente = rows.filter(
    (r) =>
      enRango(r.fecha, filtros.desde, filtros.hasta) &&
      (!filtros.fuente || r.fuente === filtros.fuente)
  );

  const ligados = enRangoYFuente
    .filter((r) => r.ventaId !== null)
    .filter((r) => !filtros.proyecto || r.proyectoId === filtros.proyecto)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.monto - a.monto);

  // Los «sin ligar» se omiten cuando se filtra por proyecto (no tienen uno).
  const sinLigar = filtros.proyecto
    ? []
    : enRangoYFuente
        .filter((r) => r.ventaId === null)
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.monto - a.monto);

  const todos = [...ligados, ...sinLigar];

  const mesMap = new Map<string, DetonacionMesRow>();
  for (const d of todos) {
    const cur =
      mesMap.get(d.mes) ??
      ({
        mes: d.mes,
        depositos: 0,
        monto: 0,
        montoCliente: 0,
        montoInstitucion: 0,
      } as DetonacionMesRow);
    cur.depositos += 1;
    cur.monto += d.monto;
    if (d.fuente === 'cliente') cur.montoCliente += d.monto;
    else if (d.fuente === 'institucion') cur.montoInstitucion += d.monto;
    mesMap.set(d.mes, cur);
  }
  const porMes = [...mesMap.values()].sort((a, b) => a.mes.localeCompare(b.mes));

  const totalMonto = todos.reduce((acc, d) => acc + d.monto, 0);
  const totalCliente = todos
    .filter((d) => d.fuente === 'cliente')
    .reduce((acc, d) => acc + d.monto, 0);
  const totalInstitucion = todos
    .filter((d) => d.fuente === 'institucion')
    .reduce((acc, d) => acc + d.monto, 0);

  return {
    depositos: ligados,
    sinLigar,
    porMes,
    totalDepositos: todos.length,
    totalMonto,
    totalCliente,
    totalInstitucion,
    detonaciones: todos.filter((d) => d.fuente === 'institucion').length,
  };
}
