/**
 * Tipos y helpers compartidos del catálogo de cuentas contables (DILESA).
 * Iniciativa `dilesa-catalogo-contable`. Lo consumen la página del catálogo y
 * (Sprint 3) el selector de cuenta en la captura de CxP.
 */
import { type BadgeTone } from '@/components/ui/badge';

export type CuentaTipo =
  | 'activo'
  | 'pasivo'
  | 'capital'
  | 'ingreso'
  | 'costo'
  | 'gasto'
  | 'resultado'
  | 'orden';

export type CuentaNaturaleza = 'deudora' | 'acreedora';

/**
 * Una fila del catálogo tal como vive en erp.cuentas_contables.
 * Es `type` (no `interface`) a propósito: `<DataTable>` exige que la fila sea
 * asignable a `Record<string, unknown>`, cosa que un type-alias cumple y un
 * interface no (no lleva index signature implícita).
 */
export type CuentaRow = {
  id: string;
  numero: string;
  codigo_contpaqi: string | null;
  nombre: string;
  naturaleza: CuentaNaturaleza;
  tipo: CuentaTipo;
  nivel: number;
  cuenta_padre_id: string | null;
  codigo_agrupador_sat: string | null;
  afectable: boolean;
};

export const TIPO_LABEL: Record<CuentaTipo, string> = {
  activo: 'Activo',
  pasivo: 'Pasivo',
  capital: 'Capital',
  ingreso: 'Ingreso',
  costo: 'Costo',
  gasto: 'Gasto',
  resultado: 'Resultado',
  orden: 'Cuentas de orden',
};

/** Orden contable canónico (1 Activo … 8 Orden) para selects y agrupaciones. */
export const TIPO_ORDER: readonly CuentaTipo[] = [
  'activo',
  'pasivo',
  'capital',
  'ingreso',
  'costo',
  'gasto',
  'resultado',
  'orden',
] as const;

/** Tono de badge por tipo mayor (categórico, ADR-017). */
export function tipoTone(tipo: CuentaTipo): BadgeTone {
  switch (tipo) {
    case 'activo':
      return 'info';
    case 'pasivo':
      return 'warning';
    case 'capital':
      return 'accent';
    case 'ingreso':
      return 'success';
    case 'gasto':
      return 'danger';
    case 'costo':
    case 'resultado':
    case 'orden':
      return 'neutral';
  }
}

/** Tono de badge por naturaleza del saldo. */
export function naturalezaTone(n: CuentaNaturaleza): BadgeTone {
  return n === 'deudora' ? 'info' : 'warning';
}

/** Columnas a leer de erp.cuentas_contables (alineado con CuentaRow). */
export const CUENTA_SELECT =
  'id, numero, codigo_contpaqi, nombre, naturaleza, tipo, nivel, cuenta_padre_id, codigo_agrupador_sat, afectable';

// ── Selector de cuenta (Sprint 3) ────────────────────────────────────────────

/** Opción para el `<Combobox>` de cuenta. Solo se ofrecen cuentas afectables. */
export interface CuentaOption {
  value: string;
  label: string;
  searchLabel: string;
  sub: string;
  keywords: string[];
}

export function toCuentaOption(c: CuentaRow): CuentaOption {
  return {
    value: c.id,
    label: `${c.numero} · ${c.nombre}`,
    searchLabel: `${c.numero.replace(/-/g, ' ')} ${c.nombre}`,
    sub: TIPO_LABEL[c.tipo],
    keywords: [c.numero, c.codigo_contpaqi ?? '', c.tipo].filter(Boolean),
  };
}
