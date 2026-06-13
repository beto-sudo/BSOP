import { describe, it, expect } from 'vitest';
import {
  fmtMoney,
  fmtPct,
  fmtInt,
  fmtMoneyCompact,
  diasDesde,
  frescuraColor,
  fechaCortaDe,
  fechaTituloCST,
  relojMatamoros,
  renderResumenConsejoHtml,
  renderTarjetaEjecutiva,
  renderAlertas,
  armarAlertas,
  armarAsunto,
  armarTuberiaSplit,
  armarPrototiposVivos,
  type ResumenConsejoData,
  type Cabecera,
  type MargenRaw,
  type InventarioRaw,
} from './resumen-consejo-email';
import type { KpisDelDia } from './resumen-consejo-kpis';

const KPIS_DEMO: KpisDelDia = {
  ventas_hoy_n: 3,
  ventas_hoy_monto: 5400000,
  escrituras_hoy_n: 2,
  escrituras_hoy_monto: 3200000,
  cobrado_hoy: 1800000,
  liquidez_total: 137800000,
  cxc_abierto: 133200000,
  cxc_vencido: 47500000,
  casas_en_obra: 12,
};

const CAB_DEMO: Cabecera = {
  kpis: KPIS_DEMO,
  deltas: {
    ventas_hoy_n: 2,
    ventas_hoy_monto: null,
    escrituras_hoy_n: null,
    escrituras_hoy_monto: null,
    cobrado_hoy: null,
    liquidez_total: null,
    cxc_abierto: null,
    cxc_vencido: null,
    casas_en_obra: null,
  },
  cobrado_mes: 27600000,
  escrituras_mes_n: 9,
  escrituras_mes_monto: 14100000,
  cxp_por_pagar: 501000,
};

// data con un saldo stale (Afirme, 13 días) y 2 obras vencidas.
const DATA_DEMO: ResumenConsejoData = {
  saldos: [
    { nombre: 'Monex', banco: null, saldo: 128700000, fecha_saldo: '2026-06-12' },
    { nombre: 'Afirme', banco: null, saldo: 9535, fecha_saldo: '2026-05-31' },
  ],
  tuberiaViva: [],
  tuberiaHistorico: { clientes: 0, valor: 0 },
  asignaciones: [],
  avances: [],
  prototipos: [],
  construccion: { casas_en_obra: 12, vencidas: 2, mo_por_ejecutar: 644988 },
};
const HOY = '2026-06-13';

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

describe('helpers de cabecera (Sprint 3)', () => {
  it('fmtMoneyCompact compacta a M/K', () => {
    expect(fmtMoneyCompact(5400000)).toBe('$5.4M');
    expect(fmtMoneyCompact(47500000)).toBe('$47.5M');
    expect(fmtMoneyCompact(12000)).toBe('$12K');
    expect(fmtMoneyCompact(90)).toBe('$90');
    expect(fmtMoneyCompact(null)).toBe('—');
  });

  it('diasDesde cuenta días y maneja null', () => {
    expect(diasDesde('2026-05-31', '2026-06-13')).toBe(13);
    expect(diasDesde('2026-06-13', '2026-06-13')).toBe(0);
    expect(diasDesde(null, '2026-06-13')).toBeNull();
  });

  it('frescuraColor: verde ≤2, ámbar ≤7, rojo >7, gris sin fecha', () => {
    expect(frescuraColor(1)).toBe('#1a7f37');
    expect(frescuraColor(5)).toBe('#b45309');
    expect(frescuraColor(13)).toBe('#cf222e');
    expect(frescuraColor(null)).toBe('#94a3b8');
  });

  it('fechaCortaDe formatea "13 jun"', () => {
    expect(fechaCortaDe('2026-06-13')).toBe('13 jun');
    expect(fechaCortaDe('2026-01-05')).toBe('5 ene');
  });
});

describe('armarAlertas — excepción, cap 3', () => {
  it('dispara cobranza vencida, saldo stale y obra vencida', () => {
    const alertas = armarAlertas(CAB_DEMO, DATA_DEMO, HOY);
    expect(alertas).toHaveLength(3);
    expect(alertas[0]).toContain('Cobranza vencida');
    expect(alertas.some((a) => a.includes('Afirme sin actualizar hace 13 días'))).toBe(true);
    expect(alertas.some((a) => a.includes('2 casa(s) de obra con hito vencido'))).toBe(true);
  });

  it('sin nada que reportar devuelve lista vacía (no se imprime la franja)', () => {
    const cab: Cabecera = { ...CAB_DEMO, kpis: { ...KPIS_DEMO, cxc_vencido: 0 } };
    const data: ResumenConsejoData = {
      ...DATA_DEMO,
      saldos: [{ nombre: 'Monex', banco: null, saldo: 1, fecha_saldo: '2026-06-12' }],
      construccion: { casas_en_obra: 5, vencidas: 0, mo_por_ejecutar: 0 },
    };
    expect(armarAlertas(cab, data, HOY)).toEqual([]);
    expect(renderAlertas([])).toBe('');
  });
});

describe('armarAsunto — titular dinámico', () => {
  it('arma el asunto con ventas, escrituras, CxC vencido y saldo stale', () => {
    const asunto = armarAsunto(CAB_DEMO, '13 jun', DATA_DEMO, HOY);
    expect(asunto).toContain('DILESA 13 jun');
    expect(asunto).toContain('3 ventas $5.4M');
    expect(asunto).toContain('2 escrituras');
    expect(asunto).toContain('CxC venc. $47.5M');
    expect(asunto).toContain('Afirme sin actualizar 13d');
  });

  it('día plano: "sin ventas hoy"', () => {
    const cab: Cabecera = {
      ...CAB_DEMO,
      kpis: { ...KPIS_DEMO, ventas_hoy_n: 0, escrituras_hoy_n: 0, cxc_vencido: 0 },
    };
    const data: ResumenConsejoData = { ...DATA_DEMO, saldos: [] };
    expect(armarAsunto(cab, '14 jun', data, HOY)).toBe('DILESA 14 jun · sin ventas hoy');
  });
});

describe('renderTarjetaEjecutiva + correo con cabecera', () => {
  it('la tarjeta muestra las 6 cifras con delta y contexto', () => {
    const html = renderTarjetaEjecutiva(CAB_DEMO, DATA_DEMO, HOY);
    expect(html).toContain('HOY EN DILESA');
    expect(html).toContain('Ventas hoy');
    expect(html).toContain('▲ +2 vs ayer');
    expect(html).toContain('Cobrado hoy');
    expect(html).toContain('vencido $47.5M');
    expect(html).toContain('2 con hito vencido');
  });

  it('renderResumenConsejoHtml con cabecera incluye tarjeta, alertas y línea CxC', () => {
    const html = renderResumenConsejoHtml(DATA_DEMO, {
      fechaTitulo: '13 de junio de 2026',
      fechaLocal: HOY,
      cabecera: CAB_DEMO,
    });
    expect(html).toContain('HOY EN DILESA');
    expect(html).toContain('Requiere atención');
    expect(html).toContain('Cobranza (CxC):');
    expect(html).toContain('CxP por pagar');
    // semáforo de frescura: el saldo stale (Afirme, 13d) se marca en rojo
    expect(html).toContain('(13d)');
  });

  it('sin cabecera no renderiza la tarjeta (retrocompat Sprint 2)', () => {
    const html = renderResumenConsejoHtml(DATA_DEMO, { fechaTitulo: 'x' });
    expect(html).not.toContain('HOY EN DILESA');
    expect(html).not.toContain('Cobranza (CxC):');
  });
});
