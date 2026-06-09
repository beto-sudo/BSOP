import { describe, it, expect } from 'vitest';
import {
  fmtMoney,
  fmtPct,
  fmtInt,
  fechaTituloCST,
  relojMatamoros,
  renderResumenConsejoHtml,
  type ResumenConsejoData,
} from './resumen-consejo-email';

const EMPTY: ResumenConsejoData = {
  saldos: [],
  avances: [],
  margen: [],
  inventario: [],
  tuberia: [],
  asignaciones: [],
  contratistas: [],
};

describe('formato', () => {
  it('fmtMoney formatea MXN con 2 decimales y devuelve — para null', () => {
    expect(fmtMoney(829155.15)).toContain('829,155.15');
    expect(fmtMoney(0)).toContain('0.00');
    expect(fmtMoney(null)).toBe('—');
    expect(fmtMoney(undefined)).toBe('—');
  });

  it('fmtPct usa 2 decimales y — para null', () => {
    expect(fmtPct(60.4)).toBe('60.40%');
    expect(fmtPct(null)).toBe('—');
  });

  it('fmtInt devuelve 0 para null', () => {
    expect(fmtInt(5)).toBe('5');
    expect(fmtInt(null)).toBe('0');
    expect(fmtInt(0)).toBe('0');
  });
});

describe('relojMatamoros — envío 8pm local con DST real', () => {
  // El cron dispara a las 01:00 y 02:00 UTC; solo la corrida que cae a las 20:00
  // de Matamoros envía. Verano = CDT (UTC-5) → 01:00 UTC. Invierno = CST (UTC-6)
  // → 02:00 UTC. Matamoros es frontera y sí observa horario de verano.
  it('verano (CDT): 01:00 UTC = 20:00 local → envía; 02:00 UTC = 21:00 → se salta', () => {
    // Lunes 8-jun-2026 20:00 CDT = 9-jun 01:00 UTC
    expect(relojMatamoros(new Date('2026-06-09T01:00:00Z'))).toEqual({
      hora: 20,
      esDomingo: false,
    });
    expect(relojMatamoros(new Date('2026-06-09T02:00:00Z')).hora).toBe(21);
  });

  it('invierno (CST): 02:00 UTC = 20:00 local → envía; 01:00 UTC = 19:00 → se salta', () => {
    // 15-ene-2026 20:00 CST = 16-ene 02:00 UTC
    expect(relojMatamoros(new Date('2026-01-16T02:00:00Z')).hora).toBe(20);
    expect(relojMatamoros(new Date('2026-01-16T01:00:00Z')).hora).toBe(19);
  });

  it('domingo a las 20:00 locales → esDomingo true (no se envía)', () => {
    // Domingo 7-jun-2026 20:00 CDT = 8-jun 01:00 UTC
    expect(relojMatamoros(new Date('2026-06-08T01:00:00Z'))).toEqual({
      hora: 20,
      esDomingo: true,
    });
  });
});

describe('fechaTituloCST', () => {
  it('aplica el offset CST (UTC-6) al título', () => {
    // 2026-06-07T02:00:00Z → en CST (UTC-6) es 2026-06-06 20:00 → "6 de junio de 2026"
    expect(fechaTituloCST(new Date('2026-06-07T02:00:00Z'))).toBe('6 de junio de 2026');
    // 2026-06-07T18:00:00Z → CST 12:00 mismo día → "7 de junio de 2026"
    expect(fechaTituloCST(new Date('2026-06-07T18:00:00Z'))).toBe('7 de junio de 2026');
  });
});

describe('renderResumenConsejoHtml', () => {
  it('renderiza el título y la fecha', () => {
    const html = renderResumenConsejoHtml(EMPTY, { fechaTitulo: '7 de junio de 2026' });
    expect(html).toContain('Resumen Diario Operación Dilesa');
    expect(html).toContain('7 de junio de 2026');
  });

  it('omite el bloque de Saldos Bancos cuando no hay saldos', () => {
    const html = renderResumenConsejoHtml(EMPTY, { fechaTitulo: 'x' });
    expect(html).not.toContain('Resumen Saldos Bancos');
  });

  it('incluye el bloque de Saldos Bancos cuando hay saldos', () => {
    const html = renderResumenConsejoHtml(
      {
        ...EMPTY,
        saldos: [
          { nombre: 'BBVA Bancomer', banco: 'BBVA', saldo: 404880.3, fecha_saldo: '2026-06-07' },
        ],
      },
      { fechaTitulo: 'x' }
    );
    expect(html).toContain('Resumen Saldos Bancos');
    expect(html).toContain('BBVA Bancomer');
    expect(html).toContain('404,880.30');
    expect(html).toContain('07/06/2026');
  });

  it('renderiza el margen con costo total y % formateados', () => {
    const html = renderResumenConsejoHtml(
      {
        ...EMPTY,
        margen: [
          {
            nombre: 'LDV-RMA',
            valor_comercial: 2094000,
            costo_total: 829155.15,
            utilidad: 1264844.85,
            margen_pct: 60.4,
          },
        ],
      },
      { fechaTitulo: 'x' }
    );
    expect(html).toContain('Análisis de Margen');
    expect(html).toContain('LDV-RMA');
    expect(html).toContain('829,155.15');
    expect(html).toContain('60.40%');
  });

  it('renderiza la tubería con clientes y valor por fase', () => {
    const html = renderResumenConsejoHtml(
      {
        ...EMPTY,
        tuberia: [
          { fase: 'Entregada', clientes: 1080, valor: 1052158615 },
          { fase: 'Asignada', clientes: 2, valor: 2789500 },
        ],
      },
      { fechaTitulo: 'x' }
    );
    expect(html).toContain('Tubería');
    expect(html).toContain('Entregada');
    expect(html).toContain('1,052,158,615.00');
  });

  it('muestra "Sin datos." en una sección vacía pero presente', () => {
    const html = renderResumenConsejoHtml(EMPTY, { fechaTitulo: 'x' });
    // Avances siempre se renderiza (no es opcional); sin filas muestra el placeholder
    expect(html).toContain('Resumen Avances Proyectos');
    expect(html).toContain('Sin datos.');
  });
});
