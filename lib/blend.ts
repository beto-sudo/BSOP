// Blends multi-péptido (caso KLOW) — math puro y client-safe.
//
// Un blend es un vial liofilizado que combina varios péptidos (p. ej. KLOW:
// TB-500 10mg + BPC-157 10mg + KPV 10mg + GHK-Cu 50mg = 80mg/vial). Se dosifica
// POR VOLUMEN (mL/u) y la calculadora deriva los mg entregados de cada
// componente para el volumen jalado.
//
// Sin imports de servidor a propósito: este módulo lo consumen tanto el route
// handler (app/health/actions.ts) como el client component de la bitácora.
// Mantener plano evita arrastrar el árbol server al bundle del cliente
// (ver feedback_use_client_constants_import).

export type BlendComponente = { nombre: string; mg: number };

export type BlendDoseRow = { nombre: string; mg: number; mcg: number };

// Suma de mg de los componentes = total del vial liofilizado.
export function blendTotalMg(componentes: BlendComponente[] | null | undefined): number {
  if (!componentes?.length) return 0;
  return componentes.reduce((sum, c) => sum + (Number.isFinite(c.mg) ? c.mg : 0), 0);
}

// mg entregados de cada componente para el volumen jalado (mL):
//   mg_componente = componente.mg × (mL / aguaBacMl)
// Derivación: fracción del componente en el vial (componente.mg / total) × mg
// totales jalados (concentración × mL = total/aguaBac × mL) se simplifica a
// componente.mg × mL / aguaBac — independiente del total.
export function blendBreakdown(
  componentes: BlendComponente[] | null | undefined,
  aguaBacMl: number,
  ml: number | null
): BlendDoseRow[] {
  if (!componentes?.length || !(aguaBacMl > 0) || ml == null || !(ml > 0)) return [];
  const frac = ml / aguaBacMl;
  return componentes.map((c) => {
    const mg = (Number.isFinite(c.mg) ? c.mg : 0) * frac;
    return { nombre: c.nombre, mg, mcg: mg * 1000 };
  });
}

// Normaliza un valor jsonb arbitrario al tipo BlendComponente[]. Devuelve null
// si no es un blend válido (≥1 componente con nombre y mg > 0). Lo usan tanto la
// lectura (coerción del jsonb de Postgres) como la escritura (saneo del input).
export function parseComponentes(raw: unknown): BlendComponente[] | null {
  if (!Array.isArray(raw)) return null;
  const out: BlendComponente[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const nombre = typeof o.nombre === 'string' ? o.nombre.trim() : '';
    const mg = typeof o.mg === 'number' ? o.mg : Number(o.mg);
    if (nombre && Number.isFinite(mg) && mg > 0) out.push({ nombre, mg });
  }
  return out.length ? out : null;
}
