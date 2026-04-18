/**
 * migrate_dilesa_notarias.ts
 *
 * Importa el catálogo de notarías desde Coda (Doc ZNxWl_DI2D, tabla grid-QQBtnCWp7z)
 * a ERP como terceros externos: erp.personas (tipo='proveedor') + erp.proveedores
 * (categoria='notaria'), asociados a DILESA.
 *
 * Deduplicación:
 *   - trim + quitar punto(s) al final + colapsar espacios + minúsculas
 *   - Variantes reconocidas: "Lic. Hugo Gonzalez" ≈ "Lic. Hugo Gonzalez."
 *   - No fusiona variantes con nombres sustancialmente distintos
 *
 * Después de correr este script, re-ejecutar migrate_dilesa_escrituras.ts para
 * que cada escritura quede ligada a su notario_proveedor_id.
 *
 * Prerequisites:
 *   CODA_API_KEY              – Coda personal API token
 *   NEXT_PUBLIC_SUPABASE_URL  – Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY – Service role key (bypasses RLS)
 *   DILESA_EMPRESA_ID         – UUID de DILESA en core.empresas
 *                               (SELECT id FROM core.empresas WHERE slug='dilesa')
 *
 * Usage:
 *   npx tsx scripts/migrate_dilesa_notarias.ts
 *   DRY_RUN=1 npx tsx scripts/migrate_dilesa_notarias.ts   # preview, sin escribir
 */

import { createClient } from '@supabase/supabase-js';

// ─── Config ───────────────────────────────────────────────────────────────────

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DILESA_EMPRESA_ID = process.env.DILESA_EMPRESA_ID ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

const CODA_DOC_ID = 'ZNxWl_DI2D';
const TABLE_ID = 'grid-QQBtnCWp7z';

// ─── Validation ───────────────────────────────────────────────────────────────

if (!CODA_API_KEY) throw new Error('Missing CODA_API_KEY');
if (!SUPABASE_URL) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
if (!SUPABASE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
if (!DILESA_EMPRESA_ID) throw new Error('Missing DILESA_EMPRESA_ID');

// ─── Coda types ───────────────────────────────────────────────────────────────

interface CodaRow {
  id: string;
  name: string;
  values: Record<string, unknown>;
}

interface CodaColumn {
  id: string;
  name: string;
}

// ─── Coda helpers ─────────────────────────────────────────────────────────────

async function codaGet<T>(path: string): Promise<T> {
  const res = await fetch(`https://coda.io/apis/v1${path}`, {
    headers: { Authorization: `Bearer ${CODA_API_KEY}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Coda ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function fetchColumns(tableId: string): Promise<Map<string, string>> {
  const data = await codaGet<{ items: CodaColumn[] }>(
    `/docs/${CODA_DOC_ID}/tables/${tableId}/columns`
  );
  const map = new Map<string, string>();
  for (const col of data.items) {
    map.set(col.name.toLowerCase().trim(), col.id);
    map.set(col.id, col.name.toLowerCase().trim()); // reverse lookup
  }
  return map;
}

async function fetchAllRows(tableId: string): Promise<CodaRow[]> {
  const rows: CodaRow[] = [];
  let pageToken: string | undefined;
  do {
    const url =
      `/docs/${CODA_DOC_ID}/tables/${tableId}/rows` +
      `?limit=500&valueFormat=simpleWithArrays` +
      (pageToken ? `&pageToken=${pageToken}` : '');
    const data = await codaGet<{ items: CodaRow[]; nextPageToken?: string }>(url);
    rows.push(...data.items);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return rows;
}

// ─── Normalización para deduplicación ────────────────────────────────────────

function normalizeKey(s: string): string {
  return s
    .trim()
    .replace(/\.+$/, '') // quita punto(s) al final
    .replace(/\s+/g, ' ') // colapsa espacios múltiples
    .toLowerCase();
}

function getString(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === 'string') return raw.trim() || null;
  if (Array.isArray(raw)) return raw.map(String).join(', ').trim() || null;
  return String(raw).trim() || null;
}

// ─── Mapeo de columnas de Coda → modelo ERP ──────────────────────────────────
//
// Intenta múltiples variantes de nombre de columna en orden.
// La tabla grid-QQBtnCWp7z puede tener columnas como:
//   Notaría / Nombre / Notario / Número / Número de Notaría / Ciudad / RFC / Teléfono / Dirección
//
// Si hay columnas distintas, ejecuta con DRY_RUN=1 primero para verlas.

interface NotariaRow {
  nombre: string; // nombre normalizado (sin punto final)
  nombre_original: string; // tal cual vino de Coda (para notas/display)
  numero_notaria: string | null;
  rfc: string | null;
  telefono: string | null;
  email: string | null;
  ciudad: string | null;
  direccion: string | null;
}

function mapRow(row: CodaRow, colMap: Map<string, string>): NotariaRow | null {
  const get = (name: string): unknown => {
    const id = colMap.get(name.toLowerCase().trim());
    return id ? row.values[id] : undefined;
  };

  // Nombre de la notaría — intenta variantes comunes
  const nombreRaw =
    getString(get('notaría')) ??
    getString(get('notaria')) ??
    getString(get('nombre')) ??
    getString(get('nombre notaria')) ??
    getString(get('nombre de la notaria')) ??
    getString(get('nombre de la notaría')) ??
    getString(get('notario')) ??
    row.name.trim();

  if (!nombreRaw) return null;

  return {
    nombre: normalizeKey(nombreRaw), // usado para dedup y como nombre canónico en ERP
    nombre_original: nombreRaw,
    numero_notaria:
      getString(get('número')) ??
      getString(get('numero')) ??
      getString(get('número de notaría')) ??
      getString(get('numero de notaria')) ??
      getString(get('no. notaria')) ??
      getString(get('no. notaría')) ??
      null,
    rfc: getString(get('rfc')) ?? null,
    telefono:
      getString(get('teléfono')) ?? getString(get('telefono')) ?? getString(get('tel')) ?? null,
    email:
      getString(get('email')) ??
      getString(get('correo')) ??
      getString(get('correo electrónico')) ??
      null,
    ciudad: getString(get('ciudad')) ?? getString(get('municipio')) ?? null,
    direccion:
      getString(get('dirección')) ??
      getString(get('direccion')) ??
      getString(get('domicilio')) ??
      null,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🚀 migrate_dilesa_notarias — DRY_RUN=${DRY_RUN}`);
  console.log(`   Doc: ${CODA_DOC_ID}  Tabla: ${TABLE_ID}`);
  console.log(`   DILESA empresa_id: ${DILESA_EMPRESA_ID}\n`);

  // 1. Columnas
  console.log('📋 Fetching columns...');
  const colMap = await fetchColumns(TABLE_ID);
  const columnNames = [...new Set([...colMap.keys()].filter((k) => !k.startsWith('c-')))].sort();
  console.log(`   Columnas disponibles: ${columnNames.join(', ')}\n`);

  // 2. Filas
  console.log('📥 Fetching rows...');
  const rows = await fetchAllRows(TABLE_ID);
  console.log(`   ${rows.length} filas obtenidas\n`);

  // 3. Mapear y deduplicar
  const mapped = rows
    .map((r) => mapRow(r, colMap))
    .filter((r): r is NotariaRow => r !== null && r.nombre.length > 0);

  // Dedup: clave = nombre normalizado; en caso de duplicado, conserva la primera
  const seen = new Map<string, NotariaRow>();
  const duplicates: string[] = [];
  for (const r of mapped) {
    if (seen.has(r.nombre)) {
      duplicates.push(
        `  dup: "${r.nombre_original}" → ya existe "${seen.get(r.nombre)!.nombre_original}"`
      );
    } else {
      seen.set(r.nombre, r);
    }
  }

  const unique = [...seen.values()];
  const skipped = rows.length - mapped.length;

  console.log(`✅ Filas mapeadas : ${mapped.length}`);
  console.log(`   Skipped (sin nombre): ${skipped}`);
  console.log(`   Duplicados fusionados: ${duplicates.length}`);
  console.log(`   Notarías únicas: ${unique.length}\n`);

  if (duplicates.length > 0) {
    console.log('🔄 Duplicados detectados:');
    duplicates.forEach((d) => console.log(d));
    console.log();
  }

  if (DRY_RUN) {
    console.log('🔍 DRY RUN — primeras 10 notarías a importar:');
    unique.slice(0, 10).forEach((n, i) => {
      console.log(`  [${i + 1}] ${n.nombre}`);
      if (n.numero_notaria) console.log(`       No. ${n.numero_notaria}`);
      if (n.rfc) console.log(`       RFC: ${n.rfc}`);
      if (n.ciudad) console.log(`       Ciudad: ${n.ciudad}`);
    });
    console.log('\n🛑 Dry run completo — sin escritura en base de datos.');
    return;
  }

  // 4. Insertar en Supabase
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  let insertedPersonas = 0;
  let updatedPersonas = 0;
  let insertedProveedores = 0;
  let updatedProveedores = 0;
  let errors = 0;

  for (const n of unique) {
    // ── Persona ──────────────────────────────────────────────────────────────
    // Buscamos por nombre normalizado (case-insensitive) + empresa
    const { data: existingPersona, error: lookupErr } = await supabase
      .schema('erp' as any)
      .from('personas')
      .select('id')
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .eq('tipo', 'proveedor')
      .ilike('nombre', n.nombre)
      .maybeSingle();

    if (lookupErr) {
      console.error(`❌ Lookup persona "${n.nombre}": ${lookupErr.message}`);
      errors++;
      continue;
    }

    let personaId: string;

    if (existingPersona?.id) {
      // Actualizar campos que pueden haberse enriquecido en Coda
      const { error: updErr } = await supabase
        .schema('erp' as any)
        .from('personas')
        .update({
          rfc: n.rfc ?? undefined,
          telefono: n.telefono ?? undefined,
          email: n.email ?? undefined,
        })
        .eq('id', existingPersona.id);

      if (updErr) {
        console.error(`❌ Update persona "${n.nombre}": ${updErr.message}`);
        errors++;
        continue;
      }
      personaId = existingPersona.id;
      updatedPersonas++;
    } else {
      const { data: inserted, error: insErr } = await supabase
        .schema('erp' as any)
        .from('personas')
        .insert({
          empresa_id: DILESA_EMPRESA_ID,
          nombre: n.nombre, // canónico normalizado
          apellido_paterno: null,
          apellido_materno: null,
          rfc: n.rfc ?? null,
          telefono: n.telefono ?? null,
          email: n.email ?? null,
          tipo: 'proveedor',
          activo: true,
        })
        .select('id')
        .single();

      if (insErr || !inserted) {
        console.error(`❌ Insert persona "${n.nombre}": ${insErr?.message}`);
        errors++;
        continue;
      }
      personaId = inserted.id;
      insertedPersonas++;
    }

    // ── Proveedor ─────────────────────────────────────────────────────────────
    const { data: existingProv, error: provLookupErr } = await supabase
      .schema('erp' as any)
      .from('proveedores')
      .select('id')
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .eq('persona_id', personaId)
      .maybeSingle();

    if (provLookupErr) {
      console.error(`❌ Lookup proveedor "${n.nombre}": ${provLookupErr.message}`);
      errors++;
      continue;
    }

    if (existingProv?.id) {
      // Asegurar que categoria='notaria' esté seteado
      const { error: updProvErr } = await supabase
        .schema('erp' as any)
        .from('proveedores')
        .update({ categoria: 'notaria' })
        .eq('id', existingProv.id);

      if (updProvErr) {
        console.error(`❌ Update proveedor "${n.nombre}": ${updProvErr.message}`);
        errors++;
        continue;
      }
      updatedProveedores++;
    } else {
      const { error: insProvErr } = await supabase
        .schema('erp' as any)
        .from('proveedores')
        .insert({
          empresa_id: DILESA_EMPRESA_ID,
          persona_id: personaId,
          categoria: 'notaria',
          activo: true,
          // codigo: numero_notaria se puede asignar si está disponible
          codigo: n.numero_notaria ?? null,
        });

      if (insProvErr) {
        console.error(`❌ Insert proveedor "${n.nombre}": ${insProvErr.message}`);
        errors++;
        continue;
      }
      insertedProveedores++;
    }

    process.stdout.write(
      `   personas +${insertedPersonas} ~${updatedPersonas} | proveedores +${insertedProveedores} ~${updatedProveedores} / ${unique.length}\r`
    );
  }

  console.log(`\n\n🎉 Done:`);
  console.log(`   Personas  : +${insertedPersonas} nuevas, ~${updatedPersonas} actualizadas`);
  console.log(
    `   Proveedores: +${insertedProveedores} nuevos, ~${updatedProveedores} actualizados`
  );
  if (errors > 0) console.log(`   ⚠️  ${errors} errores — revisar arriba`);
  console.log(`\n➡️  Ejecuta ahora: npx tsx scripts/migrate_dilesa_escrituras.ts`);
  console.log(`   para ligar cada escritura a su notario_proveedor_id.`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
