/**
 * dl_coda_solicitud_pdfs.ts (throwaway / one-shot)
 *
 * Baja los PDFs de "Solicitud de Asignación" (columna Coda c-j4ZhKyzB8g,
 * tabla Clientes grid-mMIXWCSfyr) de los row ids dados a /tmp/coda_solicitudes/.
 *
 * Uso: npx tsx --env-file=.env.local scripts/dl_coda_solicitud_pdfs.ts <rowId> [<rowId> ...]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { CodaClient } from '../lib/coda-api';

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const CODA_DOC = 'ZNxWl_DI2D';
const CODA_CLIENTES = 'grid-mMIXWCSfyr';
const PDF_COL = 'c-j4ZhKyzB8g';

async function main() {
  if (!CODA_API_KEY) throw new Error('Falta CODA_API_KEY');
  const ids = process.argv.slice(2);
  if (ids.length === 0) throw new Error('Pasa al menos un rowId');
  const coda = new CodaClient(CODA_API_KEY);
  mkdirSync('/tmp/coda_solicitudes', { recursive: true });
  const rows = await coda.listRowsAll(CODA_DOC, CODA_CLIENTES, { valueFormat: 'rich' });
  const wanted = new Set(ids);
  let ok = 0;
  for (const row of rows) {
    if (!wanted.has(row.id)) continue;
    const val = row.values[PDF_COL] as unknown;
    const o = Array.isArray(val)
      ? (val[0] as Record<string, unknown>)
      : (val as Record<string, unknown>);
    const url = (o?.url ?? o?.publicUrl) as string | undefined;
    if (!url) {
      console.log(`✗ ${row.id} (${row.name}): sin URL`);
      continue;
    }
    const res = await fetch(url, { headers: { Authorization: `Bearer ${CODA_API_KEY}` } });
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(`/tmp/coda_solicitudes/${row.id}.pdf`, buf);
    ok++;
  }
  console.log(`Bajados ${ok}/${ids.length} PDFs → /tmp/coda_solicitudes/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
