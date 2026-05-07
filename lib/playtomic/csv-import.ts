/**
 * Parser del CSV de pagos de Playtomic Manager.
 *
 * Formato: delimiter `;`, decimales con `,`, fechas DD/MM/YYYY HH:MM,
 * "-" representa null, líneas iniciales son resumen del documento (Subtotal,
 * Taxes, Total) que se ignoran hasta encontrar el header de columnas.
 *
 * El header real empieza con "Corporate Name;Club payment id;...". Las
 * fechas se interpretan en zona horaria del club (America/Matamoros) ya
 * que el reporte se descarga con esa configuración.
 */

export type PaymentImportRow = {
  payment_id: string;
  club_payment_id: string | null;
  refund_id: string | null;
  corporate_name: string | null;
  user_id: string | null;
  user_name: string | null;
  payout_code: string | null;
  sport: string | null;
  product_sku: string | null;
  origin: string | null;
  service_date: string | null; // ISO timestamp UTC
  payment_date: string | null;
  payment_method: string | null;
  payment_type: string | null;
  payment_status: string | null;
  currency: string | null;
  total: number | null;
  subtotal: number | null;
  taxes: number | null;
  tax_rate: number | null;
  net_amount_transferred: number | null;
  b2b_fee_rate: number | null;
  b2b_fee_total: number | null;
  b2b_fee_subtotal: number | null;
  b2b_fee_taxes: number | null;
  b2b_fee_tax_rate: number | null;
  non_applicable_total: number | null;
  non_applicable_subtotal: number | null;
  non_applicable_taxes: number | null;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  invoice_payer: string | null;
  store_product_name: string | null;
  store_product_quantity: number | null;
  campaign_id: string | null;
  campaign_name: string | null;
};

export type ParseResult = {
  rows: PaymentImportRow[];
  errors: { line: number; reason: string }[];
};

const HEADER_FIRST_COL = 'Corporate Name';

const COLUMN_INDEX: Record<keyof PaymentImportRow, number> = {
  corporate_name: 0,
  club_payment_id: 1,
  payment_id: 2,
  refund_id: 3,
  user_id: 4,
  user_name: 5,
  payout_code: 6,
  sport: 7,
  product_sku: 8,
  origin: 9,
  service_date: 10,
  payment_date: 11,
  payment_method: 12,
  payment_type: 13,
  payment_status: 14,
  currency: 15,
  total: 16,
  subtotal: 17,
  taxes: 18,
  tax_rate: 19,
  net_amount_transferred: 20,
  b2b_fee_rate: 21,
  b2b_fee_total: 22,
  b2b_fee_subtotal: 23,
  b2b_fee_taxes: 24,
  b2b_fee_tax_rate: 25,
  non_applicable_total: 26,
  non_applicable_subtotal: 27,
  non_applicable_taxes: 28,
  invoice_id: 29,
  invoice_number: 30,
  invoice_date: 31,
  invoice_payer: 32,
  store_product_name: 33,
  store_product_quantity: 34,
  campaign_id: 35,
  campaign_name: 36,
};

function nullable(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === 'N/A') return null;
  return trimmed;
}

export function parseAmount(value: string | undefined): number | null {
  const t = nullable(value);
  if (!t) return null;
  // Formato Playtomic: miles separados por `.` y decimales por `,`
  // Ej: "1.234,56" → 1234.56 ; "200" → 200 ; "0,08" → 0.08
  const normalized = t.replace(/\./g, '').replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

/**
 * Convierte "DD/MM/YYYY HH:MM" en zona local del club a ISO UTC.
 *
 * El club RDB opera con horario fijo CST (UTC-6) sin DST — así marca
 * Playtomic Manager el reporte. Aunque America/Matamoros (frontera) sí
 * adopta DST por sincronización con EE.UU., operativamente todas las
 * horas del módulo Playtomic se manejan en UTC-6 estable.
 *
 * Ejemplo: "06/05/2026 20:00" → "2026-05-07T02:00:00.000Z".
 */
export function parsePlaytomicDate(value: string | undefined): string | null {
  const t = nullable(value);
  if (!t) return null;
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh = '00', min = '00'] = m;

  // Offset fijo UTC-6 (CST puro, sin DST). Coincide con la TZ que
  // exporta el reporte de Playtomic Manager.
  const iso = `${yyyy}-${mm}-${dd}T${hh}:${min}:00-06:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function splitCsvLine(line: string): string[] {
  // El reporte de Playtomic no usa quoting (no hay `;` dentro de campos),
  // así que un split simple por `;` basta. Si en el futuro aparecen comillas,
  // reemplazar por papaparse.
  return line.split(';');
}

export function parsePaymentsCsv(csvText: string): ParseResult {
  const errors: { line: number; reason: string }[] = [];
  const rows: PaymentImportRow[] = [];

  const lines = csvText.split(/\r?\n/);
  let headerLineIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith(HEADER_FIRST_COL)) {
      headerLineIndex = i;
      break;
    }
  }

  if (headerLineIndex === -1) {
    errors.push({ line: 0, reason: `No se encontró el header "${HEADER_FIRST_COL}" en el CSV.` });
    return { rows, errors };
  }

  const seenPaymentIds = new Set<string>();

  for (let i = headerLineIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || line.trim() === '') continue;

    const cols = splitCsvLine(line);
    if (cols.length < 16) {
      errors.push({
        line: i + 1,
        reason: `Línea con ${cols.length} columnas (esperadas ≥16). Saltada.`,
      });
      continue;
    }

    const paymentId = nullable(cols[COLUMN_INDEX.payment_id]);
    if (!paymentId) {
      errors.push({ line: i + 1, reason: 'Sin payment_id, fila saltada.' });
      continue;
    }
    if (seenPaymentIds.has(paymentId)) {
      errors.push({
        line: i + 1,
        reason: `payment_id duplicado en el archivo: ${paymentId}. Conservada la primera.`,
      });
      continue;
    }
    seenPaymentIds.add(paymentId);

    rows.push({
      payment_id: paymentId,
      club_payment_id: nullable(cols[COLUMN_INDEX.club_payment_id]),
      refund_id: nullable(cols[COLUMN_INDEX.refund_id]),
      corporate_name: nullable(cols[COLUMN_INDEX.corporate_name]),
      user_id: nullable(cols[COLUMN_INDEX.user_id]),
      user_name: nullable(cols[COLUMN_INDEX.user_name]),
      payout_code: nullable(cols[COLUMN_INDEX.payout_code]),
      sport: nullable(cols[COLUMN_INDEX.sport]),
      product_sku: nullable(cols[COLUMN_INDEX.product_sku]),
      origin: nullable(cols[COLUMN_INDEX.origin]),
      service_date: parsePlaytomicDate(cols[COLUMN_INDEX.service_date]),
      payment_date: parsePlaytomicDate(cols[COLUMN_INDEX.payment_date]),
      payment_method: nullable(cols[COLUMN_INDEX.payment_method]),
      payment_type: nullable(cols[COLUMN_INDEX.payment_type]),
      payment_status: nullable(cols[COLUMN_INDEX.payment_status]),
      currency: nullable(cols[COLUMN_INDEX.currency]),
      total: parseAmount(cols[COLUMN_INDEX.total]),
      subtotal: parseAmount(cols[COLUMN_INDEX.subtotal]),
      taxes: parseAmount(cols[COLUMN_INDEX.taxes]),
      tax_rate: parseAmount(cols[COLUMN_INDEX.tax_rate]),
      net_amount_transferred: parseAmount(cols[COLUMN_INDEX.net_amount_transferred]),
      b2b_fee_rate: parseAmount(cols[COLUMN_INDEX.b2b_fee_rate]),
      b2b_fee_total: parseAmount(cols[COLUMN_INDEX.b2b_fee_total]),
      b2b_fee_subtotal: parseAmount(cols[COLUMN_INDEX.b2b_fee_subtotal]),
      b2b_fee_taxes: parseAmount(cols[COLUMN_INDEX.b2b_fee_taxes]),
      b2b_fee_tax_rate: parseAmount(cols[COLUMN_INDEX.b2b_fee_tax_rate]),
      non_applicable_total: parseAmount(cols[COLUMN_INDEX.non_applicable_total]),
      non_applicable_subtotal: parseAmount(cols[COLUMN_INDEX.non_applicable_subtotal]),
      non_applicable_taxes: parseAmount(cols[COLUMN_INDEX.non_applicable_taxes]),
      invoice_id: nullable(cols[COLUMN_INDEX.invoice_id]),
      invoice_number: nullable(cols[COLUMN_INDEX.invoice_number]),
      invoice_date: parsePlaytomicDate(cols[COLUMN_INDEX.invoice_date]),
      invoice_payer: nullable(cols[COLUMN_INDEX.invoice_payer]),
      store_product_name: nullable(cols[COLUMN_INDEX.store_product_name]),
      store_product_quantity: parseAmount(cols[COLUMN_INDEX.store_product_quantity]),
      campaign_id: nullable(cols[COLUMN_INDEX.campaign_id]),
      campaign_name: nullable(cols[COLUMN_INDEX.campaign_name]),
    });
  }

  return { rows, errors };
}
