import { describe, it, expect } from 'vitest';
import {
  fmtMoney,
  fmtPct,
  fmtInt,
  fechaTituloCST,
  relojMatamoros,
  renderResumenConsejoHtml,
  armarTuberiaSplit,
  armarPrototiposVivos,
  type ResumenConsejoData,
  type MargenRaw,
  type InventarioRaw,
} from './resumen-consejo-email';

const EMPTY: ResumenConsejoData = {
  saldos: [],
  tuberiaViva: [],
  tuberiaHistorico: { clientes: 0, valor: 0 },
  asignaciones: [],
  avances: [],
  prototipos: [],
  construccion: { casas_en_obra: 0, vencidas: 0, mo_por_ejecutar: null },
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
  it('verano (CDT): 01:00 UTC = 20:00 local → envía; 02:00 UTC = 21:00 → se salta', () => {
    expect(relojMatamoros(new Date('2026-06-09T01:00:00Z'))).toEqual({
      hora: 20,
      esDomingo: false,
    });
    expect(relojMatamoros(new Date('2026-06-09T02:00:00Z')).hora).toBe(21);
  });

  it('invierno (CST): 02:00 UTC = 20:00 local → envía; 01:00 UTC = 19:00 → se salta', () => {
    expect(relojMatamoros(new Date('2026-01-16T02:00:00Z')).hora).toBe(20);
    expect(relojMatamoros(new Date('2026-01-16T01:00:00Z')).hora).toBe(19);
  });

  it('domingo a las 20:00 locales → esDomingo true (no se envía)', () => {
    expect(relojMatamoros(new Date('2026-06-08T01:00:00Z'))).toEqual({ hora: 20, esDomingo: true });
  });
});

describe('fechaTituloCST', () => {
  it('aplica el offset CST (UTC-6) al título', () => {
    expect(fechaTituloCST(new Date('2026-06-07T02:00:00Z'))).toBe('6 de junio de 2026');
    expect(fechaTituloCST(new Date('2026-06-07T18:00:00Z'))).toBe('7 de junio de 2026');
  });
});

describe('renderResumenConsejoHtml — 4 secciones', () => {
  it('renderiza el título y la fecha', () => {
    const html = renderResumenConsejoHtml(EMPTY, { fechaTitulo: '7 de junio de 2026' });
    expect(html).toContain('Operación DILESA');
    expect(html).toContain('7 de junio de 2026');
  });

  it('siempre renderiza las bandas Ventas/Proyectos/Construcción', () => {
    const html = renderResumenConsejoHtml(EMPTY, { fechaTitulo: 'x' });
    expect(html).toContain('Ventas');
    expect(html).toContain('Proyectos');
    expect(html).toContain('Construcción');
  });

  it('omite la sección Tesorería cuando no hay saldos', () => {
    const html = renderResumenConsejoHtml(EMPTY, { fechaTitulo: 'x' });
    expect(html).not.toContain('Tesorería');
    expect(html).not.toContain('Saldos en Bancos');
  });

  it('incluye Tesorería + Saldos en Bancos cuando hay saldos', () => {
    const html = renderResumenConsejoHtml(
      {
        ...EMPTY,
        saldos: [
          { nombre: 'BBVA Bancomer', banco: 'BBVA', saldo: 404880.3, fecha_saldo: '2026-06-07' },
        ],
      },
      { fechaTitulo: 'x' }
    );
    expect(html).toContain('Tesorería');
    expect(html).toContain('Saldos en Bancos');
    expect(html).toContain('BBVA Bancomer');
    expect(html).toContain('404,880.30');
    expect(html).toContain('07/06/2026');
  });

  it('fusiona inventario y margen por prototipo con utilidad potencial y total', () => {
    const html = renderResumenConsejoHtml(
      {
        ...EMPTY,
        prototipos: [
          {
            nombre: 'LDLE-ISC',
            disponible: 153,
            en_obra: 8,
            valor_comercial: 2000000,
            margen_pct: 31,
            utilidad_potencial: 75200000,
          },
        ],
      },
      { fechaTitulo: 'x' }
    );
    expect(html).toContain('Inventario y Margen por Prototipo');
    expect(html).toContain('LDLE-ISC');
    expect(html).toContain('75,200,000.00');
    expect(html).toContain('Utilidad potencial total en inventario');
  });

  it('renderiza el pipeline vivo y la línea de histórico aparte', () => {
    const html = renderResumenConsejoHtml(
      {
        ...EMPTY,
        tuberiaViva: [{ fase: 'Formalizada', clientes: 20, valor: 22000000 }],
        tuberiaHistorico: { clientes: 1093, valor: 1060000000 },
      },
      { fechaTitulo: 'x' }
    );
    expect(html).toContain('Pipeline de Ventas (vivo)');
    expect(html).toContain('Formalizada');
    expect(html).toContain('Histórico acumulado: 1,093 operaciones');
  });

  it('la línea de Construcción marca los hitos vencidos en rojo', () => {
    const html = renderResumenConsejoHtml(
      { ...EMPTY, construccion: { casas_en_obra: 12, vencidas: 2, mo_por_ejecutar: 4100000 } },
      { fechaTitulo: 'x' }
    );
    expect(html).toContain('Obra en Construcción');
    expect(html).toContain('12 casas en obra');
    expect(html).toContain('2 con hito vencido');
    expect(html).toContain('#cf222e');
    expect(html).toContain('MO por ejecutar');
  });

  it('muestra "Sin datos." en una tabla vacía pero presente', () => {
    const html = renderResumenConsejoHtml(EMPTY, { fechaTitulo: 'x' });
    expect(html).toContain('Avance por Desarrollo');
    expect(html).toContain('Sin datos.');
  });
});

describe('armarTuberiaSplit — pipeline vivo vs histórico', () => {
  const CAT = [
    { nombre: 'Asignada', posicion: 2 },
    { nombre: 'Solicitud de Asignación', posicion: 1 },
    { nombre: 'Operación Terminada', posicion: 17 },
  ];

  it('agrupa activas por fase (solo con clientes) y manda terminadas al histórico', () => {
    const { viva, historico } = armarTuberiaSplit(CAT, [
      { estado: 'activa', fase_actual: 'Asignada', valor_escrituracion: 1000 },
      { estado: 'activa', fase_actual: 'Asignada', valor_escrituracion: 500 },
      { estado: 'terminada', fase_actual: 'Operación Terminada', valor_escrituracion: 2000 },
      { estado: 'terminada', fase_actual: 'Operación Terminada', valor_escrituracion: 1000 },
    ]);
    // Solo la fase con clientes vivos; las fases en 0 se filtran del funnel.
    expect(viva).toEqual([{ fase: 'Asignada', clientes: 2, valor: 1500 }]);
    expect(historico).toEqual({ clientes: 2, valor: 3000 });
  });

  it('junta en "Sin fase asignada" las activas con fase NULL o fuera de catálogo', () => {
    const { viva } = armarTuberiaSplit(CAT, [
      { estado: 'activa', fase_actual: null, valor_escrituracion: null },
      { estado: 'activa', fase_actual: 'Solicitud de Asignacion', valor_escrituracion: 700 },
    ]);
    expect(viva[viva.length - 1]).toEqual({ fase: 'Sin fase asignada', clientes: 2, valor: 700 });
  });

  it('excluye desasignadas/expiradas: no entran ni al funnel ni al histórico', () => {
    const { viva, historico } = armarTuberiaSplit(CAT, [
      { estado: 'desasignada', fase_actual: 'Asignada', valor_escrituracion: 999 },
      { estado: 'expirada', fase_actual: 'Asignada', valor_escrituracion: 111 },
    ]);
    expect(viva).toEqual([]);
    expect(historico).toEqual({ clientes: 0, valor: 0 });
  });
});

describe('armarPrototiposVivos — fusión + filtro de vivos', () => {
  const protoNombre = new Map<string, string>([
    ['p1', 'LDLE-ISC'],
    ['p2', 'LDV-RMA'],
    ['p3', 'LDS-RMC'],
  ]);
  const margen: MargenRaw[] = [
    {
      prototipo_id: 'p1',
      nombre: 'LDLE-ISC',
      valor_comercial: 2000000,
      utilidad: 500000,
      margen_pct: 25,
    },
    {
      prototipo_id: 'p2',
      nombre: 'LDV-RMA',
      valor_comercial: 1500000,
      utilidad: 300000,
      margen_pct: 20,
    },
    {
      prototipo_id: 'p3',
      nombre: 'LDS-RMC',
      valor_comercial: 1800000,
      utilidad: 400000,
      margen_pct: 22,
    },
  ];
  const inventario: InventarioRaw[] = [
    { prototipo_id: 'p1', inventario_disponible: 153, inventario_construccion: 8 },
    { prototipo_id: 'p2', inventario_disponible: 0, inventario_construccion: 0 }, // muerto
    { prototipo_id: 'p3', inventario_disponible: 40, inventario_construccion: 0 },
  ];

  it('excluye prototipos muertos y ordena por utilidad potencial desc', () => {
    const rows = armarPrototiposVivos(margen, inventario, protoNombre);
    expect(rows.map((r) => r.nombre)).toEqual(['LDLE-ISC', 'LDS-RMC']);
    expect(rows[0].utilidad_potencial).toBe(76500000); // 500000 × 153
    expect(rows[0].en_obra).toBe(8);
    expect(rows[1].utilidad_potencial).toBe(16000000); // 400000 × 40
  });

  it('mantiene prototipos con casas en obra aunque no haya disponible (utilidad potencial 0)', () => {
    const rows = armarPrototiposVivos(
      [{ prototipo_id: 'p4', nombre: 'X', valor_comercial: 100, utilidad: 50, margen_pct: 10 }],
      [{ prototipo_id: 'p4', inventario_disponible: 0, inventario_construccion: 3 }],
      new Map()
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].en_obra).toBe(3);
    expect(rows[0].utilidad_potencial).toBe(0);
  });
});
