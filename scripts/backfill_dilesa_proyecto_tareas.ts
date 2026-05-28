/**
 * backfill_dilesa_proyecto_tareas.ts
 *
 * Iniciativa `dilesa-proyectos-checklist-inline` Sprint 1.
 *
 * Pobla `dilesa.proyecto_tareas` con la plantilla canónica para todos
 * los proyectos DILESA vivos que aún no tienen tareas vinculadas a la
 * plantilla. Itera proyectos en orden (anteproyectos primero, luego
 * desarrollos) y llama la lógica compartida
 * `instanciarPlantillaParaProyecto` con service-role client.
 *
 * Idempotente: la función ya skipea proyectos que tienen al menos una
 * tarea con `plantilla_tarea_id` set.
 *
 * Decisión D2 (planning doc): backfill incluye los 13 proyectos vivos
 * (5 anteproyectos + 8 desarrollos). Las tareas se crean en
 * `estado='pendiente'`. Beto rellena estado/montos/docs manualmente
 * después conforme captura el histórico operativo.
 *
 * Fecha de arranque para el cálculo de fechas objetivo:
 * - Anteproyecto: `fecha_inicio` si existe, si no, hoy.
 * - Desarrollo: `fecha_inicio` si existe, si no, hoy.
 *
 * Solo afecta DILESA. Otros tipos (remodelación, etc.) se procesan
 * con el catálogo de desarrollo (filtro `aplicacion IN ('desarrollo','ambas')`)
 * por compatibilidad con el patrón actual de `populatePlantilla`.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/backfill_dilesa_proyecto_tareas.ts
 *   npx tsx scripts/backfill_dilesa_proyecto_tareas.ts
 *
 * Filtra a un tipo (Sprint 1 procesa solo anteproyectos):
 *   TIPO=anteproyecto npx tsx scripts/backfill_dilesa_proyecto_tareas.ts
 *
 * Limita a un solo proyecto:
 *   PROYECTO_ID=<uuid> npx tsx scripts/backfill_dilesa_proyecto_tareas.ts
 */

import { createClient } from '@supabase/supabase-js';
import { instanciarPlantillaParaProyecto } from '../lib/dilesa/instanciar-plantilla';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';
const PROYECTO_ID = process.env.PROYECTO_ID || null;
const TIPO = process.env.TIPO || null;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Faltan credenciales NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
}

type Proyecto = {
  id: string;
  nombre: string;
  tipo: string;
  estado: string;
  fecha_inicio: string | null;
};

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data: emp, error: errEmp } = await sb
    .schema('core')
    .from('empresas')
    .select('id')
    .eq('slug', 'dilesa')
    .single();
  if (errEmp || !emp) throw new Error(`No se encontró DILESA: ${errEmp?.message}`);
  const empresaId = emp.id as string;

  let q = sb
    .schema('dilesa')
    .from('proyectos')
    .select('id, nombre, tipo, estado, fecha_inicio')
    .eq('empresa_id', empresaId)
    .is('deleted_at', null);
  if (PROYECTO_ID) q = q.eq('id', PROYECTO_ID);
  if (TIPO) q = q.eq('tipo', TIPO);
  const { data: proyectosRaw, error: errP } = await q.order('tipo').order('nombre');
  if (errP) throw new Error(`Error leyendo proyectos: ${errP.message}`);
  const proyectos = (proyectosRaw ?? []) as Proyecto[];

  const filtroDesc = [
    PROYECTO_ID ? `PROYECTO_ID=${PROYECTO_ID}` : null,
    TIPO ? `TIPO=${TIPO}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  console.log(
    `${DRY_RUN ? '[DRY RUN] ' : ''}Procesando ${proyectos.length} proyecto(s) DILESA${filtroDesc ? ` (filtro ${filtroDesc})` : ''}\n`
  );

  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const p of proyectos) {
    const fechaArranque = p.fecha_inicio ?? new Date().toISOString().slice(0, 10);
    const tag = `${p.tipo.padEnd(13)} ${p.estado.padEnd(11)} ${p.nombre.padEnd(35)}`;

    if (DRY_RUN) {
      console.log(`  [dry] ${tag} fecha_arranque=${fechaArranque}`);
      ok++;
      continue;
    }

    const r = await instanciarPlantillaParaProyecto(sb, p.id, fechaArranque);
    if (!r.ok) {
      if (r.error.includes('ya tiene')) {
        console.log(`  [skip] ${tag} (${r.error})`);
        skip++;
      } else {
        console.log(`  [fail] ${tag} ${r.error}`);
        fail++;
      }
    } else {
      console.log(`  [ok]   ${tag} +${r.tareasCreadas} tareas`);
      ok++;
    }
  }

  console.log(`\n${DRY_RUN ? 'Dry run summary' : 'Summary'}: ok=${ok} skip=${skip} fail=${fail}`);
}

main().catch((e) => {
  console.error('Backfill failed:', e);
  process.exit(1);
});
