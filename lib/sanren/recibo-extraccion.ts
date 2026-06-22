/**
 * Extracción IA de un recibo de servicios (PDF/imagen) — iniciativa
 * sanren-servicios, Sprint 5. Mismo stack que lib/dilesa/estados-cuenta/extraer:
 * Claude vía `runGenerateObject` (lib/ai) con visión; el documento va al modelo
 * y regresa los campos estructurados. La IA **prellena**, el humano confirma en
 * la captura antes de guardar.
 *
 * Convención del schema (límite Anthropic): cero campos nullable; strings
 * ausentes = "", números ausentes = 0. Sin `.int()` (la API rechaza min/max
 * implícitos; ver memoria del repo). El consumidor normaliza/redondea.
 */

import { z } from 'zod';

import { runGenerateObject } from '@/lib/ai';

export const ExtraccionReciboSchema = z.object({
  tipo_servicio: z.string().describe('Tipo de servicio: "luz", "gas" o "agua".'),
  proveedor: z
    .string()
    .describe(
      'Emisor: "CFE", "SIMAS", "Conagas" (Compañía Nacional de Gas), etc. "" si no aparece.'
    ),
  titular: z.string().describe('Nombre del titular de la cuenta. "" si no aparece.'),
  domicilio: z.string().describe('Domicilio del servicio. "" si no aparece.'),
  numero_cuenta: z
    .string()
    .describe('Número de cuenta / servicio / clave de localización. "" si no aparece.'),
  numero_medidor: z.string().describe('Número de medidor. "" si no aparece.'),
  tarifa: z
    .string()
    .describe(
      'Tarifa del servicio: CFE "DAC"/"1"/"1C"/"GDMTH"; agua "D-Doméstico"; gas "Volumétrica Doméstica". "" si no aparece.'
    ),
  periodo_inicio: z
    .string()
    .describe('Inicio del periodo facturado, YYYY-MM-DD. "" si no aparece.'),
  periodo_fin: z.string().describe('Fin del periodo facturado, YYYY-MM-DD. "" si no aparece.'),
  fecha_recibo: z
    .string()
    .describe('Fecha de emisión/corte del recibo, YYYY-MM-DD. "" si no aparece.'),
  fecha_vencimiento: z.string().describe('Fecha límite de pago, YYYY-MM-DD. "" si no aparece.'),
  folio: z.string().describe('Folio / requerimiento de pago / número de recibo. "" si no aparece.'),
  lectura_consumo_anterior: z
    .number()
    .describe(
      'Lectura anterior del medidor de CONSUMO (primer renglón de la tabla). 0 si no aparece.'
    ),
  lectura_consumo_actual: z
    .number()
    .describe('Lectura actual del medidor de CONSUMO (primer renglón). 0 si no aparece.'),
  consumo: z
    .number()
    .describe('Consumo del periodo (kWh para luz, m³ para gas/agua). 0 si no aparece.'),
  unidad_consumo: z.string().describe('Unidad del consumo: "kWh" o "m³".'),
  lectura_produccion_anterior: z
    .number()
    .describe(
      'SOLO CFE con paneles (NETMET): lectura anterior del medidor de GENERACIÓN. Aparece en un SEGUNDO renglón de la tabla de Energía (etiquetado "Basico" u otro), con lecturas GRANDES (~100,000). 0 si no aplica.'
    ),
  lectura_produccion_actual: z
    .number()
    .describe(
      'SOLO CFE con paneles (NETMET): lectura actual del medidor de generación (segundo renglón). 0 si no aplica.'
    ),
  generacion: z
    .number()
    .describe(
      'SOLO CFE con paneles: kWh GENERADOS en el periodo = "Total periodo" del segundo renglón (lectura_produccion_actual − anterior). 0 si no aplica.'
    ),
  energia_acumulada_favor: z
    .number()
    .describe(
      'SOLO CFE NETMET: kWh a favor acumulados en el banco de energía ("Usted cuenta con N kwh a favor por energía acumulada"). 0 si no aplica.'
    ),
  subtotal: z.number().describe('Subtotal antes de IVA. 0 si no aparece.'),
  iva: z.number().describe('IVA del recibo. 0 si no aparece.'),
  total: z.number().describe('Total a pagar del recibo.'),
  saldo_favor: z
    .number()
    .describe('Saldo a favor / depósito / saldo anterior a favor del titular. 0 si no aplica.'),
  conceptos: z
    .array(z.object({ concepto: z.string(), importe: z.number() }))
    .describe('Desglose de cargos del recibo: cada línea con su concepto e importe.'),
});

export type ExtraccionRecibo = z.infer<typeof ExtraccionReciboSchema>;

const PROMPT =
  `Eres un asistente que lee recibos de servicios de la casa en México ` +
  `(CFE/luz, SIMAS/agua, Conagas/gas natural). Analiza el documento y extrae los ` +
  `campos del schema.` +
  `\n\nReglas:` +
  `\n- Montos como números positivos con decimales, sin separadores de miles ni signo de pesos.` +
  `\n- Fechas en formato YYYY-MM-DD (convierte "15-JUN-26" → "2026-06-15", "2026,05" → usa el periodo).` +
  `\n- Lecturas del medidor de CONSUMO: toma la anterior y la actual (primer renglón de la tabla de Energía/Lecturas) → lectura_consumo_anterior/actual; el consumo del periodo es su diferencia (o el valor etiquetado como consumo).` +
  `\n- IMPORTANTE — CFE con paneles (el recibo dice "NETMET" o es generación distribuida): la tabla de Energía tiene DOS renglones. El PRIMERO ("Energía (kWh)", lecturas de decenas de miles) es el CONSUMO de la red. El SEGUNDO (suele etiquetarse "Basico", con lecturas GRANDES del orden de 100,000) es la PRODUCCIÓN de los paneles → lectura_produccion_anterior/actual y su total del periodo en "generacion". Si el recibo dice "Usted cuenta con N kwh a favor por energía acumulada", pon N en energia_acumulada_favor.` +
  `\n- "conceptos" = el desglose de cargos (ej. agua: "Suministro de agua potable", "Drenaje", "IVA"; gas: "Precio de adquisición", "Tarifa volumétrica", "Cargo por servicio", "IVA"; luz: "Energía", "IVA", "DAP").` +
  `\n- Strings ausentes = "" y números ausentes = 0. NO inventes valores: si un dato no está en el recibo, déjalo vacío/cero.`;

/** Estado actual del recibo, para no pisar lo ya capturado. */
export type ReciboActual = {
  monto: number | null;
  lectura_consumo: number | null;
  lectura_produccion: number | null;
  folio: string | null;
};

/**
 * Mapea la extracción IA a un patch de `sanren.recibos`. Política: **completar
 * vacíos, no pisar lo capturado**. Los campos nuevos (vencimiento/subtotal/iva/
 * tarifa) + el jsonb crudo siempre se escriben; monto/lectura/folio solo si el
 * recibo no los tiene ya (los de Coda son confiables).
 */
export function mapExtraccionToUpdate(
  e: ExtraccionRecibo,
  actual: ReciboActual,
  nowIso: string
): Record<string, unknown> {
  const upd: Record<string, unknown> = {
    extraccion: e,
    extraccion_at: nowIso,
    fecha_vencimiento: e.fecha_vencimiento || null,
    subtotal: e.subtotal > 0 ? e.subtotal : null,
    iva: e.iva > 0 ? e.iva : null,
    tarifa: e.tarifa || null,
  };
  if (actual.monto == null && e.total > 0) upd.monto = e.total;
  if (actual.lectura_consumo == null && e.lectura_consumo_actual > 0)
    upd.lectura_consumo = e.lectura_consumo_actual;
  // Reconstruir la lectura de producción cuando el layout del recibo CFE la
  // trunca (p.ej. lee "4,711" en vez de "104,711"): si la actual no supera a la
  // anterior pero hay generación, la lectura correcta es anterior + generación.
  let lecturaProdActual = e.lectura_produccion_actual;
  if (
    e.generacion > 0 &&
    e.lectura_produccion_anterior > 0 &&
    lecturaProdActual <= e.lectura_produccion_anterior
  ) {
    lecturaProdActual = e.lectura_produccion_anterior + e.generacion;
  }
  if (actual.lectura_produccion == null && lecturaProdActual > 0)
    upd.lectura_produccion = lecturaProdActual;
  if (!actual.folio && e.folio) upd.folio = e.folio;
  return upd;
}

/** Quita basura previa al header `%PDF` (los recibos de SIMAS la traen). */
function sanitizePdf(bytes: Uint8Array, mediaType: string): Uint8Array {
  if (mediaType !== 'application/pdf') return bytes;
  const head = Buffer.from(bytes.subarray(0, 2048)).indexOf('%PDF');
  return head > 0 ? bytes.subarray(head) : bytes;
}

/**
 * Lee el recibo con Claude (visión) y devuelve los campos estructurados. El
 * caller decide qué hacer con ellos (prellenar el form / persistir en jsonb).
 */
export async function extraerReciboIA(
  bytes: Uint8Array,
  mediaType: string
): Promise<ExtraccionRecibo> {
  const data = sanitizePdf(bytes, mediaType);
  return runGenerateObject({
    usoId: 'sanren-recibo-extraccion',
    schema: ExtraccionReciboSchema,
    maxRetries: 3,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'file', data, mediaType },
        ],
      },
    ],
  });
}
