/**
 * Tipos compartidos entre el drawer de estados de cuenta (client) y la
 * server action `guardarEstadoCuenta`. Viven aparte porque los módulos
 * `'use server'` solo pueden exportar funciones async.
 */

export type GuardarEstadoCuentaInput = {
  /** id existente para re-captura (upsert explícito); undefined = alta. */
  id?: string;
  cuentaId: string;
  /** Mes del periodo en formato `YYYY-MM` (el action lo normaliza a día 1). */
  periodo: string;
  /** Fecha de corte `YYYY-MM-DD`. */
  fechaCorte: string;
  // Montos como string para preservar precisión desde el form (patrón
  // de `capturarSaldo`).
  saldoInicial: string;
  depositos: string;
  retiros: string;
  saldoFinal: string;
  saldoInversiones: string;
  numAbonos?: string;
  numCargos?: string;
  comisiones?: string;
  /** Path del PDF dentro del bucket `adjuntos` (ya subido por el browser). */
  archivoPath?: string;
  /** Payload crudo de la extracción IA, para audit (jsonb). */
  extraccion?: unknown;
  notas?: string;
};

export type ActionResult = { ok: true } | { ok: false; error: string };
