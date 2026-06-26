import { describe, expect, it } from 'vitest';

import { calcularGastosNotariales } from './calcular';
import { mapearConfig } from './cargar';

// Filas tal como las devuelve supabase-js: numerics como string, orden mezclado.
const cfgRow = {
  id: 'cfg-1',
  anio: 2026,
  isai_pct: '0.0300',
  muni_certificacion_planos: '165.00',
  muni_copias_fotostaticas: '56.00',
  muni_avaluo_previo: '566.00',
  muni_valuacion_catastral: '1200.00',
  muni_derechos: '850.00',
  rp_clg: '575.00',
  rp_aviso_preventivo: '0.00',
  apertura_umbral_cuota_fija: '820000.00',
  apertura_cuota_fija: '765.00',
  otros_cnpr_por_derechohabiente: '1000.00',
  otros_aviso_definitivo: '103.00',
  otros_forma_isai: '400.00',
  otros_copia_certificada: '1500.00',
  otros_plano: '1200.00',
  otros_kinegrama: '200.00',
};

describe('mapearConfig', () => {
  it('castea numerics (string→number) y ordena los tabuladores por orden', () => {
    const filas = [
      {
        tipo: 'compraventa',
        orden: 9,
        limite_inferior: '808500.01',
        limite_superior: '924000.00',
        valor_beneficio: '8028.00',
        valor_particular: '16036.00',
      },
      {
        tipo: 'compraventa',
        orden: 1,
        limite_inferior: '0.01',
        limite_superior: '57750.00',
        valor_beneficio: '2683.00',
        valor_particular: '5345.00',
      },
      {
        tipo: 'compraventa',
        orden: 16,
        limite_inferior: '1732500.01',
        limite_superior: null,
        valor_beneficio: '13373.00',
        valor_particular: '26726.00',
      },
      {
        tipo: 'apertura',
        orden: 9,
        limite_inferior: '866250.01',
        limite_superior: '981750.00',
        valor_beneficio: '12047.00',
        valor_particular: '12026.70',
      },
    ];
    const config = mapearConfig(cfgRow, filas);

    expect(config.isaiPct).toBe(0.03);
    expect(config.muni.certificacionPlanos).toBe(165);
    expect(config.registroPublico.aperturaCuotaFija).toBe(765);
    expect(config.otros.plano).toBe(1200);

    // Ordenado por `orden`, no por el orden de llegada.
    expect(config.tabuladorCompraventa.map((f) => f.orden)).toEqual([1, 9, 16]);
    expect(config.tabuladorCompraventa[0].limiteInferior).toBe(0.01);
    expect(config.tabuladorCompraventa[2].limiteSuperior).toBeNull(); // sin tope
    expect(config.tabuladorApertura[0].valorBeneficio).toBe(12047);
  });

  it('mapeo → cálculo: cuadra el ejemplo de Memo end-to-end', () => {
    // Config mínima viable mapeada desde "DB" para validar el pipe completo.
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
      { valorEscrituracion: 920000, montoCreditoTitular: 800000, montoCreditoCotitular: 0 },
      config
    );
    expect(d.total).toBe(44208); // mismo ground-truth, pero vía mapeo desde DB
  });
});
