/**
 * Catálogo de tipos de junta — fuente única para lista y detalle
 * (components/juntas/admin-juntas-list-module.tsx y junta-detail-module.tsx).
 *
 * El catálogo se filtra por empresa: los tipos de obra/desarrollo
 * (Construcción, Maquinaria, Proyectos, …) no aplican al club deportivo y
 * "Rincón del Bosque" no aplica a DILESA. Sin el filtro, las juntas se daban
 * de alta en la empresa equivocada (caso 2026-07-02: junta semanal de RDB
 * capturada bajo DILESA).
 */

export type JuntaEmpresaSlug = 'rdb' | 'dilesa';

export type TipoOption = { value: string; label: string; icon: string };

export const TIPO_OPTIONS: TipoOption[] = [
  { value: 'Comité Ejecutivo', label: 'Comité Ejecutivo', icon: '👔' },
  { value: 'Consejo', label: 'Consejo', icon: '🏢' },
  { value: 'Ventas', label: 'Ventas', icon: '💰' },
  { value: 'Atención PosVenta', label: 'Atención PosVenta', icon: '🔧' },
  { value: 'Administración', label: 'Administración', icon: '📁' },
  { value: 'Mercadotecnia', label: 'Mercadotecnia', icon: '📣' },
  { value: 'Construcción', label: 'Construcción', icon: '🏗️' },
  { value: 'Compras y Admon. Inventario', label: 'Compras y Admon. Inv.', icon: '📦' },
  { value: 'Maquinaria', label: 'Maquinaria', icon: '🚜' },
  { value: 'Proyectos', label: 'Proyectos', icon: '🗂️' },
  { value: 'Rincón del Bosque', label: 'Rincón del Bosque', icon: '🌲' },
  { value: 'Extraordinaria', label: 'Extraordinaria', icon: '🚨' },
  { value: 'Otro', label: 'Otro', icon: '📌' },
];

/** Tipos que NO aplican a cada empresa (se ocultan de dropdowns y filtros). */
const TIPOS_EXCLUIDOS: Record<JuntaEmpresaSlug, string[]> = {
  dilesa: ['Rincón del Bosque'],
  rdb: ['Atención PosVenta', 'Construcción', 'Maquinaria', 'Proyectos'],
};

/**
 * Tipos disponibles para una empresa. Si `currentTipo` viene y no está en el
 * catálogo filtrado (junta legacy o capturada antes del filtro), se agrega al
 * final para que el dropdown de edición pueda mostrar el valor vigente.
 */
export function tipoOptionsForEmpresa(
  empresaSlug: JuntaEmpresaSlug,
  currentTipo?: string | null
): TipoOption[] {
  const excluidos = TIPOS_EXCLUIDOS[empresaSlug];
  const options = TIPO_OPTIONS.filter((t) => !excluidos.includes(t.value));
  if (currentTipo && !options.some((t) => t.value === currentTipo)) {
    const cfg = TIPO_CONFIG[currentTipo];
    options.push({
      value: currentTipo,
      label: cfg?.label ?? currentTipo,
      icon: cfg?.icon ?? '📌',
    });
  }
  return options;
}

/** Lookup para render de badges/labels — incluye alias legacy del import de Coda. */
export const TIPO_CONFIG: Record<string, { label: string; icon: string }> = Object.fromEntries([
  ...TIPO_OPTIONS.map((t) => [t.value, { label: t.label, icon: t.icon }]),
  // Legacy aliases from Coda import (DILESA migración).
  ['Comite Ejecutivo', { label: 'Comité Ejecutivo', icon: '👔' }],
  ['Junta Operativa', { label: 'Comité Ejecutivo', icon: '👔' }],
  ['Junta de Área', { label: 'Junta de Área', icon: '📋' }],
  ['operativa', { label: 'Operativa', icon: '⚙️' }],
  ['directiva', { label: 'Directiva', icon: '🏛️' }],
  ['seguimiento', { label: 'Seguimiento', icon: '📊' }],
  ['emergencia', { label: 'Emergencia', icon: '🚨' }],
]);
