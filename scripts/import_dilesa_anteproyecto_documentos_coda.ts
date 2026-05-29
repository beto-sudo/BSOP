/**
 * import_dilesa_anteproyecto_documentos_coda.ts
 *
 * Iniciativa `dilesa-proyectos-checklist-inline` Sprint 1.5 (intermedio
 * antes de Sprint 2). Importa los archivos (PDF/JPG/...) que Beto subió
 * a la tabla canónica de Coda `grid-XLc0Md6iHp` (control de documentos
 * por anteproyecto) hacia BSOP:
 *
 *   1. Match cada fila de Coda a la tarea correspondiente en
 *      `dilesa.proyecto_tareas` por (anteproyecto.nombre, tarea.titulo).
 *      Alias map para resolver leves diferencias tipográficas.
 *   2. Descarga el archivo de `codahosted.io` (CDN público).
 *   3. Sube a Supabase Storage bucket `adjuntos` bajo el path canónico
 *      `dilesa/proyecto_tareas/<tareaId>/<ts>-<slug>.<ext>`.
 *   4. Inserta en `erp.adjuntos` con `entidad_tipo='proyecto_tarea'`,
 *      `rol='resultado'`, `url=<path>` (solo path, no URL completa —
 *      ver `lib/adjuntos.ts` FA3).
 *   5. Actualiza `dilesa.proyecto_tareas`:
 *      - `resultado_documento_url` = `/api/adjuntos/<path>` (proxy URL).
 *      - `estado='completada'` + `fecha_completada` desde Coda o hoy.
 *
 * Idempotente: si ya existe un row en `erp.adjuntos` para esa tarea
 * con el mismo `nombre`, se asume que ya importamos y se skipea (no
 * re-sube ni re-inserta). Si quieres forzar reimport, borra primero
 * el row de `erp.adjuntos` (que también desencadena delete del Storage
 * vía storage triggers o cleanup manual).
 *
 * Alcance: solo las 27 filas Coda CON archivo. Las 59 sin archivo no
 * se tocan (decisión documentada en planning: el Estatus "Entregado"
 * sin archivo es ruido — Beto lo cura manual en UI).
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/import_dilesa_anteproyecto_documentos_coda.ts
 *   npx tsx scripts/import_dilesa_anteproyecto_documentos_coda.ts
 */

import { createClient } from '@supabase/supabase-js';
import { CodaClient } from '../lib/coda-api';
import { buildAdjuntoPath } from '../lib/storage';

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

const CODA_DOC = 'ZNxWl_DI2D';
const CODA_TABLE = 'grid-XLc0Md6iHp';

// Columns observed via Coda API (see grid-XLc0Md6iHp inspection).
const COL_ARCHIVO = 'c-2xP7-jg6g5'; // attachments
const COL_ANTEPROYECTO_LOOKUP = 'c-LFVzckVHXi'; // lookup to *Anteproyectos
const COL_FECHA_ENTREGADO = 'c-UioDfcxo9x'; // date
const COL_ESTATUS = 'c-YBaUqbmi0Z'; // text

if (!CODA_API_KEY) throw new Error('Falta CODA_API_KEY');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');

/**
 * Alias map: tarea name in Coda → tarea title in BSOP. Resuelve los 3
 * mismatches detectados en el preflight (variación tipográfica).
 */
const TAREA_TITULO_ALIAS: Record<string, string> = {
  'Escritura o Contrato de Compraventa del Terreno': 'Escritura/Contrato Compraventa del Terreno',
};

function aliasTareaTitulo(coda: string): string {
  return TAREA_TITULO_ALIAS[coda] ?? coda;
}

type CodaAttachmentRich = {
  '@type': 'ImageObject';
  name: string;
  url: string;
  status?: string;
};

/**
 * Coda devuelve `c-LFVzckVHXi` como objeto rich con `.name`. Cuando se
 * usa `valueFormat: 'simple'` viene como string plano. Aceptamos ambos.
 */
function readAnteproyectoNombre(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'object' && 'name' in (v as Record<string, unknown>)) {
    const n = (v as { name?: unknown }).name;
    return typeof n === 'string' ? n.trim() : null;
  }
  return null;
}

function readArchivos(v: unknown): CodaAttachmentRich[] {
  if (!v) return [];
  if (Array.isArray(v)) return v as CodaAttachmentRich[];
  return [];
}

function parseFechaEntregada(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Coda devuelve fechas como ISO string en rich mode.
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

type TareaRow = { id: string; proyecto_id: string; titulo: string };
type ProyectoRow = { id: string; nombre: string };

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const coda = new CodaClient(CODA_API_KEY);

  // 1) Pre-cargar tareas + anteproyectos de BSOP en memoria.
  const { data: empRow, error: errEmp } = await sb
    .schema('core')
    .from('empresas')
    .select('id')
    .eq('slug', 'dilesa')
    .single();
  if (errEmp || !empRow) throw new Error(`No se encontró DILESA: ${errEmp?.message}`);
  const empresaId = (empRow as { id: string }).id;

  const { data: proyectosRaw } = await sb
    .schema('dilesa')
    .from('proyectos')
    .select('id, nombre')
    .eq('empresa_id', empresaId)
    .eq('tipo', 'anteproyecto')
    .is('deleted_at', null);
  const proyectos = (proyectosRaw ?? []) as ProyectoRow[];
  const proyByName = new Map(proyectos.map((p) => [p.nombre, p.id]));

  const proyectoIds = proyectos.map((p) => p.id);
  const { data: tareasRaw } =
    proyectoIds.length === 0
      ? { data: [] }
      : await sb
          .schema('dilesa')
          .from('proyecto_tareas')
          .select('id, proyecto_id, titulo')
          .in('proyecto_id', proyectoIds)
          .is('deleted_at', null);
  const tareas = (tareasRaw ?? []) as TareaRow[];
  const tareaByKey = new Map<string, TareaRow>();
  for (const t of tareas) tareaByKey.set(`${t.proyecto_id}||${t.titulo}`, t);

  // 2) Cargar todas las filas Coda y filtrar las que tienen archivo.
  const rows = await coda.listRowsAll(CODA_DOC, CODA_TABLE, { valueFormat: 'rich' });
  const conArchivo = rows.filter(
    (r) => readArchivos((r.values as Record<string, unknown>)[COL_ARCHIVO]).length > 0
  );
  console.log(
    `${DRY_RUN ? '[DRY RUN] ' : ''}Coda filas: ${rows.length} | con archivo: ${conArchivo.length}\n`
  );

  // 3) Iterar.
  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const row of conArchivo) {
    const vals = row.values as Record<string, unknown>;
    const anteNombre = readAnteproyectoNombre(vals[COL_ANTEPROYECTO_LOOKUP]);
    const tareaTitulo = aliasTareaTitulo(row.name);
    const tag = `${(anteNombre ?? '?').padEnd(35)} | ${tareaTitulo.padEnd(45)}`;

    if (!anteNombre) {
      console.log(`  ✗ [no-ante] ${tag}`);
      fail++;
      continue;
    }
    const proyectoId = proyByName.get(anteNombre);
    if (!proyectoId) {
      console.log(`  ✗ [ante NO match en BSOP: ${anteNombre}] ${tag}`);
      fail++;
      continue;
    }
    const tarea = tareaByKey.get(`${proyectoId}||${tareaTitulo}`);
    if (!tarea) {
      console.log(`  ✗ [tarea NO match] ${tag}`);
      fail++;
      continue;
    }

    const archivos = readArchivos(vals[COL_ARCHIVO]);
    const fechaEntregada =
      parseFechaEntregada(vals[COL_FECHA_ENTREGADO]) ?? new Date().toISOString().slice(0, 10);

    // 3a) Idempotencia: verificar si ya existen adjuntos para esta tarea
    //     con alguno de los nombres del set Coda.
    const archivosNames = archivos.map((a) => a.name);
    const { data: existingRaw } = await sb
      .schema('erp')
      .from('adjuntos')
      .select('nombre')
      .eq('empresa_id', empresaId)
      .eq('entidad_tipo', 'proyecto_tarea')
      .eq('entidad_id', tarea.id)
      .in('nombre', archivosNames);
    const yaExisten = new Set((existingRaw ?? []).map((a) => (a as { nombre: string }).nombre));

    // 3b) Por cada attachment, descargar + subir si no existe.
    const adjuntosCreados: { path: string; nombre: string }[] = [];
    for (const a of archivos) {
      if (yaExisten.has(a.name)) {
        console.log(`  [skip: ya importado] ${tag} | ${a.name}`);
        skip++;
        continue;
      }
      const path = buildAdjuntoPath({
        empresa: 'dilesa',
        entidad: 'proyecto_tareas',
        entidadId: tarea.id,
        filename: a.name,
      });

      if (DRY_RUN) {
        console.log(`  [dry] ${tag} | ${a.name} → ${path}`);
        ok++;
        adjuntosCreados.push({ path, nombre: a.name });
        continue;
      }

      // Descargar de Coda CDN.
      const resp = await fetch(a.url);
      if (!resp.ok) {
        console.log(`  ✗ [download ${resp.status}] ${tag} | ${a.name}`);
        fail++;
        continue;
      }
      const buf = new Uint8Array(await resp.arrayBuffer());
      const mime = resp.headers.get('content-type') ?? 'application/octet-stream';

      // Subir a Storage.
      const { error: upErr } = await sb.storage
        .from('adjuntos')
        .upload(path, buf, { upsert: false, contentType: mime });
      if (upErr) {
        console.log(`  ✗ [upload] ${tag} | ${a.name} | ${upErr.message}`);
        fail++;
        continue;
      }

      // Insertar en erp.adjuntos.
      const { error: insErr } = await sb.schema('erp').from('adjuntos').insert({
        empresa_id: empresaId,
        entidad_tipo: 'proyecto_tarea',
        entidad_id: tarea.id,
        nombre: a.name,
        url: path,
        tipo_mime: mime,
        tamano_bytes: buf.byteLength,
        rol: 'resultado',
      });
      if (insErr) {
        // Rollback storage.
        await sb.storage.from('adjuntos').remove([path]);
        console.log(`  ✗ [insert adjunto] ${tag} | ${a.name} | ${insErr.message}`);
        fail++;
        continue;
      }
      adjuntosCreados.push({ path, nombre: a.name });
      console.log(`  ✓ ${tag} | ${a.name} (${buf.byteLength} bytes)`);
      ok++;
    }

    // 3c) Actualizar la tarea: marcar completada + URL del primer archivo.
    if (adjuntosCreados.length > 0 || yaExisten.size > 0) {
      const primerNombre =
        adjuntosCreados[0]?.nombre ?? archivosNames.find((n) => yaExisten.has(n));
      const primerPath =
        adjuntosCreados[0]?.path ??
        // Si solo había existentes, recuperar el path desde DB.
        (await sb
          .schema('erp')
          .from('adjuntos')
          .select('url')
          .eq('empresa_id', empresaId)
          .eq('entidad_tipo', 'proyecto_tarea')
          .eq('entidad_id', tarea.id)
          .eq('nombre', primerNombre ?? '')
          .maybeSingle()
          .then(({ data }) => (data as { url?: string } | null)?.url)) ??
        null;

      if (primerPath && !DRY_RUN) {
        const { error: tErr } = await sb
          .schema('dilesa')
          .from('proyecto_tareas')
          .update({
            resultado_documento_url: `/api/adjuntos/${primerPath}`,
            estado: 'completada',
            fecha_completada: fechaEntregada,
          })
          .eq('id', tarea.id);
        if (tErr) {
          console.log(`  ⚠ [update tarea fail] ${tag} | ${tErr.message}`);
        }
      } else if (DRY_RUN && primerPath) {
        console.log(
          `  [dry-update] tarea ${tarea.id} → estado=completada, fecha=${fechaEntregada}, url=/api/adjuntos/${primerPath}`
        );
      }
    }
  }

  console.log(
    `\n${DRY_RUN ? 'Dry run summary' : 'Summary'}: subidos/marcados=${ok}, ya existían=${skip}, fallidos=${fail}`
  );
}

main().catch((e) => {
  console.error('Import failed:', e);
  process.exit(1);
});
