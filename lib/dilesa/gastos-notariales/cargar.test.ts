import { describe, expect, it } from 'vitest';

import { calcularGastosNotariales } from './calcular';
import { mapearConfig } from './cargar';

// Fila tal como la devuelve supabase-js: numerics como string.
const cfgRow = {
  id: 'cfg-1',
  categoria: 'interes_social',
  anio: 2026,
  isai_pct: '0.0300',
  muni_certificacion_planos: '165.00',
  muni_copias_fotostaticas: '56.00',
  muni_forma_isai: '0.00',
  muni_avaluo_previo: '566.00',
  muni_valuacion_catastral_pct: '0.00200',
  muni_derechos: '850.00',
  muni_no_adeudo_simas: '0.00',
  rp_clg: '575.00',
  rp_aviso_preventivo: '0.00',
  apertura_umbral_cuota_fija: '820000.00',
  apertura_cuota_fija: '765.00',
  otros_avaluo: '0.00',
  otros_cnpc: '0.00',
  otros_cnpr_por_derechohabiente: '1000.00',
  otros_aviso_definitivo: '103.00',
  otros_forma_isai: '400.00',
  otros_copia_certificada: '1000.00',
  otros_plano: '1000.00',
  otros_kinegrama: '200.00',
};

describe('mapearConfig', () => {
  it('castea numerics, lee la categoría y ordena los tabuladores', () => {
    const filas = [
      {
        tipo: 'compraventa',
        orden: 16,
        limite_inferior: '1732500.01',
        limite_superior: null,
        valor_beneficio: '35422.00',
        valor_particular: '35422.00',
      },
      {
        tipo: 'compraventa',
        orden: 9,
        limite_inferior: '808500.01',
        limite_superior: '924000.00',
        valor_beneficio: '8028.00',
        valor_particular: '16036.00',
      },
      {
        tipo: 'apertura',
        orden: 1,
        limite_inferior: '0.01',
        limite_superior: '57750.00',
        valor_beneficio: '1356.00',
        valor_particular: '1336.30',
      },
    ];
    const config = mapearConfig(cfgRow, filas);

    expect(config.categoria).toBe('interes_social');
    expect(config.isaiPct).toBe(0.03);
    expect(config.muni.valuacionCatastralPct).toBe(0.002);
    expect(config.otros.cnpr).toBe(1000);
    // Ordenado por `orden`, no por el orden de llegada.
    expect(config.tabuladorCompraventa.map((f) => f.orden)).toEqual([9, 16]);
    expect(config.tabuladorCompraventa[1].limiteSuperior).toBeNull(); // tope
    expect(config.tabuladorCompraventa[1].valorBeneficio).toBe(35422);
  });

  it('mapeo → cálculo: cuadra el ejemplo LDE del cotizador end-to-end', () => {
    const filas = [
      {
        tipo: 'compraventa',
        orden: 9,
        limite_inferior: '808500.01',
        limite_superior: '924000.00',
        valor_beneficio: '8028.00',
        valor_particular: '16036.00',
      },
    ];
    const config = mapearConfig(cfgRow, filas);
    const d = calcularGastosNotariales(
      {
        valorEscrituracion: 922000,
        valorCatastral: 600000,
        montoCreditoTitular: 700000,
        montoCreditoCotitular: 700000,
      },
      config
    );
    expect(d.total).toBe(44333); // ground-truth del cotizador, vía mapeo desde DB
  });
});
