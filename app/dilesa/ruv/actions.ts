'use server';

/**
 * Server actions del módulo RUV (Registro Único de Vivienda).
 * Iniciativa `dilesa-ruv` · Sprint 4.
 *
 * - crearFrente: da de alta una oferta (frente), liga los lotes seleccionados
 *   (de los disponibles sin frente) e inicializa el checklist de 27 documentos
 *   en 'pendiente'.
 * - marcarDocumento: actualiza el estado/archivo de un documento del checklist.
 */

import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { assertNotInPreview } from '@/lib/auth/preview-guard';
import { getSupabaseErrorMessage } from '@/lib/supabase-error';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';

export type ActionResult = { ok: true } | { ok: false; error: string };

function intOrNull(v: string | null | undefined): number | null {
  if (v == null) return null;
  const s = v.trim();
  if (!s) return null;
  const n = Number(s.replace(/[^0-9]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function dateOrNull(v: string | null | undefined): string | null {
  const s = v?.trim();
  return s ? s : null;
}

export interface CrearFrenteInput {
  nombre: string;
  proyectoId: string | null;
  loteIds: string[];
  idOferta?: string | null;
  idOrden?: string | null;
  fechaInicio?: string | null;
  fechaFin?: string | null;
}

/**
 * Da de alta un frente: inserta la oferta, liga los lotes elegidos (solo los
 * que siguen disponibles) e inicializa el checklist de documentos en pendiente.
 */
export async function crearFrente(
  input: CrearFrenteInput
): Promise<{ ok: true; frenteId: string } | { ok: false; error: string }> {
  await assertNotInPreview();

  const nombre = input.nombre?.trim();
  if (!nombre) return { ok: false, error: 'Indica el nombre del frente.' };

  const loteIds = [...new Set((input.loteIds ?? []).filter(Boolean))];
  if (loteIds.length === 0) {
    return { ok: false, error: 'Selecciona al menos un lote para el frente.' };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado. Vuelve a iniciar sesión.' };

  // 1. Insertar la oferta. viviendas_oferta = # de lotes seleccionados.
  const { data: frente, error: insErr } = await supabase
    .schema('dilesa')
    .from('ruv_frentes')
    .insert({
      empresa_id: DILESA_EMPRESA_ID,
      nombre,
      proyecto_id: input.proyectoId || null,
      id_oferta: intOrNull(input.idOferta),
      id_orden: intOrNull(input.idOrden),
      fecha_inicio: dateOrNull(input.fechaInicio),
      fecha_fin: dateOrNull(input.fechaFin),
      viviendas_oferta: loteIds.length,
    })
    .select('id')
    .single();

  if (insErr || !frente) {
    return { ok: false, error: getSupabaseErrorMessage(insErr, 'No se pudo crear el frente.') };
  }
  const frenteId = frente.id as string;

  // 2. Ligar los lotes — solo los que siguen disponibles (frente_id IS NULL),
  // para no robar lotes ya asignados a otro frente entre la carga y el submit.
  const { error: ligaErr } = await supabase
    .schema('dilesa')
    .from('unidades')
    .update({ frente_id: frenteId })
    .eq('empresa_id', DILESA_EMPRESA_ID)
    .is('frente_id', null)
    .in('id', loteIds);

  if (ligaErr) {
    return {
      ok: false,
      error: getSupabaseErrorMessage(
        ligaErr,
        'El frente se creó pero no se pudieron ligar los lotes.'
      ),
    };
  }

  // 3. Inicializar el checklist de documentos (catálogo activo) en 'pendiente'.
  const { data: catalogo, error: catErr } = await supabase
    .schema('dilesa')
    .from('ruv_documentos_catalogo')
    .select('id')
    .eq('empresa_id', DILESA_EMPRESA_ID)
    .eq('activo', true);

  if (catErr) {
    return {
      ok: false,
      error: getSupabaseErrorMessage(
        catErr,
        'El frente se creó pero no se pudo cargar el catálogo.'
      ),
    };
  }

  const docRows = (catalogo ?? []).map((c) => ({
    empresa_id: DILESA_EMPRESA_ID,
    frente_id: frenteId,
    documento_catalogo_id: c.id as string,
    estado: 'pendiente',
  }));
  if (docRows.length > 0) {
    const { error: docErr } = await supabase
      .schema('dilesa')
      .from('ruv_frente_documentos')
      .insert(docRows);
    if (docErr) {
      return {
        ok: false,
        error: getSupabaseErrorMessage(
          docErr,
          'El frente se creó pero no se inicializó el checklist.'
        ),
      };
    }
  }

  revalidatePath('/dilesa/ruv');
  return { ok: true, frenteId };
}

export interface MarcarDocumentoInput {
  frenteId: string;
  documentoCatalogoId: string;
  estado: 'cargado' | 'pendiente';
  /** Path en el bucket `adjuntos` (cuando se sube un archivo). */
  archivoUrl?: string | null;
  /** YYYY-MM-DD; default hoy cuando se marca cargado. */
  fechaCarga?: string | null;
}

/**
 * Actualiza un documento del checklist de un frente (estado + archivo + fecha).
 * El row siempre existe (lo inicializa el alta / el backfill).
 */
export async function marcarDocumento(input: MarcarDocumentoInput): Promise<ActionResult> {
  await assertNotInPreview();

  if (!input.frenteId || !input.documentoCatalogoId) {
    return { ok: false, error: 'Falta el frente o el documento.' };
  }

  const supabase = await createSupabaseServerClient();

  const patch: {
    estado: 'cargado' | 'pendiente';
    updated_at: string;
    fecha_carga?: string | null;
    archivo_url?: string | null;
  } = {
    estado: input.estado,
    updated_at: new Date().toISOString(),
  };
  if (input.estado === 'cargado') {
    patch.fecha_carga = dateOrNull(input.fechaCarga) ?? new Date().toISOString().slice(0, 10);
    if (input.archivoUrl !== undefined) patch.archivo_url = input.archivoUrl;
  } else {
    // Volver a pendiente limpia la fecha (el archivo se conserva por si fue error).
    patch.fecha_carga = null;
  }

  const { error } = await supabase
    .schema('dilesa')
    .from('ruv_frente_documentos')
    .update(patch)
    .eq('frente_id', input.frenteId)
    .eq('documento_catalogo_id', input.documentoCatalogoId);

  if (error) {
    return {
      ok: false,
      error: getSupabaseErrorMessage(error, 'No se pudo actualizar el documento.'),
    };
  }

  revalidatePath('/dilesa/ruv');
  return { ok: true };
}

const HITO_COLUMNA = {
  dtu: 'fecha_dtu',
  extraccion: 'fecha_extraccion',
  seguro_calidad: 'fecha_seguro_calidad',
  paquete_ruv: 'fecha_paquete_ruv',
} as const;

export type RuvHito = keyof typeof HITO_COLUMNA;

/**
 * Marca/edita la fecha de un hito del trámite RUV (DTU / extracción / seguro de
 * calidad / paquete) de un lote (unidad). `fecha` null o vacío limpia el hito.
 */
export async function marcarHito(input: {
  unidadId: string;
  hito: RuvHito;
  fecha: string | null;
}): Promise<ActionResult> {
  await assertNotInPreview();
  if (!input.unidadId) return { ok: false, error: 'Falta el lote.' };
  const columna = HITO_COLUMNA[input.hito];
  if (!columna) return { ok: false, error: 'Hito inválido.' };

  const supabase = await createSupabaseServerClient();
  const patch: {
    fecha_dtu?: string | null;
    fecha_extraccion?: string | null;
    fecha_seguro_calidad?: string | null;
    fecha_paquete_ruv?: string | null;
  } = {};
  patch[columna] = dateOrNull(input.fecha);

  const { error } = await supabase
    .schema('dilesa')
    .from('unidades')
    .update(patch)
    .eq('id', input.unidadId)
    .eq('empresa_id', DILESA_EMPRESA_ID);

  if (error) {
    return { ok: false, error: getSupabaseErrorMessage(error, 'No se pudo actualizar el hito.') };
  }
  revalidatePath('/dilesa/ruv');
  return { ok: true };
}

/**
 * Captura/edita el CUV (Clave Única de Vivienda) de un lote. INFONAVIT lo emite
 * tras registrar el paquete, así que se carga después. `cuv` vacío lo limpia.
 * Valida 16 dígitos y unicidad (un CUV identifica una sola vivienda).
 */
export async function marcarCuv(input: {
  unidadId: string;
  cuv: string | null;
}): Promise<ActionResult> {
  await assertNotInPreview();
  if (!input.unidadId) return { ok: false, error: 'Falta el lote.' };

  const cuv = input.cuv?.trim() || null;
  if (cuv && !/^\d{16}$/.test(cuv)) {
    return { ok: false, error: 'El CUV debe ser de 16 dígitos.' };
  }

  const supabase = await createSupabaseServerClient();

  // Unicidad: el CUV no puede estar ya asignado a otro lote.
  if (cuv) {
    const { data: existe } = await supabase
      .schema('dilesa')
      .from('unidades')
      .select('id, identificador')
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .eq('cuv', cuv)
      .neq('id', input.unidadId)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (existe) {
      return {
        ok: false,
        error: `Ese CUV ya está asignado al lote ${(existe.identificador as string) ?? existe.id}.`,
      };
    }
  }

  const { error } = await supabase
    .schema('dilesa')
    .from('unidades')
    .update({ cuv })
    .eq('id', input.unidadId)
    .eq('empresa_id', DILESA_EMPRESA_ID);

  if (error) {
    return { ok: false, error: getSupabaseErrorMessage(error, 'No se pudo guardar el CUV.') };
  }
  revalidatePath('/dilesa/ruv');
  return { ok: true };
}
