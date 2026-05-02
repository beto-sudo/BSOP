/* eslint-disable @typescript-eslint/no-explicit-any --
 * supabase-js tipa solo `public`; para leer/escribir en `erp` usamos `as any`
 * (mismo patrón que el resto de scripts de mantenimiento).
 */
/**
 * normalize-personas.ts
 *
 * Script one-shot (idempotente) para normalizar nombres propios en
 * `erp.personas` aplicando Title Case según convenciones del wizard de RH
 * (ver `lib/name-case.ts`).
 *
 * Contexto: el alta de empleados vía wizard ya normaliza al guardar. Pero
 * imports masivos (Contpaqi, IMSS, Coda, etc.) escriben los strings tal
 * cual vienen de la fuente — generalmente TODO EN MAYÚSCULAS. Eso se
 * arrastra a cualquier módulo que muestre el nombre sin re-normalizar al
 * render (tasks, juntas, listados varios).
 *
 * Este script limpia la fuente de verdad (`erp.personas`) en lugar de
 * obligar a cada módulo a aplicar `composeFullName` al pintar.
 *
 * Campos normalizados:
 *   - nombre, apellido_paterno, apellido_materno
 *   - contacto_emergencia_nombre, contacto_emergencia_parentesco
 *   - nacionalidad
 *
 * Campos que NO se tocan:
 *   - email, rfc, curp, nss, telefono, sexo, estado_civil, tipo,
 *     tipo_persona, fecha_nacimiento, domicilio (dirección — manejada
 *     por separado en `erp.personas_direcciones`).
 *   - lugar_nacimiento: el formato histórico es "CIUDAD, CÓDIGO_ESTADO"
 *     donde el código (CL=Coahuila, NL=Nuevo León, DF, etc.) viene de
 *     IMSS y debe quedar en MAYÚSCULAS. titleCase rompería esos códigos.
 *     Si se quiere normalizar este campo, requiere un script separado
 *     que parse "ciudad, código" y aplique reglas distintas a cada parte.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/normalize-personas.ts     # preview
 *   npx tsx scripts/normalize-personas.ts               # aplica
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL      (requerido)
 *   SUPABASE_SERVICE_ROLE_KEY     (requerido — bypassa RLS)
 *   DRY_RUN=1                     no escribe a DB, solo reporta
 *   EMPRESA_ID=<uuid>             limita a una empresa
 *   SHOW_DIFFS=1                  imprime cada cambio (default: solo conteo)
 */

import fs from 'node:fs';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';

import { titleCase } from '../lib/name-case';

// Carga `.env.local` buscando hacia arriba desde cwd hasta la raíz del FS.
// Necesario porque el repo se trabaja también desde worktrees
// (`.claude/worktrees/<n>/`) donde `.env.local` no se duplica — vive solo en
// la raíz del repo principal (`/Users/Beto/BSOP/.env.local`).
// El entorno real gana sobre el archivo (útil para sobrescribir ad-hoc).
function findEnvLocal(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, '.env.local');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function loadEnvLocal(): void {
  const envPath = findEnvLocal();
  if (!envPath) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';
const EMPRESA_ID = process.env.EMPRESA_ID ?? null;
const SHOW_DIFFS = process.env.SHOW_DIFFS === '1';

if (!SUPABASE_URL) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
if (!SUPABASE_KEY) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Campos sujetos a Title Case. Subset de los que normaliza el wizard de RH
// al guardar — excluimos lugar_nacimiento porque su formato histórico
// "CIUDAD, CÓDIGO_ESTADO" (códigos IMSS de 2 letras) requeriría parsing
// separado para no degradar el código del estado.
const TITLE_CASE_FIELDS = [
  'nombre',
  'apellido_paterno',
  'apellido_materno',
  'contacto_emergencia_nombre',
  'contacto_emergencia_parentesco',
  'nacionalidad',
] as const;

type Field = (typeof TITLE_CASE_FIELDS)[number];

type PersonaRow = {
  id: string;
  empresa_id: string;
  nombre: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  contacto_emergencia_nombre: string | null;
  contacto_emergencia_parentesco: string | null;
  nacionalidad: string | null;
};

type Change = {
  id: string;
  diffs: Array<{ field: Field; antes: string; despues: string }>;
};

async function fetchPersonas(): Promise<PersonaRow[]> {
  // Paginamos para evitar el cap default de 1000 rows. Patrón espejo de
  // scripts/link-documentos-adjuntos.ts (sin .order — el orden no importa
  // para este script y .order sobre uuid bloquea queries grandes).
  const PAGE = 1000;
  const all: PersonaRow[] = [];
  let from = 0;
  const SELECT =
    'id, empresa_id, nombre, apellido_paterno, apellido_materno, contacto_emergencia_nombre, contacto_emergencia_parentesco, nacionalidad';

  for (;;) {
    let q = supabase
      .schema('erp' as any)
      .from('personas')
      .select(SELECT)
      .is('deleted_at', null)
      .range(from, from + PAGE - 1);

    if (EMPRESA_ID) q = q.eq('empresa_id', EMPRESA_ID);

    const { data, error } = await q;
    if (error) throw new Error(`fetch personas (offset ${from}): ${error.message}`);

    const rows = (data ?? []) as unknown as PersonaRow[];
    all.push(...rows);
    process.stdout.write(`  fetched ${all.length}…\r`);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  process.stdout.write('\n');

  return all;
}

function diffPersona(p: PersonaRow): Change | null {
  const diffs: Change['diffs'] = [];
  for (const field of TITLE_CASE_FIELDS) {
    const current = p[field];
    if (!current) continue;
    const normalized = titleCase(current);
    if (normalized && normalized !== current) {
      diffs.push({ field, antes: current, despues: normalized });
    }
  }
  if (diffs.length === 0) return null;
  return { id: p.id, diffs };
}

function buildUpdatePayload(change: Change): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const d of change.diffs) {
    payload[d.field] = d.despues;
  }
  payload.updated_at = new Date().toISOString();
  return payload;
}

async function main() {
  console.log('─────────────────────────────────────────────────────');
  console.log(' normalize-personas');
  console.log('─────────────────────────────────────────────────────');
  console.log(` DRY_RUN     = ${DRY_RUN}`);
  console.log(` EMPRESA_ID  = ${EMPRESA_ID ?? '(todas)'}`);
  console.log(` SHOW_DIFFS  = ${SHOW_DIFFS}`);
  console.log('');

  const personas = await fetchPersonas();
  console.log(`Total personas activas: ${personas.length}`);

  const changes: Change[] = [];
  const fieldCounts = new Map<Field, number>();

  for (const p of personas) {
    const c = diffPersona(p);
    if (!c) continue;
    changes.push(c);
    for (const d of c.diffs) {
      fieldCounts.set(d.field, (fieldCounts.get(d.field) ?? 0) + 1);
    }
  }

  console.log(`Personas con cambios:    ${changes.length}`);

  if (changes.length > 0) {
    console.log('');
    console.log('Distribución por campo:');
    for (const [field, n] of [...fieldCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n.toString().padStart(4)} × ${field}`);
    }
  }

  if (SHOW_DIFFS && changes.length > 0) {
    console.log('');
    console.log('Cambios propuestos:');
    const SAMPLE = SHOW_DIFFS ? changes.length : 20;
    for (const c of changes.slice(0, SAMPLE)) {
      console.log(`  ${c.id}`);
      for (const d of c.diffs) {
        console.log(`    ${d.field}: "${d.antes}" → "${d.despues}"`);
      }
    }
  }

  if (DRY_RUN) {
    console.log('');
    console.log('⚠️  DRY_RUN=1 — no se escribió nada. Re-correr sin DRY_RUN para aplicar.');
    return;
  }

  if (changes.length === 0) {
    console.log('Nada que cambiar.');
    return;
  }

  console.log('');
  console.log(`Aplicando ${changes.length} updates…`);

  let ok = 0;
  let fail = 0;
  for (const c of changes) {
    const { error } = await (supabase.schema('erp') as any)
      .from('personas')
      .update(buildUpdatePayload(c))
      .eq('id', c.id);
    if (error) {
      console.error(`  ✗ ${c.id}: ${error.message}`);
      fail++;
    } else {
      ok++;
    }
  }

  console.log('');
  console.log('─── Reporte ─────────────────────────────────────────');
  console.log(`Updates ok:    ${ok}`);
  console.log(`Updates fail:  ${fail}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
