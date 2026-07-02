/**
 * PDF de la ficha comercial de un activo del portafolio (iniciativa
 * `dilesa-portafolio-predios` · S7). Sesión del usuario (RLS) — mismo
 * patrón que los PDFs de reportes (ADR-047).
 */
import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { cargarFichaActivo } from '@/lib/dilesa/ficha-activo-data';
import { FichaActivoPDF } from '@/lib/dilesa/pdf/ficha-activo';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createSupabaseServerClient();
  const r = await cargarFichaActivo(sb, id);
  if ('error' in r) {
    return NextResponse.json({ error: r.error }, { status: r.status });
  }

  const fechaTexto = new Date().toLocaleDateString('es-MX', {
    timeZone: 'America/Matamoros',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const buf = await renderToBuffer(<FichaActivoPDF ficha={r.ficha} fechaTexto={fechaTexto} />);
  const slug = r.ficha.nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="ficha-${slug}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
