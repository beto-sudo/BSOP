'use server';

/**
 * Server actions del módulo Portafolio (DILESA).
 *
 * - Catálogo de destinos (`dilesa-portafolio-destinos` · Sprint 2): CRUD de
 *   `dilesa.portafolio_destinos`.
 * - Alta/edición de activos (`dilesa-portafolio-expediente` · Sprint 1): crea o
 *   actualiza `dilesa.activos` + su satélite vía RPC atómica.
 *
 * El gate (admin global o Dirección DILESA) se aplica aquí; la UI solo muestra
 * los controles a esos roles.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { getEffectiveUser } from '@/lib/auth/effective-user';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { slugifyDestino } from '@/lib/dilesa/portafolio';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import type { Database } from '@/types/supabase';

type Result = { ok: true } | { ok: false; error: string };

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

/** Gate: admin global o rol Dirección en DILESA. */
async function puedeAdministrar(
  supabase: Awaited<ReturnType<typeof getActionClient>>
): Promise<boolean> {
  const eu = await getEffectiveUser(supabase);
  if (!eu) return false;
  return eu.isAdmin === true || (eu.direccionEmpresaIds ?? []).includes(DILESA_EMPRESA_ID);
}

function validarComun(input: { label: string; orden: number }): string | null {
  if (!input.label.trim()) return 'El nombre del destino es obligatorio.';
  if (!Number.isFinite(input.orden) || input.orden < 0) return 'El orden debe ser un número ≥ 0.';
  return null;
}

export async function crearDestino(input: {
  label: string;
  cuentaRenta: boolean;
  cuentaVenta: boolean;
  orden: number;
}): Promise<Result> {
  const err = validarComun(input);
  if (err) return { ok: false, error: err };
  const slug = slugifyDestino(input.label);
  if (!slug) return { ok: false, error: 'El nombre no produce un identificador válido.' };

  const supabase = await getActionClient();
  if (!(await puedeAdministrar(supabase))) {
    return { ok: false, error: 'Solo Dirección o un administrador puede administrar destinos.' };
  }

  const { error } = await supabase.schema('dilesa').from('portafolio_destinos').insert({
    empresa_id: DILESA_EMPRESA_ID,
    slug,
    label: input.label.trim(),
    cuenta_renta: input.cuentaRenta,
    cuenta_venta: input.cuentaVenta,
    orden: input.orden,
  });

  if (error) {
    // 23505 = unique_violation (empresa_id, slug)
    if (error.code === '23505') {
      return { ok: false, error: `Ya existe un destino equivalente (slug "${slug}").` };
    }
    return { ok: false, error: getSupabaseErrorMessage(error, 'No se pudo crear el destino.') };
  }

  revalidatePath('/dilesa/portafolio');
  return { ok: true };
}

export async function actualizarDestino(
  id: string,
  patch: {
    label?: string;
    cuentaRenta?: boolean;
    cuentaVenta?: boolean;
    orden?: number;
    activo?: boolean;
  }
): Promise<Result> {
  if (!id) return { ok: false, error: 'id requerido' };
  if (patch.label != null && !patch.label.trim()) {
    return { ok: false, error: 'El nombre del destino no puede quedar vacío.' };
  }
  if (patch.orden != null && (!Number.isFinite(patch.orden) || patch.orden < 0)) {
    return { ok: false, error: 'El orden debe ser un número ≥ 0.' };
  }

  // El slug es inmutable (identidad). Solo se actualizan label/flags/orden/activo.
  type DestinoUpdate = Database['dilesa']['Tables']['portafolio_destinos']['Update'];
  const update: DestinoUpdate = { updated_at: new Date().toISOString() };
  if (patch.label != null) update.label = patch.label.trim();
  if (patch.cuentaRenta != null) update.cuenta_renta = patch.cuentaRenta;
  if (patch.cuentaVenta != null) update.cuenta_venta = patch.cuentaVenta;
  if (patch.orden != null) update.orden = patch.orden;
  if (patch.activo != null) update.activo = patch.activo;

  const supabase = await getActionClient();
  if (!(await puedeAdministrar(supabase))) {
    return { ok: false, error: 'Solo Dirección o un administrador puede administrar destinos.' };
  }

  const { error } = await supabase
    .schema('dilesa')
    .from('portafolio_destinos')
    .update(update)
    .eq('id', id)
    .eq('empresa_id', DILESA_EMPRESA_ID);

  if (error) {
    return {
      ok: false,
      error: getSupabaseErrorMessage(error, 'No se pudo actualizar el destino.'),
    };
  }

  revalidatePath('/dilesa/portafolio');
  return { ok: true };
}

// ── Alta / edición de activos (dilesa-portafolio-expediente · Sprint 1) ───────

/** Campos del form (strings/numbers/booleans); el RPC castea desde jsonb. */
type ActivoFields = Record<string, string | number | boolean | null>;

const TIPOS_ACTIVO = [
  'casa',
  'lote',
  'local',
  'terreno',
  'departamento',
  'edificio',
  'nave',
  'plaza',
  'espectacular',
  'unipolar',
  'infraestructura',
] as const;

/**
 * Alta de un activo: crea el master `dilesa.activos` + su satélite por tipo en
 * una transacción (RPC `fn_alta_activo`). Devuelve nada — el caller refresca.
 */
export async function crearActivo(
  tipo: string,
  master: ActivoFields,
  satelite: ActivoFields = {}
): Promise<Result> {
  if (!(TIPOS_ACTIVO as readonly string[]).includes(tipo)) {
    return { ok: false, error: 'Tipo de activo no válido' };
  }
  if (!String(master.nombre ?? '').trim()) {
    return { ok: false, error: 'El nombre del activo es obligatorio' };
  }

  const supabase = await getActionClient();
  if (!(await puedeAdministrar(supabase))) {
    return { ok: false, error: 'Solo Dirección o un administrador puede dar de alta activos.' };
  }

  const { error } = await supabase.schema('dilesa').rpc('fn_alta_activo', {
    p_empresa_id: DILESA_EMPRESA_ID,
    p_tipo: tipo,
    p_master: master,
    p_satelite: satelite,
  });
  if (error) {
    return { ok: false, error: getSupabaseErrorMessage(error, 'No se pudo crear el activo.') };
  }

  revalidatePath('/dilesa/portafolio');
  return { ok: true };
}

/**
 * Edición de un activo: actualiza master + satélite (RPC `fn_actualizar_activo`).
 * El satélite se recrea desde el jsonb completo del form.
 */
export async function actualizarActivo(
  activoId: string,
  master: ActivoFields,
  satelite: ActivoFields = {}
): Promise<Result> {
  if (!activoId) return { ok: false, error: 'activoId requerido' };
  if (!String(master.nombre ?? '').trim()) {
    return { ok: false, error: 'El nombre del activo es obligatorio' };
  }

  const supabase = await getActionClient();
  if (!(await puedeAdministrar(supabase))) {
    return { ok: false, error: 'Solo Dirección o un administrador puede editar activos.' };
  }

  const { error } = await supabase.schema('dilesa').rpc('fn_actualizar_activo', {
    p_activo_id: activoId,
    p_master: master,
    p_satelite: satelite,
  });
  if (error) {
    return { ok: false, error: getSupabaseErrorMessage(error, 'No se pudo actualizar el activo.') };
  }

  revalidatePath('/dilesa/portafolio');
  return { ok: true };
}
