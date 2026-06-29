/**
 * PDF del reporte «Detonaciones / Depósitos» (DILESA · Ventas) — ADR-047.
 * Fetch server (RLS) + mismos filtros que la vista (motor puro) + branding DILESA.
 */
import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { cargarDepositosServer } from '@/lib/dilesa/reportes/detonaciones-data-server';
import { construirDetonaciones } from '@/lib/dilesa/reportes/detonaciones';
import {
  parseFiltrosDetonaciones,
  filtrosTextoDetonaciones,
} from '@/lib/dilesa/reportes/detonaciones-filtros';
import {
  ReporteDetonacionesPDF,
  type DetonacionesPdfMeta,
} from '@/lib/dilesa/pdf/reporte-detonaciones';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const filtros = parseFiltrosDetonaciones(url.searchParams);

  const { depositos, proyectoNombre, error } = await cargarDepositosServer();
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const result = construirDetonaciones(depositos, filtros);

  const meta: DetonacionesPdfMeta = {
    fechaTexto: new Date().toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    filtrosTexto: filtrosTextoDetonaciones(filtros, proyectoNombre),
  };

  const buf = await renderToBuffer(<ReporteDetonacionesPDF result={result} meta={meta} />);
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="depositos-periodo.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
