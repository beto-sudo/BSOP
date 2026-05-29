/**
 * backfill_dilesa_proyecto_tarea_pasos.ts
 *
 * Iniciativa `dilesa-proyectos-checklist-inline` Sprint 3 (D5).
 *
 * Migra los atajos de Sprint 1 + 1.5 (`proyecto_tareas.resultado_monto`,
 * `proyecto_tareas.resultado_documento_url`) a la nueva tabla
 * `dilesa.proyecto_tarea_pasos`:
 *
 *   - Cada tarea con `resultado_documento_url` poblado → INSERT paso
 *     `resultado` con `estado='hecho'`, `documento_url` copiado, y
 *     `fecha` = `fecha_completada` (o hoy si NULL).
 *   - Cada tarea con `resultado_monto` poblado → INSERT paso
 *     `cotizacion` con `estado='hecho'`, `monto` copiado, `fecha` =
 *     `fecha_completada` (o hoy).
 *
 * Idempotente: usa `ON CONFLICT (tarea_id, paso) DO NOTHING` por la
 * UNIQUE de la tabla. Re-correr el script no duplica nada.
 *
 * Los atajos en `proyecto_tareas` se MANTIENEN — son referencia rápida
 * para UI sin re-fetch del paso. Cuando la UI escriba pasos nuevos,
 * también actualiza los atajos (o no — decisión post-Sprint 3 si
 * conviene deprecarlos).
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/backfill_dilesa_proyecto_tarea_pasos.ts
 *   npx tsx scripts/backfill_dilesa_proyecto_tarea_pasos.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
}

type TareaSemilla = {
  id: string;
  empresa_id: string;
  proyecto_id: string;
  titulo: string;
  resultado_monto: number | null;
  resultado_documento_url: string | null;
  fecha_completada: string | null;
};

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data: tareasRaw, error } = await sb
    .schema('dilesa')
    .from('proyecto_tareas')
    .select(
      'id, empresa_id, proyecto_id, titulo, resultado_monto, resultado_documento_url, fecha_completada'
    )
    .is('deleted_at', null);
  if (error) throw new Error(`Error leyendo tareas: ${error.message}`);
  const tareas = (tareasRaw ?? []) as TareaSemilla[];

  const conMonto = tareas.filter((t) => t.resultado_monto != null);
  const conDoc = tareas.filter((t) => t.resultado_documento_url != null);
  console.log(
    `${DRY_RUN ? '[DRY RUN] ' : ''}Tareas: ${tareas.length} | con monto: ${conMonto.length} | con doc: ${conDoc.length}\n`
  );

  type PasoCanonico = 'cotizacion' | 'factura' | 'pago' | 'resultado';
  type Insert = {
    empresa_id: string;
    tarea_id: string;
    paso: PasoCanonico;
    monto: number | null;
    documento_url: string | null;
    fecha: string | null;
    estado: 'hecho' | 'pendiente';
  };
  const inserts: Insert[] = [];

  const hoy = new Date().toISOString().slice(0, 10);
  const PASOS_TODOS: readonly PasoCanonico[] = ['cotizacion', 'factura', 'pago', 'resultado'];

  // Por cada tarea, generar los 4 pasos. Para los que tenemos data en los
  // atajos, los marcamos `hecho`. El resto arranca `pendiente` para que la
  // UI muestre dónde falta capturar.
  for (const t of tareas) {
    for (const paso of PASOS_TODOS) {
      const esCotConMonto = paso === 'cotizacion' && t.resultado_monto != null;
      const esResConDoc = paso === 'resultado' && t.resultado_documento_url != null;
      if (esCotConMonto) {
        inserts.push({
          empresa_id: t.empresa_id,
          tarea_id: t.id,
          paso,
          monto: t.resultado_monto,
          documento_url: null,
          fecha: t.fecha_completada ?? hoy,
          estado: 'hecho',
        });
      } else if (esResConDoc) {
        inserts.push({
          empresa_id: t.empresa_id,
          tarea_id: t.id,
          paso,
          monto: null,
          documento_url: t.resultado_documento_url,
          fecha: t.fecha_completada ?? hoy,
          estado: 'hecho',
        });
      } else {
        inserts.push({
          empresa_id: t.empresa_id,
          tarea_id: t.id,
          paso,
          monto: null,
          documento_url: null,
          fecha: null,
          estado: 'pendiente',
        });
      }
    }
  }

  console.log(`A insertar: ${inserts.length} pasos\n`);

  if (DRY_RUN) {
    for (const i of inserts.slice(0, 5)) {
      console.log(
        `  [dry] tarea=${i.tarea_id.slice(0, 8)} paso=${i.paso} monto=${i.monto ?? '—'} doc=${i.documento_url ? '✓' : '—'} fecha=${i.fecha}`
      );
    }
    if (inserts.length > 5) console.log(`  ... y ${inserts.length - 5} más`);
    return;
  }

  // Insert batch con upsert por unique (tarea_id, paso).
  let ok = 0;
  let fail = 0;
  // Procesar por lotes de 100 para no exceder URL/payload.
  const BATCH = 100;
  for (let i = 0; i < inserts.length; i += BATCH) {
    const chunk = inserts.slice(i, i + BATCH);
    const { error: insErr } = await sb
      .schema('dilesa')
      .from('proyecto_tarea_pasos')
      .upsert(chunk, { onConflict: 'tarea_id,paso', ignoreDuplicates: true });
    if (insErr) {
      console.log(`  ✗ batch ${i}-${i + chunk.length}: ${insErr.message}`);
      fail += chunk.length;
    } else {
      ok += chunk.length;
    }
  }

  console.log(`\nSummary: ok=${ok} fail=${fail}`);
}

main().catch((e) => {
  console.error('Backfill failed:', e);
  process.exit(1);
});
