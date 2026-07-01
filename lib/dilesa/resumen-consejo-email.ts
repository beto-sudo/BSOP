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
import type { KpisDelDia } from './resumen-consejo-kpis';
import { fechaISOMatamoros, inicioMesMatamoros } from '@/lib/fecha-mx';

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
  /** Ventas que ENTRARON a esta fase hoy (movimiento del día). */
  hoy: number;
};

export type VentaTuberiaInput = {
  estado: string | null;
  fase_actual: string | null;
  valor_escrituracion: number | null;
  precio_asignacion: number | null;
};

/**
 * Parte la tubería en pipeline VIVO vs histórico. El histórico (ventas
 * 'terminada', ~1,090 ops / ~$1,000M) sale del funnel a una sola línea — antes
 * lo aplastaba 10×. El pipeline vivo son las ventas 'activa' agrupadas por fase
 * (solo las fases con clientes, en orden de catálogo) + una fila "Sin fase
 * asignada" para las activas con fase NULL o con grafía fuera de catálogo (así
 * la tubería nunca pierde clientes en silencio). Las desasignadas/expiradas no
 * cuentan: son ventas caídas.
 *
 * `movHoyPorPos` = movimiento del día por posición de fase (filas de
 * `venta_fases` con fecha = hoy). Se anota en cada fila viva. Nota: el funnel
 * solo lista fases con clientes vivos, así que un movimiento a una fase que ya
 * quedó en cero vivos (entró y avanzó el mismo día) no aparece aquí — el módulo
 * Fases sí lo muestra (lista las 17 siempre).
 */
export function armarTuberiaSplit(
  fasesCat: { nombre: string; posicion: number }[],
  ventas: VentaTuberiaInput[],
  movHoyPorPos: ReadonlyMap<number, number> = new Map()
): { viva: TuberiaRow[]; historico: { clientes: number; valor: number } } {
  const orden = [...fasesCat].sort((a, b) => a.posicion - b.posicion);
  const conocidas = new Set(orden.map((f) => f.nombre));
  const porFase = new Map<string, { clientes: number; valor: number }>();
  const sinFase = { clientes: 0, valor: 0 };
  const historico = { clientes: 0, valor: 0 };
  for (const v of ventas) {
    // `valor_escrituracion` no se captura hasta la Fase 8 (Dictaminada). Antes de
    // eso (Asignada/Formalizada/…) el valor comprometido ya existe: es el
    // `precio_asignacion` congelado al asignar. Sin este fallback, el pipeline
    // mostraba $0 en las fases tempranas. Mismo criterio que `armarBacklog`.
    const valor = Number(v.valor_escrituracion ?? v.precio_asignacion ?? 0);
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
      hoy: movHoyPorPos.get(f.posicion) ?? 0,
    }))
    // Solo fases con clientes vivos — el funnel muestra dónde están las ventas,
    // no las 17 etapas en cero.
    .filter((r) => r.clientes > 0);
  if (sinFase.clientes > 0) {
    viva.push({
      fase: 'Sin fase asignada',
      clientes: sinFase.clientes,
      valor: sinFase.valor,
      hoy: 0,
    });
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

/** Absorción y meses de inventario por desarrollo (Sprint 4 — tendencia, sin delta diario). */
export type AbsorcionRow = {
  desarrollo: string;
  inv_disponible: number;
  asignadas_3m: number;
  ritmo_mensual: number;
  /** inventario ÷ ritmo mensual; null si no hubo asignaciones en la ventana (sin ritmo). */
  meses_inventario: number | null;
};

/** Ventana de absorción en meses (3M móvil). */
export const ABSORCION_VENTANA_MESES = 3;

/**
 * Absorción = ritmo de venta (asignaciones) por desarrollo en los últimos
 * `ABSORCION_VENTANA_MESES` meses; meses de inventario = inventario disponible ÷
 * ritmo mensual. Solo desarrollos con inventario disponible (los agotados no
 * informan). Es una TENDENCIA (3M móvil), no un delta diario — el doc fija que
 * los ratios nunca llevan flecha ▲▼ del día. Ordena por desarrollo para cruzar
 * con la tabla "Avance por Desarrollo" de arriba.
 */
export function armarAbsorcion(
  avances: { proyecto_id: string; inventario_disponible_venta: number | null }[],
  asignadas3mPorProyecto: Map<string, number>,
  proyNombre: Map<string, string>
): AbsorcionRow[] {
  const rows: AbsorcionRow[] = [];
  for (const a of avances) {
    const inv = Number(a.inventario_disponible_venta ?? 0);
    if (inv <= 0) continue; // desarrollo sin inventario disponible → fuera
    const asignadas = asignadas3mPorProyecto.get(a.proyecto_id) ?? 0;
    const ritmo = asignadas / ABSORCION_VENTANA_MESES;
    rows.push({
      desarrollo: proyNombre.get(a.proyecto_id) ?? '—',
      inv_disponible: inv,
      asignadas_3m: asignadas,
      ritmo_mensual: ritmo,
      meses_inventario: ritmo > 0 ? inv / ritmo : null,
    });
  }
  return rows.sort((a, b) => a.desarrollo.localeCompare(b.desarrollo));
}

export type VentaBacklogInput = {
  estado: string | null;
  fase_posicion: number | null;
  fecha_escritura: string | null;
  valor_escrituracion: number | null;
  precio_asignacion: number | null;
};

/** Backlog de escrituración: ingreso comprometido por cerrar (# y $). */
export type BacklogEscrituracion = {
  comprometidas_n: number;
  comprometido_monto: number;
};

/** Fase mínima para considerar una venta "comprometida" (≥ Asignada; la fase 1
 * "Solicitud de Asignación" aún es tentativa y no entra al backlog). */
export const BACKLOG_FASE_MIN = 2;

/**
 * Backlog de escrituración = ventas vivas (estado 'activa'), comprometidas
 * (fase ≥ Asignada) y aún sin escriturar (fecha_escritura NULL). Monto a
 * valor de escrituración (o precio de asignación si aún no hay). Es el ingreso
 * casi-seguro en camino. Tendencia, sin delta diario.
 */
export function armarBacklog(ventas: VentaBacklogInput[]): BacklogEscrituracion {
  let n = 0;
  let monto = 0;
  for (const v of ventas) {
    if (v.estado !== 'activa') continue;
    if (v.fecha_escritura) continue; // ya escriturada → fuera del backlog
    if ((v.fase_posicion ?? 0) < BACKLOG_FASE_MIN) continue; // tentativa → fuera
    n += 1;
    monto += Number(v.valor_escrituracion ?? v.precio_asignacion ?? 0);
  }
  return { comprometidas_n: n, comprometido_monto: monto };
}

export type ResumenConsejoData = {
  // ① Tesorería
  saldos: SaldoBancoRow[]; // vacío hasta que tesoreria capture saldos
  // ② Ventas
  tuberiaViva: TuberiaRow[];
  tuberiaHistorico: { clientes: number; valor: number };
  asignaciones: AsignacionRow[];
  backlog: BacklogEscrituracion;
  // ③ Proyectos
  avances: AvanceRow[];
  absorcion: AbsorcionRow[];
  prototipos: PrototipoVivoRow[];
  // ④ Construcción
  construccion: ConstruccionResumen;
};

/**
 * Cabecera ejecutiva (Sprint 3): los KPIs del día + sus deltas vs el snapshot
 * previo + contexto de mes + CxP. Alimenta la tarjeta "Hoy en DILESA", las
 * alertas por excepción, el asunto dinámico y la línea de Cobranza.
 */
export type Cabecera = {
  kpis: KpisDelDia;
  deltas: Record<keyof KpisDelDia, number | null>;
  cobrado_mes: number;
  escrituras_mes_n: number;
  escrituras_mes_monto: number;
  cxp_por_pagar: number;
  /**
   * CxC en reconciliación: la carga histórica de pagos (sobre todo los
   * desembolsos de crédito Infonavit/banco) está incompleta — iniciativa `cxc`
   * in_progress. Mientras esté `true`, el correo marca CxC como PRELIMINAR,
   * muestra solo el abierto y NO emite la alerta/asunto de cobranza vencida (el
   * "vencido" es mayormente fantasma por pagos sin aplicar). Apagar cuando la
   * reconciliación esté al día.
   */
  cxc_preliminar: boolean;
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

/** Moneda compacta para tarjetas/asunto: $128.7M / $644K / $90. */
export function fmtMoneyCompact(n: number | null | undefined): string {
  if (n == null) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

/** Días entre una fecha ISO y hoy (ambas YYYY-MM-DD). null si no hay fecha. */
export function diasDesde(fechaISO: string | null | undefined, hoyISO: string): number | null {
  if (!fechaISO) return null;
  const a = Date.parse(`${fechaISO.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${hoyISO.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Días tras los cuales un saldo se considera stale (rojo + alerta). */
export const SALDO_STALE_DIAS = 7;

/** Color del punto de frescura por antigüedad del saldo. */
export function frescuraColor(dias: number | null): string {
  if (dias == null) return '#94a3b8'; // gris
  if (dias <= 2) return '#1a7f37'; // verde
  if (dias <= SALDO_STALE_DIAS) return '#b45309'; // ámbar
  return '#cf222e'; // rojo
}

const MESES_CORTOS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

/** "2026-06-13" → "13 jun" (para el asunto). */
export function fechaCortaDe(fechaLocal: string): string {
  const [, mm, dd] = fechaLocal.slice(0, 10).split('-');
  const mi = Number(mm) - 1;
  return `${Number(dd)} ${MESES_CORTOS[mi] ?? mm}`;
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

function renderSaldos(rows: SaldoBancoRow[], hoyISO: string): string {
  return renderSection(
    'Saldos en Bancos',
    [
      { label: 'Banco' },
      { label: 'Saldo', align: 'right' },
      { label: 'Última actualización', align: 'right' },
    ],
    rows.map((r) => {
      const dias = diasDesde(r.fecha_saldo, hoyISO);
      const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${frescuraColor(dias)};margin-right:6px;"></span>`;
      const fecha =
        dias != null && dias > SALDO_STALE_DIAS
          ? `<span style="color:#cf222e;font-weight:600;">${fmtShortDate(r.fecha_saldo)} (${dias}d)</span>`
          : fmtShortDate(r.fecha_saldo);
      return [`${dot}${r.nombre}`, fmtMoney(r.saldo), fecha];
    })
  );
}

/** Línea de Cobranza (CxC) bajo los saldos: abierto / cobrado mes / vencido / CxP. */
function renderCxcLinea(cab: Cabecera): string {
  const cxp =
    cab.cxp_por_pagar > 0 ? ` &nbsp;·&nbsp; CxP por pagar: ${fmtMoney(cab.cxp_por_pagar)}` : '';
  // En reconciliación: solo el abierto, marcado preliminar; sin el "vencido"
  // (mayormente fantasma por desembolsos de crédito sin aplicar todavía).
  if (cab.cxc_preliminar) {
    return `
    <div style="padding:2px 32px 10px;">
      <p style="margin:0;font-size:12px;color:#1e293b;"><span style="color:#9a6700;font-weight:600;">Cobranza (CxC) — preliminar, en reconciliación:</span> abierto ${fmtMoney(cab.kpis.cxc_abierto)} · cobrado mes ${fmtMoney(cab.cobrado_mes)}${cxp}. <span style="color:#94a3b8;">Faltan aplicar desembolsos de crédito.</span></p>
    </div>`;
  }
  const venc =
    cab.kpis.cxc_vencido > 0
      ? ` · <span style="color:#cf222e;font-weight:600;">vencido ${fmtMoney(cab.kpis.cxc_vencido)}</span>`
      : '';
  return `
    <div style="padding:2px 32px 10px;">
      <p style="margin:0;font-size:12px;color:#1e293b;"><span style="color:#64748b;">Cobranza (CxC):</span> abierto ${fmtMoney(cab.kpis.cxc_abierto)} · cobrado mes ${fmtMoney(cab.cobrado_mes)}${venc}${cxp}</p>
    </div>`;
}

/** Una tarjeta del bloque ejecutivo. */
function cardCell(label: string, big: string, sub: string, subColor: string): string {
  return `<td style="width:33%;padding:5px;vertical-align:top;">
      <div style="background:#f1f5f9;border-radius:8px;padding:10px 12px;">
        <div style="font-size:11px;color:#64748b;">${label}</div>
        <div style="font-size:18px;font-weight:700;color:#1a1a2e;margin:2px 0;">${big}</div>
        <div style="font-size:11px;color:${subColor};">${sub}</div>
      </div>
    </td>`;
}

/** Tarjeta ejecutiva "Hoy en DILESA": 6 cifras con delta/contexto. */
export function renderTarjetaEjecutiva(
  cab: Cabecera,
  data: ResumenConsejoData,
  hoyISO: string
): string {
  const k = cab.kpis;
  const dv = cab.deltas.ventas_hoy_n;
  const ventasSub =
    dv == null ? '&nbsp;' : dv > 0 ? `▲ +${dv} vs ayer` : dv < 0 ? `▼ ${dv} vs ayer` : '= vs ayer';
  const ventasColor =
    dv != null && dv > 0 ? '#1a7f37' : dv != null && dv < 0 ? '#cf222e' : '#64748b';
  const stale = data.saldos.filter((s) => {
    const d = diasDesde(s.fecha_saldo, hoyISO);
    return d != null && d > SALDO_STALE_DIAS;
  }).length;
  const venc = data.construccion.vencidas;
  const cards = [
    cardCell(
      'Ventas hoy',
      `${k.ventas_hoy_n} · ${fmtMoneyCompact(k.ventas_hoy_monto)}`,
      ventasSub,
      ventasColor
    ),
    cardCell(
      'Escrituras hoy',
      `${k.escrituras_hoy_n} · ${fmtMoneyCompact(k.escrituras_hoy_monto)}`,
      `mes: ${cab.escrituras_mes_n} · ${fmtMoneyCompact(cab.escrituras_mes_monto)}`,
      '#64748b'
    ),
    cardCell(
      'Cobrado hoy',
      fmtMoneyCompact(k.cobrado_hoy),
      `mes: ${fmtMoneyCompact(cab.cobrado_mes)}`,
      '#64748b'
    ),
    cardCell(
      'Liquidez total',
      fmtMoneyCompact(k.liquidez_total),
      stale > 0 ? `▼ ${stale} saldo(s) sin actualizar` : 'saldos al día',
      stale > 0 ? '#cf222e' : '#1a7f37'
    ),
    cardCell(
      'CxC abierto',
      fmtMoneyCompact(k.cxc_abierto),
      cab.cxc_preliminar
        ? 'preliminar · en reconciliación'
        : k.cxc_vencido > 0
          ? `vencido ${fmtMoneyCompact(k.cxc_vencido)}`
          : 'sin vencido',
      cab.cxc_preliminar ? '#9a6700' : k.cxc_vencido > 0 ? '#cf222e' : '#64748b'
    ),
    cardCell(
      'Casas en obra',
      `${k.casas_en_obra}`,
      venc > 0 ? `${venc} con hito vencido` : 'al día',
      venc > 0 ? '#cf222e' : '#64748b'
    ),
  ];
  return `
    <div style="padding:14px 27px 4px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:.05em;color:#64748b;margin:0 5px 6px;">HOY EN DILESA</div>
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
        <tr>${cards.slice(0, 3).join('')}</tr>
        <tr>${cards.slice(3, 6).join('')}</tr>
      </table>
    </div>`;
}

/** Franja de alertas por excepción. Vacía → no se imprime (ausencia = buena señal). */
export function renderAlertas(alertas: string[]): string {
  if (alertas.length === 0) return '';
  const items = alertas.map((a) => `<li style="margin:2px 0;">${a}</li>`).join('');
  return `
    <div style="padding:6px 32px 4px;">
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;">
        <div style="font-size:12px;font-weight:700;color:#cf222e;margin-bottom:4px;">⚠️ Requiere atención</div>
        <ul style="margin:0;padding-left:18px;font-size:12px;color:#991b1b;">${items}</ul>
      </div>
    </div>`;
}

/**
 * Alertas por excepción (cap 3): cobranza vencida, saldos stale, obra vencida.
 * Solo dispara lo que aplica — cero alertas = la franja no se imprime.
 */
export function armarAlertas(cab: Cabecera, data: ResumenConsejoData, hoyISO: string): string[] {
  const a: string[] = [];
  // En reconciliación no se emite la alerta de vencido (mayormente fantasma).
  if (!cab.cxc_preliminar && cab.kpis.cxc_vencido > 0)
    a.push(`Cobranza vencida: ${fmtMoney(cab.kpis.cxc_vencido)}`);
  const stale = data.saldos
    .map((s) => ({ nombre: s.nombre, dias: diasDesde(s.fecha_saldo, hoyISO) }))
    .filter((s) => s.dias != null && s.dias > SALDO_STALE_DIAS)
    .sort((x, y) => (y.dias ?? 0) - (x.dias ?? 0));
  if (stale.length === 1) a.push(`${stale[0].nombre} sin actualizar hace ${stale[0].dias} días`);
  else if (stale.length > 1) a.push(`${stale.length} saldos bancarios sin actualizar`);
  if (data.construccion.vencidas > 0)
    a.push(`${data.construccion.vencidas} casa(s) de obra con hito vencido`);
  return a.slice(0, 3);
}

/** Asunto dinámico: el titular del día. */
export function armarAsunto(
  cab: Cabecera,
  fechaCorta: string,
  data: ResumenConsejoData,
  hoyISO: string
): string {
  const k = cab.kpis;
  const segs: string[] = [`DILESA ${fechaCorta}`];
  segs.push(
    k.ventas_hoy_n > 0
      ? `${k.ventas_hoy_n} venta${k.ventas_hoy_n > 1 ? 's' : ''} ${fmtMoneyCompact(k.ventas_hoy_monto)}`
      : 'sin ventas hoy'
  );
  if (k.escrituras_hoy_n > 0)
    segs.push(`${k.escrituras_hoy_n} escritura${k.escrituras_hoy_n > 1 ? 's' : ''}`);
  if (!cab.cxc_preliminar && k.cxc_vencido > 0)
    segs.push(`CxC venc. ${fmtMoneyCompact(k.cxc_vencido)}`);
  const stale = data.saldos
    .map((s) => ({ nombre: s.nombre, dias: diasDesde(s.fecha_saldo, hoyISO) }))
    .filter((s) => s.dias != null && s.dias > SALDO_STALE_DIAS);
  if (stale.length === 1) segs.push(`${stale[0].nombre} sin actualizar ${stale[0].dias}d`);
  else if (stale.length > 1) segs.push(`${stale.length} saldos viejos`);
  return segs.join(' · ');
}

function renderTuberiaViva(rows: TuberiaRow[]): string {
  return renderSection(
    'Pipeline de Ventas (vivo)',
    [
      { label: 'Fase' },
      { label: 'Clientes', align: 'right' },
      { label: 'Valor de escrituración', align: 'right' },
      { label: 'Movimiento del día', align: 'right' },
    ],
    rows.map((r) => [
      r.fase,
      fmtInt(r.clientes),
      fmtMoney(r.valor),
      r.hoy > 0 ? `+${fmtInt(r.hoy)}` : '—',
    ])
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

function renderAbsorcion(rows: AbsorcionRow[]): string {
  const tabla = renderSection(
    'Absorción y Meses de Inventario',
    [
      { label: 'Desarrollo' },
      { label: 'Disponible', align: 'right' },
      { label: 'Asignadas 3M', align: 'right' },
      { label: 'Ritmo/mes', align: 'right' },
      { label: 'Meses inv.', align: 'right' },
    ],
    rows.map((r) => [
      r.desarrollo,
      fmtInt(r.inv_disponible),
      fmtInt(r.asignadas_3m),
      r.ritmo_mensual > 0 ? r.ritmo_mensual.toFixed(1) : '—',
      r.meses_inventario != null ? `${r.meses_inventario.toFixed(1)} m` : '—',
    ])
  );
  if (rows.length === 0) return tabla;
  const nota = `
    <div style="padding:0 32px 6px;">
      <p style="margin:0;font-size:11px;color:#94a3b8;">Ritmo = asignaciones de los últimos 3 meses ÷ 3. Meses de inventario = disponible ÷ ritmo (a este paso de venta).</p>
    </div>`;
  return tabla + nota;
}

function renderBacklog(b: BacklogEscrituracion): string {
  if (b.comprometidas_n === 0) return '';
  return `
    <div style="padding:12px 32px 4px;">
      <h2 style="margin:0 0 6px;font-size:14px;font-weight:700;color:#1a1a2e;">Backlog de Escrituración</h2>
      <p style="margin:0;font-size:13px;color:#1e293b;">${fmtInt(b.comprometidas_n)} operaciones comprometidas por escriturar · ${fmtMoney(b.comprometido_monto)}</p>
      <p style="margin:2px 0 0;font-size:11px;color:#94a3b8;">Ventas vivas (asignadas en adelante) sin escritura — ingreso comprometido por cerrar.</p>
    </div>`;
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

/** Ensambla el correo completo: cabecera ejecutiva (Sprint 3, si hay) + 4 secciones. */
export function renderResumenConsejoHtml(
  data: ResumenConsejoData,
  opts: {
    headerImageUrl?: string | null;
    fechaTitulo: string;
    fechaLocal?: string;
    cabecera?: Cabecera | null;
  }
): string {
  const hoyISO = opts.fechaLocal ?? '';
  const cab = opts.cabecera ?? null;

  const ejecutivo = cab
    ? renderTarjetaEjecutiva(cab, data, hoyISO) + renderAlertas(armarAlertas(cab, data, hoyISO))
    : '';

  const tesoreria = data.saldos.length
    ? renderSectionBand('Tesorería') +
      renderSaldos(data.saldos, hoyISO) +
      (cab ? renderCxcLinea(cab) : '')
    : '';

  const ventas =
    renderSectionBand('Ventas') +
    renderTuberiaViva(data.tuberiaViva) +
    renderHistoricoLinea(data.tuberiaHistorico) +
    renderAsignaciones(data.asignaciones) +
    renderBacklog(data.backlog);

  const proyectos =
    renderSectionBand('Proyectos') +
    renderAvances(data.avances) +
    renderAbsorcion(data.absorcion) +
    renderPrototipos(data.prototipos);

  const construccion = renderSectionBand('Construcción') + renderConstruccion(data.construccion);

  const body = [ejecutivo, tesoreria, ventas, proyectos, construccion].filter(Boolean).join('\n');

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

/** Fecha-título en español (ej. "7 de junio de 2026"), TZ America/Matamoros (DST real). */
export function fechaTituloCST(now: Date): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Matamoros',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);
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
  // "Hoy" y "el mes" = calendario LOCAL de Matamoros. El correo sale a las 20:00
  // locales, cuando el día/mes UTC ya rodó al siguiente — un corte en UTC vacía
  // el acumulado del mes en cada cierre (bug del 30-jun-2026: acumulado en cero).
  // `venta_fases.fecha` es un `date` local, así que comparamos fecha local.
  const inicioMes = inicioMesMatamoros(now);
  const hoyISO = fechaISOMatamoros(now);
  // Ventana de absorción: 3 meses móviles hasta hoy (aritmética de calendario
  // sobre los componentes de la fecha local; Date.UTC solo resuelve el rollover).
  const [hoyY, hoyM, hoyD] = hoyISO.split('-').map(Number);
  const inicio3m = new Date(Date.UTC(hoyY, hoyM - 1 - ABSORCION_VENTANA_MESES, hoyD))
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
    asign3mRes,
    movHoyRes,
  ] = await Promise.all([
    dilesa.from('proyectos').select('id,nombre').eq('empresa_id', empresaId).is('deleted_at', null),
    dilesa.from('v_proyecto_avances').select('*').eq('empresa_id', empresaId),
    dilesa.from('v_margen_prototipo').select('*').eq('empresa_id', empresaId),
    dilesa.from('v_inventario_prototipo').select('*').eq('empresa_id', empresaId),
    dilesa.from('productos').select('id,nombre').eq('empresa_id', empresaId).is('deleted_at', null),
    dilesa
      .from('ventas')
      .select(
        'estado,fase_actual,fase_posicion,valor_escrituracion,fecha_escritura,precio_asignacion'
      )
      .eq('empresa_id', empresaId)
      .is('deleted_at', null),
    dilesa
      .from('venta_fase_catalogo')
      .select('nombre,posicion')
      .eq('empresa_id', empresaId)
      .is('deleted_at', null),
    dilesa
      .from('venta_fases')
      .select('venta_id,posicion,fecha')
      .eq('empresa_id', empresaId)
      .is('deleted_at', null)
      .gte('fecha', inicioMes)
      .in('posicion', [2, 11]),
    dilesa.from('v_contratista_obra').select('*').eq('empresa_id', empresaId),
    erp.from('v_cuenta_saldo_actual').select('*').eq('empresa_id', empresaId),
    dilesa
      .from('venta_fases')
      .select('venta_id')
      .eq('empresa_id', empresaId)
      .is('deleted_at', null)
      .eq('posicion', 2)
      .gte('fecha', inicio3m),
    dilesa
      .from('venta_fases')
      .select('posicion')
      .eq('empresa_id', empresaId)
      .is('deleted_at', null)
      .eq('fecha', hoyISO),
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

  // Movimiento del día por posición: filas de `venta_fases` con fecha = hoy.
  const movHoyPorPos = new Map<number, number>();
  for (const r of (movHoyRes.data ?? []) as { posicion: number | null }[]) {
    if (r.posicion == null) continue;
    movHoyPorPos.set(r.posicion, (movHoyPorPos.get(r.posicion) ?? 0) + 1);
  }

  // Tubería: pipeline vivo (activas por fase) + línea de histórico (terminadas).
  const { viva: tuberiaViva, historico: tuberiaHistorico } = armarTuberiaSplit(
    (fasesCatRes.data ?? []) as { nombre: string; posicion: number }[],
    (ventasRes.data ?? []) as VentaTuberiaInput[],
    movHoyPorPos
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
      const ff = f as { venta_id: string; posicion: number | null };
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
      if (ff.posicion === 2) {
        row.asignaciones_mes += 1;
        row.monto_asignaciones += Number(v.precio_asignacion ?? 0);
      } else if (ff.posicion === 11) {
        row.escrituras_mes += 1;
        row.monto_escrituras += Number(v.valor_escrituracion ?? 0);
      }
      acc.set(proto, row);
    }
    asignaciones.push(...[...acc.values()].sort((x, y) => x.nombre.localeCompare(y.nombre)));
  }

  // Construcción: línea de excepción. "Casas en obra" cuenta UNIDADES distintas
  // en obra física (suma de v_proyecto_avances.casas_en_construccion) — misma
  // fuente y grano que Avance/Inventario, para que las tres secciones cuadren
  // siempre. NO se suma v_contratista_obra.viviendas: esa vista cuenta FILAS de
  // construcción (una casa con 2 arranques contaría doble). Vencidas y MO por
  // ejecutar sí salen de contratista (son métricas de contrato).
  const contratistaRows = (contratistaRes.data ?? []) as Record<string, unknown>[];
  const casasEnObra = (avancesRes.data ?? []).reduce(
    (s: number, a: Record<string, unknown>) => s + Number(a.casas_en_construccion ?? 0),
    0
  );
  const construccion: ConstruccionResumen = {
    casas_en_obra: casasEnObra,
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

  // Absorción 3M: # ventas DISTINTAS asignadas en los últimos 3 meses por
  // desarrollo (cada venta cuenta 1 vez aunque tenga varias filas 'Asignada').
  // Liga venta → unidad → proyecto; meses de inventario los arma armarAbsorcion.
  const absorcionVentaIds = [
    ...new Set((asign3mRes.data ?? []).map((f: { venta_id: string }) => f.venta_id)),
  ];
  const asignadas3mPorProyecto = new Map<string, number>();
  if (absorcionVentaIds.length) {
    const vtsAbs = await dilesa
      .from('ventas')
      .select('id,unidad_id')
      .in('id', absorcionVentaIds)
      .is('deleted_at', null);
    const unidadIdsAbs = [
      ...new Set(
        (vtsAbs.data ?? []).map((v: { unidad_id: string | null }) => v.unidad_id).filter(Boolean)
      ),
    ] as string[];
    const unidsAbs = unidadIdsAbs.length
      ? await dilesa.from('unidades').select('id,proyecto_id').in('id', unidadIdsAbs)
      : { data: [] };
    const unidadProyecto = new Map<string, string>(
      (unidsAbs.data ?? []).map((u: { id: string; proyecto_id: string | null }) => [
        u.id,
        u.proyecto_id ?? '',
      ])
    );
    for (const v of vtsAbs.data ?? []) {
      const proy = unidadProyecto.get((v as { unidad_id: string | null }).unidad_id ?? '');
      if (!proy) continue;
      asignadas3mPorProyecto.set(proy, (asignadas3mPorProyecto.get(proy) ?? 0) + 1);
    }
  }
  const absorcion = armarAbsorcion(
    (avancesRes.data ?? []) as {
      proyecto_id: string;
      inventario_disponible_venta: number | null;
    }[],
    asignadas3mPorProyecto,
    proyNombre
  );

  // Backlog de escrituración: ventas vivas comprometidas sin escriturar (reusa ventasRes).
  const backlog = armarBacklog((ventasRes.data ?? []) as VentaBacklogInput[]);

  return {
    saldos,
    tuberiaViva,
    tuberiaHistorico,
    asignaciones,
    backlog,
    avances,
    absorcion,
    prototipos,
    construccion,
  };
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
