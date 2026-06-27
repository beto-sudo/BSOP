/**
 * Registra un EVENTO físico del tramo de entrega (ADR-052): la revisión de
 * pre-entrega o la entrega de la vivienda. A diferencia de `marcarFase`, NO
 * inserta en `dilesa.venta_fases` ni avanza la posición — solo persiste la
 * FECHA REAL del evento en `dilesa.ventas`. El avance de fase lo decide el motor
 * de DB `fn_avanzar_post_factura` cuando la operación se factura (13):
 *   - con `fecha_pre_entrega` → la venta queda en 14 (Preparada para Entrega);
 *   - con `fecha_entrega`     → queda en 15 (Entregada).
 *
 * La fecha puede ser ANTERIOR a hoy (la pre-entrega/entrega suelen ocurrir antes
 * de que Contabilidad facture). El documento soporte (checklist) lo sube la
 * pantalla por separado (subida colaborativa); este helper solo fecha el evento.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type EventoEntrega = 'pre_entrega' | 'entrega';

const COLUMNA_POR_EVENTO: Record<EventoEntrega, 'fecha_pre_entrega' | 'fecha_entrega'> = {
  pre_entrega: 'fecha_pre_entrega',
  entrega: 'fecha_entrega',
};

export type RegistrarEventoResult = { ok: boolean; error?: string };

export async function registrarEventoEntrega(
  sb: SupabaseClient,
  input: { ventaId: string; tipo: EventoEntrega; fecha: string }
): Promise<RegistrarEventoResult> {
  const columna = COLUMNA_POR_EVENTO[input.tipo];
  const { error } = await sb
    .schema('dilesa')
    .from('ventas')
    .update({ [columna]: input.fecha })
    .eq('id', input.ventaId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
