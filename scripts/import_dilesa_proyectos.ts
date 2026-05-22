/**
 * import_dilesa_proyectos.ts
 *
 * Iniciativa dilesa-portafolio-activos · Sprint 3 — importación Fase 2.
 * Jala Anteproyectos y Proyectos del Coda DILESA (doc ZNxWl_DI2D) y los
 * carga en dilesa.proyectos (tipo anteproyecto / desarrollo).
 *
 *   - Anteproyectos → proyectos (tipo=anteproyecto) + vínculo proyecto_activos
 *     (rol=input) al terreno ya importado en la Fase 1.
 *   - Proyectos → proyectos (tipo=desarrollo).
 *   - proyecto_predecesor_id: un proyecto cuyo nombre coincide con un
 *     anteproyecto "Convertido a Proyecto" apunta a ese anteproyecto.
 *
 * Los ~27 cálculos financieros de Coda (utilidad, margen, costos referencia)
 * NO se importan — son fórmulas; el modelo financiero v2 los recalcula.
 * Mapeo: docs/planning/dilesa-portafolio-mapeo-coda.md §§ 2-3.
 *
 * Idempotente: borra los proyectos de DILESA y re-inserta (proyecto_activos
 * cae por FK ON DELETE CASCADE). Seguro mientras no haya unidades/productos
 * colgando — esta es la carga inicial.
 *
 * Prerequisites (env): CODA_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/import_dilesa_proyectos.ts
 *   npx tsx scripts/import_dilesa_proyectos.ts
 */

import { createClient } from '@supabase/supabase-js';
import {
  CodaClient,
  buildColumnMap,
  pick,
  str,
  num,
  int,
  dateStr,
  firstUrl,
} from '../lib/coda-api';

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

const CODA_DOC = 'ZNxWl_DI2D';

if (!CODA_API_KEY) throw new Error('Falta CODA_API_KEY');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');

/** Estado del Anteproyecto (Coda) → dilesa.proyectos.estado. */
function mapEstadoAnteproyecto(estado: string | null): string {
  const s = (estado ?? '').toLowerCase();
  if (s.includes('convertido')) return 'completado';
  if (s.includes('no viable')) return 'archivado';
  // En Análisis, En Trámite, En Due Diligence, Pausado → en evaluación
  return 'analisis';
}

async function main() {
  const coda = new CodaClient(CODA_API_KEY);
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data: emp, error: empErr } = await sb
    .schema('core')
    .from('empresas')
    .select('id')
    .eq('slug', 'dilesa')
    .single();
  if (empErr || !emp) throw new Error(`No se encontró la empresa DILESA: ${empErr?.message}`);
  const empresaId = emp.id as string;

  // ── Anteproyectos ──────────────────────────────────────────────────────────
  const apCols = await coda.listColumns(CODA_DOC, 'Anteproyectos');
  const apCm = buildColumnMap(apCols);
  const apRows = await coda.listRowsAll(CODA_DOC, 'Anteproyectos');

  const anteproyectos = apRows.map((row) => {
    const v = row.values;
    return {
      terreno_nombre: str(pick(v, apCm, 'Terreno')),
      proyecto: {
        empresa_id: empresaId,
        tipo: 'anteproyecto',
        nombre: str(pick(v, apCm, 'ID Anteproyecto')) ?? '(sin nombre)',
        estado: mapEstadoAnteproyecto(str(pick(v, apCm, 'Estado del Anteproyecto'))),
        fecha_inicio: dateStr(pick(v, apCm, 'Fecha Inicio Anteproyecto')),
        area_m2: num(pick(v, apCm, 'Area del Terreno M²')),
        area_vendible_m2: num(pick(v, apCm, 'Area Vendible')),
        areas_verdes_m2: num(pick(v, apCm, 'Areas Verdes')),
        lotes_proyectados: int(pick(v, apCm, 'Cantidad de Lotes')),
        costo_urbanizacion: num(pick(v, apCm, 'Infraestructura de Cabecera Necesaria')),
        notas: str(pick(v, apCm, 'Notas')),
        documentos: ((): Array<{ tipo: string; url: string }> => {
          const url = firstUrl(pick(v, apCm, 'Plano Proyecto Lotificación'));
          return url ? [{ tipo: 'plano_lotificacion', url }] : [];
        })(),
      },
    };
  });

  // ── Proyectos ──────────────────────────────────────────────────────────────
  const pCols = await coda.listColumns(CODA_DOC, 'Proyectos');
  const pCm = buildColumnMap(pCols);
  const pRows = await coda.listRowsAll(CODA_DOC, 'Proyectos');

  const proyectos = pRows.map((row) => {
    const v = row.values;
    const clasif = str(pick(v, pCm, 'Clasificación Inmobiliaria'));
    const notasCoda = str(pick(v, pCm, 'Notas'));
    return {
      empresa_id: empresaId,
      tipo: 'desarrollo',
      nombre: str(pick(v, pCm, 'ID Proyecto')) ?? '(sin nombre)',
      estado: 'ejecutando',
      clave_interna: str(pick(v, pCm, 'Abreviación')),
      area_m2: num(pick(v, pCm, 'Area M²')),
      area_vendible_m2: num(pick(v, pCm, 'Area Vendible M²')),
      areas_verdes_m2: num(pick(v, pCm, 'Areas Verdes M²')),
      lotes_proyectados: int(pick(v, pCm, 'Total de Lotes')),
      fecha_licencia: dateStr(pick(v, pCm, 'Fecha Licencia Fraccionamiento')),
      costo_terreno: num(pick(v, pCm, 'Costo Terreno')),
      costo_urbanizacion: num(pick(v, pCm, 'Costo de Urbanización')),
      costo_construccion: num(pick(v, pCm, 'Costo de MO')),
      notas: [clasif ? `Clasificación inmobiliaria: ${clasif}` : null, notasCoda]
        .filter(Boolean)
        .join('\n'),
    };
  });

  if (DRY_RUN) {
    console.log('\n=== DRY RUN — no se escribe nada ===\n');
    console.log(`Anteproyectos (${anteproyectos.length}):`);
    for (const a of anteproyectos) {
      console.log(
        `  · ${a.proyecto.nombre}  [${a.proyecto.estado}]  ` +
          `terreno=${a.terreno_nombre ?? '—'}  lotes=${a.proyecto.lotes_proyectados ?? '—'}`
      );
    }
    console.log(`\nProyectos (${proyectos.length}):`);
    for (const p of proyectos) {
      console.log(
        `  · ${p.nombre}  [${p.estado}]  ${p.clave_interna ?? '—'}  ` +
          `${p.area_m2 ?? '—'} m²  ${p.lotes_proyectados ?? '—'} lotes`
      );
    }
    return;
  }

  // Idempotencia: limpiar proyectos previos (proyecto_activos cae por CASCADE).
  const { error: delErr } = await sb
    .schema('dilesa')
    .from('proyectos')
    .delete()
    .eq('empresa_id', empresaId);
  if (delErr) throw new Error(`Error limpiando proyectos previos: ${delErr.message}`);

  // Terrenos ya importados, indexados por nombre para el vínculo proyecto_activos.
  const { data: terrenos, error: tErr } = await sb
    .schema('dilesa')
    .from('activos')
    .select('id, nombre')
    .eq('empresa_id', empresaId)
    .eq('tipo', 'terreno');
  if (tErr) throw new Error(`Error leyendo terrenos: ${tErr.message}`);
  const terrenoPorNombre = new Map(
    (terrenos ?? []).map((t) => [(t.nombre as string).trim(), t.id as string])
  );

  // nombre de proyecto/anteproyecto → id insertado (para proyecto_predecesor_id).
  const idPorNombre = new Map<string, string>();
  let okAp = 0;
  let okP = 0;
  let okVinc = 0;

  // Anteproyectos primero (un proyecto convertido referencia a su anteproyecto).
  for (const a of anteproyectos) {
    const { data: prj, error: pErr } = await sb
      .schema('dilesa')
      .from('proyectos')
      .insert(a.proyecto)
      .select('id')
      .single();
    if (pErr || !prj) {
      console.error(`✗ anteproyecto ${a.proyecto.nombre}: ${pErr?.message}`);
      continue;
    }
    idPorNombre.set(a.proyecto.nombre.trim(), prj.id as string);
    okAp++;
    // Vínculo al terreno.
    const terrenoId = a.terreno_nombre ? terrenoPorNombre.get(a.terreno_nombre.trim()) : undefined;
    if (terrenoId) {
      const { error: vErr } = await sb
        .schema('dilesa')
        .from('proyecto_activos')
        .insert({ empresa_id: empresaId, proyecto_id: prj.id, activo_id: terrenoId, rol: 'input' });
      if (vErr) console.error(`  ✗ vínculo terreno de ${a.proyecto.nombre}: ${vErr.message}`);
      else okVinc++;
    } else if (a.terreno_nombre) {
      console.warn(`  ⚠ terreno "${a.terreno_nombre}" no encontrado para ${a.proyecto.nombre}`);
    }
  }

  // Proyectos. Si el nombre coincide con un anteproyecto, se enlaza como sucesor.
  for (const p of proyectos) {
    const predecesorId = idPorNombre.get(p.nombre.trim()) ?? null;
    const { data: prj, error: pErr } = await sb
      .schema('dilesa')
      .from('proyectos')
      .insert({ ...p, proyecto_predecesor_id: predecesorId })
      .select('id')
      .single();
    if (pErr || !prj) {
      console.error(`✗ proyecto ${p.nombre}: ${pErr?.message}`);
      continue;
    }
    okP++;
  }

  console.log(
    `\n✔ Importados ${okAp}/${anteproyectos.length} anteproyectos ` +
      `(${okVinc} vinculados a su terreno) y ${okP}/${proyectos.length} proyectos.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
