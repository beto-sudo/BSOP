'use server';

/**
 * Server actions de movimientos administrativos en una venta DILESA.
 *
 *  - `regresarAFase(ventaId, faseDestino, motivo)`: regresa la venta a
 *    una fase anterior. Conserva docs cargados. Si fase destino = 1,
 *    limpia notif_hold_creado_at + dispara email de bienvenida.
 *  - `desasignarVenta(ventaId, motivo)`: marca estado=desasignada,
 *    persiste motivo, manda email al cliente + vendedor.
 *
 * Gate: el caller debe tener escritura sobre `dilesa.ventas.autorizar`
 * (mismo sub-slug que la autorización Fase 2). Validado server-side
 * leyendo permisos del usuario en `core` schema.
 *
 * Cambios persistidos:
 *  - `dilesa.ventas` (UPDATE)
 *  - Llamada a hold-emails para enviar correo (fire-and-forget en error)
 */

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { sendHoldEmail, type HoldEmailContext } from '@/lib/dilesa/hold-emails';
import { fetchUserPermissions } from '@/lib/permissions';

const FASES_CANONICAS: Record<number, string> = {
  1: 'Solicitud de Asignación',
  2: 'Asignada',
  3: 'Formalizada',
  4: 'Solicitud de Avalúo',
  5: 'Avalúo Cerrado',
  6: 'Inscrita',
  7: 'Solicitud de Dictaminación',
  8: 'Dictaminada',
  9: 'Validación Patronal',
  10: 'Firmas Programadas',
  11: 'Escriturada',
  12: 'Detonada',
  13: 'Facturada',
  14: 'Preparada para Entrega',
  15: 'Entregada',
  16: 'Comisión Pagada',
  17: 'Operación Terminada',
};

export type ActionResult =
  | {
      ok: true;
      /** True si el email se envió con éxito. False si falló o no se intentó. */
      emailSent?: boolean;
      /** Destinatarios efectivos (vacío si no se envió). */
      emailSentTo?: string[];
      /** Mensaje de error del envío, si aplica. */
      emailError?: string;
    }
  | { ok: false; error: string };

async function requireAutorizar(): Promise<ActionResult & { userId?: string }> {
  const sb = await createSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado' };
  const perms = await fetchUserPermissions(sb);
  const tienePermiso =
    perms.isAdmin || perms.modulos.get('dilesa.ventas.autorizar')?.write === true;
  if (!tienePermiso) {
    return { ok: false, error: 'No tienes permisos para esta acción (requiere autorización).' };
  }
  return { ok: true, userId: user.id };
}

/**
 * Construye el contexto cross-schema para mandar email del hold sin
 * depender de RLS del caller. Mismo patrón que el endpoint
 * `/api/dilesa/ventas/[id]/notify-hold-creado`.
 */
async function buildEmailContext(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  ventaId: string
): Promise<HoldEmailContext | null> {
  const { data: v } = await admin
    .schema('dilesa')
    .from('ventas')
    .select(
      'id, empresa_id, unidad_id, persona_id, vendedor_usuario_id, vendedor, expira_at, motivo_desasignacion'
    )
    .eq('id', ventaId)
    .maybeSingle();
  if (!v) return null;

  const [{ data: persona }, { data: usuario }, { data: unidad }] = await Promise.all([
    admin
      .schema('erp')
      .from('personas')
      .select('nombre, apellido_paterno, apellido_materno, email')
      .eq('id', v.persona_id)
      .maybeSingle(),
    v.vendedor_usuario_id
      ? admin
          .schema('core')
          .from('usuarios')
          .select('first_name, last_name, email')
          .eq('id', v.vendedor_usuario_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    v.unidad_id
      ? admin
          .schema('dilesa')
          .from('unidades')
          .select('identificador, proyecto_id, manzana, numero_lote, producto_id')
          .eq('id', v.unidad_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let proyectoNombre = '';
  let prototipoSufijo: string | null = null;
  if (unidad?.proyecto_id) {
    const { data: p } = await admin
      .schema('dilesa')
      .from('proyectos')
      .select('nombre')
      .eq('id', unidad.proyecto_id)
      .maybeSingle();
    proyectoNombre = p?.nombre ?? '';
  }
  if (unidad?.producto_id) {
    const { data: producto } = await admin
      .schema('dilesa')
      .from('productos')
      .select('nombre')
      .eq('id', unidad.producto_id)
      .maybeSingle();
    prototipoSufijo = producto?.nombre ? (producto.nombre.split('-').pop() ?? null) : null;
  }

  const clienteNombre =
    [persona?.nombre, persona?.apellido_paterno, persona?.apellido_materno]
      .filter(Boolean)
      .join(' ') || '(sin nombre)';
  const vendedorNombre =
    [usuario?.first_name, usuario?.last_name].filter(Boolean).join(' ').trim() ||
    v.vendedor ||
    null;

  return {
    ventaId: v.id,
    empresaId: v.empresa_id,
    vendedorEmail: usuario?.email ?? null,
    vendedorNombre,
    clienteEmail: persona?.email ?? null,
    clienteNombre,
    unidadIdentificador: unidad?.identificador ?? '(sin unidad)',
    proyectoNombre,
    manzana: unidad?.manzana ?? null,
    lote: unidad?.numero_lote ?? null,
    prototipo: prototipoSufijo,
    expiraAt: v.expira_at ? new Date(v.expira_at) : null,
    motivo: v.motivo_desasignacion ?? null,
  };
}

/**
 * Regresa la venta a una fase anterior. Conserva docs cargados.
 * Si la fase destino = 1, limpia notif_hold_creado_at y dispara
 * email de bienvenida nuevo.
 */
export async function regresarAFase(
  ventaId: string,
  faseDestino: number,
  motivo: string
): Promise<ActionResult> {
  const gate = await requireAutorizar();
  if (!gate.ok) return gate;

  const motivoTrim = motivo.trim();
  if (motivoTrim.length < 5) {
    return { ok: false, error: 'El motivo es obligatorio (mínimo 5 caracteres).' };
  }
  const faseNombre = FASES_CANONICAS[faseDestino];
  if (!faseNombre) {
    return { ok: false, error: `Fase destino inválida: ${faseDestino}` };
  }

  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, error: 'Admin client no disponible' };

  // Validar que la fase destino sea ANTERIOR a la actual.
  const { data: v } = await admin
    .schema('dilesa')
    .from('ventas')
    .select('id, fase_posicion, estado, notas, persona_id, vendedor_usuario_id, unidad_id')
    .eq('id', ventaId)
    .maybeSingle();
  if (!v) return { ok: false, error: 'Venta no encontrada' };
  if (v.estado !== 'activa') {
    return { ok: false, error: `La venta está en estado "${v.estado}" — no se puede regresar.` };
  }
  if (faseDestino >= (v.fase_posicion ?? 0)) {
    return {
      ok: false,
      error: 'Solo se puede regresar a una fase anterior a la actual.',
    };
  }

  // Patch: actualizar fase + agregar log al campo `notas` (queda
  // como bitácora simple sin necesidad de tabla nueva). Si fase=1,
  // limpiamos notif_hold_creado_at para que el ciclo del hold arranque
  // de nuevo (cron o endpoint instantáneo lo recoge).
  const ahora = new Date().toISOString();
  const notaRegresion = `[${ahora}] Regresada a Fase ${faseDestino} (${faseNombre}) por motivo: ${motivoTrim}`;
  const notasNuevas = v.notas ? `${v.notas}\n${notaRegresion}` : notaRegresion;
  const update: {
    fase_actual: string;
    fase_posicion: number;
    notas: string;
    notif_hold_creado_at?: string | null;
    notif_hold_4h_at?: string | null;
  } = {
    fase_actual: faseNombre,
    fase_posicion: faseDestino,
    notas: notasNuevas,
  };
  if (faseDestino === 1) {
    update.notif_hold_creado_at = null;
    update.notif_hold_4h_at = null;
  }
  const { error: upErr } = await admin
    .schema('dilesa')
    .from('ventas')
    .update(update)
    .eq('id', ventaId);
  if (upErr) return { ok: false, error: upErr.message };

  // Si regresamos a Fase 1, mandamos el email de bienvenida otra vez
  // para que el cliente sepa que su solicitud está activa con plazo nuevo.
  // (Idempotencia: ya limpiamos notif_hold_creado_at arriba.)
  let emailSent = false;
  let emailSentTo: string[] = [];
  let emailError: string | undefined;
  if (faseDestino === 1) {
    const ctx = await buildEmailContext(admin, ventaId);
    if (!ctx) {
      emailError = 'No se pudo armar el contexto del email (venta no encontrada).';
      console.warn('[regresarAFase] buildEmailContext returned null', { ventaId });
    } else {
      const res = await sendHoldEmail('hold_creado', ctx);
      emailSent = res.ok;
      emailSentTo = res.sentTo;
      emailError = res.error;
      if (res.ok) {
        await admin
          .schema('dilesa')
          .from('ventas')
          .update({ notif_hold_creado_at: new Date().toISOString() })
          .eq('id', ventaId);
      } else {
        console.warn('[regresarAFase] sendHoldEmail failed', { ventaId, error: res.error });
      }
    }
  }

  revalidatePath(`/dilesa/ventas/${ventaId}`);
  return { ok: true, emailSent, emailSentTo, emailError };
}

/**
 * Desasigna la venta. Marca estado=desasignada, persiste motivo,
 * y manda email al cliente + vendedor con el motivo.
 *
 * La unidad queda disponible para nuevas solicitudes. NO se promueve
 * automáticamente al siguiente en la cola — la desasignación es una
 * decisión gerencial, no una expiración natural.
 */
export async function desasignarVenta(ventaId: string, motivo: string): Promise<ActionResult> {
  const gate = await requireAutorizar();
  if (!gate.ok) return gate;

  const motivoTrim = motivo.trim();
  if (motivoTrim.length < 5) {
    return { ok: false, error: 'El motivo es obligatorio (mínimo 5 caracteres).' };
  }

  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, error: 'Admin client no disponible' };

  const { data: v } = await admin
    .schema('dilesa')
    .from('ventas')
    .select('id, estado, notas')
    .eq('id', ventaId)
    .maybeSingle();
  if (!v) return { ok: false, error: 'Venta no encontrada' };
  if (v.estado === 'desasignada') {
    return { ok: false, error: 'La venta ya está desasignada.' };
  }

  const ahora = new Date().toISOString();
  const notaDesasignacion = `[${ahora}] Desasignada por motivo: ${motivoTrim}`;
  const notasNuevas = v.notas ? `${v.notas}\n${notaDesasignacion}` : notaDesasignacion;

  const { error: upErr } = await admin
    .schema('dilesa')
    .from('ventas')
    .update({
      estado: 'desasignada',
      motivo_desasignacion: motivoTrim,
      notas: notasNuevas,
    })
    .eq('id', ventaId);
  if (upErr) return { ok: false, error: upErr.message };

  // Email al cliente + vendedor.
  let emailSent = false;
  let emailSentTo: string[] = [];
  let emailError: string | undefined;
  const ctx = await buildEmailContext(admin, ventaId);
  if (!ctx) {
    emailError = 'No se pudo armar el contexto del email (venta no encontrada).';
    console.warn('[desasignarVenta] buildEmailContext returned null', { ventaId });
  } else {
    // Sobreescribimos motivo para que llegue fresh (la query lo trajo igual).
    const res = await sendHoldEmail('desasignada', { ...ctx, motivo: motivoTrim });
    emailSent = res.ok;
    emailSentTo = res.sentTo;
    emailError = res.error;
    if (!res.ok) {
      console.warn('[desasignarVenta] sendHoldEmail failed', {
        ventaId,
        error: res.error,
        clienteEmail: ctx.clienteEmail,
        vendedorEmail: ctx.vendedorEmail,
      });
    }
  }

  revalidatePath(`/dilesa/ventas/${ventaId}`);
  return { ok: true, emailSent, emailSentTo, emailError };
}
