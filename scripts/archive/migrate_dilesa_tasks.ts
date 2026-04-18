/**
 * migrate_dilesa_tasks.ts
 *
 * Pulls task data from the DILESA Coda workspace (Doc ZNxWl_DI2D)
 * and inserts it into the BSOP Supabase ERP schema.
 *
 * Tables pulled:
 *   grid-k2DnukE2K-  →  Tareas  →  erp.tasks
 *
 * Coda columns:
 *   Terminada        → estado (completado / pendiente)
 *   Tarea            → titulo
 *   Fecha Compromiso → fecha_vence
 *   Comentarios      → descripcion
 *   Responsable      → asignado_a (lookup in erp.empleados by persona name)
 *   Empresa          → (filtered to DILESA only)
 *
 * Prerequisites:
 *   CODA_API_KEY              – Coda personal API token
 *   NEXT_PUBLIC_SUPABASE_URL  – Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY – Service role key (bypasses RLS)
 *   DILESA_EMPRESA_ID         – UUID of the DILESA row in core.empresas
 *
 * Usage:
 *   npx tsx scripts/migrate_dilesa_tasks.ts
 *   DRY_RUN=1 npx tsx scripts/migrate_dilesa_tasks.ts   # preview only
 */

import { createClient } from '@supabase/supabase-js';

// ─── Config ───────────────────────────────────────────────────────────────────

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DILESA_EMPRESA_ID = process.env.DILESA_EMPRESA_ID ?? 'f5942ed4-7a6b-4c39-af18-67b9fbf7f479';
const DRY_RUN = process.env.DRY_RUN === '1';

const CODA_DOC_ID = 'ZNxWl_DI2D';
const TASKS_TABLE_ID = 'grid-k2DnukE2K-';

// ─── Coda API helpers ─────────────────────────────────────────────────────────

interface CodaRow {
  id: string;
  name: string;
  values: Record<string, unknown>;
}

interface CodaColumn {
  id: string;
  name: string;
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

async function fetchColumns(tableId: string): Promise<Map<string, string>> {
  const data = await codaGet<{ items: CodaColumn[] }>(
    `/docs/${CODA_DOC_ID}/tables/${tableId}/columns`
  );
  const map = new Map<string, string>();
  for (const col of data.items) {
    map.set(col.name.toLowerCase().trim(), col.id);
    map.set(col.id, col.name.toLowerCase().trim());
  }
  return map;
}

async function fetchAllRows(tableId: string): Promise<CodaRow[]> {
  const rows: CodaRow[] = [];
  let pageToken: string | undefined;

  do {
    const qs = new URLSearchParams({ limit: '200', valueFormat: 'simple' });
    if (pageToken) qs.set('pageToken', pageToken);

    const data = await codaGet<{ items: CodaRow[]; nextPageToken?: string }>(
      `/docs/${CODA_DOC_ID}/tables/${tableId}/rows?${qs}`
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

function dateStr(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

function pick(
  values: Record<string, unknown>,
  colMap: Map<string, string>,
  ...candidates: string[]
): unknown {
  for (const name of candidates) {
    const id = colMap.get(name.toLowerCase().trim());
    if (id && values[id] !== undefined) return values[id];
    if (values[name] !== undefined) return values[name];
  }
  return undefined;
}

// ─── Main migration ──────────────────────────────────────────────────────────

async function main() {
  if (!CODA_API_KEY) throw new Error('CODA_API_KEY is required');
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
  if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');

  console.log(`\n🚀 DILESA Tasks Migration — Doc: ${CODA_DOC_ID}`);
  if (DRY_RUN) console.log('📋 DRY RUN mode — no data will be written\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Load empleados for name→id mapping ────────────────────────────────────
  console.log('\n─── Loading empleados ───────────────────────────────────────');
  const { data: empRows } = await supabase
    .schema('erp' as any)
    .from('empleados')
    .select('id, persona:persona_id(nombre, apellido_paterno)')
    .eq('empresa_id', DILESA_EMPRESA_ID)
    .eq('activo', true)
    .is('deleted_at', null);

  function normalize(s: string): string {
    return s.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  const empleadoNameToId = new Map<string, string>();
  const empleadoNombres: { full: string; id: string }[] = [];
  for (const e of empRows ?? []) {
    const p = e.persona as any;
    if (!p) continue;
    const fullName = normalize([p.nombre, p.apellido_paterno].filter(Boolean).join(' '));
    empleadoNameToId.set(fullName, e.id);
    empleadoNombres.push({ full: fullName, id: e.id });
    if (p.nombre) empleadoNameToId.set(normalize(p.nombre), e.id);
  }
  console.log(
    `Loaded ${empleadoNombres.length} empleados (${empleadoNameToId.size} name→id mappings)`
  );

  // ── Fetch tasks from Coda ─────────────────────────────────────────────────
  console.log('\n─── Tareas ──────────────────────────────────────────────────');
  const cols = await fetchColumns(TASKS_TABLE_ID);
  const rows = await fetchAllRows(TASKS_TABLE_ID);
  console.log(`Fetched ${rows.length} rows from Coda`);

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const v = row.values;

    const titulo = str(pick(v, cols, 'tarea', 'titulo', 'nombre', 'name', row.name)) ?? row.name;
    if (!titulo?.trim()) {
      console.log(`  ⚠ skipped (empty titulo): row ${row.id}`);
      skipped++;
      continue;
    }

    const descripcion = str(pick(v, cols, 'comentarios', 'descripcion', 'descripción', 'notas'));
    const fechaVence = dateStr(
      pick(v, cols, 'fecha compromiso', 'fecha_compromiso', 'fecha vencimiento', 'fecha límite')
    );

    // Terminada: boolean or "true"/"false" string
    const terminadaRaw = pick(v, cols, 'terminada', 'completada', 'done', 'completado');
    const terminada = terminadaRaw === true || String(terminadaRaw).toLowerCase() === 'true';

    // Priority & Status mapping from CSV logic
    const estadoRaw = str(pick(v, cols, 'estado'));
    const prioridadRaw = str(pick(v, cols, 'prioridad'));
    const iniciativa = str(pick(v, cols, 'iniciativa'));
    const departamentoNombre = str(pick(v, cols, 'departamento'));
    const tipo = str(pick(v, cols, 'tipo de tarea', 'tipo'));
    const motivoBloqueo = str(pick(v, cols, 'motivo bloqueo', 'motivo_bloqueo'));
    const siguienteAccion = str(
      pick(v, cols, 'siguiente acción', 'siguiente_accion', 'siguiente accion')
    );
    const avanceRaw = pick(v, cols, 'avance', '%avance', '% avance');
    const avance =
      typeof avanceRaw === 'number'
        ? avanceRaw
        : parseInt(String(avanceRaw)) || (terminada ? 100 : 0);

    let estado = terminada ? 'completado' : 'pendiente';
    if (!terminada && estadoRaw) {
      const e = estadoRaw.toLowerCase();
      if (e.includes('proceso')) estado = 'en_progreso';
      if (e.includes('bloquea')) estado = 'bloqueado';
      if (e.includes('cancel')) estado = 'cancelado';
    }

    // Responsable: lookup text → empleado_id
    const responsableRaw = str(pick(v, cols, 'responsable', 'asignado a', 'asignado'));
    let asignadoA: string | null = null;
    if (responsableRaw) {
      const codaName = normalize(responsableRaw);
      // 1. Exact match
      asignadoA = empleadoNameToId.get(codaName) ?? null;
      // 2. Coda name starts with nombre+apellido_paterno (handles extra apellido_materno)
      if (!asignadoA) {
        const match = empleadoNombres.find((e) => codaName.startsWith(e.full));
        asignadoA = match?.id ?? null;
      }
      // 3. nombre+apellido_paterno starts with Coda name (Coda has shorter name)
      if (!asignadoA) {
        const match = empleadoNombres.find((e) => e.full.startsWith(codaName));
        asignadoA = match?.id ?? null;
      }
      // 4. First name only
      if (!asignadoA) {
        const firstName = codaName.split(' ')[0];
        asignadoA = empleadoNameToId.get(firstName) ?? null;
      }
      if (!asignadoA) {
        console.log(`  ⚠ no empleado match for "${responsableRaw}"`);
      }
    }

    const payload = {
      empresa_id: DILESA_EMPRESA_ID,
      titulo: titulo.trim(),
      descripcion,
      asignado_a: asignadoA,
      estado,
      fecha_vence: fechaVence,
      fecha_compromiso: fechaVence, // in DILESA CSV, fecha compromiso is the primary date
      fecha_completado: terminada ? new Date().toISOString() : null,
      porcentaje_avance: avance,
      iniciativa,
      departamento_nombre: departamentoNombre,
      tipo,
      motivo_bloqueo: motivoBloqueo,
      siguiente_accion: siguienteAccion,
      prioridad: prioridadRaw,
    };

    if (DRY_RUN) {
      console.log(
        `  [DRY] task: ${titulo} | estado=${estado} | resp=${responsableRaw ?? '-'} → ${asignadoA ?? 'unmatched'}`
      );
      continue;
    }

    // Deduplicate by titulo + empresa_id
    const { data: existing } = await supabase
      .schema('erp' as any)
      .from('tasks')
      .select('id')
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .eq('titulo', titulo.trim())
      .maybeSingle();

    if (existing) {
      console.log(`  ✓ exists: ${titulo}`);
      skipped++;
    } else {
      const { error: insErr } = await supabase
        .schema('erp' as any)
        .from('tasks')
        .insert(payload);
      if (insErr) {
        console.error(`  ✗ task "${titulo}": ${insErr.message}`);
        continue;
      }
      console.log(`  + created: ${titulo} (${estado})`);
      created++;
    }
  }

  console.log(`\n✅ Migration complete. Created: ${created}, Skipped: ${skipped}\n`);
}

main().catch((err) => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
