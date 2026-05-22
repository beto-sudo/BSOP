/**
 * import_dilesa_terrenos.ts
 *
 * Iniciativa dilesa-portafolio-activos · Sprint 3 — importación Fase 1.
 * Jala los terrenos del Coda DILESA (doc ZNxWl_DI2D, tabla `Terrenos`) y los
 * carga en el schema v2: dilesa.activos (tipo=terreno) + dilesa.activo_terreno.
 *
 * Mapeo: docs/planning/dilesa-portafolio-mapeo-coda.md § 1.
 *
 * Idempotente: borra los activos tipo=terreno de DILESA y re-inserta (el
 * satélite cae por FK ON DELETE CASCADE). Seguro mientras no haya captura
 * manual encima — esta es la carga inicial.
 *
 * Prerequisites (env): CODA_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/import_dilesa_terrenos.ts   # preview, no escribe
 *   npx tsx scripts/import_dilesa_terrenos.ts             # importa
 */

import { createClient } from '@supabase/supabase-js';
import { CodaClient, buildColumnMap, pick, str, num, dateStr, firstUrl } from '../lib/coda-api';

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

const CODA_DOC = 'ZNxWl_DI2D';
const CODA_TABLE = 'Terrenos';

if (!CODA_API_KEY) throw new Error('Falta CODA_API_KEY');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');

// ─── Mapeos de valores ───────────────────────────────────────────────────────

/**
 * dilesa.activos.estado desde "Estatus de Propiedad" (Coda). La columna
 * "Etapa del Terreno" existe en Coda pero está vacía (nunca se capturó),
 * así que se usa "Estatus de Propiedad", que sí tiene datos. Cuando el
 * estatus está vacío, "Tipo de Terreno = Propio" delata un terreno ya
 * adquirido por DILESA.
 */
function mapEstado(estatus: string | null, tipo: string | null): string {
  const s = (estatus ?? '').toLowerCase();
  if (s.includes('adquirido')) return 'adquirido';
  if (s.includes('descartado')) return 'descartado';
  if (!s.trim() && (tipo ?? '').toLowerCase().includes('propio')) return 'adquirido';
  // ofrecido, en negociación, apartado/opción, en radar, vacío → pre-adquisición
  return 'prospecto';
}

/** Prioridad de Coda ("🔴 Alta" / "Media" / …) → alta|media|baja|null. */
function mapPrioridad(p: string | null): string | null {
  const s = (p ?? '').toLowerCase();
  if (s.includes('alta')) return 'alta';
  if (s.includes('media')) return 'media';
  if (s.includes('baja')) return 'baja';
  return null;
}

/** Consolida las columnas de adjuntos de Coda en el array jsonb `documentos`. */
function buildDocumentos(v: Record<string, unknown>, cm: Map<string, string>) {
  const fuentes: Array<[string, string]> = [
    ['Imagen ZCU', 'imagen_zcu'],
    ['Archivo KMZ', 'kmz'],
    ['PDF Escritura', 'escritura'],
    ['Documentos', 'documento'],
  ];
  const docs: Array<{ tipo: string; url: string }> = [];
  for (const [codaCol, tipo] of fuentes) {
    const url = firstUrl(pick(v, cm, codaCol));
    if (url) docs.push({ tipo, url });
  }
  return docs;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const coda = new CodaClient(CODA_API_KEY);
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // empresa_id de DILESA desde la DB (no hardcodeado).
  const { data: emp, error: empErr } = await sb
    .schema('core')
    .from('empresas')
    .select('id')
    .eq('slug', 'dilesa')
    .single();
  if (empErr || !emp) throw new Error(`No se encontró la empresa DILESA: ${empErr?.message}`);
  const empresaId = emp.id as string;

  const cols = await coda.listColumns(CODA_DOC, CODA_TABLE);
  const cm = buildColumnMap(cols);
  const rows = await coda.listRowsAll(CODA_DOC, CODA_TABLE);
  console.log(`Coda: ${rows.length} terrenos en la tabla "${CODA_TABLE}".`);

  const registros = rows.map((row) => {
    const v = row.values;
    const etapa = str(pick(v, cm, 'Etapa del Terreno'));
    const estatusProp = str(pick(v, cm, 'Estatus de Propiedad'));
    const tipoTerreno = str(pick(v, cm, 'Tipo de Terreno'));
    const activo = {
      empresa_id: empresaId,
      tipo: 'terreno',
      nombre: str(pick(v, cm, 'Nombre del Terreno')) ?? '(sin nombre)',
      estado: mapEstado(estatusProp, tipoTerreno),
      clave_interna: str(pick(v, cm, 'Clave Interna Terreno')),
      municipio: str(pick(v, cm, 'Municipio')),
      direccion_referencia: str(pick(v, cm, 'Dirección / Referencia', 'Dirección/Referencia')),
      area_m2: num(pick(v, cm, 'Area del Terreno M²')),
      numero_escritura: str(pick(v, cm, 'Numero de Escritura')),
      valor_estimado: num(pick(v, cm, 'Valor Interno Estimado')),
      notas: str(pick(v, cm, 'Notas')),
      documentos: buildDocumentos(v, cm),
    };
    const terreno = {
      areas_afectacion_m2: num(pick(v, cm, 'Areas de Afectación M²')),
      tipo_terreno: tipoTerreno,
      objetivo: str(pick(v, cm, 'Objetivo del Terreno')),
      zona_sector: str(pick(v, cm, 'Zona / Sector', 'Zona/Sector')),
      propietario_nombre: str(pick(v, cm, 'Nombre Propietario')),
      propietario_telefono: str(pick(v, cm, 'Telefono Propietario')),
      corredor_nombre: str(pick(v, cm, 'Nombre Corredor')),
      corredor_telefono: str(pick(v, cm, 'Telefono Corredor')),
      precio_solicitado_m2: num(pick(v, cm, 'Precio Solicitado x M²')),
      precio_ofertado_m2: num(pick(v, cm, 'Precio x M² Ofertado')),
      valor_objetivo_compra: num(pick(v, cm, 'Valor Objetivo de Compra')),
      origen: str(pick(v, cm, 'Origen del Terreno')),
      estatus_propiedad: estatusProp,
      etapa,
      decision_actual: str(pick(v, cm, 'Decisión Actual')),
      prioridad: mapPrioridad(str(pick(v, cm, 'Prioridad'))),
      responsable: str(pick(v, cm, 'Responsable')),
      fecha_ultima_revision: dateStr(pick(v, cm, 'Fecha Última Revisión')),
      siguiente_accion: str(pick(v, cm, 'Siguiente Acción')),
    };
    return { activo, terreno };
  });

  if (DRY_RUN) {
    console.log('\n=== DRY RUN — no se escribe nada ===\n');
    for (const r of registros) {
      console.log(
        `· ${r.activo.nombre}  [${r.activo.estado}]  ${r.activo.municipio ?? '—'}  ` +
          `${r.activo.area_m2 ?? '—'} m²  etapa=${r.terreno.etapa ?? '—'}`
      );
    }
    console.log(`\nTotal: ${registros.length} terrenos listos para importar.`);
    return;
  }

  // Idempotencia: limpiar terrenos previos (el satélite cae por CASCADE).
  const { error: delErr } = await sb
    .schema('dilesa')
    .from('activos')
    .delete()
    .eq('empresa_id', empresaId)
    .eq('tipo', 'terreno');
  if (delErr) throw new Error(`Error limpiando terrenos previos: ${delErr.message}`);

  let ok = 0;
  for (const r of registros) {
    const { data: act, error: aErr } = await sb
      .schema('dilesa')
      .from('activos')
      .insert(r.activo)
      .select('id')
      .single();
    if (aErr || !act) {
      console.error(`✗ ${r.activo.nombre}: ${aErr?.message}`);
      continue;
    }
    const { error: tErr } = await sb
      .schema('dilesa')
      .from('activo_terreno')
      .insert({ activo_id: act.id, empresa_id: empresaId, ...r.terreno });
    if (tErr) {
      console.error(`✗ satélite de ${r.activo.nombre}: ${tErr.message}`);
      continue;
    }
    ok++;
  }
  console.log(
    `\n✔ Importados ${ok}/${registros.length} terrenos a dilesa.activos + activo_terreno.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
