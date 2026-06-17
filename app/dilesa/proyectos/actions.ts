'use server';

/**
 * Server actions de Proyectos DILESA.
 *
 * Iniciativa `dilesa-proyectos-paridad-coda`. Sprint A: 4 campos
 * (plano/imagen/acreditación/objetivo). Sprint C: + 6 campos de
 * paridad con Coda (clasificación inmobiliaria + 3 áreas + precio m²
 * excedente + costo MO). RLS valida acceso a la empresa.
 *
 * `setUnidadMuestra` controla el flag de casa demo en `dilesa.unidades`.
 *
 * Iniciativa `dilesa-portafolio-activos`: `liberarUnidadAlPortafolio` /
 * `regresarUnidadAlProyecto` mueven una unidad entre el inventario del
 * fraccionamiento y el portafolio de activos (RPCs atómicas en `dilesa`).
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { isActivoTipo } from '@/lib/dilesa/portafolio';
import { getEffectiveUser } from '@/lib/auth/effective-user';
import type { Database } from '@/types/supabase';

type ProyectoFieldsPatch = {
  plano_oficial_url?: string | null;
  image_url?: string | null;
  acreditacion_escritura?: string | null;
  objetivo_trimestral?: number | null;
  clasificacion_inmobiliaria?: string | null;
  area_comercial_m2?: number | null;
  area_residencial_m2?: number | null;
  area_vialidades_m2?: number | null;
  precio_m2_excedente?: number | null;
  costo_mo?: number | null;
};

type Result = { ok: true } | { ok: false; error: string };

function validatePositive(n: number | null | undefined, label: string): string | null {
  if (n == null) return null;
  if (!Number.isFinite(n) || n < 0) return `${label} debe ser número ≥ 0`;
  return null;
}

/** Cliente Supabase con la sesión del usuario (RLS aplica). */
async function getActionClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
}

/**
 * Gate de movimiento al portafolio: SOLO administradores globales pueden
 * liberar/regresar unidades. Refleja el usuario impersonado en preview
 * (que es read-only), así que un admin "viendo como" no-admin no puede mover.
 */
async function esAdmin(supabase: Awaited<ReturnType<typeof getActionClient>>): Promise<boolean> {
  const eu = await getEffectiveUser(supabase);
  return eu?.isAdmin === true;
}

export async function updateProyectoFields(
  proyectoId: string,
  patch: ProyectoFieldsPatch
): Promise<Result> {
  if (!proyectoId) return { ok: false, error: 'proyectoId requerido' };

  // Whitelist explícita — no permitir update de columnas no esperadas.
  const allowed: ProyectoFieldsPatch = {};
  if ('plano_oficial_url' in patch) allowed.plano_oficial_url = patch.plano_oficial_url;
  if ('image_url' in patch) allowed.image_url = patch.image_url;
  if ('acreditacion_escritura' in patch)
    allowed.acreditacion_escritura = patch.acreditacion_escritura;
  if ('objetivo_trimestral' in patch) {
    const n = patch.objetivo_trimestral;
    if (n != null && (!Number.isInteger(n) || n < 0)) {
      return { ok: false, error: 'objetivo_trimestral debe ser entero ≥ 0' };
    }
    allowed.objetivo_trimestral = n;
  }
  if ('clasificacion_inmobiliaria' in patch)
    allowed.clasificacion_inmobiliaria = patch.clasificacion_inmobiliaria;
  for (const [key, label] of [
    ['area_comercial_m2', 'Área comercial'],
    ['area_residencial_m2', 'Área residencial'],
    ['area_vialidades_m2', 'Área vialidades'],
    ['precio_m2_excedente', 'Precio m² excedente'],
    ['costo_mo', 'Costo MO'],
  ] as const) {
    if (key in patch) {
      const n = patch[key];
      const err = validatePositive(n, label);
      if (err) return { ok: false, error: err };
      allowed[key] = n;
    }
  }
  if (Object.keys(allowed).length === 0) {
    return { ok: false, error: 'sin campos a actualizar' };
  }

  const supabase = await getActionClient();

  const { error } = await supabase
    .schema('dilesa')
    .from('proyectos')
    .update(allowed)
    .eq('id', proyectoId);

  if (error) {
    return { ok: false, error: error.message || 'No se pudo actualizar el proyecto.' };
  }

  revalidatePath('/dilesa/proyectos');
  return { ok: true };
}

/**
 * Marca o desmarca una unidad como casa muestra/demo. Las muestra no
 * están disponibles para venta hasta desmarcarlas. La captura del
 * valor de accesorios al liberar queda pendiente para un Sprint
 * posterior (workflow UI).
 */
export async function setUnidadMuestra(unidadId: string, esMuestra: boolean): Promise<Result> {
  if (!unidadId) return { ok: false, error: 'unidadId requerido' };

  const supabase = await getActionClient();

  const { error } = await supabase
    .schema('dilesa')
    .from('unidades')
    .update({ es_muestra: esMuestra })
    .eq('id', unidadId);

  if (error) {
    return { ok: false, error: error.message || 'No se pudo actualizar la unidad.' };
  }

  revalidatePath('/dilesa/proyectos');
  return { ok: true };
}

type LiberarUnidadInput = {
  tipo: string;
  /** Id de un destino del catálogo `dilesa.portafolio_destinos`. */
  destinoId: string;
  valorEstimado?: number | null;
};

/**
 * Traspasa una unidad del inventario del fraccionamiento al portafolio de
 * activos: crea el activo + su satélite y liga `unidades.activo_id`. La unidad
 * sale del canal de ventas del proyecto (queda excluida del avance de vivienda
 * y del inventario disponible). Atómico vía RPC `fn_liberar_unidad_portafolio`.
 * El destino (Demo/Show House, Arrendamiento, …) viene del catálogo; el RPC
 * valida que exista y esté activo para la empresa de la unidad.
 */
export async function liberarUnidadAlPortafolio(
  unidadId: string,
  input: LiberarUnidadInput
): Promise<Result> {
  if (!unidadId) return { ok: false, error: 'unidadId requerido' };
  if (!isActivoTipo(input.tipo)) return { ok: false, error: 'Tipo de activo no válido' };
  if (!input.destinoId) return { ok: false, error: 'Destino requerido' };
  const valor = input.valorEstimado;
  if (valor != null && (!Number.isFinite(valor) || valor < 0)) {
    return { ok: false, error: 'El valor estimado debe ser un número ≥ 0' };
  }

  const supabase = await getActionClient();
  if (!(await esAdmin(supabase))) {
    return { ok: false, error: 'Solo un administrador puede liberar unidades al portafolio.' };
  }

  const { error } = await supabase.schema('dilesa').rpc('fn_liberar_unidad_portafolio', {
    p_unidad_id: unidadId,
    p_tipo: input.tipo,
    p_destino_id: input.destinoId,
    p_valor: valor ?? undefined,
  });

  if (error) {
    return { ok: false, error: error.message || 'No se pudo liberar la unidad al portafolio.' };
  }

  revalidatePath('/dilesa/proyectos');
  return { ok: true };
}

/**
 * Regresa una unidad del portafolio a su proyecto origen: desliga el activo
 * (lo soft-borra, queda en historia) y limpia `activo_id`, devolviendo la
 * unidad al inventario disponible para ventas. Atómico vía RPC
 * `fn_regresar_unidad_proyecto`.
 */
export async function regresarUnidadAlProyecto(unidadId: string): Promise<Result> {
  if (!unidadId) return { ok: false, error: 'unidadId requerido' };

  const supabase = await getActionClient();
  if (!(await esAdmin(supabase))) {
    return { ok: false, error: 'Solo un administrador puede regresar unidades del portafolio.' };
  }

  const { error } = await supabase.schema('dilesa').rpc('fn_regresar_unidad_proyecto', {
    p_unidad_id: unidadId,
  });

  if (error) {
    return { ok: false, error: error.message || 'No se pudo regresar la unidad al proyecto.' };
  }

  revalidatePath('/dilesa/proyectos');
  return { ok: true };
}
