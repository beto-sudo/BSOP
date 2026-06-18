/**
 * populate_dilesa_desglose_precio.ts
 *
 * Pobla el desglose de precio de las ventas DILESA activas en proceso
 * (iniciativa dilesa-cuadratura-sobreprecio): precio_base, incremento_credito,
 * la geometría del lote (excedente/frente verde/esquina/venta futuro) y la
 * promoción de gastos. Una sola corrida, idempotente (UPDATE por id).
 *
 * Fuentes (decisión Beto 2026-06-18):
 *  - GEOMETRÍA (20 lotes con esquina/frente verde/excedente): valores EXACTOS
 *    extraídos de la Solicitud de Asignación firmada por el cliente (PDF Coda
 *    c-j4ZhKyzB8g). NO se recalculan — para que BSOP quede idéntico al PDF.
 *  - SIN GEOMETRÍA: derivado de la DB con la fórmula validada contra los PDFs:
 *      precio_base = valor_escrituracion/(1+pct6) − sobreprecio
 *      incremento  = valor_escrituracion × pct6/(1+pct6)
 *    (pct6 = tipos_credito.costo_venta_adicional_pct; 6% FOVISSSTE/IMSS, 0 resto).
 *  - PROMOCIÓN = 15,000 para prototipo LDLE-ISC, 0 para el resto.
 *  - SOBREPRECIO = productos_adicionales (ya en DB).
 *
 * EXCLUIDOS (anomalías DB↔PDF que requieren decisión de Beto — NO se tocan):
 * M10-L8/M12-L9/M9-L18 (descuentos no capturados), M8-L10 (escrituración sin el
 * sobreprecio), M22-L1 (escrituración +3k sin sustento), M9-L18 duplicado.
 * También se omiten las ventas sin valor_escrituracion (fase temprana).
 *
 * Uso:
 *   DRY_RUN=1 npx tsx --env-file=.env.local scripts/populate_dilesa_desglose_precio.ts
 *   npx tsx --env-file=.env.local scripts/populate_dilesa_desglose_precio.ts
 */
import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.env.DRY_RUN === '1';
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
);

const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

// Geometría EXACTA de la Solicitud de Asignación (20 lotes). Keyed por coda_row_id.
const GEOM_EXACTO: Record<
  string,
  { loc: string; base: number; exc: number; fv: number; esq: number; vfut: number; incr: number }
> = {
  'i-gL3fhUnhum': {
    loc: 'M10-L1-LDS',
    base: 2094000,
    exc: 36700,
    fv: 0,
    esq: 67008,
    vfut: 0,
    incr: 131862.48,
  },
  'i-sc3N9FLMjI': {
    loc: 'M10-L20-LDLE',
    base: 899000,
    exc: 91800,
    fv: 0,
    esq: 134850,
    vfut: 11257,
    incr: 0,
  },
  'i-V7hylQ0koS': {
    loc: 'M10-L3-LDS',
    base: 2708257,
    exc: 31500,
    fv: 0,
    esq: 0,
    vfut: 0,
    incr: 164385.42,
  },
  'i-EMdB-zU0vF': { loc: 'M10-L4-LDS', base: 2490000, exc: 31500, fv: 0, esq: 0, vfut: 0, incr: 0 },
  'i-8SK48zDwDp': {
    loc: 'M12-L15-LDLE',
    base: 899000,
    exc: 0,
    fv: 17980,
    esq: 0,
    vfut: 9170,
    incr: 0,
  },
  'i-WwZ4PU7YZT': {
    loc: 'M12-L34-LDLE',
    base: 899000,
    exc: 239462,
    fv: 0,
    esq: 134850,
    vfut: 25466,
    incr: 0,
  },
  'i-x-hz4d98II': {
    loc: 'M14-L30-LDLE',
    base: 899000,
    exc: 227970,
    fv: 17980,
    esq: 134850,
    vfut: 12798,
    incr: 0,
  },
  'i-A8-YdbdAv6': {
    loc: 'M2-L10-LDLE',
    base: 920000,
    exc: 10200,
    fv: 0,
    esq: 0,
    vfut: 18604,
    incr: 0,
  },
  'i-Py9-YYVLFv': { loc: 'M2-L9-LDLE', base: 920000, exc: 10200, fv: 0, esq: 0, vfut: 0, incr: 0 },
  'i-pHB6o70xtQ': {
    loc: 'M20-L19-LDLE',
    base: 899000,
    exc: 0,
    fv: 0,
    esq: 134850,
    vfut: 20677,
    incr: 0,
  },
  'i-hOUsgtbvRp': {
    loc: 'M20-L34-LDLE',
    base: 920000,
    exc: 274652,
    fv: 0,
    esq: 138000,
    vfut: 0,
    incr: 0,
  },
  'i-jpmHOsQzkY': {
    loc: 'M21-L21-LDLE',
    base: 899000,
    exc: 321062,
    fv: 0,
    esq: 134850,
    vfut: 0,
    incr: 0,
  },
  'i-SxdbT_KrFG': {
    loc: 'M22-L21-LDLE',
    base: 899000,
    exc: 321062,
    fv: 17980,
    esq: 134850,
    vfut: 27458,
    incr: 0,
  },
  'i-Y56exHKYwB': {
    loc: 'M3-L1-LDLE',
    base: 899000,
    exc: 0,
    fv: 0,
    esq: 134850,
    vfut: 10339,
    incr: 62651.31,
  },
  'i-PeDewr4Yri': {
    loc: 'M4-L20-LDLE',
    base: 920000,
    exc: 0,
    fv: 0,
    esq: 138000,
    vfut: 0,
    incr: 0,
  },
  'i-N53IDU4WTG': {
    loc: 'M8-L13-LDS',
    base: 2790000,
    exc: 204450,
    fv: 55800,
    esq: 89280,
    vfut: 0,
    incr: 0,
  },
  'i-Kjoj0Lhelq': {
    loc: 'M9-L17-LDS',
    base: 2490000,
    exc: 90000,
    fv: 49800,
    esq: 79680,
    vfut: 0,
    incr: 0,
  },
  'i-1YV8OCj2lS': { loc: 'M9-L19-LDS', base: 2038000, exc: 31500, fv: 0, esq: 0, vfut: 0, incr: 0 },
  'i-zqCzHVzUFj': { loc: 'M9-L7-LDS', base: 2038000, exc: 41200, fv: 0, esq: 0, vfut: 0, incr: 0 },
  'i-ERZNrM5h03': { loc: 'M9-L8-LDS', base: 2094000, exc: 41200, fv: 0, esq: 0, vfut: 0, incr: 0 },
};

async function main() {
  const { data: emp } = await sb
    .schema('core')
    .from('empresas')
    .select('id')
    .eq('slug', 'dilesa')
    .single();
  const empresaId = emp!.id as string;

  const { data: tcs } = await sb
    .schema('dilesa')
    .from('tipos_credito')
    .select('nombre, costo_venta_adicional_pct')
    .eq('empresa_id', empresaId);
  const pct6De = new Map(
    (tcs ?? []).map((t) => [
      String(t.nombre).toLowerCase(),
      Number(t.costo_venta_adicional_pct ?? 0),
    ])
  );

  const { data: ventas } = await sb
    .schema('dilesa')
    .from('ventas')
    .select('id, coda_row_id, tipo_credito, unidad_id, valor_escrituracion, productos_adicionales')
    .eq('empresa_id', empresaId)
    .eq('estado', 'activa')
    .is('deleted_at', null)
    .gte('fase_posicion', 1)
    .lte('fase_posicion', 15)
    .not('valor_escrituracion', 'is', null);

  const uIds = [...new Set((ventas ?? []).map((v) => v.unidad_id).filter(Boolean))] as string[];
  const { data: unidades } = await sb
    .schema('dilesa')
    .from('unidades')
    .select('id, proyecto_id, producto_id, es_esquina, tiene_frente_verde, area_m2')
    .in('id', uIds);
  const uMap = new Map((unidades ?? []).map((u) => [u.id, u]));
  const prIds = [
    ...new Set((unidades ?? []).map((u) => u.proyecto_id).filter(Boolean)),
  ] as string[];
  const prodIds = [
    ...new Set((unidades ?? []).map((u) => u.producto_id).filter(Boolean)),
  ] as string[];
  const { data: proyectos } = await sb
    .schema('dilesa')
    .from('proyectos')
    .select('id, tamano_lote_promedio')
    .in('id', prIds);
  const prMap = new Map((proyectos ?? []).map((p) => [p.id, Number(p.tamano_lote_promedio ?? 0)]));
  const { data: productos } = await sb
    .schema('dilesa')
    .from('productos')
    .select('id, nombre')
    .in('id', prodIds);
  const protoMap = new Map((productos ?? []).map((p) => [p.id, p.nombre as string]));

  type Upd = {
    id: string;
    loc: string;
    fuente: 'pdf' | 'derivado';
    precio_base: number;
    incremento_credito: number;
    valor_excedente_terreno: number | null;
    valor_frente_verde: number | null;
    valor_esquina: number | null;
    valor_venta_futuro: number | null;
    promocion_gastos_monto: number;
    cuadre: number;
  };
  const updates: Upd[] = [];
  const skipped: string[] = [];

  for (const v of ventas ?? []) {
    const u = v.unidad_id ? uMap.get(v.unidad_id) : null;
    const proto = u?.producto_id ? protoMap.get(u.producto_id) : null;
    const escr = Number(v.valor_escrituracion);
    const sobre = Number(v.productos_adicionales ?? 0);
    const pct6 = pct6De.get(String(v.tipo_credito ?? '').toLowerCase()) ?? 0;
    const promo = proto === 'LDLE-ISC' ? 15000 : 0;
    const tamano = u?.proyecto_id ? (prMap.get(u.proyecto_id) ?? 0) : 0;
    const esGeom =
      !!u &&
      (u.es_esquina || u.tiene_frente_verde || (u.area_m2 != null && Number(u.area_m2) > tamano));

    const g = v.coda_row_id ? GEOM_EXACTO[v.coda_row_id] : undefined;
    if (g) {
      const suma = g.base + g.exc + g.fv + g.esq + g.vfut + g.incr + sobre;
      updates.push({
        id: v.id as string,
        loc: g.loc,
        fuente: 'pdf',
        precio_base: g.base,
        incremento_credito: g.incr,
        valor_excedente_terreno: g.exc,
        valor_frente_verde: g.fv,
        valor_esquina: g.esq,
        valor_venta_futuro: g.vfut,
        promocion_gastos_monto: promo,
        cuadre: round2(suma - escr),
      });
    } else if (esGeom) {
      // Lote con geometría pero sin valores exactos del PDF (anomalía) → no tocar.
      const ident = u ? `unidad ${v.unidad_id}` : v.id;
      skipped.push(`${ident} (geometría sin PDF exacto — anomalía)`);
    } else {
      // Sin geometría: derivar base e incremento de la escrituración.
      const f = 1 + pct6;
      const base = round2(escr / f - sobre);
      const incr = round2((escr * pct6) / f);
      updates.push({
        id: v.id as string,
        loc: proto ?? '?',
        fuente: 'derivado',
        precio_base: base,
        incremento_credito: incr,
        valor_excedente_terreno: null,
        valor_frente_verde: null,
        valor_esquina: null,
        valor_venta_futuro: null,
        promocion_gastos_monto: promo,
        cuadre: round2(base + incr + sobre - escr),
      });
    }
  }

  const noCuadran = updates.filter((u) => Math.abs(u.cuadre) > 2);
  console.log(
    `Ventas con escrituración: ${ventas?.length ?? 0} | a poblar: ${updates.length} ` +
      `(pdf ${updates.filter((u) => u.fuente === 'pdf').length}, derivado ${updates.filter((u) => u.fuente === 'derivado').length}) | ` +
      `omitidas (anomalías): ${skipped.length}`
  );
  if (noCuadran.length) {
    console.log(`\n⚠️  ${noCuadran.length} NO cuadran (Δ>2) — NO se escribirán:`);
    noCuadran.forEach((u) => console.log(`   ${u.loc}: Δ=${u.cuadre}`));
  }
  if (skipped.length) {
    console.log('\nOmitidas (revisión de Beto):');
    skipped.forEach((s) => console.log(`   - ${s}`));
  }

  const aplicar = updates.filter((u) => Math.abs(u.cuadre) <= 2);
  if (DRY_RUN) {
    console.log(`\n=== DRY RUN — no se escribe nada. Se aplicarían ${aplicar.length} updates. ===`);
    return;
  }

  let ok = 0;
  for (const u of aplicar) {
    const { error } = await sb
      .schema('dilesa')
      .from('ventas')
      .update({
        precio_base: u.precio_base,
        incremento_credito: u.incremento_credito,
        valor_excedente_terreno: u.valor_excedente_terreno,
        valor_frente_verde: u.valor_frente_verde,
        valor_esquina: u.valor_esquina,
        valor_venta_futuro: u.valor_venta_futuro,
        promocion_gastos_monto: u.promocion_gastos_monto,
      })
      .eq('id', u.id);
    if (error) console.error(`✗ ${u.loc}: ${error.message}`);
    else ok++;
  }
  console.log(`\n✔ ${ok}/${aplicar.length} ventas pobladas.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
