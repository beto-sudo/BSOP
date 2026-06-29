/**
 * analyze_dilesa_descuento_perdonado.ts  (READ-ONLY, no escribe nada)
 *
 * Mide el impacto del bug del "descuento perdonado" en el motor de cuadratura
 * DILESA. Hoy `descuentoAplicado` (cuadratura.ts) usa el TOPE del bono
 * (`promocion_gastos_monto`) + sobreprecio, en vez de la promo REALMENTE
 * aplicada (`aportacionPromocion + sobreprecioCobertura`, que el motor ya
 * calcula = `faltanteGastosDilesa`). Cuando el bono no se consume completo, la
 * diferencia se cuela como "descuento perdonado" fantasma → warning en la
 * revisión PLD (Σ liquidaciones = valor pactado − descuento).
 *
 * Corre el MOTOR REAL sobre todas las ventas con desglose y reporta, por venta,
 * el `descuentoAplicado` actual vs el corregido, el perdón actual vs corregido,
 * y el delta de `saldoCliente`. No escribe en DB.
 *
 *   npx tsx --env-file=/Users/Beto/BSOP/.env.local \
 *     scripts/analyze_dilesa_descuento_perdonado.ts
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js';

import { cargarCuadraturaVenta } from '../lib/dilesa/cuadratura-server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (usa --env-file).');
}

const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;
const money = (v: number): string =>
  v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

type Fila = {
  id: string;
  unidad: string;
  estado: string | null;
  fase: number | null;
  valorEscrituracion: number;
  aplicadoActual: number;
  aplicadoFix: number;
  cheque: number;
  perdonadoActual: number;
  perdonadoFix: number;
  saldoClienteActual: number;
  saldoClienteFix: number;
  descuentoReal: number;
};

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  // Universo: ventas vivas con desglose poblado (el modelo afectado).
  const { data: ventas, error } = await sb
    .schema('dilesa')
    .from('ventas')
    .select(
      'id, estado, fase_posicion, valor_escrituracion, promocion_gastos_monto, precio_base, unidad_id'
    )
    .is('deleted_at', null)
    .or('promocion_gastos_monto.not.is.null,precio_base.not.is.null');
  if (error) throw error;
  const universo = ventas ?? [];

  // Clave de unidad (manzana-lote) para el reporte.
  const unidadIds = [...new Set(universo.map((v) => v.unidad_id).filter(Boolean))] as string[];
  const claves = new Map<string, string>();
  for (let i = 0; i < unidadIds.length; i += 200) {
    const chunk = unidadIds.slice(i, i + 200);
    const { data: us } = await sb
      .schema('dilesa')
      .from('unidades')
      .select('id, manzana, numero_lote')
      .in('id', chunk);
    for (const u of (us ?? []) as { id: string; manzana: string; numero_lote: string }[]) {
      claves.set(u.id, `M${u.manzana}-L${u.numero_lote}`);
    }
  }

  const filas: Fila[] = [];
  let saltadas = 0;
  for (const v of universo) {
    const cuad = await cargarCuadraturaVenta(sb, v.id);
    if (!cuad || !cuad.tieneDesglose) {
      saltadas++;
      continue;
    }
    const cheque = cuad.chequePagado;
    const aplicadoActual = round2(cuad.descuentoAplicado);
    const cg = cuad.coberturaGastos;
    // Fix QUIRÚRGICO (Opción A): solo topa la PROMO al bono consumido
    // (`aportacionPromocion`); conserva el sobreprecio CAPTURADO (hecho
    // escriturado, robusto al estado de captura de gastos). Nunca sube el
    // descuento por encima del actual.
    const aplicadoFix = round2((cg?.aportacionPromocion ?? 0) + (cg?.sobreprecio ?? 0));
    const perdonadoActual = Math.max(0, round2(aplicadoActual - cheque));
    const perdonadoFix = Math.max(0, round2(aplicadoFix - cheque));
    const saldoClienteFix = round2(cuad.saldoCobranza - aplicadoFix + cheque);
    filas.push({
      id: v.id,
      unidad: claves.get(v.unidad_id as string) ?? '—',
      estado: v.estado,
      fase: v.fase_posicion,
      valorEscrituracion: round2(cuad.saldoCobranza + cuad.montoDisponible),
      aplicadoActual,
      aplicadoFix,
      cheque,
      perdonadoActual,
      perdonadoFix,
      saldoClienteActual: round2(cuad.saldoCliente),
      saldoClienteFix,
      descuentoReal: round2(cuad.descuentoReal),
    });
  }

  const cambian = filas.filter((f) => Math.abs(f.aplicadoActual - f.aplicadoFix) > 0.01);
  const perdonFantasma = filas.filter((f) => f.perdonadoActual > 0.01 && f.perdonadoFix <= 0.01);
  const perdonBaja = cambian.filter((f) => f.perdonadoFix < f.perdonadoActual - 0.01);

  const sumaPerdonActual = round2(filas.reduce((s, f) => s + f.perdonadoActual, 0));
  const sumaPerdonFix = round2(filas.reduce((s, f) => s + f.perdonadoFix, 0));

  const subió = filas.filter((f) => f.aplicadoFix > f.aplicadoActual + 0.01);
  // Subconjunto que de verdad dispara el warning PLD: la revisión corre en
  // fase ≥ 13 (facturación). Ahí es donde el perdón fantasma importa.
  const pld = filas.filter((f) => (f.fase ?? 0) >= 13);
  const pldCambian = pld.filter((f) => f.perdonadoActual - f.perdonadoFix > 0.01);

  console.log('\n══════════ IMPACTO: descuento perdonado fantasma (motor cuadratura) ══════════\n');
  console.log(
    'Fix evaluado: Opción A (topar promo al bono consumido; sobreprecio capturado intacto)\n'
  );
  console.log(`Universo con desglose evaluado:        ${filas.length}`);
  console.log(`Saltadas (sin desglose efectivo):      ${saltadas}`);
  console.log(`Ventas que CAMBIAN descuentoAplicado:  ${cambian.length}`);
  console.log(`  · perdón pasa a CERO:                ${perdonFantasma.length}`);
  console.log(
    `  · perdón BAJA (no a cero):           ${perdonBaja.length - perdonFantasma.length}`
  );
  console.log(`  · descuentoAplicado SUBE (no debe):  ${subió.length}`);
  console.log(`Σ perdón ACTUAL:                       ${money(sumaPerdonActual)}`);
  console.log(`Σ perdón CORREGIDO:                    ${money(sumaPerdonFix)}`);
  console.log(
    `Σ perdón fantasma eliminado:           ${money(round2(sumaPerdonActual - sumaPerdonFix))}`
  );
  console.log(`\n── Subconjunto PLD (fase ≥ 13, donde corre la revisión) ──`);
  console.log(`Ventas en fase ≥ 13:                   ${pld.length}`);
  console.log(`  · con perdón fantasma que baja:      ${pldCambian.length}`);
  console.log(
    `  · de esas, perdón a CERO:            ${pld.filter((f) => f.perdonadoActual > 0.01 && f.perdonadoFix <= 0.01).length}`
  );

  const orden = [...cambian].sort(
    (a, b) => b.perdonadoActual - b.perdonadoFix - (a.perdonadoActual - a.perdonadoFix)
  );
  console.log('\n── Ventas afectadas (orden por delta de perdón) ──\n');
  console.log(
    'unidad'.padEnd(12),
    'estado'.padEnd(12),
    'fase'.padStart(4),
    'aplicadoAct'.padStart(13),
    'aplicadoFix'.padStart(13),
    'cheque'.padStart(12),
    'perdonAct'.padStart(11),
    'perdonFix'.padStart(11),
    'ΔsaldoCli'.padStart(11)
  );
  for (const f of orden) {
    console.log(
      f.unidad.padEnd(12),
      (f.estado ?? '—').padEnd(12),
      String(f.fase ?? '—').padStart(4),
      money(f.aplicadoActual).padStart(13),
      money(f.aplicadoFix).padStart(13),
      money(f.cheque).padStart(12),
      money(f.perdonadoActual).padStart(11),
      money(f.perdonadoFix).padStart(11),
      money(round2(f.saldoClienteFix - f.saldoClienteActual)).padStart(11)
    );
  }

  // CSV completo para revisión (en el tmp del SO; portable).
  const os = await import('node:os');
  const path = await import('node:path');
  const csvPath = path.join(os.tmpdir(), 'descuento_perdonado_impacto.csv');
  const header =
    'id,unidad,estado,fase,valor_escrituracion,aplicado_actual,aplicado_fix,cheque,perdon_actual,perdon_fix,saldo_cli_actual,saldo_cli_fix,descuento_real\n';
  const rows = filas
    .map((f) =>
      [
        f.id,
        f.unidad,
        f.estado ?? '',
        f.fase ?? '',
        f.valorEscrituracion,
        f.aplicadoActual,
        f.aplicadoFix,
        f.cheque,
        f.perdonadoActual,
        f.perdonadoFix,
        f.saldoClienteActual,
        f.saldoClienteFix,
        f.descuentoReal,
      ].join(',')
    )
    .join('\n');
  const fs = await import('node:fs/promises');
  await fs.writeFile(csvPath, header + rows + '\n');
  console.log(`\nCSV completo: ${csvPath}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
