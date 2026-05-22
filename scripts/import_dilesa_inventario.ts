/**
 * import_dilesa_inventario.ts
 *
 * Iniciativa dilesa-portafolio-activos · Sprint 3 — importación Fase 3.
 * Jala la tabla Inventario del Coda DILESA (doc ZNxWl_DI2D) — 1,590 lotes/
 * casas de 6 fraccionamientos — y la carga en el schema v2:
 *
 *   - Cada fila → dilesa.unidades (ligada a su proyecto y su prototipo).
 *   - Los prototipos distintos → dilesa.productos (catálogo por proyecto).
 *
 * NO se crean filas en dilesa.activos: las unidades son el registro
 * histórico de la pieza; el portafolio de activos queda con los terrenos.
 * Decisión validada con Beto — ver mapeo §§ 4-5.
 *
 * El detalle de ventas (comprador, contrato, montos) y el pipeline RUV/DTU
 * NO se importan — son Fase 4 / workflow viejo de Coda. Mapeo: §§ 4-6.
 *
 * Idempotente: borra unidades + productos de DILESA y re-inserta.
 *
 * Prerequisites (env): CODA_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY.
 *
 * Uso:
 *   DRY_RUN=1 npx tsx scripts/import_dilesa_inventario.ts
 *   npx tsx scripts/import_dilesa_inventario.ts
 */

import { createClient } from '@supabase/supabase-js';
import { CodaClient, buildColumnMap, pick, str, num, bool } from '../lib/coda-api';

const CODA_API_KEY = process.env.CODA_API_KEY ?? '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';

const CODA_DOC = 'ZNxWl_DI2D';
// Tabla "Inventario" por id de grid — el nombre no es único en el doc
// (existen también "*Inventario" y "View of Inventario").
const CODA_TABLE = 'grid--AHYMPQI7Z';

if (!CODA_API_KEY) throw new Error('Falta CODA_API_KEY');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan credenciales de Supabase');

/**
 * `unidades.estado` desde "Fase de Proyecto" (avance de obra) + "Estatus
 * Ventas" (detalle de venta). El estatus de venta gana cuando está
 * presente; si no, manda la fase de obra. Ciclo: planeada →
 * lote_urbanizado → en_construccion → terminada → asignada → vendida →
 * escriturada → entregada. Ver mapeo § 4.
 */
function mapEstado(fase: string | null, estatusVentas: string | null): string {
  const ev = (estatusVentas ?? '').toLowerCase();
  if (ev.includes('escriturada')) return 'escriturada';
  if (ev.includes('entregada')) return 'entregada';
  if (ev.includes('asignada')) return 'asignada';
  const f = (fase ?? '').toLowerCase();
  if (f.includes('vendida')) return 'vendida';
  if (
    f.includes('terminada') ||
    f.includes('paquete ruv') ||
    f.includes('extracc') ||
    f.includes('seguro')
  )
    return 'terminada';
  if (f.includes('construcc')) return 'en_construccion';
  if (f.includes('lotes')) return 'lote_urbanizado';
  return 'planeada';
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

  // ── Coda: Inventario ────────────────────────────────────────────────────────
  const cols = await coda.listColumns(CODA_DOC, CODA_TABLE);
  const cm = buildColumnMap(cols);
  const rows = await coda.listRowsAll(CODA_DOC, CODA_TABLE);
  console.log(`Coda: ${rows.length} filas en Inventario.`);

  const registros = rows.map((row) => {
    const v = row.values;
    const manzana = str(pick(v, cm, 'Manzana'));
    const lote = str(pick(v, cm, 'Lote'));
    const idLote = str(pick(v, cm, 'ID Lote'));
    const idInv = str(pick(v, cm, 'ID Inventario'));
    const precio = num(pick(v, cm, 'Precio de Venta'));
    return {
      proyectoNombre: str(pick(v, cm, 'Proyecto')),
      prototipo: str(pick(v, cm, 'Prototipo')),
      prototipoModelo: str(pick(v, cm, 'Prototipo-Viejo')),
      unidad: {
        identificador: idLote ?? (manzana && lote ? `M${manzana}-L${lote}` : idInv) ?? '(sin id)',
        estado: mapEstado(str(pick(v, cm, 'Fase de Proyecto')), str(pick(v, cm, 'Estatus Ventas'))),
        area_m2: num(pick(v, cm, 'Superficie Lote M²')),
        precio: precio && precio > 0 ? precio : null,
        manzana,
        numero_lote: lote,
        calle: str(pick(v, cm, 'Calle')),
        numero_oficial: str(pick(v, cm, 'Número Oficial')),
        tipo_lote: str(pick(v, cm, 'Tipo de Lote')),
        es_esquina: bool(pick(v, cm, 'Esquina')),
        tiene_frente_verde: bool(pick(v, cm, 'Frente Verde')),
        m2_construccion: num(pick(v, cm, 'M² de Construcción')),
      },
    };
  });

  // Productos = pares (proyecto, prototipo) distintos. El valor de la columna
  // `Prototipo` ya es {abrev-proyecto}-{modelo} (ej. LDLE-ISC), único global.
  const productosMap = new Map<
    string,
    { nombre: string; proyectoNombre: string | null; modelo: string | null }
  >();
  for (const r of registros) {
    if (r.prototipo && !productosMap.has(r.prototipo)) {
      productosMap.set(r.prototipo, {
        nombre: r.prototipo,
        proyectoNombre: r.proyectoNombre,
        modelo: r.prototipoModelo,
      });
    }
  }

  // ── Proyectos: nombre → id ──────────────────────────────────────────────────
  const { data: proyectos, error: prjErr } = await sb
    .schema('dilesa')
    .from('proyectos')
    .select('id, nombre')
    .eq('empresa_id', empresaId);
  if (prjErr) throw new Error(`Error leyendo proyectos: ${prjErr.message}`);
  const proyectoPorNombre = new Map(
    (proyectos ?? []).map((p) => [(p.nombre as string).trim(), p.id as string])
  );

  const resolveProyecto = (nombre: string | null): string | undefined =>
    nombre ? proyectoPorNombre.get(nombre.trim()) : undefined;

  const porEstado = new Map<string, number>();
  for (const r of registros)
    porEstado.set(r.unidad.estado, (porEstado.get(r.unidad.estado) ?? 0) + 1);
  const sinProyecto = registros.filter((r) => !resolveProyecto(r.proyectoNombre)).length;
  const sinPrototipo = registros.filter((r) => !r.prototipo).length;

  if (DRY_RUN) {
    console.log('\n=== DRY RUN — no se escribe nada ===\n');
    console.log(`Unidades (${registros.length}) por estado:`);
    for (const [e, n] of [...porEstado.entries()].sort((a, b) => b[1] - a[1]))
      console.log(`  ${n.toString().padStart(5)}  ${e}`);
    console.log(`\nProductos (${productosMap.size}):`);
    for (const p of productosMap.values())
      console.log(
        `  · ${p.nombre}  (proyecto=${p.proyectoNombre ?? '—'}, modelo=${p.modelo ?? '—'})`
      );
    console.log(
      `\n${sinPrototipo} unidades sin prototipo (lote comercial / área verde / sin asignar).`
    );
    console.log(`${sinProyecto} unidades con proyecto no resuelto en dilesa.proyectos.`);
    return;
  }

  // Idempotencia: limpiar unidades + productos previos de DILESA.
  const { error: delU } = await sb
    .schema('dilesa')
    .from('unidades')
    .delete()
    .eq('empresa_id', empresaId);
  if (delU) throw new Error(`Error limpiando unidades previas: ${delU.message}`);
  const { error: delP } = await sb
    .schema('dilesa')
    .from('productos')
    .delete()
    .eq('empresa_id', empresaId);
  if (delP) throw new Error(`Error limpiando productos previos: ${delP.message}`);

  // ── Productos ───────────────────────────────────────────────────────────────
  const productoInserts = [...productosMap.values()]
    .map((p) => {
      const proyectoId = resolveProyecto(p.proyectoNombre);
      if (!proyectoId) {
        console.warn(
          `⚠ producto "${p.nombre}": proyecto "${p.proyectoNombre}" no encontrado — se omite`
        );
        return null;
      }
      return {
        empresa_id: empresaId,
        proyecto_id: proyectoId,
        nombre: p.nombre,
        atributos: p.modelo ? { modelo: p.modelo } : {},
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);
  const { data: prodRows, error: prodErr } = await sb
    .schema('dilesa')
    .from('productos')
    .insert(productoInserts)
    .select('id, nombre');
  if (prodErr) throw new Error(`Error insertando productos: ${prodErr.message}`);
  const productoIdPorNombre = new Map(
    (prodRows ?? []).map((p) => [p.nombre as string, p.id as string])
  );

  // ── Unidades ────────────────────────────────────────────────────────────────
  let omitidas = 0;
  const unidadInserts = registros
    .map((r) => {
      const proyectoId = resolveProyecto(r.proyectoNombre);
      if (!proyectoId) {
        omitidas++;
        console.warn(
          `⚠ unidad ${r.unidad.identificador}: proyecto "${r.proyectoNombre}" no encontrado — se omite`
        );
        return null;
      }
      return {
        empresa_id: empresaId,
        proyecto_id: proyectoId,
        producto_id: r.prototipo ? (productoIdPorNombre.get(r.prototipo) ?? null) : null,
        ...r.unidad,
      };
    })
    .filter((u): u is NonNullable<typeof u> => u !== null);

  let okU = 0;
  const CHUNK = 500;
  for (let i = 0; i < unidadInserts.length; i += CHUNK) {
    const chunk = unidadInserts.slice(i, i + CHUNK);
    const { error } = await sb.schema('dilesa').from('unidades').insert(chunk);
    if (error) {
      console.error(`✗ chunk unidades [${i}..${i + chunk.length}): ${error.message}`);
      continue;
    }
    okU += chunk.length;
  }

  console.log(
    `\n✔ Importadas ${okU}/${registros.length} unidades y ${productoInserts.length} productos.` +
      (omitidas ? `  (${omitidas} unidades omitidas por proyecto no resuelto)` : '')
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
