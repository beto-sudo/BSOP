/**
 * CSV del reporte «Detonaciones / Depósitos» (DILESA · Ventas) — ADR-047.
 * Fetch server (RLS) + mismos filtros que la vista (motor puro). Una fila por
 * depósito (ligados + sin ligar), columnas planas para cruzar en Excel.
 */
import { NextResponse } from 'next/server';
import { cargarDepositosServer } from '@/lib/dilesa/reportes/detonaciones-data-server';
import { construirDetonaciones } from '@/lib/dilesa/reportes/detonaciones';
import { parseFiltrosDetonaciones } from '@/lib/dilesa/reportes/detonaciones-filtros';
import { etiquetaFuente, type DepositoReporteRow } from '@/lib/dilesa/reportes/detonaciones-data';

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
  'Origen',
  'Cliente',
  'Unidad',
  'Proyecto',
  'Tipo de crédito',
  'Forma de pago',
  'Referencia',
  'Cuenta bancaria',
  'UUID SAT',
  'Venta detonada',
  'Monto',
] as const;

function fila(d: DepositoReporteRow): string {
  return [
    d.fecha,
    d.mes,
    etiquetaFuente(d.fuente),
    d.cliente,
    d.unidadIdentificador ?? '',
    d.proyectoNombre,
    d.tipoCredito ?? '',
    d.formaPago ?? '',
    d.referencia ?? '',
    d.cuentaBancaria ?? '',
    d.uuidSat ?? '',
    d.ventaDetonada ? 'Sí' : 'No',
    d.monto.toFixed(2),
  ]
    .map(cell)
    .join(',');
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const filtros = parseFiltrosDetonaciones(url.searchParams);

  const { depositos, error } = await cargarDepositosServer();
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const result = construirDetonaciones(depositos, filtros);
  const rows = [...result.depositos, ...result.sinLigar];

  // BOM para que Excel respete acentos en UTF-8.
  const csv = ['﻿' + HEADERS.join(','), ...rows.map(fila)].join('\r\n');

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="detonaciones-depositos.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
