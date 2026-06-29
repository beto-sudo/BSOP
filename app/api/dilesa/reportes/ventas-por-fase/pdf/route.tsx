/**
 * PDF del reporte «Ventas por fase» (DILESA · Ventas) — ADR-047.
 * Fetch server (RLS) + mismos filtros que la vista (motor puro) + branding DILESA.
 */
import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { cargarVentasPorFaseServer } from '@/lib/dilesa/reportes/ventas-por-fase-data-server';
import { construirVentasPorFase } from '@/lib/dilesa/reportes/ventas-por-fase';
import {
  parseFiltrosVentasPorFase,
  filtrosTextoVentasPorFase,
} from '@/lib/dilesa/reportes/ventas-por-fase-filtros';
import {
  ReporteVentasPorFasePDF,
  type VentasPorFasePdfMeta,
} from '@/lib/dilesa/pdf/reporte-ventas-por-fase';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const filtros = parseFiltrosVentasPorFase(url.searchParams);

  const { filas, proyectoNombre, error } = await cargarVentasPorFaseServer();
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const result = construirVentasPorFase(filas, filtros);

  const meta: VentasPorFasePdfMeta = {
    fechaTexto: new Date().toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    filtrosTexto: filtrosTextoVentasPorFase(filtros, proyectoNombre),
  };

  const buf = await renderToBuffer(<ReporteVentasPorFasePDF result={result} meta={meta} />);
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="ventas-por-fase.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
