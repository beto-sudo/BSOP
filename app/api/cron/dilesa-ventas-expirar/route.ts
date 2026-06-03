/**
 * Cron: expirar holds de DILESA + enviar emails de cola.
 *
 * Schedule: `0 * * * *` (cada hora). Cubre:
 *  1. Marcar como `'expirada'` las ventas líder cuyo `expira_at` ya pasó
 *     (llama `dilesa.fn_expirar_ventas_vencidas()`).
 *  2. Por cada expirada: email `hold_expirada` al vendedor + cliente.
 *  3. Promover al siguiente en la cola: setear `expira_at` fresco
 *     (2 días hábiles desde ahora) + email `hold_promovido`.
 *  4. Líderes con < 4h restantes (y `notif_hold_4h_at IS NULL`): email
 *     `hold_4h_warning`.
 *  5. Líderes recién creados (notif_hold_creado_at IS NULL): email
 *     `hold_creado` — el form no manda email directo para mantenerlo
 *     simple; el cron lo recoge en ≤1h.
 *
 * Idempotencia: cada email tiene su columna `notif_hold_*_at`. El cron
 * setea el timestamp solo si el email se envió OK.
 *
 * Security: `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron lo envía
 * automáticamente).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { AVISO_HOLD_4H_MS, calcularExpiraAt } from '@/lib/dilesa/hold-cola';
import { sendHoldEmail, type HoldEmailContext } from '@/lib/dilesa/hold-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface VentaRow {
  id: string;
  empresa_id: string;
  unidad_id: string | null;
  persona_id: string;
  vendedor_usuario_id: string | null;
  vendedor: string | null;
  created_at: string;
  expira_at: string | null;
  estado: string;
  notif_hold_creado_at: string | null;
  notif_hold_promovido_at: string | null;
  notif_hold_4h_at: string | null;
  notif_hold_expirada_at: string | null;
}

interface ColaRow {
  unidad_id: string;
  venta_id: string;
  posicion: number;
  created_at: string;
  expira_at: string | null;
}

/**
 * Resolver datos comunes para el email: nombres + emails del vendedor
 * y cliente + identificador de la unidad + proyecto.
 */
async function buildEmailContext(
  sb: ReturnType<typeof getSupabaseAdminClient>,
  venta: VentaRow
): Promise<HoldEmailContext | null> {
  if (!sb || !venta.unidad_id) return null;

  const [{ data: persona }, { data: usuario }, { data: unidad }] = await Promise.all([
    sb
      .schema('erp')
      .from('personas')
      .select('nombre, apellido_paterno, apellido_materno, email')
      .eq('id', venta.persona_id)
      .maybeSingle(),
    venta.vendedor_usuario_id
      ? sb
          .schema('core')
          .from('usuarios')
          .select('first_name, last_name, email')
          .eq('id', venta.vendedor_usuario_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    sb
      .schema('dilesa')
      .from('unidades')
      .select('identificador, proyecto_id, manzana, numero_lote, producto_id')
      .eq('id', venta.unidad_id)
      .maybeSingle(),
  ]);

  const clienteNombre =
    [persona?.nombre, persona?.apellido_paterno, persona?.apellido_materno]
      .filter(Boolean)
      .join(' ') || '(sin nombre)';
  const vendedorNombre =
    [usuario?.first_name, usuario?.last_name].filter(Boolean).join(' ').trim() ||
    venta.vendedor ||
    null;

  let proyectoNombre = '';
  let prototipoSufijo: string | null = null;
  if (unidad?.proyecto_id) {
    const { data: proyecto } = await sb
      .schema('dilesa')
      .from('proyectos')
      .select('nombre')
      .eq('id', unidad.proyecto_id)
      .maybeSingle();
    proyectoNombre = proyecto?.nombre ?? '';
  }
  if (unidad?.producto_id) {
    const { data: producto } = await sb
      .schema('dilesa')
      .from('productos')
      .select('nombre')
      .eq('id', unidad.producto_id)
      .maybeSingle();
    prototipoSufijo = producto?.nombre ? (producto.nombre.split('-').pop() ?? null) : null;
  }

  return {
    ventaId: venta.id,
    empresaId: venta.empresa_id,
    vendedorEmail: usuario?.email ?? null,
    vendedorNombre,
    clienteEmail: persona?.email ?? null,
    clienteNombre,
    unidadIdentificador: unidad?.identificador ?? '(sin unidad)',
    proyectoNombre,
    manzana: unidad?.manzana ?? null,
    lote: unidad?.numero_lote ?? null,
    prototipo: prototipoSufijo,
    expiraAt: venta.expira_at ? new Date(venta.expira_at) : null,
  };
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = req.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getSupabaseAdminClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: 'Supabase admin env missing' }, { status: 500 });
  }

  const summary = {
    ok: true as const,
    expiradas: 0,
    promovidos: 0,
    warnings_4h: 0,
    creados_emails: 0,
    errors: [] as string[],
  };

  // ── 1. Marcar como expiradas (función SQL) ─────────────────────────────────
  const { data: expiradas, error: expErr } = await sb
    .schema('dilesa')
    .rpc('fn_expirar_ventas_vencidas');
  if (expErr) {
    return NextResponse.json(
      { ok: false, error: `fn_expirar_ventas_vencidas: ${expErr.message}` },
      { status: 500 }
    );
  }
  const expiradasList = (expiradas ?? []) as Array<{
    venta_id: string;
    unidad_id: string;
    persona_id: string;
    vendedor_usuario_id: string | null;
    empresa_id: string;
  }>;
  summary.expiradas = expiradasList.length;

  // ── 2. Email hold_expirada + 3. Promover siguiente ─────────────────────────
  for (const exp of expiradasList) {
    // Cargar row completa (necesitamos timestamps de idempotencia)
    const { data: vRow } = await sb
      .schema('dilesa')
      .from('ventas')
      .select(
        'id, empresa_id, unidad_id, persona_id, vendedor_usuario_id, vendedor, created_at, expira_at, estado, notif_hold_creado_at, notif_hold_promovido_at, notif_hold_4h_at, notif_hold_expirada_at'
      )
      .eq('id', exp.venta_id)
      .maybeSingle();
    if (!vRow) continue;
    const venta = vRow as unknown as VentaRow;

    if (!venta.notif_hold_expirada_at) {
      const ctx = await buildEmailContext(sb, venta);
      if (ctx) {
        const res = await sendHoldEmail('hold_expirada', ctx);
        if (res.ok) {
          await sb
            .schema('dilesa')
            .from('ventas')
            .update({ notif_hold_expirada_at: new Date().toISOString() })
            .eq('id', venta.id);
        } else if (res.error) {
          summary.errors.push(`expirada ${venta.id}: ${res.error}`);
        }
      }
    }

    // Buscar siguiente en la cola para esa unidad (próximo líder)
    const { data: cola } = await sb
      .schema('dilesa')
      .from('v_unidad_hold_queue')
      .select('venta_id, posicion, created_at, expira_at')
      .eq('unidad_id', exp.unidad_id)
      .order('posicion', { ascending: true })
      .limit(1);
    const proximo = (cola ?? [])[0] as ColaRow | undefined;
    if (!proximo) continue;

    // Promover: setear expira_at fresco (2 días hábiles desde ahora)
    const nuevoExpira = calcularExpiraAt(new Date());
    await sb
      .schema('dilesa')
      .from('ventas')
      .update({ expira_at: nuevoExpira.toISOString() })
      .eq('id', proximo.venta_id);

    // Email hold_promovido
    const { data: pRow } = await sb
      .schema('dilesa')
      .from('ventas')
      .select(
        'id, empresa_id, unidad_id, persona_id, vendedor_usuario_id, vendedor, created_at, expira_at, estado, notif_hold_creado_at, notif_hold_promovido_at, notif_hold_4h_at, notif_hold_expirada_at'
      )
      .eq('id', proximo.venta_id)
      .maybeSingle();
    if (!pRow) continue;
    const proxVenta = pRow as unknown as VentaRow;
    if (proxVenta.notif_hold_promovido_at) continue;

    const proxCtx = await buildEmailContext(sb, proxVenta);
    if (proxCtx) {
      const res = await sendHoldEmail('hold_promovido', proxCtx);
      if (res.ok) {
        await sb
          .schema('dilesa')
          .from('ventas')
          .update({ notif_hold_promovido_at: new Date().toISOString() })
          .eq('id', proxVenta.id);
        summary.promovidos++;
      } else if (res.error) {
        summary.errors.push(`promovido ${proxVenta.id}: ${res.error}`);
      }
    }
  }

  // ── 4. Email hold_creado para líderes nuevos (notif_hold_creado_at NULL) ───
  //     y 5. hold_4h_warning para líderes con < 4h restantes.
  //
  // Cargamos la cola completa y procesamos solo posición 1 (líderes).
  const { data: colaAll } = await sb
    .schema('dilesa')
    .from('v_unidad_hold_queue')
    .select('unidad_id, venta_id, posicion, created_at, expira_at');
  const lideres = ((colaAll ?? []) as ColaRow[]).filter((c) => c.posicion === 1);

  const ahoraMs = Date.now();
  for (const lider of lideres) {
    const { data: vRow } = await sb
      .schema('dilesa')
      .from('ventas')
      .select(
        'id, empresa_id, unidad_id, persona_id, vendedor_usuario_id, vendedor, created_at, expira_at, estado, notif_hold_creado_at, notif_hold_promovido_at, notif_hold_4h_at, notif_hold_expirada_at'
      )
      .eq('id', lider.venta_id)
      .maybeSingle();
    if (!vRow) continue;
    const venta = vRow as unknown as VentaRow;

    // 4. Email "hold_creado" si nunca se envió.
    if (!venta.notif_hold_creado_at) {
      const ctx = await buildEmailContext(sb, venta);
      if (ctx) {
        const res = await sendHoldEmail('hold_creado', ctx);
        if (res.ok) {
          await sb
            .schema('dilesa')
            .from('ventas')
            .update({ notif_hold_creado_at: new Date().toISOString() })
            .eq('id', venta.id);
          summary.creados_emails++;
        } else if (res.error) {
          summary.errors.push(`creado ${venta.id}: ${res.error}`);
        }
      }
    }

    // 5. Warning de 4h si aplica y no se envió.
    if (venta.expira_at && !venta.notif_hold_4h_at) {
      const restanteMs = new Date(venta.expira_at).getTime() - ahoraMs;
      if (restanteMs > 0 && restanteMs <= AVISO_HOLD_4H_MS) {
        const ctx = await buildEmailContext(sb, venta);
        if (ctx) {
          const res = await sendHoldEmail('hold_4h_warning', ctx);
          if (res.ok) {
            await sb
              .schema('dilesa')
              .from('ventas')
              .update({ notif_hold_4h_at: new Date().toISOString() })
              .eq('id', venta.id);
            summary.warnings_4h++;
          } else if (res.error) {
            summary.errors.push(`warning_4h ${venta.id}: ${res.error}`);
          }
        }
      }
    }
  }

  return NextResponse.json(summary);
}
