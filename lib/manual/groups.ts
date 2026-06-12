import type { ManualDoc } from './load';

/**
 * Agrupación de los docs del manual para la portada y el PDF (Sprint 2 de
 * `manual-usuario`). El grupo de un doc es su segmento después de la empresa:
 * `dilesa/ventas/lista` → `ventas`; los top-level (`dilesa/ruv`) son su propio
 * grupo. Los labels y el orden siguen la taxonomía del sidebar de DILESA
 * (`NAV_ITEMS`) para que el manual se navegue igual que la app.
 *
 * Server-safe y puro (sin `fs`): lo consumen la portada, la vista imprimible
 * y el endpoint de búsqueda.
 */

export type ManualGroup = { key: string; label: string };

/**
 * Orden de lectura canónico. `manual` (la portada del propio manual) abre el
 * documento; después el orden del sidebar: Administración → Finanzas → RH →
 * Compras → Inmobiliario.
 */
export const MANUAL_GROUPS: ManualGroup[] = [
  { key: 'manual', label: 'Manual de usuario' },
  { key: 'admin', label: 'Administración' },
  { key: 'cobranza', label: 'Cobranza (CxC)' },
  { key: 'cxp', label: 'Cuentas por pagar (CxP)' },
  { key: 'saldos-bancos', label: 'Tesorería — Bancos' },
  { key: 'rh', label: 'Recursos Humanos' },
  { key: 'proveedores', label: 'Proveedores' },
  { key: 'compras', label: 'Compras' },
  { key: 'portafolio', label: 'Portafolio' },
  { key: 'proyectos', label: 'Proyectos' },
  { key: 'ventas', label: 'Ventas' },
  { key: 'construccion', label: 'Construcción' },
  { key: 'ruv', label: 'RUV' },
];

const GROUP_ORDER = new Map(MANUAL_GROUPS.map((g, i) => [g.key, i]));
const GROUP_LABEL = new Map(MANUAL_GROUPS.map((g) => [g.key, g.label]));

/** `['dilesa','ventas','lista']` → `ventas`; `['dilesa','ruv']` → `ruv`. */
export function manualGroupKey(slug: string[]): string {
  return slug.length > 2 ? slug[1] : (slug[1] ?? slug[0]);
}

/** Label humano del grupo. Grupos no registrados caen al key capitalizado. */
export function manualGroupLabel(key: string): string {
  return GROUP_LABEL.get(key) ?? key.charAt(0).toUpperCase() + key.slice(1);
}

export function isRegisteredManualGroup(key: string): boolean {
  return GROUP_LABEL.has(key);
}

/**
 * Orden de lectura dentro de un grupo: el doc principal (`lista`, o el que se
 * llama igual que el grupo) primero; el resto alfabético — las capturas por
 * fase (`fase01…fase17`) quedan en secuencia por el zero-padding.
 */
function docWeight(doc: ManualDoc): number {
  const name = doc.slug[doc.slug.length - 1];
  if (name === 'lista' || name === manualGroupKey(doc.slug)) return 0;
  return 1;
}

/** Orden de lectura global: grupo (orden curado) y, dentro, `docWeight`. */
export function sortDocsForReading(docs: ManualDoc[]): ManualDoc[] {
  return [...docs].sort((a, b) => {
    const ga = GROUP_ORDER.get(manualGroupKey(a.slug)) ?? MANUAL_GROUPS.length;
    const gb = GROUP_ORDER.get(manualGroupKey(b.slug)) ?? MANUAL_GROUPS.length;
    if (ga !== gb) return ga - gb;
    const wa = docWeight(a);
    const wb = docWeight(b);
    if (wa !== wb) return wa - wb;
    return a.slug.join('/').localeCompare(b.slug.join('/'));
  });
}

export type ManualGroupedDocs = ManualGroup & { docs: ManualDoc[] };

/** Agrupa (ya ordenados para lectura) por grupo, para la portada y el PDF. */
export function groupManualDocs(docs: ManualDoc[]): ManualGroupedDocs[] {
  const out: ManualGroupedDocs[] = [];
  const byKey = new Map<string, ManualGroupedDocs>();
  for (const doc of sortDocsForReading(docs)) {
    const key = manualGroupKey(doc.slug);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: manualGroupLabel(key), docs: [] };
      byKey.set(key, group);
      out.push(group);
    }
    group.docs.push(doc);
  }
  return out;
}
