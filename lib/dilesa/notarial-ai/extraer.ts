/**
 * Extracción IA de documentos notariales del expediente de venta (Fase 8 —
 * Dictaminada): Carta de Instrucción Notarial y Carta de Condiciones
 * Financieras Definitivas (Anexo B).
 *
 * Diseñada para los formatos del Sistema de Titulación Notarial de INFONAVIT
 * pero genérica a propósito: con cartas equivalentes de FOVISSSTE o de banca
 * hipotecaria extrae lo que encuentre; lo ausente regresa como ""/0 y el
 * operador lo captura a mano (la precarga nunca bloquea).
 *
 * Convención de ausentes (límite Anthropic de 16 union types en el schema):
 * campos planos sin nullables — "" para strings y 0 para números. El
 * consumidor trata ""/0 como "no extraído".
 *
 * Iniciativa dilesa-ventas-expediente.
 */
import { generateObject } from 'ai';
import { z } from 'zod';
import { anthropic, MODELO_CLAUDE } from '@/lib/documentos/extraction-core';

export const NotarialExtraccionSchema = z.object({
  tipo_documento: z.enum(['carta_instruccion', 'condiciones_financieras', 'otro']),
  nombre_titular: z.string(),
  nss: z.string(),
  numero_credito: z.string(),
  institucion_credito: z.string(),
  precio_compraventa: z.number(),
  monto_credito: z.number(),
  gastos_titulacion: z.number(),
  impuestos_derechos: z.number(),
  costo_avaluo: z.number(),
  domicilio_inmueble: z.string(),
  vendedor: z.string(),
  clabe_beneficiario: z.string(),
  banco_beneficiario: z.string(),
});
export type NotarialExtraccion = z.infer<typeof NotarialExtraccionSchema>;

const PROMPT =
  `Eres un analista hipotecario mexicano. El PDF es un documento que un notario ` +
  `envía a una desarrolladora de vivienda durante la titulación de un crédito ` +
  `hipotecario — típicamente una "Carta de Instrucción Notarial" o una "Carta de ` +
  `Condiciones Financieras Definitivas (Anexo B)" de INFONAVIT, aunque puede venir ` +
  `de FOVISSSTE o de un banco. Extrae los campos solicitados.\n\n` +
  `Guía de mapeo:\n` +
  `- precio_compraventa: "Precio de compra-venta" (carta de instrucción). Es el valor ` +
  `de escrituración de la vivienda.\n` +
  `- monto_credito: "Monto del Crédito Otorgado" (condiciones financieras) o "Importe ` +
  `garantizado con la hipoteca" (carta de instrucción) si el otorgado no aparece.\n` +
  `- numero_credito: "Número de Crédito" del titular.\n` +
  `- institucion_credito: la institución que otorga el crédito (INFONAVIT, FOVISSSTE, ` +
  `nombre del banco). En mayúsculas.\n` +
  `- gastos_titulacion: "Monto de Gastos de Titulación".\n` +
  `- impuestos_derechos: "Monto de Impuestos y Derechos".\n` +
  `- costo_avaluo: "Monto del costo del avalúo".\n` +
  `- nss: Número de Seguridad Social del titular (solo dígitos).\n` +
  `- domicilio_inmueble: domicilio completo del inmueble objeto del crédito/garantía.\n` +
  `- vendedor: nombre/razón social del vendedor.\n` +
  `- clabe_beneficiario: CLABE de la cuenta de depósito del beneficiario/vendedor ` +
  `(18 dígitos, solo dígitos).\n` +
  `- banco_beneficiario: banco de esa cuenta.\n\n` +
  `Campos ausentes: usa "" para strings y 0 para números. NO inventes valores. ` +
  `Los montos van como número sin símbolos ni comas (ej. 835566.99).`;

export async function extraerDocNotarial(pdfBytes: Uint8Array): Promise<NotarialExtraccion> {
  const { object } = await generateObject({
    model: anthropic(MODELO_CLAUDE),
    schema: NotarialExtraccionSchema,
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
  return object;
}
