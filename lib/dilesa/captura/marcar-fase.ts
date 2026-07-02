/**
 * Helper compartido para captura de fase en el pipeline de ventas DILESA.
 *
 * Una "captura de fase" es la transacción que cierra una fase del pipeline:
 *   1. Sube los archivos a Supabase Storage (bucket `adjuntos`) → 1 path por archivo.
 *   2. Inserta filas en `erp.adjuntos` (entidad_tipo='venta', rol=<rol>) con el path.
 *   3. Inserta fila en `dilesa.venta_fases` con la fecha (today) — esa fila es la
 *      señal "fase cerrada" que destraba la siguiente.
 *   4. Opcionalmente, hace UPDATE en `dilesa.ventas` para los campos de la fase
 *      (ej. precio_asignacion en Fase 3, monto_avaluo en Fase 5, etc.).
 *
 * Idempotente *parcialmente*: si una corrida previa subió el archivo pero
 * falló al insertar venta_fases (ej. RLS), el archivo queda huérfano en
 * Storage hasta que se vuelva a correr (overwrite con nuevo timestamp).
 * No se intenta cleanup automático — los huérfanos se barren con el script
 * de F1 del Sprint 6 (storage-cleanup). En la práctica la fase es atómica
 * porque el cliente reintenta hasta éxito.
 *
 * Replicar este helper para las 16 fases restantes — cada page de fase llena
 * `MarcarFaseInput.docs[]` con sus roles requeridos y `camposVenta` con sus
 * campos específicos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildAdjuntoPath } from '@/lib/storage/path';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { FASES_VENTA, nombreFase, type FaseSlug } from '@/lib/dilesa/fases';
import { hoyISOMatamoros } from '@/lib/fecha-mx';

export type DocCaptura = {
  /** Rol del adjunto (ej. 'contrato_promesa', 'aviso_pld', 'factura'). */
  rol: string;
  /** Archivo subido por el usuario. */
  archivo: File;
};

export type MarcarFaseInput = {
  ventaId: string;
  /** Posición de la fase (1–17). El nombre se deriva de `lib/dilesa/fases.ts`. */
  faseposicion: number;
  /** Documentos a subir + crear como `erp.adjuntos`. */
  docs: DocCaptura[];
  /**
   * Campos a actualizar en `dilesa.ventas` para esta fase.
   * Ej. Fase 3 actualiza `precio_asignacion`, `descuento_total`.
   * Pasar `{}` si la fase no tiene campos.
   */
  camposVenta: Record<string, unknown>;
  /** Nota opcional para `venta_fases.notas` (texto libre). */
  notas?: string | null;
  /** Usuario que captura, para `venta_fases.registrado_por`. */
  registradoPor: string | null;
};

export type MarcarFaseResult = {
  ok: boolean;
  error?: string;
  ventaFaseId?: string;
  adjuntosCreados: number;
};

/**
 * Ejecuta los 4 pasos de la captura de fase. Diseñado para correr desde
 * el cliente (browser Supabase). Retorna { ok, error } — no throw.
 */
export async function marcarFase(
  sb: SupabaseClient,
  input: MarcarFaseInput
): Promise<MarcarFaseResult> {
  const { ventaId, faseposicion, docs, camposVenta, notas, registradoPor } = input;
  let adjuntosCreados = 0;

  // 1) Subir archivos a Storage + 2) insertar en erp.adjuntos
  for (const doc of docs) {
    const path = buildAdjuntoPath({
      empresa: 'dilesa',
      entidad: 'ventas',
      entidadId: ventaId,
      filename: doc.archivo.name,
    });
    const { error: upErr } = await sb.storage.from('adjuntos').upload(path, doc.archivo, {
      contentType: doc.archivo.type || 'application/octet-stream',
      upsert: false,
    });
    if (upErr) {
      return {
        ok: false,
        error: `No se pudo subir "${doc.archivo.name}": ${upErr.message}`,
        adjuntosCreados,
      };
    }
    const { error: adjErr } = await sb
      .schema('erp')
      .from('adjuntos')
      .insert({
        empresa_id: DILESA_EMPRESA_ID,
        entidad_tipo: 'venta',
        entidad_id: ventaId,
        rol: doc.rol,
        nombre: doc.archivo.name,
        url: path,
        tipo_mime: doc.archivo.type || null,
        tamano_bytes: doc.archivo.size,
        uploaded_by: registradoPor,
      });
    if (adjErr) {
      return {
        ok: false,
        error: `Archivo subido pero no se registró: ${adjErr.message}`,
        adjuntosCreados,
      };
    }
    adjuntosCreados += 1;
  }

  // 3) UPDATE de los campos de la venta — siempre sincronizamos
  //    `fase_actual` y `fase_posicion` con la fase que se está cerrando
  //    (no dependemos de que cada page los pase). El listado de ventas y
  //    el header del detalle leen estos campos como caché de la posición
  //    real, así que si no los actualizamos quedan stale y la UI muestra
  //    fases anteriores aunque el pipeline (venta_fases) tenga más
  //    cerradas. Bug detectado tras agregar Fases 3/4/5 que no los
  //    seteaban.
  //
  //    Defensa (2026-06-25, Beto): avance ESTRICTO de 1 en 1 — el caché de
  //    posición solo sube a la fase inmediata siguiente, jamás brinca. Antes
  //    era `faseposicion > posActual`, que dejaba que una captura adelantada
  //    (la preparación de entrega abría desde Escriturada) aterrizara la venta
  //    en la fase 14 saltándose Detonada (12) y Facturada (13). Ahora el
  //    pipeline obliga a recorrer todos los pasos en orden. Las pages ya gatean
  //    por la previa inmediata; esto es la defensa de fondo en el ÚNICO helper
  //    cliente que escribe `fase_posicion`. Re-capturar una fase anterior no
  //    pisa un estado más avanzado. Para retroceder se usa la server action
  //    `regresarAFase` (que limpia pipeline + sincroniza). La fase 14 ya no
  //    pasa por aquí: la cierra el trigger `dilesa.fn_auto_preparada_entrega`.
  const camposParaUpdate: Record<string, unknown> = { ...camposVenta };
  const { data: ventaActual } = await sb
    .schema('dilesa')
    .from('ventas')
    .select('fase_posicion')
    .eq('id', ventaId)
    .maybeSingle();
  const posActual = (ventaActual?.fase_posicion as number | null) ?? 0;
  if (faseposicion === posActual + 1) {
    camposParaUpdate.fase_actual = nombreFase(faseposicion);
    camposParaUpdate.fase_posicion = faseposicion;
  }
  if (Object.keys(camposParaUpdate).length > 0) {
    const { error: vErr } = await sb
      .schema('dilesa')
      .from('ventas')
      .update(camposParaUpdate)
      .eq('id', ventaId);
    if (vErr) {
      return {
        ok: false,
        error: `No se pudieron actualizar los campos de la venta: ${vErr.message}`,
        adjuntosCreados,
      };
    }
  }

  // 4) INSERT en venta_fases — esta es la señal de "fase cerrada".
  const { data: faseRow, error: fErr } = await sb
    .schema('dilesa')
    .from('venta_fases')
    .insert({
      empresa_id: DILESA_EMPRESA_ID,
      venta_id: ventaId,
      fase: nombreFase(faseposicion),
      posicion: faseposicion,
      fecha: hoyISOMatamoros(),
      registrado_por: registradoPor,
      notas: notas ?? null,
    })
    .select('id')
    .single();
  if (fErr) {
    return {
      ok: false,
      error: `Adjuntos guardados pero no se cerró la fase: ${fErr.message}`,
      adjuntosCreados,
    };
  }

  return { ok: true, ventaFaseId: faseRow.id as string, adjuntosCreados };
}

/**
 * Catálogo de fases para captura — alias de la fuente única `lib/dilesa/fases.ts`.
 * Conserva la forma `{ posicion, nombre, slug }` que consumen el copiloto de
 * cierre y el resumen de captura.
 */
export const FASES_PIPELINE = FASES_VENTA;

export type { FaseSlug };
