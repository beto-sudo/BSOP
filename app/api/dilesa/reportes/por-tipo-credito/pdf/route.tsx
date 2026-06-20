/**
 * PDF del reporte «Por tipo de crédito» (DILESA · Ventas) — ADR-047.
 * Fetch server (RLS) + mismo filtro que la vista (motor puro) + branding DILESA.
 */
import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { cargarVentasServer } from '@/lib/dilesa/reportes/ventas-data-server';
import { construirPorTipoCredito } from '@/lib/dilesa/reportes/por-tipo-credito';
import {
  ReportePorTipoCreditoPDF,
  type PorTipoCreditoPdfMeta,
} from '@/lib/dilesa/pdf/reporte-por-tipo-credito';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const filtros = { proyecto: url.searchParams.get('proyecto') ?? '' };

  const { ventas, proyectoNombre, error } = await cargarVentasServer();
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const result = construirPorTipoCredito(ventas, filtros);

  const meta: PorTipoCreditoPdfMeta = {
    fechaTexto: new Date().toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    filtrosTexto: filtros.proyecto
      ? `Proyecto: ${proyectoNombre.get(filtros.proyecto) ?? filtros.proyecto}`
      : 'Todos los proyectos',
  };

  const buf = await renderToBuffer(<ReportePorTipoCreditoPDF result={result} meta={meta} />);
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="por-tipo-credito.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
