'use client';

/**
 * DateRangeFilter — primitive de filtro por rango de fechas (desde / hasta).
 *
 * Iniciativa dilesa-tablas-filtros-columnas · Sprint 1. Reusable cross-empresa
 * aunque hoy solo lo consumen las 6 tablas DILESA (estimaciones, obras,
 * contratos, ventas, proyectos, inventario).
 *
 * Diseño:
 *  - Componente controlado (`value` + `onChange`) para que el padre tenga
 *    libertad de persistir, derivar KPIs reactivos, etc.
 *  - Dos `<input type="date">` nativos — sin Popover ni librería. UI consistente
 *    con los `<select>` h-9 que rodean los filtros existentes.
 *  - Formato canónico `YYYY-MM-DD` (el que devuelve `<input type="date">` y el
 *    mismo que las columnas `date` / `timestamptz::date` en Postgres).
 *  - Defaults vacíos (`null` / `null`) — el primer load NO filtra nada para
 *    no sorprender al operador con menos rows de las que espera.
 *
 * Patrón típico de uso:
 *
 *   const [rango, setRango] = useState<DateRange>({ from: null, to: null });
 *
 *   <DateRangeFilter
 *     label="Fecha cierre"
 *     value={rango}
 *     onChange={setRango}
 *   />
 *
 *   const filtradas = useMemo(
 *     () => rows.filter((r) => isInDateRange(r.fecha_cierre, rango)),
 *     [rows, rango]
 *   );
 */

import { useId } from 'react';
import { X } from 'lucide-react';

export type DateRange = {
  /** `YYYY-MM-DD` o null. */
  from: string | null;
  /** `YYYY-MM-DD` o null. */
  to: string | null;
};

export const EMPTY_DATE_RANGE: Readonly<DateRange> = Object.freeze({ from: null, to: null });

/** Predicado puro para filtrar rows por el rango. Tolerante:
 *  - Si la celda viene null/undefined/"" → no pasa el filtro si HAY rango activo,
 *    y pasa si no hay rango (no filtra).
 *  - Si vienes con ISO timestamp completo, se compara solo la parte de fecha. */
export function isInDateRange(value: string | null | undefined, range: DateRange): boolean {
  // Sin rango activo = no filtra.
  if (!range.from && !range.to) return true;
  if (!value) return false;
  // Tomar solo `YYYY-MM-DD` aunque venga un timestamptz completo.
  const day = value.slice(0, 10);
  if (range.from && day < range.from) return false;
  if (range.to && day > range.to) return false;
  return true;
}

/** Convenience: verdadero si hay al menos un extremo seteado. */
export function isDateRangeActive(range: DateRange): boolean {
  return Boolean(range.from || range.to);
}

const inputCls =
  'h-9 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-sm text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/50';

export function DateRangeFilter({
  label,
  value,
  onChange,
  /** Cuando el filtro principal del módulo lleva 2 rangos (ej. estimaciones
   *  tiene `fecha_cierre` y `pagada_at`), el label diferencia cuál es. */
  ariaPrefix,
}: {
  label: string;
  value: DateRange;
  onChange: (next: DateRange) => void;
  ariaPrefix?: string;
}) {
  const id = useId();
  const fromId = `${id}-from`;
  const toId = `${id}-to`;
  const active = isDateRangeActive(value);
  const prefix = ariaPrefix ?? label;

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-2"
      role="group"
      aria-label={`Filtro ${label}`}
    >
      <span className="text-xs uppercase tracking-wide text-[var(--text)]/50">{label}</span>
      <label htmlFor={fromId} className="sr-only">
        {prefix} — desde
      </label>
      <input
        id={fromId}
        type="date"
        value={value.from ?? ''}
        max={value.to ?? undefined}
        onChange={(e) => onChange({ ...value, from: e.target.value || null })}
        className={inputCls}
      />
      <span aria-hidden="true" className="text-[var(--text)]/40">
        →
      </span>
      <label htmlFor={toId} className="sr-only">
        {prefix} — hasta
      </label>
      <input
        id={toId}
        type="date"
        value={value.to ?? ''}
        min={value.from ?? undefined}
        onChange={(e) => onChange({ ...value, to: e.target.value || null })}
        className={inputCls}
      />
      {active ? (
        <button
          type="button"
          onClick={() => onChange(EMPTY_DATE_RANGE)}
          aria-label={`Limpiar filtro ${label}`}
          className="ml-0.5 flex h-6 w-6 items-center justify-center rounded text-[var(--text)]/40 hover:bg-[var(--accent)]/10 hover:text-[var(--text)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
