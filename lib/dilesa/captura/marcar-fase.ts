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

export type DocCaptura = {
  /** Rol del adjunto (ej. 'contrato_promesa', 'aviso_pld', 'factura'). */
  rol: string;
  /** Archivo subido por el usuario. */
  archivo: File;
};

export type MarcarFaseInput = {
  ventaId: string;
  /** Nombre canónico de la fase (debe coincidir con `dilesa.venta_fase_catalogo.nombre`). */
  faseNombre: string;
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
  const { ventaId, faseNombre, faseposicion, docs, camposVenta, notas, registradoPor } = input;
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

  // 3) UPDATE de los campos de la venta (si hay)
  if (Object.keys(camposVenta).length > 0) {
    const { error: vErr } = await sb
      .schema('dilesa')
      .from('ventas')
      .update(camposVenta)
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
      fase: faseNombre,
      posicion: faseposicion,
      fecha: new Date().toISOString().slice(0, 10),
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
 * Catálogo central de fases — index 0 = Fase 1. Replica `FASES_ORDEN` de
 * `app/dilesa/ventas/[id]/page.tsx` pero como TS (no JSX) para que el
 * helper sea reusable en server actions futuros.
 */
export const FASES_PIPELINE = [
  { posicion: 1, nombre: 'Solicitud de Asignación', slug: '1-solicitud-asignacion' },
  { posicion: 2, nombre: 'Asignada', slug: '2-asignada' },
  { posicion: 3, nombre: 'Formalizada', slug: '3-formalizada' },
  { posicion: 4, nombre: 'Solicitud de Avalúo', slug: '4-solicitud-avaluo' },
  { posicion: 5, nombre: 'Avalúo Cerrado', slug: '5-avaluo-cerrado' },
  { posicion: 6, nombre: 'Inscrita', slug: '6-inscrita' },
  { posicion: 7, nombre: 'Solicitud de Dictaminación', slug: '7-solicitud-dictamen' },
  { posicion: 8, nombre: 'Dictaminada', slug: '8-dictaminada' },
  { posicion: 9, nombre: 'Validación Patronal', slug: '9-validacion-patronal' },
  { posicion: 10, nombre: 'Firmas Programadas', slug: '10-firmas-programadas' },
  { posicion: 11, nombre: 'Escriturada', slug: '11-escriturada' },
  { posicion: 12, nombre: 'Detonada', slug: '12-detonada' },
  { posicion: 13, nombre: 'Facturada', slug: '13-facturada' },
  { posicion: 14, nombre: 'Preparada para Entrega', slug: '14-preparada-entrega' },
  { posicion: 15, nombre: 'Entregada', slug: '15-entregada' },
  { posicion: 16, nombre: 'Comisión Pagada', slug: '16-comision-pagada' },
  { posicion: 17, nombre: 'Operación Terminada', slug: '17-operacion-terminada' },
] as const;

export type FaseSlug = (typeof FASES_PIPELINE)[number]['slug'];
