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
import { loadEmpresaBranding } from '@/lib/dilesa/email-branding';

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

/**
 * Valida que el usuario actual tenga permiso de autorizar movimientos
 * administrativos sobre ventas DILESA.
 *
 * Server-side puro: no podemos usar `fetchUserPermissions` de
 * `lib/permissions.ts` porque ese archivo es `'use client'`. Hacemos
 * los lookups directo con admin client.
 *
 * Tiene permiso si:
 *  (A) `core.usuarios.rol = 'admin'` (admin global), o
 *  (B) tiene escritura sobre `dilesa.ventas.autorizar` en algún rol
 *      que se le haya asignado en alguna empresa.
 */
/* eslint-disable @typescript-eslint/no-explicit-any --
 * supabase-js solo tipa `public`; para `core.*` casteamos `as any`.
 * Mismo patrón que `lib/empresas/admin-guard.ts`.
 */
async function requireAutorizar(): Promise<ActionResult & { userId?: string }> {
  const sb = await createSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado' };
  const email = user.email;
  if (!email) return { ok: false, error: 'JWT sin email claim' };

  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, error: 'Admin client no disponible' };

  // 1. Lookup del usuario por email → id + rol global.
  const { data: coreUser, error: cuErr } = await (admin.schema('core') as any)
    .from('usuarios')
    .select('id, rol, activo')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (cuErr) return { ok: false, error: `lookup usuario: ${cuErr.message}` };
  if (!coreUser || !coreUser.activo) {
    return { ok: false, error: 'Usuario sin acceso activo' };
  }

  // (A) Admin global → bypass.
  if (coreUser.rol === 'admin') {
    return { ok: true, userId: coreUser.id };
  }

  // (B) Buscar si alguno de sus roles en alguna empresa tiene escritura
  //     sobre el módulo `dilesa.ventas.autorizar`.
  const { data: modulo, error: mErr } = await (admin.schema('core') as any)
    .from('modulos')
    .select('id')
    .eq('slug', 'dilesa.ventas.autorizar')
    .limit(1)
    .maybeSingle();
  if (mErr) return { ok: false, error: `lookup módulo: ${mErr.message}` };
  if (!modulo) {
    return {
      ok: false,
      error: 'No tienes permisos para esta acción (módulo dilesa.ventas.autorizar no existe).',
    };
  }

  const { data: rolesUsuario } = await (admin.schema('core') as any)
    .from('usuarios_empresas')
    .select('rol_id')
    .eq('usuario_id', coreUser.id)
    .not('rol_id', 'is', null);
  const rolIds = ((rolesUsuario ?? []) as Array<{ rol_id: string | null }>)
    .map((r) => r.rol_id)
    .filter((v): v is string => !!v);
  if (rolIds.length === 0) {
    return {
      ok: false,
      error: 'No tienes rol asignado en ninguna empresa (requiere autorización).',
    };
  }

  const { data: permisos } = await (admin.schema('core') as any)
    .from('permisos_rol')
    .select('acceso_escritura')
    .eq('modulo_id', modulo.id)
    .in('rol_id', rolIds);
  const tienePermiso = ((permisos ?? []) as Array<{ acceso_escritura: boolean }>).some(
    (p) => p.acceso_escritura
  );
  if (!tienePermiso) {
    return {
      ok: false,
      error: 'No tienes permisos para esta acción (requiere autorización).',
    };
  }

  return { ok: true, userId: coreUser.id };
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

  const branding = await loadEmpresaBranding(admin, v.empresa_id);
  return {
    branding,
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
  try {
    return await regresarAFaseInner(ventaId, faseDestino, motivo);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[regresarAFase] uncaught error', { ventaId, error: msg });
    return { ok: false, error: `Error inesperado: ${msg}` };
  }
}

async function regresarAFaseInner(
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
  try {
    return await desasignarVentaInner(ventaId, motivo);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[desasignarVenta] uncaught error', { ventaId, error: msg });
    return { ok: false, error: `Error inesperado: ${msg}` };
  }
}

async function desasignarVentaInner(ventaId: string, motivo: string): Promise<ActionResult> {
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
    .select('id, estado, notas, unidad_id')
    .eq('id', ventaId)
    .maybeSingle();
  if (!v) return { ok: false, error: 'Venta no encontrada' };
  if (v.estado === 'desasignada') {
    return { ok: false, error: 'La venta ya está desasignada.' };
  }

  // Resolver identificador de unidad + proyecto para incluir en la nota
  // y dar trazabilidad de qué inventario se liberó.
  let inventarioDesc = '';
  if (v.unidad_id) {
    const { data: u } = await admin
      .schema('dilesa')
      .from('unidades')
      .select('identificador, proyecto_id')
      .eq('id', v.unidad_id)
      .maybeSingle();
    if (u) {
      let proyectoNombre = '';
      if (u.proyecto_id) {
        const { data: p } = await admin
          .schema('dilesa')
          .from('proyectos')
          .select('nombre')
          .eq('id', u.proyecto_id)
          .maybeSingle();
        proyectoNombre = p?.nombre ?? '';
      }
      inventarioDesc = [proyectoNombre, u.identificador].filter(Boolean).join(' · ');
    }
  }

  const ahora = new Date().toISOString();
  const inventarioPart = inventarioDesc ? ` (${inventarioDesc})` : '';
  const notaDesasignacion = `[${ahora}] Desasignada del inventario${inventarioPart} por motivo: ${motivoTrim}`;
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
