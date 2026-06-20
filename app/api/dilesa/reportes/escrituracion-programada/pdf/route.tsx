/**
 * PDF del reporte «Escrituración programada» (DILESA · Ventas) — ADR-047.
 * Fetch server (RLS) + mismos filtros que la vista (motor puro) + branding DILESA.
 */
import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { cargarVentasServer } from '@/lib/dilesa/reportes/ventas-data-server';
import { construirEscrituracionProgramada } from '@/lib/dilesa/reportes/escrituracion-programada';
import {
  ReporteEscrituracionProgramadaPDF,
  type EscrituracionProgramadaPdfMeta,
} from '@/lib/dilesa/pdf/reporte-escrituracion-programada';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const filtros = {
    desde: url.searchParams.get('desde') ?? '',
    hasta: url.searchParams.get('hasta') ?? '',
    proyecto: url.searchParams.get('proyecto') ?? '',
  };

  const { ventas, proyectoNombre, error } = await cargarVentasServer();
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const result = construirEscrituracionProgramada(ventas, filtros);

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
  ].filter(Boolean);

  const meta: EscrituracionProgramadaPdfMeta = {
    fechaTexto: new Date().toLocaleDateString('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    filtrosTexto: partes.length > 0 ? partes.join(' · ') : 'Todas las firmas agendadas',
  };

  const buf = await renderToBuffer(
    <ReporteEscrituracionProgramadaPDF result={result} meta={meta} />
  );
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="escrituracion-programada.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
