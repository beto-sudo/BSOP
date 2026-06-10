import { describe, expect, it } from 'vitest';
import { camposCapturadosPorFase, type VentaCamposFase } from './campos-capturados';

const money = (n: number | null): string | null => (n == null ? null : `$${n.toLocaleString()}`);

const VENTA: VentaCamposFase = {
  tipo_credito: 'Infonavit Tradicional',
  precio_asignacion: 1250000,
  enganche_requerido: 12500,
  descuento_total: null,
  fecha_solicitud_avaluo: '2026-05-02',
  casa_valuadora: 'Valuadora del Norte',
  monto_avaluo: 1210000,
  fecha_avaluo_cerrado: '2026-05-08',
  monto_credito_titular: 850000,
  monto_credito_cotitular: null,
  credito_titular_ref: 'INFONAVIT 0526096361',
  credito_cotitular_ref: null,
  fecha_solicitud_dictamen: '2026-05-15',
  fecha_dictaminada: '2026-05-20',
  valor_escrituracion: 899000,
  gastos_escrituracion: 42569.42,
  fecha_validacion_patronal: '2026-05-23',
  fecha_firma_programada: '2026-05-28',
  monto_credito_directo: null,
  numero_escritura: '9876',
  fecha_escritura: '2026-06-05',
  numero_cheque_notaria: '1234',
  monto_cheque_notaria: 5000,
  fecha_detonacion: '2026-06-08',
  monto_detonado: 850000,
  valor_facturado: null,
  valor_real_venta_dilesa: null,
  monto_nota_credito: null,
};

describe('camposCapturadosPorFase', () => {
  it('omite pares sin valor (co-titular null en F6)', () => {
    const f6 = camposCapturadosPorFase(6, VENTA, money);
    expect(f6.map(([l]) => l)).toEqual(['Crédito titular', 'Ref. titular']);
  });

  it('F8 incluye dictamen + escrituración + crédito', () => {
    const f8 = camposCapturadosPorFase(8, VENTA, money);
    expect(f8).toContainEqual(['Valor de escrituración', '$899,000']);
    expect(f8).toContainEqual(['Gastos de escrituración', '$42,569.42']);
    expect(f8).toContainEqual(['Fecha dictamen', '2026-05-20']);
  });

  it('F11 arma escritura + cheque a notaría', () => {
    expect(camposCapturadosPorFase(11, VENTA, money)).toEqual([
      ['Escritura #', '9876'],
      ['Fecha escritura', '2026-06-05'],
      ['Cheque notaría #', '1234'],
      ['Monto cheque', '$5,000'],
    ]);
  });

  it('F13 sin montos de factura aún → solo valor de escrituración', () => {
    expect(camposCapturadosPorFase(13, VENTA, money)).toEqual([
      ['Valor de escrituración', '$899,000'],
    ]);
  });

  it('fases sin campos mapeados (2, 14-17) → vacío', () => {
    for (const pos of [2, 14, 15, 16, 17]) {
      expect(camposCapturadosPorFase(pos, VENTA, money)).toEqual([]);
    }
  });

  it('cada fase mapeada produce pares con la venta completa', () => {
    for (const pos of [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
      expect(camposCapturadosPorFase(pos, VENTA, money).length).toBeGreaterThan(0);
    }
  });
});
