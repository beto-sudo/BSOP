/**
 * migrate_dilesa_hr.ts
 *
 * Pulls HR and Juntas data from the DILESA Coda workspace (Doc ZNxWl_DI2D)
 * and inserts it into the BSOP Supabase ERP schema.
 *
 * Tables pulled:
 *   grid-HPYcb1MLYH  →  Departamentos  →  erp.departamentos
 *   grid-CwSifc7FKQ  →  Puestos        →  erp.puestos
 *   grid-rCQIDVP9Qq  →  Personal       →  erp.personas + erp.empleados
 *   grid-9m184aI_C3  →  Juntas         →  erp.juntas
 *
 * Prerequisites:
 *   CODA_API_KEY          – Coda personal API token
 *   NEXT_PUBLIC_SUPABASE_URL – Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY – Service role key (bypasses RLS)
 *   DILESA_EMPRESA_ID     – UUID of the DILESA row in core.empresas
 *
 * Usage:
 *   npx tsx scripts/migrate_dilesa_hr.ts
 *   DRY_RUN=1 npx tsx scripts/migrate_dilesa_hr.ts   # preview only
 */

import { createClient } from '@supabase/supabase-js';

// ─── Config ───────────────────────────────────────────────────────────────────

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DILESA_EMPRESA_ID = process.env.DILESA_EMPRESA_ID ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

const CODA_DOC_ID = 'ZNxWl_DI2D';
const TABLE_IDS = {
  departamentos: 'grid-HPYcb1MLYH',
  puestos: 'grid-CwSifc7FKQ',
  personal: 'grid-rCQIDVP9Qq',
  juntas: 'grid-9m184aI_C3',
} as const;

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
    map.set(col.id, col.name.toLowerCase().trim()); // reverse lookup
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

// ─── Value helpers ─────────────────────────────────────────────────────────────

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

function tsStr(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Pick first matching column value from a row using a list of candidate names */
function pick(
  values: Record<string, unknown>,
  colMap: Map<string, string>,
  ...candidates: string[]
): unknown {
  for (const name of candidates) {
    const id = colMap.get(name.toLowerCase().trim());
    if (id && values[id] !== undefined) return values[id];
    // Also try by name directly (some Coda responses key by name)
    if (values[name] !== undefined) return values[name];
  }
  return undefined;
}

// ─── Main migration ────────────────────────────────────────────────────────────

async function main() {
  if (!CODA_API_KEY) throw new Error('CODA_API_KEY is required');
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
  if (!SUPABASE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  if (!DILESA_EMPRESA_ID) throw new Error('DILESA_EMPRESA_ID is required');

  console.log(`\n🚀 DILESA HR Migration — Doc: ${CODA_DOC_ID}`);
  if (DRY_RUN) console.log('📋 DRY RUN mode — no data will be written\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── 1. Departamentos ───────────────────────────────────────────────────────
  console.log('\n─── Departamentos ───────────────────────────────────────────');
  const deptCols = await fetchColumns(TABLE_IDS.departamentos);
  const deptRows = await fetchAllRows(TABLE_IDS.departamentos);
  console.log(`Fetched ${deptRows.length} rows from Coda`);

  // First pass: insert without padre_id, build name→id map
  const deptNameToId = new Map<string, string>();

  for (const row of deptRows) {
    const nombre = str(pick(row.values, deptCols, 'nombre', 'name', row.name)) ?? row.name;
    const codigo = str(pick(row.values, deptCols, 'código', 'codigo', 'code', 'clave'));

    const payload = {
      empresa_id: DILESA_EMPRESA_ID,
      nombre,
      codigo,
    };

    if (DRY_RUN) {
      console.log(`  [DRY] departamento: ${nombre}`);
      deptNameToId.set(nombre.toLowerCase(), `dry-${row.id}`);
      continue;
    }

    const { data, error } = await supabase
      .schema('erp' as any)
      .from('departamentos')
      .upsert(payload, { onConflict: 'empresa_id,codigo', ignoreDuplicates: false })
      .select('id, nombre')
      .single();

    if (error) {
      // If no codigo, try upsert by name via insert-or-select
      const { data: existing } = await supabase
        .schema('erp' as any)
        .from('departamentos')
        .select('id')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .eq('nombre', nombre)
        .maybeSingle();

      if (existing) {
        deptNameToId.set(nombre.toLowerCase(), existing.id);
        console.log(`  ✓ existing: ${nombre}`);
      } else {
        const { data: ins, error: insErr } = await supabase
          .schema('erp' as any)
          .from('departamentos')
          .insert(payload)
          .select('id')
          .single();
        if (insErr) {
          console.error(`  ✗ ${nombre}: ${insErr.message}`);
          continue;
        }
        deptNameToId.set(nombre.toLowerCase(), ins.id);
        console.log(`  + created: ${nombre}`);
      }
    } else if (data) {
      deptNameToId.set(data.nombre.toLowerCase(), data.id);
      console.log(`  ✓ upserted: ${nombre}`);
    }
  }

  // Second pass: set padre_id
  for (const row of deptRows) {
    const nombre = str(pick(row.values, deptCols, 'nombre', 'name', row.name)) ?? row.name;
    const padreName = str(pick(row.values, deptCols, 'padre', 'parent', 'reporta a', 'área'));
    if (!padreName || DRY_RUN) continue;
    const padreId = deptNameToId.get(padreName.toLowerCase());
    const selfId = deptNameToId.get(nombre.toLowerCase());
    if (padreId && selfId) {
      await supabase
        .schema('erp' as any)
        .from('departamentos')
        .update({ padre_id: padreId })
        .eq('id', selfId);
    }
  }

  // ── 2. Puestos ─────────────────────────────────────────────────────────────
  console.log('\n─── Puestos ─────────────────────────────────────────────────');
  const puestosCols = await fetchColumns(TABLE_IDS.puestos);
  const puestosRows = await fetchAllRows(TABLE_IDS.puestos);
  console.log(`Fetched ${puestosRows.length} rows from Coda`);

  const puestoNameToId = new Map<string, string>();

  for (const row of puestosRows) {
    // Real Coda column names (DILESA): "Puesto", "Objetivo del Puesto", "Perfil del Puesto",
    // "Requisitos del Puesto", "Esquema de Pago", "Reporta a:".
    // Generic fallbacks kept for other docs.
    const nombre =
      str(pick(row.values, puestosCols, 'puesto', 'nombre', 'name', row.name)) ?? row.name;
    const nivel = str(pick(row.values, puestosCols, 'nivel', 'level'));
    const deptName = str(pick(row.values, puestosCols, 'departamento', 'area', 'área'));
    const objetivo = str(
      pick(row.values, puestosCols, 'objetivo del puesto', 'objetivo', 'descripción', 'descripcion')
    );
    const perfil = str(
      pick(row.values, puestosCols, 'perfil del puesto', 'perfil', 'perfil requerido')
    );
    const requisitos = str(
      pick(row.values, puestosCols, 'requisitos del puesto', 'requisitos', 'requerimientos')
    );
    const esquema_pago = str(
      pick(row.values, puestosCols, 'esquema de pago', 'esquema_pago', 'tipo pago')
    );
    const sueldo_min_raw = pick(
      row.values,
      puestosCols,
      'sueldo mínimo',
      'sueldo minimo',
      'salario mínimo'
    );
    const sueldo_max_raw = pick(
      row.values,
      puestosCols,
      'sueldo máximo',
      'sueldo maximo',
      'salario máximo'
    );

    const departamento_id = deptName ? (deptNameToId.get(deptName.toLowerCase()) ?? null) : null;

    const payload = {
      empresa_id: DILESA_EMPRESA_ID,
      nombre,
      nivel,
      departamento_id,
      objetivo,
      perfil,
      requisitos,
      esquema_pago,
      sueldo_min: sueldo_min_raw != null ? parseFloat(String(sueldo_min_raw)) || null : null,
      sueldo_max: sueldo_max_raw != null ? parseFloat(String(sueldo_max_raw)) || null : null,
    };

    if (DRY_RUN) {
      console.log(`  [DRY] puesto: ${nombre}`);
      puestoNameToId.set(nombre.toLowerCase(), `dry-${row.id}`);
      continue;
    }

    const { data: existing } = await supabase
      .schema('erp' as any)
      .from('puestos')
      .select('id')
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .eq('nombre', nombre)
      .maybeSingle();

    if (existing) {
      await supabase
        .schema('erp' as any)
        .from('puestos')
        .update(payload)
        .eq('id', existing.id);
      puestoNameToId.set(nombre.toLowerCase(), existing.id);
      console.log(`  ✓ updated: ${nombre}`);
    } else {
      const { data: ins, error: insErr } = await supabase
        .schema('erp' as any)
        .from('puestos')
        .insert(payload)
        .select('id')
        .single();
      if (insErr) {
        console.error(`  ✗ ${nombre}: ${insErr.message}`);
        continue;
      }
      puestoNameToId.set(nombre.toLowerCase(), ins.id);
      console.log(`  + created: ${nombre}`);
    }
  }

  // Second pass: set reporta_a (hierarchy between puestos)
  for (const row of puestosRows) {
    const nombre =
      str(pick(row.values, puestosCols, 'puesto', 'nombre', 'name', row.name)) ?? row.name;
    const reportaNombre = str(
      pick(row.values, puestosCols, 'reporta a:', 'reporta a', 'reporta_a', 'superior')
    );
    if (!reportaNombre || DRY_RUN) continue;
    const reportaId = puestoNameToId.get(reportaNombre.toLowerCase());
    const selfId = puestoNameToId.get(nombre.toLowerCase());
    if (reportaId && selfId) {
      await supabase
        .schema('erp' as any)
        .from('puestos')
        .update({ reporta_a: reportaId })
        .eq('id', selfId);
    }
  }

  // ── 3. Personal (Personas + Empleados + Accionistas) ──────────────────────
  console.log('\n─── Personal ────────────────────────────────────────────────');
  const personalCols = await fetchColumns(TABLE_IDS.personal);
  const personalRows = await fetchAllRows(TABLE_IDS.personal);
  console.log(`Fetched ${personalRows.length} rows from Coda`);

  for (const row of personalRows) {
    const v = row.values;

    // Real DILESA column names:
    //   "Nombre" (c-ObirnCVfea), "Apellido Paterno" (c-9mZy0PyzJn), "Apellido Materno" (c-aQHoeTWsXU)
    //   "Nombre Completo" (c-Wrh0DnivNg) — fallback if no separate name parts
    //   "email personal" (c-fpcE4Orz02), "email Empresa" (c-G54-vp08Xn)
    //   "Telefono Celular" (c-9sXAREMQF9), "RFC" (c-6oNgTsqEz6), "CURP" (c-o5ZEovj7kg)
    //   "#Seguro Social" (c-kBz-C21IJu) / "IMSS" (c-e6eLKmYuXi)
    //   "Fecha de Nacimiento" (c-miyK9bE-dn), "Fecha Ingreso" (c-MdOKxIBTny)
    //   "Fecha Baja" (c-Y8PqFUBlwx), "Razón por la baja" (c-wrpE9taxg1)
    //   "Departamento" (c-uK--BTMPFL), "Puesto" (c-rQea5Ioo4v)
    //   "Extension Empresa" (c-6NHjQDc4P_)
    //   "Pertenece a:" (c-OsgLuvJG1Z) — "Accionista" | "Empleado"

    const nombre = str(pick(v, personalCols, 'nombre', 'name', 'nombres')) ?? row.name;
    if (!nombre?.trim()) {
      console.log(`  ⚠ skipped (empty nombre): row ${row.id}`);
      continue;
    }
    const apellido_paterno = str(
      pick(v, personalCols, 'apellido paterno', 'apellido_paterno', 'primer apellido')
    );
    const apellido_materno = str(
      pick(v, personalCols, 'apellido materno', 'apellido_materno', 'segundo apellido')
    );

    // Prefer corporate email for ERP identity; fall back to personal
    const emailEmpresa = str(
      pick(v, personalCols, 'email empresa', 'correo empresa', 'correo_empresa')
    );
    const emailPersonal = str(
      pick(v, personalCols, 'email personal', 'email', 'correo', 'correo electrónico')
    );
    const email = emailEmpresa ?? emailPersonal;

    const telefono = str(
      pick(
        v,
        personalCols,
        'telefono celular',
        'teléfono celular',
        'teléfono',
        'telefono',
        'celular',
        'móvil'
      )
    );
    const rfc = str(pick(v, personalCols, 'rfc'));
    const curp = str(pick(v, personalCols, 'curp'));
    // "#Seguro Social" is the NSS column (lowercased: "#seguro social")
    const nss = str(pick(v, personalCols, '#seguro social', 'nss', 'número seguro social', 'imss'));
    const fecha_nacimiento = dateStr(
      pick(
        v,
        personalCols,
        'fecha de nacimiento',
        'fecha nacimiento',
        'fecha_nacimiento',
        'nacimiento'
      )
    );
    const fecha_ingreso = dateStr(
      pick(v, personalCols, 'fecha ingreso', 'fecha_ingreso', 'ingreso')
    );
    const fecha_baja = dateStr(pick(v, personalCols, 'fecha baja', 'fecha_baja', 'baja'));
    const motivo_baja = str(
      pick(v, personalCols, 'razón por la baja', 'razon por la baja', 'motivo_baja', 'motivo baja')
    );
    const numero_empleado = str(
      pick(v, personalCols, 'número empleado', 'numero_empleado', 'no. empleado', 'clave')
    );
    const deptName = str(pick(v, personalCols, 'departamento', 'área', 'area'));
    const puestoRaw = str(pick(v, personalCols, 'puesto', 'cargo', 'posición'));
    const telefono_empresa = str(pick(v, personalCols, 'teléfono empresa', 'telefono_empresa'));
    const extension_val = str(
      pick(v, personalCols, 'extension empresa', 'extensión', 'extension', 'ext')
    );

    // ── Tipo detection ─────────────────────────────────────────────────────────
    // "Pertenece a:" column holds "Accionista" | "Empleado" (or empty → default empleado).
    // Fallback: check if Puesto text contains "Accionista" (covers rows with no Pertenece a: set).
    const perteneceA = str(
      pick(
        v,
        personalCols,
        'pertenece a:',
        'pertenece a',
        'pertenece a :',
        'tipo persona',
        'categoria'
      )
    );
    const esAccionista =
      perteneceA?.toLowerCase() === 'accionista' ||
      (!perteneceA && (puestoRaw?.toLowerCase().includes('accionista') ?? false));
    const tipo = esAccionista ? 'accionista' : 'empleado';

    // ── Puesto lookup (handles multi-value like "Accionista,Consejo de Administracion") ──
    // Try exact match first, then each comma-separated part, then trimmed variants
    const departamento_id = deptName ? (deptNameToId.get(deptName.toLowerCase()) ?? null) : null;
    let puesto_id: string | null = null;
    if (puestoRaw) {
      const variants = [puestoRaw, ...puestoRaw.split(',').map((p) => p.trim())];
      for (const pv of variants) {
        if (pv) {
          puesto_id = puestoNameToId.get(pv.toLowerCase()) ?? null;
          if (puesto_id) break;
        }
      }
    }

    // active = no fecha_baja set
    const activo = !fecha_baja;

    if (DRY_RUN) {
      console.log(
        `  [DRY] persona (${tipo}): ${nombre} ${apellido_paterno ?? ''} (${email ?? 'no email'}) dept=${deptName ?? '-'} puesto=${puestoRaw ?? '-'}`
      );
      continue;
    }

    // ── Upsert persona (by email if available, else by nombre+apellido) ────────
    let personaId: string;

    if (email) {
      const { data: existing } = await supabase
        .schema('erp' as any)
        .from('personas')
        .select('id')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (existing) {
        personaId = existing.id;
        await supabase
          .schema('erp' as any)
          .from('personas')
          .update({
            nombre,
            apellido_paterno,
            apellido_materno,
            telefono,
            rfc,
            curp,
            tipo,
          })
          .eq('id', personaId);
      } else {
        const { data: ins, error: insErr } = await supabase
          .schema('erp' as any)
          .from('personas')
          .insert({
            empresa_id: DILESA_EMPRESA_ID,
            nombre,
            apellido_paterno,
            apellido_materno,
            email: email.toLowerCase(),
            telefono,
            rfc,
            curp,
            tipo,
          })
          .select('id')
          .single();
        if (insErr) {
          console.error(`  ✗ persona ${nombre}: ${insErr.message}`);
          continue;
        }
        personaId = ins.id;
      }
    } else {
      const { data: existing } = await supabase
        .schema('erp' as any)
        .from('personas')
        .select('id')
        .eq('empresa_id', DILESA_EMPRESA_ID)
        .eq('nombre', nombre)
        .eq('apellido_paterno', apellido_paterno ?? '')
        .maybeSingle();

      if (existing) {
        personaId = existing.id;
        await supabase
          .schema('erp' as any)
          .from('personas')
          .update({ tipo })
          .eq('id', personaId);
      } else {
        const { data: ins, error: insErr } = await supabase
          .schema('erp' as any)
          .from('personas')
          .insert({
            empresa_id: DILESA_EMPRESA_ID,
            nombre,
            apellido_paterno,
            apellido_materno,
            telefono,
            rfc,
            curp,
            tipo,
          })
          .select('id')
          .single();
        if (insErr) {
          console.error(`  ✗ persona ${nombre}: ${insErr.message}`);
          continue;
        }
        personaId = ins.id;
      }
    }

    // ── Upsert empleado (accionistas get an empleado record too: same FK structure) ──
    const { data: existingEmp } = await supabase
      .schema('erp' as any)
      .from('empleados')
      .select('id')
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .eq('persona_id', personaId)
      .maybeSingle();

    const empPayload = {
      empresa_id: DILESA_EMPRESA_ID,
      persona_id: personaId,
      numero_empleado,
      fecha_ingreso,
      fecha_baja,
      motivo_baja,
      departamento_id,
      puesto_id,
      nss,
      fecha_nacimiento,
      telefono_empresa,
      extension: extension_val,
      activo,
    };

    if (existingEmp) {
      await supabase
        .schema('erp' as any)
        .from('empleados')
        .update(empPayload)
        .eq('id', existingEmp.id);
      console.log(`  ✓ updated (${tipo}): ${nombre} ${apellido_paterno ?? ''}`);
    } else {
      const { error: insErr } = await supabase
        .schema('erp' as any)
        .from('empleados')
        .insert(empPayload);
      if (insErr) {
        console.error(`  ✗ empleado ${nombre}: ${insErr.message}`);
        continue;
      }
      console.log(`  + created (${tipo}): ${nombre} ${apellido_paterno ?? ''}`);
    }
  }

  // ── 4. Juntas ──────────────────────────────────────────────────────────────
  console.log('\n─── Juntas ──────────────────────────────────────────────────');
  const juntasCols = await fetchColumns(TABLE_IDS.juntas);
  const juntasRows = await fetchAllRows(TABLE_IDS.juntas);
  console.log(`Fetched ${juntasRows.length} rows from Coda`);

  for (const row of juntasRows) {
    const v = row.values;

    const titulo =
      str(pick(v, juntasCols, 'nombre de junta', 'título', 'titulo', 'name', 'nombre', row.name)) ??
      row.name;
    const tipo = str(
      pick(v, juntasCols, 'tipo de junta', 'tipo', 'type', 'categoría', 'categoria')
    );
    const lugar = str(pick(v, juntasCols, 'lugar', 'location', 'sala'));
    const descripcion = str(
      pick(v, juntasCols, 'temas', 'descripción', 'descripcion', 'notas', 'minuta', 'agenda')
    );
    const fecha_hora = tsStr(
      pick(v, juntasCols, 'fecha de junta', 'fecha', 'fecha y hora', 'fecha_hora', 'date', 'inicio')
    );
    const duracion_raw = pick(v, juntasCols, 'duración', 'duracion', 'duration');
    const duracion_minutos = duracion_raw ? parseInt(String(duracion_raw)) || 60 : 60;
    const estadoRaw = str(pick(v, juntasCols, 'estado', 'status', 'estatus'));
    const estado = ['programada', 'en_curso', 'completada', 'cancelada'].includes(estadoRaw ?? '')
      ? (estadoRaw as string)
      : 'completada'; // historic records default to completada

    if (!fecha_hora) {
      console.log(`  ⚠ skipped (no date): ${titulo}`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY] junta: ${titulo} (${fecha_hora})`);
      continue;
    }

    const payload = {
      empresa_id: DILESA_EMPRESA_ID,
      titulo,
      tipo,
      lugar,
      descripcion,
      fecha_hora,
      duracion_minutos,
      estado,
    };

    // Check duplicate by titulo + fecha_hora
    const { data: existing } = await supabase
      .schema('erp' as any)
      .from('juntas')
      .select('id')
      .eq('empresa_id', DILESA_EMPRESA_ID)
      .eq('titulo', titulo)
      .eq('fecha_hora', fecha_hora)
      .maybeSingle();

    if (existing) {
      console.log(`  ✓ exists: ${titulo}`);
    } else {
      const { error: insErr } = await supabase
        .schema('erp' as any)
        .from('juntas')
        .insert(payload);
      if (insErr) {
        console.error(`  ✗ junta ${titulo}: ${insErr.message}`);
        continue;
      }
      console.log(`  + created: ${titulo} (${fecha_hora})`);
    }
  }

  console.log('\n✅ Migration complete.\n');
}

main().catch((err) => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
