/**
 * PDF del reporte «Inventario disponible» (DILESA · Ventas) — ADR-047.
 * Fetch server (RLS) + mismos filtros que la vista (motor puro) + branding DILESA.
 */
import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { cargarInventarioServer } from '@/lib/dilesa/reportes/inventario-data-server';
import { construirInventarioDisponible } from '@/lib/dilesa/reportes/inventario-disponible';
import {
  ReporteInventarioDisponiblePDF,
  type InventarioPdfMeta,
} from '@/lib/dilesa/pdf/reporte-inventario-disponible';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const filtros = {
    proyecto: url.searchParams.get('proyecto') ?? '',
    prototipo: url.searchParams.get('prototipo') ?? '',
  };

  const { unidades, error } = await cargarInventarioServer();
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const result = construirInventarioDisponible(unidades, filtros);

  const partes = [
    filtros.proyecto ? `Proyecto: ${filtros.proyecto}` : null,
    filtros.prototipo ? `Prototipo: ${filtros.prototipo}` : null,
  ].filter(Boolean);

  const meta: InventarioPdfMeta = {
    fechaTexto: new Date().toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    filtrosTexto: partes.length > 0 ? partes.join(' · ') : 'Todo el inventario',
  };

  const buf = await renderToBuffer(<ReporteInventarioDisponiblePDF result={result} meta={meta} />);
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="inventario-disponible.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
