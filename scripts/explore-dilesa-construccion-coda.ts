/**
 * Exploración de las 8 tablas del módulo Construcción en Coda DILESA.
 *
 * NO migra data — solo describe estructura:
 *   - lista de columnas con tipo
 *   - 3 filas de muestra
 *   - conteo total
 *
 * Output: /tmp/dilesa-construccion-coda.json
 *
 * Uso:
 *   CODA_API_TOKEN=$(op read "op://Infrastructure/CODA_API_TOKEN/credential") \
 *     npx tsx scripts/explore-dilesa-construccion-coda.ts
 */
import { writeFileSync } from 'node:fs';
import { CodaClient, type CodaRow } from '../lib/coda-api';

const CODA_DOC = 'ZNxWl_DI2D';

const TABLAS = [
  { slug: 'prototipos', tableId: 'grid-iGIRvYfGUx', nombre: 'Prototipos' },
  { slug: 'contratistas', tableId: 'grid-b-HTXuSZp4', nombre: 'Contratistas' },
  { slug: 'etapas_construccion', tableId: 'grid-CThW1hcfYn', nombre: 'Etapas de Construcción' },
  { slug: 'tareas_construccion', tableId: 'grid-w2cUreZ1mG', nombre: 'Tareas de Construcción' },
  {
    slug: 'plantilla_tareas',
    tableId: 'grid-ger9cXNCKh',
    nombre: 'Plantilla Tareas de Construcción Prototipos',
  },
  { slug: 'contrato_construccion', tableId: 'grid-OWReJ19erT', nombre: 'Contrato de Construcción' },
  {
    slug: 'construccion_por_lote',
    tableId: 'grid-CkajhVirlg',
    nombre: 'Construcción por Lote',
  },
  {
    slug: 'tareas_terminadas',
    tableId: 'grid-fJSixLw1DF',
    nombre: 'Tareas de Construcción Terminadas',
  },
];

async function main() {
  const token = process.env.CODA_API_TOKEN;
  if (!token) throw new Error('CODA_API_TOKEN env var requerida.');
  const coda = new CodaClient(token);

  const out: Record<string, unknown> = {};

  for (const t of TABLAS) {
    process.stderr.write(`▸ ${t.nombre} (${t.tableId})…\n`);
    try {
      const cols = await coda.listColumns(CODA_DOC, t.tableId);
      // Solo primera página (5 filas) — listRowsAll pagina TODO y demora muchísimo
      // en tablas grandes (ej. Tareas Terminadas).
      const firstPage = await coda.get<{ items: CodaRow[] }>(
        `/docs/${CODA_DOC}/tables/${t.tableId}/rows?limit=5&valueFormat=simple`
      );
      const rows = firstPage.items;
      // Re-mapear values usando los nombres de columnas (en lugar de IDs c-XXX)
      const colIdToName = new Map(cols.map((c) => [c.id, c.name]));
      const sampleRows = rows.slice(0, 3).map((r) => {
        const valuesByName: Record<string, unknown> = {};
        for (const [colId, val] of Object.entries(r.values as Record<string, unknown>)) {
          valuesByName[colIdToName.get(colId) ?? colId] = val;
        }
        return { name: r.name, values: valuesByName };
      });
      // También pido el conteo total con un query separado mínimo
      out[t.slug] = {
        nombre: t.nombre,
        tableId: t.tableId,
        sampledRows: rows.length,
        columns: cols.map((c) => ({
          name: c.name,
          // CodaColumn no expone tipo a través del listColumns base, pero
          // si está disponible en `format`, lo guardamos
          format: (c as unknown as { format?: { type?: string } }).format?.type ?? null,
        })),
        sampleRows,
      };
    } catch (e) {
      out[t.slug] = { nombre: t.nombre, tableId: t.tableId, error: (e as Error).message };
    }
  }

  const path = '/tmp/dilesa-construccion-coda.json';
  writeFileSync(path, JSON.stringify(out, null, 2));
  process.stderr.write(`\n✔ Resumen guardado en ${path}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
