/**
 * backfill_dilesa_comision_valor_real.ts
 *
 * Sprint 2 de la iniciativa `dilesa-comision-valor-real` (ADR-050): plasmar en las
 * columnas `dilesa.ventas.comision_vendedor`/`comision_gerencia` la comisión-base
 * correcta = Valor Real Venta DILESA − sobreprecio × tasa (1%/1.5% vendedor, 0.5%
 * gerencia), retroactivo y parejo. BSOP es referencia (no paga comisiones), así que
 * se reescribe el número que debió/debe de ser.
 *
 * Usa el MOTOR REAL vía `cargarCuadraturaVenta` (mismos insumos que el panel: cheque
 * capturado-o-calculado, depósitos por fuente, sobreprecio), NO un cálculo SQL
 * aproximado. Solo toca ventas con valor real > 0; las que dan valor real ≤ 0 (datos
 * incompletos) se EXCLUYEN y se reportan. Registra antes/después en `core.audit_log`.
 *
 * DRY por default: reporta el universo (cuántas cambian, delta, muestra) SIN escribir.
 * Para aplicar:
 *   DRY_RUN=0 npx tsx --env-file=/Users/Beto/BSOP/.env.local \
 *     scripts/backfill_dilesa_comision_valor_real.ts
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js';

import { cargarCuadraturaVenta } from '../lib/dilesa/cuadratura-server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN !== '0'; // default: dry
const LOTE = 25; // ventas procesadas en paralelo por tanda

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (usa --env-file).');
}

const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100;

type Cambio = {
  id: string;
  unidad: string;
  empresaId: string;
  cvOld: number;
  cvNew: number;
  cgOld: number;
  cgNew: number;
  valorReal: number;
};

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  // Universo: ventas vivas (activa/escriturada/terminada) con escrituración.
  const { data: ventas, error } = await sb
    .schema('dilesa')
    .from('ventas')
    .select('id, comision_vendedor, comision_gerencia, empresa_id, unidad_id')
    .in('estado', ['activa', 'escriturada', 'terminada'])
    .is('deleted_at', null)
    .gt('valor_escrituracion', 0);
  if (error) throw error;
  const filas = ventas ?? [];
  console.log(`Universo: ${filas.length} ventas vivas con escrituración.`);

  // Mapa unidad_id → identificador (para reporte/auditoría legibles).
  const { data: unidades } = await sb.schema('dilesa').from('unidades').select('id, identificador');
  const idUnidad = new Map(
    ((unidades ?? []) as { id: string; identificador: string | null }[]).map((u) => [
      u.id,
      u.identificador ?? u.id,
    ])
  );

  const cambios: Cambio[] = [];
  const excluidas: { id: string; unidad: string; valorReal: number }[] = [];

  for (let i = 0; i < filas.length; i += LOTE) {
    const tanda = filas.slice(i, i + LOTE);
    await Promise.all(
      tanda.map(async (v) => {
        const c = await cargarCuadraturaVenta(sb, v.id as string);
        if (!c) return;
        const cvOld = round2(Number(v.comision_vendedor ?? 0));
        const cgOld = round2(Number(v.comision_gerencia ?? 0));
        const cvNew = round2(c.comisionVendedor);
        const cgNew = round2(c.comisionGerencia);
        if (Math.abs(cvNew - cvOld) <= 0.01 && Math.abs(cgNew - cgOld) <= 0.01) return;
        const unidad = idUnidad.get(v.unidad_id as string) ?? (v.id as string);
        if (c.valorRealVentaDilesa <= 0) {
          excluidas.push({ id: v.id as string, unidad, valorReal: c.valorRealVentaDilesa });
          return;
        }
        cambios.push({
          id: v.id as string,
          unidad,
          empresaId: v.empresa_id as string,
          cvOld,
          cvNew,
          cgOld,
          cgNew,
          valorReal: c.valorRealVentaDilesa,
        });
      })
    );
    if ((i / LOTE) % 8 === 0) console.log(`  … procesadas ${Math.min(i + LOTE, filas.length)}`);
  }

  const deltaV = round2(cambios.reduce((s, x) => s + (x.cvNew - x.cvOld), 0));
  const deltaG = round2(cambios.reduce((s, x) => s + (x.cgNew - x.cgOld), 0));
  cambios.sort((a, b) => a.cvNew - a.cvOld - (b.cvNew - b.cvOld));

  console.log(`\n=== Backfill comisión base = valor real (ADR-050) ===`);
  console.log(`Ventas que cambian: ${cambios.length}`);
  console.log(`Excluidas (valor real ≤ 0, se dejan intactas): ${excluidas.length}`);
  excluidas.forEach((e) => console.log(`  - ${e.unidad}: valor real ${e.valorReal}`));
  console.log(`Delta comisión vendedor: ${deltaV}`);
  console.log(`Delta comisión gerencia: ${deltaG}`);
  console.log(`Delta total: ${round2(deltaV + deltaG)}`);
  console.log(`\nMuestra (10 mayores bajas):`);
  cambios
    .slice(0, 10)
    .forEach((c) =>
      console.log(
        `  ${c.unidad}: vendedor ${c.cvOld}→${c.cvNew} · gerencia ${c.cgOld}→${c.cgNew} (valor real ${c.valorReal})`
      )
    );

  if (DRY_RUN) {
    console.log(`\n[DRY] No se escribió nada. Corre con DRY_RUN=0 para aplicar.`);
    return;
  }

  console.log(`\nAplicando ${cambios.length} cambios + audit_log…`);
  let aplicadas = 0;
  for (const ch of cambios) {
    const { error: upErr } = await sb
      .schema('dilesa')
      .from('ventas')
      .update({ comision_vendedor: ch.cvNew, comision_gerencia: ch.cgNew })
      .eq('id', ch.id)
      .is('deleted_at', null);
    if (upErr) {
      console.error(`  ✗ ${ch.unidad} (${ch.id}): ${upErr.message}`);
      continue;
    }
    const { error: auditErr } = await sb
      .schema('core')
      .from('audit_log')
      .insert({
        empresa_id: ch.empresaId,
        usuario_id: null,
        accion: 'backfill_comision_valor_real',
        tabla: 'dilesa.ventas',
        registro_id: ch.id,
        datos_anteriores: { comision_vendedor: ch.cvOld, comision_gerencia: ch.cgOld },
        datos_nuevos: {
          comision_vendedor: ch.cvNew,
          comision_gerencia: ch.cgNew,
          valor_real: ch.valorReal,
          motivo: 'ADR-050: base de comisión = valor real venta DILESA',
        },
      });
    if (auditErr) console.error(`  ⚠ audit ${ch.unidad}: ${auditErr.message}`);
    aplicadas += 1;
    if (aplicadas % 50 === 0) console.log(`  … ${aplicadas} aplicadas`);
  }
  console.log(`\nListo. Ventas actualizadas: ${aplicadas} (de ${cambios.length}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
