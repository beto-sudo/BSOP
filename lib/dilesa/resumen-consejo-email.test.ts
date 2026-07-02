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
  armarAbsorcion,
  armarBacklog,
  type ResumenConsejoData,
  type Cabecera,
  type MargenRaw,
  type InventarioRaw,
  type VentaBacklogInput,
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
  cxc_preliminar: false,
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
  backlog: { comprometidas_n: 0, comprometido_monto: 0 },
  escrituras_hoy_fechas_reales: [],
  avances: [],
  absorcion: [],
  prototipos: [],
  construccion: { casas_en_obra: 12, vencidas: 2, mo_por_ejecutar: 644988 },
};
const HOY = '2026-06-13';

const EMPTY: ResumenConsejoData = {
  saldos: [],
  tuberiaViva: [],
  tuberiaHistorico: { clientes: 0, valor: 0 },
  asignaciones: [],
  backlog: { comprometidas_n: 0, comprometido_monto: 0 },
  escrituras_hoy_fechas_reales: [],
  avances: [],
  absorcion: [],
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
  it('usa el calendario local de Matamoros', () => {
    expect(fechaTituloCST(new Date('2026-06-07T02:00:00Z'))).toBe('6 de junio de 2026');
    expect(fechaTituloCST(new Date('2026-06-07T18:00:00Z'))).toBe('7 de junio de 2026');
  });

  it('resuelve el DST real, no un offset fijo -6', () => {
    // 2026-07-01 05:30 UTC = 2026-07-01 00:30 en Matamoros (CDT, UTC-5); un
    // offset fijo -6 daría 23:30 del 30 de junio.
    expect(fechaTituloCST(new Date('2026-07-01T05:30:00Z'))).toBe('1 de julio de 2026');
    // El instante del incidente del 30-jun-2026 (20:00 locales, mes UTC ya en julio).
    expect(fechaTituloCST(new Date('2026-07-01T01:00:00Z'))).toBe('30 de junio de 2026');
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

  it('renderiza el pipeline vivo (con movimiento del día) y la línea de histórico aparte', () => {
    const html = renderResumenConsejoHtml(
      {
        ...EMPTY,
        tuberiaViva: [
          { fase: 'Formalizada', clientes: 20, valor: 22000000, hoy: 3 },
          { fase: 'Escriturada', clientes: 8, valor: 12000000, hoy: 0 },
        ],
        tuberiaHistorico: { clientes: 1093, valor: 1060000000 },
      },
      { fechaTitulo: 'x' }
    );
    expect(html).toContain('Pipeline de Ventas (vivo)');
    expect(html).toContain('Formalizada');
    expect(html).toContain('Movimiento del día');
    expect(html).toContain('+3'); // entradas de hoy a Formalizada
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
    { nombre: 'Asignación Solicitada', posicion: 1 },
    { nombre: 'Operación Terminada', posicion: 17 },
  ];

  it('agrupa activas por fase (solo con clientes) y manda terminadas al histórico', () => {
    const { viva, historico } = armarTuberiaSplit(CAT, [
      {
        estado: 'activa',
        fase_actual: 'Asignada',
        valor_escrituracion: 1000,
        precio_asignacion: 9999,
      },
      {
        estado: 'activa',
        fase_actual: 'Asignada',
        valor_escrituracion: 500,
        precio_asignacion: 9999,
      },
      {
        estado: 'terminada',
        fase_actual: 'Operación Terminada',
        valor_escrituracion: 2000,
        precio_asignacion: 9999,
      },
      {
        estado: 'terminada',
        fase_actual: 'Operación Terminada',
        valor_escrituracion: 1000,
        precio_asignacion: 9999,
      },
    ]);
    // Solo la fase con clientes vivos; las fases en 0 se filtran del funnel.
    // `valor_escrituracion` tiene precedencia sobre `precio_asignacion` (el 9999 se ignora).
    expect(viva).toEqual([{ fase: 'Asignada', clientes: 2, valor: 1500, hoy: 0 }]);
    expect(historico).toEqual({ clientes: 2, valor: 3000 });
  });

  it('usa precio_asignacion cuando aún no hay valor_escrituracion (fases previas a Dictaminada)', () => {
    const { viva } = armarTuberiaSplit(CAT, [
      {
        estado: 'activa',
        fase_actual: 'Asignada',
        valor_escrituracion: null,
        precio_asignacion: 800,
      },
      {
        estado: 'activa',
        fase_actual: 'Asignada',
        valor_escrituracion: 1200,
        precio_asignacion: 1000,
      },
    ]);
    // 800 (fallback a precio_asignacion) + 1200 (valor_escrituracion gana) = 2000.
    expect(viva).toEqual([{ fase: 'Asignada', clientes: 2, valor: 2000, hoy: 0 }]);
  });

  it('junta en "Sin fase asignada" las activas con fase NULL o fuera de catálogo', () => {
    const { viva } = armarTuberiaSplit(CAT, [
      { estado: 'activa', fase_actual: null, valor_escrituracion: null, precio_asignacion: null },
      {
        estado: 'activa',
        fase_actual: 'Solicitud de Asignacion',
        valor_escrituracion: 700,
        precio_asignacion: null,
      },
    ]);
    expect(viva[viva.length - 1]).toEqual({
      fase: 'Sin fase asignada',
      clientes: 2,
      valor: 700,
      hoy: 0,
    });
  });

  it('excluye desasignadas/expiradas: no entran ni al funnel ni al histórico', () => {
    const { viva, historico } = armarTuberiaSplit(CAT, [
      {
        estado: 'desasignada',
        fase_actual: 'Asignada',
        valor_escrituracion: 999,
        precio_asignacion: 999,
      },
      {
        estado: 'expirada',
        fase_actual: 'Asignada',
        valor_escrituracion: 111,
        precio_asignacion: 111,
      },
    ]);
    expect(viva).toEqual([]);
    expect(historico).toEqual({ clientes: 0, valor: 0 });
  });

  it('anota el movimiento del día por posición de fase', () => {
    const movHoy = new Map<number, number>([
      [2, 3], // 3 ventas entraron a Asignada (pos 2) hoy
      [1, 1], // 1 entró a Asignación Solicitada (pos 1) — sin clientes vivos, no aparece
    ]);
    const { viva } = armarTuberiaSplit(
      CAT,
      [
        {
          estado: 'activa',
          fase_actual: 'Asignada',
          valor_escrituracion: 1000,
          precio_asignacion: null,
        },
      ],
      movHoy
    );
    // El movimiento se anota en la fila por posición; pos 1 no tiene clientes
    // vivos, así que su movimiento no aparece en el funnel (lo muestra el módulo Fases).
    expect(viva).toEqual([{ fase: 'Asignada', clientes: 1, valor: 1000, hoy: 3 }]);
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

describe('armarAbsorcion — ritmo de venta y meses de inventario (Sprint 4)', () => {
  const proyNombre = new Map([
    ['d1', 'Lomas de los Encinos'],
    ['d2', 'Lomas del Sol'],
    ['d3', 'Lomas del Valle'],
  ]);

  it('calcula ritmo mensual (3M) y meses de inventario por desarrollo', () => {
    const rows = armarAbsorcion(
      [
        { proyecto_id: 'd1', inventario_disponible_venta: 153 },
        { proyecto_id: 'd2', inventario_disponible_venta: 18 },
      ],
      new Map([
        ['d1', 58],
        ['d2', 10],
      ]),
      proyNombre
    );
    expect(rows).toHaveLength(2);
    const enc = rows.find((r) => r.desarrollo === 'Lomas de los Encinos')!;
    expect(enc.ritmo_mensual).toBeCloseTo(19.33, 1); // 58 / 3
    expect(enc.meses_inventario).toBeCloseTo(7.9, 1); // 153 / (58/3)
  });

  it('meses_inventario null cuando no hubo asignaciones (sin ritmo)', () => {
    const rows = armarAbsorcion(
      [{ proyecto_id: 'd3', inventario_disponible_venta: 2 }],
      new Map(),
      proyNombre
    );
    expect(rows[0].asignadas_3m).toBe(0);
    expect(rows[0].meses_inventario).toBeNull();
  });

  it('excluye desarrollos sin inventario disponible y ordena por nombre', () => {
    const rows = armarAbsorcion(
      [
        { proyecto_id: 'd2', inventario_disponible_venta: 18 },
        { proyecto_id: 'd1', inventario_disponible_venta: 153 },
        { proyecto_id: 'dx', inventario_disponible_venta: 0 }, // sin inventario → fuera
      ],
      new Map([
        ['d1', 30],
        ['d2', 6],
      ]),
      proyNombre
    );
    expect(rows.map((r) => r.desarrollo)).toEqual(['Lomas de los Encinos', 'Lomas del Sol']);
  });
});

describe('armarBacklog — ingreso comprometido por escriturar (Sprint 4)', () => {
  it('suma activas comprometidas (fase ≥ 2) sin fecha de escritura, con fallback de monto', () => {
    const ventas: VentaBacklogInput[] = [
      {
        estado: 'activa',
        fase_posicion: 3,
        fecha_escritura: null,
        valor_escrituracion: 1000000,
        precio_asignacion: 900000,
      },
      {
        estado: 'activa',
        fase_posicion: 2,
        fecha_escritura: null,
        valor_escrituracion: null,
        precio_asignacion: 500000,
      },
      {
        estado: 'activa',
        fase_posicion: 1,
        fecha_escritura: null,
        valor_escrituracion: 460000,
        precio_asignacion: 460000,
      }, // fase 1 tentativa → fuera
      {
        estado: 'activa',
        fase_posicion: 11,
        fecha_escritura: '2026-06-01',
        valor_escrituracion: 800000,
        precio_asignacion: 800000,
      }, // ya escriturada → fuera
      {
        estado: 'terminada',
        fase_posicion: 17,
        fecha_escritura: null,
        valor_escrituracion: 700000,
        precio_asignacion: 700000,
      }, // no viva → fuera
    ];
    const b = armarBacklog(ventas);
    expect(b.comprometidas_n).toBe(2);
    expect(b.comprometido_monto).toBe(1500000); // 1,000,000 (valor_escr) + 500,000 (fallback precio_asig)
  });

  it('sin comprometidas devuelve 0/0', () => {
    expect(armarBacklog([])).toEqual({ comprometidas_n: 0, comprometido_monto: 0 });
  });
});

describe('render Sprint 4 — absorción y backlog en el correo', () => {
  it('incluye la tabla de Absorción y la línea de Backlog cuando hay datos', () => {
    const data: ResumenConsejoData = {
      ...EMPTY,
      absorcion: [
        {
          desarrollo: 'Lomas de los Encinos',
          inv_disponible: 153,
          asignadas_3m: 58,
          ritmo_mensual: 58 / 3,
          meses_inventario: 153 / (58 / 3),
        },
      ],
      backlog: { comprometidas_n: 67, comprometido_monto: 81000000 },
    };
    const html = renderResumenConsejoHtml(data, { fechaTitulo: '16 de junio' });
    expect(html).toContain('Absorción y Meses de Inventario');
    expect(html).toContain('Lomas de los Encinos');
    expect(html).toContain('7.9 m');
    expect(html).toContain('Backlog de Escrituración');
    expect(html).toContain('67 operaciones comprometidas');
  });

  it('omite la línea de Backlog cuando no hay comprometidas', () => {
    const html = renderResumenConsejoHtml(EMPTY, { fechaTitulo: 'x' });
    expect(html).not.toContain('Backlog de Escrituración');
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

  it('el tile de escrituras distingue registro vs fecha real (base híbrida)', () => {
    const html = renderTarjetaEjecutiva(CAB_DEMO, DATA_DEMO, HOY);
    // "hoy" = registradas hoy; "mes" = por fecha de escritura.
    expect(html).toContain('Escrituras registradas hoy');
    expect(html).toContain('mes (f. escritura):');
    // Sin fechas reales distintas al día → sin nota.
    expect(html).not.toContain('f. reales:');
  });

  it('muestra las fechas reales cuando difieren del día de registro, recortadas a 3', () => {
    const cab: Cabecera = {
      ...CAB_DEMO,
      escrituras_hoy_fechas_reales: [
        '2026-06-22',
        '2026-06-23',
        '2026-06-26',
        '2026-06-30',
        HOY, // una registrada el mismo día NO va en la nota
      ],
    };
    const html = renderTarjetaEjecutiva(cab, DATA_DEMO, HOY);
    expect(html).toContain('f. reales: 22 jun, 23 jun, 26 jun +1');
  });

  it('el asunto dice "registradas" para no leerse como firmas del día', () => {
    const asunto = armarAsunto(CAB_DEMO, '13 jun', { ...DATA_DEMO, saldos: [] }, HOY);
    expect(asunto).toContain('2 escrituras registradas');
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

describe('CxC en reconciliación (preliminar)', () => {
  const CAB_PRELIM: Cabecera = { ...CAB_DEMO, cxc_preliminar: true };

  it('no emite la alerta de cobranza vencida', () => {
    const alertas = armarAlertas(CAB_PRELIM, DATA_DEMO, HOY);
    expect(alertas.some((a) => a.includes('Cobranza vencida'))).toBe(false);
    // las otras alertas (saldo stale, obra vencida) sí siguen
    expect(alertas.some((a) => a.includes('Afirme'))).toBe(true);
  });

  it('el asunto no incluye CxC vencido', () => {
    const asunto = armarAsunto(CAB_PRELIM, '13 jun', DATA_DEMO, HOY);
    expect(asunto).not.toContain('CxC venc.');
  });

  it('el correo marca CxC preliminar y omite el vencido', () => {
    const html = renderResumenConsejoHtml(DATA_DEMO, {
      fechaTitulo: 'x',
      fechaLocal: HOY,
      cabecera: CAB_PRELIM,
    });
    expect(html).toContain('preliminar, en reconciliación');
    expect(html).toContain('Faltan aplicar desembolsos de crédito');
    expect(html).not.toContain('vencido $47.5M');
    expect(html).not.toContain('Cobranza vencida');
  });
});
