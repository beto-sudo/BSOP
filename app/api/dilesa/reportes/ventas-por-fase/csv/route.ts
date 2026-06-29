/**
 * CSV del reporte «Ventas por fase» (DILESA · Ventas) — ADR-047.
 * Fetch server (RLS) + mismos filtros que la vista (motor puro). Una fila por
 * registro de fase, columnas planas para cruzar en Excel.
 */
import { NextResponse } from 'next/server';
import { cargarVentasPorFaseServer } from '@/lib/dilesa/reportes/ventas-por-fase-data-server';
import { construirVentasPorFase } from '@/lib/dilesa/reportes/ventas-por-fase';
import { parseFiltrosVentasPorFase } from '@/lib/dilesa/reportes/ventas-por-fase-filtros';
import type { VentaFaseReporteRow } from '@/lib/dilesa/reportes/ventas-por-fase-data';

export const runtime = 'nodejs';

/** Escapa un campo CSV (comillas, comas, saltos de línea). */
function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADERS = [
  'Fecha',
  'Mes',
  'Fase',
  'Posición',
  'Cliente',
  'Unidad',
  'Proyecto',
  'Tipo de crédito',
  'Vendedor',
  'Fase actual',
  'Estado',
  'Valor',
] as const;

function fila(f: VentaFaseReporteRow): string {
  return [
    f.fecha,
    f.mes,
    f.faseNombre,
    f.posicion,
    f.cliente,
    f.unidadIdentificador ?? '',
    f.proyectoNombre,
    f.tipoCredito ?? '',
    f.vendedor ?? '',
    f.faseActualVenta ?? '',
    f.estadoVenta ?? '',
    f.valor.toFixed(2),
  ]
    .map(cell)
    .join(',');
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const filtros = parseFiltrosVentasPorFase(url.searchParams);

  const { filas, error } = await cargarVentasPorFaseServer();
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const result = construirVentasPorFase(filas, filtros);

  // BOM para que Excel respete acentos en UTF-8.
  const csv = ['﻿' + HEADERS.join(','), ...result.filas.map(fila)].join('\r\n');

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ventas-por-fase.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
