/**
 * import_dilesa_contratistas.ts
 *
 * Iniciativa dilesa-construccion · Sprint 2 — Script B.
 * Importa contratistas desde Coda DILESA (doc ZNxWl_DI2D, tabla
 * grid-b-HTXuSZp4 "Contratistas") hacia BSOP en 2 pasos:
 *
 *   1. erp.personas con tipo='contratista'.
 *      - Match para idempotencia: por RFC (válido) si existe; si no, por
 *        nombre exacto + tipo='contratista'.
 *      - INSERT o UPDATE según corresponda. NO usa coda_row_id en personas
 *        porque erp.personas es compartido y no tiene esa columna; usa
 *        RFC/nombre como llave estable.
 *
 *   2. dilesa.contratistas_datos (satélite 1:1 por persona_id).
 *      - UPSERT por persona_id (PK).
 *      - coda_row_id se guarda como traza.
 *
 * KPIs derivados de Coda (efectividad, días sin avance, etc.) NO se
 * importan — son calculados. Mapeo § 5.
 *
 * Idempotente: re-correr no duplica personas ni satélites.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/import_dilesa_contratistas.ts
 *   npx tsx scripts/import_dilesa_contratistas.ts
 */

import { createClient } from '@supabase/supabase-js';
import { CodaClient, buildColumnMap, pick, str, bool } from '../lib/coda-api';

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

const CODA_DOC = 'ZNxWl_DI2D';
const T_CONTRATISTAS = 'grid-b-HTXuSZp4';

if (!CODA_API_KEY) throw new Error('Falta CODA_API_KEY');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');

/** Persona Fisica / Moral del Coda → constraint values del schema. */
function normalizePersonalidad(v: string | null): 'Persona Física' | 'Persona Moral' | null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (s.includes('moral')) return 'Persona Moral';
  if (s.includes('fisica') || s.includes('física') || s.includes('persona f'))
    return 'Persona Física';
  return null;
}

/** RFC válido = 12 (PM) o 13 (PF) chars alfanum, no puro X. */
function isRfcValid(rfc: string | null): boolean {
  if (!rfc) return false;
  const s = rfc.trim().toUpperCase();
  if (s.length < 12 || s.length > 13) return false;
  if (/^X+$/.test(s)) return false;
  return true;
}

/** tipo_persona del schema erp.personas. */
function mapTipoPersona(personalidad: string | null): 'fisica' | 'moral' {
  return personalidad === 'Persona Moral' ? 'moral' : 'fisica';
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

  const cCols = await coda.listColumns(CODA_DOC, T_CONTRATISTAS);
  const cm = buildColumnMap(cCols);
  const cRows = await coda.listRowsAll(CODA_DOC, T_CONTRATISTAS);
  console.log(`Coda: ${cRows.length} contratistas.`);

  // Personas existentes — index por RFC + por nombre (lowercase trim).
  const { data: personas, error: pErr } = await sb
    .schema('erp')
    .from('personas')
    .select('id, nombre, rfc, tipo')
    .eq('empresa_id', empresaId);
  if (pErr) throw new Error(`Error leyendo personas: ${pErr.message}`);
  const rfcMap = new Map<string, string>();
  const nameContratistaMap = new Map<string, string>();
  for (const p of personas ?? []) {
    if (isRfcValid(p.rfc as string))
      rfcMap.set((p.rfc as string).trim().toUpperCase(), p.id as string);
    if ((p.tipo as string) === 'contratista' && p.nombre) {
      nameContratistaMap.set((p.nombre as string).trim().toLowerCase(), p.id as string);
    }
  }

  const registros = cRows
    .map((row) => {
      const v = row.values;
      const nombre = str(pick(v, cm, 'Contratista'));
      if (!nombre) return null;
      const personalidad = normalizePersonalidad(str(pick(v, cm, 'Persona Fisica o Moral')));
      const rfcRaw = str(pick(v, cm, 'RFC'));
      const rfc = rfcRaw?.trim().toUpperCase() ?? null;

      const persona = {
        empresa_id: empresaId,
        tipo: 'contratista',
        tipo_persona: mapTipoPersona(personalidad),
        nombre,
        email: str(pick(v, cm, 'email')),
        telefono: str(pick(v, cm, 'Telefono')),
        rfc,
      };

      const satelite = {
        empresa_id: empresaId,
        coda_row_id: row.id,
        abreviacion: str(pick(v, cm, 'Abreviación')),
        persona_fisica_o_moral: personalidad,
        representante_legal: str(pick(v, cm, 'Representante Legal')),
        repse: str(pick(v, cm, 'REPSE')),
        registro_patronal: str(pick(v, cm, 'Registro Patronal')),
        domicilio: str(pick(v, cm, 'Domicilio')),
        activo: bool(pick(v, cm, 'Activo')),
        // retencion_pct viene de "Retencion 5%" calculada — no la jalamos.
      };

      return { codaRowId: row.id, persona, satelite, rfc };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  console.log(`  ${registros.length} contratistas a procesar.`);

  if (DRY_RUN) {
    const conRfc = registros.filter((r) => isRfcValid(r.rfc)).length;
    const sinRfc = registros.length - conRfc;
    console.log(`  [DRY] ${conRfc} con RFC válido, ${sinRfc} sin RFC.`);
    return;
  }

  // ── 1. Personas ────────────────────────────────────────────────────────────
  let personaInserted = 0;
  let personaUpdated = 0;
  let personaError = 0;
  const personaIdPorCoda = new Map<string, string>();

  for (const r of registros) {
    // Match: RFC válido primero; si no, nombre + tipo='contratista'.
    let existingId: string | undefined;
    if (isRfcValid(r.rfc)) existingId = rfcMap.get(r.rfc!);
    if (!existingId) existingId = nameContratistaMap.get(r.persona.nombre.trim().toLowerCase());

    if (existingId) {
      // UPDATE — actualiza campos no-null + FORZAR tipo='contratista'.
      // Si la persona ya existía como 'general' / 'proveedor' / etc, este
      // import canónicamente la reclasifica como contratista (es la fuente
      // de verdad para esa columna). Sin este reclassify, contratos
      // posteriores skippean al lookup por tipo.
      const updateFields: Record<string, unknown> = { tipo: 'contratista' };
      for (const [k, v] of Object.entries(r.persona)) {
        if (v !== null && v !== undefined && k !== 'empresa_id' && k !== 'tipo') {
          updateFields[k] = v;
        }
      }
      const { error } = await sb
        .schema('erp')
        .from('personas')
        .update(updateFields)
        .eq('id', existingId);
      if (error) {
        console.error(`  ✗ UPDATE persona "${r.persona.nombre}": ${error.message}`);
        personaError++;
        continue;
      }
      personaUpdated++;
      personaIdPorCoda.set(r.codaRowId, existingId);
      // Refresh maps para próximas filas (mismo RFC sale en el mismo run).
      if (isRfcValid(r.rfc)) rfcMap.set(r.rfc!, existingId);
      nameContratistaMap.set(r.persona.nombre.trim().toLowerCase(), existingId);
    } else {
      // INSERT
      const { data: ins, error } = await sb
        .schema('erp')
        .from('personas')
        .insert(r.persona)
        .select('id')
        .single();
      if (error || !ins) {
        console.error(`  ✗ INSERT persona "${r.persona.nombre}": ${error?.message}`);
        personaError++;
        continue;
      }
      personaInserted++;
      personaIdPorCoda.set(r.codaRowId, ins.id as string);
      if (isRfcValid(r.rfc)) rfcMap.set(r.rfc!, ins.id as string);
      nameContratistaMap.set(r.persona.nombre.trim().toLowerCase(), ins.id as string);
    }
  }

  console.log(
    `  ✔ Personas: ${personaInserted} insertadas, ${personaUpdated} actualizadas, ${personaError} errores.`
  );

  // ── 2. Satélites contratistas_datos ───────────────────────────────────────
  const sateliteInserts = registros
    .map((r) => {
      const persona_id = personaIdPorCoda.get(r.codaRowId);
      if (!persona_id) return null;
      return { persona_id, ...r.satelite };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  let satOk = 0;
  let satErr = 0;
  for (const sat of sateliteInserts) {
    const { error } = await sb
      .schema('dilesa')
      .from('contratistas_datos')
      .upsert(sat, { onConflict: 'persona_id' });
    if (error) {
      console.error(`  ✗ UPSERT satélite persona_id ${sat.persona_id}: ${error.message}`);
      satErr++;
      continue;
    }
    satOk++;
  }

  console.log(`  ✔ Satélites: ${satOk} upsert, ${satErr} errores.`);

  console.log('\n✔ Script B (contratistas) terminado.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
