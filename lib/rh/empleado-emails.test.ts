import { describe, it, expect } from 'vitest';
import {
  renderEmpleadoAvisoHtml,
  calcAntiguedad,
  empleadoSlug,
  empleadoSubjectFallback,
  type EmpleadoAvisoContext,
} from './empleado-emails';
import type { EmpresaBranding } from '../dilesa/email-branding';

const BRANDING: EmpresaBranding = {
  empresaId: 'e1',
  nombreComercial: 'DILESA',
  headerUrl: 'https://bsop.io/brand/dilesa/header-email.png',
  colorPrimario: '#7D812E',
  colorPrimarioDark: '#646725',
  colorSecundario: '#4F4C4D',
  colorTextoTitulo: '#1F1F1F',
  colorFondoBrand: '#FAF7EE',
  colorInverso: '#FFFFFF',
  sitioWeb: 'dilesa.mx',
  telefono: '(878) 791-1818',
};

function ctx(overrides: Partial<EmpleadoAvisoContext>): EmpleadoAvisoContext {
  return {
    tipo: 'alta',
    empleadoId: 'emp1',
    empresaId: 'e1',
    nombre: 'María Fernanda Treviño Garza',
    puesto: 'Auxiliar Contable',
    departamento: 'Administración',
    empresaNombre: 'DILESA',
    fechaIngreso: '2026-07-01',
    tipoContrato: 'Periodo de prueba',
    lugarTrabajo: 'Oficinas corporativas',
    correoEmpresa: 'mf.trevino@dilesa.mx',
    fechaBaja: null,
    motivoBaja: null,
    branding: BRANDING,
    ...overrides,
  };
}

describe('empleadoSlug / empleadoSubjectFallback', () => {
  it('mapea tipo a slug', () => {
    expect(empleadoSlug('alta')).toBe('empleado_alta');
    expect(empleadoSlug('baja')).toBe('empleado_baja');
  });
  it('da subject fallback por tipo con vars', () => {
    expect(empleadoSubjectFallback('alta')).toContain('{nombre}');
    expect(empleadoSubjectFallback('baja')).toContain('Baja');
  });
});

describe('calcAntiguedad', () => {
  it('calcula años y meses', () => {
    expect(calcAntiguedad('2023-03-15', '2026-06-30')).toBe('3 años, 3 meses');
  });
  it('un solo año exacto', () => {
    expect(calcAntiguedad('2025-01-01', '2026-01-01')).toBe('1 año');
  });
  it('menos de un mes', () => {
    expect(calcAntiguedad('2026-06-20', '2026-06-30')).toBe('Menos de un mes');
  });
  it('null si falta alguna fecha', () => {
    expect(calcAntiguedad(null, '2026-06-30')).toBeNull();
    expect(calcAntiguedad('2026-06-20', null)).toBeNull();
  });
});

describe('renderEmpleadoAvisoHtml — ALTA', () => {
  const html = renderEmpleadoAvisoHtml(ctx({ tipo: 'alta' }));
  it('titula NUEVA ALTA DE PERSONAL', () => {
    expect(html).toContain('NUEVA ALTA DE PERSONAL');
  });
  it('incluye nombre, puesto y bienvenida', () => {
    expect(html).toContain('María Fernanda Treviño Garza');
    expect(html).toContain('Auxiliar Contable');
    expect(html).toContain('bienvenida');
  });
  it('no muestra el bloque de baja', () => {
    expect(html).not.toContain('Revocar accesos');
  });
});

describe('renderEmpleadoAvisoHtml — BAJA', () => {
  const html = renderEmpleadoAvisoHtml(
    ctx({
      tipo: 'baja',
      nombre: 'Juan Carlos Méndez Ríos',
      puesto: 'Velador',
      departamento: 'Obra',
      fechaIngreso: '2023-03-15',
      fechaBaja: '2026-06-30',
      motivoBaja: 'Renuncia voluntaria',
    })
  );
  it('titula BAJA DE PERSONAL', () => {
    expect(html).toContain('BAJA DE PERSONAL');
  });
  it('incluye checklist de revocar accesos y antigüedad', () => {
    expect(html).toContain('Revocar accesos');
    expect(html).toContain('3 años, 3 meses');
    expect(html).toContain('Renuncia voluntaria');
  });
});
