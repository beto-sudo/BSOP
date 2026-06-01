/**
 * import_dilesa_lotes_ampliacion.ts
 *
 * Carga el desglose de lotes del desarrollo "Ampliación Lomas de los
 * Encinos" en `dilesa.unidades`, derivado del Cuadro de Áreas Manzanero
 * del plano oficial aprobado (PDF en `dilesa.proyecto_planos`).
 *
 * Extraído por visión del cuadro renderizado a 400-500 DPI y VALIDADO
 * contra los 20 totales de columna impresos (checksum exacto): 358 lotes
 * (354 habitacionales + 4 municipales), 51,344.36 m². Las manzanas son
 * 19, 23-41 (continúan la numeración de "Lomas de los Encinos").
 *
 * Mismo formato que Delicias: identificador `M{mz}-L{lote}`, estado
 * `planeada`, municipales con `tipo_lote='municipal'`.
 *
 * Idempotente: aborta si el desarrollo ya tiene unidades.
 * Uso:
 *   DRY_RUN=1 npx tsx --env-file=/Users/Beto/BSOP/.env.local scripts/import_dilesa_lotes_ampliacion.ts
 *   npx tsx --env-file=/Users/Beto/BSOP/.env.local scripts/import_dilesa_lotes_ampliacion.ts
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');

const PROYECTO_NOMBRE = 'Ampliación Lomas de los Encinos';

// Definición compacta: manzana -> { rango lotes [inicio,fin], overrides (≠120) }.
// Lo no listado en overrides es 120.00.
type Def = { rango: [number, number]; ov: Record<number, number> };
const MZ: Record<number, Def> = {
  19: { rango: [1, 20], ov: { 1: 197.08 } },
  23: {
    rango: [34, 41],
    ov: { 35: 120.26, 36: 120.7, 37: 121.15, 38: 121.59, 39: 122.03, 40: 122.48, 41: 134.86 },
  },
  24: { rango: [1, 43], ov: { 1: 170.57, 21: 164.26, 22: 132.77, 43: 161.8 } },
  25: { rango: [1, 34], ov: { 1: 175.58, 16: 186.84, 17: 155.35, 34: 166.75 } },
  26: { rango: [1, 24], ov: { 1: 175.58, 11: 214.43, 12: 182.94, 24: 166.75 } },
  27: { rango: [1, 1], ov: { 1: 1565.13 } }, // municipal
  28: { rango: [1, 26], ov: { 1: 171.42, 2: 127.26, 3: 120.04, 17: 167.28, 18: 153.18 } },
  29: { rango: [1, 15], ov: { 15: 214.05 } },
  30: { rango: [1, 30], ov: { 1: 125.26, 16: 162.3, 17: 130.82, 30: 156.74 } },
  31: { rango: [1, 30], ov: { 1: 125.26, 16: 162.3, 17: 130.82, 30: 156.74 } },
  32: { rango: [1, 30], ov: { 1: 125.26, 16: 162.3, 17: 130.82, 30: 156.74 } },
  33: { rango: [1, 30], ov: { 1: 125.26, 16: 162.3, 17: 130.82, 30: 156.74 } },
  34: { rango: [1, 1], ov: { 1: 1407.28 } }, // municipal
  35: { rango: [1, 14], ov: { 14: 133.36 } },
  36: { rango: [1, 1], ov: { 1: 3545.67 } }, // municipal
  37: { rango: [1, 10], ov: { 1: 125.3, 5: 182.31, 6: 195.63, 10: 156.78 } },
  38: { rango: [1, 12], ov: { 1: 125.3, 6: 190.76, 7: 204.08, 12: 156.78 } },
  39: { rango: [1, 14], ov: { 1: 125.3, 7: 199.21, 8: 212.53, 14: 156.78 } },
  40: { rango: [1, 14], ov: { 1: 125.3, 8: 207.66, 9: 248.88, 14: 156.78 } },
  41: { rango: [1, 1], ov: { 1: 156.04 } }, // municipal
};
const TOTALES_COL: Record<number, number> = {
  19: 2477.08,
  23: 983.08,
  24: 5309.4,
  25: 4284.52,
  26: 3139.7,
  27: 1565.13,
  28: 3259.18,
  29: 1894.05,
  30: 3695.12,
  31: 3695.12,
  32: 3695.12,
  33: 3695.12,
  34: 1407.28,
  35: 1693.36,
  36: 3545.67,
  37: 1380.02,
  38: 1636.92,
  39: 1893.82,
  40: 1938.62,
  41: 156.04,
};
const MUNICIPALES = new Set(['27-1', '34-1', '36-1', '41-1']);

function areaDe(mz: number, lote: number): number {
  return MZ[mz].ov[lote] ?? 120;
}
function* lotesDe(mz: number): Generator<number> {
  const [a, b] = MZ[mz].rango;
  for (let l = a; l <= b; l++) yield l;
}

function validar(): { ok: boolean; total: number; area: number } {
  let ok = true;
  for (const mzStr of Object.keys(MZ)) {
    const mz = Number(mzStr);
    let suma = 0;
    for (const l of lotesDe(mz)) suma += areaDe(mz, l);
    if (Math.abs(suma - TOTALES_COL[mz]) >= 0.05) {
      console.error(`  ✗ Mz${mz}: suma ${suma.toFixed(2)} ≠ total ${TOTALES_COL[mz]}`);
      ok = false;
    }
  }
  let total = 0;
  let area = 0;
  for (const mzStr of Object.keys(MZ)) {
    const mz = Number(mzStr);
    for (const l of lotesDe(mz)) {
      total++;
      area += areaDe(mz, l);
    }
  }
  return { ok, total, area: Math.round(area * 100) / 100 };
}

async function main() {
  const v = validar();
  if (!v.ok) throw new Error('Validación de matriz falló — revisar transcripción.');
  console.log(
    `Matriz validada: ${v.total} lotes, ${v.area.toFixed(2)} m² (checksum por columna OK).`
  );
  if (v.total !== 358) throw new Error(`Esperaba 358 lotes, hay ${v.total}.`);

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: emp } = await sb
    .schema('core')
    .from('empresas')
    .select('id')
    .eq('slug', 'dilesa')
    .single();
  const empresaId = (emp as { id: string }).id;

  const { data: proy, error: pErr } = await sb
    .schema('dilesa')
    .from('proyectos')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('nombre', PROYECTO_NOMBRE)
    .eq('tipo', 'desarrollo')
    .is('deleted_at', null)
    .single();
  if (pErr || !proy) throw new Error(`No se encontró el desarrollo "${PROYECTO_NOMBRE}".`);
  const proyectoId = (proy as { id: string }).id;

  const { count } = await sb
    .schema('dilesa')
    .from('unidades')
    .select('id', { count: 'exact', head: true })
    .eq('proyecto_id', proyectoId)
    .is('deleted_at', null);
  if ((count ?? 0) > 0) {
    throw new Error(`El desarrollo ya tiene ${count} unidades. Abortando para no duplicar.`);
  }

  const rows: Record<string, unknown>[] = [];
  for (const mzStr of Object.keys(MZ)) {
    const mz = Number(mzStr);
    for (const lote of lotesDe(mz)) {
      const muni = MUNICIPALES.has(`${mz}-${lote}`);
      rows.push({
        empresa_id: empresaId,
        proyecto_id: proyectoId,
        identificador: `M${mz}-L${lote}`,
        manzana: String(mz),
        numero_lote: String(lote),
        area_m2: areaDe(mz, lote),
        estado: 'planeada',
        tipo_lote: muni ? 'municipal' : 'habitacional',
      });
    }
  }

  console.log(
    `${DRY_RUN ? '[DRY_RUN] ' : ''}${rows.length} unidades a crear ` +
      `(${rows.filter((r) => r.tipo_lote === 'municipal').length} municipales) en "${PROYECTO_NOMBRE}".`
  );
  if (DRY_RUN) {
    console.log('Muestra:', rows.slice(0, 2), '…', rows.slice(-2));
    return;
  }

  const { error: insErr, count: insCount } = await sb
    .schema('dilesa')
    .from('unidades')
    .insert(rows, { count: 'exact' });
  if (insErr) throw new Error(`Insert falló: ${insErr.message}`);
  console.log(`✓ ${insCount ?? rows.length} unidades creadas en "${PROYECTO_NOMBRE}".`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
