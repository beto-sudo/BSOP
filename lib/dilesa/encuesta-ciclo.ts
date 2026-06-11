/**
 * Lógica pura del ciclo de envío de la Encuesta de Conformidad (Fase 16).
 *
 * Timeline definido por Beto (2026-06-10):
 *   - Entrega (F15) cierra → encuesta programada para fecha_entrega + 2 días
 *     (el cliente ya vive la casa y puede revisarla sin la presión de la
 *     entrega).
 *   - Día del envío → intento 1 (correo con la liga).
 *   - +1 día sin respuesta → intento 2 (recordatorio).
 *   - +1 día sin respuesta → intento 3 (último aviso).
 *   - +1 día sin respuesta → pasa a Atención a Clientes (captura telefónica
 *     o marcar "sin respuesta").
 *
 * El cron diario (`/api/cron/dilesa-encuestas`) evalúa cada encuesta con
 * `accionParaEncuesta` y ejecuta. Responder la encuesta (en cualquier
 * momento — el token dura 90 días) corta el ciclo: estado='respondida'.
 */

export type EncuestaCicloRow = {
  estado: string;
  /** YYYY-MM-DD */
  programada_para: string;
  intentos: number;
  /** ISO timestamptz del último envío (null si nunca se ha enviado). */
  ultimo_envio_at: string | null;
};

export type AccionCiclo = 'enviar_inicial' | 'recordatorio' | 'ultimo_aviso' | 'pasar_a_atencion';

/**
 * Decide la acción del día para una encuesta (o null si no toca nada hoy).
 * `hoy` en formato YYYY-MM-DD — comparación lexicográfica de fechas.
 */
export function accionParaEncuesta(e: EncuestaCicloRow, hoy: string): AccionCiclo | null {
  if (e.estado === 'programada') {
    return e.programada_para <= hoy ? 'enviar_inicial' : null;
  }
  if (e.estado !== 'enviada') return null;

  const ultimoDia = (e.ultimo_envio_at ?? '').slice(0, 10);
  // Sin registro de envío (no debería pasar en estado 'enviada') o ya se
  // envió hoy → esperar al siguiente día.
  if (!ultimoDia || ultimoDia >= hoy) return null;

  if (e.intentos <= 1) return 'recordatorio';
  if (e.intentos === 2) return 'ultimo_aviso';
  return 'pasar_a_atencion';
}
