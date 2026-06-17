import { describe, it, expect } from 'vitest';

import {
  inferActivoTipo,
  puedeLiberarse,
  isActivoTipo,
  slugifyDestino,
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
