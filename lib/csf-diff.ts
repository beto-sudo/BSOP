/**
 * Helpers compartidos para comparar y formatear valores de la
 * Constancia de Situación Fiscal (CSF) del SAT cuando se actualiza una
 * empresa o un proveedor.
 *
 * Estas funciones se duplicaban en `components/proveedores/proveedores-module.tsx`
 * y `app/settings/empresas/_components/empresa-detail.tsx`. Se extrajeron
 * en Sprint 2B de `tech-debt-h1-2026` (ver
 * `docs/planning/tech-debt-h1-2026.md`).
 *
 * El comportamiento es backward-compatible con ambas versiones — la
 * versión unificada de `formatDiffValue` cubre todos los shapes que
 * aparecen en el repo (codigo+nombre, descripcion, y actividad+orden+
 * porcentaje del shape específico de `actividades_economicas`).
 */

/**
 * Compara dos valores tratando null/undefined/'' como equivalentes.
 *
 * - Strings se trimean antes de comparar.
 * - Arrays y objects se comparan via JSON.stringify (orden-sensitivo a
 *   propósito: si el SAT cambia el orden, queremos detectarlo).
 */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) {
    // Trata "" y null como equivalentes (común en datos del SAT).
    if (a === '' && b == null) return true;
    if (b === '' && a == null) return true;
    return false;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a.trim() === b.trim();
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/**
 * Formato canónico para mostrar un valor en la UI de diff CSF.
 *
 * - null/undefined/'' → '—'
 * - Array vacío → '— (vacío)'
 * - Array de objetos: aplica el shape conocido (actividad / codigo+nombre /
 *   descripcion) y junta con newlines.
 * - Resto: `String(v)`.
 */
export function formatDiffValue(v: unknown): string {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) {
    if (v.length === 0) return '— (vacío)';
    return v
      .map((item: unknown) => {
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          // Shape de `actividades_economicas`:
          // { orden, actividad, porcentaje }.
          if ('actividad' in obj) {
            const pct = obj.porcentaje ? ` (${obj.porcentaje})` : '';
            return `${obj.orden ?? '?'}. ${obj.actividad}${pct}`;
          }
          // Shape de catálogos: { codigo, nombre }.
          if ('codigo' in obj && 'nombre' in obj) {
            return `${obj.codigo} · ${obj.nombre}`;
          }
          // Shape genérico de obligaciones: { descripcion }.
          if ('descripcion' in obj) {
            return String(obj.descripcion);
          }
        }
        return String(item);
      })
      .join('\n');
  }
  return String(v);
}
