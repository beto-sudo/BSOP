/**
 * Sprint 0 (iniciativa `dilesa-ruv`) — deep-dive de las tablas RUV en Coda DILESA.
 *
 * NO migra data — solo describe estructura para confirmar D1 (schema preciso):
 *   - lista de columnas con tipo (format)
 *   - nulabilidad (% no-nulos) por columna
 *   - valores distintos por columna (candidatos a enum cuando #distintos es bajo)
 *   - 3 filas de muestra completas
 *   - conteo total real (rowCount de Coda)
 *
 * Urgencias RUV NO está aquí: es un reporte en canvas-Nu4e4FeF_d (varias tablas),
 * se arma después.
 *
 * Output: /tmp/dilesa-ruv-coda.json + resumen legible a stderr.
 *
 * Uso:
 *   CODA_API_TOKEN=$(op read "op://Infrastructure/CODA_API_KEY/credential") \
 *     npx tsx scripts/explore-dilesa-ruv-coda.ts
 */
import { writeFileSync } from 'node:fs';
import { CodaClient, type CodaRow } from '../lib/coda-api';

const CODA_DOC = 'ZNxWl_DI2D';

const TABLAS = [
  { slug: 'frente_ruv', tableId: 'grid-blmDCCczmb', nombre: 'Frente RUV' },
  { slug: 'cuv', tableId: 'grid-Z75H_uv0ZJ', nombre: 'CUV' },
  { slug: 'documentos_necesarios', tableId: 'grid-QmS5nK8G4f', nombre: 'Documentos Necesarios' },
];

/** Cap de valores distintos a listar antes de tratar la columna como "texto libre". */
const ENUM_CAP = 30;

interface ColSummary {
  name: string;
  format: string | null;
  nonNullPct: number;
  distinctCount: number;
  /** Si distinctCount <= ENUM_CAP: todos los valores. Si no: 3 ejemplos. */
  values: string[];
  isEnumCandidate: boolean;
}

function summarizeColumn(
  colName: string,
  format: string | null,
  rows: CodaRow[],
  colId: string
): ColSummary {
  const raw = rows.map((r) => (r.values as Record<string, unknown>)[colId]);
  const nonNull = raw.filter((v) => v !== null && v !== undefined && v !== '');
  const distinct = new Set(nonNull.map((v) => String(v)));
  const distinctCount = distinct.size;
  const isEnumCandidate = distinctCount > 0 && distinctCount <= ENUM_CAP;
  const values = isEnumCandidate
    ? [...distinct].sort()
    : [...distinct].slice(0, 3).map((v) => (v.length > 80 ? v.slice(0, 80) + '…' : v));
  return {
    name: colName,
    format,
    nonNullPct: rows.length ? Math.round((nonNull.length / rows.length) * 100) : 0,
    distinctCount,
    values,
    isEnumCandidate,
  };
}

async function main() {
  const token = process.env.CODA_API_TOKEN;
  if (!token) throw new Error('CODA_API_TOKEN env var requerida.');
  const coda = new CodaClient(token);

  const out: Record<string, unknown> = {};

  for (const t of TABLAS) {
    process.stderr.write(`\n▸ ${t.nombre} (${t.tableId})…\n`);
    try {
      const cols = await coda.listColumns(CODA_DOC, t.tableId);
      const rowCount = await coda.getTableRowCount(CODA_DOC, t.tableId);
      process.stderr.write(`  rowCount=${rowCount}, columnas=${cols.length} — paginando…\n`);
      // Paginar TODO: las tablas RUV no son enormes y queremos enums reales.
      const rows = await coda.listRowsAll(CODA_DOC, t.tableId, { limit: 500 });
      process.stderr.write(`  filas leídas: ${rows.length}\n`);

      const colIdToName = new Map(cols.map((c) => [c.id, c.name]));
      const colSummaries = cols.map((c) =>
        summarizeColumn(
          c.name,
          (c as unknown as { format?: { type?: string } }).format?.type ?? null,
          rows,
          c.id
        )
      );

      const sampleRows = rows.slice(0, 3).map((r) => {
        const valuesByName: Record<string, unknown> = {};
        for (const [colId, val] of Object.entries(r.values as Record<string, unknown>)) {
          valuesByName[colIdToName.get(colId) ?? colId] = val;
        }
        return { name: r.name, values: valuesByName };
      });

      out[t.slug] = {
        nombre: t.nombre,
        tableId: t.tableId,
        rowCount,
        rowsRead: rows.length,
        columns: colSummaries,
        sampleRows,
      };

      // Resumen legible a stderr
      for (const c of colSummaries) {
        const tag = c.isEnumCandidate ? `ENUM(${c.distinctCount})` : `${c.distinctCount} distinct`;
        const vals = c.isEnumCandidate
          ? ` → [${c.values.join(' | ')}]`
          : ` ej: ${c.values.join(' / ')}`;
        process.stderr.write(
          `    • ${c.name} [${c.format ?? '?'}] ${c.nonNullPct}% lleno, ${tag}${vals}\n`
        );
      }
    } catch (e) {
      out[t.slug] = { nombre: t.nombre, tableId: t.tableId, error: (e as Error).message };
      process.stderr.write(`  ✖ error: ${(e as Error).message}\n`);
    }
  }

  const path = '/tmp/dilesa-ruv-coda.json';
  writeFileSync(path, JSON.stringify(out, null, 2));
  process.stderr.write(`\n✔ Resumen completo guardado en ${path}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
