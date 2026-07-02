#!/usr/bin/env npx tsx
/**
 * Clasifica si una migración SQL toca "superficie financiera" — para el gate D5
 * de la iniciativa `derivados-sin-drift` (Sprint 3, "db push al merge").
 *
 * Regla de Beto (control financiero): nada que mueva dinero o permisos se aplica
 * a prod sin su confirmación explícita. Con el modelo nuevo las migraciones se
 * aplican a prod AL MERGEAR (workflow `db-push-on-merge.yml`), así que el gate
 * vive en el merge. El workflow `financial-migration-guard.yml` usa este
 * clasificador para decidir si el PR puede auto-mergear.
 *
 * DOS NIVELES (recalibración 2026-07-01 — antes todo lo financiero bloqueaba,
 * el volumen de aprobaciones triviales convertía el gate en teatro):
 *
 *   - `notify` — superficie financiera pero SOLO DDL aditivo (CREATE TABLE,
 *     ADD COLUMN, índices, funciones nuevas). Auto-mergea; CC avisa en el chat
 *     con resumen, sin esperar OK. Reversible y no mueve dinero.
 *   - `block`  — lo que sí puede costar dinero o abrir permisos: DML sobre
 *     tablas financieras, backfills de columnas de montos, DROP/TRUNCATE/ALTER
 *     destructivo sobre superficie financiera, redefinición (`CREATE OR
 *     REPLACE`/`DROP`) de RPCs financieras existentes, GRANT/REVOKE fuera del
 *     boilerplate de funciones, RLS deshabilitado o policies mutadas/expuestas
 *     a anon. NO auto-mergea: espera el "dale" de Beto + label `finanzas-ok`.
 *
 * Convención que esto habilita: una función financiera NUEVA se escribe con
 * `CREATE FUNCTION` (sin OR REPLACE) → notify. `CREATE OR REPLACE` sobre una
 * fn financiera se lee como redefinición de algo vivo → block.
 *
 * Los comentarios SQL (de línea `--` y de bloque) se eliminan antes de
 * clasificar: citar una tabla financiera en un comentario no dispara el gate.
 *
 * Uso:  npx tsx scripts/classify-financial-migration.ts <a.sql> [<b.sql> ...]
 *
 * Exit codes (el workflow mapea cualquier código inesperado a block, fail-closed):
 *   0 — ninguna migración toca superficie financiera
 *   2 — superficie financiera aditiva (notify): auto-merge con aviso
 *   3 — al menos una migración de riesgo (block): requiere label `finanzas-ok`
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export type Level = 'none' | 'notify' | 'block';

export interface Finding {
  level: 'notify' | 'block';
  label: string;
}

// Tablas financieras (fuente única para superficie y para targets de DML/DDL).
const FIN_TABLES_SRC = String.raw`(?:erp\.(?:facturas|gastos|cxc_\w+|cxp_\w+|pagos|movimientos_bancarios|ordenes_compra|estados_cuenta|conciliaci\w+|presupuesto\w*)|dilesa\.(?:ventas|estimaciones|obra_estimaciones|contratos\w*))`;

// Nombres de RPCs financieras.
const FIN_FN_SRC = String.raw`fn_\w*(?:pago|factura|cxc|cxp|comision|precio|cuadratura|avaluo|abono|presupuesto)\w*`;

// Columnas/términos de montos (para detectar backfills fuera de las tablas listadas).
const MONEY_COL_SRC = String.raw`(?:monto|importe|precio|saldo|descuento|comisi[oó]n|sobreprecio|enganche|abono|anticipo|finiquito|retenci[oó]n|valor_\w+)`;

interface Pattern {
  re: RegExp;
  label: string;
}

// ── Nivel notify: superficie financiera (sin operación de riesgo) ────────────
const SURFACE_PATTERNS: Pattern[] = [
  { re: new RegExp(String.raw`\b${FIN_TABLES_SRC}`, 'i'), label: 'tabla financiera' },
  {
    re: /\b(comisi[oó]n|finiquito|anticipo|retenci[oó]n|sobreprecio|enganche|pagar[ée]|abono|aval[uú]o)\w*/i,
    label: 'término de dinero',
  },
  { re: /\bpld\b|aviso[_\s]?pld|lavado/i, label: 'PLD / antilavado' },
  { re: new RegExp(String.raw`\b${FIN_FN_SRC}`, 'i'), label: 'RPC financiera fn_*' },
  { re: /SECURITY\s+DEFINER/i, label: 'función SECURITY DEFINER (privilegiada)' },
];

// ── Nivel block: mueve dinero o permisos ─────────────────────────────────────
const BLOCK_PATTERNS: Pattern[] = [
  {
    re: new RegExp(
      String.raw`\b(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO|MERGE\s+INTO)\s+(?:ONLY\s+)?${FIN_TABLES_SRC}`,
      'i'
    ),
    label: 'DML sobre tabla financiera',
  },
  {
    re: new RegExp(String.raw`\bUPDATE\s+[\w."]+\s+SET\b[^;]*\b${MONEY_COL_SRC}\s*=`, 'is'),
    label: 'backfill de columna de montos (UPDATE … SET <monto>)',
  },
  {
    re: new RegExp(
      String.raw`\b(?:DROP\s+TABLE|TRUNCATE(?:\s+TABLE)?)\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${FIN_TABLES_SRC}`,
      'i'
    ),
    label: 'DROP/TRUNCATE de tabla financiera',
  },
  {
    re: new RegExp(
      String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${FIN_TABLES_SRC}[^;]*\b(?:DROP\s+COLUMN|TYPE\s)`,
      'is'
    ),
    label: 'ALTER destructivo sobre tabla financiera (DROP COLUMN / cambio de TYPE)',
  },
  {
    re: new RegExp(
      String.raw`\b(?:CREATE\s+OR\s+REPLACE\s+FUNCTION|DROP\s+FUNCTION)\s+(?:IF\s+EXISTS\s+)?[\w."]*${FIN_FN_SRC}`,
      'i'
    ),
    label: 'redefinición/DROP de RPC financiera existente',
  },
  {
    re: /\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i,
    label: 'RLS deshabilitado',
  },
  {
    re: new RegExp(
      String.raw`\b(?:ALTER|DROP)\s+POLICY\b[^;]*\bON\s+(?:ONLY\s+)?${FIN_TABLES_SRC}`,
      'is'
    ),
    label: 'policy mutada/borrada sobre tabla financiera',
  },
  {
    re: /\bCREATE\s+POLICY\b[^;]*\bTO\b[^;]*\banon\b/is,
    label: 'policy que expone a anon',
  },
  { re: /\bALTER\s+ROLE\b|\bALTER\s+DEFAULT\s+PRIVILEGES\b/i, label: 'permisos de rol/default' },
];

// GRANT/REVOKE que NO cuentan como cambio de permisos riesgoso:
//   - `REVOKE … FROM PUBLIC/anon` (cualquier objeto) — endurecimiento: QUITA
//     acceso, nunca lo abre.
//   - `GRANT EXECUTE ON FUNCTION … TO authenticated/service_role` — boilerplate
//     estándar de RPCs nuevas.
// Se remueven del SQL y cualquier GRANT/REVOKE restante sí bloquea (GRANT a
// anon, GRANT sobre tablas/schemas, REVOKE a roles de la app, etc.).
const GRANT_BOILERPLATE: RegExp[] = [
  /\bREVOKE\b[^;]*\bFROM\s+(?:PUBLIC|anon)(?:\s*,\s*(?:PUBLIC|anon))*\s*;/gis,
  /\bGRANT\s+EXECUTE\s+ON\s+FUNCTION\b[^;]*\bTO\s+(?:authenticated|service_role)(?:\s*,\s*(?:authenticated|service_role))*\s*;/gis,
];

/** Elimina comentarios SQL (de línea y de bloque) para no clasificar prosa. */
export function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

export function classifySql(rawSql: string): Finding[] {
  const sql = stripSqlComments(rawSql);
  const findings: Finding[] = [];

  for (const p of BLOCK_PATTERNS) {
    if (p.re.test(sql)) findings.push({ level: 'block', label: p.label });
  }

  const sinBoilerplate = GRANT_BOILERPLATE.reduce((s, re) => s.replace(re, ' '), sql);
  if (/\b(GRANT|REVOKE)\b/i.test(sinBoilerplate)) {
    findings.push({
      level: 'block',
      label: 'GRANT/REVOKE fuera del boilerplate de funciones (cambia permisos)',
    });
  }

  for (const p of SURFACE_PATTERNS) {
    if (p.re.test(sql)) findings.push({ level: 'notify', label: p.label });
  }

  return findings;
}

export function levelOf(findings: Finding[]): Level {
  if (findings.some((f) => f.level === 'block')) return 'block';
  if (findings.length > 0) return 'notify';
  return 'none';
}

function main(): void {
  const files = process.argv.slice(2).filter((f) => f.endsWith('.sql'));
  let overall: Level = 'none';
  const report: { file: string; level: Level; findings: Finding[] }[] = [];

  for (const f of files) {
    let sql: string;
    try {
      sql = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    const findings = classifySql(sql);
    const level = levelOf(findings);
    if (level !== 'none') report.push({ file: f, level, findings });
    if (level === 'block' || (level === 'notify' && overall === 'none')) overall = level;
  }

  if (overall === 'none') {
    console.log('✓ Ninguna migración nueva toca superficie financiera.');
    process.exit(0);
  }

  for (const { file, level, findings } of report) {
    console.log(`${level === 'block' ? '⛔ BLOCK' : '⚠️  NOTIFY'}  ${file}`);
    for (const fi of findings) console.log(`      · [${fi.level}] ${fi.label}`);
  }

  if (overall === 'block') {
    console.log(
      '\n⛔ Migración financiera de RIESGO: requiere "dale" de Beto + label finanzas-ok.'
    );
    process.exit(3);
  }
  console.log('\n⚠️  Financiera ADITIVA: auto-mergea; CC avisa en el chat con resumen.');
  process.exit(2);
}

// Ejecutar solo cuando se invoca directamente (no al importar desde tests).
const isMainModule = (() => {
  try {
    const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
    return invoked === path.resolve(__filename);
  } catch {
    return false;
  }
})();

if (isMainModule) {
  main();
}
