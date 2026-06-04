/**
 * Seed idempotente — KLOW (blend multi-péptido) en el catálogo del protocolo.
 *
 * KLOW = un vial liofilizado que combina 4 péptidos:
 *   TB-500 10mg + BPC-157 10mg + KPV 10mg + GHK-Cu 50mg = 80mg/vial.
 * Se dosifica por volumen (u/mL) y la calculadora deriva los mg por componente
 * (lib/blend.ts). Data clínica personal de Beto → fuera de migraciones
 * versionadas (no corre en preview/CI), igual que el Retatrutide.
 *
 * Idempotente: UPSERT por nombre 'KLOW' (actualiza la receta si re-corre).
 *
 *   DRY_RUN=1 npx tsx --env-file=.env.local scripts/seed_protocolo_klow.ts
 *   npx tsx --env-file=.env.local scripts/seed_protocolo_klow.ts
 *
 * No es consejo médico.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
}

const KLOW = {
  nombre: 'KLOW',
  clase: 'peptido',
  via: 'subcutanea',
  unidad_dosis: 'u', // se dosifica por volumen
  frecuencia: null as string | null,
  estado: 'activo',
  notas:
    'Blend multi-péptido (80mg/vial): TB-500 10mg + BPC-157 10mg + KPV 10mg + GHK-Cu 50mg. ' +
    'Se reconstituye el vial completo y se dosifica por volumen; la calculadora deriva los mg por componente.',
  componentes: [
    { nombre: 'TB-500', mg: 10 },
    { nombre: 'BPC-157', mg: 10 },
    { nombre: 'KPV', mg: 10 },
    { nombre: 'GHK-Cu', mg: 50 },
  ],
};

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });
  const health = supabase.schema('health');

  const { data: existing, error: selErr } = await health
    .from('protocolo_compuestos')
    .select('id, componentes')
    .eq('nombre', KLOW.nombre)
    .maybeSingle();
  if (selErr) throw selErr;

  const total = KLOW.componentes.reduce((s, c) => s + c.mg, 0);
  console.log(
    `KLOW: ${KLOW.componentes.length} péptidos · ${total}mg/vial — ${existing ? 'ya existe (update)' : 'nuevo (insert)'}`
  );
  if (DRY_RUN) {
    console.log('DRY_RUN=1 → no se escribe nada.');
    return;
  }

  if (existing) {
    const { error } = await health
      .from('protocolo_compuestos')
      .update({
        clase: KLOW.clase,
        via: KLOW.via,
        unidad_dosis: KLOW.unidad_dosis,
        notas: KLOW.notas,
        componentes: KLOW.componentes,
      })
      .eq('id', (existing as { id: string }).id);
    if (error) throw error;
    console.log('✔ KLOW actualizado.');
  } else {
    const { error } = await health.from('protocolo_compuestos').insert(KLOW);
    if (error) throw error;
    console.log('✔ KLOW insertado.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
