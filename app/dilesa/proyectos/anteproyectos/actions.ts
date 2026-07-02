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
  TAREA_PASOS_VALIDOS,
  type TareaPaso,
  PASO_ESTADOS_VALIDOS,
  type PasoEstado,
  PASO_TO_PARTIDA_ESTADO,
} from '@/components/dilesa/tareas-checklist-types';
import {
  type AnalisisCampo,
  normalizarClasificaciones,
  normalizarPrototiposReferencia,
  validarCampoAnalisis,
} from '@/components/dilesa/analisis-financiero-types';
import { checkDireccionEmpresa } from '@/lib/auth/direccion-gate';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hoyISOMatamoros } from '@/lib/fecha-mx';

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
 * Sprint 4A (2026-05-30): la autorización del comité se eliminó como
 * tarea separada. La RPC ya no valida tarea Comité; el control de quién
 * puede llamar este action vive aquí — requiere rol admin (dirección).
 * Patrón consistente con `autorizarPaso` (Sprint 3.5) y
 * `autorizarPartida` (Sprint 2).
 *
 * La RPC sigue validando:
 * - El anteproyecto existe y `tipo='anteproyecto'`.
 * - No existe ya un desarrollo apuntándolo via `proyecto_predecesor_id`.
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

  // Role gate (Sprint 4A): admin global O rol "Dirección" en la empresa
  // del anteproyecto. Centralizado en `checkDireccionEmpresa`
  // (iniciativa dilesa-presupuesto-baseline S1) — mismo gate que
  // `autorizarPartida` / `autorizarPaso`.
  const { data: ap, error: apErr } = await supabase
    .schema('dilesa')
    .from('proyectos')
    .select('empresa_id')
    .eq('id', anteproyectoId)
    .maybeSingle();
  if (apErr || !ap) {
    return { ok: false, error: apErr?.message || 'Anteproyecto no encontrado' };
  }

  const gate = await checkDireccionEmpresa(supabase, ap.empresa_id);
  if (!gate.ok) return gate;
  if (!gate.autorizado) {
    return {
      ok: false,
      error: 'Solo dirección puede autorizar y promover a desarrollo.',
    };
  }

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
    patch.fecha_completada = hoyISOMatamoros();
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
 * Marca en bulk todas las tareas no-terminales de un proyecto como
 * `completada` (con `fecha_completada=hoy`). Pensado para el banner
 * "Marcar histórico" del detalle del desarrollo: los desarrollos llevan
 * años corriendo y, tras el backfill de la plantilla canónica, sus
 * tareas de trámite/factibilidad suelen estar ya superadas.
 *
 * Solo toca estados `pendiente | en_curso | bloqueada` — no revierte
 * `cancelada` ni re-toca `completada`. Reversible: cada tarea se puede
 * reabrir individualmente con `updateTareaEstado`. RLS gobierna el
 * acceso por empresa del proyecto.
 */
export async function marcarTareasHistorico(proyectoId: string): Promise<SimpleResult> {
  if (!proyectoId) return { ok: false, error: 'proyectoId requerido' };

  const supabase = await makeServerClient();
  const { error } = await supabase
    .schema('dilesa')
    .from('proyecto_tareas')
    .update({ estado: 'completada', fecha_completada: hoyISOMatamoros() })
    .eq('proyecto_id', proyectoId)
    .is('deleted_at', null)
    .in('estado', ['pendiente', 'en_curso', 'bloqueada']);

  if (error) return { ok: false, error: error.message || 'No se pudieron marcar las tareas.' };
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

  // Fase 2 dilesa-flujo-gasto: la partida vive en el modelo CANÓNICO
  // `erp.presupuesto_partidas` (ADR-040) — la tabla dilesa.* quedó deprecada
  // tras el rediseño del costeo y este sync seguía apuntándole (bug latente,
  // 0 filas afectadas). Solo así la partida del checklist es visible para el
  // control de 3 capas (tab Gasto / v_partida_control) y el ciclo P2P real.
  const { data: existing, error: eErr } = await supabase
    .schema('erp')
    .from('presupuesto_partidas')
    .select('id, estado')
    .eq('tarea_origen_id', tareaId)
    .is('deleted_at', null)
    .maybeSingle();
  if (eErr) return { ok: false, error: eErr.message };

  if (existing) {
    if (existing.estado !== 'preliminar') return { ok: true };
    if (monto === null) {
      const { error } = await supabase
        .schema('erp')
        .from('presupuesto_partidas')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }
    const { error } = await supabase
      .schema('erp')
      .from('presupuesto_partidas')
      .update({ monto_estimado: monto })
      .eq('id', existing.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (monto !== null) {
    const { error } = await supabase.schema('erp').from('presupuesto_partidas').insert({
      empresa_id: t.empresa_id,
      proyecto_id: t.proyecto_id,
      tarea_origen_id: tareaId,
      concepto_texto: t.titulo,
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
 * `autorizado_at=NOW()` y `autorizado_por=<userId>`.
 *
 * Gate Dirección (iniciativa dilesa-presupuesto-baseline S1): antes la
 * RLS por-empresa era el único control — cualquier miembro podía
 * autorizar. Ahora requiere admin global O rol "Dirección" en la
 * empresa de la partida.
 *
 * Idempotente: si la partida ya está en `autorizada+`, no hace nada.
 */
export async function autorizarPartida(partidaId: string): Promise<SimpleResult> {
  if (!partidaId) return { ok: false, error: 'partidaId requerido' };
  const supabase = await makeServerClient();

  const { data: partida, error: pErr } = await supabase
    .schema('erp')
    .from('presupuesto_partidas')
    .select('id, empresa_id')
    .eq('id', partidaId)
    .is('deleted_at', null)
    .maybeSingle();
  if (pErr) return { ok: false, error: pErr.message };
  if (!partida) return { ok: false, error: 'Partida no encontrada' };

  const gate = await checkDireccionEmpresa(supabase, partida.empresa_id);
  if (!gate.ok) return gate;
  if (!gate.autorizado) {
    return { ok: false, error: 'Solo Dirección puede autorizar partidas.' };
  }

  const { error } = await supabase
    .schema('erp')
    .from('presupuesto_partidas')
    .update({
      estado: 'autorizada',
      autorizado_at: new Date().toISOString(),
      autorizado_por: gate.authUserId,
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

// ──────────────────────────────────────────────────────────────────────────────
// Sprint 3 de `dilesa-proyectos-checklist-inline` — pasos por tarea
// ──────────────────────────────────────────────────────────────────────────────

export type PasoPatch = {
  monto?: number | null;
  documento_url?: string | null;
  fecha?: string | null;
  estado?: PasoEstado;
  notas?: string | null;
};

/**
 * Upsert universal de un paso (cotización / factura / pago / resultado)
 * de una tarea. Si el paso no existe lo crea con `estado='pendiente'`;
 * después aplica el patch. Whitelist por campo + validación.
 *
 * Side effects mantienen compat con los atajos de Sprint 1:
 * - Cuando el paso `cotizacion` actualiza `monto` → también escribe a
 *   `proyecto_tareas.resultado_monto` y dispara `syncPartidaDesdeTarea`
 *   para que la partida preliminar quede en sync (Sprint 2).
 * - Cuando el paso `resultado` actualiza `documento_url` → también
 *   escribe a `proyecto_tareas.resultado_documento_url`.
 *
 * El flujo extendido para factura/pago (autorizada/en_ejercicio en la
 * partida) se entrega en un sprint posterior — Sprint 3 entrega
 * captura + persistencia limpias por paso.
 */
export async function upsertPaso(
  tareaId: string,
  paso: TareaPaso,
  patch: PasoPatch
): Promise<SimpleResult> {
  if (!tareaId) return { ok: false, error: 'tareaId requerido' };
  if (!(TAREA_PASOS_VALIDOS as readonly string[]).includes(paso)) {
    return { ok: false, error: `Paso inválido: ${paso}` };
  }

  // Validación por campo (todos opcionales — el caller solo manda lo
  // que cambió).
  const update: Record<string, unknown> = {};
  if ('monto' in patch) {
    if (patch.monto != null) {
      if (!Number.isFinite(patch.monto) || patch.monto < 0) {
        return { ok: false, error: 'Monto debe ser número ≥ 0' };
      }
    }
    update.monto = patch.monto ?? null;
  }
  if ('documento_url' in patch) {
    update.documento_url =
      patch.documento_url != null && patch.documento_url.trim() === ''
        ? null
        : (patch.documento_url ?? null);
  }
  if ('fecha' in patch) {
    if (patch.fecha != null && !/^\d{4}-\d{2}-\d{2}$/.test(patch.fecha)) {
      return { ok: false, error: 'Fecha debe ser YYYY-MM-DD' };
    }
    update.fecha = patch.fecha ?? null;
  }
  if ('estado' in patch && patch.estado) {
    if (!(PASO_ESTADOS_VALIDOS as readonly string[]).includes(patch.estado)) {
      return { ok: false, error: `Estado de paso inválido: ${patch.estado}` };
    }
    update.estado = patch.estado;
  }
  if ('notas' in patch) {
    update.notas = patch.notas != null && patch.notas.trim() === '' ? null : (patch.notas ?? null);
  }
  if (Object.keys(update).length === 0) return { ok: false, error: 'sin cambios' };

  const supabase = await makeServerClient();

  // 1) Leer tarea para empresa_id (necesario para el upsert por unique
  //    (tarea_id, paso) y para RLS).
  const { data: tareaRow, error: tareaErr } = await supabase
    .schema('dilesa')
    .from('proyecto_tareas')
    .select('id, empresa_id')
    .eq('id', tareaId)
    .is('deleted_at', null)
    .single();
  if (tareaErr || !tareaRow) {
    return { ok: false, error: tareaErr?.message ?? 'tarea no encontrada' };
  }
  const empresaId = (tareaRow as { empresa_id: string }).empresa_id;

  // 2) Upsert por (tarea_id, paso). La unique constraint hace que un
  //    INSERT del mismo (tarea_id, paso) actualice en lugar de duplicar.
  const upsertRow = {
    empresa_id: empresaId,
    tarea_id: tareaId,
    paso,
    estado: 'pendiente' as const,
    ...update,
  };
  const { error: upsertErr } = await supabase
    .schema('dilesa')
    .from('proyecto_tarea_pasos')
    .upsert(upsertRow, { onConflict: 'tarea_id,paso' });
  if (upsertErr) {
    return { ok: false, error: upsertErr.message || 'No se pudo guardar el paso.' };
  }

  // 3) Side effects backwards-compat con atajos en `proyecto_tareas`.
  if (paso === 'cotizacion' && 'monto' in update) {
    const newMonto = (update.monto as number | null) ?? null;
    await supabase
      .schema('dilesa')
      .from('proyecto_tareas')
      .update({ resultado_monto: newMonto })
      .eq('id', tareaId);
    // Mantén la sincronización con partida preliminar del Sprint 2.
    void syncPartidaDesdeTarea(supabase, tareaId, newMonto).catch((e) =>
      console.warn('[upsertPaso] sync partida falló:', e)
    );
  }
  if (paso === 'resultado' && 'documento_url' in update) {
    await supabase
      .schema('dilesa')
      .from('proyecto_tareas')
      .update({ resultado_documento_url: update.documento_url ?? null })
      .eq('id', tareaId);
  }

  revalidateAnteproyectosPaths();
  return { ok: true };
}

/**
 * Marca un paso como `hecho`, `pendiente` o `no_aplica`. Atajo cuando
 * el caller solo quiere mover el estado sin tocar monto/doc/fecha.
 */
export async function marcarPasoEstado(
  tareaId: string,
  paso: TareaPaso,
  estado: PasoEstado
): Promise<SimpleResult> {
  return upsertPaso(tareaId, paso, { estado });
}

/**
 * Autoriza un paso (típicamente `cotizacion`) por dirección. Setea
 * `autorizado_at=NOW()` y `autorizado_por=<user>`.
 *
 * Gate Dirección (iniciativa dilesa-presupuesto-baseline S1): antes
 * solo `core.usuarios.rol='admin'`, que excluía al rol "Dirección"
 * legítimo de la empresa. Ahora: admin global O rol "Dirección" en la
 * empresa de la tarea (`checkDireccionEmpresa`).
 *
 * Idempotente: si el paso ya está autorizado, no-op silencioso.
 */
export async function autorizarPaso(tareaId: string, paso: TareaPaso): Promise<SimpleResult> {
  if (!tareaId) return { ok: false, error: 'tareaId requerido' };
  if (!(TAREA_PASOS_VALIDOS as readonly string[]).includes(paso)) {
    return { ok: false, error: `Paso inválido: ${paso}` };
  }

  const supabase = await makeServerClient();

  const { data: tarea, error: tErr } = await supabase
    .schema('dilesa')
    .from('proyecto_tareas')
    .select('id, empresa_id')
    .eq('id', tareaId)
    .is('deleted_at', null)
    .maybeSingle();
  if (tErr) return { ok: false, error: tErr.message };
  if (!tarea) return { ok: false, error: 'Tarea no encontrada' };

  const gate = await checkDireccionEmpresa(supabase, (tarea as { empresa_id: string }).empresa_id);
  if (!gate.ok) return gate;
  if (!gate.autorizado) {
    return { ok: false, error: 'Requiere rol admin/dirección para autorizar' };
  }

  const { error } = await supabase
    .schema('dilesa')
    .from('proyecto_tarea_pasos')
    .update({
      autorizado_at: new Date().toISOString(),
      autorizado_por: gate.authUserId,
    })
    .eq('tarea_id', tareaId)
    .eq('paso', paso)
    .is('autorizado_at', null);

  if (error) return { ok: false, error: error.message || 'No se pudo autorizar el paso.' };
  revalidateAnteproyectosPaths();
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────────
// Sprint 4B — captura inline del análisis financiero del anteproyecto
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Actualiza un campo numérico del análisis financiero de un
 * anteproyecto. `valor=null` limpia. Acepta `number | null` y valida
 * que sea finito y no-negativo. Whitelist contra
 * `ANALISIS_NUMERIC_FIELDS` para no escribir a columnas no
 * intencionadas. RLS valida el acceso a la empresa.
 */
export async function updateAnteproyectoAnalisisCampo(
  proyectoId: string,
  campo: AnalisisCampo,
  valor: number | null
): Promise<SimpleResult> {
  if (!proyectoId) return { ok: false, error: 'proyectoId requerido' };
  const valid = validarCampoAnalisis(campo, valor);
  if (!valid.ok) return valid;

  const supabase = await makeServerClient();
  const { error } = await supabase
    .schema('dilesa')
    .from('proyectos')
    .update({ [campo]: valor })
    .eq('id', proyectoId);

  if (error) {
    return { ok: false, error: error.message || 'No se pudo actualizar el campo.' };
  }
  revalidateAnteproyectosPaths();
  return { ok: true };
}

/**
 * Bandera `infraestructura_cabecera_necesaria` — boolean simple.
 */
export async function updateAnteproyectoInfraCabecera(
  proyectoId: string,
  necesaria: boolean
): Promise<SimpleResult> {
  if (!proyectoId) return { ok: false, error: 'proyectoId requerido' };
  const supabase = await makeServerClient();
  const { error } = await supabase
    .schema('dilesa')
    .from('proyectos')
    .update({ infraestructura_cabecera_necesaria: necesaria })
    .eq('id', proyectoId);
  if (error) return { ok: false, error: error.message };
  revalidateAnteproyectosPaths();
  return { ok: true };
}

/**
 * `prototipos_referencia` — array de nombres free-text (chips). v1
 * acepta el array completo (replace), no add/remove granular. Trim +
 * dedup + limita a 16 elementos máx.
 */
export async function updateAnteproyectoPrototiposReferencia(
  proyectoId: string,
  nombres: string[]
): Promise<SimpleResult> {
  if (!proyectoId) return { ok: false, error: 'proyectoId requerido' };
  if (!Array.isArray(nombres)) return { ok: false, error: 'nombres debe ser array' };
  const norm = normalizarPrototiposReferencia(nombres);
  const supabase = await makeServerClient();
  const { error } = await supabase
    .schema('dilesa')
    .from('proyectos')
    .update({ prototipos_referencia: norm })
    .eq('id', proyectoId);
  if (error) return { ok: false, error: error.message };
  revalidateAnteproyectosPaths();
  return { ok: true };
}

/**
 * Multiselect de clasificaciones inmobiliarias (Sprint 4B refinamiento).
 * Acepta el array completo. Whitelist contra el catálogo
 * `CLASIFICACIONES_INMOBILIARIAS` — valores fuera se descartan
 * silenciosamente. El trigger DB sincroniza el primer elemento al
 * campo singular legacy para back-compat con funciones SQL.
 */
export async function updateAnteproyectoClasificaciones(
  proyectoId: string,
  codigos: string[]
): Promise<SimpleResult> {
  if (!proyectoId) return { ok: false, error: 'proyectoId requerido' };
  if (!Array.isArray(codigos)) return { ok: false, error: 'codigos debe ser array' };
  const norm = normalizarClasificaciones(codigos);
  const supabase = await makeServerClient();
  const { error } = await supabase
    .schema('dilesa')
    .from('proyectos')
    .update({ clasificaciones_inmobiliarias: norm })
    .eq('id', proyectoId);
  if (error) return { ok: false, error: error.message };
  revalidateAnteproyectosPaths();
  return { ok: true };
}

/**
 * Setea (o limpia, con null) el prototipo de referencia. Cuando el
 * prototipo seleccionado tiene `valor_comercial_referencia` poblado en
 * `dilesa.productos`, autopopula ese campo en el proyecto — esa es la
 * razón principal del selector (Beto explícito: "para poder extraer
 * los datos de referencia de ahí").
 *
 * Si productoId=null: limpia el FK y deja el resto intacto (no borra
 * los valores capturados — el usuario decide si los limpia manual).
 */
export async function updateAnteproyectoPrototipoReferencia(
  proyectoId: string,
  productoId: string | null
): Promise<SimpleResult> {
  if (!proyectoId) return { ok: false, error: 'proyectoId requerido' };
  const supabase = await makeServerClient();

  const patch: Record<string, unknown> = { prototipo_referencia_id: productoId };

  if (productoId) {
    const { data: producto, error: prodErr } = await supabase
      .schema('dilesa')
      .from('productos')
      .select(
        'valor_comercial_referencia, costo_urbanizacion_referencia, costo_materiales_referencia, costo_mo_referencia, registro_ruv_referencia, seguro_calidad_referencia, costo_comercializacion_referencia'
      )
      .eq('id', productoId)
      .maybeSingle();
    if (prodErr) return { ok: false, error: prodErr.message };
    if (!producto) return { ok: false, error: 'Prototipo no encontrado' };

    const refFields = [
      'valor_comercial_referencia',
      'costo_urbanizacion_referencia',
      'costo_materiales_referencia',
      'costo_mo_referencia',
      'registro_ruv_referencia',
      'seguro_calidad_referencia',
      'costo_comercializacion_referencia',
    ] as const;
    for (const f of refFields) {
      if (producto[f] != null) patch[f] = producto[f];
    }

    // Pre-llenar campos Proyecto con los valores de Referencia como
    // baseline editable (solo donde el campo está null).
    const { data: proyecto, error: projErr } = await supabase
      .schema('dilesa')
      .from('proyectos')
      .select(
        'valor_comercial_proyecto, costo_urbanizacion, costo_materiales_proyecto, costo_mo, registro_ruv_proyecto, seguro_calidad_proyecto, costo_comercializacion'
      )
      .eq('id', proyectoId)
      .single();
    if (projErr) return { ok: false, error: projErr.message };

    const refToProj: [keyof typeof producto, string][] = [
      ['valor_comercial_referencia', 'valor_comercial_proyecto'],
      ['costo_urbanizacion_referencia', 'costo_urbanizacion'],
      ['costo_materiales_referencia', 'costo_materiales_proyecto'],
      ['costo_mo_referencia', 'costo_mo'],
      ['registro_ruv_referencia', 'registro_ruv_proyecto'],
      ['seguro_calidad_referencia', 'seguro_calidad_proyecto'],
      ['costo_comercializacion_referencia', 'costo_comercializacion'],
    ];
    for (const [refKey, projKey] of refToProj) {
      if (
        producto[refKey] != null &&
        (proyecto[projKey as keyof typeof proyecto] == null ||
          proyecto[projKey as keyof typeof proyecto] === 0)
      ) {
        patch[projKey] = producto[refKey];
      }
    }
  }

  const { error } = await supabase
    .schema('dilesa')
    .from('proyectos')
    .update(patch)
    .eq('id', proyectoId);

  if (error) return { ok: false, error: error.message };
  revalidateAnteproyectosPaths();
  return { ok: true };
}
