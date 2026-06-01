/**
 * import_dilesa_lotes_delicias.ts
 *
 * Carga el desglose de lotes del desarrollo "Lomas de las Delicias" en
 * `dilesa.unidades`, derivado del Cuadro de Manzanero y de Áreas del plano
 * oficial aprobado por el municipio (PDF subido a `dilesa.proyecto_planos`).
 *
 * El cuadro se renderizó a 300 DPI, se leyó con visión y se VALIDÓ contra
 * los 12 totales de columna impresos (checksum exacto): 165 lotes (163
 * habitacionales + 2 municipales), 23,941.70 m². Ver matriz abajo.
 *
 * Identificador `M{manzana}-L{lote}` (consistente con import_dilesa_inventario).
 * Estado `planeada` (aún no urbanizado). Precio/prototipo NO se cargan —
 * eso es info comercial que se captura después.
 *
 * Idempotente: aborta si el desarrollo ya tiene unidades.
 *
 * Prerequisites: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Uso:
 *   DRY_RUN=1 npx tsx --env-file=/Users/Beto/BSOP/.env.local scripts/import_dilesa_lotes_delicias.ts
 *   npx tsx --env-file=/Users/Beto/BSOP/.env.local scripts/import_dilesa_lotes_delicias.ts
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');

const PROYECTO_NOMBRE = 'Lomas de las Delicias';

// Cuadro de Manzanero y de Áreas (plano oficial AGOSTO 2025, LOT-001/25).
// manzana -> { lote: superficie_m2 }. Validado contra totales de columna.
const MATRIZ: Record<number, Record<number, number>> = {
  1: { 1: 129.91, 2: 120.0, 3: 193.13 },
  2: { 1: 167.33, 2: 120, 3: 120, 4: 120, 5: 120, 6: 120, 7: 120, 8: 120, 9: 120, 10: 179.11 },
  3: { 1: 145.0, 2: 120, 3: 120, 4: 120, 5: 120, 6: 172.89 },
  4: { 1: 130.42, 2: 127.82, 3: 141.91 },
  5: {
    1: 205.37,
    2: 120,
    3: 120,
    4: 120,
    5: 120,
    6: 120,
    7: 120,
    8: 120,
    9: 120,
    10: 191.43,
    11: 166.24,
    12: 120,
    13: 120,
    14: 120,
    15: 120,
    16: 120,
    17: 120,
    18: 120,
    19: 120,
    20: 120,
    21: 188.87,
  },
  6: {
    1: 136.21,
    2: 120,
    3: 120,
    4: 120,
    5: 120,
    6: 120,
    7: 120,
    8: 120,
    9: 146.31,
    10: 146.31,
    11: 120,
    12: 120,
    13: 120,
    14: 120,
    15: 120,
    16: 120,
    17: 120,
    18: 168.63,
  },
  7: {
    1: 144.02,
    2: 120,
    3: 120,
    4: 120,
    5: 120,
    6: 120,
    7: 120,
    8: 120,
    9: 120,
    10: 120,
    11: 120,
    12: 120,
    13: 126.81,
    14: 62.81,
  },
  8: {
    1: 127.97,
    2: 120,
    3: 120,
    4: 120,
    5: 120,
    6: 120,
    7: 120,
    8: 120,
    9: 120,
    10: 120,
    11: 120,
    12: 120,
    13: 120,
    14: 134.75,
    15: 177.71,
    16: 120,
    17: 120,
    18: 120,
    19: 120,
    20: 120,
    21: 120,
    22: 120,
    23: 120,
    24: 120,
    25: 120,
    26: 120,
    27: 157.65,
  },
  9: {
    1: 168.58,
    2: 120,
    3: 120,
    4: 120,
    5: 120,
    6: 120,
    7: 120,
    8: 120,
    9: 120,
    10: 120,
    11: 120,
    12: 195.9,
    13: 163.48,
    14: 120,
    15: 120,
    16: 120,
    17: 120,
    18: 120,
    19: 120,
    20: 120,
    21: 120,
    22: 120,
    23: 120,
    24: 137.6,
  },
  10: {
    1: 120,
    2: 120,
    3: 120,
    4: 120,
    5: 120,
    6: 120,
    7: 120,
    8: 120,
    9: 127.48,
    10: 193.64,
    11: 120,
    12: 120,
    13: 120,
    14: 120,
    15: 120,
    16: 120,
    17: 120,
  },
  11: {
    1: 132.97,
    2: 120,
    3: 120,
    4: 120,
    5: 120,
    6: 120,
    7: 120,
    8: 120,
    9: 120,
    10: 120,
    11: 169.49,
    12: 137.07,
    13: 120,
    14: 120,
    15: 120,
    16: 120,
    17: 120,
    18: 120,
    19: 120,
    20: 120,
    21: 170.27,
  },
  12: { 1: 3076.63 },
};
// Totales de columna impresos en el plano (checksum).
const TOTALES_COL: Record<number, number> = {
  1: 443.04,
  2: 1306.44,
  3: 797.89,
  4: 400.14,
  5: 2791.91,
  6: 2277.46,
  7: 1653.64,
  8: 3358.08,
  9: 3065.56,
  10: 2121.12,
  11: 2649.8,
  12: 3076.63,
};
// Lotes municipales (área verde / equipamiento, no vendibles): "mz-lote".
const MUNICIPALES = new Set(['12-1', '7-14']);

function validar(): { ok: boolean; total: number; area: number } {
  let ok = true;
  for (const mzStr of Object.keys(MATRIZ)) {
    const mz = Number(mzStr);
    const suma = Object.values(MATRIZ[mz]).reduce((a, b) => a + b, 0);
    if (Math.abs(suma - TOTALES_COL[mz]) >= 0.05) {
      console.error(`  ✗ Mz${mz}: suma ${suma.toFixed(2)} ≠ total ${TOTALES_COL[mz]}`);
      ok = false;
    }
  }
  const total = Object.values(MATRIZ).reduce((a, m) => a + Object.keys(m).length, 0);
  const area = Object.values(MATRIZ).reduce(
    (a, m) => a + Object.values(m).reduce((x, y) => x + y, 0),
    0
  );
  return { ok, total, area };
}

async function main() {
  const v = validar();
  if (!v.ok) throw new Error('Validación de matriz falló — revisar transcripción.');
  console.log(`Matriz validada: ${v.total} lotes, ${v.area.toFixed(2)} m² (checksum OK).`);
  if (v.total !== 165) throw new Error(`Esperaba 165 lotes, hay ${v.total}.`);

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
    .select('id, lotes_proyectados')
    .eq('empresa_id', empresaId)
    .eq('nombre', PROYECTO_NOMBRE)
    .eq('tipo', 'desarrollo')
    .is('deleted_at', null)
    .single();
  if (pErr || !proy) throw new Error(`No se encontró el desarrollo "${PROYECTO_NOMBRE}".`);
  const proyectoId = (proy as { id: string }).id;

  // Idempotencia.
  const { count } = await sb
    .schema('dilesa')
    .from('unidades')
    .select('id', { count: 'exact', head: true })
    .eq('proyecto_id', proyectoId)
    .is('deleted_at', null);
  if ((count ?? 0) > 0) {
    throw new Error(`El desarrollo ya tiene ${count} unidades. Abortando para no duplicar.`);
  }

  const rows = Object.keys(MATRIZ).flatMap((mzStr) => {
    const mz = Number(mzStr);
    return Object.keys(MATRIZ[mz]).map((loteStr) => {
      const lote = Number(loteStr);
      const muni = MUNICIPALES.has(`${mz}-${lote}`);
      return {
        empresa_id: empresaId,
        proyecto_id: proyectoId,
        identificador: `M${mz}-L${lote}`,
        manzana: String(mz),
        numero_lote: String(lote),
        area_m2: MATRIZ[mz][lote],
        estado: 'planeada',
        tipo_lote: muni ? 'municipal' : 'habitacional',
      };
    });
  });

  console.log(
    `${DRY_RUN ? '[DRY_RUN] ' : ''}${rows.length} unidades a crear ` +
      `(${rows.filter((r) => r.tipo_lote === 'municipal').length} municipales) en "${PROYECTO_NOMBRE}".`
  );
  if (DRY_RUN) {
    console.log('Muestra:', rows.slice(0, 3), '…', rows.slice(-2));
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
