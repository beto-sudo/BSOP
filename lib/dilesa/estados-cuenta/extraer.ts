/**
 * Extracción IA de la carátula de un estado de cuenta bancario (PDF).
 *
 * Iniciativa `conciliacion-bancaria` v0. Mismo stack que
 * `lib/documentos/extraction-core` (Claude vía `@ai-sdk/anthropic` +
 * `generateObject` con zod): el PDF completo va al modelo y regresa los
 * totales de carátula estructurados. El humano confirma en el drawer antes
 * de persistir — la IA prellenan, no decide (D4 del planning doc).
 *
 * Convención del schema (límite Anthropic de unions): cero campos nullable.
 * Strings ausentes = "", números ausentes = 0. El consumidor normaliza.
 * No usar `.int()` — la API rechaza minimum/maximum implícitos (ver memoria
 * del repo); los conteos llegan como number y se redondean al persistir.
 */

import { z } from 'zod';

import { runGenerateObject } from '@/lib/ai';

export const ExtraccionEstadoCuentaSchema = z.object({
  banco: z
    .string()
    .describe(
      'Nombre comercial del banco emisor: "BBVA", "Banca Afirme", "Monex", "Finamex", etc.'
    ),
  titular: z.string().describe('Razón social del titular de la cuenta. "" si no aparece.'),
  numero_cuenta: z
    .string()
    .describe(
      'Número de cuenta tal como aparece. Si el estado solo maneja número de CONTRATO (ej. Monex), usa ese. "" si no aparece.'
    ),
  clabe: z.string().describe('CLABE interbancaria (18 dígitos, sin espacios). "" si no aparece.'),
  periodo_inicio: z
    .string()
    .describe('Primer día del periodo del estado, formato YYYY-MM-DD (ej. "2026-05-01").'),
  fecha_corte: z
    .string()
    .describe('Fecha de corte (último día del periodo), formato YYYY-MM-DD (ej. "2026-05-31").'),
  moneda: z.string().describe('Moneda de la cuenta: "MXN" o "USD".'),
  saldo_inicial: z
    .number()
    .describe(
      'Saldo inicial del periodo (BBVA: "Saldo de Operación Inicial"; Afirme: "Saldo inicial"; Monex: "Saldo inicial" del resumen en pesos).'
    ),
  depositos: z.number().describe('Total de depósitos/abonos del periodo, como número positivo.'),
  retiros: z
    .number()
    .describe(
      'Total de retiros/cargos del periodo, como número positivo (incluye comisiones e IVA cuando el banco los suma al total de retiros).'
    ),
  saldo_final: z
    .number()
    .describe(
      'Saldo final al corte de la cuenta VISTA (BBVA: "Saldo Final (+)"; Afirme: "Saldo al corte"; Monex: "Saldo total" del resumen). NO incluyas aquí la posición en inversiones/reporto.'
    ),
  saldo_inversiones: z
    .number()
    .describe(
      'Valuación de la posición en inversiones/reporto AL CORTE si el estado la reporta por separado (Monex: sección "Valuación de la cartera / Posición en reporto", columna de valuación al último día del periodo). 0 si no aplica o no existe esa sección.'
    ),
  num_abonos: z
    .number()
    .describe('Número de movimientos de depósito/abono si el estado lo indica (BBVA sí). 0 si no.'),
  num_cargos: z
    .number()
    .describe('Número de movimientos de retiro/cargo si el estado lo indica (BBVA sí). 0 si no.'),
  comisiones: z
    .number()
    .describe(
      'Total de comisiones cobradas en el periodo según el resumen de comisiones (sin IVA si viene desglosado). 0 si no se indica.'
    ),
});

export type ExtraccionEstadoCuenta = z.infer<typeof ExtraccionEstadoCuentaSchema>;

const PROMPT =
  `Eres un analista de tesorería especializado en estados de cuenta bancarios mexicanos ` +
  `(BBVA, Afirme, Monex, Finamex, Banorte, etc.). Analiza el PDF y extrae los datos de la ` +
  `CARÁTULA / RESUMEN del periodo (no el detalle de movimientos).` +
  `\n\nReglas importantes:` +
  `\n- Los montos van como números positivos con sus decimales exactos (sin separadores de miles).` +
  `\n- Verifica la aritmética antes de responder: saldo_inicial + depositos − retiros debe dar ` +
  `saldo_final. Si no cuadra, revisa si el banco desglosa comisiones/IVA fuera del total de ` +
  `retiros (Afirme suma comisiones + IVA dentro de "Retiros" de la carátula página 2; BBVA ya ` +
  `los incluye en "Retiros / Cargos").` +
  `\n- Monex: el "Resumen Cuenta / Peso Mexicano" trae saldo inicial, total abonos, total cargos ` +
  `y saldo total — eso es la cuenta VISTA. La posición en reporto vive aparte en "Resumen de ` +
  `operaciones otros mercados / Posición en reporto": reporta en saldo_inversiones la valuación ` +
  `total al último día del periodo (la columna derecha de la tabla). Si no hay posición, 0.` +
  `\n- Estados en dólares (BBVA USD): moneda = "USD".` +
  `\n- Campos string ausentes = "" y números ausentes = 0 (NO inventes valores).`;

/**
 * Llama a Claude con el PDF del estado de cuenta y devuelve la carátula
 * estructurada. El caller decide qué hacer con ella (prellenar el form).
 */
export async function extraerEstadoCuentaIA(pdfBytes: Uint8Array): Promise<ExtraccionEstadoCuenta> {
  return runGenerateObject({
    usoId: 'dilesa-estado-cuenta',
    schema: ExtraccionEstadoCuentaSchema,
    maxRetries: 3,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'file', data: pdfBytes, mediaType: 'application/pdf' },
        ],
      },
    ],
  });
}
