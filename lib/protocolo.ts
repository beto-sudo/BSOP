import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { parseComponentes, type BlendComponente } from '@/lib/blend';

// Bitácora de protocolo (péptidos + suplementos) — iniciativa salud-protocolo.
// Lee health.protocolo_* con el cliente service-role (igual que lib/health.ts);
// las tablas tienen RLS deny-all, así que el único acceso es server-side.

export type ProtocoloClase = 'peptido' | 'suplemento' | 'oral' | 'otro';
export type ProtocoloEstado = 'activo' | 'pausado' | 'suspendido' | 'completado';

export type ProtocoloCompuesto = {
  id: string;
  nombre: string;
  clase: ProtocoloClase;
  via: string | null;
  unidad_dosis: string | null;
  dosis_objetivo: number | null;
  frecuencia: string | null;
  procedencia: string | null;
  estado: ProtocoloEstado;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  notas: string | null;
  // Blend multi-péptido (caso KLOW). NULL = compuesto simple.
  componentes: BlendComponente[] | null;
};

export type ProtocoloToma = {
  id: string;
  compuesto_id: string;
  fecha: string;
  dosis: number;
  unidad: string | null;
  sitio: string | null;
  nota: string | null;
  vial_mg: number | null;
  bac_ml: number | null;
  concentracion: number | null;
  unidades: number | null;
};

export type ProtocoloCompuestoConTomas = ProtocoloCompuesto & {
  tomas: ProtocoloToma[]; // orden descendente (más reciente primero)
  totalTomas: number;
  ultimaToma: string | null;
};

export type ProtocoloData = {
  compuestos: ProtocoloCompuestoConTomas[];
  errors: string[];
};

// Activos arriba, luego por antigüedad. El resto de estados al fondo.
const ESTADO_ORDEN: Record<ProtocoloEstado, number> = {
  activo: 0,
  pausado: 1,
  suspendido: 2,
  completado: 3,
};

export async function getProtocoloData(): Promise<ProtocoloData> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return { compuestos: [], errors: ['Supabase service role key is not configured.'] };
  }

  const [compuestosRes, tomasRes] = await Promise.all([
    supabase
      .schema('health')
      .from('protocolo_compuestos')
      .select(
        'id, nombre, clase, via, unidad_dosis, dosis_objetivo, frecuencia, procedencia, estado, fecha_inicio, fecha_fin, notas, componentes'
      )
      .returns<ProtocoloCompuesto[]>(),
    supabase
      .schema('health')
      .from('protocolo_tomas')
      .select(
        'id, compuesto_id, fecha, dosis, unidad, sitio, nota, vial_mg, bac_ml, concentracion, unidades'
      )
      .order('fecha', { ascending: false })
      .returns<ProtocoloToma[]>(),
  ]);

  const errors: string[] = [];
  if (compuestosRes.error) {
    errors.push(
      getSupabaseErrorMessage(compuestosRes.error, 'No se pudieron cargar los compuestos.')
    );
  }
  if (tomasRes.error) {
    errors.push(getSupabaseErrorMessage(tomasRes.error, 'No se pudieron cargar las tomas.'));
  }

  const tomasPorCompuesto = new Map<string, ProtocoloToma[]>();
  for (const toma of tomasRes.data ?? []) {
    const list = tomasPorCompuesto.get(toma.compuesto_id) ?? [];
    list.push(toma);
    tomasPorCompuesto.set(toma.compuesto_id, list);
  }

  const compuestos: ProtocoloCompuestoConTomas[] = (compuestosRes.data ?? [])
    .map((compuesto) => {
      const tomas = tomasPorCompuesto.get(compuesto.id) ?? [];
      return {
        ...compuesto,
        // El jsonb llega como JS crudo; normalizamos a BlendComponente[] | null.
        componentes: parseComponentes(compuesto.componentes),
        tomas,
        totalTomas: tomas.length,
        ultimaToma: tomas[0]?.fecha ?? null,
      };
    })
    .sort((a, b) => {
      const estado = ESTADO_ORDEN[a.estado] - ESTADO_ORDEN[b.estado];
      if (estado !== 0) return estado;
      return (a.fecha_inicio ?? '').localeCompare(b.fecha_inicio ?? '');
    });

  return { compuestos, errors };
}
