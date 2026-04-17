/**
 * migrate_dilesa_juntas.ts
 *
 * Pulls junta (meeting) data from the DILESA Coda workspace (Doc ZNxWl_DI2D)
 * and inserts it into the BSOP Supabase ERP schema.
 *
 * Tables pulled:
 *   grid-9m184aI_C3  →  Juntas  →  erp.juntas + erp.juntas_asistencia
 *
 * Coda columns:
 *   c-pJhgUGNQWx  (Nombre de Junta)        → titulo
 *   c-RvouzFbaMe  (Tipo de Junta)           → tipo
 *   c-QGdQfgxp9G  (Fecha de Junta)          → fecha_hora
 *   c-jz0C4Z32c6  (Fecha Junta Terminada)   → estado (completada if present, else programada)
 *   c-VaEbXI1qND  (Temas)                   → descripcion (markdown → HTML)
 *   c-0CHe1t7Hu4  (Asistentes)              → juntas_asistencia records
 *   c-n1OZVl7e6y  (Tareas Creadas en Junta) → link erp.tasks by titulo match
 *
 * Prerequisites:
 *   CODA_API_KEY              – Coda personal API token
 *   NEXT_PUBLIC_SUPABASE_URL  – Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY – Service role key (bypasses RLS)
 *
 * Usage:
 *   npx tsx scripts/migrate_dilesa_juntas.ts
 *   DRY_RUN=1 npx tsx scripts/migrate_dilesa_juntas.ts   # preview only
 */

import { createClient } from '@supabase/supabase-js';

// ─── Config ───────────────────────────────────────────────────────────────────

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const EMPRESA_ID = 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479';
const DRY_RUN = process.env.DRY_RUN === '1';

const CODA_DOC_ID = 'ZNxWl_DI2D';
const JUNTAS_TABLE_ID = 'grid-9m184aI_C3';

// Column IDs
const COL_TITULO = 'c-pJhgUGNQWx';
const COL_TIPO = 'c-RvouzFbaMe';
const COL_FECHA = 'c-QGdQfgxp9G';
const COL_FECHA_TERMINADA = 'c-jz0C4Z32c6';
const COL_TEMAS = 'c-VaEbXI1qND';
const COL_ASISTENTES = 'c-0CHe1t7Hu4';
const COL_TAREAS = 'c-n1OZVl7e6y';

// ─── Coda API helpers ─────────────────────────────────────────────────────────

interface CodaRow {
  id: string;
  name: string;
  values: Record<string, unknown>;
}

async function codaGet<T>(path: string): Promise<T> {
  const res = await fetch(`https://coda.io/apis/v1${path}`, {
    headers: { Authorization: `Bearer ${CODA_API_KEY}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Coda API ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function fetchAllRows(tableId: string): Promise<CodaRow[]> {
  const rows: CodaRow[] = [];
  let pageToken: string | undefined;

  do {
    const qs = new URLSearchParams({ limit: '200', valueFormat: 'rich' });
    if (pageToken) qs.set('pageToken', pageToken);

    const data = await codaGet<{ items: CodaRow[]; nextPageToken?: string }>(
      `/docs/${CODA_DOC_ID}/tables/${tableId}/rows?${qs}`,
    );
    rows.push(...data.items);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return rows;
}

// ─── Value helpers ────────────────────────────────────────────────────────────

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  return String(v).trim() || null;
}

function stripBackticks(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  return s.replace(/^`+|`+$/g, '').trim() || null;
}

function parseDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseNameList(v: unknown): string[] {
  const s = str(v);
  if (!s) return [];
  return s
    .split(/,|\n/)
    .map((n) => n.replace(/^[\s\-*•]+/, '').trim())
    .filter(Boolean);
}

function parseTaskList(v: unknown): string[] {
  const s = str(v);
  if (!s) return [];
  return s
    .split(/,|\n/)
    .map((n) => n.replace(/^[\s\-*•]+/, '').trim())
    .filter(Boolean);
}

// ─── Markdown → HTML converter ───────────────────────────────────────────────

function markdownToHtml(md: string): string {
  let html = md;

  // Headings (### before ##)
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Unordered lists (simple single-level)
  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;

  for (const line of lines) {
    const listMatch = line.match(/^[\s]*[-*+]\s+(.+)$/);
    if (listMatch) {
      if (!inList) { result.push('<ul>'); inList = true; }
      result.push(`<li>${listMatch[1]}</li>`);
    } else {
      if (inList) { result.push('</ul>'); inList = false; }
      if (line.trim() === '') {
        result.push('');
      } else if (!line.startsWith('<h')) {
        result.push(`<p>${line}</p>`);
      } else {
        result.push(line);
      }
    }
  }
  if (inList) result.push('</ul>');

  // Clean up empty paragraphs
  return result
    .join('\n')
    .replace(/<p><\/p>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Main migration ──────────────────────────────────────────────────────────

async function main() {
  if (!CODA_API_KEY) throw new Error('CODA_API_KEY is required');
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
  if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');

  console.log(`\n🚀 DILESA Juntas Migration — Doc: ${CODA_DOC_ID}`);
  if (DRY_RUN) console.log('📋 DRY RUN mode — no data will be written\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Load personas for name→id mapping ────────────────────────────────────
  const { data: personasRaw } = await supabase
    .schema('erp' as any)
    .from('personas')
    .select('id, nombre, apellido_paterno')
    .eq('empresa_id', EMPRESA_ID)
    .eq('activo', true)
    .is('deleted_at', null);

  const personaMap = new Map<string, string>();
  for (const p of personasRaw ?? []) {
    const fullName = [p.nombre, p.apellido_paterno].filter(Boolean).join(' ').toLowerCase().trim();
    personaMap.set(fullName, p.id);
    if (p.nombre) personaMap.set(p.nombre.toLowerCase().trim(), p.id);
  }
  console.log(`📇 Loaded ${personaMap.size} persona name mappings`);

  // ── Load existing tasks for title matching ───────────────────────────────
  const { data: existingTasks } = await supabase
    .schema('erp' as any)
    .from('tasks')
    .select('id, titulo')
    .eq('empresa_id', EMPRESA_ID);

  const taskMap = new Map<string, string>();
  for (const t of existingTasks ?? []) {
    taskMap.set(t.titulo.toLowerCase().trim(), t.id);
  }
  console.log(`📋 Loaded ${taskMap.size} existing tasks for matching`);

  // ── Fetch Coda rows ──────────────────────────────────────────────────────
  console.log(`\n📥 Fetching rows from ${JUNTAS_TABLE_ID}...`);
  const rows = await fetchAllRows(JUNTAS_TABLE_ID);
  console.log(`   Found ${rows.length} rows\n`);

  let created = 0;
  let skipped = 0;
  let asistenciaCreated = 0;
  let tasksLinked = 0;

  for (const row of rows) {
    const v = row.values;
    const titulo = str(v[COL_TITULO]);
    if (!titulo) { skipped++; continue; }

    const tipo = stripBackticks(v[COL_TIPO]);
    const fechaHora = parseDate(v[COL_FECHA]);
    const fechaTerminada = parseDate(v[COL_FECHA_TERMINADA]);
    const estado = fechaTerminada ? 'completada' : 'programada';
    const temasRaw = str(v[COL_TEMAS]);
    const descripcion = temasRaw ? markdownToHtml(temasRaw) : null;
    const asistentesNames = parseNameList(v[COL_ASISTENTES]);
    const tareasNames = parseTaskList(v[COL_TAREAS]);

    console.log(`  📌 ${titulo}`);
    console.log(`     Tipo: ${tipo ?? '—'} | Estado: ${estado} | Fecha: ${fechaHora ?? '—'}`);
    console.log(`     Asistentes: ${asistentesNames.length} | Tareas: ${tareasNames.length}`);

    if (DRY_RUN) { created++; continue; }

    // Insert junta
    const { data: juntaData, error: jErr } = await supabase
      .schema('erp' as any)
      .from('juntas')
      .insert({
        empresa_id: EMPRESA_ID,
        titulo,
        tipo,
        fecha_hora: fechaHora ?? new Date().toISOString(),
        estado,
        descripcion,
        duracion_minutos: 60,
        lugar: null,
        creado_por: null,
      })
      .select('id')
      .single();

    if (jErr) {
      console.error(`     ❌ Error inserting junta: ${jErr.message}`);
      skipped++;
      continue;
    }
    created++;

    const juntaId = juntaData.id;

    // Insert asistencia records
    for (const name of asistentesNames) {
      const personaId = personaMap.get(name.toLowerCase().trim());
      if (!personaId) {
        console.log(`     ⚠️  Persona not found: "${name}"`);
        continue;
      }

      const { error: aErr } = await supabase
        .schema('erp' as any)
        .from('juntas_asistencia')
        .insert({
          empresa_id: EMPRESA_ID,
          junta_id: juntaId,
          persona_id: personaId,
          asistio: estado === 'completada' ? true : null,
        });

      if (aErr) {
        console.log(`     ⚠️  Error adding asistencia for "${name}": ${aErr.message}`);
      } else {
        asistenciaCreated++;
      }
    }

    // Link existing tasks
    for (const taskTitle of tareasNames) {
      const taskId = taskMap.get(taskTitle.toLowerCase().trim());
      if (!taskId) {
        console.log(`     ⚠️  Task not found: "${taskTitle}"`);
        continue;
      }

      const { error: tErr } = await supabase
        .schema('erp' as any)
        .from('tasks')
        .update({ entidad_tipo: 'junta', entidad_id: juntaId })
        .eq('id', taskId);

      if (tErr) {
        console.log(`     ⚠️  Error linking task "${taskTitle}": ${tErr.message}`);
      } else {
        tasksLinked++;
      }
    }
  }

  console.log(`\n✅ Migration complete!`);
  console.log(`   Juntas created: ${created}`);
  console.log(`   Juntas skipped: ${skipped}`);
  console.log(`   Asistencia records: ${asistenciaCreated}`);
  console.log(`   Tasks linked: ${tasksLinked}`);
  if (DRY_RUN) console.log('\n📋 DRY RUN — no data was written');
}

main().catch((err) => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
