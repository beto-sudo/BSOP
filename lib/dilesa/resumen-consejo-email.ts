/**
 * Resumen Diario Operación DILESA — correo al Consejo.
 *
 * Iniciativa `dilesa-resumen-consejo-rediseno` (Sprint 2): el correo pasa de 7
 * tablas planas (réplica de Coda) a 4 SECCIONES con el dinero arriba —
 * ① Tesorería · ② Ventas · ③ Proyectos · ④ Construcción. Consolidaciones:
 *   - Margen + Inventario se fusionan en una tabla por prototipo VIVO (con
 *     inventario o en obra) + utilidad potencial (utilidad × disponible).
 *   - La tubería se parte en pipeline VIVO (ventas activas) vs una línea de
 *     histórico acumulado (que antes aplastaba el funnel 10×).
 *   - Contratistas baja a una línea de excepción (casas en obra · vencidas).
 *
 * Diseño: las funciones de render y de armado son PURAS (reciben data, devuelven
 * HTML/estructuras) para testearlas sin DB. `fetchResumenConsejoData` arma la
 * data desde las vistas. La tarjeta ejecutiva + deltas + CxC llegan en Sprint 3.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Tipos por sección ───────────────────────────────────────────────────────

export type SaldoBancoRow = {
  nombre: string;
  banco: string | null;
  saldo: number | null;
  fecha_saldo: string | null;
};

export type AvanceRow = {
  proyecto: string;
  avance_urb_pct: number | null;
  avance_const_pct: number | null;
  avance_vts_pct: number | null;
  lotes_residenciales: number;
  casas_terminadas: number;
  casas_en_construccion: number;
  parque_disponible: number;
  ticket_promedio: number | null;
};

/** Fila fusionada Margen + Inventario, solo prototipos vivos. */
export type PrototipoVivoRow = {
  nombre: string;
  disponible: number;
  en_obra: number;
  valor_comercial: number | null;
  margen_pct: number | null;
  utilidad_potencial: number;
};

export type TuberiaRow = {
  fase: string;
  clientes: number;
  valor: number;
};

export type VentaTuberiaInput = {
  estado: string | null;
  fase_actual: string | null;
  valor_escrituracion: number | null;
};

/**
 * Parte la tubería en pipeline VIVO vs histórico. El histórico (ventas
 * 'terminada', ~1,090 ops / ~$1,000M) sale del funnel a una sola línea — antes
 * lo aplastaba 10×. El pipeline vivo son las ventas 'activa' agrupadas por fase
 * (solo las fases con clientes, en orden de catálogo) + una fila "Sin fase
 * asignada" para las activas con fase NULL o con grafía fuera de catálogo (así
 * la tubería nunca pierde clientes en silencio). Las desasignadas/expiradas no
 * cuentan: son ventas caídas.
 */
export function armarTuberiaSplit(
  fasesCat: { nombre: string; posicion: number }[],
  ventas: VentaTuberiaInput[]
): { viva: TuberiaRow[]; historico: { clientes: number; valor: number } } {
  const orden = [...fasesCat].sort((a, b) => a.posicion - b.posicion);
  const conocidas = new Set(orden.map((f) => f.nombre));
  const porFase = new Map<string, { clientes: number; valor: number }>();
  const sinFase = { clientes: 0, valor: 0 };
  const historico = { clientes: 0, valor: 0 };
  for (const v of ventas) {
    const valor = Number(v.valor_escrituracion ?? 0);
    if (v.estado === 'terminada') {
      historico.clientes += 1;
      historico.valor += valor;
      continue;
    }
    if (v.estado !== 'activa') continue;
    if (v.fase_actual && conocidas.has(v.fase_actual)) {
      const acc = porFase.get(v.fase_actual) ?? { clientes: 0, valor: 0 };
      acc.clientes += 1;
      acc.valor += valor;
      porFase.set(v.fase_actual, acc);
    } else {
      sinFase.clientes += 1;
      sinFase.valor += valor;
    }
  }
  const viva: TuberiaRow[] = orden
    .map((f) => ({
      fase: f.nombre,
      clientes: porFase.get(f.nombre)?.clientes ?? 0,
      valor: porFase.get(f.nombre)?.valor ?? 0,
    }))
    // Solo fases con clientes vivos — el funnel muestra dónde están las ventas,
    // no las 17 etapas en cero.
    .filter((r) => r.clientes > 0);
  if (sinFase.clientes > 0) {
    viva.push({ fase: 'Sin fase asignada', clientes: sinFase.clientes, valor: sinFase.valor });
  }
  return { viva, historico };
}

export type AsignacionRow = {
  nombre: string;
  asignaciones_mes: number;
  monto_asignaciones: number;
  escrituras_mes: number;
  monto_escrituras: number;
};

/** Resumen de obra (línea de excepción de la sección Construcción). */
export type ConstruccionResumen = {
  casas_en_obra: number;
  vencidas: number;
  mo_por_ejecutar: number | null;
};

export type MargenRaw = {
  prototipo_id: string;
  nombre: string | null;
  valor_comercial: number | null;
  utilidad: number | null;
  margen_pct: number | null;
};

export type InventarioRaw = {
  prototipo_id: string;
  inventario_disponible: number | null;
  inventario_construccion: number | null;
};

/**
 * Fusiona Margen + Inventario por prototipo y deja solo los VIVOS (con
 * inventario disponible o casas en obra). Agrega utilidad potencial = utilidad
 * unitaria × unidades disponibles (dónde está el dinero por capturar). Ordena
 * por utilidad potencial desc.
 */
export function armarPrototiposVivos(
  margen: MargenRaw[],
  inventario: InventarioRaw[],
  protoNombre: Map<string, string>
): PrototipoVivoRow[] {
  const invPorProto = new Map(inventario.map((i) => [i.prototipo_id, i]));
  const rows: PrototipoVivoRow[] = [];
  for (const m of margen) {
    const inv = invPorProto.get(m.prototipo_id);
    const disponible = Number(inv?.inventario_disponible ?? 0);
    const en_obra = Number(inv?.inventario_construccion ?? 0);
    if (disponible <= 0 && en_obra <= 0) continue; // prototipo muerto → fuera
    rows.push({
      nombre: m.nombre ?? protoNombre.get(m.prototipo_id) ?? '—',
      disponible,
      en_obra,
      valor_comercial: m.valor_comercial,
      margen_pct: m.margen_pct,
      utilidad_potencial: Number(m.utilidad ?? 0) * disponible,
    });
  }
  return rows.sort((a, b) => b.utilidad_potencial - a.utilidad_potencial);
}

export type ResumenConsejoData = {
  // ① Tesorería
  saldos: SaldoBancoRow[]; // vacío hasta que tesoreria capture saldos
  // ② Ventas
  tuberiaViva: TuberiaRow[];
  tuberiaHistorico: { clientes: number; valor: number };
  asignaciones: AsignacionRow[];
  // ③ Proyectos
  avances: AvanceRow[];
  prototipos: PrototipoVivoRow[];
  // ④ Construcción
  construccion: ConstruccionResumen;
};

// ── Formato ─────────────────────────────────────────────────────────────────

export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Number(n).toFixed(2)}%`;
}

export function fmtInt(n: number | null | undefined): string {
  if (n == null) return '0';
  return String(n);
}

function fmtShortDate(d: string | null | undefined): string {
  if (!d) return '—';
  // d es ISO date (YYYY-MM-DD) — formatear sin TZ shift
  const [y, m, day] = d.slice(0, 10).split('-');
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

// ── Render (puro) ────────────────────────────────────────────────────────────

const TH =
  'padding:8px 10px;text-align:left;font-size:12px;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0;white-space:nowrap;';
const TD = 'padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#1e293b;';
const TD_NUM = `${TD}text-align:right;white-space:nowrap;`;

type Col = { label: string; align?: 'left' | 'right' };

/** Banda de encabezado de una de las 4 secciones. */
export function renderSectionBand(label: string): string {
  return `
    <div style="padding:18px 32px 2px;">
      <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1a1a2e;border-bottom:2px solid #1a1a2e;padding-bottom:6px;">${label}</div>
    </div>`;
}

/** Tabla genérica con título. `rows` ya vienen formateadas. */
export function renderSection(title: string, cols: Col[], rows: string[][]): string {
  if (rows.length === 0) {
    return `
    <div style="padding:12px 32px 4px;">
      <h2 style="margin:0 0 4px;font-size:14px;font-weight:700;color:#1a1a2e;">${title}</h2>
      <p style="margin:0;font-size:12px;color:#94a3b8;">Sin datos.</p>
    </div>`;
  }
  const headCells = cols
    .map(
      (c) => `<th style="${c.align === 'right' ? TH + 'text-align:right;' : TH}">${c.label}</th>`
    )
    .join('');
  const bodyRows = rows
    .map(
      (r) =>
        `<tr>${r
          .map((cell, i) => `<td style="${cols[i]?.align === 'right' ? TD_NUM : TD}">${cell}</td>`)
          .join('')}</tr>`
    )
    .join('');
  return `
    <div style="padding:12px 32px 4px;">
      <h2 style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1a1a2e;">${title}</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="background:#f1f5f9;">${headCells}</tr>
        ${bodyRows}
      </table>
    </div>`;
}

function renderSaldos(rows: SaldoBancoRow[]): string {
  return renderSection(
    'Saldos en Bancos',
    [
      { label: 'Banco' },
      { label: 'Saldo', align: 'right' },
      { label: 'Última actualización', align: 'right' },
    ],
    rows.map((r) => [r.nombre, fmtMoney(r.saldo), fmtShortDate(r.fecha_saldo)])
  );
}

function renderTuberiaViva(rows: TuberiaRow[]): string {
  return renderSection(
    'Pipeline de Ventas (vivo)',
    [
      { label: 'Fase' },
      { label: 'Clientes', align: 'right' },
      { label: 'Valor de escrituración', align: 'right' },
    ],
    rows.map((r) => [r.fase, fmtInt(r.clientes), fmtMoney(r.valor)])
  );
}

/** Una línea con el acumulado histórico (fuera del funnel vivo). */
function renderHistoricoLinea(h: { clientes: number; valor: number }): string {
  if (h.clientes === 0) return '';
  return `
    <div style="padding:2px 32px 8px;">
      <p style="margin:0;font-size:12px;color:#64748b;">Histórico acumulado: ${h.clientes.toLocaleString('es-MX')} operaciones · ${fmtMoney(h.valor)}</p>
    </div>`;
}

function renderAsignaciones(rows: AsignacionRow[]): string {
  return renderSection(
    'Asignaciones y Escrituras del Mes',
    [
      { label: 'Prototipo' },
      { label: 'Asignaciones', align: 'right' },
      { label: 'Monto', align: 'right' },
      { label: 'Escrituras', align: 'right' },
      { label: 'Monto', align: 'right' },
    ],
    rows.map((r) => [
      r.nombre,
      fmtInt(r.asignaciones_mes),
      fmtMoney(r.monto_asignaciones),
      fmtInt(r.escrituras_mes),
      fmtMoney(r.monto_escrituras),
    ])
  );
}

function renderAvances(rows: AvanceRow[]): string {
  return renderSection(
    'Avance por Desarrollo',
    [
      { label: 'Proyecto' },
      { label: 'Urb. %', align: 'right' },
      { label: 'Const. %', align: 'right' },
      { label: 'Vts. %', align: 'right' },
      { label: 'Lotes', align: 'right' },
      { label: 'Terminadas', align: 'right' },
      { label: 'En constr.', align: 'right' },
      { label: 'Parque disp.', align: 'right' },
      { label: 'Ticket prom.', align: 'right' },
    ],
    rows.map((r) => [
      r.proyecto,
      fmtPct(r.avance_urb_pct),
      fmtPct(r.avance_const_pct),
      fmtPct(r.avance_vts_pct),
      fmtInt(r.lotes_residenciales),
      fmtInt(r.casas_terminadas),
      fmtInt(r.casas_en_construccion),
      fmtInt(r.parque_disponible),
      fmtMoney(r.ticket_promedio),
    ])
  );
}

function renderPrototipos(rows: PrototipoVivoRow[]): string {
  const tabla = renderSection(
    'Inventario y Margen por Prototipo',
    [
      { label: 'Prototipo' },
      { label: 'Disponible', align: 'right' },
      { label: 'En obra', align: 'right' },
      { label: 'Valor comercial', align: 'right' },
      { label: 'Margen', align: 'right' },
      { label: 'Utilidad potencial', align: 'right' },
    ],
    rows.map((r) => [
      r.nombre,
      fmtInt(r.disponible),
      fmtInt(r.en_obra),
      fmtMoney(r.valor_comercial),
      fmtPct(r.margen_pct),
      fmtMoney(r.utilidad_potencial),
    ])
  );
  if (rows.length === 0) return tabla;
  const total = rows.reduce((s, r) => s + r.utilidad_potencial, 0);
  const totalLinea = `
    <div style="padding:0 32px 6px;">
      <p style="margin:0;font-size:12px;color:#1a1a2e;font-weight:600;">Utilidad potencial total en inventario: ${fmtMoney(total)}</p>
      <p style="margin:2px 0 0;font-size:11px;color:#94a3b8;">Solo prototipos con inventario o casas en obra.</p>
    </div>`;
  return tabla + totalLinea;
}

function renderConstruccion(c: ConstruccionResumen): string {
  const vencidas =
    c.vencidas > 0
      ? `<span style="color:#cf222e;font-weight:600;">${fmtInt(c.vencidas)} con hito vencido</span>`
      : 'sin hitos vencidos';
  const mo = c.mo_por_ejecutar != null ? ` · MO por ejecutar ${fmtMoney(c.mo_por_ejecutar)}` : '';
  return `
    <div style="padding:12px 32px 4px;">
      <h2 style="margin:0 0 6px;font-size:14px;font-weight:700;color:#1a1a2e;">Obra en Construcción</h2>
      <p style="margin:0;font-size:13px;color:#1e293b;">${fmtInt(c.casas_en_obra)} casas en obra · ${vencidas}${mo}</p>
    </div>`;
}

/** Ensambla el correo completo en 4 secciones. */
export function renderResumenConsejoHtml(
  data: ResumenConsejoData,
  opts: { headerImageUrl?: string | null; fechaTitulo: string }
): string {
  const tesoreria = data.saldos.length
    ? renderSectionBand('Tesorería') + renderSaldos(data.saldos)
    : '';

  const ventas =
    renderSectionBand('Ventas') +
    renderTuberiaViva(data.tuberiaViva) +
    renderHistoricoLinea(data.tuberiaHistorico) +
    renderAsignaciones(data.asignaciones);

  const proyectos =
    renderSectionBand('Proyectos') +
    renderAvances(data.avances) +
    renderPrototipos(data.prototipos);

  const construccion = renderSectionBand('Construcción') + renderConstruccion(data.construccion);

  const body = [tesoreria, ventas, proyectos, construccion].filter(Boolean).join('\n');

  // Layout full-width que se adapta al ancho de la pantalla (preferencia de Beto).
  const header = opts.headerImageUrl
    ? `<div style="background:#1a1a2e;line-height:0;"><img src="${opts.headerImageUrl}" alt="DILESA" style="display:block;width:100%;height:auto;border:0;" /></div>`
    : '';

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="width:100%;background:#ffffff;">
    ${header}
    <div style="background:#1a1a2e;padding:18px 32px 22px;">
      <h1 style="margin:0;font-size:19px;font-weight:700;color:#ffffff;">Operación DILESA 🏘️</h1>
      <p style="margin:6px 0 0;font-size:13px;color:#cbd5e1;">${opts.fechaTitulo}</p>
    </div>
    ${body}
    <div style="padding:20px 32px 28px;">
      <p style="margin:0;font-size:11px;color:#94a3b8;">Generado por BSOP — sistema operativo DILESA.</p>
    </div>
  </div>
</body></html>`;
}

// ── Fetch ────────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** Fecha-título en español (ej. "7 de junio de 2026"), TZ America/Matamoros. */
export function fechaTituloCST(now: Date): string {
  // America/Matamoros = UTC-6 (CST) / UTC-5 (CDT). Aproximación CST fija para el
  // título; el guard de domingo del cron usa el TZ real.
  const cst = new Date(now.getTime() - 6 * 3600 * 1000);
  return `${cst.getUTCDate()} de ${MONTH_NAMES[cst.getUTCMonth()]} de ${cst.getUTCFullYear()}`;
}

/** Hora objetivo de envío en horario local de Matamoros (8pm). */
export const HORA_ENVIO_LOCAL = 20;

/**
 * Hora (0-23) y si es domingo en horario local de Matamoros, con DST real.
 * Matamoros es zona fronteriza y SÍ observa horario de verano (CDT, UTC-5) e
 * invierno (CST, UTC-6) siguiendo a EE.UU.; por eso no usamos un offset fijo —
 * Intl resuelve el offset correcto según la fecha. El cron dispara en las dos
 * horas UTC candidatas (01:00 y 02:00) y este reloj deja pasar solo la corrida
 * que cae a las 20:00 locales, auto-ajustándose verano/invierno sin doble envío.
 */
export function relojMatamoros(now: Date): { hora: number; esDomingo: boolean } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Matamoros',
    hour: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(now);
  const hora = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  const esDomingo = parts.find((p) => p.type === 'weekday')?.value === 'Sun';
  return { hora, esDomingo };
}

/**
 * Arma la data del correo desde las vistas DILESA. `supabase` debe ser un cliente
 * con acceso de lectura a los schemas `dilesa` y `erp` (service-role en el cron).
 * `empresaId` = DILESA. `now` para el corte del mes (asignaciones/escrituras).
 */
export async function fetchResumenConsejoData(
  supabase: SupabaseClient,
  empresaId: string,
  now: Date
): Promise<ResumenConsejoData> {
  const dilesa = supabase.schema('dilesa');
  const erp = supabase.schema('erp');
  const inicioMes = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);

  const [
    proyectosRes,
    avancesRes,
    margenRes,
    inventarioRes,
    productosRes,
    ventasRes,
    fasesCatRes,
    fasesMesRes,
    contratistaRes,
    saldosRes,
  ] = await Promise.all([
    dilesa.from('proyectos').select('id,nombre').eq('empresa_id', empresaId).is('deleted_at', null),
    dilesa.from('v_proyecto_avances').select('*').eq('empresa_id', empresaId),
    dilesa.from('v_margen_prototipo').select('*').eq('empresa_id', empresaId),
    dilesa.from('v_inventario_prototipo').select('*').eq('empresa_id', empresaId),
    dilesa.from('productos').select('id,nombre').eq('empresa_id', empresaId).is('deleted_at', null),
    dilesa
      .from('ventas')
      .select('estado,fase_actual,fase_posicion,valor_escrituracion')
      .eq('empresa_id', empresaId)
      .is('deleted_at', null),
    dilesa
      .from('venta_fase_catalogo')
      .select('nombre,posicion')
      .eq('empresa_id', empresaId)
      .is('deleted_at', null),
    dilesa
      .from('venta_fases')
      .select('venta_id,fase,fecha')
      .eq('empresa_id', empresaId)
      .is('deleted_at', null)
      .gte('fecha', inicioMes)
      .in('fase', ['Asignada', 'Escriturada']),
    dilesa.from('v_contratista_obra').select('*').eq('empresa_id', empresaId),
    erp.from('v_cuenta_saldo_actual').select('*').eq('empresa_id', empresaId),
  ]);

  const proyNombre = new Map<string, string>(
    (proyectosRes.data ?? []).map((p: { id: string; nombre: string }) => [p.id, p.nombre])
  );
  const protoNombre = new Map<string, string>(
    (productosRes.data ?? []).map((p: { id: string; nombre: string }) => [p.id, p.nombre])
  );

  // Avances: desarrollos con unidades (lotes_total > 0), EXCLUYENDO los 100%
  // terminados (construcción y ventas al 100% — ya no son operación activa).
  const avances: AvanceRow[] = (avancesRes.data ?? [])
    .filter((a: Record<string, unknown>) => {
      if (Number(a.lotes_total) <= 0) return false;
      const terminado =
        Number(a.avance_const_pct ?? 0) >= 100 && Number(a.avance_vts_pct ?? 0) >= 100;
      return !terminado;
    })
    .map((a: Record<string, unknown>) => ({
      proyecto: proyNombre.get(a.proyecto_id as string) ?? '—',
      avance_urb_pct: a.avance_urb_pct as number | null,
      avance_const_pct: a.avance_const_pct as number | null,
      avance_vts_pct: a.avance_vts_pct as number | null,
      lotes_residenciales: Number(a.lotes_residenciales ?? 0),
      casas_terminadas: Number(a.casas_terminadas ?? 0),
      casas_en_construccion: Number(a.casas_en_construccion ?? 0),
      parque_disponible: Number(a.parque_disponible ?? 0),
      ticket_promedio: a.ticket_promedio as number | null,
    }))
    .sort((x, y) => x.proyecto.localeCompare(y.proyecto));

  // Prototipos vivos: fusión Margen + Inventario, solo con inventario o en obra.
  const prototipos = armarPrototiposVivos(
    (margenRes.data ?? []) as MargenRaw[],
    (inventarioRes.data ?? []) as InventarioRaw[],
    protoNombre
  );

  // Tubería: pipeline vivo (activas por fase) + línea de histórico (terminadas).
  const { viva: tuberiaViva, historico: tuberiaHistorico } = armarTuberiaSplit(
    (fasesCatRes.data ?? []) as { nombre: string; posicion: number }[],
    (ventasRes.data ?? []) as VentaTuberiaInput[]
  );

  // Asignaciones/escrituras del mes: por venta_fases del mes, agrupadas por prototipo.
  // Requiere resolver venta → unidad → producto. Se hace con un fetch puntual de las
  // ventas involucradas (rara vez son muchas en un mes).
  const ventaIds = [
    ...new Set((fasesMesRes.data ?? []).map((f: { venta_id: string }) => f.venta_id)),
  ];
  const asignaciones: AsignacionRow[] = [];
  if (ventaIds.length) {
    const ventasMes = await dilesa
      .from('ventas')
      .select('id,unidad_id,precio_asignacion,valor_escrituracion')
      .in('id', ventaIds);
    const unidadIds = [
      ...new Set(
        (ventasMes.data ?? []).map((v: { unidad_id: string | null }) => v.unidad_id).filter(Boolean)
      ),
    ] as string[];
    const unidades = unidadIds.length
      ? await dilesa.from('unidades').select('id,producto_id').in('id', unidadIds)
      : { data: [] };
    const unidadProto = new Map<string, string>(
      (unidades.data ?? []).map((u: { id: string; producto_id: string | null }) => [
        u.id,
        u.producto_id ?? '',
      ])
    );
    const ventaInfo = new Map(
      (ventasMes.data ?? []).map((v: Record<string, unknown>) => [v.id as string, v])
    );
    const acc = new Map<string, AsignacionRow>();
    for (const f of fasesMesRes.data ?? []) {
      const ff = f as { venta_id: string; fase: string };
      const v = ventaInfo.get(ff.venta_id) as Record<string, unknown> | undefined;
      if (!v) continue;
      const proto = protoNombre.get(unidadProto.get(v.unidad_id as string) ?? '') ?? '—';
      const row = acc.get(proto) ?? {
        nombre: proto,
        asignaciones_mes: 0,
        monto_asignaciones: 0,
        escrituras_mes: 0,
        monto_escrituras: 0,
      };
      if (ff.fase === 'Asignada') {
        row.asignaciones_mes += 1;
        row.monto_asignaciones += Number(v.precio_asignacion ?? 0);
      } else if (ff.fase === 'Escriturada') {
        row.escrituras_mes += 1;
        row.monto_escrituras += Number(v.valor_escrituracion ?? 0);
      }
      acc.set(proto, row);
    }
    asignaciones.push(...[...acc.values()].sort((x, y) => x.nombre.localeCompare(y.nombre)));
  }

  // Construcción: línea de excepción (agregado de v_contratista_obra).
  const contratistaRows = (contratistaRes.data ?? []) as Record<string, unknown>[];
  const construccion: ConstruccionResumen = {
    casas_en_obra: contratistaRows.reduce((s, c) => s + Number(c.viviendas ?? 0), 0),
    vencidas: contratistaRows.reduce((s, c) => s + Number(c.vencidas ?? 0), 0),
    mo_por_ejecutar: contratistaRows.length
      ? contratistaRows.reduce(
          (s, c) => s + (Number(c.mo_contratado ?? 0) - Number(c.mo_ejecutado ?? 0)),
          0
        )
      : null,
  };

  const saldos: SaldoBancoRow[] = (saldosRes.data ?? []).map((s: Record<string, unknown>) => ({
    nombre: s.nombre as string,
    banco: s.banco as string | null,
    saldo: s.saldo as number | null,
    fecha_saldo: s.fecha_saldo as string | null,
  }));

  return { saldos, tuberiaViva, tuberiaHistorico, asignaciones, avances, prototipos, construccion };
}

// ── Envío ────────────────────────────────────────────────────────────────────

/**
 * Envío genérico vía Resend (sendMinutaEmail está acoplada a juntas). Sin estado
 * de juntas/notification_log — el caller decide la trazabilidad.
 */
export async function sendResumenEmail(
  resendKey: string,
  payload: {
    html: string;
    subject: string;
    from: string;
    recipients: string[];
    cc?: string[];
    bcc?: string[];
  }
): Promise<{ ok: boolean; id?: string; error?: unknown }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: payload.from,
      to: payload.recipients,
      cc: payload.cc && payload.cc.length > 0 ? payload.cc : undefined,
      bcc: payload.bcc && payload.bcc.length > 0 ? payload.bcc : undefined,
      subject: payload.subject,
      html: payload.html,
    }),
  });
  if (!res.ok) {
    return { ok: false, error: await res.text().catch(() => res.statusText) };
  }
  const data = (await res.json()) as { id?: string };
  return { ok: true, id: data.id };
}
