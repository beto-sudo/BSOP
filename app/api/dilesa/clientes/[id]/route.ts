/**
 * PATCH /api/dilesa/clientes/[id] — edición de los datos de un cliente
 * (`erp.personas`).
 *
 * Autorización: SOLO Dirección/admin (`checkDireccionEmpresa`). El gate vive
 * aquí, no en la UI — la RLS de `erp.personas` permite UPDATE a cualquier
 * miembro autenticado de la empresa, así que la restricción "no cualquiera
 * mueve datos" se enforza server-side.
 *
 * Auditoría: cada edición deja una fila en `core.audit_log` con el antes/después
 * de cada campo cambiado (regla dura: trazabilidad siempre).
 *
 * Domicilio: al capturar el domicilio estructurado se limpia el blob histórico
 * de Coda (`erp.personas.domicilio`) para que la dirección corregida sea la
 * autoritativa en todos los documentos (FICU, promesa, detalle), que priorizan
 * el blob vía `domicilioTexto`.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import { checkDireccionEmpresa } from '@/lib/auth/direccion-gate';
import {
  normalizeClienteEdit,
  camposRequeridosVacios,
  diffClienteEdit,
  type ClienteEditInput,
  type ClienteEditCampo,
} from '@/lib/dilesa/cliente-edit';

type Params = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLS: ClienteEditCampo[] = [
  'nombre',
  'apellido_paterno',
  'apellido_materno',
  'curp',
  'rfc',
  'nss',
  'numero_credencial_ine',
  'fecha_nacimiento',
  'estado_civil',
  'nacionalidad',
  'tipo_persona',
  'email',
  'telefono',
  'domicilio_calle',
  'domicilio_numero_exterior',
  'domicilio_numero_interior',
  'domicilio_colonia',
  'domicilio_codigo_postal',
  'domicilio_ciudad',
  'domicilio_estado',
  'ocupacion',
  'es_pep',
  'forma_pago_kyc',
  'uso_efectivo_kyc',
  'conocimiento_dueno_beneficiario',
];

function primeraIp(forwarded: string | null): string | null {
  if (!forwarded) return null;
  const ip = forwarded.split(',')[0]?.trim();
  return ip && ip.length > 0 ? ip : null;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: 'Cliente inválido.' }, { status: 400 });
  }

  let raw: Partial<ClienteEditInput>;
  try {
    raw = (await req.json()) as Partial<ClienteEditInput>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const userSupa = await createSupabaseServerClient();
  const {
    data: { user },
  } = await userSupa.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'No autenticado.' }, { status: 401 });
  }

  // Gate: solo Dirección de DILESA o admin global.
  const gate = await checkDireccionEmpresa(userSupa, DILESA_EMPRESA_ID);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: 400 });
  }
  if (!gate.autorizado) {
    return NextResponse.json(
      { ok: false, error: 'Solo Dirección puede editar los datos del cliente.' },
      { status: 403 }
    );
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: 'Configuración de servidor incompleta.' },
      { status: 500 }
    );
  }

  // Fila actual (para validar empresa + armar el diff de auditoría).
  const { data: actualRow, error: loadErr } = await admin
    .schema('erp')
    .from('personas')
    .select([...COLS, 'domicilio', 'empresa_id'].join(', '))
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (loadErr) {
    return NextResponse.json(
      { ok: false, error: `No se pudo cargar el cliente: ${loadErr.message}` },
      { status: 500 }
    );
  }
  if (!actualRow) {
    return NextResponse.json({ ok: false, error: 'Cliente no encontrado.' }, { status: 404 });
  }
  const actual = actualRow as unknown as Record<string, string | boolean | null>;
  if (actual.empresa_id !== DILESA_EMPRESA_ID) {
    return NextResponse.json({ ok: false, error: 'El cliente no es de DILESA.' }, { status: 403 });
  }

  // Reconstruir el input completo desde el body (defaults a lo actual si falta).
  const input = {} as ClienteEditInput;
  for (const col of COLS) {
    if (col === 'es_pep') {
      input.es_pep = typeof raw.es_pep === 'boolean' ? raw.es_pep : Boolean(actual.es_pep);
    } else {
      const v = raw[col];
      input[col] = typeof v === 'string' ? v : ((actual[col] as string | null) ?? '');
    }
  }

  const normalizado = normalizeClienteEdit(input);

  const faltanReq = camposRequeridosVacios(normalizado);
  if (faltanReq.length > 0) {
    return NextResponse.json(
      { ok: false, error: `Campos obligatorios vacíos: ${faltanReq.join(', ')}.` },
      { status: 400 }
    );
  }

  const { anteriores, nuevos } = diffClienteEdit(actual, normalizado);

  // Estructurar el domicilio: si se capturó la calle, el blob de Coda deja de
  // ser la fuente para que los documentos tomen la dirección corregida.
  const blobActual = (actual.domicilio as string | null) ?? null;
  if (normalizado.domicilio_calle != null && blobActual != null) {
    nuevos.domicilio = null;
    anteriores.domicilio = blobActual;
  }

  if (Object.keys(nuevos).length === 0) {
    return NextResponse.json({ ok: true, cambios: 0 });
  }

  const { error: updErr } = await admin
    .schema('erp')
    .from('personas')
    .update({ ...nuevos, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (updErr) {
    return NextResponse.json(
      { ok: false, error: `No se pudo guardar: ${updErr.message}` },
      { status: 500 }
    );
  }

  await admin
    .schema('core')
    .from('audit_log')
    .insert({
      empresa_id: DILESA_EMPRESA_ID,
      usuario_id: user.id,
      accion: 'cliente_editado',
      tabla: 'erp.personas',
      registro_id: id,
      datos_anteriores: anteriores,
      datos_nuevos: nuevos,
      ip_origen: primeraIp(req.headers.get('x-forwarded-for')),
      user_agent: req.headers.get('user-agent'),
    });

  return NextResponse.json({ ok: true, cambios: Object.keys(nuevos).length });
}
