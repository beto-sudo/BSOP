/**
 * import_dilesa_espectaculares.ts
 *
 * Iniciativa dilesa-portafolio-expediente. Carga el inventario de espacios
 * publicitarios del doc Coda "DILESA Espacios Publicitarios" (6-2avcAHjP, tabla
 * "Espacios Publicitarios") al portafolio DILESA.
 *
 * Grano (decisión Beto 2026-06-17): 1 activo = 1 estructura física, agrupando
 * por (Tipo, Numero); las 2 caras (Flujo/Contraflujo o Norte/Sur) con su precio
 * y scoring de medios viven en `activo_espectacular.caras_detalle` (jsonb). Los
 * "Padel" del Rincón del Bosque SÍ son de DILESA (confirmado) → se incluyen.
 *
 * Idempotente: borra los activos tipo='espectacular' de DILESA (CASCADE al
 * satélite) y reinserta. Los campos de operación (anunciante/contrato) vienen
 * vacíos en Coda y quedan NULL — el arrendamiento es módulo aparte.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx --env-file=/Users/Beto/BSOP/.env.local scripts/import_dilesa_espectaculares.ts
 *   npx tsx --env-file=/Users/Beto/BSOP/.env.local scripts/import_dilesa_espectaculares.ts
 */
import { createClient } from '@supabase/supabase-js';

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';
const DOC = '6-2avcAHjP';
const TABLE = 'grid-0SXxsP_pC_';

if (!CODA_API_KEY) throw new Error('Falta CODA_API_KEY');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');

async function coda(path: string) {
  const r = await fetch(`https://coda.io/apis/v1${path}`, {
    headers: { Authorization: `Bearer ${CODA_API_KEY}` },
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} en ${path}`);
  return r.json();
}

async function allRows(): Promise<Record<string, unknown>[]> {
  let rows: { values: Record<string, unknown> }[] = [];
  let pt: string | undefined;
  do {
    const qs = new URLSearchParams({ limit: '200', valueFormat: 'simple', useColumnNames: 'true' });
    if (pt) qs.set('pageToken', pt);
    const r = await coda(`/docs/${DOC}/tables/${TABLE}/rows?${qs}`);
    rows = rows.concat(r.items ?? []);
    pt = r.nextPageToken;
  } while (pt);
  return rows.map((x) => x.values);
}

const str = (v: unknown): string | null => {
  const s = v == null ? '' : String(v).trim();
  return s === '' ? null : s;
};
const money = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const numOr = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: emp } = await sb
    .schema('core')
    .from('empresas')
    .select('id')
    .eq('slug', 'dilesa')
    .single();
  if (!emp) throw new Error('No se encontró DILESA');
  const empresaId = emp.id as string;

  const { data: destino } = await sb
    .schema('dilesa')
    .from('portafolio_destinos')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('slug', 'arrendamiento')
    .maybeSingle();
  const destinoId = (destino?.id as string) ?? null;

  const rows = await allRows();
  // Agrupar por estructura física: Tipo + Numero (Localización tiene typos).
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const v of rows) {
    const key = `${str(v['Tipo']) ?? '?'}||${str(v['Numero']) ?? '?'}`;
    const arr = groups.get(key) ?? [];
    arr.push(v);
    groups.set(key, arr);
  }

  const estructuras = [...groups.entries()].map(([key, caras]) => {
    const [tipo, numero] = key.split('||');
    const localizacion = str(caras[0]['Localización']) ?? null;
    const dueno = str(caras[0]['Dueño Terreno']) ?? null;
    const rentaTotal = caras.reduce((acc, c) => acc + (money(c['Precio']) ?? 0), 0);
    const iluminado = caras.some((c) => (numOr(c['Iluminación']) ?? 0) > 0);
    const carasDetalle = caras.map((c) => ({
      cara: str(c['Cara']),
      alias: str(c['Alias']),
      iluminado: (numOr(c['Iluminación']) ?? 0) > 0,
      renta_mensual: money(c['Precio']),
      scoring: {
        trafico: numOr(c['Tráfico']),
        visibilidad: numOr(c['Visibilidad']),
        angulos: numOr(c['Ángulos de Visión']),
        iluminacion: numOr(c['Iluminación']),
        puntos: numOr(c['Total Puntos']),
        demanda: numOr(c['Demanda']),
      },
    }));
    const prefijo = tipo === 'Espectacular' ? 'ESP' : tipo === 'Padel' ? 'PADEL' : 'PUB';
    return {
      tipo,
      numero,
      nombre: `${tipo} #${numero}${localizacion ? ` — ${localizacion}` : ''}`,
      clave_interna: `${prefijo}-${numero}`,
      localizacion,
      dueno,
      rentaTotal: rentaTotal > 0 ? rentaTotal : null,
      iluminado,
      caras: caras.length,
      carasDetalle,
    };
  });

  console.log(`Coda: ${rows.length} filas → ${estructuras.length} estructuras`);
  const porTipo = new Map<string, number>();
  for (const e of estructuras) porTipo.set(e.tipo, (porTipo.get(e.tipo) ?? 0) + 1);
  console.log('Por tipo:', JSON.stringify([...porTipo.entries()]));

  if (DRY_RUN) {
    console.log('\n=== DRY RUN — no escribe ===');
    for (const e of estructuras)
      console.log(
        `  ${e.clave_interna}\t${e.caras} caras\tilum=${e.iluminado}\trenta=${e.rentaTotal}\t${e.nombre}`
      );
    return;
  }

  // Idempotencia: borrar espectaculares previos de DILESA (satélite cae por FK CASCADE
  // si está configurado; si no, borramos satélite explícito primero).
  const { data: previos } = await sb
    .schema('dilesa')
    .from('activos')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('tipo', 'espectacular');
  const previosIds = (previos ?? []).map((p) => p.id as string);
  if (previosIds.length > 0) {
    await sb.schema('dilesa').from('activo_espectacular').delete().in('activo_id', previosIds);
    await sb.schema('dilesa').from('activos').delete().in('id', previosIds);
    console.log(`Borrados ${previosIds.length} espectaculares previos.`);
  }

  let ok = 0;
  for (const e of estructuras) {
    const { data: act, error: e1 } = await sb
      .schema('dilesa')
      .from('activos')
      .insert({
        empresa_id: empresaId,
        tipo: 'espectacular',
        nombre: e.nombre,
        estado: 'operando',
        destino_id: destinoId,
        clave_interna: e.clave_interna,
        notas: `Importado de Coda (Espacios Publicitarios) 2026-06-17.`,
      })
      .select('id')
      .single();
    if (e1 || !act) {
      console.error(`✗ ${e.clave_interna}: ${e1?.message}`);
      continue;
    }
    const { error: e2 } = await sb.schema('dilesa').from('activo_espectacular').insert({
      activo_id: act.id,
      empresa_id: empresaId,
      caras: e.caras,
      iluminado: e.iluminado,
      vialidad: e.localizacion,
      renta_mensual: e.rentaTotal,
      dueno_terreno: e.dueno,
      caras_detalle: e.carasDetalle,
    });
    if (e2) {
      console.error(`✗ satélite ${e.clave_interna}: ${e2.message}`);
      continue;
    }
    ok++;
  }
  console.log(`\n✔ ${ok}/${estructuras.length} espectaculares cargados.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
