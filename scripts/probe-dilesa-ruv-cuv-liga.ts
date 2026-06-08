/**
 * Sprint 0 (dilesa-ruv) — sonda de la liga CUV↔vivienda.
 *
 * Beto: la liga vive en la tabla Inventario `grid--AHYMPQI7Z`, columna
 * `c-16p9m_gEo5`. Esta sonda confirma:
 *   - nombre real de esa columna
 *   - cómo identifica cada fila a su unidad (para cruzar con dilesa.unidades)
 *   - cobertura: cuántas filas traen CUV
 *
 * Uso:
 *   CODA_API_TOKEN=$(op read "op://Infrastructure/CODA_API_KEY/credential") \
 *     npx tsx scripts/probe-dilesa-ruv-cuv-liga.ts
 */
import { CodaClient, type CodaRow } from '../lib/coda-api';

const CODA_DOC = 'ZNxWl_DI2D';
const INVENTARIO = 'grid--AHYMPQI7Z';
const CUV_COL = 'c-16p9m_gEo5';

async function main() {
  const token = process.env.CODA_API_TOKEN;
  if (!token) throw new Error('CODA_API_TOKEN env var requerida.');
  const coda = new CodaClient(token);

  const cols = await coda.listColumns(CODA_DOC, INVENTARIO);
  const cuvCol = cols.find((c) => c.id === CUV_COL);
  process.stderr.write(`Tabla Inventario: ${cols.length} columnas\n`);
  process.stderr.write(`Columna ${CUV_COL} = "${cuvCol?.name ?? '??? no encontrada'}"\n\n`);
  process.stderr.write(`Columnas:\n${cols.map((c) => `  - ${c.name} (${c.id})`).join('\n')}\n\n`);

  const rows = await coda.listRowsAll(CODA_DOC, INVENTARIO, { limit: 500 });
  process.stderr.write(`Filas leídas: ${rows.length}\n`);

  const withCuv = rows.filter((r) => {
    const v = (r.values as Record<string, unknown>)[CUV_COL];
    return v !== null && v !== undefined && v !== '';
  });
  const distinctCuv = new Set(
    withCuv.map((r) => String((r.values as Record<string, unknown>)[CUV_COL]))
  );
  process.stderr.write(
    `Filas con CUV no vacío: ${withCuv.length} (${distinctCuv.size} distintos)\n\n`
  );

  process.stderr.write('Muestras (name de fila → CUV):\n');
  for (const r of withCuv.slice(0, 12)) {
    const cuv = (r.values as Record<string, unknown>)[CUV_COL];
    process.stderr.write(`  ${r.name}  →  ${cuv}\n`);
  }

  // Muestra de fila completa (re-mapeada por nombre) para entender el identificador
  const colIdToName = new Map(cols.map((c) => [c.id, c.name]));
  const sample = withCuv[0] as CodaRow | undefined;
  if (sample) {
    const byName: Record<string, unknown> = {};
    for (const [cid, val] of Object.entries(sample.values as Record<string, unknown>)) {
      if (val !== null && val !== undefined && val !== '')
        byName[colIdToName.get(cid) ?? cid] = val;
    }
    process.stderr.write(
      `\nFila completa de muestra (no vacíos):\n${JSON.stringify(byName, null, 2)}\n`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
