/**
 * PDF del reporte «Productividad por vendedor» (DILESA · Ventas) — ADR-047.
 * Fetch server (RLS) + mismo filtro que la vista (motor puro) + branding DILESA.
 */
import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { cargarVentasServer } from '@/lib/dilesa/reportes/ventas-data-server';
import { construirProductividadVendedor } from '@/lib/dilesa/reportes/productividad-vendedor';
import {
  ReporteProductividadVendedorPDF,
  type ProductividadPdfMeta,
} from '@/lib/dilesa/pdf/reporte-productividad-vendedor';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const filtros = { proyecto: url.searchParams.get('proyecto') ?? '' };

  const { ventas, proyectoNombre, error } = await cargarVentasServer();
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const result = construirProductividadVendedor(ventas, filtros);

  const meta: ProductividadPdfMeta = {
    fechaTexto: new Date().toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    filtrosTexto: filtros.proyecto
      ? `Proyecto: ${proyectoNombre.get(filtros.proyecto) ?? filtros.proyecto}`
      : 'Todos los proyectos',
  };

  const buf = await renderToBuffer(<ReporteProductividadVendedorPDF result={result} meta={meta} />);
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="productividad-por-vendedor.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
