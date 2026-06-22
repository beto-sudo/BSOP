import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { getEffectiveUser } from '@/lib/auth/effective-user';
import { assertNotInPreview } from '@/lib/auth/preview-guard';
import { extraerReciboIA, mapExtraccionToUpdate } from '@/lib/sanren/recibo-extraccion';

// Lee con IA el PDF ya adjunto a un recibo (rol='recibo') y completa sus campos
// (sin pisar lo capturado). Lo llaman la UI al subir el recibo y el botón
// "Leer con IA". Admin-only + read-only guard, igual que la captura.
// Iniciativa sanren-servicios · Sprint 5.

interface SrRecibo {
  monto: number | null;
  lectura_consumo: number | null;
  lectura_produccion: number | null;
  folio: string | null;
}
interface SrTable {
  select: (c: string) => {
    eq: (
      col: string,
      v: string
    ) => {
      single: () => Promise<{ data: SrRecibo | null; error: { message: string } | null }>;
    };
  };
  update: (v: Record<string, unknown>) => {
    eq: (col: string, v: string) => Promise<{ error: { message: string } | null }>;
  };
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertNotInPreview();
    const supabase = await createSupabaseServerClient();
    const eu = await getEffectiveUser(supabase);
    if (!eu) return NextResponse.json({ ok: false, error: 'No autenticado.' }, { status: 401 });
    if (!eu.isAdmin) return NextResponse.json({ ok: false, error: 'Sin acceso.' }, { status: 403 });
    const admin = getSupabaseAdminClient();
    if (!admin)
      return NextResponse.json({ ok: false, error: 'Servicio no configurado.' }, { status: 500 });

    const { id } = await params;

    const { data: adj } = await admin
      .schema('erp')
      .from('adjuntos')
      .select('url, tipo_mime')
      .eq('entidad_tipo', 'recibo')
      .eq('entidad_id', id)
      .eq('rol', 'recibo')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!adj) {
      return NextResponse.json(
        { ok: false, error: 'El recibo no tiene PDF adjunto para leer.' },
        { status: 400 }
      );
    }

    const { data: blob, error: dlErr } = await admin.storage
      .from('adjuntos')
      .download(adj.url as string);
    if (dlErr || !blob) {
      return NextResponse.json(
        { ok: false, error: 'No se pudo descargar el adjunto.' },
        { status: 500 }
      );
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const data = await extraerReciboIA(bytes, (adj.tipo_mime as string) ?? 'application/pdf');

    const sr = admin.schema('sanren' as never) as unknown as { from: (t: string) => SrTable };
    const { data: recibo } = await sr
      .from('recibos')
      .select('monto, lectura_consumo, lectura_produccion, folio')
      .eq('id', id)
      .single();
    const patch = mapExtraccionToUpdate(
      data,
      {
        monto: recibo?.monto ?? null,
        lectura_consumo: recibo?.lectura_consumo ?? null,
        lectura_produccion: recibo?.lectura_produccion ?? null,
        folio: recibo?.folio ?? null,
      },
      new Date().toISOString()
    );
    const { error: upErr } = await sr.from('recibos').update(patch).eq('id', id);
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Error inesperado.' },
      { status: 500 }
    );
  }
}
