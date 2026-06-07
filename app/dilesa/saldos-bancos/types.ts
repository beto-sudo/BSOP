/**
 * Tipos compartidos entre la server action (`actions.ts`) y el cliente
 * (`components/dilesa/saldos-bancos-module.tsx`). Viven en un `.ts` plano
 * (no en el módulo `'use server'`, que solo puede exportar funciones async;
 * tampoco en el client component, para no arrastrar su árbol al server —
 * ver memoria `feedback_use_client_constants_import`).
 */

export type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

export type CapturarSaldoInput = {
  cuentaId: string;
  /** YYYY-MM-DD. */
  fecha: string;
  /** Llega como string desde el form para preservar precisión del numeric. */
  saldo: string;
  notas?: string;
};
