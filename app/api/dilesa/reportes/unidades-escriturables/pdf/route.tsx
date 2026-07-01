/**
 * PDF del reporte «Unidades escriturables» (DILESA · Ventas) — ADR-047.
 * Fetch server (RLS) + mismos filtros que la vista (motor puro) + branding DILESA.
 */
import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { cargarEscriturablesServer } from '@/lib/dilesa/reportes/escriturables-data-server';
import {
  construirUnidadesEscriturables,
  type FiltrosEscriturables,
} from '@/lib/dilesa/reportes/unidades-escriturables';
import {
  ReporteUnidadesEscriturablesPDF,
  type EscriturablesPdfMeta,
} from '@/lib/dilesa/pdf/reporte-unidades-escriturables';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const filtros: FiltrosEscriturables = {
    proyecto: url.searchParams.get('proyecto') ?? '',
    situacion: (url.searchParams.get('situacion') ?? '') as '' | 'inventario' | 'asignada',
    mostrar: url.searchParams.get('mostrar') === 'todas' ? 'todas' : 'escriturables',
  };

  const { unidades, error } = await cargarEscriturablesServer();
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const result = construirUnidadesEscriturables(unidades, filtros);

  const partes = [
    filtros.proyecto ? `Proyecto: ${filtros.proyecto}` : null,
    filtros.situacion === 'inventario'
      ? 'Solo inventario'
      : filtros.situacion === 'asignada'
        ? 'Solo asignadas'
        : null,
    filtros.mostrar === 'todas' ? 'Todas las candidatas' : 'Solo escriturables',
  ].filter(Boolean);

  const meta: EscriturablesPdfMeta = {
    fechaTexto: new Date().toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    filtrosTexto: partes.join(' · '),
  };

  const buf = await renderToBuffer(<ReporteUnidadesEscriturablesPDF result={result} meta={meta} />);
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="unidades-escriturables.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
