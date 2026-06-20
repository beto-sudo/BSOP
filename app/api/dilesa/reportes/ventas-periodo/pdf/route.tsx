/**
 * PDF del reporte «Ventas del periodo» (DILESA · Ventas) — ADR-047.
 * Fetch server (RLS) + mismos filtros que la vista (motor puro) + branding DILESA.
 */
import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { cargarVentasServer } from '@/lib/dilesa/reportes/ventas-data-server';
import { construirVentasPeriodo } from '@/lib/dilesa/reportes/ventas-periodo';
import {
  ReporteVentasPeriodoPDF,
  type VentasPeriodoPdfMeta,
} from '@/lib/dilesa/pdf/reporte-ventas-periodo';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const filtros = {
    desde: url.searchParams.get('desde') ?? '',
    hasta: url.searchParams.get('hasta') ?? '',
    proyecto: url.searchParams.get('proyecto') ?? '',
    vendedor: url.searchParams.get('vendedor') ?? '',
  };

  const { ventas, proyectoNombre, error } = await cargarVentasServer();
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const result = construirVentasPeriodo(ventas, filtros);

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
    filtros.proyecto
      ? `Proyecto: ${proyectoNombre.get(filtros.proyecto) ?? filtros.proyecto}`
      : null,
    filtros.vendedor ? `Vendedor: ${filtros.vendedor}` : null,
  ].filter(Boolean);

  const meta: VentasPeriodoPdfMeta = {
    fechaTexto: new Date().toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    filtrosTexto: partes.length > 0 ? partes.join(' · ') : 'Todas las ventas escrituradas',
  };

  const buf = await renderToBuffer(<ReporteVentasPeriodoPDF result={result} meta={meta} />);
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="ventas-del-periodo.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
