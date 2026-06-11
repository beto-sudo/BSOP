/**
 * Helpers puros del tab Estados de cuenta (iniciativa `conciliacion-bancaria`
 * v0). Separados del componente para testearlos sin montar React.
 *
 * Los 3 checks de conciliación mensual viven aquí:
 *   1. checksum interno   — saldo_inicial + depositos − retiros = saldo_final
 *   2. continuidad        — saldo_final del mes N−1 = saldo_inicial del mes N
 *   3. cruce vs snapshot  — (saldo_final + inversiones) vs erp.cuenta_saldos
 *                           en la fecha de corte
 * Todos computados al vuelo — no hay estado de conciliación persistido.
 */

import type { Moneda } from '@/components/dilesa/saldos-bancos-utils';

export type EstadoCuentaRow = {
  id: string;
  cuentaId: string;
  cuentaNombre: string;
  banco: string | null;
  moneda: Moneda;
  /** Primer día del mes (date-only `YYYY-MM-DD`). */
  periodo: string;
  fechaCorte: string;
  saldoInicial: number;
  depositos: number;
  retiros: number;
  saldoFinal: number;
  saldoInversiones: number;
  numAbonos: number | null;
  numCargos: number | null;
  comisiones: number | null;
  archivoPath: string | null;
  notas: string | null;
  createdAt: string;
};

/** Tolerancia de centavos para comparaciones de montos (redondeo bancario). */
export const TOLERANCIA = 0.01;

/** Descuadre del checksum interno: SI + depósitos − retiros − SF. 0 = cuadra. */
export function checksumDiff(r: {
  saldoInicial: number;
  depositos: number;
  retiros: number;
  saldoFinal: number;
}): number {
  // Redondeo a centavos: los 4 sumandos vienen con 2 decimales, pero la
  // resta en float puede dejar residuos tipo 1e-10.
  return Math.round((r.saldoInicial + r.depositos - r.retiros - r.saldoFinal) * 100) / 100;
}

export function checksumOk(r: {
  saldoInicial: number;
  depositos: number;
  retiros: number;
  saldoFinal: number;
}): boolean {
  return Math.abs(checksumDiff(r)) <= TOLERANCIA;
}

/** Saldo real de la cuenta al corte: vista + posición en inversiones/reporto. */
export function saldoTotalAlCorte(r: { saldoFinal: number; saldoInversiones: number }): number {
  return Math.round((r.saldoFinal + r.saldoInversiones) * 100) / 100;
}

/** `'2026-05-01'` → `'2026-04-01'` (date-only, sin objetos Date — cero TZ). */
export function mesAnterior(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number) as [number, number];
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  return `${prevY}-${String(prevM).padStart(2, '0')}-01`;
}

/** `'2026-05'` o `'2026-05-XX'` → primer día del mes `'2026-05-01'`. */
export function periodoDia1(yyyyMM: string): string {
  return `${yyyyMM.slice(0, 7)}-01`;
}

const MESES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** `'2026-05-01'` → `'Mayo 2026'`. Sin Date — date-only estable en cualquier TZ. */
export function periodoLabel(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number) as [number, number];
  const nombre = MESES_ES[m - 1];
  return nombre ? `${nombre} ${y}` : periodo;
}

export type ContinuidadCheck =
  | { status: 'ok' }
  | { status: 'descuadre'; diff: number }
  | { status: 'sin-anterior' };

/**
 * Check de continuidad inter-mes: el saldo inicial de este estado debe ser
 * el saldo final (vista) del estado del mes anterior de la misma cuenta.
 */
export function continuidadCheck(
  row: { cuentaId: string; periodo: string; saldoInicial: number },
  estados: Array<{ cuentaId: string; periodo: string; saldoFinal: number }>
): ContinuidadCheck {
  const prevPeriodo = mesAnterior(row.periodo);
  const prev = estados.find((e) => e.cuentaId === row.cuentaId && e.periodo === prevPeriodo);
  if (!prev) return { status: 'sin-anterior' };
  const diff = Math.round((row.saldoInicial - prev.saldoFinal) * 100) / 100;
  if (Math.abs(diff) <= TOLERANCIA) return { status: 'ok' };
  return { status: 'descuadre', diff };
}

export type SnapshotCheck =
  | { status: 'ok'; saldoSnapshot: number }
  | { status: 'descuadre'; diff: number; saldoSnapshot: number }
  | { status: 'sin-snapshot' };

/**
 * Cruce contra la captura manual: el snapshot de `erp.cuenta_saldos` en la
 * fecha de corte debe coincidir con el saldo total al corte (vista +
 * inversiones) del estado de cuenta.
 */
export function snapshotCheck(
  row: { cuentaId: string; fechaCorte: string; saldoFinal: number; saldoInversiones: number },
  snapshots: Array<{ cuentaId: string; fecha: string; saldo: number }>
): SnapshotCheck {
  const snap = snapshots.find((s) => s.cuentaId === row.cuentaId && s.fecha === row.fechaCorte);
  if (!snap) return { status: 'sin-snapshot' };
  const total = saldoTotalAlCorte(row);
  const diff = Math.round((total - snap.saldo) * 100) / 100;
  if (Math.abs(diff) <= TOLERANCIA) return { status: 'ok', saldoSnapshot: snap.saldo };
  return { status: 'descuadre', diff, saldoSnapshot: snap.saldo };
}

/**
 * Match de la cuenta elegida contra los identificadores extraídos del PDF
 * (CLABE > número de cuenta > contrato). Devuelve `null` si el PDF no trae
 * identificadores comparables (no hay forma de validar).
 */
export function cuentaMatchExtraccion(
  cuenta: {
    clabe: string | null;
    numeroCuenta: string | null;
    contrato: string | null;
  },
  extraccion: { clabe: string; numero_cuenta: string }
): boolean | null {
  const limpiar = (s: string | null | undefined) => (s ?? '').replace(/[\s-]/g, '');
  const exClabe = limpiar(extraccion.clabe);
  const exNumero = limpiar(extraccion.numero_cuenta);

  if (exClabe && limpiar(cuenta.clabe)) {
    return exClabe === limpiar(cuenta.clabe);
  }
  if (exNumero) {
    const numero = limpiar(cuenta.numeroCuenta);
    const contrato = limpiar(cuenta.contrato);
    if (numero || contrato) {
      return exNumero === numero || exNumero === contrato;
    }
  }
  return null;
}
