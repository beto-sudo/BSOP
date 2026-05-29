'use server';

/**
 * Server actions de Anteproyectos DILESA.
 *
 * Sprint 3 de `dilesa-proyectos-anteproyectos`:
 * - `populatePlantilla(proyectoId, fechaArranqueIso)` — instancia las
 *   tareas del catálogo canónico (`dilesa.plantilla_proyecto_tareas`)
 *   filtradas por `aplicacion` según el tipo del proyecto, calcula
 *   fechas objetivo en cascada con calendario hábil MX, y crea las
 *   dependencias entre las instancias.
 * - `promoteAnteproyecto(anteproyectoId)` — conversión a desarrollo
 *   via RPC `dilesa.fn_proyecto_promote_anteproyecto`.
 *
 * Sprint 1 de `dilesa-proyectos-checklist-inline`:
 * - `updateTareaEstado`, `updateTareaMonto`, `updateTareaDocumento`,
 *   `updateTareaNotas` — captura inline de los 4 campos editables por
 *   tarea. Whitelist por campo, valida tipos, escribe a
 *   `dilesa.proyecto_tareas`. Setea/limpia `fecha_completada`
 *   automático cuando el estado cruza `completada`.
 *
 * RLS protege la escritura: el usuario debe tener acceso a la empresa
 * del proyecto/tarea.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { instanciarPlantillaParaProyecto } from '@/lib/dilesa/instanciar-plantilla';
import {
  TAREA_ESTADOS_VALIDOS,
  type TareaEstado,
  esTareaCotizacion,
} from '@/components/dilesa/tareas-checklist-types';
import type { SupabaseClient } from '@supabase/supabase-js';

type Result = { ok: true; tareasCreadas: number } | { ok: false; error: string };

type SimpleResult = { ok: true } | { ok: false; error: string };

async function makeServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // no-op
        },
      },
    }
  );
}

function revalidateAnteproyectosPaths() {
  revalidatePath('/dilesa/proyectos/anteproyectos');
  revalidatePath('/dilesa/proyectos');
}

export async function populatePlantilla(
  proyectoId: string,
  fechaArranqueIso: string
): Promise<Result> {
  const supabase = await makeServerClient();
  const r = await instanciarPlantillaParaProyecto(supabase, proyectoId, fechaArranqueIso);
  if (!r.ok) return r;

  revalidateAnteproyectosPaths();
  return { ok: true, tareasCreadas: r.tareasCreadas };
}

/**
 * Promueve un anteproyecto a desarrollo via RPC
 * `dilesa.fn_proyecto_promote_anteproyecto`.
 *
 * Sprint 4 de la iniciativa. La RPC valida:
 * - El anteproyecto existe y `tipo='anteproyecto'`.
 * - No existe ya un desarrollo apuntándolo via `proyecto_predecesor_id`.
 * - Tarea "Aprobación de Comité de Inversión" en `estado='completada'`.
 *
 * En éxito: crea row nuevo en `dilesa.proyectos` con `tipo='desarrollo'`,
 * copia tareas rehogables + partidas autorizadas, marca el anteproyecto
 * como `estado='completado'`. Retorna `proyectoId` del nuevo desarrollo.
 */
export async function promoteAnteproyecto(
  anteproyectoId: string
): Promise<{ ok: true; proyectoId: string } | { ok: false; error: string }> {
  if (!anteproyectoId) return { ok: false, error: 'anteproyectoId requerido' };

  const supabase = await makeServerClient();
  const { data, error } = await supabase
    .schema('dilesa')
    .rpc('fn_proyecto_promote_anteproyecto', { p_anteproyecto_id: anteproyectoId });

  if (error) {
    return {
      ok: false,
      error: error.message || 'No se pudo promover el anteproyecto.',
    };
  }

  revalidateAnteproyectosPaths();
  return { ok: true, proyectoId: data as string };
}

// ──────────────────────────────────────────────────────────────────────────────
// Sprint 1 de `dilesa-proyectos-checklist-inline` — captura inline por tarea
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Cambia el estado de una tarea. Setea o limpia `fecha_completada`
 * automático cuando el estado cruza `completada` (entra o sale).
 * Whitelist contra `TAREA_ESTADOS_VALIDOS` para no aceptar valores
 * que rompan el CHECK del DB.
 */
export async function updateTareaEstado(
  tareaId: string,
  estado: TareaEstado
): Promise<SimpleResult> {
  if (!tareaId) return { ok: false, error: 'tareaId requerido' };
  if (!TAREA_ESTADOS_VALIDOS.includes(estado)) {
    return { ok: false, error: `Estado inválido: ${estado}` };
  }

  const supabase = await makeServerClient();
  const patch: { estado: TareaEstado; fecha_completada?: string | null } = { estado };
  if (estado === 'completada') {
    patch.fecha_completada = new Date().toISOString().slice(0, 10);
  } else {
    // Si el operador desmarca, limpia la fecha (consistente con `vendida`/
    // `entregada` de unidades — el ciclo puede revertir).
    patch.fecha_completada = null;
  }

  const { error } = await supabase
    .schema('dilesa')
    .from('proyecto_tareas')
    .update(patch)
    .eq('id', tareaId);

  if (error) return { ok: false, error: error.message || 'No se pudo actualizar el estado.' };
  revalidateAnteproyectosPaths();
  return { ok: true };
}

/**
 * Captura `resultado_monto` en una tarea (ej. cotización). Acepta null
 * para limpiar.
 *
 * Sprint 2 (auto-vinculación con partida): si la tarea es de cotización
 * (`subtipo_snapshot` contiene "cotizac"), se llama a
 * `syncPartidaDesdeTarea` para crear/actualizar/cerrar una partida
 * preliminar vinculada vía `tarea_origen_id`. Reglas:
 * - Si no existe partida vinculada y `monto != null` → INSERT preliminar.
 * - Si existe y está en `preliminar` → UPDATE `monto_estimado`.
 * - Si está en `preliminar` y `monto = null` → soft delete (`deleted_at`).
 * - Si existe y está en `autorizada+` → NO machacamos (el monto en la
 *   partida puede haber sido ajustado en el flujo de autorización).
 */
export async function updateTareaMonto(
  tareaId: string,
  monto: number | null
): Promise<SimpleResult> {
  if (!tareaId) return { ok: false, error: 'tareaId requerido' };
  if (monto != null) {
    if (!Number.isFinite(monto) || monto < 0) {
      return { ok: false, error: 'Monto debe ser número ≥ 0' };
    }
  }

  const supabase = await makeServerClient();
  const { error } = await supabase
    .schema('dilesa')
    .from('proyecto_tareas')
    .update({ resultado_monto: monto })
    .eq('id', tareaId);

  if (error) return { ok: false, error: error.message || 'No se pudo actualizar el monto.' };

  // Sincronización con partida — no bloqueante para el éxito del update
  // del monto; si falla, log silencioso y seguimos. El usuario puede
  // re-disparar capturando el monto de nuevo.
  const partidaSync = await syncPartidaDesdeTarea(supabase, tareaId, monto);
  if (!partidaSync.ok) {
    console.warn('[updateTareaMonto] sync partida falló:', partidaSync.error);
  }

  revalidateAnteproyectosPaths();
  return { ok: true };
}

/**
 * Sincroniza la partida preliminar vinculada a una tarea de cotización.
 * NO se exporta — se llama desde `updateTareaMonto`. Service-internal.
 */
async function syncPartidaDesdeTarea(
  supabase: SupabaseClient,
  tareaId: string,
  monto: number | null
): Promise<SimpleResult> {
  const { data: t, error: tErr } = await supabase
    .schema('dilesa')
    .from('proyecto_tareas')
    .select('id, empresa_id, proyecto_id, titulo, tipo_snapshot, subtipo_snapshot')
    .eq('id', tareaId)
    .is('deleted_at', null)
    .single();
  if (tErr || !t) return { ok: false, error: tErr?.message ?? 'tarea no encontrada' };
  if (!esTareaCotizacion(t.tipo_snapshot as string | null, t.subtipo_snapshot as string | null)) {
    return { ok: true };
  }

  const { data: existing, error: eErr } = await supabase
    .schema('dilesa')
    .from('proyecto_presupuesto_partidas')
    .select('id, estado')
    .eq('tarea_origen_id', tareaId)
    .is('deleted_at', null)
    .maybeSingle();
  if (eErr) return { ok: false, error: eErr.message };

  if (existing) {
    if (existing.estado !== 'preliminar') return { ok: true };
    if (monto === null) {
      const { error } = await supabase
        .schema('dilesa')
        .from('proyecto_presupuesto_partidas')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }
    const { error } = await supabase
      .schema('dilesa')
      .from('proyecto_presupuesto_partidas')
      .update({ monto_estimado: monto })
      .eq('id', existing.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (monto !== null) {
    const { error } = await supabase.schema('dilesa').from('proyecto_presupuesto_partidas').insert({
      empresa_id: t.empresa_id,
      proyecto_id: t.proyecto_id,
      tarea_origen_id: tareaId,
      partida: t.titulo,
      monto_estimado: monto,
      estado: 'preliminar',
      fuente: 'cotizacion',
    });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Mueve una partida de `preliminar` → `autorizada`. Set
 * `autorizado_at=NOW()` y `autorizado_por=<userId>`. RLS de la tabla
 * sigue gobernando quién puede actualizar (rol gate).
 *
 * Idempotente: si la partida ya está en `autorizada+`, no hace nada.
 */
export async function autorizarPartida(partidaId: string): Promise<SimpleResult> {
  if (!partidaId) return { ok: false, error: 'partidaId requerido' };
  const supabase = await makeServerClient();

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes?.user) return { ok: false, error: 'No autenticado' };

  const { error } = await supabase
    .schema('dilesa')
    .from('proyecto_presupuesto_partidas')
    .update({
      estado: 'autorizada',
      autorizado_at: new Date().toISOString(),
      autorizado_por: userRes.user.id,
    })
    .eq('id', partidaId)
    .eq('estado', 'preliminar');

  if (error) return { ok: false, error: error.message || 'No se pudo autorizar la partida.' };
  revalidateAnteproyectosPaths();
  return { ok: true };
}

/**
 * Captura la URL del documento principal de la tarea. Espera la URL
 * pública que devuelve `<FileAttachments>` después de subir el
 * archivo a Supabase Storage. El legajo completo vive en
 * `proyecto_documentos` (Sprint 4 consolida la vista).
 */
export async function updateTareaDocumento(
  tareaId: string,
  documentoUrl: string | null
): Promise<SimpleResult> {
  if (!tareaId) return { ok: false, error: 'tareaId requerido' };
  if (documentoUrl != null && documentoUrl.trim() === '') {
    documentoUrl = null;
  }

  const supabase = await makeServerClient();
  const { error } = await supabase
    .schema('dilesa')
    .from('proyecto_tareas')
    .update({ resultado_documento_url: documentoUrl })
    .eq('id', tareaId);

  if (error) return { ok: false, error: error.message || 'No se pudo actualizar el documento.' };
  revalidateAnteproyectosPaths();
  return { ok: true };
}

/**
 * Captura notas libres en `descripcion` de la tarea. Sobrescribe el
 * valor anterior (la descripcion canónica del catálogo vive en
 * `plantilla_proyecto_tareas.descripcion` y no se altera).
 */
export async function updateTareaNotas(
  tareaId: string,
  notas: string | null
): Promise<SimpleResult> {
  if (!tareaId) return { ok: false, error: 'tareaId requerido' };
  const value = notas != null && notas.trim() === '' ? null : notas;

  const supabase = await makeServerClient();
  const { error } = await supabase
    .schema('dilesa')
    .from('proyecto_tareas')
    .update({ descripcion: value })
    .eq('id', tareaId);

  if (error) return { ok: false, error: error.message || 'No se pudieron actualizar las notas.' };
  revalidateAnteproyectosPaths();
  return { ok: true };
}
