'use client';

import { useCallback } from 'react';
import type { Banco } from './types';

export type OCRResult = {
  texto_crudo: string | null;
  monto_sugerido: number | null;
  banco_sugerido_id: string | null;
  confianza: number | null;
};

const EMPTY_RESULT: OCRResult = {
  texto_crudo: null,
  monto_sugerido: null,
  banco_sugerido_id: null,
  confianza: null,
};

export function useVoucherOCR(bancos: Banco[]) {
  return useCallback(
    async (file: File | Blob): Promise<OCRResult> => {
      try {
        const { default: Tesseract } = await import('tesseract.js');
        const result = await Tesseract.recognize(file, 'spa');
        const texto = result.data.text ?? '';
        const confianza = (result.data.confidence ?? 0) / 100;

        const banco = bancos
          .filter((b) => b.patron_ocr)
          .find((b) => {
            try {
              return new RegExp(b.patron_ocr!, 'i').test(texto);
            } catch {
              return false;
            }
          });

        const candidatos = extraerCandidatosMonto(texto);
        const monto =
          candidatos.find((c) => c.cercanoAKeyword)?.valor ??
          candidatos.sort((a, b) => b.valor - a.valor)[0]?.valor ??
          null;

        return {
          texto_crudo: texto || null,
          monto_sugerido: monto,
          banco_sugerido_id: banco?.id ?? null,
          confianza,
        };
      } catch (err) {
        console.warn('[voucher-ocr] OCR falló, continuando sin sugerencia:', err);
        return EMPTY_RESULT;
      }
    },
    [bancos]
  );
}

type CandidatoMonto = { valor: number; cercanoAKeyword: boolean };

function extraerCandidatosMonto(texto: string): CandidatoMonto[] {
  const KEYWORD_RE = /(TOTAL|VENTA|IMPORTE|MONTO|CARGO)/i;
  const MONTO_RE = /\$?\s*([\d]{1,3}(?:[,.]\d{3})*[.,]\d{2})\b/g;

  const candidatos: CandidatoMonto[] = [];
  let m: RegExpExecArray | null;
  while ((m = MONTO_RE.exec(texto)) !== null) {
    const raw = m[1];
    // Normalizar coma decimal (1.234,56) o coma de miles (1,234.56).
    const normalizado =
      raw.includes('.') && raw.lastIndexOf(',') < raw.lastIndexOf('.')
        ? raw.replace(/,/g, '')
        : raw.replace(/\./g, '').replace(',', '.');
    const valor = parseFloat(normalizado);
    if (Number.isNaN(valor) || valor <= 0) continue;

    const start = Math.max(0, m.index - 30);
    const ventana = texto.slice(start, m.index);
    const cercanoAKeyword = KEYWORD_RE.test(ventana);

    candidatos.push({ valor, cercanoAKeyword });
  }
  return candidatos;
}
