'use client';

/**
 * TasksFiltersBar — presentational filters bar for TasksModule.
 *
 * Renders search + estado + prioridad + asignado filters (and depto in the
 * rich variant). State is owned by the parent; this component only accepts
 * values + setters and renders the UI.
 *
 * Extracted from tasks-module.tsx to keep that file under the 900 LOC
 * soft-limit. Behavior preserved 1:1.
 */

import { useMemo } from 'react';
import { Search } from 'lucide-react';

import { FilterCombobox } from '@/components/ui/filter-combobox';
import { Input } from '@/components/ui/input';

import {
  ESTADO_CONFIG,
  PRIORIDAD_OPTIONS,
  type ComboboxOption,
  type Empleado,
  type ErpTask,
} from './tasks-shared';

export type TasksFiltersBarProps = {
  variant: 'simple' | 'rich';

  /** Task list — used to derive the set of available departments (rich only). */
  tasks: ErpTask[];

  // Search
  search: string;
  onSearchChange: (value: string) => void;

  // Estado
  filterEstado: string;
  onFilterEstadoChange: (value: string) => void;

  // Prioridad
  filterPrioridad: string;
  onFilterPrioridadChange: (value: string) => void;

  // Asignado
  filterAsignado: string;
  onFilterAsignadoChange: (value: string) => void;

  // Depto (rich only)
  filterDepto: string;
  onFilterDeptoChange: (value: string) => void;

  // Empleados — used for the simple-variant <Select> list and the rich-variant
  // Combobox options.
  empleados: Empleado[];
  empleadoOptions: ComboboxOption[];
};

export function TasksFiltersBar({
  variant,
  tasks,
  search,
  onSearchChange,
  filterEstado,
  onFilterEstadoChange,
  filterPrioridad,
  onFilterPrioridadChange,
  filterAsignado,
  onFilterAsignadoChange,
  filterDepto,
  onFilterDeptoChange,
  empleados,
  empleadoOptions,
}: TasksFiltersBarProps) {
  const isRich = variant === 'rich';

  const estadoOptions = useMemo<ComboboxOption[]>(
    () => Object.entries(ESTADO_CONFIG).map(([k, v]) => ({ id: k, label: v.label })),
    []
  );
  const prioridadOptions = useMemo<ComboboxOption[]>(
    () => PRIORIDAD_OPTIONS.map((p) => ({ id: p, label: p })),
    []
  );
  const deptoOptions = useMemo<ComboboxOption[]>(() => {
    if (!isRich) return [];
    const deptos = new Set<string>();
    tasks.forEach((t) => {
      if (t.departamento_nombre) {
        t.departamento_nombre.split(',').forEach((d) => {
          const trimmed = d.trim();
          if (trimmed) deptos.add(trimmed);
        });
      }
    });
    return [...deptos].sort().map((d) => ({ id: d, label: d }));
  }, [tasks, isRich]);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-subtle)]" />
          <Input
            placeholder={
              isRich ? 'Buscar por título, descripción o responsable...' : 'Buscar tareas...'
            }
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 rounded-xl border-[var(--border)] bg-[var(--panel)] text-[var(--text)]"
          />
        </div>

        {isRich ? (
          <>
            <FilterCombobox
              value={filterEstado}
              onChange={onFilterEstadoChange}
              options={estadoOptions}
              placeholder="Estado"
              searchPlaceholder="Buscar estado..."
              allowClear
              clearLabel="Todos"
              className="w-40"
            />
            <FilterCombobox
              value={filterPrioridad}
              onChange={onFilterPrioridadChange}
              options={prioridadOptions}
              placeholder="Prioridad"
              searchPlaceholder="Buscar prioridad..."
              allowClear
              clearLabel="Todas"
              className="w-36"
            />
            <FilterCombobox
              value={filterAsignado}
              onChange={onFilterAsignadoChange}
              options={empleadoOptions}
              placeholder="Asignado a"
              searchPlaceholder="Buscar responsable..."
              allowClear
              clearLabel="Todos"
              className="w-48"
            />
            <FilterCombobox
              value={filterDepto}
              onChange={onFilterDeptoChange}
              options={deptoOptions}
              placeholder="Depto"
              searchPlaceholder="Buscar departamento..."
              allowClear
              clearLabel="Todos"
              className="w-44"
            />
          </>
        ) : (
          <>
            <FilterCombobox
              value={filterEstado}
              onChange={onFilterEstadoChange}
              options={Object.entries(ESTADO_CONFIG).map(([k, v]) => ({
                id: k,
                label: v.label,
              }))}
              placeholder="Estado"
              searchPlaceholder="Buscar estado..."
              clearLabel="Todos los estados"
              className="w-40"
            />
            <FilterCombobox
              value={filterPrioridad}
              onChange={onFilterPrioridadChange}
              options={PRIORIDAD_OPTIONS.map((p) => ({ id: p, label: p }))}
              placeholder="Prioridad"
              searchPlaceholder="Buscar prioridad..."
              clearLabel="Todas"
              className="w-36"
            />
            <FilterCombobox
              value={filterAsignado}
              onChange={onFilterAsignadoChange}
              options={empleados.map((e) => ({ id: e.id, label: e.nombre }))}
              placeholder="Asignado a"
              searchPlaceholder="Buscar responsable..."
              clearLabel="Todos"
              className="w-40"
            />
          </>
        )}
      </div>
    </div>
  );
}
