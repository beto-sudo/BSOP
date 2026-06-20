/**
 * PDF del reporte «Ventas desasignadas» (DILESA · Ventas) — ADR-047.
 * Fetch server (RLS) + mismos filtros que la vista (motor puro) + branding DILESA.
 */
import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { cargarDesasignadasServer } from '@/lib/dilesa/reportes/desasignadas-data-server';
import {
  construirDesasignadas,
  type CategoriaDesasignacion,
} from '@/lib/dilesa/reportes/desasignadas';
import {
  ReporteDesasignadasPDF,
  type DesasignadasPdfMeta,
} from '@/lib/dilesa/pdf/reporte-desasignadas';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const categoria = (url.searchParams.get('categoria') ?? '') as '' | CategoriaDesasignacion;
  const filtros = {
    desde: url.searchParams.get('desde') ?? '',
    hasta: url.searchParams.get('hasta') ?? '',
    proyecto: url.searchParams.get('proyecto') ?? '',
    categoria,
  };

  const { filas, error } = await cargarDesasignadasServer();
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const result = construirDesasignadas(filas, filtros);

  const rango =
    filtros.desde && filtros.hasta
      ? `Del ${filtros.desde} al ${filtros.hasta}`
      : filtros.desde
        ? `Desde ${filtros.desde}`
        : filtros.hasta
          ? `Hasta ${filtros.hasta}`
          : null;
  const partes = [
    rango,
    filtros.proyecto ? `Proyecto: ${filtros.proyecto}` : null,
    filtros.categoria === 'baja'
      ? 'Solo bajas'
      : filtros.categoria === 'reubicacion'
        ? 'Solo reubicaciones'
        : null,
  ].filter(Boolean);

  const meta: DesasignadasPdfMeta = {
    fechaTexto: new Date().toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    filtrosTexto: partes.length > 0 ? partes.join(' · ') : 'Todas las desasignaciones',
  };

  const buf = await renderToBuffer(<ReporteDesasignadasPDF result={result} meta={meta} />);
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="ventas-desasignadas.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
