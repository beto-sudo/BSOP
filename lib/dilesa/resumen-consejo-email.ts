/**
 * Resumen Diario Operación DILESA — correo al Consejo (cutover Coda → BSOP).
 *
 * Recrea el correo "Resumen Diario Operación Dilesa 🏘️" que Coda enviaba a
 * `consejo@dilesa.mx`. Iniciativa `dilesa-resumen-consejo`.
 *
 * Diseño: las funciones de render son PURAS (reciben data, devuelven HTML) para
 * testearlas sin DB. `fetchResumenConsejoData` arma la data desde las vistas.
 * El bloque de Saldos Bancos (#1) es opcional — se enchufa cuando la iniciativa
 * `tesoreria` tenga saldos capturados (vista `erp.v_cuenta_saldo_actual`).
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

export type MargenRow = {
  nombre: string;
  valor_comercial: number | null;
  costo_total: number | null;
  utilidad: number | null;
  margen_pct: number | null;
};

export type InventarioRow = {
  nombre: string;
  inventario_construccion: number;
  inventario_terminado: number;
  en_inventario: number;
  inventario_asignado: number;
  inventario_disponible: number;
};

export type TuberiaRow = {
  fase: string;
  clientes: number;
  valor: number;
};

export type AsignacionRow = {
  nombre: string;
  asignaciones_mes: number;
  monto_asignaciones: number;
  escrituras_mes: number;
  monto_escrituras: number;
};

export type ContratistaRow = {
  contratista: string;
  viviendas: number;
  mo_contratado: number | null;
  mo_ejecutado: number | null;
  pct_ejecutado: number | null;
  avance_real: number | null;
  efectividad_pct: number | null;
  vencidas: number;
};

export type ResumenConsejoData = {
  saldos: SaldoBancoRow[]; // vacío hasta que tesoreria capture saldos
  avances: AvanceRow[];
  margen: MargenRow[];
  inventario: InventarioRow[];
  tuberia: TuberiaRow[];
  asignaciones: AsignacionRow[];
  contratistas: ContratistaRow[];
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

/** Tabla genérica con encabezado de sección. `rows` ya vienen formateadas. */
export function renderSection(title: string, cols: Col[], rows: string[][]): string {
  if (rows.length === 0) {
    return `
    <div style="padding:16px 32px 4px;">
      <h2 style="margin:0 0 4px;font-size:15px;font-weight:700;color:#1a1a2e;">${title}</h2>
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
    <div style="padding:16px 32px 4px;">
      <h2 style="margin:0 0 8px;font-size:15px;font-weight:700;color:#1a1a2e;">${title}</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr style="background:#f1f5f9;">${headCells}</tr>
        ${bodyRows}
      </table>
    </div>`;
}

function renderSaldos(rows: SaldoBancoRow[]): string {
  return renderSection(
    'Resumen Saldos Bancos',
    [
      { label: 'Banco' },
      { label: 'Saldo', align: 'right' },
      { label: 'Última actualización', align: 'right' },
    ],
    rows.map((r) => [r.nombre, fmtMoney(r.saldo), fmtShortDate(r.fecha_saldo)])
  );
}

function renderAvances(rows: AvanceRow[]): string {
  return renderSection(
    'Resumen Avances Proyectos',
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

function renderMargen(rows: MargenRow[]): string {
  return renderSection(
    'Análisis de Margen',
    [
      { label: 'Prototipo' },
      { label: 'Valor comercial', align: 'right' },
      { label: 'Costo total', align: 'right' },
      { label: 'Utilidad', align: 'right' },
      { label: 'Margen', align: 'right' },
    ],
    rows.map((r) => [
      r.nombre,
      fmtMoney(r.valor_comercial),
      fmtMoney(r.costo_total),
      fmtMoney(r.utilidad),
      fmtPct(r.margen_pct),
    ])
  );
}

function renderInventario(rows: InventarioRow[]): string {
  return renderSection(
    'Inventario por Prototipo',
    [
      { label: 'Prototipo' },
      { label: 'En constr.', align: 'right' },
      { label: 'Terminado', align: 'right' },
      { label: 'En inventario', align: 'right' },
      { label: 'Asignado', align: 'right' },
      { label: 'Disponible', align: 'right' },
    ],
    rows.map((r) => [
      r.nombre,
      fmtInt(r.inventario_construccion),
      fmtInt(r.inventario_terminado),
      fmtInt(r.en_inventario),
      fmtInt(r.inventario_asignado),
      fmtInt(r.inventario_disponible),
    ])
  );
}

function renderTuberia(rows: TuberiaRow[]): string {
  return renderSection(
    'Tubería',
    [
      { label: 'Fase' },
      { label: 'Clientes', align: 'right' },
      { label: 'Valor de escrituración', align: 'right' },
    ],
    rows.map((r) => [r.fase, fmtInt(r.clientes), fmtMoney(r.valor)])
  );
}

function renderAsignaciones(rows: AsignacionRow[]): string {
  return renderSection(
    'Resumen de Asignaciones y Ventas (del mes)',
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

function renderContratistas(rows: ContratistaRow[]): string {
  return renderSection(
    'Operación Contratistas (obra en construcción)',
    [
      { label: 'Contratista' },
      { label: 'Viviendas', align: 'right' },
      { label: 'Monto contrato (MO)', align: 'right' },
      { label: 'Ejecutado', align: 'right' },
      { label: 'Efectividad', align: 'right' },
      { label: 'Vencidas', align: 'right' },
    ],
    rows.map((r) => [
      r.contratista,
      fmtInt(r.viviendas),
      fmtMoney(r.mo_contratado),
      `${fmtMoney(r.mo_ejecutado)} (${fmtPct(r.pct_ejecutado)})`,
      fmtPct(r.efectividad_pct),
      fmtInt(r.vencidas),
    ])
  );
}

/** Ensambla el correo completo. El bloque de saldos solo aparece si hay data. */
export function renderResumenConsejoHtml(
  data: ResumenConsejoData,
  opts: { headerImageUrl?: string | null; fechaTitulo: string }
): string {
  const sections = [
    data.saldos.length ? renderSaldos(data.saldos) : '',
    renderAvances(data.avances),
    renderMargen(data.margen),
    renderInventario(data.inventario),
    renderTuberia(data.tuberia),
    renderAsignaciones(data.asignaciones),
    renderContratistas(data.contratistas),
  ]
    .filter(Boolean)
    .join('\n');

  // Layout full-width que se adapta al ancho de la pantalla (preferencia de Beto).
  // El fix robusto del header para todos los clientes va en la estandarización de
  // correos (iniciativa aparte).
  const header = opts.headerImageUrl
    ? `<div style="background:#1a1a2e;line-height:0;"><img src="${opts.headerImageUrl}" alt="DILESA" style="display:block;width:100%;height:auto;border:0;" /></div>`
    : '';

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="width:100%;background:#ffffff;">
    ${header}
    <div style="background:#1a1a2e;padding:18px 32px 22px;">
      <h1 style="margin:0;font-size:19px;font-weight:700;color:#ffffff;">Resumen Diario Operación Dilesa 🏘️</h1>
      <p style="margin:6px 0 0;font-size:13px;color:#cbd5e1;">${opts.fechaTitulo}</p>
    </div>
    ${sections}
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
 * que cae a las 20:00 locales, auto-ajustándose al cambio de horario sin tener
 * que editar el cron dos veces al año.
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
      .select('fase_actual,fase_posicion,valor_escrituracion')
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

  const margen: MargenRow[] = (margenRes.data ?? [])
    .map((m: Record<string, unknown>) => ({
      nombre: m.nombre as string,
      valor_comercial: m.valor_comercial as number | null,
      costo_total: m.costo_total as number | null,
      utilidad: m.utilidad as number | null,
      margen_pct: m.margen_pct as number | null,
    }))
    .sort((x, y) => x.nombre.localeCompare(y.nombre));

  const inventario: InventarioRow[] = (inventarioRes.data ?? [])
    .map((i: Record<string, unknown>) => ({
      nombre: protoNombre.get(i.prototipo_id as string) ?? '—',
      inventario_construccion: Number(i.inventario_construccion ?? 0),
      inventario_terminado: Number(i.inventario_terminado ?? 0),
      en_inventario: Number(i.en_inventario ?? 0),
      inventario_asignado: Number(i.inventario_asignado ?? 0),
      inventario_disponible: Number(i.inventario_disponible ?? 0),
    }))
    .filter((i) => i.en_inventario > 0)
    .sort((x, y) => x.nombre.localeCompare(y.nombre));

  // Tubería: count + sum(valor_escrituracion) por fase, en el orden del catálogo
  const fasesCat = (fasesCatRes.data ?? []).sort(
    (a: { posicion: number }, b: { posicion: number }) => a.posicion - b.posicion
  );
  const porFase = new Map<string, { clientes: number; valor: number }>();
  for (const v of ventasRes.data ?? []) {
    const fase = (v as { fase_actual: string | null }).fase_actual;
    if (!fase) continue;
    const acc = porFase.get(fase) ?? { clientes: 0, valor: 0 };
    acc.clientes += 1;
    acc.valor += Number((v as { valor_escrituracion: number | null }).valor_escrituracion ?? 0);
    porFase.set(fase, acc);
  }
  const tuberia: TuberiaRow[] = fasesCat.map((f: { nombre: string }) => ({
    fase: f.nombre,
    clientes: porFase.get(f.nombre)?.clientes ?? 0,
    valor: porFase.get(f.nombre)?.valor ?? 0,
  }));

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

  // Contratistas con obra en construcción (vista dilesa.v_contratista_obra):
  // viviendas activas, monto de contrato (MO), ejecutado, efectividad vs
  // calendario y vencidas. Ordenado por número de viviendas.
  const contratistas: ContratistaRow[] = (contratistaRes.data ?? [])
    .map((c: Record<string, unknown>) => ({
      contratista: (c.contratista as string | null) ?? '—',
      viviendas: Number(c.viviendas ?? 0),
      mo_contratado: c.mo_contratado as number | null,
      mo_ejecutado: c.mo_ejecutado as number | null,
      pct_ejecutado: c.pct_ejecutado as number | null,
      avance_real: c.avance_real as number | null,
      efectividad_pct: c.efectividad_pct as number | null,
      vencidas: Number(c.vencidas ?? 0),
    }))
    .sort((x, y) => y.viviendas - x.viviendas);

  const saldos: SaldoBancoRow[] = (saldosRes.data ?? []).map((s: Record<string, unknown>) => ({
    nombre: s.nombre as string,
    banco: s.banco as string | null,
    saldo: s.saldo as number | null,
    fecha_saldo: s.fecha_saldo as string | null,
  }));

  return { saldos, avances, margen, inventario, tuberia, asignaciones, contratistas };
}

// ── Envío ────────────────────────────────────────────────────────────────────

/**
 * Envío genérico vía Resend (sendMinutaEmail está acoplada a juntas). Sin estado
 * de juntas/notification_log — el caller decide la trazabilidad.
 */
export async function sendResumenEmail(
  resendKey: string,
  payload: { html: string; subject: string; from: string; recipients: string[] }
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
