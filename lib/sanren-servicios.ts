import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';

/**
 * Data layer del módulo SANREN → Servicios (iniciativa sanren-servicios).
 * Lee `sanren.*` con el cliente service-role (RLS deny-all, igual que
 * lib/peptides.ts): el único acceso es server-side. El schema `sanren` ya está
 * en los tipos generados, pero las vistas se castean puntualmente para evitar
 * fricción de tipos (mismo enfoque que peptides).
 */

export type PropiedadSanren = {
  id: string;
  nombre: string;
  tipo: string | null;
  direccion: string | null;
  activo: boolean;
  notas: string | null;
};

export type ServicioSanren = {
  id: string;
  propiedad_id: string;
  tipo: string;
  proveedor: string | null;
  numero_cuenta: string | null;
  numero_medidor: string | null;
  unidad_consumo: string | null;
  tiene_produccion: boolean;
  domiciliado: boolean;
  activo: boolean;
  notas: string | null;
};

/** Una fila de `sanren.v_recibos` enriquecida con los paths de sus adjuntos. */
export type ReciboVista = {
  id: string;
  servicio_id: string;
  periodo: string;
  fecha_recibo: string;
  monto: number | null;
  moneda: string;
  folio: string | null;
  lectura_consumo: number | null;
  lectura_produccion: number | null;
  pagado: boolean;
  fecha_pago: string | null;
  metodo_pago: string | null;
  notas: string | null;
  coda_row_id: string | null;
  // derivados de la vista
  servicio_tipo: string;
  proveedor: string | null;
  unidad_consumo: string | null;
  tiene_produccion: boolean;
  propiedad_nombre: string;
  consumo_periodo: number | null;
  produccion_periodo: number | null;
  costo_unitario: number | null;
  saldo_neto: number | null;
  delta_monto_mom: number | null;
  // adjuntos (proxy paths para abrir; null si no hay)
  recibo_adjunto_path: string | null;
  comprobante_adjunto_path: string | null;
};

export type ServiciosData = {
  empresaId: string | null;
  propiedades: PropiedadSanren[];
  servicios: ServicioSanren[];
  recibos: ReciboVista[];
  errors: string[];
};

const toNum = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function getServiciosData(): Promise<ServiciosData> {
  const empty: ServiciosData = {
    empresaId: null,
    propiedades: [],
    servicios: [],
    recibos: [],
    errors: [],
  };
  const admin = getSupabaseAdminClient();
  if (!admin) {
    return { ...empty, errors: ['Supabase service role key is not configured.'] };
  }

  const { data: empRow } = await admin
    .schema('core')
    .from('empresas')
    .select('id')
    .eq('slug', 'sanren')
    .maybeSingle();
  const empresaId = (empRow?.id as string | undefined) ?? null;

  // Cast puntual del schema personal (igual que lib/peptides.ts).
  const sr = admin.schema('sanren' as never) as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        order: (
          col: string,
          opts?: { ascending?: boolean; nullsFirst?: boolean }
        ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      };
    };
  };

  const [propsRes, svcRes, recRes] = await Promise.all([
    sr.from('propiedades').select('*').order('nombre', { ascending: true }),
    sr.from('servicios').select('*').order('tipo', { ascending: true }),
    sr.from('v_recibos').select('*').order('fecha_recibo', { ascending: false }),
  ]);

  const errors: string[] = [];
  const grab = <T>(
    res: { data: unknown[] | null; error: { message: string } | null },
    label: string
  ): T[] => {
    if (res.error) {
      errors.push(getSupabaseErrorMessage(res.error, `No se pudo cargar ${label}.`));
      return [];
    }
    return (res.data ?? []) as T[];
  };

  const propiedades = grab<PropiedadSanren>(propsRes, 'las propiedades');
  const servicios = grab<ServicioSanren>(svcRes, 'los servicios');
  const recibosRaw = grab<Record<string, unknown>>(recRes, 'los recibos');

  // Adjuntos: erp.adjuntos (entidad_tipo='recibo') por entidad_id + rol → path.
  const reciboIds = recibosRaw.map((r) => String(r.id));
  const adjByRecibo = new Map<string, { recibo?: string; comprobante?: string }>();
  if (reciboIds.length > 0) {
    const { data: adjRows, error: adjErr } = await admin
      .schema('erp')
      .from('adjuntos')
      .select('entidad_id, rol, url')
      .eq('entidad_tipo', 'recibo')
      .in('entidad_id', reciboIds);
    if (adjErr) {
      errors.push(getSupabaseErrorMessage(adjErr, 'No se pudieron cargar los adjuntos.'));
    } else {
      for (const a of (adjRows ?? []) as { entidad_id: string; rol: string; url: string }[]) {
        const entry = adjByRecibo.get(a.entidad_id) ?? {};
        if (a.rol === 'recibo') entry.recibo = a.url;
        else if (a.rol === 'comprobante') entry.comprobante = a.url;
        adjByRecibo.set(a.entidad_id, entry);
      }
    }
  }

  const recibos: ReciboVista[] = recibosRaw.map((r) => {
    const adj = adjByRecibo.get(String(r.id)) ?? {};
    return {
      id: String(r.id),
      servicio_id: String(r.servicio_id),
      periodo: String(r.periodo),
      fecha_recibo: String(r.fecha_recibo),
      monto: toNum(r.monto),
      moneda: (r.moneda as string) ?? 'MXN',
      folio: (r.folio as string) ?? null,
      lectura_consumo: toNum(r.lectura_consumo),
      lectura_produccion: toNum(r.lectura_produccion),
      pagado: Boolean(r.pagado),
      fecha_pago: (r.fecha_pago as string) ?? null,
      metodo_pago: (r.metodo_pago as string) ?? null,
      notas: (r.notas as string) ?? null,
      coda_row_id: (r.coda_row_id as string) ?? null,
      servicio_tipo: String(r.servicio_tipo),
      proveedor: (r.proveedor as string) ?? null,
      unidad_consumo: (r.unidad_consumo as string) ?? null,
      tiene_produccion: Boolean(r.tiene_produccion),
      propiedad_nombre: String(r.propiedad_nombre ?? ''),
      consumo_periodo: toNum(r.consumo_periodo),
      produccion_periodo: toNum(r.produccion_periodo),
      costo_unitario: toNum(r.costo_unitario),
      saldo_neto: toNum(r.saldo_neto),
      delta_monto_mom: toNum(r.delta_monto_mom),
      recibo_adjunto_path: adj.recibo ? `/api/adjuntos/${adj.recibo}` : null,
      comprobante_adjunto_path: adj.comprobante ? `/api/adjuntos/${adj.comprobante}` : null,
    };
  });

  return { empresaId, propiedades, servicios, recibos, errors };
}
