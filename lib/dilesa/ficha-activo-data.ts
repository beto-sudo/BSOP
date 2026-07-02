/**
 * Loader server-side de la ficha comercial de un activo del portafolio
 * (iniciativa `dilesa-portafolio-predios` · S7). Lee con la sesión del
 * usuario (RLS). Solo lo importan route handlers / server actions.
 *
 * IMPORTANTE: la ficha es material para PROSPECTOS externos — solo datos
 * objetivos del inmueble. Las notas internas, la bitácora y los datos del
 * embudo de compra NUNCA entran aquí.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdjuntoSignedUrl } from '@/lib/adjuntos';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

export type FichaActivo = {
  id: string;
  nombre: string;
  tipo: string;
  zona: string | null;
  municipio: string | null;
  estadoGeo: string | null;
  direccion: string | null;
  areaM2: number | null;
  claveCatastral: string | null;
  situacionLegal: string | null;
  valorEstimado: number | null;
  destinoLabel: string | null;
  cuentaVenta: boolean;
  cuentaRenta: boolean;
  /** Pares label→valor del satélite, ya filtrados para consumo externo. */
  detalle: { label: string; value: string }[];
  /** Signed URLs (1h) de hasta 2 fotos del expediente. */
  fotos: string[];
  latitud: number | null;
  longitud: number | null;
};

/** Campos del satélite que SÍ pueden salir en material comercial, por tipo. */
const SAT_COMERCIAL: Record<string, Record<string, string>> = {
  casa: {
    recamaras: 'Recámaras',
    banos: 'Baños',
    m2_construccion: 'm² de construcción',
    m2_terreno: 'm² de terreno',
    niveles: 'Niveles',
    cochera_autos: 'Cochera (autos)',
    calle: 'Calle',
    numero_oficial: 'Número',
    es_esquina: 'Esquina',
    tiene_frente_verde: 'Frente a área verde',
  },
  lote: {
    manzana: 'Manzana',
    numero_lote: 'Lote',
    frente_m: 'Frente (m)',
    fondo_m: 'Fondo (m)',
    calle: 'Calle',
    es_esquina: 'Esquina',
    tiene_frente_verde: 'Frente a área verde',
  },
  terreno: {
    uso_suelo: 'Uso de suelo',
    zonificacion: 'Zonificación',
    factibilidad_agua: 'Factibilidad de agua',
    factibilidad_drenaje: 'Factibilidad de drenaje',
    factibilidad_electricidad: 'Factibilidad de electricidad',
    factibilidad_vialidad: 'Factibilidad de vialidad',
  },
  local: {
    m2_rentable: 'm² rentables',
    frente_m: 'Frente (m)',
    planta: 'Planta',
    giro_permitido: 'Giro permitido',
    banos: 'Baños',
  },
  espectacular: {
    caras: 'Caras',
    ancho_m: 'Ancho (m)',
    alto_m: 'Alto (m)',
    iluminado: 'Iluminado',
    vialidad: 'Vialidad',
    trafico_estimado_diario: 'Tráfico estimado diario',
    renta_mensual: 'Renta mensual',
  },
};

function fmt(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  return String(v);
}

export async function cargarFichaActivo(
  sb: SupabaseClient,
  activoId: string
): Promise<{ ficha: FichaActivo } | { error: string; status: number }> {
  const { data: a, error } = await sb
    .schema('dilesa')
    .from('activos')
    .select(
      'id, nombre, tipo, zona, municipio, estado_geo, direccion_referencia, area_m2, clave_catastral, situacion_legal, valor_estimado, latitud, longitud, destino:portafolio_destinos(label, cuenta_venta, cuenta_renta)'
    )
    .eq('id', activoId)
    .eq('empresa_id', DILESA_EMPRESA_ID)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) return { error: error.message, status: 500 };
  if (!a) return { error: 'Activo no encontrado', status: 404 };

  const destino = a.destino as unknown as {
    label: string;
    cuenta_venta: boolean;
    cuenta_renta: boolean;
  } | null;

  // Satélite (solo campos comerciales del tipo).
  const detalle: { label: string; value: string }[] = [];
  const labels = SAT_COMERCIAL[a.tipo];
  if (labels) {
    const { data: sat } = await sb
      .schema('dilesa')
      .from(`activo_${a.tipo}` as 'activo_casa')
      .select('*')
      .eq('activo_id', activoId)
      .maybeSingle();
    if (sat) {
      for (const [key, label] of Object.entries(labels)) {
        const v = fmt((sat as Record<string, unknown>)[key]);
        if (v != null) detalle.push({ label, value: v });
      }
    }
  }

  // Fotos: hasta 2 adjuntos rol foto (signed URL 1h; react-pdf las fetchea).
  const { data: adj } = await sb
    .schema('erp')
    .from('adjuntos')
    .select('url')
    .eq('entidad_tipo', 'activo')
    .eq('entidad_id', activoId)
    .eq('rol', 'foto')
    .is('sustituido_at', null)
    .order('created_at', { ascending: false })
    .limit(2);
  const fotos: string[] = [];
  for (const row of adj ?? []) {
    const signed = await getAdjuntoSignedUrl(sb, row.url as string);
    if (signed) fotos.push(signed);
  }

  return {
    ficha: {
      id: a.id,
      nombre: a.nombre,
      tipo: a.tipo,
      zona: a.zona,
      municipio: a.municipio,
      estadoGeo: a.estado_geo,
      direccion: a.direccion_referencia,
      areaM2: a.area_m2,
      claveCatastral: a.clave_catastral,
      situacionLegal: a.situacion_legal,
      valorEstimado: a.valor_estimado,
      destinoLabel: destino?.label ?? null,
      cuentaVenta: destino?.cuenta_venta ?? false,
      cuentaRenta: destino?.cuenta_renta ?? false,
      detalle,
      fotos,
      latitud: a.latitud,
      longitud: a.longitud,
    },
  };
}
