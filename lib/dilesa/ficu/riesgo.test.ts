/**
 * Tests del EBR del FICU. Cubre los 5 criterios + 3 niveles + casos
 * borde reales del expediente DILESA.
 */
import { describe, expect, it } from 'vitest';
import {
  evaluarRiesgo,
  nivelFormaPago,
  nivelNacionalidad,
  nivelPEP,
  nivelPersonalidad,
  nivelUsoEfectivo,
  UMBRAL_IDENTIFICACION_MXN,
  UMBRAL_EFECTIVO_MEDIO_MXN,
} from './riesgo';

describe('nivelPersonalidad', () => {
  it('PF mexicana = Bajo', () => {
    expect(nivelPersonalidad('PERSONA FÍSICA', 'MEXICANA')).toBe('Bajo');
  });
  it('PF extranjera residente = Medio', () => {
    expect(nivelPersonalidad('PERSONA FÍSICA', 'COLOMBIANA')).toBe('Medio');
  });
  it('PM mexicana = Alto', () => {
    expect(nivelPersonalidad('PERSONA MORAL', 'MEXICANA')).toBe('Alto');
  });
  it('Fideicomiso = Alto', () => {
    expect(nivelPersonalidad('FIDEICOMISO', 'MEXICANA')).toBe('Alto');
  });
});

describe('nivelNacionalidad', () => {
  it('MEXICANA = Bajo', () => {
    expect(nivelNacionalidad('MEXICANA')).toBe('Bajo');
  });
  it('Mexicano (variante) = Bajo', () => {
    expect(nivelNacionalidad('mexicano')).toBe('Bajo');
  });
  it('USA = Medio', () => {
    expect(nivelNacionalidad('ESTADOUNIDENSE')).toBe('Medio');
  });
  it('IRÁN (GAFI alto riesgo) = Alto', () => {
    expect(nivelNacionalidad('IRÁN')).toBe('Alto');
  });
  it('VENEZUELA (GAFI monitoreo) = Alto', () => {
    expect(nivelNacionalidad('VENEZUELA')).toBe('Alto');
  });
  it('sin dato = Medio (default defensivo)', () => {
    expect(nivelNacionalidad(null)).toBe('Medio');
    expect(nivelNacionalidad('')).toBe('Medio');
  });
});

describe('nivelPEP', () => {
  it('no PEP = Bajo', () => {
    expect(nivelPEP(false)).toBe('Bajo');
    expect(nivelPEP(null)).toBe('Bajo');
  });
  it('PEP familiar = Medio', () => {
    expect(nivelPEP(false, true)).toBe('Medio');
  });
  it('PEP directo = Alto', () => {
    expect(nivelPEP(true)).toBe('Alto');
  });
});

describe('nivelFormaPago', () => {
  it('INFONAVIT = Bajo', () => {
    expect(nivelFormaPago('INFONAVIT TRADICIONAL', 'SIN USO DE EFECTIVO')).toBe('Bajo');
  });
  it('FOVISSSTE = Bajo', () => {
    expect(nivelFormaPago('FOVISSSTE', 'SIN USO DE EFECTIVO')).toBe('Bajo');
  });
  it('FINANCIAMIENTO HIPOTECARIO = Bajo (corrección del Coda original)', () => {
    expect(nivelFormaPago('FINANCIAMIENTO HIPOTECARIO', 'SIN USO DE EFECTIVO')).toBe('Bajo');
  });
  it('crédito bancario (acento) = Bajo', () => {
    expect(nivelFormaPago('CRÉDITO BANCARIO', 'SIN USO DE EFECTIVO')).toBe('Bajo');
  });
  it('recursos propios = Medio', () => {
    expect(nivelFormaPago('RECURSOS PROPIOS', 'SIN USO DE EFECTIVO')).toBe('Medio');
  });
  it('efectivo arriba del umbral = Alto', () => {
    expect(nivelFormaPago('EFECTIVO', 'CON USO DE EFECTIVO', 400_000)).toBe('Alto');
  });
});

describe('nivelUsoEfectivo', () => {
  it('SIN USO DE EFECTIVO = Bajo', () => {
    expect(nivelUsoEfectivo('SIN USO DE EFECTIVO')).toBe('Bajo');
  });
  it('NO = Bajo', () => {
    expect(nivelUsoEfectivo('NO')).toBe('Bajo');
  });
  it('monto $0 = Bajo', () => {
    expect(nivelUsoEfectivo(null, 0)).toBe('Bajo');
  });
  it('monto < umbral medio = Bajo', () => {
    expect(nivelUsoEfectivo(null, UMBRAL_EFECTIVO_MEDIO_MXN - 1)).toBe('Bajo');
  });
  it('monto en rango Medio', () => {
    expect(nivelUsoEfectivo(null, UMBRAL_EFECTIVO_MEDIO_MXN + 1)).toBe('Medio');
  });
  it('monto ≥ umbral identificación = Alto', () => {
    expect(nivelUsoEfectivo(null, UMBRAL_IDENTIFICACION_MXN)).toBe('Alto');
  });

  // Strings del catálogo nuevo USO_EFECTIVO_OPTIONS (Sprint 7c-2).
  it('string "Uso de efectivo mayor a 3,210 UMAs" = Alto', () => {
    expect(
      nivelUsoEfectivo('Uso de efectivo mayor a 3,210 UMAs (~$363,179) — Requiere identificación')
    ).toBe('Alto');
  });
  it('string "Uso de efectivo menor a 1,605 UMAs" = Medio', () => {
    expect(nivelUsoEfectivo('Uso de efectivo menor a 1,605 UMAs (~$181,590)')).toBe('Medio');
  });
  it('string "Sin uso de efectivo" del catálogo = Bajo', () => {
    expect(nivelUsoEfectivo('Sin uso de efectivo')).toBe('Bajo');
  });
});

describe('evaluarRiesgo', () => {
  it('cliente residencial típico (4 Bajo + 1 Bajo) = Bajo', () => {
    const r = evaluarRiesgo({
      tipoPersona: 'PERSONA FÍSICA',
      nacionalidad: 'MEXICANA',
      esPep: false,
      formaPago: 'INFONAVIT TRADICIONAL',
      usoEfectivo: 'SIN USO DE EFECTIVO',
    });
    expect(r.criterios.every((c) => c.nivel === 'Bajo')).toBe(true);
    expect(r.scoreTotal).toBeCloseTo(33.35, 1); // 5 * 6.67
    expect(r.clasificacion).toBe('Bajo');
  });

  it('mismo caso que el sample de Coda (JAH-MUÑOZ) — pero con fix de hipotecario=Bajo', () => {
    // En Coda salía 46.67% por marcar Hipotecario=Alto.
    // Con la corrección debe salir 33.35% (todos Bajo).
    const r = evaluarRiesgo({
      tipoPersona: 'PERSONA FÍSICA',
      nacionalidad: 'MEXICANA',
      esPep: false,
      formaPago: 'FINANCIAMIENTO HIPOTECARIO',
      usoEfectivo: 'SIN USO DE EFECTIVO',
    });
    expect(r.scoreTotal).toBeCloseTo(33.35, 1);
    expect(r.clasificacion).toBe('Bajo');
  });

  it('PEP + efectivo significativo + extranjero LATAM = Alto', () => {
    const r = evaluarRiesgo({
      tipoPersona: 'PERSONA MORAL',
      nacionalidad: 'COLOMBIANA',
      esPep: true,
      formaPago: 'EFECTIVO',
      usoEfectivo: 'CON USO DE EFECTIVO',
      montoEfectivoMxn: 500_000,
    });
    // Personalidad PM = Alto (20)
    // Nacionalidad COL = Medio (13.33)
    // PEP directo = Alto (20)
    // Forma pago efectivo alto = Alto (20)
    // Uso efectivo > umbral identif = Alto (20)
    expect(r.scoreTotal).toBeCloseTo(93.33, 1);
    expect(r.clasificacion).toBe('Alto');
  });

  it('rango Medio en frontera 40%', () => {
    const r = evaluarRiesgo({
      tipoPersona: 'PERSONA FÍSICA',
      nacionalidad: 'MEXICANA',
      esPep: false,
      pepFamiliar: true,
      formaPago: 'RECURSOS PROPIOS',
      usoEfectivo: 'SIN USO DE EFECTIVO',
    });
    // Bajo + Bajo + Medio + Medio + Bajo = 6.67+6.67+13.33+13.33+6.67 = 46.67
    expect(r.scoreTotal).toBeCloseTo(46.67, 1);
    expect(r.clasificacion).toBe('Medio');
  });

  it('los 5 criterios siempre aparecen en orden estable', () => {
    const r = evaluarRiesgo({
      tipoPersona: 'PERSONA FÍSICA',
      nacionalidad: 'MEXICANA',
      esPep: false,
      formaPago: 'INFONAVIT',
      usoEfectivo: 'SIN USO DE EFECTIVO',
    });
    expect(r.criterios.map((c) => c.nombre)).toEqual([
      'Personalidad',
      'Nacionalidad',
      'Persona Políticamente Expuesta',
      'Forma de Pago',
      'Uso de Efectivo',
    ]);
  });

  it('score nunca pasa de 100%', () => {
    const r = evaluarRiesgo({
      tipoPersona: 'FIDEICOMISO',
      nacionalidad: 'IRÁN',
      esPep: true,
      formaPago: 'EFECTIVO',
      usoEfectivo: 'CON USO DE EFECTIVO',
      montoEfectivoMxn: 1_000_000,
    });
    expect(r.scoreTotal).toBeLessThanOrEqual(100);
    expect(r.clasificacion).toBe('Alto');
  });
});
