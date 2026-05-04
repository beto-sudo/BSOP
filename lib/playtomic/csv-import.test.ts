import { describe, expect, it } from 'vitest';
import { parseAmount, parsePaymentsCsv, parsePlaytomicDate } from './csv-import';

describe('parseAmount', () => {
  it('parses simple integer', () => {
    expect(parseAmount('200')).toBe(200);
  });

  it('parses decimal with comma separator', () => {
    expect(parseAmount('185,19')).toBeCloseTo(185.19);
    expect(parseAmount('0,08')).toBeCloseTo(0.08);
  });

  it('parses thousands with dot + decimals with comma', () => {
    expect(parseAmount('1.234,56')).toBeCloseTo(1234.56);
    expect(parseAmount('416.632,86')).toBeCloseTo(416632.86);
  });

  it('returns null for placeholder values', () => {
    expect(parseAmount('-')).toBeNull();
    expect(parseAmount('N/A')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
  });

  it('returns null for non-numeric', () => {
    expect(parseAmount('abc')).toBeNull();
  });
});

describe('parsePlaytomicDate', () => {
  it('parses DD/MM/YYYY HH:MM as CST -06:00', () => {
    // 06/05/2026 20:00 local CST = 2026-05-07 02:00 UTC
    expect(parsePlaytomicDate('06/05/2026 20:00')).toBe('2026-05-07T02:00:00.000Z');
  });

  it('parses date-only (no time)', () => {
    expect(parsePlaytomicDate('01/02/2026')).toBe('2026-02-01T06:00:00.000Z');
  });

  it('returns null for placeholder/empty', () => {
    expect(parsePlaytomicDate('-')).toBeNull();
    expect(parsePlaytomicDate('')).toBeNull();
    expect(parsePlaytomicDate(undefined)).toBeNull();
  });

  it('returns null for malformed', () => {
    expect(parsePlaytomicDate('2026-05-06')).toBeNull();
    expect(parsePlaytomicDate('garbage')).toBeNull();
  });
});

describe('parsePaymentsCsv', () => {
  const HEADER =
    'Corporate Name;Club payment id;Payment id;Refund id;User id;User name;Payout code;Sport;Product SKU;Origin;Service date;Payment date;Payment method;Payment type;Payment status;Currency;Total;Subtotal;Taxes;Tax rate;Net amount transferred;B2B fee rate;B2B fee Total;B2B fee Subtotal;B2B fee Taxes;B2B fee Tax rate;Non-applicable total;Non-applicable subtotal;Non-applicable taxes;Invoice id;Invoice number;Invoice date;Invoice payer;Store product name;Store product quantity;Campaign id;Campaign name';

  function csv(...rows: string[]): string {
    return [
      'Subtotal:;416.632,86',
      'Taxes:;33.323,63',
      'Total:;449.956,49',
      '',
      HEADER,
      ...rows,
    ].join('\n');
  }

  it('skips document-summary lines and reads from the column header', () => {
    const text = csv(
      'DEPORTIVO RDB;club-1;pay-1;-;2847176;JORGE MORALES;-;PADEL;User booking registration;App (iOS);06/05/2026 20:00;04/05/2026 17:30;Apple Pay;Split;Paid;MXN;200;185,19;14,81;0,08;187,01;0,056;12,99;11,2;1,79;0,16;0;0;0;-;-;-;-;-;0;-;-'
    );
    const { rows, errors } = parsePaymentsCsv(text);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].payment_id).toBe('pay-1');
    expect(rows[0].user_id).toBe('2847176');
    expect(rows[0].user_name).toBe('JORGE MORALES');
    expect(rows[0].sport).toBe('PADEL');
    expect(rows[0].origin).toBe('App (iOS)');
    expect(rows[0].payment_method).toBe('Apple Pay');
    expect(rows[0].payment_type).toBe('Split');
    expect(rows[0].payment_status).toBe('Paid');
    expect(rows[0].total).toBe(200);
    expect(rows[0].subtotal).toBeCloseTo(185.19);
    expect(rows[0].service_date).toBe('2026-05-07T02:00:00.000Z');
    expect(rows[0].payment_date).toBe('2026-05-04T23:30:00.000Z');
    expect(rows[0].refund_id).toBeNull();
  });

  it('treats "-" and "N/A" as nullable', () => {
    const text = csv(
      'DEPORTIVO RDB;-;pay-2;-;-;Anonymous;-;PADEL;-;Playtomic Manager;02/05/2026 10:00;04/05/2026 17:25;Cash;Single payer;Paid;MXN;200;185,19;14,81;0,08;N/A;0;0;0;0;0;0;0;0;-;-;-;-;-;0;-;-'
    );
    const { rows, errors } = parsePaymentsCsv(text);
    expect(errors).toEqual([]);
    expect(rows[0].user_id).toBeNull();
    expect(rows[0].club_payment_id).toBeNull();
    expect(rows[0].net_amount_transferred).toBeNull();
  });

  it('skips rows without payment_id and reports error', () => {
    const text = csv(
      'DEPORTIVO RDB;club-1;-;-;2847176;JORGE;-;PADEL;-;App (iOS);06/05/2026 20:00;04/05/2026 17:30;Apple Pay;Split;Paid;MXN;200;185,19;14,81;0,08;187,01;0,056;12,99;11,2;1,79;0,16;0;0;0;-;-;-;-;-;0;-;-'
    );
    const { rows, errors } = parsePaymentsCsv(text);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toContain('Sin payment_id');
  });

  it('deduplicates rows with same payment_id, keeps first', () => {
    const text = csv(
      'DEPORTIVO RDB;c-1;pay-X;-;111;User One;-;PADEL;-;App (iOS);01/05/2026 10:00;01/05/2026 09:00;Apple Pay;Split;Paid;MXN;200;185,19;14,81;0,08;187,01;0,056;12,99;11,2;1,79;0,16;0;0;0;-;-;-;-;-;0;-;-',
      'DEPORTIVO RDB;c-2;pay-X;-;222;User Two;-;PADEL;-;App (iOS);02/05/2026 10:00;02/05/2026 09:00;Cash;Split;Paid;MXN;500;463,00;37,00;0,08;460,00;0,056;28,00;26,00;2,00;0,16;0;0;0;-;-;-;-;-;0;-;-'
    );
    const { rows, errors } = parsePaymentsCsv(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe('111');
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toContain('duplicado');
  });

  it('returns explicit error if header is missing', () => {
    const text = ['just some random text', 'no header here'].join('\n');
    const { rows, errors } = parsePaymentsCsv(text);
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toContain('header');
  });

  it('handles blank trailing lines and CRLF endings', () => {
    const text = csv(
      'DEPORTIVO RDB;c-1;pay-1;-;111;User;-;PADEL;-;App (iOS);01/05/2026 10:00;01/05/2026 09:00;Apple Pay;Split;Paid;MXN;200;185,19;14,81;0,08;187,01;0,056;12,99;11,2;1,79;0,16;0;0;0;-;-;-;-;-;0;-;-',
      '',
      ''
    ).replace(/\n/g, '\r\n');
    const { rows, errors } = parsePaymentsCsv(text);
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([]);
  });
});
