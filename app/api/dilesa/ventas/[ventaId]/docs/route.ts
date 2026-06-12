/**
 * GET /api/dilesa/ventas/[ventaId]/docs?roles=factura,nota_credito,aviso_pld
 *
 * Documentos del expediente de una venta (erp.adjuntos, entidad_tipo='venta')
 * para los roles pedidos, con `subidoPorNombre` resuelto server-side —
 * `core.usuarios` es RLS self-only, así que el "subido por" de terceros no
 * puede resolverse desde el browser (iniciativa
 * `dilesa-ventas-captura-colaborativa`, Sprint 1).
 *
 * Auth: sesión requerida + miembro activo de DILESA o admin global (mismo
 * gate que el upload de XML de CxP).
 */

import { NextResponse, type NextRequest } from 'next/server';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import type { DocFase } from '@/lib/dilesa/captura/docs-fase';

type Params = { params: Promise<{ ventaId: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROL_RE = /^[a-z0-9_]+$/;

export async function GET(req: NextRequest, { params }: Params) {
  const { ventaId } = await params;
  if (!UUID_RE.test(ventaId)) {
    return NextResponse.json({ ok: false, error: 'Venta inválida.' }, { status: 400 });
  }

  const roles = (req.nextUrl.searchParams.get('roles') ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r.length > 0 && ROL_RE.test(r));
  if (roles.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'Indica al menos un rol de documento.' },
      { status: 400 }
    );
  }

  const userSupa = await createSupabaseServerClient();
  const {
    data: { user },
  } = await userSupa.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'No autenticado.' }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: 'Configuración de servidor incompleta.' },
      { status: 500 }
    );
  }

  // Miembro activo de DILESA o admin global.
  const [{ data: u }, { data: mem }] = await Promise.all([
    admin.schema('core').from('usuarios').select('rol').eq('id', user.id).maybeSingle(),
    admin
      .schema('core')
      .from('usuarios_empresas')
      .select('usuario_id')
      .eq('usuario_id', user.id)
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .eq('activo', true)
      .maybeSingle(),
  ]);
  if (!mem && u?.rol !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Sin acceso a DILESA.' }, { status: 403 });
  }

  const { data: rows, error: adjErr } = await admin
    .schema('erp')
    .from('adjuntos')
    .select('id, rol, nombre, url, tipo_mime, tamano_bytes, uploaded_by, created_at')
    .eq('empresa_id', DILESA_EMPRESA_ID)
    .eq('entidad_tipo', 'venta')
    .eq('entidad_id', ventaId)
    .in('rol', roles)
    .order('created_at', { ascending: false });
  if (adjErr) {
    return NextResponse.json(
      { ok: false, error: 'No se pudieron leer los documentos.' },
      { status: 500 }
    );
  }

  type Row = {
    id: string;
    rol: string;
    nombre: string;
    url: string;
    tipo_mime: string | null;
    tamano_bytes: number | null;
    uploaded_by: string | null;
    created_at: string;
  };
  const adjuntos = (rows ?? []) as Row[];

  // Nombres de quienes subieron (admin client — RLS self-only en usuarios).
  const uploaderIds = [
    ...new Set(adjuntos.map((a) => a.uploaded_by).filter((x): x is string => !!x)),
  ];
  const nombrePorId = new Map<string, string>();
  if (uploaderIds.length > 0) {
    const { data: usuarios } = await admin
      .schema('core')
      .from('usuarios')
      .select('id, first_name, last_name, email')
      .in('id', uploaderIds);
    for (const usr of (usuarios ?? []) as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    }[]) {
      const completo = [usr.first_name, usr.last_name].filter(Boolean).join(' ').trim();
      nombrePorId.set(usr.id, completo || usr.email || '');
    }
  }

  const docs: DocFase[] = adjuntos.map((a) => ({
    id: a.id,
    rol: a.rol,
    nombre: a.nombre,
    url: a.url,
    tipoMime: a.tipo_mime,
    tamanoBytes: a.tamano_bytes == null ? null : Number(a.tamano_bytes),
    subidoPor: a.uploaded_by,
    subidoPorNombre: a.uploaded_by ? (nombrePorId.get(a.uploaded_by) ?? null) : null,
    subidoAt: a.created_at,
  }));

  return NextResponse.json({ ok: true, docs });
}
