/**
 * PDF del reporte «Ventas estancadas» (DILESA · Ventas) — ADR-047.
 * Fetch server (vista en DB, RLS) + mismos filtros que la vista (motor puro).
 */
import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { cargarEstancadasServer } from '@/lib/dilesa/reportes/estancadas-data-server';
import { construirEstancadas, UMBRAL_ESTANCADA_DEFAULT } from '@/lib/dilesa/reportes/estancadas';
import { ReporteEstancadasPDF, type EstancadasPdfMeta } from '@/lib/dilesa/pdf/reporte-estancadas';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const filtros = {
    proyecto: url.searchParams.get('proyecto') ?? '',
    minDias: url.searchParams.get('minDias') ?? '',
  };

  const { filas, error } = await cargarEstancadasServer();
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const result = construirEstancadas(filas, filtros);

  const partes = [
    filtros.proyecto ? `Proyecto: ${filtros.proyecto}` : null,
    filtros.minDias ? `≥ ${filtros.minDias} días en fase` : null,
  ].filter(Boolean);

  const meta: EstancadasPdfMeta = {
    fechaTexto: new Date().toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    filtrosTexto: partes.length > 0 ? partes.join(' · ') : 'Todo el pipeline activo',
    umbral: UMBRAL_ESTANCADA_DEFAULT,
  };

  const buf = await renderToBuffer(<ReporteEstancadasPDF result={result} meta={meta} />);
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="ventas-estancadas.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
