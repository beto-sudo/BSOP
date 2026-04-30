/**
 * Extrae un mensaje legible de cualquier error que venga del cliente
 * Supabase. Los `PostgrestError` tienen forma `{ message, details, hint, code }`
 * y NO heredan de `Error`, así que `err instanceof Error` da false y
 * `err.message` se pierde si solo se chequea con `instanceof`.
 *
 * Devuelve siempre string. `fallback` se usa cuando no se puede inferir
 * nada útil del error.
 */
export function getSupabaseErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;

  if (typeof err === 'string' && err.length > 0) return err;

  if (err && typeof err === 'object') {
    const e = err as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    const msg = typeof e.message === 'string' ? e.message : '';
    const hint = typeof e.hint === 'string' ? e.hint : '';
    const details = typeof e.details === 'string' ? e.details : '';

    const composed = [msg, hint, details].filter((s) => s.length > 0).join(' — ');
    if (composed.length > 0) return composed;
  }

  return fallback;
}

/**
 * Convierte cualquier valor (incluyendo `PostgrestError`) a un `Error`
 * con mensaje útil para que `feedback.error()` lo muestre completo.
 */
export function toSupabaseError(err: unknown, fallback: string): Error {
  if (err instanceof Error) return err;
  return new Error(getSupabaseErrorMessage(err, fallback));
}
