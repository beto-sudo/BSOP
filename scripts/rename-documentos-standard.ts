/* eslint-disable @typescript-eslint/no-explicit-any --
 * supabase-js tipa solo `public`; para leer/escribir en `erp`/`core`
 * usamos `as any` (mismo patrón que el resto de scripts de mantenimiento).
 */
/**
 * rename-documentos-standard.ts
 *
 * Script one-shot (idempotente) que aplica el formato estándar de título
 * y filename a todos los documentos históricos cuya extracción IA ya terminó.
 *
 * Formato:
 *   Título   → `DILESA-2025-12-Escritura_574`
 *   Filename → `DILESA-2025-12-Escritura_574.pdf`
 *
 * Se usa la misma lógica que el API route /api/documentos/[id]/extract
 * aplica a un doc individual tras procesarlo con IA, pero acá lo barremos
 * sobre toda la tabla en lote.
 *
 * Para cada doc con `extraccion_status='completado'`:
 *   1. Si el título actual NO es estándar (isStandardTitulo = false) y
 *      tenemos empresa_slug + tipo + fecha_emision + numero_documento,
 *      genera el título estándar y lo aplica.
 *   2. Para el adjunto con `rol='documento_principal'` más reciente, si el
 *      filename no cumple el formato, hace `storage.move()` al nombre
 *      estándar (conservando el prefijo de carpeta existente) y actualiza
 *      `erp.adjuntos.url/nombre`.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/rename-documentos-standard.ts     # preview
 *   npx tsx scripts/rename-documentos-standard.ts               # aplica
 *   LIMIT=5 npx tsx scripts/rename-documentos-standard.ts       # primeros 5
 *   ONLY_ID=<uuid> npx tsx scripts/rename-documentos-standard.ts
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (requeridos)
 *   DRY_RUN, LIMIT, ONLY_ID, EMPRESA_ID                  (opcionales)
 */

import { createClient } from '@supabase/supabase-js';

import { getAdjuntoPath } from '../lib/adjuntos';
import {
  buildStandardFilename,
  buildStandardTitulo,
  isStandardTitulo,
} from '../lib/documentos/naming';

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : null;
const ONLY_ID = process.env.ONLY_ID ?? null;
const EMPRESA_ID = process.env.EMPRESA_ID ?? null;
const BUCKET = 'adjuntos';

if (!SUPABASE_URL) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
if (!SUPABASE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Helpers ──────────────────────────────────────────────────────────────────

type DocRow = {
  id: string;
  empresa_id: string;
  titulo: string;
  tipo: string | null;
  fecha_emision: string | null;
  numero_documento: string | null;
  extraccion_status: string | null;
};

type EmpresaRow = { id: string; slug: string };

async function fetchDocs(): Promise<DocRow[]> {
  let q = (supabase.schema('erp') as any)
    .from('documentos')
    .select('id, empresa_id, titulo, tipo, fecha_emision, numero_documento, extraccion_status')
    .eq('extraccion_status', 'completado')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (ONLY_ID) q = q.eq('id', ONLY_ID);
  if (EMPRESA_ID) q = q.eq('empresa_id', EMPRESA_ID);
  if (LIMIT) q = q.limit(LIMIT);
  const { data, error } = await q;
  if (error) throw new Error(`fetch documentos: ${error.message}`);
  return (data ?? []) as DocRow[];
}

async function fetchEmpresaSlugs(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await (supabase.schema('core') as any)
    .from('empresas')
    .select('id, slug')
    .in('id', ids);
  if (error) throw new Error(`fetch empresas: ${error.message}`);
  const map = new Map<string, string>();
  for (const e of (data ?? []) as EmpresaRow[]) {
    map.set(e.id, e.slug);
  }
  return map;
}

async function fetchAdjuntosForDoc(
  documentoId: string
): Promise<Array<{ id: string; url: string; nombre: string | null; created_at: string }>> {
  const { data, error } = await (supabase.schema('erp') as any)
    .from('adjuntos')
    .select('id, url, nombre, created_at')
    .eq('entidad_tipo', 'documento')
    .eq('rol', 'documento_principal')
    .eq('entidad_id', documentoId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`fetch adjuntos ${documentoId}: ${error.message}`);
  return data ?? [];
}

// ─── Procesamiento por doc ────────────────────────────────────────────────────

type Outcome =
  | { ok: true; id: string; titulo: string; changes: string[] }
  | { ok: false; id: string; titulo: string; reason: string };

async function processDoc(doc: DocRow, empresaSlug: string | undefined): Promise<Outcome> {
  const changes: string[] = [];

  const nuevoTitulo = buildStandardTitulo({
    empresaSlug: empresaSlug ?? null,
    tipo: doc.tipo,
    fecha: doc.fecha_emision,
    numero: doc.numero_documento,
  });

  // Si no hay data suficiente para generar estándar, saltar.
  if (!nuevoTitulo) {
    return {
      ok: false,
      id: doc.id,
      titulo: doc.titulo,
      reason: `sin data suficiente (slug=${empresaSlug}, tipo=${doc.tipo}, fecha=${doc.fecha_emision}, num=${doc.numero_documento})`,
    };
  }

  // 1) Título: solo tocamos si NO está ya en formato estándar. Respeta
  //    ediciones manuales a un título custom distinto del estándar
  //    (ej. "Nuestra escritura de la parcela grande").
  const tituloActualEstandar = isStandardTitulo(doc.titulo);
  const tituloCambia = !tituloActualEstandar && nuevoTitulo !== doc.titulo;

  if (tituloCambia) {
    changes.push(`titulo: "${doc.titulo}" → "${nuevoTitulo}"`);
    if (!DRY_RUN) {
      const { error } = await (supabase.schema('erp') as any)
        .from('documentos')
        .update({ titulo: nuevoTitulo, updated_at: new Date().toISOString() })
        .eq('id', doc.id);
      if (error) {
        return {
          ok: false,
          id: doc.id,
          titulo: doc.titulo,
          reason: `update titulo: ${error.message}`,
        };
      }
    }
  }

  // 2) Filename: solo procesamos el adjunto documento_principal más reciente.
  const adjuntos = await fetchAdjuntosForDoc(doc.id);
  if (adjuntos.length === 0) {
    // No hay PDF principal — no hay nada que renombrar. Ok.
    return { ok: true, id: doc.id, titulo: nuevoTitulo, changes };
  }

  const adjunto = adjuntos[0];
  const currentPath = getAdjuntoPath(adjunto.url);
  if (!currentPath) {
    return {
      ok: false,
      id: doc.id,
      titulo: doc.titulo,
      reason: `adjunto ${adjunto.id}: url/path inválido "${adjunto.url}"`,
    };
  }

  const targetFilename = buildStandardFilename(nuevoTitulo);
  const prefix = currentPath.includes('/')
    ? currentPath.slice(0, currentPath.lastIndexOf('/') + 1)
    : `${(empresaSlug ?? 'docs').toLowerCase()}/escrituras/`;
  const targetPath = `${prefix}${targetFilename}`;

  if (currentPath === targetPath) {
    // Ya está con el nombre estándar.
    return { ok: true, id: doc.id, titulo: nuevoTitulo, changes };
  }

  changes.push(`archivo: "${currentPath}" → "${targetPath}"`);

  if (!DRY_RUN) {
    const { error: mvErr } = await supabase.storage.from(BUCKET).move(currentPath, targetPath);
    if (mvErr) {
      return {
        ok: false,
        id: doc.id,
        titulo: doc.titulo,
        reason: `storage.move falló: ${mvErr.message}`,
      };
    }
    const { error: adjErr } = await (supabase.schema('erp') as any)
      .from('adjuntos')
      .update({ url: targetPath, nombre: targetFilename })
      .eq('id', adjunto.id);
    if (adjErr) {
      return {
        ok: false,
        id: doc.id,
        titulo: doc.titulo,
        reason: `update adjuntos.url falló: ${adjErr.message}`,
      };
    }
  }

  return { ok: true, id: doc.id, titulo: nuevoTitulo, changes };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('─────────────────────────────────────────────────────');
  console.log(' rename-documentos-standard');
  console.log('─────────────────────────────────────────────────────');
  console.log(` DRY_RUN    = ${DRY_RUN}`);
  console.log(` LIMIT      = ${LIMIT ?? '(todos)'}`);
  console.log(` ONLY_ID    = ${ONLY_ID ?? '-'}`);
  console.log(` EMPRESA_ID = ${EMPRESA_ID ?? '(todas)'}`);
  console.log('');

  const docs = await fetchDocs();
  console.log(`Documentos con extracción completada: ${docs.length}`);

  const empresaIds = [...new Set(docs.map((d) => d.empresa_id))];
  const slugs = await fetchEmpresaSlugs(empresaIds);

  const results: Outcome[] = [];
  for (const doc of docs) {
    const slug = slugs.get(doc.empresa_id);
    const r = await processDoc(doc, slug);
    results.push(r);
    if (r.ok) {
      if (r.changes.length > 0) {
        console.log(`✓ ${doc.id.slice(0, 8)} ${r.titulo}`);
        for (const c of r.changes) console.log(`    · ${c}`);
      } else {
        console.log(`· ${doc.id.slice(0, 8)} ${r.titulo}  (ya estándar, sin cambios)`);
      }
    } else {
      console.log(`✗ ${doc.id.slice(0, 8)} "${doc.titulo}"\n    · ${r.reason}`);
    }
  }

  const changed = results.filter((r) => r.ok && r.changes.length > 0).length;
  const already = results.filter((r) => r.ok && r.changes.length === 0).length;
  const failed = results.filter((r) => !r.ok).length;

  console.log('');
  console.log('─── Reporte ─────────────────────────────────────────');
  console.log(`Total:         ${results.length}`);
  console.log(`Cambiados:     ${changed}`);
  console.log(`Ya estándar:   ${already}`);
  console.log(`Falló:         ${failed}`);
  if (DRY_RUN) {
    console.log('\n⚠️  DRY_RUN=1 — no se escribió nada en la DB ni en el bucket.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
