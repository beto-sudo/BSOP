/**
 * Hilo del gasto — el "viaje" de una compra a través del ciclo P2P.
 *
 * Iniciativa `dilesa-flujo-gasto` · Sprint 1. Dado un documento del ciclo
 * (requisición, cotización, OC, factura o pago), resuelve la cadena completa
 * de documentos ligados y la convierte en pasos para `<HiloGastoStepper>`.
 *
 * El hilo es 100% derivado: todas las ligas ya existen como FKs
 * (`cotizaciones.requisicion_id`, `ordenes_compra.requisicion_id` +
 * `cotizacion_id`, `contratos_construccion.cotizacion_id`,
 * `facturas.orden_compra_id` + `obra_estimacion_id`, `cxp_pago_aplicaciones`).
 * No hay tabla nueva ni vista materializada (decisión D2 del planning doc) —
 * los embeds cross-schema de PostgREST no aplican aquí, así que el fetch usa
 * queries dirigidas por ronda + `.in()` (patrón del repo).
 *
 * Separación: `buildHiloPasos` es puro (testeable sin Supabase);
 * `fetchHiloRegistros` hace el I/O con secuencias explícitas por tipo de
 * documento (3-4 rondas, carga lazy en el drawer — nunca en listados).
 */

export type HiloDocTipo = 'requisicion' | 'cotizacion' | 'oc' | 'contrato' | 'factura' | 'pago';

export type HiloDoc = { tipo: HiloDocTipo; id: string };

export type HiloPasoKey =
  | 'solicitada'
  | 'cotizada'
  | 'ordenada'
  | 'contratada'
  | 'recibida'
  | 'estimada'
  | 'facturada'
  | 'pagada';

export type HiloPasoEstado = 'hecho' | 'actual' | 'parcial' | 'pendiente' | 'cancelado';

/** Referencia a un documento concreto dentro de un paso (0..n por paso). */
export type HiloRef = {
  tipo: HiloDocTipo;
  id: string;
  codigo: string;
};

export type HiloPaso = {
  key: HiloPasoKey;
  label: string;
  estado: HiloPasoEstado;
  /** True cuando este paso corresponde al documento desde el que se mira. */
  esActual: boolean;
  refs: HiloRef[];
  /** Texto corto bajo el label: "60%", "2 · $84,300", fecha, etc. */
  detalle: string | null;
};

export type HiloSabor = 'materiales' | 'obra' | 'directo';

export type HiloGasto = { sabor: HiloSabor; pasos: HiloPaso[] };

/* ------------------------------------------------------------------ */
/* Registros crudos (lo que trae el fetch; plural en todo para que un  */
/* pago multi-factura o una req con varias OCs no rompan el modelo).   */
/* ------------------------------------------------------------------ */

export type ReqReg = {
  id: string;
  codigo: string | null;
  autorizada_at: string | null;
  cancelada_at: string | null;
};
export type CotReg = {
  id: string;
  codigo: string | null;
  estado: string | null;
  cancelada_at: string | null;
};
export type OcReg = {
  id: string;
  codigo: string | null;
  estado: string | null;
  cancelada_at: string | null;
  /** Σ cantidad (viva), Σ recibida — para el % del paso Recibida. */
  cantidadTotal: number;
  cantidadRecibida: number;
  total: number;
};
export type ContratoReg = {
  id: string;
  codigo: string | null;
  valor_total: number;
  cancelada_at: string | null;
};
export type EstimReg = {
  id: string;
  etiqueta: string | null;
  monto_total: number;
  cancelada_at: string | null;
};
export type FacturaReg = {
  id: string;
  uuid_sat: string | null;
  estado_cxp: string | null;
  total: number;
  saldo: number;
  cancelada_at: string | null;
};
export type PagoReg = {
  id: string;
  estado: string | null;
  monto_total: number;
  fecha_pago: string | null;
};

export type HiloRegistros = {
  requisiciones: ReqReg[];
  cotizaciones: CotReg[];
  ocs: OcReg[];
  contratos: ContratoReg[];
  estimaciones: EstimReg[];
  facturas: FacturaReg[];
  pagos: PagoReg[];
};

export function emptyRegistros(): HiloRegistros {
  return {
    requisiciones: [],
    cotizaciones: [],
    ocs: [],
    contratos: [],
    estimaciones: [],
    facturas: [],
    pagos: [],
  };
}

/* ------------------------------------------------------------------ */
/* Hrefs entre módulos (centralizado: también corrige el destino de    */
/* la OC desde CxP, que en DILESA vive en /dilesa/compras).            */
/* ------------------------------------------------------------------ */

/** URL para abrir un documento del ciclo en su módulo, o null si la empresa no tiene ruta. */
export function hrefDoc(empresa: string, tipo: HiloDocTipo, id: string): string | null {
  if (tipo === 'factura') return `/${empresa}/cxp?focus=${id}`;
  if (tipo === 'pago') return `/${empresa}/cxp/pagos?focus=${id}`;
  if (empresa === 'dilesa') {
    switch (tipo) {
      case 'requisicion':
        return `/dilesa/compras/requisiciones?focus=${id}`;
      case 'cotizacion':
        return `/dilesa/compras/cotizaciones?focus=${id}`;
      case 'oc':
        return `/dilesa/compras?focus=${id}`;
      case 'contrato':
        return `/dilesa/construccion/contratos/${id}`;
    }
  }
  // RDB (y futuras): solo la OC tiene módulo propio hoy.
  if (tipo === 'oc') return `/${empresa}/ordenes-compra?focus=${id}`;
  return null;
}

/* ------------------------------------------------------------------ */
/* buildHiloPasos — puro                                               */
/* ------------------------------------------------------------------ */

const labelFactura = (f: FacturaReg): string =>
  f.uuid_sat ? `${f.uuid_sat.slice(0, 8)}…` : 'Factura';

const vivos = <T extends { cancelada_at: string | null }>(xs: T[]): T[] =>
  xs.filter((x) => !x.cancelada_at);

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function fmtMonto(n: number): string {
  return n.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  });
}

/**
 * Convierte registros en pasos renderizables.
 *
 * Reglas:
 * - Sabor: contrato presente → 'obra'; OC presente → 'materiales'; solo
 *   facturas → 'directo' (gasto directo: el hilo arranca en Facturada).
 * - Pasos opcionales sin documento ANTES del primer documento existente se
 *   omiten (no ensuciar con "no aplicó"); pasos futuros siempre se muestran
 *   como pendientes (el stepper dice qué sigue).
 * - "Cotizada" solo aparece si hubo RFQ o si se mira desde la RFQ.
 */
export function buildHiloPasos(registros: HiloRegistros, actual: HiloDoc | null): HiloGasto {
  const reqs = registros.requisiciones;
  const cots = registros.cotizaciones;
  const ocs = registros.ocs;
  const contratos = registros.contratos;
  const estims = registros.estimaciones;
  const facturas = registros.facturas;
  const pagos = registros.pagos;

  // `actual` null = el hilo se mira desde fuera del ciclo (p.ej. una tarea
  // del checklist vía su partida): ningún paso es "estás aquí" y el sabor
  // directo se infiere solo de los datos.
  const esDirecto =
    ocs.length === 0 &&
    (actual === null || actual.tipo === 'factura' || actual.tipo === 'pago') &&
    (facturas.length > 0 || pagos.length > 0);
  const sabor: HiloSabor =
    contratos.length > 0 || actual?.tipo === 'contrato'
      ? 'obra'
      : esDirecto
        ? 'directo'
        : 'materiales';

  const pasos: HiloPaso[] = [];
  const esActual = (tipo: HiloDocTipo) => actual?.tipo === tipo;

  // — Solicitada (requisición) —
  if (reqs.length > 0 || esActual('requisicion')) {
    const r = reqs[0] ?? null;
    pasos.push({
      key: 'solicitada',
      label: 'Solicitada',
      esActual: esActual('requisicion'),
      estado: !r
        ? 'actual'
        : r.cancelada_at
          ? 'cancelado'
          : r.autorizada_at
            ? 'hecho'
            : esActual('requisicion')
              ? 'actual'
              : 'parcial',
      refs: reqs.map((x) => ({ tipo: 'requisicion', id: x.id, codigo: x.codigo ?? 'Req.' })),
      detalle: r && !r.autorizada_at && !r.cancelada_at ? 'sin autorizar' : null,
    });
  }

  // — Cotizada (RFQ, opcional) —
  if (cots.length > 0 || esActual('cotizacion')) {
    const c = cots[0] ?? null;
    pasos.push({
      key: 'cotizada',
      label: 'Cotizada',
      esActual: esActual('cotizacion'),
      estado: !c
        ? 'actual'
        : c.cancelada_at
          ? 'cancelado'
          : c.estado === 'adjudicada'
            ? 'hecho'
            : 'actual',
      refs: cots.map((x) => ({ tipo: 'cotizacion', id: x.id, codigo: x.codigo ?? 'RFQ' })),
      detalle: c && c.estado !== 'adjudicada' && !c.cancelada_at ? (c.estado ?? null) : null,
    });
  }

  if (sabor === 'obra') {
    // — Contratada —
    const contratosVivos = vivos(contratos);
    pasos.push({
      key: 'contratada',
      label: 'Contratada',
      esActual: esActual('contrato'),
      estado:
        contratos.length === 0 ? 'pendiente' : contratosVivos.length === 0 ? 'cancelado' : 'hecho',
      refs: contratos.map((x) => ({ tipo: 'contrato', id: x.id, codigo: x.codigo ?? 'Contrato' })),
      detalle:
        contratosVivos.length > 0 ? fmtMonto(sum(contratosVivos.map((c) => c.valor_total))) : null,
    });

    // — Estimada —
    const estimsVivas = vivos(estims);
    pasos.push({
      key: 'estimada',
      label: 'Estimada',
      esActual: false,
      estado: estimsVivas.length === 0 ? 'pendiente' : 'parcial',
      refs: [],
      detalle:
        estimsVivas.length > 0
          ? `${estimsVivas.length} · ${fmtMonto(sum(estimsVivas.map((e) => e.monto_total)))}`
          : null,
    });
  } else if (sabor === 'materiales') {
    // — Ordenada (siempre visible en materiales: si no hay OC, es lo que sigue) —
    const o = ocs[0] ?? null;
    pasos.push({
      key: 'ordenada',
      label: 'Ordenada',
      esActual: esActual('oc'),
      estado: !o
        ? 'pendiente'
        : o.cancelada_at || o.estado === 'cancelada'
          ? 'cancelado'
          : o.estado === 'borrador'
            ? 'actual'
            : 'hecho',
      refs: ocs.map((x) => ({ tipo: 'oc', id: x.id, codigo: x.codigo ?? 'OC' })),
      detalle: o
        ? o.estado === 'borrador'
          ? 'borrador'
          : fmtMonto(sum(ocs.map((x) => x.total)))
        : null,
    });

    // — Recibida (vive en la OC) —
    const ocsVivas = ocs.filter((o) => !o.cancelada_at && o.estado !== 'cancelada');
    const totalCant = sum(ocsVivas.map((o) => o.cantidadTotal));
    const recibida = sum(ocsVivas.map((o) => o.cantidadRecibida));
    const pct = totalCant > 0 ? Math.round((recibida / totalCant) * 100) : 0;
    const todasCerradas = ocsVivas.length > 0 && ocsVivas.every((o) => o.estado === 'cerrada');
    pasos.push({
      key: 'recibida',
      label: 'Recibida',
      esActual: false,
      estado:
        ocsVivas.length === 0
          ? 'pendiente'
          : todasCerradas || pct >= 100
            ? 'hecho'
            : pct > 0
              ? 'parcial'
              : 'pendiente',
      refs: [],
      detalle: ocsVivas.length > 0 && pct > 0 && pct < 100 ? `${pct}%` : null,
    });
  }

  // — Facturada —
  const facturasVivas = facturas.filter((f) => !f.cancelada_at && f.estado_cxp !== 'cancelada');
  pasos.push({
    key: 'facturada',
    label: 'Facturada',
    esActual: esActual('factura'),
    estado: facturasVivas.length > 0 ? 'hecho' : facturas.length > 0 ? 'cancelado' : 'pendiente',
    refs: facturasVivas.map((f) => ({ tipo: 'factura', id: f.id, codigo: labelFactura(f) })),
    detalle:
      facturasVivas.length > 0
        ? `${facturasVivas.length} · ${fmtMonto(sum(facturasVivas.map((f) => f.total)))}`
        : null,
  });

  // — Pagada —
  const pagosVivos = pagos.filter((p) => p.estado !== 'cancelado' && p.estado !== 'rechazado');
  const pagosPagados = pagosVivos.filter((p) => p.estado === 'pagado');
  const saldoTotal = sum(facturasVivas.map((f) => f.saldo));
  pasos.push({
    key: 'pagada',
    label: 'Pagada',
    esActual: esActual('pago'),
    estado:
      facturasVivas.length > 0 && saldoTotal <= 0 && pagosPagados.length > 0
        ? 'hecho'
        : pagosVivos.length > 0
          ? 'parcial'
          : 'pendiente',
    refs: pagosVivos.map((p) => ({ tipo: 'pago', id: p.id, codigo: 'Pago' })),
    detalle:
      pagosPagados.length > 0
        ? fmtMonto(sum(pagosPagados.map((p) => p.monto_total)))
        : pagosVivos.length > 0
          ? (pagosVivos[0].estado ?? null)
          : null,
  });

  return { sabor, pasos };
}

/* ------------------------------------------------------------------ */
/* fetchHiloRegistros — I/O                                            */
/* ------------------------------------------------------------------ */

/** Cliente mínimo que necesitamos (evita acoplar al tipo generado completo). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { schema: (s: 'erp' | 'dilesa') => any };

const REQ_COLS = 'id, codigo, autorizada_at, cancelada_at';
const COT_COLS = 'id, codigo, estado, cancelada_at, requisicion_id';
const OC_COLS =
  'id, codigo, estado, cancelada_at, requisicion_id, cotizacion_id, ordenes_compra_detalle(cantidad, cantidad_recibida, cantidad_cancelada, precio_unitario, precio_real)';
const CONTRATO_COLS = 'id, codigo, valor_total, cancelada_at, cotizacion_id';
const ESTIM_COLS = 'id, etiqueta, monto_total, cancelada_at, contrato_id';
const FACT_COLS =
  'id, uuid_sat, estado_cxp, total, saldo, cancelada_at, orden_compra_id, obra_estimacion_id';
const PAGO_COLS = 'id, estado, monto_total, fecha_pago';

type OcRaw = {
  id: string;
  codigo: string | null;
  estado: string | null;
  cancelada_at: string | null;
  requisicion_id: string | null;
  cotizacion_id: string | null;
  ordenes_compra_detalle: Array<{
    cantidad: number | null;
    cantidad_recibida: number | null;
    cantidad_cancelada: number | null;
    precio_unitario: number | null;
    precio_real: number | null;
  }> | null;
};

function mapOc(o: OcRaw): OcReg & { requisicion_id: string | null; cotizacion_id: string | null } {
  const det = o.ordenes_compra_detalle ?? [];
  const cantidadTotal = sum(
    det.map((d) => Math.max(0, Number(d.cantidad ?? 0) - Number(d.cantidad_cancelada ?? 0)))
  );
  return {
    id: o.id,
    codigo: o.codigo,
    estado: o.estado,
    cancelada_at: o.cancelada_at,
    cantidadTotal,
    cantidadRecibida: sum(det.map((d) => Number(d.cantidad_recibida ?? 0))),
    total: sum(
      det.map((d) => Number(d.cantidad ?? 0) * Number(d.precio_real ?? d.precio_unitario ?? 0))
    ),
    requisicion_id: o.requisicion_id,
    cotizacion_id: o.cotizacion_id,
  };
}

type FactRaw = FacturaReg & { orden_compra_id: string | null; obra_estimacion_id: string | null };

function mapFactura(f: {
  id: string;
  uuid_sat: string | null;
  estado_cxp: string | null;
  total: number | null;
  saldo: number | null;
  cancelada_at: string | null;
  orden_compra_id: string | null;
  obra_estimacion_id: string | null;
}): FactRaw {
  return {
    id: f.id,
    uuid_sat: f.uuid_sat,
    estado_cxp: f.estado_cxp,
    total: Number(f.total ?? 0),
    saldo: Number(f.saldo ?? 0),
    cancelada_at: f.cancelada_at,
    orden_compra_id: f.orden_compra_id,
    obra_estimacion_id: f.obra_estimacion_id,
  };
}

const uniq = (xs: (string | null | undefined)[]): string[] => [
  ...new Set(xs.filter((x): x is string => Boolean(x))),
];

/**
 * Resuelve los registros del hilo para un documento. Secuencias explícitas por
 * tipo (3-4 rondas de queries paralelas). Los errores de Supabase se propagan
 * como Error con mensaje legible; el caller decide cómo degradar.
 */
export async function fetchHiloRegistros(sb: Sb, doc: HiloDoc): Promise<HiloRegistros> {
  const erp = () => sb.schema('erp');
  const dilesa = () => sb.schema('dilesa');
  const out = emptyRegistros();

  const fail = (e: { message?: string } | null): never => {
    throw new Error(e?.message ?? 'No se pudo cargar el hilo del gasto.');
  };

  async function fetchReqs(ids: string[]) {
    if (!ids.length) return;
    const r = await erp().from('requisiciones').select(REQ_COLS).in('id', ids);
    if (r.error) fail(r.error);
    out.requisiciones = (r.data ?? []) as ReqReg[];
  }
  async function fetchCots(ids: string[]) {
    if (!ids.length) return;
    const r = await erp().from('cotizaciones').select(COT_COLS).in('id', ids);
    if (r.error) fail(r.error);
    out.cotizaciones = (r.data ?? []) as CotReg[];
  }
  async function fetchOcsBy(col: 'id' | 'requisicion_id' | 'cotizacion_id', ids: string[]) {
    if (!ids.length) return [] as ReturnType<typeof mapOc>[];
    const r = await erp()
      .from('ordenes_compra')
      .select(OC_COLS)
      .in(col, ids)
      .is('deleted_at', null);
    if (r.error) fail(r.error);
    return ((r.data ?? []) as OcRaw[]).map(mapOc);
  }
  async function fetchContratosBy(col: 'id' | 'cotizacion_id', ids: string[]) {
    if (!ids.length) return [] as ContratoReg[];
    const r = await dilesa()
      .from('contratos_construccion')
      .select(CONTRATO_COLS)
      .in(col, ids)
      .is('deleted_at', null);
    if (r.error) fail(r.error);
    return (r.data ?? []) as (ContratoReg & { cotizacion_id: string | null })[];
  }
  async function fetchEstimsBy(col: 'id' | 'contrato_id', ids: string[]) {
    if (!ids.length) return [] as (EstimReg & { contrato_id: string })[];
    const r = await dilesa()
      .from('obra_estimaciones')
      .select(ESTIM_COLS)
      .in(col, ids)
      .is('deleted_at', null);
    if (r.error) fail(r.error);
    return (r.data ?? []) as (EstimReg & { contrato_id: string })[];
  }
  async function fetchFacturasBy(
    col: 'id' | 'orden_compra_id' | 'obra_estimacion_id',
    ids: string[]
  ) {
    if (!ids.length) return [] as FactRaw[];
    const r = await erp().from('facturas').select(FACT_COLS).in(col, ids);
    if (r.error) fail(r.error);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((r.data ?? []) as any[]).map(mapFactura);
  }
  async function fetchPagosDeFacturas(facturaIds: string[]) {
    if (!facturaIds.length) return;
    const apps = await erp()
      .from('cxp_pago_aplicaciones')
      .select('pago_id, factura_id')
      .in('factura_id', facturaIds);
    if (apps.error) fail(apps.error);
    const pagoIds = uniq(((apps.data ?? []) as { pago_id: string }[]).map((a) => a.pago_id));
    if (!pagoIds.length) return;
    const pagos = await erp().from('cxp_pagos').select(PAGO_COLS).in('id', pagoIds);
    if (pagos.error) fail(pagos.error);
    out.pagos = (pagos.data ?? []) as PagoReg[];
  }
  /** Última milla común: facturas conocidas → pagos. */
  async function closeFromFacturas(facturas: FactRaw[]) {
    out.facturas = facturas;
    await fetchPagosDeFacturas(facturas.map((f) => f.id));
  }

  if (doc.tipo === 'oc') {
    const ocs = await fetchOcsBy('id', [doc.id]);
    out.ocs = ocs;
    const oc = ocs[0];
    const [facturas] = await Promise.all([
      fetchFacturasBy('orden_compra_id', [doc.id]),
      fetchReqs(uniq([oc?.requisicion_id])),
      fetchCots(uniq([oc?.cotizacion_id])),
    ]);
    await closeFromFacturas(facturas);
    return out;
  }

  if (doc.tipo === 'requisicion') {
    const [cots, ocs] = await Promise.all([
      (async () => {
        const r = await erp()
          .from('cotizaciones')
          .select(COT_COLS)
          .eq('requisicion_id', doc.id)
          .is('deleted_at', null);
        if (r.error) fail(r.error);
        return (r.data ?? []) as CotReg[];
      })(),
      fetchOcsBy('requisicion_id', [doc.id]),
      fetchReqs([doc.id]),
    ]);
    out.cotizaciones = cots;
    out.ocs = ocs;
    const [contratos, facturas] = await Promise.all([
      fetchContratosBy(
        'cotizacion_id',
        cots.map((c) => c.id)
      ),
      fetchFacturasBy(
        'orden_compra_id',
        ocs.map((o) => o.id)
      ),
    ]);
    out.contratos = contratos;
    await closeFromFacturas(facturas);
    return out;
  }

  if (doc.tipo === 'cotizacion') {
    const [, ocs, contratos] = await Promise.all([
      fetchCots([doc.id]),
      fetchOcsBy('cotizacion_id', [doc.id]),
      fetchContratosBy('cotizacion_id', [doc.id]),
    ]);
    out.ocs = ocs;
    out.contratos = contratos;
    await fetchReqs(
      uniq([(out.cotizaciones[0] as CotReg & { requisicion_id?: string | null })?.requisicion_id])
    );
    const estims = await fetchEstimsBy(
      'contrato_id',
      contratos.map((c) => c.id)
    );
    out.estimaciones = estims;
    const [factOc, factEstim] = await Promise.all([
      fetchFacturasBy(
        'orden_compra_id',
        ocs.map((o) => o.id)
      ),
      fetchFacturasBy(
        'obra_estimacion_id',
        estims.map((e) => e.id)
      ),
    ]);
    await closeFromFacturas([...factOc, ...factEstim]);
    return out;
  }

  if (doc.tipo === 'factura') {
    const facturas = await fetchFacturasBy('id', [doc.id]);
    const f = facturas[0];
    const [ocs, estims] = await Promise.all([
      fetchOcsBy('id', uniq([f?.orden_compra_id])),
      fetchEstimsBy('id', uniq([f?.obra_estimacion_id])),
      fetchPagosDeFacturas(f ? [f.id] : []),
    ]);
    out.facturas = facturas;
    out.ocs = ocs;
    out.estimaciones = estims;
    const oc = ocs[0];
    await Promise.all([
      fetchReqs(uniq([oc?.requisicion_id])),
      fetchCots(uniq([oc?.cotizacion_id])),
      (async () => {
        const contratos = await fetchContratosBy('id', uniq(estims.map((e) => e.contrato_id)));
        out.contratos = contratos;
      })(),
    ]);
    return out;
  }

  // doc.tipo === 'pago'
  const apps = await erp().from('cxp_pago_aplicaciones').select('factura_id').eq('pago_id', doc.id);
  if (apps.error) fail(apps.error);
  const facturaIds = uniq(((apps.data ?? []) as { factura_id: string }[]).map((a) => a.factura_id));
  const pagoRes = await erp().from('cxp_pagos').select(PAGO_COLS).eq('id', doc.id);
  if (pagoRes.error) fail(pagoRes.error);
  out.pagos = (pagoRes.data ?? []) as PagoReg[];
  const facturas = await fetchFacturasBy('id', facturaIds);
  out.facturas = facturas;
  const ocs = await fetchOcsBy('id', uniq(facturas.map((f) => f.orden_compra_id)));
  out.ocs = ocs;
  await Promise.all([
    fetchReqs(uniq(ocs.map((o) => o.requisicion_id))),
    fetchCots(uniq(ocs.map((o) => o.cotizacion_id))),
  ]);
  return out;
}

/**
 * Hilo del gasto POR PARTIDA (fase 2 — convergencia checklist ↔ ciclo real).
 *
 * Entrada para superficies que no son un documento del ciclo (la tarea del
 * checklist mira el ciclo a través de su partida: `tarea_origen_id` →
 * partida → todo lo anclado a ella). Junta RFQs (vía `cotizacion_lineas`),
 * OCs (vía `ordenes_compra_detalle`), contratos, facturas (directas + de OC +
 * de estimación) y sus pagos. Render con `buildHiloPasos(registros, null)`.
 */
export async function fetchHiloRegistrosPorPartida(
  sb: Sb,
  partidaId: string
): Promise<HiloRegistros> {
  const erp = () => sb.schema('erp');
  const dilesa = () => sb.schema('dilesa');
  const out = emptyRegistros();
  const fail = (e: { message?: string } | null): never => {
    throw new Error(e?.message ?? 'No se pudo cargar el hilo del gasto.');
  };

  // Ronda 1: todo lo anclado directo a la partida.
  const [detRes, cotLinRes, contratosRes, factDirRes] = await Promise.all([
    erp().from('ordenes_compra_detalle').select('orden_compra_id').eq('partida_id', partidaId),
    erp().from('cotizacion_lineas').select('cotizacion_id').eq('partida_id', partidaId),
    dilesa()
      .from('contratos_construccion')
      .select(CONTRATO_COLS)
      .eq('partida_id', partidaId)
      .is('deleted_at', null),
    erp().from('facturas').select(FACT_COLS).eq('partida_id', partidaId),
  ]);
  if (detRes.error) fail(detRes.error);
  if (cotLinRes.error) fail(cotLinRes.error);
  if (contratosRes.error) fail(contratosRes.error);
  if (factDirRes.error) fail(factDirRes.error);

  const ocIds = uniq(
    ((detRes.data ?? []) as { orden_compra_id: string }[]).map((d) => d.orden_compra_id)
  );
  const cotIds = uniq(
    ((cotLinRes.data ?? []) as { cotizacion_id: string }[]).map((c) => c.cotizacion_id)
  );
  out.contratos = (contratosRes.data ?? []) as ContratoReg[];

  // Ronda 2: documentos por id + estimaciones de los contratos.
  const [ocsRes, cotsRes, estimsRes] = await Promise.all([
    ocIds.length
      ? erp().from('ordenes_compra').select(OC_COLS).in('id', ocIds).is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
    cotIds.length
      ? erp().from('cotizaciones').select(COT_COLS).in('id', cotIds)
      : Promise.resolve({ data: [], error: null }),
    out.contratos.length
      ? dilesa()
          .from('obra_estimaciones')
          .select(ESTIM_COLS)
          .in(
            'contrato_id',
            out.contratos.map((c) => c.id)
          )
          .is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (ocsRes.error) fail(ocsRes.error);
  if (cotsRes.error) fail(cotsRes.error);
  if (estimsRes.error) fail(estimsRes.error);
  out.ocs = ((ocsRes.data ?? []) as OcRaw[]).map(mapOc);
  out.cotizaciones = (cotsRes.data ?? []) as CotReg[];
  out.estimaciones = (estimsRes.data ?? []) as EstimReg[];

  // Ronda 3: facturas de OCs/estimaciones + merge con las directas (dedup).
  const [factOcRes, factEstimRes] = await Promise.all([
    out.ocs.length
      ? erp()
          .from('facturas')
          .select(FACT_COLS)
          .in(
            'orden_compra_id',
            out.ocs.map((o) => o.id)
          )
      : Promise.resolve({ data: [], error: null }),
    out.estimaciones.length
      ? erp()
          .from('facturas')
          .select(FACT_COLS)
          .in(
            'obra_estimacion_id',
            out.estimaciones.map((e) => e.id)
          )
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (factOcRes.error) fail(factOcRes.error);
  if (factEstimRes.error) fail(factEstimRes.error);
  const facturasMap = new Map<string, FacturaReg>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const raw of [factDirRes.data, factOcRes.data, factEstimRes.data] as any[][]) {
    for (const f of raw ?? []) facturasMap.set(f.id as string, mapFactura(f));
  }
  out.facturas = [...facturasMap.values()];

  // Ronda 4: pagos de todas las facturas.
  if (out.facturas.length) {
    const apps2 = await erp()
      .from('cxp_pago_aplicaciones')
      .select('pago_id')
      .in(
        'factura_id',
        out.facturas.map((f) => f.id)
      );
    if (apps2.error) fail(apps2.error);
    const pagoIds = uniq(((apps2.data ?? []) as { pago_id: string }[]).map((a) => a.pago_id));
    if (pagoIds.length) {
      const pagosRes = await erp().from('cxp_pagos').select(PAGO_COLS).in('id', pagoIds);
      if (pagosRes.error) fail(pagosRes.error);
      out.pagos = (pagosRes.data ?? []) as PagoReg[];
    }
  }
  return out;
}

/** ¿El hilo tiene actividad real más allá de pendientes? (algún doc existente). */
export function hiloTieneActividad(h: HiloGasto): boolean {
  return h.pasos.some((p) => p.refs.length > 0 || p.estado === 'parcial' || p.estado === 'hecho');
}
