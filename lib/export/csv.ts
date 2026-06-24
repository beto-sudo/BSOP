/**
 * Export a CSV — helper compartido para bajar la lista filtrada de un módulo.
 *
 * Iniciativa `dilesa-compras-operacion` · Sprint 1. El repo no tenía ninguna
 * salida de datos (ni CSV ni Excel); este helper cubre el caso común "exporta lo
 * que estoy viendo". CSV plano (Excel lo abre nativo) con BOM UTF-8 para que los
 * acentos no se rompan al abrirlo en Excel.
 *
 * `toCsv` es PURO (testeable); `downloadCsv` toca el DOM (solo browser).
 */

/** Tipos que sabemos serializar a una celda CSV. */
export type CsvCell = string | number | boolean | null | undefined;

/** Escapa una celda: envuelve en comillas si trae coma, comilla o salto de línea. */
function escapeCell(value: CsvCell): string {
  if (value == null) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Arma el texto CSV desde encabezados + filas. Las celdas se escapan; las filas
 * se separan con CRLF (lo que Excel espera). No incluye BOM — eso lo agrega
 * `downloadCsv` al crear el blob.
 */
export function toCsv(headers: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) lines.push(row.map(escapeCell).join(','));
  return lines.join('\r\n');
}

/**
 * Dispara la descarga de un CSV en el browser. Antepone un BOM UTF-8 para que
 * Excel respete los acentos. `filename` puede venir con o sin `.csv`.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
