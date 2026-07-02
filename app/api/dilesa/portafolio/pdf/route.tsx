/**
 * PDF del listado del inventario del portafolio (iniciativa
 * `dilesa-portafolio-predios`). Sesión del usuario (RLS), mismos filtros y
 * exclusiones que la lista (sin prospectos/descartados ni caras).
 */
import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { DILESA_EMPRESA_ID } from '@/lib/empresa-constants';
import {
  PortafolioListadoPDF,
  type PortafolioListadoRow,
} from '@/lib/dilesa/pdf/portafolio-listado';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const f = {
    tipo: url.searchParams.get('tipo') ?? '',
    estado: url.searchParams.get('estado') ?? '',
    destino: url.searchParams.get('destino') ?? '',
    municipio: url.searchParams.get('municipio') ?? '',
    zona: url.searchParams.get('zona') ?? '',
    q: (url.searchParams.get('q') ?? '').trim().toLowerCase(),
  };

  const sb = await createSupabaseServerClient();
  const { data, error } = await sb
    .schema('dilesa')
    .from('activos')
    .select(
      'nombre, tipo, estado, etiqueta, zona, municipio, area_m2, valor_estimado, destino:portafolio_destinos(label)'
    )
    .eq('empresa_id', DILESA_EMPRESA_ID)
    .is('deleted_at', null)
    .not('estado', 'in', '(prospecto,descartado)')
    .neq('tipo', 'cara')
    .order('nombre');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows: PortafolioListadoRow[] = (data ?? [])
    .map((a) => ({
      nombre: a.nombre as string,
      tipo: a.tipo as string,
      estado: a.estado as string,
      etiqueta: a.etiqueta as string | null,
      zona: a.zona as string | null,
      municipio: a.municipio as string | null,
      area_m2: a.area_m2 as number | null,
      valor_estimado: a.valor_estimado as number | null,
      destino: (a.destino as unknown as { label: string } | null)?.label ?? null,
    }))
    .filter((r) => {
      if (f.tipo && r.tipo !== f.tipo) return false;
      if (f.estado && r.estado !== f.estado) return false;
      if (f.destino && (r.destino ?? '') !== f.destino) return false;
      if (f.municipio && (r.municipio ?? '') !== f.municipio) return false;
      if (f.zona && (r.zona ?? '') !== f.zona) return false;
      if (
        f.q &&
        !r.nombre.toLowerCase().includes(f.q) &&
        !(r.etiqueta ?? '').toLowerCase().includes(f.q)
      ) {
        return false;
      }
      return true;
    });

  const fechaTexto = new Date().toLocaleDateString('es-MX', {
    timeZone: 'America/Matamoros',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const filtros = [
    f.tipo ? `Tipo: ${f.tipo}` : null,
    f.estado ? `Estado: ${f.estado}` : null,
    f.destino ? `Destino: ${f.destino}` : null,
    f.zona ? `Zona: ${f.zona}` : null,
    f.municipio ? `Municipio: ${f.municipio}` : null,
    f.q ? `Búsqueda: "${f.q}"` : null,
  ].filter(Boolean);
  const filtrosTexto =
    filtros.length > 0 ? filtros.join(' · ') : 'Inventario completo del portafolio';

  const buf = await renderToBuffer(
    <PortafolioListadoPDF rows={rows} fechaTexto={fechaTexto} filtrosTexto={filtrosTexto} />
  );
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="portafolio-dilesa.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
