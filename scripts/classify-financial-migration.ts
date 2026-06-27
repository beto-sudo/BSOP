#!/usr/bin/env npx tsx
/**
 * Clasifica si una migración SQL toca "superficie financiera" — para el gate D5
 * de la iniciativa `derivados-sin-drift` (Sprint 3, "db push al merge").
 *
 * Regla de Beto (control financiero): nada que mueva dinero o permisos se aplica
 * a prod sin su confirmación explícita. Con el modelo nuevo las migraciones se
 * aplican a prod AL MERGEAR (workflow `db-push-on-merge.yml`), así que el gate
 * vive en el merge: las migraciones financieras NO llevan auto-merge — las
 * revisa y mergea Dirección a mano (el merge ES la confirmación). El workflow
 * `financial-migration-guard.yml` usa este clasificador para bloquear el
 * auto-merge de PRs con migraciones financieras hasta que Dirección apruebe.
 *
 * Uso:  npx tsx scripts/classify-financial-migration.ts <a.sql> [<b.sql> ...]
 *
 * Imprime los archivos financieros (con el patrón que los marcó) y sale con
 * código 1 si AL MENOS uno es financiero; 0 si ninguno. La heurística es
 * DELIBERADAMENTE amplia: preferimos falsos positivos (Dirección revisa de más)
 * a falsos negativos (una migración financiera auto-aplicada a prod sin gate).
 */
import { readFileSync } from 'node:fs';

interface Pattern {
  re: RegExp;
  label: string;
}

const PATTERNS: Pattern[] = [
  { re: /\bGRANT\b|\bREVOKE\b/i, label: 'GRANT/REVOKE (cambia permisos)' },
  { re: /SECURITY\s+DEFINER/i, label: 'función SECURITY DEFINER (privilegiada)' },
  {
    re: /\berp\.(facturas|gastos|cxc_\w+|cxp_\w+|pagos|movimientos_bancarios|ordenes_compra|estados_cuenta|conciliaci\w+|presupuesto\w*)/i,
    label: 'tabla financiera de erp.*',
  },
  {
    re: /\bdilesa\.(ventas|estimaciones|obra_estimaciones|contratos\w*)/i,
    label: 'tabla dilesa.* de montos/contratos',
  },
  {
    re: /\b(comisi[oó]n|finiquito|anticipo|retenci[oó]n|sobreprecio|enganche|pagar[ée]|abono|aval[uú]o)\w*/i,
    label: 'término de dinero',
  },
  { re: /\bpld\b|aviso[_\s]?pld|lavado/i, label: 'PLD / antilavado' },
  {
    re: /fn_\w*(pago|factura|cxc|cxp|comision|precio|cuadratura|avaluo|abono|presupuesto)\w*/i,
    label: 'RPC financiera fn_*',
  },
];

function classify(path: string): string[] {
  let sql: string;
  try {
    sql = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  return PATTERNS.filter((p) => p.re.test(sql)).map((p) => p.label);
}

function main(): void {
  const files = process.argv.slice(2).filter((f) => f.endsWith('.sql'));
  const financial: { file: string; reasons: string[] }[] = [];
  for (const f of files) {
    const reasons = classify(f);
    if (reasons.length) financial.push({ file: f, reasons });
  }

  if (financial.length === 0) {
    console.log('✓ Ninguna migración nueva toca superficie financiera.');
    process.exit(0);
  }

  console.log('⚠️  Migración(es) FINANCIERA(s) detectada(s):');
  for (const { file, reasons } of financial) {
    console.log(`  - ${file}`);
    for (const r of reasons) console.log(`      · ${r}`);
  }
  process.exit(1);
}

main();
