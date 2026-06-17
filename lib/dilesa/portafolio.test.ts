import { describe, it, expect } from 'vitest';

import {
  inferActivoTipo,
  puedeLiberarse,
  isActivoTipo,
  slugifyDestino,
  computeTerrenoSnapshot,
  ACTIVO_TIPOS,
} from './portafolio';

describe('inferActivoTipo', () => {
  it('comercial → lote', () => {
    expect(inferActivoTipo('Comercial')).toBe('lote');
    expect(inferActivoTipo('comercial')).toBe('lote');
  });

  it('vivienda residencial → casa', () => {
    expect(inferActivoTipo('Interes Social')).toBe('casa');
    expect(inferActivoTipo('Interés Social')).toBe('casa');
    expect(inferActivoTipo('Residencial Medio')).toBe('casa');
    expect(inferActivoTipo('Residencial')).toBe('casa');
    expect(inferActivoTipo('habitacional')).toBe('casa');
  });

  it('sin tipo / no reconocido → lote', () => {
    expect(inferActivoTipo(null)).toBe('lote');
    expect(inferActivoTipo(undefined)).toBe('lote');
    expect(inferActivoTipo('Equipamiento')).toBe('lote');
    expect(inferActivoTipo('Area Verde (Donación Municipal)')).toBe('lote');
  });
});

describe('puedeLiberarse', () => {
  // dilesa-portafolio-destinos: se libera desde cualquier estado de obra
  // (incl. en construcción) — el portafolio es el marcador de "fuera de ventas".
  it('permite cualquier estado de obra no comprometido', () => {
    for (const e of ['planeada', 'lote_urbanizado', 'en_construccion', 'terminada']) {
      expect(puedeLiberarse(e)).toBe(true);
    }
  });

  it('bloquea estados comprometidos con un cliente (requieren desasignar)', () => {
    for (const e of ['asignada', 'vendida', 'escriturada', 'entregada']) {
      expect(puedeLiberarse(e)).toBe(false);
    }
  });
});

describe('guards de catálogo', () => {
  it('isActivoTipo valida contra el catálogo', () => {
    for (const t of ACTIVO_TIPOS) expect(isActivoTipo(t)).toBe(true);
    expect(isActivoTipo('plaza_gigante')).toBe(false);
    expect(isActivoTipo('')).toBe(false);
  });
});

describe('slugifyDestino', () => {
  it('deriva slug kebab/snake sin acentos', () => {
    expect(slugifyDestino('Demo / Show House')).toBe('demo_show_house');
    expect(slugifyDestino('Arrendamiento')).toBe('arrendamiento');
    expect(slugifyDestino('Renta de Temporada')).toBe('renta_de_temporada');
    expect(slugifyDestino('Oficina (propia)')).toBe('oficina_propia');
  });

  it('quita acentos y recorta separadores de los extremos', () => {
    expect(slugifyDestino('  Bodega ')).toBe('bodega');
    expect(slugifyDestino('Exhibición')).toBe('exhibicion');
    expect(slugifyDestino('Área común')).toBe('area_comun');
  });

  it('devuelve cadena vacía si no hay caracteres usables', () => {
    expect(slugifyDestino('   ')).toBe('');
    expect(slugifyDestino('—/—')).toBe('');
  });
});

describe('computeTerrenoSnapshot', () => {
  it('devuelve null sin datos de negociación', () => {
    expect(
      computeTerrenoSnapshot({
        areaM2: 5000,
        areasAfectacionM2: 200,
        precioSolicitadoM2: null,
        precioOfertadoM2: null,
        valorObjetivoCompra: null,
      })
    ).toBeNull();
  });

  it('deriva aprovechable, valores, $/m² aprovechable y brecha', () => {
    const s = computeTerrenoSnapshot({
      areaM2: 5000,
      areasAfectacionM2: 1000,
      precioSolicitadoM2: 800,
      precioOfertadoM2: 700,
      valorObjetivoCompra: 3200000,
    });
    expect(s).not.toBeNull();
    expect(s!.aprovechableM2).toBe(4000); // 5000 - 1000
    expect(s!.valorSolicitado).toBe(4000000); // 5000 * 800
    expect(s!.valorOfertado).toBe(3500000); // 5000 * 700
    expect(s!.precioM2Aprovechable).toBe(800); // 3200000 / 4000
    expect(s!.brechaPct).toBeCloseTo(12.5); // (4M - 3.5M)/4M
  });

  it('cae al valor ofertado cuando no hay valor objetivo, y tolera datos faltantes', () => {
    const s = computeTerrenoSnapshot({
      areaM2: 1000,
      areasAfectacionM2: null,
      precioSolicitadoM2: null,
      precioOfertadoM2: 500,
      valorObjetivoCompra: null,
    });
    expect(s!.aprovechableM2).toBe(1000); // sin afectación
    expect(s!.valorOfertado).toBe(500000);
    expect(s!.precioM2Aprovechable).toBe(500); // base = ofertado / aprovechable
    expect(s!.brechaPct).toBeNull(); // sin solicitado no hay brecha
  });
});
